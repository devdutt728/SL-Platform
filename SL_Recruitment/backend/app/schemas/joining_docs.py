from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator


class JoiningDocOut(BaseModel):
    joining_doc_id: int
    candidate_id: int
    doc_type: str
    file_name: str
    content_type: Optional[str] = None
    uploaded_by: str
    uploaded_by_person_id_platform: Optional[int] = None
    created_at: datetime
    file_url: str

    class Config:
        from_attributes = True


class JoiningDocPublicOut(BaseModel):
    joining_doc_id: int
    doc_type: str
    file_name: str
    uploaded_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class JoiningDocsPublicContext(BaseModel):
    candidate_id: int
    candidate_name: str
    opening_title: str | None = None
    joining_docs_status: str
    required_doc_types: list[str]
    profile: "JoiningProfilePublicOut | None" = None
    docs: list[JoiningDocPublicOut]


class JoiningProfileBase(BaseModel):
    personal_id: Optional[str] = None
    middle_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    marriage_date: Optional[date] = None
    blood_group: Optional[str] = None
    physically_handicapped: Optional[str] = None
    nationality: Optional[str] = None
    mobile_number: Optional[str] = None
    personal_email: Optional[EmailStr] = None
    current_address_line_1: Optional[str] = None
    current_address_line_2: Optional[str] = None
    current_address_city: Optional[str] = None
    current_address_state: Optional[str] = None
    current_address_zip: Optional[str] = None
    current_address_country: Optional[str] = None
    permanent_address_line_1: Optional[str] = None
    permanent_address_line_2: Optional[str] = None
    permanent_address_city: Optional[str] = None
    permanent_address_state: Optional[str] = None
    permanent_address_zip: Optional[str] = None
    permanent_address_country: Optional[str] = None
    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    spouse_name: Optional[str] = None
    children_names: Optional[str] = None
    aadhaar_number: Optional[str] = None
    pf_number: Optional[str] = None
    uan_number: Optional[str] = None

    @field_validator(
        "personal_id",
        "middle_name",
        "gender",
        "marital_status",
        "blood_group",
        "physically_handicapped",
        "nationality",
        "mobile_number",
        "current_address_line_1",
        "current_address_line_2",
        "current_address_city",
        "current_address_state",
        "current_address_zip",
        "current_address_country",
        "permanent_address_line_1",
        "permanent_address_line_2",
        "permanent_address_city",
        "permanent_address_state",
        "permanent_address_zip",
        "permanent_address_country",
        "father_name",
        "mother_name",
        "spouse_name",
        "children_names",
        "aadhaar_number",
        "pf_number",
        "uan_number",
        mode="before",
    )
    @classmethod
    def _strip_optional_text(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class JoiningProfilePublicIn(JoiningProfileBase):
    pass


class JoiningProfileReviewIn(BaseModel):
    pan_verified: Optional[bool] = None
    aadhaar_verified: Optional[bool] = None


class JoiningProfileInternalUpsertIn(JoiningProfileBase):
    pan_verified: Optional[bool] = None
    aadhaar_verified: Optional[bool] = None


class JoiningProfileOut(JoiningProfileBase):
    candidate_id: int
    profile_status: str
    pan_verified: bool
    aadhaar_verified: bool
    submitted_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class JoiningProfilePublicOut(JoiningProfileBase):
    profile_status: str = "draft"
    submitted_at: Optional[datetime] = None


JoiningDocsPublicContext.model_rebuild()
