from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.datetime_utils import now_ist_naive
from app.db.base import Base


class RecCandidateAssessment(Base):
    __tablename__ = "rec_candidate_assessment"

    candidate_assessment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)

    assessment_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    assessment_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    assessment_submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    position_applied_for: Mapped[str | None] = mapped_column(String(150), nullable=True)
    relevant_experience_years: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    architecture_interior_experience_years: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    current_employer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    personal_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    current_employment_status: Mapped[str | None] = mapped_column(String(100), nullable=True)
    interviewer_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    notice_period_or_joining_time: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notice_period_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_ctc_annual: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    expected_ctc_annual: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    current_location: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reason_for_job_change: Mapped[str | None] = mapped_column(Text, nullable=True)

    current_job_duration_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_job_org_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_job_role_responsibilities: Mapped[str | None] = mapped_column(Text, nullable=True)
    previous_job_duration_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    previous_job_org_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    previous_job_role_responsibilities: Mapped[str | None] = mapped_column(Text, nullable=True)

    education_10th_specialization: Mapped[str | None] = mapped_column(String(150), nullable=True)
    education_10th_year: Mapped[str | None] = mapped_column(String(10), nullable=True)
    education_10th_institution: Mapped[str | None] = mapped_column(String(255), nullable=True)
    education_10th_marks: Mapped[str | None] = mapped_column(String(50), nullable=True)
    education_12th_specialization: Mapped[str | None] = mapped_column(String(150), nullable=True)
    education_12th_year: Mapped[str | None] = mapped_column(String(10), nullable=True)
    education_12th_institution: Mapped[str | None] = mapped_column(String(255), nullable=True)
    education_12th_marks: Mapped[str | None] = mapped_column(String(50), nullable=True)
    education_graduation_specialization: Mapped[str | None] = mapped_column(String(150), nullable=True)
    education_graduation_year: Mapped[str | None] = mapped_column(String(10), nullable=True)
    education_graduation_institution: Mapped[str | None] = mapped_column(String(255), nullable=True)
    education_graduation_marks: Mapped[str | None] = mapped_column(String(50), nullable=True)
    education_post_graduation_specialization: Mapped[str | None] = mapped_column(String(150), nullable=True)
    education_post_graduation_year: Mapped[str | None] = mapped_column(String(10), nullable=True)
    education_post_graduation_institution: Mapped[str | None] = mapped_column(String(255), nullable=True)
    education_post_graduation_marks: Mapped[str | None] = mapped_column(String(50), nullable=True)

    training1_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    training1_year: Mapped[str | None] = mapped_column(String(10), nullable=True)
    training1_institute: Mapped[str | None] = mapped_column(String(255), nullable=True)
    training2_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    training2_year: Mapped[str | None] = mapped_column(String(10), nullable=True)
    training2_institute: Mapped[str | None] = mapped_column(String(255), nullable=True)

    skill_auto_cad: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_sketch_up: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_revit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_photoshop: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_illustrator: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_ms_office: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_3d_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_indesign: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_presentation: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_rhino: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_boqs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_analytical_writing: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_graphics: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_drafting: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_hand_sketching: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_estimation: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_specifications: Mapped[int | None] = mapped_column(Integer, nullable=True)
    skill_enscape: Mapped[int | None] = mapped_column(Integer, nullable=True)

    proficiency_execution_action_orientation: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proficiency_execution_self_discipline: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proficiency_execution_independent_decision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proficiency_process_time_management: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proficiency_process_following_processes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proficiency_process_new_processes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proficiency_strategic_long_term_thinking: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proficiency_strategic_ideation_creativity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proficiency_strategic_risk_taking: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proficiency_people_collaboration: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proficiency_people_coaching: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proficiency_people_feedback: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proficiency_people_conflict_resolution: Mapped[int | None] = mapped_column(Integer, nullable=True)

    proficiency_reason_execution: Mapped[str | None] = mapped_column(Text, nullable=True)
    proficiency_reason_process: Mapped[str | None] = mapped_column(Text, nullable=True)
    proficiency_reason_strategic: Mapped[str | None] = mapped_column(Text, nullable=True)
    proficiency_reason_people: Mapped[str | None] = mapped_column(Text, nullable=True)

    self_strengths: Mapped[str | None] = mapped_column(Text, nullable=True)
    self_improvement_areas: Mapped[str | None] = mapped_column(Text, nullable=True)
    self_learning_needs: Mapped[str | None] = mapped_column(Text, nullable=True)

    q1_why_studio_lotus: Mapped[str | None] = mapped_column(Text, nullable=True)
    q2_project_scale: Mapped[str | None] = mapped_column(Text, nullable=True)
    q3_role_site_experience: Mapped[str | None] = mapped_column(Text, nullable=True)
    q4_inspired_project: Mapped[str | None] = mapped_column(Text, nullable=True)
    q5_two_year_plan: Mapped[str | None] = mapped_column(Text, nullable=True)

    reference1_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    reference1_contact: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reference1_relationship: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reference2_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    reference2_contact: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reference2_relationship: Mapped[str | None] = mapped_column(String(255), nullable=True)

    declaration_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    declaration_signature: Mapped[str | None] = mapped_column(String(150), nullable=True)
    declaration_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    declaration_accepted: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive, onupdate=now_ist_naive)
