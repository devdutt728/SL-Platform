from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class CandidateAssessmentUpsertIn(BaseModel):
    position_applied_for: Optional[str] = None
    total_experience_years: Optional[float] = None
    architecture_interior_experience_years: Optional[float] = None
    personal_email: Optional[str] = None
    contact_number: Optional[str] = None
    current_employment_status: Optional[str] = None
    interviewer_name: Optional[str] = None
    notice_period_or_joining_time: Optional[str] = None
    current_location: Optional[str] = None

    current_job_duration_months: Optional[int] = None
    current_job_org_name: Optional[str] = None
    current_job_role_responsibilities: Optional[str] = None
    previous_job_duration_months: Optional[int] = None
    previous_job_org_name: Optional[str] = None
    previous_job_role_responsibilities: Optional[str] = None

    education_10th_specialization: Optional[str] = None
    education_10th_year: Optional[str] = None
    education_10th_institution: Optional[str] = None
    education_10th_marks: Optional[str] = None
    education_12th_specialization: Optional[str] = None
    education_12th_year: Optional[str] = None
    education_12th_institution: Optional[str] = None
    education_12th_marks: Optional[str] = None
    education_graduation_specialization: Optional[str] = None
    education_graduation_year: Optional[str] = None
    education_graduation_institution: Optional[str] = None
    education_graduation_marks: Optional[str] = None
    education_post_graduation_specialization: Optional[str] = None
    education_post_graduation_year: Optional[str] = None
    education_post_graduation_institution: Optional[str] = None
    education_post_graduation_marks: Optional[str] = None

    training1_name: Optional[str] = None
    training1_year: Optional[str] = None
    training1_institute: Optional[str] = None
    training2_name: Optional[str] = None
    training2_year: Optional[str] = None
    training2_institute: Optional[str] = None

    skill_auto_cad: Optional[int] = None
    skill_sketch_up: Optional[int] = None
    skill_revit: Optional[int] = None
    skill_photoshop: Optional[int] = None
    skill_illustrator: Optional[int] = None
    skill_ms_office: Optional[int] = None
    skill_3d_max: Optional[int] = None
    skill_indesign: Optional[int] = None
    skill_presentation: Optional[int] = None
    skill_rhino: Optional[int] = None
    skill_boqs: Optional[int] = None
    skill_analytical_writing: Optional[int] = None
    skill_graphics: Optional[int] = None
    skill_drafting: Optional[int] = None
    skill_hand_sketching: Optional[int] = None
    skill_estimation: Optional[int] = None
    skill_specifications: Optional[int] = None
    skill_enscape: Optional[int] = None

    proficiency_execution_action_orientation: Optional[int] = None
    proficiency_execution_self_discipline: Optional[int] = None
    proficiency_execution_independent_decision: Optional[int] = None
    proficiency_process_time_management: Optional[int] = None
    proficiency_process_following_processes: Optional[int] = None
    proficiency_process_new_processes: Optional[int] = None
    proficiency_strategic_long_term_thinking: Optional[int] = None
    proficiency_strategic_ideation_creativity: Optional[int] = None
    proficiency_strategic_risk_taking: Optional[int] = None
    proficiency_people_collaboration: Optional[int] = None
    proficiency_people_coaching: Optional[int] = None
    proficiency_people_feedback: Optional[int] = None
    proficiency_people_conflict_resolution: Optional[int] = None

    proficiency_reason_execution: Optional[str] = None
    proficiency_reason_process: Optional[str] = None
    proficiency_reason_strategic: Optional[str] = None
    proficiency_reason_people: Optional[str] = None

    self_strengths: Optional[str] = None
    self_improvement_areas: Optional[str] = None
    self_learning_needs: Optional[str] = None

    q1_why_studio_lotus: Optional[str] = None
    q2_project_scale: Optional[str] = None
    q3_role_site_experience: Optional[str] = None
    q4_inspired_project: Optional[str] = None
    q5_two_year_plan: Optional[str] = None

    reference1_name: Optional[str] = None
    reference1_contact: Optional[str] = None
    reference1_relationship: Optional[str] = None
    reference2_name: Optional[str] = None
    reference2_contact: Optional[str] = None
    reference2_relationship: Optional[str] = None

    declaration_name: Optional[str] = None
    declaration_signature: Optional[str] = None
    declaration_date: Optional[date] = None
    declaration_accepted: Optional[bool] = None


class CandidateAssessmentOut(BaseModel):
    candidate_id: int
    assessment_token: Optional[str] = None
    assessment_sent_at: Optional[datetime] = None
    assessment_submitted_at: Optional[datetime] = None

    position_applied_for: Optional[str] = None
    total_experience_years: Optional[float] = None
    architecture_interior_experience_years: Optional[float] = None
    personal_email: Optional[str] = None
    contact_number: Optional[str] = None
    current_employment_status: Optional[str] = None
    interviewer_name: Optional[str] = None
    notice_period_or_joining_time: Optional[str] = None
    current_location: Optional[str] = None

    current_job_duration_months: Optional[int] = None
    current_job_org_name: Optional[str] = None
    current_job_role_responsibilities: Optional[str] = None
    previous_job_duration_months: Optional[int] = None
    previous_job_org_name: Optional[str] = None
    previous_job_role_responsibilities: Optional[str] = None

    education_10th_specialization: Optional[str] = None
    education_10th_year: Optional[str] = None
    education_10th_institution: Optional[str] = None
    education_10th_marks: Optional[str] = None
    education_12th_specialization: Optional[str] = None
    education_12th_year: Optional[str] = None
    education_12th_institution: Optional[str] = None
    education_12th_marks: Optional[str] = None
    education_graduation_specialization: Optional[str] = None
    education_graduation_year: Optional[str] = None
    education_graduation_institution: Optional[str] = None
    education_graduation_marks: Optional[str] = None
    education_post_graduation_specialization: Optional[str] = None
    education_post_graduation_year: Optional[str] = None
    education_post_graduation_institution: Optional[str] = None
    education_post_graduation_marks: Optional[str] = None

    training1_name: Optional[str] = None
    training1_year: Optional[str] = None
    training1_institute: Optional[str] = None
    training2_name: Optional[str] = None
    training2_year: Optional[str] = None
    training2_institute: Optional[str] = None

    skill_auto_cad: Optional[int] = None
    skill_sketch_up: Optional[int] = None
    skill_revit: Optional[int] = None
    skill_photoshop: Optional[int] = None
    skill_illustrator: Optional[int] = None
    skill_ms_office: Optional[int] = None
    skill_3d_max: Optional[int] = None
    skill_indesign: Optional[int] = None
    skill_presentation: Optional[int] = None
    skill_rhino: Optional[int] = None
    skill_boqs: Optional[int] = None
    skill_analytical_writing: Optional[int] = None
    skill_graphics: Optional[int] = None
    skill_drafting: Optional[int] = None
    skill_hand_sketching: Optional[int] = None
    skill_estimation: Optional[int] = None
    skill_specifications: Optional[int] = None
    skill_enscape: Optional[int] = None

    proficiency_execution_action_orientation: Optional[int] = None
    proficiency_execution_self_discipline: Optional[int] = None
    proficiency_execution_independent_decision: Optional[int] = None
    proficiency_process_time_management: Optional[int] = None
    proficiency_process_following_processes: Optional[int] = None
    proficiency_process_new_processes: Optional[int] = None
    proficiency_strategic_long_term_thinking: Optional[int] = None
    proficiency_strategic_ideation_creativity: Optional[int] = None
    proficiency_strategic_risk_taking: Optional[int] = None
    proficiency_people_collaboration: Optional[int] = None
    proficiency_people_coaching: Optional[int] = None
    proficiency_people_feedback: Optional[int] = None
    proficiency_people_conflict_resolution: Optional[int] = None

    proficiency_reason_execution: Optional[str] = None
    proficiency_reason_process: Optional[str] = None
    proficiency_reason_strategic: Optional[str] = None
    proficiency_reason_people: Optional[str] = None

    self_strengths: Optional[str] = None
    self_improvement_areas: Optional[str] = None
    self_learning_needs: Optional[str] = None

    q1_why_studio_lotus: Optional[str] = None
    q2_project_scale: Optional[str] = None
    q3_role_site_experience: Optional[str] = None
    q4_inspired_project: Optional[str] = None
    q5_two_year_plan: Optional[str] = None

    reference1_name: Optional[str] = None
    reference1_contact: Optional[str] = None
    reference1_relationship: Optional[str] = None
    reference2_name: Optional[str] = None
    reference2_contact: Optional[str] = None
    reference2_relationship: Optional[str] = None

    declaration_name: Optional[str] = None
    declaration_signature: Optional[str] = None
    declaration_date: Optional[date] = None
    declaration_accepted: Optional[bool] = None

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CandidateAssessmentPrefillOut(BaseModel):
    candidate_id: int
    candidate_code: str
    name: str
    email: str
    phone: Optional[str] = None
    assessment_sent_at: Optional[datetime] = None
    assessment_submitted_at: Optional[datetime] = None
    opening_id: Optional[int] = None
    opening_title: Optional[str] = None
    opening_description: Optional[str] = None
