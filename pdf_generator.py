"""
PDF Report Generator using ReportLab.
Produces elegant, publication-quality academic performance reports.
"""

import io
from datetime import datetime
from typing import Dict, Any, List

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    KeepTogether,
)


def generate_student_pdf_report(metrics: Dict[str, Any], analysis: Dict[str, Any]) -> io.BytesIO:
    """
    Builds an in-memory PDF buffer containing:
    - Academic Header with student metadata
    - High-impact Metric Summary cards (Attendance %, Exam Avg, Percentile, Trajectory)
    - Detailed Exam Scores Breakdown table
    - Performance Analytics card (Summary, Strengths, Risks, Recommendations)
    - Source badge designating Gemini AI vs Offline Rule-Based Engine
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Custom Typography Palette
    primary_color = colors.HexColor("#0F172A")    # Slate 900
    secondary_color = colors.HexColor("#334155")  # Slate 700
    accent_blue = colors.HexColor("#2563EB")      # Blue 600
    success_green = colors.HexColor("#16A34A")    # Green 600
    warning_amber = colors.HexColor("#D97706")    # Amber 600
    danger_red = colors.HexColor("#DC2626")       # Red 600
    light_bg = colors.HexColor("#F8FAFC")         # Slate 50
    border_color = colors.HexColor("#E2E8F0")     # Slate 200

    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=primary_color,
    )
    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#64748B"),
    )
    section_heading_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=primary_color,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "BodyTextCustom",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=secondary_color,
    )
    bold_label_style = ParagraphStyle(
        "BoldLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=primary_color,
    )
    card_value_style = ParagraphStyle(
        "CardValue",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        textColor=primary_color,
        alignment=1,  # Centered
    )
    card_label_style = ParagraphStyle(
        "CardLabel",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#64748B"),
        alignment=1,  # Centered
    )
    bullet_style = ParagraphStyle(
        "BulletItem",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=secondary_color,
    )

    story = []

    # 1. INSTITUTION & REPORT HEADER
    header_data = [
        [
            Paragraph("<b>STUDENT PERFORMANCE & ANALYTICS REPORT</b>", title_style),
            Paragraph(
                f"Generated: {datetime.utcnow().strftime('%B %d, %Y')}<br/>"
                f"Evaluation Period: 2025-2026 Academic Term",
                subtitle_style,
            ),
        ]
    ]
    header_table = Table(header_data, colWidths=[360, 180])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0284C7"), spaceAfter=10))

    # 2. STUDENT IDENTITY BANNER
    student_name = metrics.get("name", "N/A")
    roll_no = metrics.get("roll_no", "N/A")
    section = metrics.get("section", "N/A")
    email = metrics.get("email", "N/A")

    id_data = [
        [
            Paragraph("<b>Student Name:</b>", bold_label_style),
            Paragraph(student_name, body_style),
            Paragraph("<b>Roll Number:</b>", bold_label_style),
            Paragraph(roll_no, body_style),
        ],
        [
            Paragraph("<b>Section:</b>", bold_label_style),
            Paragraph(section, body_style),
            Paragraph("<b>Email:</b>", bold_label_style),
            Paragraph(email or "Not Provided", body_style),
        ]
    ]
    id_table = Table(id_data, colWidths=[90, 180, 90, 180])
    id_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), light_bg),
        ("BOX", (0, 0), (-1, -1), 1, border_color),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, border_color),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(id_table)
    story.append(Spacer(1, 12))

    # 3. STATISTICAL METRICS SUMMARY CARDS
    att_pct = metrics.get("attendance_pct", 0.0)
    exam_avg = metrics.get("exam_avg_pct", 0.0)
    percentile = metrics.get("percentile_rank", 0.0)
    trajectory = metrics.get("trajectory", 0.0)

    # Attendance formatting
    att_color = success_green if att_pct >= 85 else (warning_amber if att_pct >= 75 else danger_red)
    att_val_p = Paragraph(f"<font color='{att_color.hexval()}'><b>{att_pct:.1f}%</b></font>", card_value_style)
    att_sub_p = Paragraph(f"Attendance Rate<br/>({metrics.get('present_sessions', 0)}/{metrics.get('total_sessions', 0)} Sessions)", card_label_style)

    # Exam average formatting
    exam_color = success_green if exam_avg >= 80 else (primary_color if exam_avg >= 50 else danger_red)
    exam_val_p = Paragraph(f"<font color='{exam_color.hexval()}'><b>{exam_avg:.1f}%</b></font>", card_value_style)
    exam_sub_p = Paragraph(f"Exam Average<br/>({metrics.get('exam_count', 0)} Exams Recorded)", card_label_style)

    # Percentile rank
    pct_val_p = Paragraph(f"<b>{percentile:.1f}th</b>", card_value_style)
    pct_sub_p = Paragraph("Cohort Percentile<br/>Section Benchmark", card_label_style)

    # Trajectory
    traj_str = f"+{trajectory:.1f}%" if trajectory > 0 else f"{trajectory:.1f}%"
    traj_color = success_green if trajectory > 5 else (danger_red if trajectory < -5 else secondary_color)
    traj_val_p = Paragraph(f"<font color='{traj_color.hexval()}'><b>{traj_str}</b></font>", card_value_style)
    traj_sub_p = Paragraph("Score Trajectory<br/>First vs Latest Exam", card_label_style)

    cards_data = [
        [att_val_p, exam_val_p, pct_val_p, traj_val_p],
        [att_sub_p, exam_sub_p, pct_sub_p, traj_sub_p],
    ]
    cards_table = Table(cards_data, colWidths=[135, 135, 135, 135])
    cards_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), light_bg),
        ("BOX", (0, 0), (-1, -1), 1, border_color),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, border_color),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("TOPPADDING", (0, 1), (-1, 1), 2),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(cards_table)
    story.append(Spacer(1, 14))

    # 4. EXAM SCORES BREAKDOWN TABLE
    story.append(Paragraph("Exam Performance Breakdown", section_heading_style))
    exam_scores = metrics.get("exam_scores", [])

    if exam_scores:
        table_rows = [
            [
                Paragraph("<b>Exam Name</b>", bold_label_style),
                Paragraph("<b>Subject</b>", bold_label_style),
                Paragraph("<b>Date</b>", bold_label_style),
                Paragraph("<b>Marks</b>", bold_label_style),
                Paragraph("<b>Total</b>", bold_label_style),
                Paragraph("<b>Score %</b>", bold_label_style),
            ]
        ]
        for item in exam_scores:
            pct_val = item.get("score_pct", 0.0)
            score_color_hex = "#16A34A" if pct_val >= 80 else ("#DC2626" if pct_val < 50 else "#0F172A")
            table_rows.append([
                Paragraph(item.get("exam_name", ""), body_style),
                Paragraph(item.get("subject", ""), body_style),
                Paragraph(item.get("date", ""), body_style),
                Paragraph(f"{item.get('marks_obtained', 0):g}", body_style),
                Paragraph(f"{item.get('total_marks', 0):g}", body_style),
                Paragraph(f"<font color='{score_color_hex}'><b>{pct_val:.1f}%</b></font>", body_style),
            ])
        
        exam_table = Table(table_rows, colWidths=[140, 130, 80, 60, 60, 70])
        exam_table_style = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
            ("BOX", (0, 0), (-1, -1), 1, border_color),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, border_color),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("ALIGN", (3, 0), (-1, -1), "CENTER"),
        ]
        # Alternate row coloring
        for r_idx in range(1, len(table_rows)):
            if r_idx % 2 == 0:
                exam_table_style.append(("BACKGROUND", (0, r_idx), (-1, r_idx), light_bg))
        exam_table.setStyle(TableStyle(exam_table_style))
        story.append(exam_table)
    else:
        no_exams_p = Paragraph("<i>No examination marks have been recorded for this student yet.</i>", body_style)
        story.append(no_exams_p)

    story.append(Spacer(1, 14))

    # 5. AUTOMATED PERFORMANCE ANALYTICS CARD
    source_type = analysis.get("source", "rule_based_fallback")
    if source_type == "gemini_ai":
        source_badge = "<font color='#2563EB'><b>[Automated Analysis: Google Gemini AI]</b></font>"
    else:
        source_badge = "<font color='#475569'><b>[Automated Analysis: Rule-Based Fallback Engine]</b></font>"

    analysis_heading = Paragraph(f"Performance Diagnostic & Insights &nbsp;&nbsp;{source_badge}", section_heading_style)
    story.append(analysis_heading)

    # Summary
    summary_text = analysis.get("summary", "Analysis unavailable.")
    summary_p = Paragraph(f"<b>Executive Summary:</b> {summary_text}", body_style)

    # Strengths
    strengths = analysis.get("key_strengths", [])
    strengths_paragraphs = [
        Paragraph(f"• <font color='#16A34A'><b>[Strength]</b></font> {s}", bullet_style)
        for s in strengths
    ]

    # Risks
    risks = analysis.get("risk_factors", [])
    risks_paragraphs = [
        Paragraph(f"• <font color='#DC2626'><b>[Risk Factor]</b></font> {r}", bullet_style)
        for r in risks
    ]

    # Recommendations
    recs = analysis.get("actionable_recommendations", [])
    recs_paragraphs = [
        Paragraph(f"<b>{idx + 1}.</b> {rc}", bullet_style)
        for idx, rc in enumerate(recs)
    ]

    # Assemble Analysis Card content
    analysis_flowables = [
        summary_p,
        Spacer(1, 6),
        Paragraph("<b>Key Observed Strengths:</b>", bold_label_style),
        Spacer(1, 2),
    ] + strengths_paragraphs + [
        Spacer(1, 6),
        Paragraph("<b>Identified Risk Factors:</b>", bold_label_style),
        Spacer(1, 2),
    ] + risks_paragraphs + [
        Spacer(1, 6),
        Paragraph("<b>Actionable Recommendations:</b>", bold_label_style),
        Spacer(1, 2),
    ] + recs_paragraphs

    analysis_card_table = Table([[analysis_flowables]], colWidths=[540])
    analysis_card_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), light_bg),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#CBD5E1")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))

    story.append(KeepTogether([analysis_card_table]))
    story.append(Spacer(1, 10))

    # FOOTER DISCLAIMER
    footer_text = Paragraph(
        "<i>This automated academic report is generated for institutional tracking and advisory guidance. "
        "Evaluations combine empirical grade distributions and predictive heuristics.</i>",
        subtitle_style,
    )
    story.append(footer_text)

    doc.build(story)
    buffer.seek(0)
    return buffer
