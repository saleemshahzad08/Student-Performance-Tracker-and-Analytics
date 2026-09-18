"""
Main FastAPI application for Student Tracking, Automated Analytics, and PDF Reporting.
Serves both REST API endpoints and embedded responsive Tailwind CSS / vanilla JS frontend.
"""

import os
import io
from datetime import datetime, date
from typing import List, Optional, Dict, Any

import pandas as pd
import numpy as np
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Query, Response, status
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from models import init_db, get_db, Student, Exam, Mark, Attendance
from analytics import calculate_student_metrics, analyze_student_performance
from pdf_generator import generate_student_pdf_report

# Initialize SQLite tables
init_db()

app = FastAPI(
    title="Student Performance Tracking & Analytics",
    description="Automated academic evaluation, Gemini AI performance diagnostic with offline fallback, and PDF reporting.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# PYDANTIC SCHEMAS
# ==============================================================================

class StudentCreate(BaseModel):
    roll_no: str
    name: str
    email: Optional[str] = None
    section: str


class ExamCreate(BaseModel):
    name: str
    subject: str
    total_marks: float = Field(..., gt=0)
    date: str


class MarkEntry(BaseModel):
    student_id: int
    marks_obtained: float = Field(..., ge=0)


class BatchMarksCreate(BaseModel):
    exam_id: int
    marks: List[MarkEntry]


class AttendanceRecordEntry(BaseModel):
    student_id: int
    is_present: bool


class BatchAttendanceCreate(BaseModel):
    date: str
    records: List[AttendanceRecordEntry]


# ==============================================================================
# REST API ENDPOINTS
# ==============================================================================

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "gemini_api_key_configured": bool(os.environ.get("GEMINI_API_KEY")),
    }


@app.get("/api/sample-csv")
def get_sample_csv():
    sample_text = (
        "roll_no,name,email,section\n"
        "CS-101,Amina Rahman,amina.rahman@example.edu,Section A\n"
        "CS-102,Marcus Vance,marcus.vance@example.edu,Section A\n"
        "CS-103,Sophia Chen,sophia.chen@example.edu,Section A\n"
        "CS-104,Devon Miller,devon.miller@example.edu,Section B\n"
        "CS-105,Elena Rostova,elena.rostova@example.edu,Section B\n"
    )
    return Response(
        content=sample_text,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sample_students.csv"}
    )


@app.post("/api/students/upload")
async def bulk_upload_students(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Accepts .csv or .xlsx file with columns: roll_no, name, email, section.
    Cleans whitespaces, validates uniqueness, and upserts/inserts records into SQLite.
    """
    filename = file.filename.lower()
    if not (filename.endswith(".csv") or filename.endswith(".xlsx")):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Please upload a .csv or .xlsx file."
        )

    content = await file.read()

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse file: {str(e)}"
        )

    # Normalize column names: strip and lowercase
    df.columns = [str(c).strip().lower() for c in df.columns]

    expected_cols = {"roll_no", "name", "section"}
    if not expected_cols.issubset(set(df.columns)):
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns. Expected at minimum: {', '.join(expected_cols)}. Found: {', '.join(df.columns)}"
        )

    # Clean strings and drop empty rows
    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].astype(str).str.strip()

    df = df[df["roll_no"].str.len() > 0]
    df = df[df["name"].str.len() > 0]

    inserted_count = 0
    updated_count = 0
    skipped_count = 0

    # Ensure uniqueness in the uploaded file itself
    df = df.drop_duplicates(subset=["roll_no"], keep="last")

    for _, row in df.iterrows():
        roll_no = str(row["roll_no"]).strip()
        name = str(row["name"]).strip()
        section = str(row.get("section", "General")).strip()
        email_val = row.get("email", None)
        email = str(email_val).strip() if pd.notna(email_val) and str(email_val).strip() != "nan" else None

        existing = db.query(Student).filter(Student.roll_no == roll_no).first()
        if existing:
            # Update existing student
            existing.name = name
            existing.section = section
            existing.email = email
            updated_count += 1
        else:
            new_student = Student(
                roll_no=roll_no,
                name=name,
                email=email,
                section=section,
            )
            db.add(new_student)
            inserted_count += 1

    db.commit()

    return {
        "success": True,
        "message": f"Processed file: {inserted_count} inserted, {updated_count} updated, {skipped_count} skipped.",
        "inserted": inserted_count,
        "updated": updated_count,
        "total_rows": len(df)
    }


@app.get("/api/students")
def list_students(
    search: Optional[str] = None,
    section: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Student)
    if section and section.strip() and section != "All":
        query = query.filter(Student.section == section.strip())
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (Student.name.ilike(term)) | (Student.roll_no.ilike(term))
        )
    
    students = query.order_by(Student.roll_no).all()
    
    # Enrich with quick summary metrics
    results = []
    for s in students:
        s_dict = s.to_dict()
        try:
            m = calculate_student_metrics(db, s.id)
            s_dict["attendance_pct"] = m["attendance_pct"]
            s_dict["exam_avg_pct"] = m["exam_avg_pct"]
            s_dict["trajectory"] = m["trajectory"]
            s_dict["percentile_rank"] = m["percentile_rank"]
        except Exception:
            s_dict["attendance_pct"] = 0.0
            s_dict["exam_avg_pct"] = 0.0
            s_dict["trajectory"] = 0.0
            s_dict["percentile_rank"] = 0.0
        results.append(s_dict)

    return results


@app.post("/api/students")
def create_student(data: StudentCreate, db: Session = Depends(get_db)):
    roll_no = data.roll_no.strip()
    if db.query(Student).filter(Student.roll_no == roll_no).first():
        raise HTTPException(status_code=400, detail=f"Student with roll number '{roll_no}' already exists.")
    
    new_student = Student(
        roll_no=roll_no,
        name=data.name.strip(),
        email=data.email.strip() if data.email else None,
        section=data.section.strip()
    )
    db.add(new_student)
    db.commit()
    db.refresh(new_student)
    return new_student.to_dict()


@app.delete("/api/students/{student_id}")
def delete_student(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    db.delete(student)
    db.commit()
    return {"success": True, "message": f"Student {student.name} ({student.roll_no}) deleted."}


@app.get("/api/sections")
def list_sections(db: Session = Depends(get_db)):
    rows = db.query(Student.section).distinct().all()
    sections = sorted([r[0] for r in rows if r[0]])
    return sections


# ---------------- EXAMS & MARKS ----------------

@app.post("/api/exams")
def create_exam(exam_data: ExamCreate, db: Session = Depends(get_db)):
    new_exam = Exam(
        name=exam_data.name.strip(),
        subject=exam_data.subject.strip(),
        total_marks=float(exam_data.total_marks),
        date=exam_data.date.strip(),
    )
    db.add(new_exam)
    db.commit()
    db.refresh(new_exam)
    return new_exam.to_dict()


@app.get("/api/exams")
def list_exams(db: Session = Depends(get_db)):
    exams = db.query(Exam).order_by(Exam.date.desc(), Exam.id.desc()).all()
    return [e.to_dict() for e in exams]


@app.get("/api/exams/{exam_id}/marks")
def get_exam_marks(
    exam_id: int,
    section: Optional[str] = None,
    db: Session = Depends(get_db)
):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    student_query = db.query(Student)
    if section and section != "All":
        student_query = student_query.filter(Student.section == section)
    students = student_query.order_by(Student.roll_no).all()

    existing_marks = {
        m.student_id: m.marks_obtained
        for m in db.query(Mark).filter(Mark.exam_id == exam_id).all()
    }

    roster = []
    for s in students:
        marks_val = existing_marks.get(s.id, None)
        roster.append({
            "student_id": s.id,
            "roll_no": s.roll_no,
            "name": s.name,
            "section": s.section,
            "marks_obtained": marks_val,
            "total_marks": exam.total_marks,
            "score_pct": round((marks_val / exam.total_marks) * 100, 2) if marks_val is not None and exam.total_marks > 0 else None
        })

    return {
        "exam": exam.to_dict(),
        "roster": roster
    }


@app.post("/api/exams/{exam_id}/marks")
def save_exam_marks(
    exam_id: int,
    payload: BatchMarksCreate,
    db: Session = Depends(get_db)
):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    saved_count = 0
    errors = []

    for entry in payload.marks:
        # Enforce validation: 0 <= marks_obtained <= total_marks
        if entry.marks_obtained < 0 or entry.marks_obtained > exam.total_marks:
            errors.append(
                f"Student ID {entry.student_id}: Marks {entry.marks_obtained} exceeds range [0, {exam.total_marks}]"
            )
            continue

        existing = (
            db.query(Mark)
            .filter(Mark.exam_id == exam_id, Mark.student_id == entry.student_id)
            .first()
        )
        if existing:
            existing.marks_obtained = entry.marks_obtained
        else:
            new_mark = Mark(
                exam_id=exam_id,
                student_id=entry.student_id,
                marks_obtained=entry.marks_obtained
            )
            db.add(new_mark)
        saved_count += 1

    db.commit()

    if errors:
        return {
            "success": False,
            "saved_count": saved_count,
            "errors": errors,
            "message": f"Saved {saved_count} marks with {len(errors)} validation errors."
        }

    return {
        "success": True,
        "saved_count": saved_count,
        "message": f"Successfully updated {saved_count} mark records."
    }


# ---------------- ATTENDANCE TRACKER ----------------

@app.get("/api/attendance")
def get_attendance(
    target_date: str = Query(..., alias="date"),
    section: Optional[str] = None,
    db: Session = Depends(get_db)
):
    student_query = db.query(Student)
    if section and section != "All":
        student_query = student_query.filter(Student.section == section)
    students = student_query.order_by(Student.roll_no).all()

    # Fetch existing attendance on that date
    records = {
        a.student_id: a.is_present
        for a in db.query(Attendance).filter(Attendance.date == target_date).all()
    }

    roster = []
    for s in students:
        # Default to "Present" (True) if no existing record
        status_val = records.get(s.id, True)
        roster.append({
            "student_id": s.id,
            "roll_no": s.roll_no,
            "name": s.name,
            "section": s.section,
            "is_present": status_val,
        })

    return {
        "date": target_date,
        "section": section or "All",
        "roster": roster
    }


@app.post("/api/attendance")
def save_attendance(
    payload: BatchAttendanceCreate,
    db: Session = Depends(get_db)
):
    saved_count = 0
    target_date = payload.date.strip()

    for item in payload.records:
        record = (
            db.query(Attendance)
            .filter(Attendance.student_id == item.student_id, Attendance.date == target_date)
            .first()
        )
        if record:
            record.is_present = item.is_present
        else:
            new_att = Attendance(
                student_id=item.student_id,
                date=target_date,
                is_present=item.is_present
            )
            db.add(new_att)
        saved_count += 1

    db.commit()
    return {
        "success": True,
        "message": f"Successfully logged attendance for {saved_count} students on {target_date}.",
        "saved_count": saved_count
    }


# ---------------- ANALYTICS & PDF REPORTS ----------------

@app.get("/api/analytics/student/{student_id}")
def get_student_analytics(student_id: int, db: Session = Depends(get_db)):
    try:
        metrics = calculate_student_metrics(db, student_id)
        analysis = analyze_student_performance(metrics)
        return {
            "metrics": metrics,
            "analysis": analysis
        }
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analytics processing failed: {str(e)}")


@app.get("/api/reports/student/{student_id}/pdf")
def download_student_pdf_report(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    metrics = calculate_student_metrics(db, student_id)
    analysis = analyze_student_performance(metrics)

    pdf_buffer = generate_student_pdf_report(metrics, analysis)
    filename = f"report_{student.roll_no}_{datetime.utcnow().strftime('%Y%m%d')}.pdf"

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\"",
            "Cache-Control": "no-cache",
        }
    )


@app.get("/api/stats/overview")
def get_system_overview(db: Session = Depends(get_db)):
    total_students = db.query(Student).count()
    total_exams = db.query(Exam).count()
    total_attendance_logs = db.query(Attendance).count()
    present_attendance_logs = db.query(Attendance).filter(Attendance.is_present == True).count()
    
    overall_att_pct = (
        round((present_attendance_logs / total_attendance_logs) * 100, 1)
        if total_attendance_logs > 0 else 100.0
    )

    # Compute overall grade distribution
    all_marks = (
        db.query(Mark.marks_obtained, Exam.total_marks)
        .join(Exam, Mark.exam_id == Exam.id)
        .all()
    )
    if all_marks:
        scores = [(m[0] / m[1]) * 100 for m in all_marks if m[1] > 0]
        avg_score = round(float(np.mean(scores)), 1)
    else:
        avg_score = 0.0

    return {
        "total_students": total_students,
        "total_exams": total_exams,
        "total_attendance_logs": total_attendance_logs,
        "overall_attendance_pct": overall_att_pct,
        "overall_exam_avg": avg_score
    }


# ==============================================================================
# EMBEDDED SINGLE-PAGE FRONTEND (HTML + Tailwind CSS + Vanilla JS)
# ==============================================================================

FRONTEND_HTML = """<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-50">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Student Performance Tracker & Analytics</title>
  <meta name="description" content="FastAPI student tracking with automated performance analytics and PDF reporting.">
  <!-- Tailwind CSS via CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#f0f9ff',
              100: '#e0f2fe',
              500: '#0284c7',
              600: '#0369a1',
              700: '#075985',
              900: '#0c4a6e',
            }
          }
        }
      }
    }
  </script>
  <style>
    /* Clean custom scrollbars */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #f1f5f9; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
  </style>
</head>
<body class="h-full flex flex-col font-sans text-slate-800 antialiased selection:bg-brand-500 selection:text-white">

  <!-- Toast Container -->
  <div id="toast-container" class="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none"></div>

  <!-- Header -->
  <header class="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <!-- Logo / Brand -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-gradient-to-tr from-brand-700 to-sky-500 flex items-center justify-center text-white shadow-sm">
            <i data-lucide="graduation-cap" class="w-6 h-6"></i>
          </div>
          <div>
            <h1 class="text-lg font-bold text-slate-900 tracking-tight leading-tight">Student Tracker & Analytics</h1>
            <p class="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
              <span>FastAPI Backend</span>
              <span>•</span>
              <span class="inline-flex items-center gap-1 text-emerald-600">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Gemini AI & Fallback Active
              </span>
            </p>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <nav class="hidden md:flex space-x-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80 text-sm font-medium">
          <button onclick="switchTab('dashboard')" id="nav-dashboard" class="nav-btn px-3.5 py-1.5 rounded-lg transition-all text-slate-600 hover:text-slate-900 flex items-center gap-2">
            <i data-lucide="layout-dashboard" class="w-4 h-4"></i> Overview
          </button>
          <button onclick="switchTab('students')" id="nav-students" class="nav-btn px-3.5 py-1.5 rounded-lg transition-all text-slate-600 hover:text-slate-900 flex items-center gap-2">
            <i data-lucide="users" class="w-4 h-4"></i> Students & Ingestion
          </button>
          <button onclick="switchTab('exams')" id="nav-exams" class="nav-btn px-3.5 py-1.5 rounded-lg transition-all text-slate-600 hover:text-slate-900 flex items-center gap-2">
            <i data-lucide="file-check" class="w-4 h-4"></i> Exam Marks
          </button>
          <button onclick="switchTab('attendance')" id="nav-attendance" class="nav-btn px-3.5 py-1.5 rounded-lg transition-all text-slate-600 hover:text-slate-900 flex items-center gap-2">
            <i data-lucide="calendar-check" class="w-4 h-4"></i> Attendance
          </button>
          <button onclick="switchTab('analytics')" id="nav-analytics" class="nav-btn px-3.5 py-1.5 rounded-lg transition-all text-slate-600 hover:text-slate-900 flex items-center gap-2">
            <i data-lucide="sparkles" class="w-4 h-4"></i> AI Reports
          </button>
        </nav>

        <!-- Quick Action / Seed -->
        <div class="flex items-center gap-2">
          <button onclick="downloadSampleCsv()" title="Download Sample CSV for Ingestion" class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            Sample CSV
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Mobile Tab Bar -->
  <div class="md:hidden bg-white border-b border-slate-200 px-2 py-2 flex justify-around text-xs font-medium overflow-x-auto">
    <button onclick="switchTab('dashboard')" class="px-2.5 py-1.5 rounded-md hover:bg-slate-100 flex flex-col items-center">
      <i data-lucide="layout-dashboard" class="w-4 h-4 mb-0.5"></i> Overview
    </button>
    <button onclick="switchTab('students')" class="px-2.5 py-1.5 rounded-md hover:bg-slate-100 flex flex-col items-center">
      <i data-lucide="users" class="w-4 h-4 mb-0.5"></i> Students
    </button>
    <button onclick="switchTab('exams')" class="px-2.5 py-1.5 rounded-md hover:bg-slate-100 flex flex-col items-center">
      <i data-lucide="file-check" class="w-4 h-4 mb-0.5"></i> Exams
    </button>
    <button onclick="switchTab('attendance')" class="px-2.5 py-1.5 rounded-md hover:bg-slate-100 flex flex-col items-center">
      <i data-lucide="calendar-check" class="w-4 h-4 mb-0.5"></i> Attendance
    </button>
    <button onclick="switchTab('analytics')" class="px-2.5 py-1.5 rounded-md hover:bg-slate-100 flex flex-col items-center">
      <i data-lucide="sparkles" class="w-4 h-4 mb-0.5"></i> Reports
    </button>
  </div>

  <!-- Main Content Viewport -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

    <!-- ===================================================================== -->
    <!-- TAB 1: DASHBOARD OVERVIEW -->
    <!-- ===================================================================== -->
    <div id="tab-dashboard" class="tab-content space-y-6">
      <!-- Welcome Banner -->
      <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 text-white rounded-2xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div class="relative z-10 max-w-2xl">
          <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-200 border border-sky-400/20 mb-3">
            <i data-lucide="activity" class="w-3.5 h-3.5"></i> Performance Intelligence
          </span>
          <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">Academic Tracking & Automated Analytics</h2>
          <p class="mt-2 text-sm text-slate-300 leading-relaxed">
            Monitor cohorts with automated Pandas metrics, enter exam scores with range constraints, log daily roll calls, and generate executive PDF dossiers powered by Google Gemini AI with offline rule-based heuristics.
          </p>
          <div class="mt-5 flex flex-wrap gap-3">
            <button onclick="switchTab('students')" class="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs px-4 py-2.5 rounded-xl transition shadow-xs">
              <i data-lucide="upload" class="w-4 h-4"></i> Ingest Students (.csv / .xlsx)
            </button>
            <button onclick="switchTab('exams')" class="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs px-4 py-2.5 rounded-xl border border-white/15 transition">
              <i data-lucide="plus-circle" class="w-4 h-4"></i> Record Exam Marks
            </button>
          </div>
        </div>
      </div>

      <!-- Stat KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Students -->
        <div class="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-slate-500">Enrolled Students</p>
            <h3 id="stat-total-students" class="text-2xl font-bold text-slate-900 mt-1">0</h3>
            <p class="text-xs text-slate-400 mt-1">Across all cohorts</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <i data-lucide="users" class="w-6 h-6"></i>
          </div>
        </div>

        <!-- Exams -->
        <div class="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-slate-500">Exams Conducted</p>
            <h3 id="stat-total-exams" class="text-2xl font-bold text-slate-900 mt-1">0</h3>
            <p class="text-xs text-slate-400 mt-1">Assessment evaluations</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <i data-lucide="file-check" class="w-6 h-6"></i>
          </div>
        </div>

        <!-- Overall Attendance -->
        <div class="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-slate-500">Overall Attendance</p>
            <h3 id="stat-overall-att" class="text-2xl font-bold text-slate-900 mt-1">--%</h3>
            <p class="text-xs text-emerald-600 font-medium mt-1" id="stat-att-sub">Logged sessions</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <i data-lucide="calendar-check" class="w-6 h-6"></i>
          </div>
        </div>

        <!-- Exam Average -->
        <div class="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-slate-500">Cohort Exam Average</p>
            <h3 id="stat-overall-exam" class="text-2xl font-bold text-slate-900 mt-1">--%</h3>
            <p class="text-xs text-slate-400 mt-1">Combined benchmarks</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <i data-lucide="trending-up" class="w-6 h-6"></i>
          </div>
        </div>
      </div>

      <!-- Quick Guidance & Heuristic Engine Card -->
      <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
        <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
          <i data-lucide="shield-check" class="w-5 h-5 text-sky-600"></i>
          Performance Diagnostic Architecture & Heuristic Thresholds
        </h3>
        <p class="text-xs text-slate-500 mt-1">
          Every report is grounded in quantitative statistical parameters. If Google Gemini AI is unavailable or offline, the system seamlessly transitions to our deterministic rule-based heuristic engine:
        </p>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 text-xs">
          <div class="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
            <span class="font-bold text-slate-800 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span> Attendance Rate
            </span>
            <p class="text-slate-600 mt-1.5">
              <strong>&ge; 85%:</strong> Key Strength<br/>
              <strong>&lt; 75%:</strong> Critical Risk & Mandatory Advisory Action Item
            </p>
          </div>

          <div class="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
            <span class="font-bold text-slate-800 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-blue-500"></span> Exam Average
            </span>
            <p class="text-slate-600 mt-1.5">
              <strong>&ge; 80%:</strong> High Academic Achievement<br/>
              <strong>&lt; 50%:</strong> Critical Academic Gap Alert
            </p>
          </div>

          <div class="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
            <span class="font-bold text-slate-800 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-indigo-500"></span> Score Trajectory
            </span>
            <p class="text-slate-600 mt-1.5">
              <strong>&gt; +5%:</strong> Positive Improvement Momentum<br/>
              <strong>&lt; -5%:</strong> Declining Score Warning
            </p>
          </div>

          <div class="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
            <span class="font-bold text-slate-800 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-purple-500"></span> Section Percentile
            </span>
            <p class="text-slate-600 mt-1.5">
              <strong>&ge; 75th:</strong> Top Quartile Distinction<br/>
              <strong>&lt; 25th:</strong> Bottom Quartile Peer Deficit
            </p>
          </div>
        </div>
      </div>
    </div>


    <!-- ===================================================================== -->
    <!-- TAB 2: STUDENTS & BULK INGESTION -->
    <!-- ===================================================================== -->
    <div id="tab-students" class="tab-content hidden space-y-6">
      
      <!-- Top Ingestion Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <!-- File Ingestion Card -->
        <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
                <i data-lucide="file-up" class="w-5 h-5 text-sky-600"></i>
                Bulk Student Ingestion (.csv / .xlsx)
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">
                Expected columns: <code class="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-mono">roll_no, name, email, section</code>
              </p>
            </div>
            <button onclick="downloadSampleCsv()" class="text-xs text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1">
              <i data-lucide="download" class="w-3.5 h-3.5"></i> Download Template
            </button>
          </div>

          <!-- Drag and Drop Dropzone -->
          <div id="drop-zone" class="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-sky-500 hover:bg-sky-50/40 transition cursor-pointer relative">
            <input type="file" id="file-input" accept=".csv, .xlsx" class="absolute inset-0 opacity-0 cursor-pointer w-full h-full">
            <div class="flex flex-col items-center pointer-events-none">
              <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 mb-2">
                <i data-lucide="cloud-upload" class="w-6 h-6"></i>
              </div>
              <p class="text-sm font-semibold text-slate-800" id="file-chosen-text">
                Click to browse or drag and drop spreadsheet
              </p>
              <p class="text-xs text-slate-400 mt-1">Supports CSV (.csv) and Excel (.xlsx) formats</p>
            </div>
          </div>

          <div class="mt-4 flex items-center justify-between">
            <div id="upload-status-badge" class="text-xs text-slate-500">No file staged yet</div>
            <button id="btn-upload" onclick="uploadStudentFile()" class="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
              <i data-lucide="upload-cloud" class="w-4 h-4"></i> Process & Upsert
            </button>
          </div>
        </div>

        <!-- Add Single Student Card -->
        <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between">
          <div>
            <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <i data-lucide="user-plus" class="w-5 h-5 text-emerald-600"></i>
              Add Student Manually
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">Quick entry for individual student</p>

            <form id="single-student-form" onsubmit="handleSingleStudentSubmit(event)" class="mt-4 space-y-3">
              <div>
                <label class="block text-xs font-semibold text-slate-700">Roll Number *</label>
                <input type="text" id="add-roll-no" required placeholder="e.g. CS-106" class="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 outline-none">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700">Full Name *</label>
                <input type="text" id="add-name" required placeholder="e.g. Maya Lin" class="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 outline-none">
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-xs font-semibold text-slate-700">Section *</label>
                  <input type="text" id="add-section" required placeholder="Section A" class="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 outline-none">
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-700">Email</label>
                  <input type="email" id="add-email" placeholder="student@example.edu" class="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 outline-none">
                </div>
              </div>
              <button type="submit" class="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-2 rounded-lg transition shadow-2xs flex items-center justify-center gap-2">
                <i data-lucide="check" class="w-4 h-4"></i> Save Student
              </button>
            </form>
          </div>
        </div>

      </div>

      <!-- Student Directory Table -->
      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div class="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 class="text-base font-bold text-slate-900">Student Directory & Metrics</h3>
            <p class="text-xs text-slate-500">Live roster with calculated metrics</p>
          </div>

          <div class="flex items-center gap-2 w-full sm:w-auto">
            <!-- Section Filter -->
            <select id="students-section-filter" onchange="loadStudents()" class="text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500">
              <option value="All">All Sections</option>
            </select>
            <!-- Search Box -->
            <div class="relative flex-1 sm:w-64">
              <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-2.5"></i>
              <input type="text" id="students-search-input" oninput="filterStudentsTableLocal()" placeholder="Search name or roll #..." class="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500">
            </div>
          </div>
        </div>

        <!-- Table -->
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th class="py-3 px-4">Roll No</th>
                <th class="py-3 px-4">Name</th>
                <th class="py-3 px-4">Section</th>
                <th class="py-3 px-4">Attendance</th>
                <th class="py-3 px-4">Exam Avg</th>
                <th class="py-3 px-4">Percentile</th>
                <th class="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody id="students-table-body" class="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td colspan="7" class="py-8 text-center text-slate-400">Loading student roster...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>


    <!-- ===================================================================== -->
    <!-- TAB 3: EXAM MARKS ENTRY -->
    <!-- ===================================================================== -->
    <div id="tab-exams" class="tab-content hidden space-y-6">
      
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Create Exam Card -->
        <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
          <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
            <i data-lucide="plus-circle" class="w-5 h-5 text-sky-600"></i>
            Create New Assessment
          </h3>
          <p class="text-xs text-slate-500 mt-0.5">Configure exam parameters & total marks</p>

          <form id="create-exam-form" onsubmit="handleCreateExam(event)" class="mt-4 space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700">Exam Title *</label>
              <input type="text" id="exam-name" required placeholder="e.g. Midterm Examination" class="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700">Subject *</label>
              <input type="text" id="exam-subject" required placeholder="e.g. Data Structures & Algorithms" class="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 outline-none">
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-semibold text-slate-700">Total Marks *</label>
                <input type="number" id="exam-total" required min="1" step="0.5" value="100" class="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 outline-none">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700">Exam Date *</label>
                <input type="date" id="exam-date" required class="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 outline-none">
              </div>
            </div>
            <button type="submit" class="w-full mt-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2.5 rounded-lg transition shadow-2xs flex items-center justify-center gap-2">
              <i data-lucide="plus" class="w-4 h-4"></i> Create Assessment
            </button>
          </form>
        </div>

        <!-- Marks Entry Grid Container -->
        <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between">
          <div>
            <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
                  <i data-lucide="edit-3" class="w-5 h-5 text-emerald-600"></i>
                  Score Entry Grid
                </h3>
                <p class="text-xs text-slate-500 mt-0.5">Enforces range check: 0 &le; Score &le; Total Marks</p>
              </div>

              <!-- Selector Controls -->
              <div class="flex flex-wrap items-center gap-2">
                <select id="marks-exam-select" onchange="loadExamMarksRoster()" class="text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg outline-none font-medium">
                  <option value="">-- Select Exam --</option>
                </select>
                <select id="marks-section-select" onchange="loadExamMarksRoster()" class="text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg outline-none font-medium">
                  <option value="All">All Sections</option>
                </select>
              </div>
            </div>

            <!-- Active Exam Banner -->
            <div id="active-exam-banner" class="hidden my-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex justify-between items-center">
              <div>
                <span class="font-bold text-blue-950" id="banner-exam-title">Midterm Exam</span>
                <span class="text-blue-700 ml-2" id="banner-exam-subject">(Computer Science)</span>
              </div>
              <span class="bg-blue-200 text-blue-900 font-bold px-2 py-0.5 rounded text-[11px]" id="banner-exam-total">
                Max Marks: 100
              </span>
            </div>

            <!-- Grid Table -->
            <div class="mt-3 overflow-x-auto max-h-96 overflow-y-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px]">
                  <tr>
                    <th class="py-2.5 px-3">Roll No</th>
                    <th class="py-2.5 px-3">Student Name</th>
                    <th class="py-2.5 px-3">Section</th>
                    <th class="py-2.5 px-3 w-36">Score Obtained</th>
                    <th class="py-2.5 px-3">Score %</th>
                  </tr>
                </thead>
                <tbody id="marks-grid-body" class="divide-y divide-slate-100 text-slate-700">
                  <tr>
                    <td colspan="5" class="py-8 text-center text-slate-400">Select an assessment from the dropdown to enter scores.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
            <div id="marks-validation-summary" class="text-xs text-slate-500">All fields verified.</div>
            <button id="btn-save-marks" onclick="saveAllMarks()" class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-5 py-2.5 rounded-lg transition shadow-2xs disabled:opacity-50">
              <i data-lucide="save" class="w-4 h-4"></i> Save All Marks
            </button>
          </div>
        </div>
      </div>

    </div>


    <!-- ===================================================================== -->
    <!-- TAB 4: DAILY ATTENDANCE TRACKER -->
    <!-- ===================================================================== -->
    <div id="tab-attendance" class="tab-content hidden space-y-6">
      <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
        
        <!-- Controls Bar -->
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-5">
          <div>
            <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <i data-lucide="calendar-check" class="w-5 h-5 text-sky-600"></i>
              Daily Attendance Roster
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">Records are strictly constrained per student and date</p>
          </div>

          <div class="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div>
              <label class="block text-[11px] font-semibold text-slate-500 uppercase">Session Date</label>
              <input type="date" id="att-date-picker" onchange="loadAttendanceRoster()" class="text-xs px-3 py-1.5 border border-slate-300 rounded-lg outline-none font-medium">
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-500 uppercase">Section</label>
              <select id="att-section-select" onchange="loadAttendanceRoster()" class="text-xs px-3 py-1.5 border border-slate-300 rounded-lg outline-none font-medium bg-slate-50">
                <option value="All">All Sections</option>
              </select>
            </div>

            <div class="flex items-end gap-1.5 pt-4">
              <button onclick="markAllAttendance(true)" class="text-xs font-semibold px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition flex items-center gap-1">
                <i data-lucide="check-check" class="w-3.5 h-3.5"></i> Mark All Present
              </button>
              <button onclick="markAllAttendance(false)" class="text-xs font-semibold px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-lg transition flex items-center gap-1">
                <i data-lucide="x-circle" class="w-3.5 h-3.5"></i> Mark All Absent
              </button>
            </div>
          </div>
        </div>

        <!-- Attendance Roster Table -->
        <div class="mt-4 overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px]">
              <tr>
                <th class="py-3 px-4">Roll No</th>
                <th class="py-3 px-4">Student Name</th>
                <th class="py-3 px-4">Section</th>
                <th class="py-3 px-4 text-center w-36">Status</th>
              </tr>
            </thead>
            <tbody id="att-roster-body" class="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td colspan="4" class="py-8 text-center text-slate-400">Loading student attendance roster...</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Save Button -->
        <div class="mt-5 pt-4 border-t border-slate-100 flex justify-between items-center">
          <div id="att-summary-text" class="text-xs text-slate-500">All students loaded.</div>
          <button id="btn-save-att" onclick="saveAttendanceRoster()" class="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-6 py-2.5 rounded-lg transition shadow-2xs">
            <i data-lucide="save" class="w-4 h-4"></i> Save Attendance Records
          </button>
        </div>

      </div>
    </div>


    <!-- ===================================================================== -->
    <!-- TAB 5: AI PERFORMANCE ANALYTICS & PDF REPORTING -->
    <!-- ===================================================================== -->
    <div id="tab-analytics" class="tab-content hidden space-y-6">
      
      <!-- Student Selector Bar -->
      <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div class="flex items-center gap-3 w-full sm:w-auto">
          <div class="w-9 h-9 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
            <i data-lucide="user-check" class="w-5 h-5"></i>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-900">Select Target Student</label>
            <p class="text-[11px] text-slate-500">Choose student to run analytics & generate PDF</p>
          </div>
        </div>

        <div class="flex items-center gap-2 w-full sm:w-auto">
          <select id="analytics-student-select" onchange="loadStudentAnalytics()" class="text-xs px-4 py-2 border border-slate-300 rounded-lg outline-none font-semibold text-slate-800 bg-slate-50 min-w-[260px]">
            <option value="">-- Choose Student --</option>
          </select>
          <button id="btn-refresh-analytics" onclick="loadStudentAnalytics()" class="text-xs font-semibold px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition flex items-center gap-1.5">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Refresh
          </button>
        </div>
      </div>

      <!-- Main Analytics Container (Hidden when no student selected) -->
      <div id="analytics-details-wrapper" class="hidden space-y-6">
        
        <!-- Top Identity & Actions Banner -->
        <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div class="flex items-center gap-2">
              <h2 id="view-student-name" class="text-xl font-bold text-slate-900">Student Name</h2>
              <span id="view-student-roll" class="px-2 py-0.5 rounded bg-slate-100 font-mono text-xs text-slate-700 font-semibold">CS-101</span>
              <span id="view-student-section" class="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-xs font-semibold">Section A</span>
            </div>
            <p id="view-student-email" class="text-xs text-slate-500 mt-1">student@example.edu</p>
          </div>

          <button id="btn-download-pdf" onclick="downloadSelectedStudentPdf()" class="inline-flex items-center gap-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition">
            <i data-lucide="file-down" class="w-4 h-4"></i> Download Beautiful PDF Report
          </button>
        </div>

        <!-- 4 Key Calculated Metric Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Attendance -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Attendance Rate</p>
            <div class="flex items-baseline gap-2 mt-2">
              <h3 id="metric-att-pct" class="text-3xl font-extrabold text-slate-900">0.0%</h3>
            </div>
            <p id="metric-att-sessions" class="text-xs text-slate-500 mt-1">0 / 0 Sessions Present</p>
          </div>

          <!-- Exam Average -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Exam Average</p>
            <div class="flex items-baseline gap-2 mt-2">
              <h3 id="metric-exam-avg" class="text-3xl font-extrabold text-slate-900">0.0%</h3>
            </div>
            <p id="metric-exam-count" class="text-xs text-slate-500 mt-1">0 Exams Evaluated</p>
          </div>

          <!-- Percentile -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cohort Percentile</p>
            <div class="flex items-baseline gap-2 mt-2">
              <h3 id="metric-percentile" class="text-3xl font-extrabold text-slate-900">0.0th</h3>
            </div>
            <p class="text-xs text-slate-500 mt-1">Section Benchmark</p>
          </div>

          <!-- Trajectory -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Score Trajectory</p>
            <div class="flex items-baseline gap-2 mt-2">
              <h3 id="metric-trajectory" class="text-3xl font-extrabold text-slate-900">0.0%</h3>
            </div>
            <p id="metric-trajectory-sub" class="text-xs text-slate-500 mt-1">First vs Latest Exam</p>
          </div>
        </div>

        <!-- Exam History Breakdown Table -->
        <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
          <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
            <i data-lucide="list-ordered" class="w-5 h-5 text-slate-700"></i>
            Recorded Examination Breakdown
          </h3>
          <div class="mt-4 overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px]">
                <tr>
                  <th class="py-2.5 px-3">Exam Name</th>
                  <th class="py-2.5 px-3">Subject</th>
                  <th class="py-2.5 px-3">Date</th>
                  <th class="py-2.5 px-3">Marks Obtained</th>
                  <th class="py-2.5 px-3">Total Marks</th>
                  <th class="py-2.5 px-3">Score %</th>
                </tr>
              </thead>
              <tbody id="exam-breakdown-body" class="divide-y divide-slate-100 text-slate-700">
                <tr>
                  <td colspan="6" class="py-4 text-center text-slate-400">No exam marks available.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- AI Performance Analytics Card -->
        <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-5">
          <!-- Card Header & Badge -->
          <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-100 pb-4">
            <div>
              <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
                <i data-lucide="brain-circuit" class="w-5 h-5 text-indigo-600"></i>
                Performance Diagnostic & Insights
              </h3>
              <p class="text-xs text-slate-500">Automated evaluation generated from quantitative metrics</p>
            </div>
            <div id="ai-source-badge" class="px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 border border-slate-200">
              <span class="w-2 h-2 rounded-full bg-slate-500"></span> Source Engine
            </div>
          </div>

          <!-- Executive Summary -->
          <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 text-sm leading-relaxed">
            <span class="font-bold text-xs uppercase tracking-wider text-slate-500 block mb-1">Executive Summary</span>
            <p id="analysis-summary-text">Generating evaluation...</p>
          </div>

          <!-- Strengths and Risks Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <!-- Key Strengths -->
            <div class="bg-emerald-50/50 rounded-xl border border-emerald-100 p-5">
              <h4 class="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-2 mb-3">
                <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i> Key Observed Strengths
              </h4>
              <ul id="analysis-strengths-list" class="space-y-2 text-xs text-emerald-950">
                <li>Loading strengths...</li>
              </ul>
            </div>

            <!-- Risk Factors -->
            <div class="bg-rose-50/50 rounded-xl border border-rose-100 p-5">
              <h4 class="text-xs font-bold text-rose-900 uppercase tracking-wider flex items-center gap-2 mb-3">
                <i data-lucide="alert-triangle" class="w-4 h-4 text-rose-600"></i> Identified Risk Factors
              </h4>
              <ul id="analysis-risks-list" class="space-y-2 text-xs text-rose-950">
                <li>Loading risk factors...</li>
              </ul>
            </div>
          </div>

          <!-- Actionable Recommendations -->
          <div class="bg-indigo-50/50 rounded-xl border border-indigo-100 p-5">
            <h4 class="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-2 mb-3">
              <i data-lucide="sparkles" class="w-4 h-4 text-indigo-600"></i> Actionable Pedagogical Recommendations
            </h4>
            <ol id="analysis-recs-list" class="space-y-2 text-xs text-indigo-950 list-decimal pl-4">
              <li>Loading recommendations...</li>
            </ol>
          </div>

        </div>

      </div>

    </div>

  </main>

  <!-- ===================================================================== -->
  <!-- FRONTEND LOGIC (VANILLA JS) -->
  <!-- ===================================================================== -->
  <script>
    // State Store
    let allStudents = [];
    let allExams = [];
    let allSections = [];
    let currentSelectedStudentId = null;
    let stagedFile = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', async () => {
      lucide.createIcons();
      setDefaultDates();
      setupDropzone();
      await refreshAllData();
      switchTab('dashboard');
    });

    function setDefaultDates() {
      const today = new Date().toISOString().split('T')[0];
      const attPicker = document.getElementById('att-date-picker');
      if (attPicker) attPicker.value = today;
      const examDatePicker = document.getElementById('exam-date');
      if (examDatePicker) examDatePicker.value = today;
    }

    // Tab Navigation
    function switchTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
      const targetTab = document.getElementById(`tab-${tabId}`);
      if (targetTab) targetTab.classList.remove('hidden');

      // Update Nav buttons styling
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('bg-white', 'text-slate-900', 'shadow-2xs');
        btn.classList.add('text-slate-600');
      });
      const activeNav = document.getElementById(`nav-${tabId}`);
      if (activeNav) {
        activeNav.classList.add('bg-white', 'text-slate-900', 'shadow-2xs');
        activeNav.classList.remove('text-slate-600');
      }

      if (tabId === 'attendance') {
        loadAttendanceRoster();
      } else if (tabId === 'exams') {
        loadExamsList();
      } else if (tabId === 'students') {
        loadStudents();
      } else if (tabId === 'dashboard') {
        loadOverviewStats();
      }

      lucide.createIcons();
    }

    // Toast Feedback
    function showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      
      let bgClass = 'bg-slate-900 text-white';
      let icon = 'info';
      if (type === 'success') {
        bgClass = 'bg-emerald-600 text-white';
        icon = 'check-circle';
      } else if (type === 'error') {
        bgClass = 'bg-rose-600 text-white';
        icon = 'alert-circle';
      }

      toast.className = `pointer-events-auto flex items-center gap-2 text-xs font-semibold px-4 py-3 rounded-xl shadow-lg transition-all transform duration-200 ${bgClass}`;
      toast.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4"></i><span>${message}</span>`;
      container.appendChild(toast);
      lucide.createIcons();

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    // Data Loaders
    async function refreshAllData() {
      await Promise.all([
        loadOverviewStats(),
        loadStudents(),
        loadExamsList(),
        loadSectionsList(),
      ]);
    }

    async function loadOverviewStats() {
      try {
        const res = await fetch('/api/stats/overview');
        const data = await res.json();
        document.getElementById('stat-total-students').textContent = data.total_students;
        document.getElementById('stat-total-exams').textContent = data.total_exams;
        document.getElementById('stat-overall-att').textContent = `${data.overall_attendance_pct}%`;
        document.getElementById('stat-att-sub').textContent = `${data.total_attendance_logs} sessions logged`;
        document.getElementById('stat-overall-exam').textContent = `${data.overall_exam_avg}%`;
      } catch (e) {
        console.error('Failed to load stats:', e);
      }
    }

    async function loadSectionsList() {
      try {
        const res = await fetch('/api/sections');
        allSections = await res.json();
        
        const filterSelect = document.getElementById('students-section-filter');
        const attSelect = document.getElementById('att-section-select');
        const marksSelect = document.getElementById('marks-section-select');

        [filterSelect, attSelect, marksSelect].forEach(sel => {
          if (!sel) return;
          const currentVal = sel.value;
          sel.innerHTML = '<option value="All">All Sections</option>';
          allSections.forEach(sec => {
            const opt = document.createElement('option');
            opt.value = sec;
            opt.textContent = sec;
            sel.appendChild(opt);
          });
          if (currentVal && allSections.includes(currentVal)) {
            sel.value = currentVal;
          }
        });
      } catch (e) {
        console.error('Failed to load sections:', e);
      }
    }

    // Students Directory
    async function loadStudents() {
      const section = document.getElementById('students-section-filter').value;
      const search = document.getElementById('students-search-input').value;
      let url = '/api/students?';
      if (section && section !== 'All') url += `section=${encodeURIComponent(section)}&`;
      if (search) url += `search=${encodeURIComponent(search)}&`;

      try {
        const res = await fetch(url);
        allStudents = await res.json();
        renderStudentsTable(allStudents);
        populateStudentSelectDropdowns();
      } catch (e) {
        showToast('Failed to load student roster', 'error');
      }
    }

    function renderStudentsTable(students) {
      const tbody = document.getElementById('students-table-body');
      if (!students || students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-slate-400">No students found. Use bulk upload or manual entry.</td></tr>';
        return;
      }

      tbody.innerHTML = students.map(s => {
        const attBadge = s.attendance_pct >= 85
          ? `<span class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">${s.attendance_pct}%</span>`
          : (s.attendance_pct < 75
            ? `<span class="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold border border-rose-200">${s.attendance_pct}%</span>`
            : `<span class="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold border border-amber-200">${s.attendance_pct}%</span>`);

        const examBadge = s.exam_avg_pct >= 80
          ? `<span class="text-emerald-600 font-bold">${s.exam_avg_pct}%</span>`
          : (s.exam_avg_pct < 50
            ? `<span class="text-rose-600 font-bold">${s.exam_avg_pct}%</span>`
            : `<span class="text-slate-800 font-medium">${s.exam_avg_pct}%</span>`);

        return `
          <tr class="hover:bg-slate-50/80 transition">
            <td class="py-3 px-4 font-mono font-semibold text-slate-900">${escapeHtml(s.roll_no)}</td>
            <td class="py-3 px-4 font-medium text-slate-900">${escapeHtml(s.name)}</td>
            <td class="py-3 px-4"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">${escapeHtml(s.section)}</span></td>
            <td class="py-3 px-4">${attBadge}</td>
            <td class="py-3 px-4">${examBadge}</td>
            <td class="py-3 px-4 text-slate-600">${s.percentile_rank || 0}th</td>
            <td class="py-3 px-4 text-right">
              <div class="inline-flex items-center gap-1.5">
                <button onclick="viewStudentReport(${s.id})" title="View Performance Analytics" class="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg transition">
                  <i data-lucide="sparkles" class="w-4 h-4"></i>
                </button>
                <button onclick="downloadStudentPdfDirect(${s.id})" title="Download PDF Report" class="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition">
                  <i data-lucide="file-down" class="w-4 h-4"></i>
                </button>
                <button onclick="deleteStudent(${s.id}, '${escapeHtml(s.name)}')" title="Delete Student" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      lucide.createIcons();
    }

    function filterStudentsTableLocal() {
      const q = document.getElementById('students-search-input').value.toLowerCase();
      const filtered = allStudents.filter(s =>
        s.name.toLowerCase().includes(q) || s.roll_no.toLowerCase().includes(q)
      );
      renderStudentsTable(filtered);
    }

    function populateStudentSelectDropdowns() {
      const select = document.getElementById('analytics-student-select');
      if (!select) return;
      const cur = select.value;
      select.innerHTML = '<option value="">-- Choose Student --</option>';
      allStudents.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.roll_no} - ${s.name} (${s.section})`;
        select.appendChild(opt);
      });
      if (cur) select.value = cur;
    }

    // Dropzone & Bulk Ingestion
    function setupDropzone() {
      const dropZone = document.getElementById('drop-zone');
      const fileInput = document.getElementById('file-input');
      const chosenText = document.getElementById('file-chosen-text');

      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          stagedFile = e.target.files[0];
          chosenText.textContent = `Selected: ${stagedFile.name} (${(stagedFile.size / 1024).toFixed(1)} KB)`;
          document.getElementById('upload-status-badge').textContent = 'Ready for ingestion';
        }
      });

      ['dragenter', 'dragover'].forEach(name => {
        dropZone.addEventListener(name, (e) => {
          e.preventDefault();
          dropZone.classList.add('border-sky-500', 'bg-sky-50/50');
        });
      });

      ['dragleave', 'drop'].forEach(name => {
        dropZone.addEventListener(name, (e) => {
          e.preventDefault();
          dropZone.classList.remove('border-sky-500', 'bg-sky-50/50');
        });
      });

      dropZone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files.length > 0) {
          stagedFile = e.dataTransfer.files[0];
          chosenText.textContent = `Selected: ${stagedFile.name} (${(stagedFile.size / 1024).toFixed(1)} KB)`;
          document.getElementById('upload-status-badge').textContent = 'Ready for ingestion';
        }
      });
    }

    async function uploadStudentFile() {
      if (!stagedFile) {
        showToast('Please select a .csv or .xlsx file first', 'error');
        return;
      }

      const btn = document.getElementById('btn-upload');
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Processing...';
      lucide.createIcons();

      const formData = new FormData();
      formData.append('file', stagedFile);

      try {
        const res = await fetch('/api/students/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || 'Ingestion successful!', 'success');
          document.getElementById('file-chosen-text').textContent = 'Click to browse or drag and drop spreadsheet';
          document.getElementById('upload-status-badge').textContent = `Completed: ${data.inserted} inserted, ${data.updated} updated`;
          stagedFile = null;
          await refreshAllData();
        } else {
          showToast(data.detail || 'Ingestion failed', 'error');
        }
      } catch (err) {
        showToast('Network error during file upload', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="upload-cloud" class="w-4 h-4"></i> Process & Upsert';
        lucide.createIcons();
      }
    }

    async function handleSingleStudentSubmit(e) {
      e.preventDefault();
      const roll_no = document.getElementById('add-roll-no').value.trim();
      const name = document.getElementById('add-name').value.trim();
      const section = document.getElementById('add-section').value.trim();
      const email = document.getElementById('add-email').value.trim();

      try {
        const res = await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roll_no, name, section, email: email || null })
        });
        if (res.ok) {
          showToast(`Student ${name} (${roll_no}) saved!`, 'success');
          document.getElementById('single-student-form').reset();
          await refreshAllData();
        } else {
          const err = await res.json();
          showToast(err.detail || 'Failed to create student', 'error');
        }
      } catch (err) {
        showToast('Network error while saving student', 'error');
      }
    }

    async function deleteStudent(studentId, name) {
      if (!confirm(`Are you sure you want to delete ${name}? All associated marks and attendance will be removed.`)) {
        return;
      }
      try {
        const res = await fetch(`/api/students/${studentId}`, { method: 'DELETE' });
        if (res.ok) {
          showToast(`Deleted student ${name}`, 'success');
          await refreshAllData();
        } else {
          showToast('Failed to delete student', 'error');
        }
      } catch (e) {
        showToast('Network error', 'error');
      }
    }

    function downloadSampleCsv() {
      window.location.href = '/api/sample-csv';
    }

    // Exams & Marks Entry
    async function loadExamsList() {
      try {
        const res = await fetch('/api/exams');
        allExams = await res.json();
        const select = document.getElementById('marks-exam-select');
        const currentVal = select.value;
        select.innerHTML = '<option value="">-- Select Assessment --</option>';
        allExams.forEach(ex => {
          const opt = document.createElement('option');
          opt.value = ex.id;
          opt.textContent = `${ex.name} - ${ex.subject} (${ex.date})`;
          select.appendChild(opt);
        });
        if (currentVal && allExams.some(e => e.id == currentVal)) {
          select.value = currentVal;
        } else if (allExams.length > 0 && !currentVal) {
          select.value = allExams[0].id;
        }
        loadExamMarksRoster();
      } catch (e) {
        console.error('Failed to load exams list:', e);
      }
    }

    async function handleCreateExam(e) {
      e.preventDefault();
      const name = document.getElementById('exam-name').value.trim();
      const subject = document.getElementById('exam-subject').value.trim();
      const total_marks = parseFloat(document.getElementById('exam-total').value);
      const date = document.getElementById('exam-date').value;

      try {
        const res = await fetch('/api/exams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, subject, total_marks, date })
        });
        if (res.ok) {
          showToast(`Exam '${name}' created!`, 'success');
          document.getElementById('create-exam-form').reset();
          setDefaultDates();
          await loadExamsList();
        } else {
          showToast('Failed to create exam', 'error');
        }
      } catch (err) {
        showToast('Error creating exam', 'error');
      }
    }

    async function loadExamMarksRoster() {
      const examId = document.getElementById('marks-exam-select').value;
      const section = document.getElementById('marks-section-select').value;
      const banner = document.getElementById('active-exam-banner');
      const tbody = document.getElementById('marks-grid-body');

      if (!examId) {
        banner.classList.add('hidden');
        tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-slate-400">Select an assessment to input scores.</td></tr>';
        return;
      }

      try {
        let url = `/api/exams/${examId}/marks?`;
        if (section && section !== 'All') url += `section=${encodeURIComponent(section)}`;
        const res = await fetch(url);
        const data = await res.json();
        
        banner.classList.remove('hidden');
        document.getElementById('banner-exam-title').textContent = data.exam.name;
        document.getElementById('banner-exam-subject').textContent = `(${data.exam.subject})`;
        document.getElementById('banner-exam-total').textContent = `Max Marks: ${data.exam.total_marks}`;

        const totalMarks = data.exam.total_marks;
        if (!data.roster || data.roster.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-slate-400">No students enrolled in this section.</td></tr>';
          return;
        }

        tbody.innerHTML = data.roster.map(r => {
          const val = r.marks_obtained !== null ? r.marks_obtained : '';
          const pct = r.score_pct !== null ? `${r.score_pct}%` : '--';
          return `
            <tr class="hover:bg-slate-50 transition" data-student-id="${r.student_id}">
              <td class="py-2.5 px-3 font-mono font-semibold text-slate-900">${escapeHtml(r.roll_no)}</td>
              <td class="py-2.5 px-3 font-medium text-slate-900">${escapeHtml(r.name)}</td>
              <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">${escapeHtml(r.section)}</span></td>
              <td class="py-2.5 px-3">
                <input type="number" step="0.5" min="0" max="${totalMarks}" value="${val}"
                  data-student-id="${r.student_id}" data-total="${totalMarks}"
                  oninput="handleMarkInputValidation(this)"
                  placeholder="0 - ${totalMarks}"
                  class="mark-input w-28 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 outline-none">
              </td>
              <td class="py-2.5 px-3 font-bold text-slate-700 score-pct-cell">${pct}</td>
            </tr>
          `;
        }).join('');

      } catch (err) {
        showToast('Failed to load marks roster', 'error');
      }
    }

    function handleMarkInputValidation(inputEl) {
      const val = parseFloat(inputEl.value);
      const max = parseFloat(inputEl.dataset.total);
      const row = inputEl.closest('tr');
      const pctCell = row.querySelector('.score-pct-cell');

      if (isNaN(val)) {
        inputEl.classList.remove('border-rose-500', 'bg-rose-50');
        pctCell.textContent = '--';
        pctCell.className = 'py-2.5 px-3 font-bold text-slate-400 score-pct-cell';
        return;
      }

      if (val < 0 || val > max) {
        inputEl.classList.add('border-rose-500', 'bg-rose-50');
        pctCell.textContent = `Invalid (> ${max})`;
        pctCell.className = 'py-2.5 px-3 font-bold text-rose-600 score-pct-cell';
      } else {
        inputEl.classList.remove('border-rose-500', 'bg-rose-50');
        const pct = ((val / max) * 100).toFixed(1);
        pctCell.textContent = `${pct}%`;
        if (pct >= 80) pctCell.className = 'py-2.5 px-3 font-bold text-emerald-600 score-pct-cell';
        else if (pct < 50) pctCell.className = 'py-2.5 px-3 font-bold text-rose-600 score-pct-cell';
        else pctCell.className = 'py-2.5 px-3 font-bold text-slate-800 score-pct-cell';
      }
    }

    async function saveAllMarks() {
      const examId = document.getElementById('marks-exam-select').value;
      if (!examId) {
        showToast('Please select an assessment first', 'error');
        return;
      }

      const inputs = document.querySelectorAll('.mark-input');
      const marksPayload = [];
      let hasError = false;

      inputs.forEach(inp => {
        const val = inp.value.trim();
        if (val !== '') {
          const num = parseFloat(val);
          const max = parseFloat(inp.dataset.total);
          if (num < 0 || num > max) {
            hasError = true;
            inp.classList.add('border-rose-500', 'bg-rose-50');
          } else {
            marksPayload.push({
              student_id: parseInt(inp.dataset.studentId),
              marks_obtained: num
            });
          }
        }
      });

      if (hasError) {
        showToast('Encountered marks outside range [0, Total Marks]. Please correct before saving.', 'error');
        return;
      }

      if (marksPayload.length === 0) {
        showToast('No scores entered to save.', 'info');
        return;
      }

      const btn = document.getElementById('btn-save-marks');
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...';
      lucide.createIcons();

      try {
        const res = await fetch(`/api/exams/${examId}/marks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exam_id: parseInt(examId), marks: marksPayload })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast(data.message, 'success');
          await loadStudents();
        } else {
          showToast(data.message || 'Error saving marks', 'error');
        }
      } catch (err) {
        showToast('Network error while saving marks', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Save All Marks';
        lucide.createIcons();
      }
    }

    // Attendance Roster
    async function loadAttendanceRoster() {
      const date = document.getElementById('att-date-picker').value;
      const section = document.getElementById('att-section-select').value;
      const tbody = document.getElementById('att-roster-body');

      if (!date) return;

      let url = `/api/attendance?date=${encodeURIComponent(date)}`;
      if (section && section !== 'All') url += `&section=${encodeURIComponent(section)}`;

      try {
        const res = await fetch(url);
        const data = await res.json();

        if (!data.roster || data.roster.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-400">No students found for this section.</td></tr>';
          return;
        }

        tbody.innerHTML = data.roster.map(r => `
          <tr class="hover:bg-slate-50 transition" data-student-id="${r.student_id}">
            <td class="py-3 px-4 font-mono font-semibold text-slate-900">${escapeHtml(r.roll_no)}</td>
            <td class="py-3 px-4 font-medium text-slate-900">${escapeHtml(r.name)}</td>
            <td class="py-3 px-4"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">${escapeHtml(r.section)}</span></td>
            <td class="py-3 px-4 text-center">
              <label class="inline-flex items-center cursor-pointer select-none">
                <input type="checkbox" ${r.is_present ? 'checked' : ''} class="att-checkbox sr-only peer" data-student-id="${r.student_id}">
                <div class="relative w-11 h-6 bg-rose-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                <span class="ml-2 text-xs font-semibold peer-checked:text-emerald-700 text-rose-600 att-label-text">
                  ${r.is_present ? 'Present' : 'Absent'}
                </span>
              </label>
            </td>
          </tr>
        `).join('');

        // Wire change listeners to update text label dynamically
        document.querySelectorAll('.att-checkbox').forEach(cb => {
          cb.addEventListener('change', (e) => {
            const label = e.target.parentElement.querySelector('.att-label-text');
            if (e.target.checked) {
              label.textContent = 'Present';
              label.className = 'ml-2 text-xs font-semibold text-emerald-700 att-label-text';
            } else {
              label.textContent = 'Absent';
              label.className = 'ml-2 text-xs font-semibold text-rose-600 att-label-text';
            }
          });
        });

      } catch (err) {
        showToast('Failed to load attendance roster', 'error');
      }
    }

    function markAllAttendance(isPresent) {
      document.querySelectorAll('.att-checkbox').forEach(cb => {
        cb.checked = isPresent;
        const label = cb.parentElement.querySelector('.att-label-text');
        if (isPresent) {
          label.textContent = 'Present';
          label.className = 'ml-2 text-xs font-semibold text-emerald-700 att-label-text';
        } else {
          label.textContent = 'Absent';
          label.className = 'ml-2 text-xs font-semibold text-rose-600 att-label-text';
        }
      });
      showToast(`Marked all students as ${isPresent ? 'Present' : 'Absent'}`, 'info');
    }

    async function saveAttendanceRoster() {
      const date = document.getElementById('att-date-picker').value;
      if (!date) {
        showToast('Please select a session date', 'error');
        return;
      }

      const checkboxes = document.querySelectorAll('.att-checkbox');
      const records = [];
      checkboxes.forEach(cb => {
        records.push({
          student_id: parseInt(cb.dataset.studentId),
          is_present: cb.checked
        });
      });

      if (records.length === 0) {
        showToast('No student attendance records to save.', 'info');
        return;
      }

      const btn = document.getElementById('btn-save-att');
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...';
      lucide.createIcons();

      try {
        const res = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, records })
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message, 'success');
          await loadOverviewStats();
          await loadStudents();
        } else {
          showToast('Failed to save attendance', 'error');
        }
      } catch (e) {
        showToast('Network error while logging attendance', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Save Attendance Records';
        lucide.createIcons();
      }
    }

    // AI Performance Analytics & PDF
    function viewStudentReport(studentId) {
      currentSelectedStudentId = studentId;
      switchTab('analytics');
      const select = document.getElementById('analytics-student-select');
      select.value = studentId;
      loadStudentAnalytics();
    }

    async function loadStudentAnalytics() {
      const select = document.getElementById('analytics-student-select');
      const studentId = select.value || currentSelectedStudentId;
      if (!studentId) {
        document.getElementById('analytics-details-wrapper').classList.add('hidden');
        return;
      }

      currentSelectedStudentId = studentId;
      const wrapper = document.getElementById('analytics-details-wrapper');
      wrapper.classList.remove('hidden');

      const refreshBtn = document.getElementById('btn-refresh-analytics');
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Computing...';
      lucide.createIcons();

      try {
        const res = await fetch(`/api/analytics/student/${studentId}`);
        if (!res.ok) throw new Error('Analytics processing failed');
        const data = await res.json();
        renderAnalyticsView(data.metrics, data.analysis);
      } catch (err) {
        showToast('Could not load performance analytics', 'error');
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Refresh';
        lucide.createIcons();
      }
    }

    function renderAnalyticsView(m, a) {
      // Identity
      document.getElementById('view-student-name').textContent = m.name;
      document.getElementById('view-student-roll').textContent = m.roll_no;
      document.getElementById('view-student-section').textContent = m.section;
      document.getElementById('view-student-email').textContent = m.email || 'No email registered';

      // 4 Metric Cards
      const attEl = document.getElementById('metric-att-pct');
      attEl.textContent = `${m.attendance_pct}%`;
      attEl.className = m.attendance_pct >= 85 ? 'text-3xl font-extrabold text-emerald-600' : (m.attendance_pct < 75 ? 'text-3xl font-extrabold text-rose-600' : 'text-3xl font-extrabold text-amber-600');
      document.getElementById('metric-att-sessions').textContent = `${m.present_sessions} / ${m.total_sessions} Sessions Present`;

      const examAvgEl = document.getElementById('metric-exam-avg');
      examAvgEl.textContent = `${m.exam_avg_pct}%`;
      examAvgEl.className = m.exam_avg_pct >= 80 ? 'text-3xl font-extrabold text-emerald-600' : (m.exam_avg_pct < 50 ? 'text-3xl font-extrabold text-rose-600' : 'text-3xl font-extrabold text-slate-900');
      document.getElementById('metric-exam-count').textContent = `${m.exam_count} Exams Recorded`;

      document.getElementById('metric-percentile').textContent = `${m.percentile_rank}th`;

      const trajEl = document.getElementById('metric-trajectory');
      const trajStr = m.trajectory > 0 ? `+${m.trajectory}%` : `${m.trajectory}%`;
      trajEl.textContent = trajStr;
      trajEl.className = m.trajectory > 5 ? 'text-3xl font-extrabold text-emerald-600' : (m.trajectory < -5 ? 'text-3xl font-extrabold text-rose-600' : 'text-3xl font-extrabold text-slate-900');
      document.getElementById('metric-trajectory-sub').textContent = m.trajectory > 5 ? 'Strong Positive Momentum' : (m.trajectory < -5 ? 'Declining Momentum Alert' : 'Consistent Across Assessments');

      // Exam Breakdown Table
      const examTbody = document.getElementById('exam-breakdown-body');
      if (!m.exam_scores || m.exam_scores.length === 0) {
        examTbody.innerHTML = '<tr><td colspan="6" class="py-4 text-center text-slate-400">No exam marks available.</td></tr>';
      } else {
        examTbody.innerHTML = m.exam_scores.map(e => `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-2.5 px-3 font-semibold text-slate-900">${escapeHtml(e.exam_name)}</td>
            <td class="py-2.5 px-3 text-slate-600">${escapeHtml(e.subject)}</td>
            <td class="py-2.5 px-3 text-slate-500">${escapeHtml(e.date)}</td>
            <td class="py-2.5 px-3 font-mono font-medium">${e.marks_obtained}</td>
            <td class="py-2.5 px-3 font-mono text-slate-500">${e.total_marks}</td>
            <td class="py-2.5 px-3 font-bold ${e.score_pct >= 80 ? 'text-emerald-600' : (e.score_pct < 50 ? 'text-rose-600' : 'text-slate-800')}">${e.score_pct}%</td>
          </tr>
        `).join('');
      }

      // Analysis Card & Source Badge
      const sourceBadge = document.getElementById('ai-source-badge');
      if (a.source === 'gemini_ai') {
        sourceBadge.className = 'px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 bg-blue-100 text-blue-800 border border-blue-200';
        sourceBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span> Powered by Google Gemini AI';
      } else {
        sourceBadge.className = 'px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 bg-slate-100 text-slate-800 border border-slate-300';
        sourceBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500"></span> Offline Rule-Based Fallback Engine';
      }

      // Summary
      document.getElementById('analysis-summary-text').textContent = a.summary || 'Summary unavailable.';

      // Strengths
      const strengthsList = document.getElementById('analysis-strengths-list');
      strengthsList.innerHTML = (a.key_strengths || []).map(s => `
        <li class="flex items-start gap-2">
          <i data-lucide="check" class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5"></i>
          <span>${escapeHtml(s)}</span>
        </li>
      `).join('');

      // Risks
      const risksList = document.getElementById('analysis-risks-list');
      risksList.innerHTML = (a.risk_factors || []).map(r => `
        <li class="flex items-start gap-2">
          <i data-lucide="alert-circle" class="w-4 h-4 text-rose-600 shrink-0 mt-0.5"></i>
          <span>${escapeHtml(r)}</span>
        </li>
      `).join('');

      // Recommendations
      const recsList = document.getElementById('analysis-recs-list');
      recsList.innerHTML = (a.actionable_recommendations || []).map(rc => `
        <li class="pl-1"><span>${escapeHtml(rc)}</span></li>
      `).join('');

      lucide.createIcons();
    }

    function downloadSelectedStudentPdf() {
      if (!currentSelectedStudentId) {
        showToast('Please select a student first', 'error');
        return;
      }
      downloadStudentPdfDirect(currentSelectedStudentId);
    }

    function downloadStudentPdfDirect(studentId) {
      showToast('Compiling publication-ready PDF report...', 'info');
      window.location.href = `/api/reports/student/${studentId}/pdf`;
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  </script>
</body>
</html>
"""


@app.get("/", response_class=HTMLResponse)
def serve_spa():
    return FRONTEND_HTML
