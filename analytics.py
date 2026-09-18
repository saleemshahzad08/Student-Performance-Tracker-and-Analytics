"""
Analytics and AI service module for Student Performance Tracking.
Calculates statistical performance indicators via Pandas/NumPy and delivers
automated insights using Google GenAI SDK with an offline rule-based fallback engine.
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from models import Student, Exam, Mark, Attendance

logger = logging.getLogger("student_analytics")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setFormatter(logging.Formatter("[%(levelname)s] %(asctime)s - %(message)s"))
    logger.addHandler(ch)


def calculate_student_metrics(db: Session, student_id: int) -> Dict[str, Any]:
    """
    Computes statistical indicators for a student using Pandas:
    - attendance_pct = (Sessions Present / Total Sessions) * 100
    - exam_avg_pct = Average score percentage across all exams
    - trajectory = Latest exam score % minus First exam score %
    - percentile_rank = Student percentile within their section/cohort
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise ValueError(f"Student with ID {student_id} not found")

    # 1. Attendance Metrics
    att_records = (
        db.query(Attendance)
        .filter(Attendance.student_id == student_id)
        .all()
    )
    if att_records:
        att_df = pd.DataFrame([{"date": r.date, "is_present": bool(r.is_present)} for r in att_records])
        total_sessions = len(att_df)
        present_sessions = int(att_df["is_present"].sum())
        attendance_pct = round((present_sessions / total_sessions) * 100, 2)
    else:
        total_sessions = 0
        present_sessions = 0
        attendance_pct = 100.0  # Default neutral/unpenalized when no sessions recorded yet

    # 2. Exam Marks and Trajectory
    marks_query = (
        db.query(Mark, Exam)
        .join(Exam, Mark.exam_id == Exam.id)
        .filter(Mark.student_id == student_id)
        .all()
    )

    exam_scores_detail = []
    if marks_query:
        marks_data = []
        for mark, exam in marks_query:
            pct = (mark.marks_obtained / exam.total_marks) * 100 if exam.total_marks > 0 else 0.0
            marks_data.append({
                "exam_id": exam.id,
                "exam_name": exam.name,
                "subject": exam.subject,
                "date": exam.date,
                "marks_obtained": mark.marks_obtained,
                "total_marks": exam.total_marks,
                "score_pct": round(pct, 2)
            })
        
        exams_df = pd.DataFrame(marks_data)
        # Sort chronologically by exam date, then ID
        exams_df = exams_df.sort_values(by=["date", "exam_id"]).reset_index(drop=True)
        exam_scores_detail = exams_df.to_dict(orient="records")

        exam_avg_pct = round(float(exams_df["score_pct"].mean()), 2)
        
        # Trajectory = Latest exam score % minus First exam score %
        if len(exams_df) >= 2:
            first_score = float(exams_df.iloc[0]["score_pct"])
            latest_score = float(exams_df.iloc[-1]["score_pct"])
            trajectory = round(latest_score - first_score, 2)
        else:
            trajectory = 0.0
    else:
        exam_avg_pct = 0.0
        trajectory = 0.0

    # 3. Percentile Rank within Section / Cohort
    cohort_students = db.query(Student).filter(Student.section == student.section).all()
    cohort_student_ids = [s.id for s in cohort_students]

    cohort_marks_query = (
        db.query(Mark.student_id, Mark.marks_obtained, Exam.total_marks)
        .join(Exam, Mark.exam_id == Exam.id)
        .filter(Mark.student_id.in_(cohort_student_ids))
        .all()
    )

    if cohort_marks_query:
        c_df = pd.DataFrame([
            {
                "student_id": r[0],
                "score_pct": (r[1] / r[2]) * 100 if r[2] > 0 else 0.0
            }
            for r in cohort_marks_query
        ])
        # Aggregate average per student in cohort
        cohort_summary = c_df.groupby("student_id")["score_pct"].mean().reset_index()
        # Include any students in cohort with 0 exams as 0.0
        missing_ids = set(cohort_student_ids) - set(cohort_summary["student_id"])
        if missing_ids:
            missing_df = pd.DataFrame([{"student_id": sid, "score_pct": 0.0} for sid in missing_ids])
            cohort_summary = pd.concat([cohort_summary, missing_df], ignore_index=True)

        # Percentile rank: percentage of cohort scoring less than or equal to student
        if len(cohort_summary) > 1:
            cohort_summary["rank_pct"] = cohort_summary["score_pct"].rank(pct=True) * 100
            student_row = cohort_summary[cohort_summary["student_id"] == student_id]
            if not student_row.empty:
                percentile_rank = round(float(student_row["rank_pct"].iloc[0]), 1)
            else:
                percentile_rank = 50.0
        else:
            percentile_rank = 100.0
    else:
        percentile_rank = 100.0 if len(cohort_students) <= 1 else 50.0

    return {
        "student_id": student.id,
        "roll_no": student.roll_no,
        "name": student.name,
        "section": student.section,
        "email": student.email or "",
        "total_sessions": total_sessions,
        "present_sessions": present_sessions,
        "attendance_pct": attendance_pct,
        "exam_count": len(exam_scores_detail),
        "exam_avg_pct": exam_avg_pct,
        "trajectory": trajectory,
        "percentile_rank": percentile_rank,
        "exam_scores": exam_scores_detail,
    }


def generate_rule_based_analysis(metrics: Dict[str, Any]) -> Dict[str, Any]:
    """
    Built-in offline heuristic analysis engine implementing the exact rules:
    - Attendance: >= 85% is a key strength; < 75% is an attendance risk and triggers an action item.
    - Academic average: >= 80% is high achievement; < 50% flags critical academic risk; 50-79% is satisfactory.
    - Trajectory: > +5% logs positive improvement momentum; < -5% flags declining performance risk.
    - Percentile: >= 75th percentile is top quartile strength; < 25th percentile flags lower-quartile peer gap.
    """
    attendance = metrics.get("attendance_pct", 0.0)
    exam_avg = metrics.get("exam_avg_pct", 0.0)
    trajectory = metrics.get("trajectory", 0.0)
    percentile = metrics.get("percentile_rank", 0.0)
    name = metrics.get("name", "The student")
    exam_count = metrics.get("exam_count", 0)

    key_strengths: List[str] = []
    risk_factors: List[str] = []
    recommendations: List[str] = []

    # 1. Attendance Evaluation
    if attendance >= 85.0:
        key_strengths.append(
            f"High attendance record ({attendance:.1f}%), demonstrating punctuality, discipline, and regular classroom engagement."
        )
    elif attendance < 75.0:
        risk_factors.append(
            f"Attendance rate of {attendance:.1f}% falls below the minimum 75% threshold, threatening academic continuity and concept retention."
        )
        recommendations.append(
            "Schedule an attendance advisory meeting with student/parents and establish a daily check-in protocol."
        )
    else:
        # 75% - 84.9%
        pass

    # 2. Academic Average Evaluation
    if exam_avg >= 80.0:
        key_strengths.append(
            f"High academic achievement with an overall exam average of {exam_avg:.1f}%, indicating strong subject mastery."
        )
    elif exam_avg < 50.0:
        risk_factors.append(
            f"Critical academic alert: overall exam average of {exam_avg:.1f}% indicates substantial learning gaps across evaluated topics."
        )
        recommendations.append(
            "Enroll the student in targeted remedial tutoring sessions and break down complex coursework into weekly milestones."
        )
    else:
        # 50.0% - 79.9%
        if exam_count > 0:
            key_strengths.append(
                f"Satisfactory academic standing ({exam_avg:.1f}% average), meeting foundational course criteria with potential for higher distinction."
            )

    # 3. Trajectory Evaluation
    if exam_count >= 2:
        if trajectory > 5.0:
            key_strengths.append(
                f"Strong positive learning trajectory (+{trajectory:.1f}% score delta), reflecting rapid improvement and effective study adjustments."
            )
        elif trajectory < -5.0:
            risk_factors.append(
                f"Declining performance trajectory ({trajectory:.1f}% score delta), pointing towards emerging learning bottlenecks or reduced exam readiness."
            )
            recommendations.append(
                "Conduct a 1-on-1 diagnostic assessment to pinpoint specific concepts causing recent score declines."
            )
    elif exam_count == 1:
        recommendations.append(
            "Track forthcoming exams closely to establish a statistical performance trajectory."
        )

    # 4. Percentile Rank Evaluation
    if percentile >= 75.0:
        key_strengths.append(
            f"Cohort distinction: Ranks in the top quartile ({percentile:.1f}th percentile) relative to section peers."
        )
    elif percentile < 25.0:
        risk_factors.append(
            f"Cohort peer gap: Standing in the bottom quartile ({percentile:.1f}th percentile) among section peers."
        )
        recommendations.append(
            "Pair student with peer study partners and provide curated supplementary practice exercises."
        )

    # Default fallbacks if lists are empty (e.g. baseline cases)
    if not key_strengths:
        key_strengths.append("Maintains steady baseline participation across curriculum activities.")
    if not risk_factors:
        risk_factors.append("No critical risk indicators detected; performance remains within standard tolerances.")
    if not recommendations:
        recommendations.append("Continue standard revision cycles, active class participation, and regular mock testing.")

    # Synthesize holistic executive summary
    summary = (
        f"{name} demonstrates an overall exam average of {exam_avg:.1f}% with an attendance rate of {attendance:.1f}%, "
        f"placing them in the {percentile:.1f}th percentile of Section {metrics.get('section', 'General')}. "
    )
    if trajectory > 5.0:
        summary += f"Performance shows an encouraging upward momentum of +{trajectory:.1f}% across assessments."
    elif trajectory < -5.0:
        summary += f"Performance exhibits a recent downward trend of {trajectory:.1f}%, requiring immediate intervention."
    else:
        summary += "Academic metrics reflect consistent, stable performance throughout current evaluation intervals."

    return {
        "summary": summary,
        "key_strengths": key_strengths,
        "risk_factors": risk_factors,
        "actionable_recommendations": recommendations,
        "source": "rule_based_fallback",
    }


def analyze_student_performance(metrics: Dict[str, Any]) -> Dict[str, Any]:
    """
    Coordinates performance analytics with automatic fallback:
    1. Attempts to invoke Google GenAI SDK (gemini-2.5-flash).
    2. Wrapped in try...except block.
    3. Catches any exception (network, quota, missing key, model error),
       logs a warning, and calls generate_rule_based_analysis(metrics).
    4. Guarantees uniform JSON structure with 'source' attribute.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()

    if not api_key:
        logger.warning("GEMINI_API_KEY environment variable is not configured; using offline rule-based fallback engine.")
        return generate_rule_based_analysis(metrics)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

        system_instruction = (
            "You are an expert educational analytics specialist. Analyze the provided quantitative "
            "student metrics and produce a structured performance evaluation in JSON format.\n"
            "Return ONLY valid JSON matching this exact schema:\n"
            "{\n"
            '  "summary": "Concise 2-3 sentence executive summary",\n'
            '  "key_strengths": ["List of 2-4 specific strengths"],\n'
            '  "risk_factors": ["List of identified risks or gaps, or an explicit note if none"],\n'
            '  "actionable_recommendations": ["List of 2-4 concrete, teacher/student actions"],\n'
            '  "source": "gemini_ai"\n'
            "}"
        )

        prompt_data = {
            "student_name": metrics.get("name"),
            "roll_no": metrics.get("roll_no"),
            "section": metrics.get("section"),
            "attendance_pct": metrics.get("attendance_pct"),
            "total_sessions": metrics.get("total_sessions"),
            "present_sessions": metrics.get("present_sessions"),
            "exam_avg_pct": metrics.get("exam_avg_pct"),
            "trajectory": metrics.get("trajectory"),
            "percentile_rank": metrics.get("percentile_rank"),
            "exam_history": metrics.get("exam_scores", []),
            "heuristics_guide": {
                "attendance_rule": ">=85% is strong; <75% is risk",
                "academic_avg_rule": ">=80% is high; <50% is critical risk; 50-79% is satisfactory",
                "trajectory_rule": ">+5% is improvement momentum; <-5% is declining risk",
                "percentile_rule": ">=75th is top quartile; <25th is lower quartile gap"
            }
        }

        response = client.models.generate_content(
            model=model_name,
            contents=[
                types.Part.from_text(
                    text=f"Analyze student performance:\n{json.dumps(prompt_data, indent=2)}"
                )
            ],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )

        raw_text = response.text or "{}"
        parsed = json.loads(raw_text)

        # Validate required keys
        required_keys = ["summary", "key_strengths", "risk_factors", "actionable_recommendations"]
        if not all(k in parsed for k in required_keys):
            raise ValueError(f"Gemini response missing required keys: {list(parsed.keys())}")

        parsed["source"] = "gemini_ai"
        logger.info(f"Successfully generated AI performance analytics for student {metrics.get('roll_no')}")
        return parsed

    except Exception as exc:
        logger.warning(
            f"Gemini AI analytics call failed ({type(exc).__name__}: {exc}); "
            f"automatically deploying offline rule-based fallback engine."
        )
        return generate_rule_based_analysis(metrics)
