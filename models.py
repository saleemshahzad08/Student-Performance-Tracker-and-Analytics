"""
Database models and SQLAlchemy configuration for Student Performance Tracking system.
"""

from datetime import datetime
from typing import Generator
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    Date,
    ForeignKey,
    UniqueConstraint,
    Text,
    event,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.engine import Engine

DATABASE_URL = "sqlite:///./students.db"

# Enable SQLite foreign key enforcement
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    roll_no = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    student_phone = Column(String(64), nullable=True)
    parent_name = Column(String(255), nullable=True)
    parent_phone = Column(String(64), nullable=True)
    email = Column(String(255), nullable=True)
    section = Column(String(64), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    marks = relationship("Mark", back_populates="student", cascade="all, delete-orphan")
    attendance_records = relationship("Attendance", back_populates="student", cascade="all, delete-orphan")
    call_logs = relationship("CallLog", back_populates="student", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "roll_no": self.roll_no,
            "name": self.name,
            "student_phone": self.student_phone or "",
            "parent_name": self.parent_name or "",
            "parent_phone": self.parent_phone or "",
            "email": self.email or "",
            "section": self.section,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class CallLog(Base):
    __tablename__ = "call_logs"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    contact_person = Column(String(64), nullable=False) # "Student" or "Parent/Guardian"
    contact_name = Column(String(255), nullable=True)
    phone_number = Column(String(64), nullable=True)
    call_datetime = Column(String(64), nullable=False)
    subject = Column(String(255), nullable=False)
    summary = Column(Text, nullable=False)
    outcome = Column(String(64), default="Connected & Discussed")
    duration_minutes = Column(Integer, default=5)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    student = relationship("Student", back_populates="call_logs")

    def to_dict(self):
        return {
            "id": self.id,
            "student_id": self.student_id,
            "contact_person": self.contact_person,
            "contact_name": self.contact_name,
            "phone_number": self.phone_number,
            "call_datetime": self.call_datetime,
            "subject": self.subject,
            "summary": self.summary,
            "outcome": self.outcome,
            "duration_minutes": self.duration_minutes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=False)
    total_marks = Column(Float, nullable=False)
    date = Column(String(32), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    marks = relationship("Mark", back_populates="exam", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "subject": self.subject,
            "total_marks": self.total_marks,
            "date": self.date,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Mark(Base):
    __tablename__ = "marks"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    marks_obtained = Column(Float, nullable=False)

    __table_args__ = (
        UniqueConstraint("student_id", "exam_id", name="uq_student_exam"),
    )

    # Relationships
    student = relationship("Student", back_populates="marks")
    exam = relationship("Exam", back_populates="marks")

    def to_dict(self):
        return {
            "id": self.id,
            "student_id": self.student_id,
            "exam_id": self.exam_id,
            "marks_obtained": self.marks_obtained,
        }


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    date = Column(String(32), nullable=False)  # ISO format YYYY-MM-DD
    is_present = Column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint("student_id", "date", name="uq_student_date"),
    )

    # Relationships
    student = relationship("Student", back_populates="attendance_records")

    def to_dict(self):
        return {
            "id": self.id,
            "student_id": self.student_id,
            "date": self.date,
            "is_present": self.is_present,
        }


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
