import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import dotenv from "dotenv";
import PDFDocument from "pdfkit";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const PORT = 3000;
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public folder and root
const publicDir = path.join(process.cwd(), "public");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
app.use(express.static(publicDir));
app.use(express.static(process.cwd()));

const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------------------------
// DATA MODELS & IN-MEMORY STATE
// ---------------------------------------------------------------------------

interface Student {
  id: number;
  roll_no: string;
  name: string;
  student_phone: string;
  parent_name: string;
  parent_phone: string;
  email: string | null;
  section: string;
  created_at: string;
}

interface Exam {
  id: number;
  name: string;
  subject: string;
  total_marks: number;
  date: string;
}

interface Mark {
  id: number;
  student_id: number;
  exam_id: number;
  marks_obtained: number;
}

interface Attendance {
  id: number;
  student_id: number;
  date: string;
  is_present: boolean;
}

interface CallLog {
  id: number;
  student_id: number;
  contact_person: "Student" | "Parent/Guardian";
  contact_name: string;
  phone_number: string;
  call_datetime: string;
  subject: string;
  summary: string;
  outcome: string; // "Connected & Discussed", "Left Voicemail", "No Answer / Busy", "Follow-up Scheduled"
  duration_minutes: number;
  created_at: string;
}

let nextStudentId = 1;
let nextExamId = 1;
let nextMarkId = 1;
let nextAttendanceId = 1;
let nextCallLogId = 1;

const students: Student[] = [];
const exams: Exam[] = [];
const marks: Mark[] = [];
const attendanceRecords: Attendance[] = [];
const callLogs: CallLog[] = [];

// Seed sample students with phone numbers and parent details
const seedStudents = [
  {
    roll_no: "CS-101",
    name: "Aarav Sharma",
    student_phone: "+1 (555) 234-5678",
    parent_name: "Rajesh Sharma",
    parent_phone: "+1 (555) 876-5432",
    email: "aarav.sharma@campus.edu",
    section: "Section A",
  },
  {
    roll_no: "CS-102",
    name: "Diya Patel",
    student_phone: "+1 (555) 345-6789",
    parent_name: "Anita Patel",
    parent_phone: "+1 (555) 987-6543",
    email: "diya.patel@campus.edu",
    section: "Section A",
  },
  {
    roll_no: "CS-103",
    name: "Ethan Walker",
    student_phone: "+1 (555) 456-7890",
    parent_name: "David Walker",
    parent_phone: "+1 (555) 123-9876",
    email: "ethan.walker@campus.edu",
    section: "Section B",
  },
  {
    roll_no: "CS-104",
    name: "Fatima Al-Sayed",
    student_phone: "+1 (555) 567-8901",
    parent_name: "Tariq Al-Sayed",
    parent_phone: "+1 (555) 234-8765",
    email: "fatima.alsayed@campus.edu",
    section: "Section B",
  },
  {
    roll_no: "CS-105",
    name: "Mei Lin",
    student_phone: "+1 (555) 678-9012",
    parent_name: "Hao Lin",
    parent_phone: "+1 (555) 345-7654",
    email: "mei.lin@campus.edu",
    section: "Section A",
  },
];

for (const s of seedStudents) {
  students.push({
    id: nextStudentId++,
    roll_no: s.roll_no,
    name: s.name,
    student_phone: s.student_phone,
    parent_name: s.parent_name,
    parent_phone: s.parent_phone,
    email: s.email,
    section: s.section,
    created_at: new Date().toISOString(),
  });
}

// Seed 2 exams
exams.push({
  id: nextExamId++,
  name: "Midterm Assessment",
  subject: "Computer Science & Algorithms",
  total_marks: 100,
  date: "2026-02-15",
});
exams.push({
  id: nextExamId++,
  name: "Unit Test 2",
  subject: "Database Management Systems",
  total_marks: 50,
  date: "2026-03-05",
});

// Seed marks
const exam1Scores: Record<string, number> = {
  "CS-101": 88.0,
  "CS-102": 74.5,
  "CS-103": 92.0,
  "CS-104": 44.0,
  "CS-105": 81.0,
};

const exam2Scores: Record<string, number> = {
  "CS-101": 46.0,
  "CS-102": 38.0,
  "CS-103": 48.5,
  "CS-104": 21.0,
  "CS-105": 42.5,
};

for (const s of students) {
  if (exam1Scores[s.roll_no] !== undefined) {
    marks.push({
      id: nextMarkId++,
      student_id: s.id,
      exam_id: 1,
      marks_obtained: exam1Scores[s.roll_no],
    });
  }
  if (exam2Scores[s.roll_no] !== undefined) {
    marks.push({
      id: nextMarkId++,
      student_id: s.id,
      exam_id: 2,
      marks_obtained: exam2Scores[s.roll_no],
    });
  }
}

// Seed 5 attendance dates
const dates = ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"];
for (const d of dates) {
  for (const s of students) {
    const isPresent = !(s.roll_no === "CS-104" && (d === "2026-03-02" || d === "2026-03-04"));
    attendanceRecords.push({
      id: nextAttendanceId++,
      student_id: s.id,
      date: d,
      is_present: isPresent,
    });
  }
}

// Seed sample call logs
callLogs.push({
  id: nextCallLogId++,
  student_id: 1, // Aarav Sharma
  contact_person: "Parent/Guardian",
  contact_name: "Rajesh Sharma",
  phone_number: "+1 (555) 876-5432",
  call_datetime: "2026-03-06T14:30:00",
  subject: "Academic honors and semester project progression",
  summary:
    "Congratulated Mr. Sharma on Aarav's exceptional performance in Algorithms (88%) and high attendance. Discussed enrolling him in the advanced algorithmic challenge cohort.",
  outcome: "Connected & Discussed",
  duration_minutes: 8,
  created_at: "2026-03-06T14:40:00Z",
});

callLogs.push({
  id: nextCallLogId++,
  student_id: 4, // Fatima Al-Sayed
  contact_person: "Parent/Guardian",
  contact_name: "Tariq Al-Sayed",
  phone_number: "+1 (555) 234-8765",
  call_datetime: "2026-03-07T11:15:00",
  subject: "Attendance decline and Unit Test 2 remediation",
  summary:
    "Discussed Fatima missing two laboratory sessions and falling behind on DBMS concepts (42%). Father acknowledged seasonal health issues and agreed to monitor daily attendance. Scheduled Tuesday after-school tutoring.",
  outcome: "Follow-up Scheduled",
  duration_minutes: 14,
  created_at: "2026-03-07T11:30:00Z",
});

callLogs.push({
  id: nextCallLogId++,
  student_id: 2, // Diya Patel
  contact_person: "Student",
  contact_name: "Diya Patel",
  phone_number: "+1 (555) 345-6789",
  call_datetime: "2026-03-08T16:00:00",
  subject: "Office hours check-in on normalization theory",
  summary:
    "Student requested clarification on BCNF decomposition. Recommended attending Wednesday TA workshop and completing chapter exercises.",
  outcome: "Connected & Discussed",
  duration_minutes: 6,
  created_at: "2026-03-08T16:10:00Z",
});

// ---------------------------------------------------------------------------
// STATISTICAL CALCULATION FUNCTIONS
// ---------------------------------------------------------------------------

function calculateStudentMetrics(studentId: number) {
  const student = students.find((s) => s.id === studentId);
  if (!student) throw new Error("Student not found");

  // Attendance metrics
  const studentAttendance = attendanceRecords.filter((a) => a.student_id === studentId);
  const totalSessions = studentAttendance.length;
  const presentSessions = studentAttendance.filter((a) => a.is_present).length;
  const attendancePct = totalSessions > 0 ? (presentSessions / totalSessions) * 100 : 100.0;

  // Exam scores
  const studentMarks = marks.filter((m) => m.student_id === studentId);
  const examDetails = studentMarks
    .map((m) => {
      const exam = exams.find((e) => e.id === m.exam_id);
      if (!exam) return null;
      const scorePct = exam.total_marks > 0 ? (m.marks_obtained / exam.total_marks) * 100 : 0;
      return {
        exam_id: exam.id,
        exam_name: exam.name,
        subject: exam.subject,
        date: exam.date,
        marks_obtained: m.marks_obtained,
        total_marks: exam.total_marks,
        score_pct: Math.round(scorePct * 100) / 100,
      };
    })
    .filter(Boolean) as {
    exam_id: number;
    exam_name: string;
    subject: string;
    date: string;
    marks_obtained: number;
    total_marks: number;
    score_pct: number;
  }[];

  examDetails.sort((a, b) => a.date.localeCompare(b.date));

  const examCount = examDetails.length;
  let examAvgPct = 0;
  let trajectory = 0;

  if (examCount > 0) {
    const sum = examDetails.reduce((acc, curr) => acc + curr.score_pct, 0);
    examAvgPct = sum / examCount;
    if (examCount >= 2) {
      trajectory = examDetails[examCount - 1].score_pct - examDetails[0].score_pct;
    }
  }

  // Section percentile rank
  const sectionStudents = students.filter((s) => s.section === student.section);
  const sectionAverages: number[] = [];

  for (const peer of sectionStudents) {
    const peerMarks = marks.filter((m) => m.student_id === peer.id);
    if (peerMarks.length > 0) {
      let peerSum = 0;
      let count = 0;
      for (const pm of peerMarks) {
        const pe = exams.find((e) => e.id === pm.exam_id);
        if (pe && pe.total_marks > 0) {
          peerSum += (pm.marks_obtained / pe.total_marks) * 100;
          count++;
        }
      }
      sectionAverages.push(count > 0 ? peerSum / count : 0);
    } else {
      sectionAverages.push(0);
    }
  }

  let percentileRank = 50.0;
  if (sectionAverages.length > 0) {
    const strictlyBelow = sectionAverages.filter((avg) => avg < examAvgPct).length;
    percentileRank = (strictlyBelow / sectionAverages.length) * 100;
  }

  // Call stats
  const studentCalls = callLogs.filter((c) => c.student_id === studentId);
  const callsToStudent = studentCalls.filter((c) => c.contact_person === "Student").length;
  const callsToParent = studentCalls.filter((c) => c.contact_person === "Parent/Guardian").length;

  return {
    student_id: student.id,
    roll_no: student.roll_no,
    name: student.name,
    student_phone: student.student_phone || "",
    parent_name: student.parent_name || "",
    parent_phone: student.parent_phone || "",
    email: student.email,
    section: student.section,
    attendance_pct: Math.round(attendancePct * 10) / 10,
    total_sessions: totalSessions,
    present_sessions: presentSessions,
    exam_avg_pct: Math.round(examAvgPct * 10) / 10,
    exam_count: examCount,
    trajectory: Math.round(trajectory * 10) / 10,
    percentile_rank: Math.round(percentileRank * 10) / 10,
    exam_scores: examDetails,
    calls_to_student: callsToStudent,
    calls_to_parent: callsToParent,
    total_calls: studentCalls.length,
    call_records: studentCalls,
  };
}

// ---------------------------------------------------------------------------
// RULE-BASED DETERMINISTIC ANALYTICS (Offline Heuristic Engine)
// ---------------------------------------------------------------------------

function generateRuleBasedAnalysis(metrics: ReturnType<typeof calculateStudentMetrics>) {
  const keyStrengths: string[] = [];
  const riskFactors: string[] = [];
  const recommendations: string[] = [];

  const examAvg = metrics.exam_avg_pct;
  const attendancePct = metrics.attendance_pct;
  const trajectory = metrics.trajectory;
  const percentile = metrics.percentile_rank;
  const name = metrics.name.split(" ")[0];

  if (attendancePct >= 90) {
    keyStrengths.push(`Exemplary session attendance record of ${attendancePct}%, showing dependable class commitment.`);
  } else if (attendancePct < 75) {
    riskFactors.push(`Critical attendance deficit (${attendancePct}%). Attendance fallen below 75% threshold.`);
    recommendations.push(
      `Contact parent (${metrics.parent_name || "Guardian"}: ${metrics.parent_phone || "phone"}) immediately to coordinate an attendance recovery plan.`
    );
  }

  if (examAvg >= 80) {
    keyStrengths.push(`High academic mastery across evaluated subjects with a ${examAvg}% average score.`);
    recommendations.push("Provide honors-level enrichment modules and independent project pathways.");
  } else if (examAvg < 50) {
    riskFactors.push(`Academic average of ${examAvg}% reflects urgent need for foundational concept remediation.`);
    recommendations.push("Implement mandatory weekly guided study sessions and structured exam retake milestones.");
  }

  if (trajectory > 5) {
    keyStrengths.push(`Strong positive score trajectory (+${trajectory}%). Demonstrates high improvement momentum.`);
  } else if (trajectory < -5) {
    riskFactors.push(`Downward score trend (${trajectory}% drop from initial assessment). Requires immediate intervention.`);
    recommendations.push("Schedule a one-on-one diagnostic conference to evaluate recent study impediments and syllabus pace.");
  }

  if (percentile >= 75) {
    keyStrengths.push(`Performs in the upper quartile of Section ${metrics.section} peers (${percentile}th percentile).`);
  } else if (percentile < 25) {
    riskFactors.push(`Lags within the lower quartile of Section peers (Percentile Rank: ${percentile}th).`);
    recommendations.push("Formulate individualized pacing milestone targets for upcoming evaluations.");
  }

  if (keyStrengths.length === 0) {
    keyStrengths.push("Demonstrates active participation across scheduled classroom assessments.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Maintain steady study schedules and active participation in class discussions.");
  }

  let summary = "";
  if (examAvg >= 80 && attendancePct >= 85) {
    summary = `${name} demonstrates exemplary overall performance in ${metrics.section} with dependable attendance (${attendancePct}%) and superior academic marks (${examAvg}%).`;
  } else if (examAvg < 50 || attendancePct < 75) {
    summary = `${name} requires immediate academic and behavioral intervention due to vulnerabilities in attendance (${attendancePct}%) and examination yields (${examAvg}%).`;
  } else {
    summary = `${name} maintains satisfactory progress in ${metrics.section} with an attendance mark of ${attendancePct}% and an average exam score of ${examAvg}%.`;
  }

  return {
    summary,
    key_strengths: keyStrengths,
    risk_factors: riskFactors,
    actionable_recommendations: recommendations,
    source: "rule_based_fallback",
  };
}

// ---------------------------------------------------------------------------
// GEMINI AI INTEGRATION (Lazy initialized with gemini-3.8-flash)
// ---------------------------------------------------------------------------

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// In-memory cache for AI analysis to avoid redundant API calls, rate limits, and 503 errors
const studentAnalysisCache = new Map<string, { data: any; timestamp: number }>();
const teacherInsightsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function invalidateCaches() {
  studentAnalysisCache.clear();
  teacherInsightsCache.clear();
}

async function executeGeminiPrompt(prompt: string, timeoutMs = 10000): Promise<string | null> {
  const client = getAiClient();
  if (!client) return null;

  // Try primary model first, followed by lighter model on 503/high-demand/timeout
  const modelsToTry = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

  for (const model of modelsToTry) {
    try {
      const aiPromise = client.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI_TIMEOUT")), timeoutMs)
      );

      const response: any = await Promise.race([aiPromise, timeoutPromise]);
      const text = response?.text;
      if (text && typeof text === "string" && text.trim().length > 0) {
        return text;
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const is503 =
        errMsg.includes("503") ||
        errMsg.includes("high demand") ||
        errMsg.includes("UNAVAILABLE") ||
        errMsg.includes("unavailable");
      const isTimeout = errMsg.includes("AI_TIMEOUT") || errMsg.includes("timeout");

      if (is503 || isTimeout) {
        // Try fallback model smoothly
        continue;
      }
      break;
    }
  }

  return null;
}

async function analyzeStudentPerformance(
  metrics: ReturnType<typeof calculateStudentMetrics>,
  forceRuleBased = false
) {
  if (forceRuleBased) {
    return generateRuleBasedAnalysis(metrics);
  }

  // Check cache first
  const cacheKey = `student_${metrics.student_id}_avg${metrics.exam_avg_pct}_att${metrics.attendance_pct}_calls${metrics.total_calls}_exams${metrics.exam_count}`;
  const cached = studentAnalysisCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const client = getAiClient();
  if (!client) {
    const fallback = generateRuleBasedAnalysis(metrics);
    studentAnalysisCache.set(cacheKey, { data: fallback, timestamp: Date.now() });
    return fallback;
  }

  const prompt = `You are a Senior Academic Analytics Advisor. Analyze this student's data and return ONLY a JSON object:
Student Profile:
- Name: ${metrics.name} (${metrics.roll_no})
- Section: ${metrics.section}
- Phone: ${metrics.student_phone} | Parent: ${metrics.parent_name} (${metrics.parent_phone})
- Attendance: ${metrics.attendance_pct}% (${metrics.present_sessions}/${metrics.total_sessions} sessions)
- Exam Average: ${metrics.exam_avg_pct}% (${metrics.exam_count} exams)
- Trajectory: ${metrics.trajectory > 0 ? "+" : ""}${metrics.trajectory}%
- Section Percentile: ${metrics.percentile_rank}th percentile
- Calls Logged: ${metrics.total_calls} (${metrics.calls_to_student} student, ${metrics.calls_to_parent} parent)
- Exam Details: ${JSON.stringify(metrics.exam_scores)}

Return ONLY valid JSON matching this schema:
{
  "summary": "2-3 sentences concise professional assessment",
  "key_strengths": ["bullet 1", "bullet 2"],
  "risk_factors": ["bullet 1"],
  "actionable_recommendations": ["recommendation 1", "recommendation 2"]
}`;

  const text = await executeGeminiPrompt(prompt, 10000);
  if (text) {
    try {
      const parsed = JSON.parse(text);
      const result = {
        summary: String(parsed.summary || "Student assessment generated."),
        key_strengths: Array.isArray(parsed.key_strengths) ? parsed.key_strengths.map(String) : [],
        risk_factors: Array.isArray(parsed.risk_factors) ? parsed.risk_factors.map(String) : [],
        actionable_recommendations: Array.isArray(parsed.actionable_recommendations)
          ? parsed.actionable_recommendations.map(String)
          : [],
        source: "gemini-ai",
      };
      studentAnalysisCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch {
      // Fall through to rule based
    }
  }

  // Graceful heuristic engine
  const result = generateRuleBasedAnalysis(metrics);
  studentAnalysisCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

// ---------------------------------------------------------------------------
// TEACHER'S CLASS & SESSION ANALYTICS (Cohort Intelligence)
// ---------------------------------------------------------------------------

function calculateCohortMetrics(sectionFilter: string, examFilter: string) {
  let cohortStudents = [...students];
  if (sectionFilter && sectionFilter !== "All") {
    cohortStudents = cohortStudents.filter((s) => s.section === sectionFilter);
  }

  const studentCount = cohortStudents.length;
  if (studentCount === 0) {
    return {
      student_count: 0,
      class_avg_pct: 0,
      class_median_pct: 0,
      max_score_pct: 0,
      min_score_pct: 0,
      score_std_dev: 0,
      class_attendance_pct: 0,
      chronic_absentee_count: 0,
      distribution: { honors: 0, proficient: 0, developing: 0, at_risk: 0 },
      top_improvers: [],
      declining_students: [],
      at_risk_students: [],
    };
  }

  // Attendance stats for cohort
  let totalAttSessions = 0;
  let presentAttSessions = 0;
  let chronicAbsenteeCount = 0;

  const studentAverages: { student: Student; score_pct: number; attendance_pct: number; trajectory: number }[] = [];

  for (const s of cohortStudents) {
    const sAtt = attendanceRecords.filter((a) => a.student_id === s.id);
    const sTot = sAtt.length;
    const sPres = sAtt.filter((a) => a.is_present).length;
    const sAttPct = sTot > 0 ? (sPres / sTot) * 100 : 100;
    if (sAttPct < 75) chronicAbsenteeCount++;
    totalAttSessions += sTot;
    presentAttSessions += sPres;

    // Exam marks for this student based on examFilter
    let sMarks = marks.filter((m) => m.student_id === s.id);
    if (examFilter && examFilter !== "all") {
      const eId = parseInt(examFilter, 10);
      sMarks = sMarks.filter((m) => m.exam_id === eId);
    }

    let avgScore = 0;
    let trajectory = 0;
    if (sMarks.length > 0) {
      let scoreSum = 0;
      let count = 0;
      const sortedMarks = [...sMarks].sort((a, b) => a.exam_id - b.exam_id);
      for (const sm of sortedMarks) {
        const ex = exams.find((e) => e.id === sm.exam_id);
        if (ex && ex.total_marks > 0) {
          const pct = (sm.marks_obtained / ex.total_marks) * 100;
          scoreSum += pct;
          count++;
        }
      }
      avgScore = count > 0 ? scoreSum / count : 0;
      if (sortedMarks.length >= 2) {
        const firstEx = exams.find((e) => e.id === sortedMarks[0].exam_id);
        const lastEx = exams.find((e) => e.id === sortedMarks[sortedMarks.length - 1].exam_id);
        if (firstEx && lastEx) {
          const firstPct = (sortedMarks[0].marks_obtained / firstEx.total_marks) * 100;
          const lastPct = (sortedMarks[sortedMarks.length - 1].marks_obtained / lastEx.total_marks) * 100;
          trajectory = lastPct - firstPct;
        }
      }
    }

    studentAverages.push({
      student: s,
      score_pct: Math.round(avgScore * 10) / 10,
      attendance_pct: Math.round(sAttPct * 10) / 10,
      trajectory: Math.round(trajectory * 10) / 10,
    });
  }

  const classAttendancePct =
    totalAttSessions > 0 ? Math.round((presentAttSessions / totalAttSessions) * 1000) / 10 : 100;

  const validScores = studentAverages.map((sa) => sa.score_pct);
  validScores.sort((a, b) => a - b);

  const mean = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0;
  const median =
    validScores.length > 0
      ? validScores.length % 2 === 0
        ? (validScores[validScores.length / 2 - 1] + validScores[validScores.length / 2]) / 2
        : validScores[Math.floor(validScores.length / 2)]
      : 0;

  const maxScore = validScores.length > 0 ? Math.max(...validScores) : 0;
  const minScore = validScores.length > 0 ? Math.min(...validScores) : 0;

  // Standard deviation
  const variance =
    validScores.length > 1
      ? validScores.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (validScores.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);

  // Grade distributions
  let honors = 0; // >= 80%
  let proficient = 0; // 65% - 79.9%
  let developing = 0; // 50% - 64.9%
  let atRisk = 0; // < 50%

  for (const s of validScores) {
    if (s >= 80) honors++;
    else if (s >= 65) proficient++;
    else if (s >= 50) developing++;
    else atRisk++;
  }

  // Trajectories
  const topImprovers = [...studentAverages]
    .filter((sa) => sa.trajectory > 0)
    .sort((a, b) => b.trajectory - a.trajectory)
    .slice(0, 3)
    .map((sa) => ({
      roll_no: sa.student.roll_no,
      name: sa.student.name,
      trajectory: sa.trajectory,
      current_score: sa.score_pct,
    }));

  const decliningStudents = [...studentAverages]
    .filter((sa) => sa.trajectory < 0)
    .sort((a, b) => a.trajectory - b.trajectory)
    .slice(0, 3)
    .map((sa) => ({
      roll_no: sa.student.roll_no,
      name: sa.student.name,
      trajectory: sa.trajectory,
      current_score: sa.score_pct,
    }));

  // Identified At-Risk list
  const atRiskStudents = studentAverages
    .filter((sa) => sa.score_pct < 50 || sa.attendance_pct < 75 || sa.trajectory < -10)
    .map((sa) => ({
      id: sa.student.id,
      roll_no: sa.student.roll_no,
      name: sa.student.name,
      section: sa.student.section,
      student_phone: sa.student.student_phone,
      parent_name: sa.student.parent_name,
      parent_phone: sa.student.parent_phone,
      score_pct: sa.score_pct,
      attendance_pct: sa.attendance_pct,
      trajectory: sa.trajectory,
      risk_reason:
        sa.score_pct < 50 && sa.attendance_pct < 75
          ? "Critical: Academic failure & severe attendance gap"
          : sa.score_pct < 50
          ? "Academic failure (< 50% exam score)"
          : sa.attendance_pct < 75
          ? "Chronic absenteeism (< 75% attendance)"
          : "Rapid downward performance drift",
    }));

  return {
    student_count: studentCount,
    class_avg_pct: Math.round(mean * 10) / 10,
    class_median_pct: Math.round(median * 10) / 10,
    max_score_pct: Math.round(maxScore * 10) / 10,
    min_score_pct: Math.round(minScore * 10) / 10,
    score_std_dev: Math.round(stdDev * 10) / 10,
    class_attendance_pct: classAttendancePct,
    chronic_absentee_count: chronicAbsenteeCount,
    distribution: {
      honors,
      proficient,
      developing,
      at_risk: atRisk,
      honors_pct: Math.round((honors / studentCount) * 100),
      proficient_pct: Math.round((proficient / studentCount) * 100),
      developing_pct: Math.round((developing / studentCount) * 100),
      at_risk_pct: Math.round((atRisk / studentCount) * 100),
    },
    top_improvers: topImprovers,
    declining_students: decliningStudents,
    at_risk_students: atRiskStudents,
  };
}

async function generateTeacherInsights(
  cohortData: ReturnType<typeof calculateCohortMetrics>,
  section: string,
  examName: string
) {
  const cacheKey = `teacher_${section}_${examName}_${cohortData.student_count}_avg${cohortData.class_avg_pct}_att${cohortData.class_attendance_pct}`;
  const cached = teacherInsightsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const client = getAiClient();
  if (!client) {
    const heuristic = generateDeterministicTeacherAdvisory(cohortData, section, examName);
    teacherInsightsCache.set(cacheKey, { data: heuristic, timestamp: Date.now() });
    return heuristic;
  }

  const prompt = `You are an expert Educational Data Analyst and Master Curriculum Coach. Provide classroom intelligence and pedagogical guidance for teachers based on these cohort metrics:
Context:
- Section / Grade: ${section}
- Assessment Scope: ${examName}
- Cohort Headcount: ${cohortData.student_count}
- Class Average Score: ${cohortData.class_avg_pct}% (Median: ${cohortData.class_median_pct}%)
- Score Range: Low ${cohortData.min_score_pct}% to High ${cohortData.max_score_pct}% (Std Dev: ${cohortData.score_std_dev})
- Class Attendance Rate: ${cohortData.class_attendance_pct}% (Chronic Absenteeism: ${cohortData.chronic_absentee_count} students)
- Grade Distribution: Honors (>=80%): ${cohortData.distribution.honors} students (${cohortData.distribution.honors_pct}%), Proficient (65-79%): ${cohortData.distribution.proficient}, Developing (50-64%): ${cohortData.distribution.developing}, At-Risk (<50%): ${cohortData.distribution.at_risk}
- At-Risk Students Count: ${cohortData.at_risk_students.length}

Return ONLY a valid JSON object matching:
{
  "summary": "2-3 sentences concise class performance diagnosis",
  "pedagogical_interventions": [
    "Specific curriculum or teaching adjustment 1",
    "Specific curriculum or teaching adjustment 2"
  ],
  "immediate_teacher_actions": [
    "Concrete step for the upcoming teaching week 1",
    "Concrete step for parent communication or student review 2"
  ]
}`;

  const text = await executeGeminiPrompt(prompt, 10000);
  if (text) {
    try {
      const parsed = JSON.parse(text);
      const result = {
        summary: String(parsed.summary || "Cohort analytics processed successfully."),
        pedagogical_interventions: Array.isArray(parsed.pedagogical_interventions)
          ? parsed.pedagogical_interventions.map(String)
          : [],
        immediate_teacher_actions: Array.isArray(parsed.immediate_teacher_actions)
          ? parsed.immediate_teacher_actions.map(String)
          : [],
        source: "gemini-ai",
      };
      teacherInsightsCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch {
      // Fall through to deterministic
    }
  }

  const heuristic = generateDeterministicTeacherAdvisory(cohortData, section, examName);
  teacherInsightsCache.set(cacheKey, { data: heuristic, timestamp: Date.now() });
  return heuristic;
}

function generateDeterministicTeacherAdvisory(
  cohortData: ReturnType<typeof calculateCohortMetrics>,
  section: string,
  examName: string
) {
  const interventions: string[] = [];
  const actions: string[] = [];

  if (cohortData.class_avg_pct >= 75) {
    interventions.push(
      `Solid cohort comprehension in ${examName} (${cohortData.class_avg_pct}% average). Introduce higher-order analytical problems and peer-led project extensions.`
    );
  } else if (cohortData.class_avg_pct < 60) {
    interventions.push(
      `Systemic difficulty identified (${cohortData.class_avg_pct}% average). Dedicate the next 2 lecture hours to re-teaching prerequisite fundamentals before advancing the syllabus.`
    );
    actions.push("Conduct a 15-minute diagnostic recap quiz on foundational theorems.");
  } else {
    interventions.push(
      `Moderate class comprehension (${cohortData.class_avg_pct}%). Focus on bridging concepts between lecture theory and applied problem solving.`
    );
  }

  if (cohortData.score_std_dev > 16) {
    interventions.push(
      `High score disparity detected (Standard Deviation: ${cohortData.score_std_dev}). Implement tiered differentiated group activities to prevent lower-scoring students from falling behind while challenging honors students.`
    );
    actions.push("Pair high-performing students with developing peers for collaborative problem sets.");
  }

  if (cohortData.chronic_absentee_count > 0) {
    actions.push(
      `Engage parents of ${cohortData.chronic_absentee_count} chronically absent students (<75% attendance) using the direct phone dialer to address attendance barriers.`
    );
  }

  if (cohortData.at_risk_students.length > 0) {
    actions.push(
      `Schedule mandatory 15-minute 1-on-1 office hour check-ins for the ${cohortData.at_risk_students.length} at-risk students before the next examination.`
    );
  } else {
    actions.push("Review weekly lesson pacing and maintain consistent formative assessment milestones.");
  }

  const summary = `Class cohort (${section}, ${examName}) reflects an average score of ${cohortData.class_avg_pct}% with ${cohortData.class_attendance_pct}% overall attendance. ${
    cohortData.distribution.honors
  } students are excelling at honors level, while ${cohortData.at_risk_students.length} students currently trigger academic or attendance intervention thresholds.`;

  return {
    summary,
    pedagogical_interventions: interventions,
    immediate_teacher_actions: actions,
    source: "rule_based_fallback",
  };
}

// ---------------------------------------------------------------------------
// PDF REPORT BUILDER (WITH RESOLVED LINE SPACING)
// ---------------------------------------------------------------------------

function renderStudentPdfPage(
  doc: PDFKit.PDFDocument,
  metrics: ReturnType<typeof calculateStudentMetrics>,
  analysis: any,
  pageNum: number = 1,
  totalPages: number = 1
) {
  const brandDark = "#0f172a";
  const brandBlue = "#0284c7";
  const textGray = "#64748b";

  // Header Banner
  doc.rect(40, 36, 515, 54).fill("#0284c7");
  doc.fillColor("#ffffff").fontSize(16).font("Helvetica-Bold").text("ACADEMIC PERFORMANCE & ANALYTICS REPORT", 55, 48);
  doc.fontSize(8.5).font("Helvetica").text(
    `Automated Student Evaluation  |  Section: ${metrics.section}  |  Generated: ${new Date().toLocaleDateString()}`,
    55,
    68
  );

  // Student Profile Card
  doc.rect(40, 98, 515, 80).fillAndStroke("#f8fafc", "#cbd5e1");
  doc.fillColor(brandDark).fontSize(13).font("Helvetica-Bold").text(metrics.name, 55, 108);
  doc.fontSize(8.5).font("Helvetica").fillColor(textGray);
  doc.text(
    `Roll No: ${metrics.roll_no}   |   Enrollment ID: #STU-${metrics.student_id.toString().padStart(4, "0")}   |   Term: Current Academic Session`,
    55,
    124
  );

  // Phone & Guardian details
  doc.fillColor("#0369a1").font("Helvetica-Bold");
  doc.text(`Student Phone: ${metrics.student_phone || "Not recorded"}`, 55, 140);
  doc.fillColor("#475569").font("Helvetica");
  doc.text(`Parent/Guardian: ${metrics.parent_name || "Guardian"} (${metrics.parent_phone || "N/A"})`, 260, 140);

  // Communication logs summary badge
  doc.fontSize(8).fillColor(textGray);
  doc.text(
    `Call Logs: ${metrics.total_calls} calls recorded (${metrics.calls_to_student} to Student, ${metrics.calls_to_parent} to Parent)`,
    55,
    156
  );

  // 4 Core Metric KPI Boxes
  const metricsData = [
    {
      label: "ATTENDANCE RATE",
      val: `${metrics.attendance_pct}%`,
      sub: `${metrics.present_sessions}/${metrics.total_sessions} Sessions`,
    },
    {
      label: "ACADEMIC AVERAGE",
      val: `${metrics.exam_avg_pct}%`,
      sub: `${metrics.exam_count} Exams Taken`,
    },
    {
      label: "SCORE TRAJECTORY",
      val: `${metrics.trajectory > 0 ? "+" : ""}${metrics.trajectory}%`,
      sub: metrics.trajectory >= 0 ? "Upward Momentum" : "Downward Drift",
    },
    {
      label: "SECTION PERCENTILE",
      val: `${metrics.percentile_rank}th`,
      sub: `Peer Rank (${metrics.section})`,
    },
  ];

  let boxX = 40;
  for (const m of metricsData) {
    doc.rect(boxX, 186, 122, 54).fillAndStroke("#ffffff", "#cbd5e1");
    doc.fontSize(7).font("Helvetica-Bold").fillColor(brandBlue).text(m.label, boxX + 8, 194);
    doc.fontSize(15).font("Helvetica-Bold").fillColor(brandDark).text(m.val, boxX + 8, 206);
    doc.fontSize(7).font("Helvetica").fillColor(textGray).text(m.sub, boxX + 8, 224);
    boxX += 131;
  }

  // Examination History Table
  doc.fontSize(10).font("Helvetica-Bold").fillColor(brandDark).text("Examination Results & Score Log", 40, 252);
  doc.rect(40, 266, 515, 18).fill("#f1f5f9");
  doc.fontSize(7.5).font("Helvetica-Bold").fillColor(brandDark);
  doc.text("EXAM NAME", 50, 271);
  doc.text("SUBJECT", 185, 271);
  doc.text("DATE", 345, 271);
  doc.text("MARKS OBTAINED", 415, 271);
  doc.text("SCORE %", 495, 271);

  let curY = 288;
  if (metrics.exam_scores.length === 0) {
    doc.fontSize(8).font("Helvetica").fillColor(textGray).text("No recorded examinations to display.", 50, curY);
    curY += 18;
  } else {
    for (const sc of metrics.exam_scores) {
      doc.rect(40, curY - 2, 515, 16).stroke("#f1f5f9");
      doc.fontSize(8).font("Helvetica").fillColor(brandDark);
      doc.text(sc.exam_name, 50, curY);
      doc.text(sc.subject, 185, curY);
      doc.text(sc.date, 345, curY);
      doc.text(`${sc.marks_obtained} / ${sc.total_marks}`, 415, curY);
      doc.font("Helvetica-Bold").text(`${sc.score_pct}%`, 495, curY);
      doc.font("Helvetica");
      curY += 18;
    }
  }

  // Qualitative Performance Analysis Card
  curY += 10;
  const cardStartY = curY;

  // Header inside card
  doc.fontSize(10).font("Helvetica-Bold").fillColor(brandDark).text("Comprehensive Performance Diagnostics", 55, curY + 10);
  doc.fontSize(7.5).font("Helvetica-Bold").fillColor(brandBlue).text(
    `ENGINE: ${analysis.source.toUpperCase()}`,
    390,
    curY + 10
  );

  // Diagnostic Summary
  doc.fontSize(8.5).font("Helvetica").fillColor(brandDark);
  const summaryH = doc.heightOfString(analysis.summary, { width: 480, lineGap: 3 });
  doc.text(analysis.summary, 55, curY + 28, { width: 480, lineGap: 3 });

  let sectionY = curY + 28 + summaryH + 12;

  // Key Strengths
  doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#166534").text("Key Strengths & Competencies:", 55, sectionY);
  sectionY += 13;
  for (const str of analysis.key_strengths) {
    const bulletText = `•  ${str}`;
    const h = doc.heightOfString(bulletText, { width: 465, lineGap: 2.5 });
    doc.fontSize(8).font("Helvetica").fillColor(brandDark).text(bulletText, 65, sectionY, { width: 465, lineGap: 2.5 });
    sectionY += h + 5; // DYNAMIC HEIGHT FIX
  }

  // Risk Factors
  sectionY += 6;
  doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#991b1b").text("Identified Risk Factors:", 55, sectionY);
  sectionY += 13;
  if (analysis.risk_factors.length === 0) {
    doc.fontSize(8).font("Helvetica").fillColor(textGray).text("•  No critical risk thresholds triggered.", 65, sectionY);
    sectionY += 14;
  } else {
    for (const rk of analysis.risk_factors) {
      const bulletText = `•  ${rk}`;
      const h = doc.heightOfString(bulletText, { width: 465, lineGap: 2.5 });
      doc.fontSize(8).font("Helvetica").fillColor(brandDark).text(bulletText, 65, sectionY, { width: 465, lineGap: 2.5 });
      sectionY += h + 5; // DYNAMIC HEIGHT FIX
    }
  }

  // Actionable Advisory Recommendations (RESOLVES ISSUE 3 & CAPTURE.PNG OVERLAPPING BUG)
  sectionY += 6;
  doc.fontSize(8.5).font("Helvetica-Bold").fillColor(brandBlue).text("Actionable Advisory Recommendations:", 55, sectionY);
  sectionY += 13;
  for (const rec of analysis.actionable_recommendations) {
    const bulletText = `•  ${rec}`;
    // Measure dynamic string height accurately with lineGap
    const h = doc.heightOfString(bulletText, { width: 465, lineGap: 3 });
    doc.fontSize(8).font("Helvetica").fillColor(brandDark).text(bulletText, 65, sectionY, { width: 465, lineGap: 3 });
    sectionY += h + 6; // DYNAMIC HEIGHT FIX: Prevents any line overlapping
  }

  // Draw enclosing card border around the diagnostics
  const totalCardH = Math.max(sectionY - cardStartY + 8, 220);
  doc.rect(40, cardStartY, 515, totalCardH).stroke("#cbd5e1");

  // Footer
  doc.fontSize(7).font("Helvetica").fillColor(textGray).text(
    `CONFIDENTIAL  |  Student Performance Tracker & Analytics  |  Student ${metrics.roll_no}  |  Page ${pageNum} of ${totalPages}`,
    40,
    785,
    {
      align: "center",
      width: 515,
    }
  );
}

// ---------------------------------------------------------------------------
// ROUTES
// ---------------------------------------------------------------------------

app.get("/", (req, res) => {
  const htmlPath = path.join(publicDir, "index.html");
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.status(500).send("index.html not found");
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    gemini_api_key_configured: !!process.env.GEMINI_API_KEY,
  });
});

app.get("/api/sample-csv", (req, res) => {
  const csvContent = `roll_no,name,student_phone,parent_name,parent_phone,section\nCS-101,Aarav Sharma,+1 (555) 234-5678,Rajesh Sharma,+1 (555) 876-5432,Section A\nCS-102,Diya Patel,+1 (555) 345-6789,Anita Patel,+1 (555) 987-6543,Section A\nCS-103,Ethan Walker,+1 (555) 456-7890,David Walker,+1 (555) 123-9876,Section B\nCS-104,Fatima Al-Sayed,+1 (555) 567-8901,Tariq Al-Sayed,+1 (555) 234-8765,Section B\nCS-105,Mei Lin,+1 (555) 678-9012,Hao Lin,+1 (555) 345-7654,Section A\n`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="sample_students.csv"');
  res.send(csvContent);
});

// Bulk student CSV ingestion
app.post("/api/students/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded. Please supply a .csv file." });
  }

  const text = req.file.buffer.toString("utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) {
    return res.status(400).json({ error: "The uploaded file contains no data rows." });
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const rollIdx = headers.indexOf("roll_no");
  const nameIdx = headers.indexOf("name");
  const studentPhoneIdx = headers.indexOf("student_phone");
  const parentNameIdx = headers.indexOf("parent_name");
  const parentPhoneIdx = headers.indexOf("parent_phone");
  const emailIdx = headers.indexOf("email");
  const sectionIdx = headers.indexOf("section");

  if (rollIdx === -1 || nameIdx === -1) {
    return res.status(400).json({
      error: `Missing required columns: roll_no and name. Found columns: ${headers.join(", ")}`,
    });
  }

  let insertedCount = 0;
  let updatedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/"/g, ""));
    const rollNo = cols[rollIdx];
    const name = cols[nameIdx];
    if (!rollNo || !name) continue;

    const studentPhone = studentPhoneIdx !== -1 && cols[studentPhoneIdx] ? cols[studentPhoneIdx] : "";
    const parentName = parentNameIdx !== -1 && cols[parentNameIdx] ? cols[parentNameIdx] : "";
    const parentPhone = parentPhoneIdx !== -1 && cols[parentPhoneIdx] ? cols[parentPhoneIdx] : "";
    const email = emailIdx !== -1 && cols[emailIdx] ? cols[emailIdx] : null;
    const section = sectionIdx !== -1 && cols[sectionIdx] ? cols[sectionIdx] : "General";

    const existing = students.find((s) => s.roll_no === rollNo);
    if (existing) {
      existing.name = name;
      existing.student_phone = studentPhone || existing.student_phone;
      existing.parent_name = parentName || existing.parent_name;
      existing.parent_phone = parentPhone || existing.parent_phone;
      if (email) existing.email = email;
      existing.section = section;
      updatedCount++;
    } else {
      students.push({
        id: nextStudentId++,
        roll_no: rollNo,
        name: name,
        student_phone: studentPhone,
        parent_name: parentName,
        parent_phone: parentPhone,
        email: email,
        section: section,
        created_at: new Date().toISOString(),
      });
      insertedCount++;
    }
  }

  res.json({
    success: true,
    message: `Processed file: ${insertedCount} inserted, ${updatedCount} updated.`,
    inserted: insertedCount,
    updated: updatedCount,
    total_rows: lines.length - 1,
  });
});

// Student listing with computed metrics and call counts
app.get("/api/students", (req, res) => {
  const search = req.query.search ? String(req.query.search).trim().toLowerCase() : null;
  const section = req.query.section ? String(req.query.section).trim() : null;

  let filtered = [...students];
  if (section && section !== "All") {
    filtered = filtered.filter((s) => s.section === section);
  }
  if (search) {
    filtered = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(search) ||
        s.roll_no.toLowerCase().includes(search) ||
        (s.student_phone && s.student_phone.includes(search)) ||
        (s.parent_phone && s.parent_phone.includes(search))
    );
  }

  filtered.sort((a, b) => a.roll_no.localeCompare(b.roll_no));

  const results = filtered.map((s) => {
    try {
      const m = calculateStudentMetrics(s.id);
      return {
        id: s.id,
        roll_no: s.roll_no,
        name: s.name,
        student_phone: s.student_phone,
        parent_name: s.parent_name,
        parent_phone: s.parent_phone,
        email: s.email,
        section: s.section,
        created_at: s.created_at,
        attendance_pct: m.attendance_pct,
        exam_avg_pct: m.exam_avg_pct,
        trajectory: m.trajectory,
        percentile_rank: m.percentile_rank,
        calls_to_student: m.calls_to_student,
        calls_to_parent: m.calls_to_parent,
        total_calls: m.total_calls,
      };
    } catch {
      return {
        id: s.id,
        roll_no: s.roll_no,
        name: s.name,
        student_phone: s.student_phone,
        parent_name: s.parent_name,
        parent_phone: s.parent_phone,
        email: s.email,
        section: s.section,
        created_at: s.created_at,
        attendance_pct: 0,
        exam_avg_pct: 0,
        trajectory: 0,
        percentile_rank: 0,
        calls_to_student: 0,
        calls_to_parent: 0,
        total_calls: 0,
      };
    }
  });

  res.json(results);
});

app.post("/api/students", (req, res) => {
  const { roll_no, name, student_phone, parent_name, parent_phone, email, section } = req.body;
  if (!roll_no || !name) {
    return res.status(400).json({ detail: "roll_no and name are required." });
  }
  if (students.find((s) => s.roll_no === roll_no.trim())) {
    return res.status(400).json({ detail: `Student with roll number '${roll_no}' already exists.` });
  }

  const newStudent: Student = {
    id: nextStudentId++,
    roll_no: roll_no.trim(),
    name: name.trim(),
    student_phone: student_phone ? student_phone.trim() : "",
    parent_name: parent_name ? parent_name.trim() : "",
    parent_phone: parent_phone ? parent_phone.trim() : "",
    email: email ? email.trim() : null,
    section: section ? section.trim() : "General",
    created_at: new Date().toISOString(),
  };
  students.push(newStudent);
  invalidateCaches();
  res.status(201).json(newStudent);
});

app.delete("/api/students/:id", (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const idx = students.findIndex((s) => s.id === studentId);
  if (idx === -1) return res.status(404).json({ detail: "Student not found." });

  students.splice(idx, 1);
  for (let i = marks.length - 1; i >= 0; i--) {
    if (marks[i].student_id === studentId) marks.splice(i, 1);
  }
  for (let i = attendanceRecords.length - 1; i >= 0; i--) {
    if (attendanceRecords[i].student_id === studentId) attendanceRecords.splice(i, 1);
  }
  for (let i = callLogs.length - 1; i >= 0; i--) {
    if (callLogs[i].student_id === studentId) callLogs.splice(i, 1);
  }

  invalidateCaches();
  res.json({ success: true, message: `Student ${studentId} deleted successfully.` });
});

app.get("/api/sections", (req, res) => {
  const unique = Array.from(new Set(students.map((s) => s.section))).sort();
  res.json(unique);
});

// ---------------------------------------------------------------------------
// CALL LOG TRACKING ENDPOINTS
// ---------------------------------------------------------------------------

app.get("/api/students/:id/calls", (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const logs = callLogs
    .filter((c) => c.student_id === studentId)
    .sort((a, b) => b.call_datetime.localeCompare(a.call_datetime));
  res.json(logs);
});

app.post("/api/students/:id/calls", (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const student = students.find((s) => s.id === studentId);
  if (!student) return res.status(404).json({ detail: "Student not found." });

  const { contact_person, contact_name, phone_number, call_datetime, subject, summary, outcome, duration_minutes } =
    req.body;

  if (!subject || !summary) {
    return res.status(400).json({ detail: "Subject and conversation summary are required." });
  }

  const newCallLog: CallLog = {
    id: nextCallLogId++,
    student_id: studentId,
    contact_person: contact_person === "Parent/Guardian" ? "Parent/Guardian" : "Student",
    contact_name:
      contact_name ||
      (contact_person === "Parent/Guardian" ? student.parent_name || "Guardian" : student.name),
    phone_number:
      phone_number ||
      (contact_person === "Parent/Guardian" ? student.parent_phone : student.student_phone) ||
      "",
    call_datetime: call_datetime || new Date().toISOString(),
    subject: subject.trim(),
    summary: summary.trim(),
    outcome: outcome || "Connected & Discussed",
    duration_minutes: duration_minutes ? parseInt(duration_minutes, 10) : 5,
    created_at: new Date().toISOString(),
  };

  callLogs.push(newCallLog);
  invalidateCaches();
  res.status(201).json(newCallLog);
});

app.delete("/api/calls/:id", (req, res) => {
  const callId = parseInt(req.params.id, 10);
  const idx = callLogs.findIndex((c) => c.id === callId);
  if (idx === -1) return res.status(404).json({ detail: "Call record not found." });
  callLogs.splice(idx, 1);
  invalidateCaches();
  res.json({ success: true, message: "Call log record removed." });
});

app.get("/api/calls/summary", (req, res) => {
  let toStudent = 0;
  let toParent = 0;
  for (const c of callLogs) {
    if (c.contact_person === "Parent/Guardian") toParent++;
    else toStudent++;
  }
  const recent = [...callLogs].sort((a, b) => b.call_datetime.localeCompare(a.call_datetime)).slice(0, 10);
  res.json({
    total_calls: callLogs.length,
    calls_to_student: toStudent,
    calls_to_parent: toParent,
    recent_logs: recent,
  });
});

// Exams
app.get("/api/exams", (req, res) => {
  const sorted = [...exams].sort((a, b) => b.date.localeCompare(a.date));
  res.json(sorted);
});

app.post("/api/exams", (req, res) => {
  const { name, subject, total_marks, date } = req.body;
  if (!name || !subject || !total_marks || !date) {
    return res.status(400).json({ detail: "name, subject, total_marks, and date are required." });
  }
  const examTotal = parseFloat(total_marks);
  if (isNaN(examTotal) || examTotal <= 0) {
    return res.status(400).json({ detail: "total_marks must be greater than 0." });
  }

  const newExam: Exam = {
    id: nextExamId++,
    name: name.trim(),
    subject: subject.trim(),
    total_marks: examTotal,
    date: date.trim(),
  };
  exams.push(newExam);
  invalidateCaches();
  res.status(201).json(newExam);
});

// Marks Matrix
app.get("/api/marks/matrix", (req, res) => {
  const examId = req.query.exam_id ? parseInt(String(req.query.exam_id), 10) : exams[0]?.id;
  const section = req.query.section ? String(req.query.section).trim() : null;

  if (!examId) {
    return res.json({ exam: null, entries: [] });
  }

  const exam = exams.find((e) => e.id === examId);
  if (!exam) return res.status(404).json({ detail: "Exam not found." });

  let targetStudents = [...students];
  if (section && section !== "All") {
    targetStudents = targetStudents.filter((s) => s.section === section);
  }
  targetStudents.sort((a, b) => a.roll_no.localeCompare(b.roll_no));

  const entries = targetStudents.map((s) => {
    const markRec = marks.find((m) => m.student_id === s.id && m.exam_id === examId);
    return {
      student_id: s.id,
      roll_no: s.roll_no,
      name: s.name,
      section: s.section,
      marks_obtained: markRec !== undefined ? markRec.marks_obtained : null,
      total_marks: exam.total_marks,
    };
  });

  res.json({
    exam,
    section: section || "All",
    entries,
  });
});

app.post("/api/marks/bulk", (req, res) => {
  const { exam_id, entries } = req.body;
  if (!exam_id || !Array.isArray(entries)) {
    return res.status(400).json({ detail: "exam_id and entries array are required." });
  }

  const exam = exams.find((e) => e.id === parseInt(exam_id, 10));
  if (!exam) return res.status(404).json({ detail: "Exam not found." });

  let savedCount = 0;
  for (const item of entries) {
    if (item.marks_obtained === null || item.marks_obtained === undefined || item.marks_obtained === "") {
      continue;
    }
    const val = parseFloat(item.marks_obtained);
    if (isNaN(val) || val < 0 || val > exam.total_marks) {
      continue;
    }

    const existing = marks.find((m) => m.student_id === item.student_id && m.exam_id === exam.id);
    if (existing) {
      existing.marks_obtained = val;
    } else {
      marks.push({
        id: nextMarkId++,
        student_id: item.student_id,
        exam_id: exam.id,
        marks_obtained: val,
      });
    }
    savedCount++;
  }

  invalidateCaches();
  res.json({
    success: true,
    saved_count: savedCount,
    message: `Successfully updated ${savedCount} mark records.`,
  });
});

// Attendance Tracker
app.get("/api/attendance", (req, res) => {
  const targetDate = req.query.date ? String(req.query.date).trim() : new Date().toISOString().slice(0, 10);
  const section = req.query.section ? String(req.query.section).trim() : null;

  let rosterStudents = [...students];
  if (section && section !== "All") {
    rosterStudents = rosterStudents.filter((s) => s.section === section);
  }
  rosterStudents.sort((a, b) => a.roll_no.localeCompare(b.roll_no));

  const existingMap = new Map<number, boolean>();
  for (const a of attendanceRecords) {
    if (a.date === targetDate) {
      existingMap.set(a.student_id, a.is_present);
    }
  }

  const roster = rosterStudents.map((s) => ({
    student_id: s.id,
    roll_no: s.roll_no,
    name: s.name,
    section: s.section,
    student_phone: s.student_phone,
    parent_phone: s.parent_phone,
    is_present: existingMap.has(s.id) ? existingMap.get(s.id)! : true,
  }));

  res.json({
    date: targetDate,
    section: section || "All",
    roster: roster,
  });
});

app.post("/api/attendance", (req, res) => {
  const { date, records } = req.body;
  if (!date || !Array.isArray(records)) {
    return res.status(400).json({ detail: "date and records array are required." });
  }

  let savedCount = 0;
  for (const item of records) {
    const existing = attendanceRecords.find((a) => a.student_id === item.student_id && a.date === date);
    if (existing) {
      existing.is_present = !!item.is_present;
    } else {
      attendanceRecords.push({
        id: nextAttendanceId++,
        student_id: item.student_id,
        date: date,
        is_present: !!item.is_present,
      });
    }
    savedCount++;
  }

  invalidateCaches();
  res.json({
    success: true,
    saved_count: savedCount,
    message: `Successfully recorded attendance for ${savedCount} students on ${date}.`,
  });
});

// Single Student Analytics
app.get("/api/analytics/student/:id", async (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const student = students.find((s) => s.id === studentId);
  if (!student) return res.status(404).json({ detail: "Student not found" });

  try {
    const metrics = calculateStudentMetrics(studentId);
    const analysis = await analyzeStudentPerformance(metrics);
    res.json({
      metrics,
      analysis,
    });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

// Teacher's Class/Section Analytics & Pedagogical Hub
app.get("/api/analytics/teacher", async (req, res) => {
  const section = req.query.section ? String(req.query.section).trim() : "All";
  const examId = req.query.exam_id ? String(req.query.exam_id).trim() : "all";

  let examName = "Overall Session (All Assessments)";
  if (examId !== "all") {
    const targetExam = exams.find((e) => e.id === parseInt(examId, 10));
    if (targetExam) examName = targetExam.name;
  }

  try {
    const cohort = calculateCohortMetrics(section, examId);
    const advisory = await generateTeacherInsights(cohort, section, examName);
    res.json({
      section,
      exam_id: examId,
      exam_name: examName,
      cohort,
      advisory,
    });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

// Single Student PDF Report
app.get("/api/reports/student/:id/pdf", async (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const student = students.find((s) => s.id === studentId);
  if (!student) return res.status(404).send("Student not found");

  const metrics = calculateStudentMetrics(studentId);
  const analysis = await analyzeStudentPerformance(metrics);

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="student_report_${metrics.roll_no}_${new Date().toISOString().slice(0, 10)}.pdf"`
  );

  doc.pipe(res);
  renderStudentPdfPage(doc, metrics, analysis, 1, 1);
  doc.end();
});

// Bulk Multi-Student PDF Report (Single Combined PDF)
app.get(["/api/reports/bulk-pdf", "/api/reports/bulk/pdf"], async (req, res) => {
  let idsParam = req.query.student_ids ? String(req.query.student_ids).split(",") : [];
  const studentIds = idsParam.map((id) => parseInt(id.trim(), 10)).filter((n) => !isNaN(n));

  if (studentIds.length === 0) {
    return res.status(400).send("Please specify at least one student_id in the student_ids parameter.");
  }

  const isBulk = studentIds.length > 2;
  const validMetricsList: { metrics: ReturnType<typeof calculateStudentMetrics>; analysis: any }[] = [];
  for (const sId of studentIds) {
    const s = students.find((item) => item.id === sId);
    if (!s) continue;
    const m = calculateStudentMetrics(sId);
    const a = await analyzeStudentPerformance(m, isBulk);
    validMetricsList.push({ metrics: m, analysis: a });
  }

  if (validMetricsList.length === 0) {
    return res.status(404).send("No matching students found.");
  }

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="consolidated_student_dossier_${validMetricsList.length}_students_${new Date().toISOString().slice(0, 10)}.pdf"`
  );

  doc.pipe(res);

  const totalPages = validMetricsList.length;
  validMetricsList.forEach((item, index) => {
    if (index > 0) {
      doc.addPage();
    }
    renderStudentPdfPage(doc, item.metrics, item.analysis, index + 1, totalPages);
  });

  doc.end();
});

app.post(["/api/reports/bulk-pdf", "/api/reports/bulk/pdf"], async (req, res) => {
  const { student_ids } = req.body;
  if (!Array.isArray(student_ids) || student_ids.length === 0) {
    return res.status(400).json({ detail: "student_ids array is required." });
  }

  const isBulk = student_ids.length > 2;
  const validMetricsList: { metrics: ReturnType<typeof calculateStudentMetrics>; analysis: any }[] = [];
  for (const sId of student_ids) {
    const s = students.find((item) => item.id === sId);
    if (!s) continue;
    const m = calculateStudentMetrics(sId);
    const a = await analyzeStudentPerformance(m, isBulk);
    validMetricsList.push({ metrics: m, analysis: a });
  }

  if (validMetricsList.length === 0) {
    return res.status(404).json({ detail: "No matching students found." });
  }

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="consolidated_student_dossier_${validMetricsList.length}_students.pdf"`
  );

  doc.pipe(res);

  const totalPages = validMetricsList.length;
  validMetricsList.forEach((item, index) => {
    if (index > 0) {
      doc.addPage();
    }
    renderStudentPdfPage(doc, item.metrics, item.analysis, index + 1, totalPages);
  });

  doc.end();
});

// Overview stats
app.get("/api/stats/overview", (req, res) => {
  const totalStudents = students.length;
  const totalExams = exams.length;

  let totalAtt = 0;
  let presentAtt = 0;
  for (const a of attendanceRecords) {
    totalAtt++;
    if (a.is_present) presentAtt++;
  }
  const avgAtt = totalAtt > 0 ? (presentAtt / totalAtt) * 100 : 100;

  let scoreSum = 0;
  let scoreCount = 0;
  for (const m of marks) {
    const e = exams.find((ex) => ex.id === m.exam_id);
    if (e && e.total_marks > 0) {
      scoreSum += (m.marks_obtained / e.total_marks) * 100;
      scoreCount++;
    }
  }
  const avgScore = scoreCount > 0 ? scoreSum / scoreCount : 0;

  let toStudentCalls = 0;
  let toParentCalls = 0;
  for (const c of callLogs) {
    if (c.contact_person === "Parent/Guardian") toParentCalls++;
    else toStudentCalls++;
  }

  res.json({
    total_students: totalStudents,
    total_exams: totalExams,
    total_attendance_logs: totalAtt,
    overall_attendance_pct: Math.round(avgAtt * 10) / 10,
    overall_exam_avg: Math.round(avgScore * 10) / 10,
    total_calls: callLogs.length,
    calls_to_student: toStudentCalls,
    calls_to_parent: toParentCalls,
  });
});

// START LISTENING ON PORT 3000
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Student Analytics Server] Listening on http://0.0.0.0:${PORT}`);
});
