import re
from calendar import month_abbr, month_name
from datetime import date, datetime
from typing import Annotated, Optional

from pydantic import BaseModel, Field, field_validator


YEAR_FIELD_MAX_LENGTH = 10
TRAINING_NAME_MAX_LENGTH = 255

ShortText10 = Annotated[str, Field(max_length=10)]
ShortText50 = Annotated[str, Field(max_length=50)]
ShortText100 = Annotated[str, Field(max_length=100)]
ShortText150 = Annotated[str, Field(max_length=150)]
ShortText255 = Annotated[str, Field(max_length=255)]

OPTIONAL_PLACEHOLDER_VALUES = frozenset({"na", "n/a", "none", "not applicable", "null", "-", "--"})
MONTH_TOKEN_TO_ABBR = {
    **{name.casefold(): abbr for name, abbr in zip(month_name[1:], month_abbr[1:])},
    **{abbr.casefold(): abbr for abbr in month_abbr[1:]},
}
TRAINING_YEAR_PATTERN = re.compile(r"(?i)^([A-Za-z]+|\d{4})[\s/-]+([A-Za-z]+|\d{4})$")


class CandidateAssessmentUpsertIn(BaseModel):
    position_applied_for: Optional[ShortText150] = None
    current_employer: Optional[ShortText255] = None
    relevant_experience_years: Optional[float] = None
    architecture_interior_experience_years: Optional[float] = None
    personal_email: Optional[ShortText255] = None
    contact_number: Optional[ShortText50] = None
    current_employment_status: Optional[ShortText100] = None
    interviewer_name: Optional[ShortText150] = None
    notice_period_or_joining_time: Optional[ShortText100] = None
    notice_period_days: Optional[int] = None
    earliest_joining_date: Optional[date] = None
    current_ctc_annual: Optional[float] = None
    current_monthly_take_home: Optional[float] = None
    expected_ctc_annual: Optional[float] = None
    current_location: Optional[ShortText100] = None
    reason_for_job_change: Optional[str] = None

    current_job_duration_months: Optional[int] = None
    current_job_org_name: Optional[ShortText255] = None
    current_job_role_responsibilities: Optional[str] = None
    previous_job_duration_months: Optional[int] = None
    previous_job_org_name: Optional[ShortText255] = None
    previous_job_role_responsibilities: Optional[str] = None

    education_10th_specialization: Optional[ShortText150] = None
    education_10th_year: Optional[ShortText10] = None
    education_10th_institution: Optional[ShortText255] = None
    education_10th_marks: Optional[ShortText50] = None
    education_12th_specialization: Optional[ShortText150] = None
    education_12th_year: Optional[ShortText10] = None
    education_12th_institution: Optional[ShortText255] = None
    education_12th_marks: Optional[ShortText50] = None
    education_graduation_specialization: Optional[ShortText150] = None
    education_graduation_year: Optional[ShortText10] = None
    education_graduation_institution: Optional[ShortText255] = None
    education_graduation_marks: Optional[ShortText50] = None
    education_post_graduation_specialization: Optional[ShortText150] = None
    education_post_graduation_year: Optional[ShortText10] = None
    education_post_graduation_institution: Optional[ShortText255] = None
    education_post_graduation_marks: Optional[ShortText50] = None

    training1_name: Optional[ShortText255] = Field(default=None, max_length=TRAINING_NAME_MAX_LENGTH)
    training1_year: Optional[ShortText10] = None
    training1_institute: Optional[ShortText255] = None
    training2_name: Optional[ShortText255] = Field(default=None, max_length=TRAINING_NAME_MAX_LENGTH)
    training2_year: Optional[ShortText10] = None
    training2_institute: Optional[ShortText255] = None

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

    reference1_name: Optional[ShortText150] = None
    reference1_contact: Optional[ShortText50] = None
    reference1_relationship: Optional[ShortText255] = None
    reference2_name: Optional[ShortText150] = None
    reference2_contact: Optional[ShortText50] = None
    reference2_relationship: Optional[ShortText255] = None

    declaration_name: Optional[ShortText150] = None
    declaration_signature: Optional[ShortText150] = None
    declaration_date: Optional[date] = None
    declaration_accepted: Optional[bool] = None

    @field_validator(
        "education_post_graduation_specialization",
        "education_post_graduation_year",
        "education_post_graduation_institution",
        "education_post_graduation_marks",
        "training1_name",
        "training1_year",
        "training1_institute",
        "training2_name",
        "training2_year",
        "training2_institute",
        mode="before",
    )
    @classmethod
    def normalize_optional_placeholder_values(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        if not cleaned:
            return None
        if cleaned.casefold() in OPTIONAL_PLACEHOLDER_VALUES:
            return None
        return cleaned

    @field_validator("training1_year", "training2_year", mode="before")
    @classmethod
    def normalize_training_year(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        if not cleaned:
            return None
        match = TRAINING_YEAR_PATTERN.fullmatch(cleaned)
        if not match:
            return cleaned
        left, right = match.groups()
        if left.isdigit() and len(left) == 4:
            year, month_token = left, right
        elif right.isdigit() and len(right) == 4:
            month_token, year = left, right
        else:
            return cleaned
        month = MONTH_TOKEN_TO_ABBR.get(month_token.casefold().rstrip("."))
        if month is None:
            return cleaned
        return f"{month} {year}"


class CandidateAssessmentOut(BaseModel):
    candidate_id: int
    candidate_assessment_form_token: Optional[str] = None
    candidate_assessment_form_sent_at: Optional[datetime] = None
    candidate_assessment_form_submitted_at: Optional[datetime] = None
    assessment_token: Optional[str] = None
    assessment_sent_at: Optional[datetime] = None
    assessment_submitted_at: Optional[datetime] = None

    position_applied_for: Optional[str] = None
    current_employer: Optional[str] = None
    relevant_experience_years: Optional[float] = None
    architecture_interior_experience_years: Optional[float] = None
    personal_email: Optional[str] = None
    contact_number: Optional[str] = None
    current_employment_status: Optional[str] = None
    interviewer_name: Optional[str] = None
    notice_period_or_joining_time: Optional[str] = None
    notice_period_days: Optional[int] = None
    earliest_joining_date: Optional[date] = None
    current_ctc_annual: Optional[float] = None
    current_monthly_take_home: Optional[float] = None
    expected_ctc_annual: Optional[float] = None
    current_location: Optional[str] = None
    reason_for_job_change: Optional[str] = None

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

    training1_name: Optional[str] = Field(default=None, max_length=TRAINING_NAME_MAX_LENGTH)
    training1_year: Optional[str] = None
    training1_institute: Optional[str] = None
    training2_name: Optional[str] = Field(default=None, max_length=TRAINING_NAME_MAX_LENGTH)
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
    candidate_assessment_form_sent_at: Optional[datetime] = None
    candidate_assessment_form_submitted_at: Optional[datetime] = None
    assessment_sent_at: Optional[datetime] = None
    assessment_submitted_at: Optional[datetime] = None
    opening_id: Optional[int] = None
    opening_title: Optional[str] = None
    opening_description: Optional[str] = None
