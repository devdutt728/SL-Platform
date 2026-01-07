from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class OfferCreateIn(BaseModel):
    offer_template_code: str
    gross_ctc_annual: float | None = None
    fixed_ctc_annual: float | None = None
    variable_ctc_annual: float | None = None
    currency: str | None = "INR"
    designation_title: str | None = None
    grade_id_platform: int | None = None
    joining_date: date | None = None
    probation_months: int | None = None
    offer_valid_until: date | None = None
    notes_internal: str | None = None


class OfferUpdateIn(BaseModel):
    offer_template_code: str | None = None
    gross_ctc_annual: float | None = None
    fixed_ctc_annual: float | None = None
    variable_ctc_annual: float | None = None
    currency: str | None = None
    designation_title: str | None = None
    grade_id_platform: int | None = None
    joining_date: date | None = None
    probation_months: int | None = None
    offer_valid_until: date | None = None
    notes_internal: str | None = None
    submit_for_approval: bool | None = None


class OfferOut(BaseModel):
    candidate_offer_id: int
    candidate_id: int
    opening_id: int | None = None
    offer_template_code: str
    offer_version: int
    gross_ctc_annual: float | None = None
    fixed_ctc_annual: float | None = None
    variable_ctc_annual: float | None = None
    currency: str | None = None
    designation_title: str | None = None
    grade_id_platform: int | None = None
    joining_date: date | None = None
    probation_months: int | None = None
    offer_valid_until: date | None = None
    offer_status: str
    public_token: str
    generated_by_person_id_platform: int | None = None
    generated_at: datetime | None = None
    approved_by_person_id_platform: int | None = None
    approved_at: datetime | None = None
    sent_at: datetime | None = None
    viewed_at: datetime | None = None
    accepted_at: datetime | None = None
    declined_at: datetime | None = None
    pdf_url: str | None = None
    pdf_download_url: str | None = None
    notes_internal: str | None = None
    created_at: datetime
    updated_at: datetime

    candidate_name: Optional[str] = None
    candidate_code: Optional[str] = None
    opening_title: Optional[str] = None

    class Config:
        from_attributes = True


class OfferPublicOut(BaseModel):
    candidate_name: str | None = None
    candidate_code: str | None = None
    opening_title: str | None = None
    designation_title: str | None = None
    gross_ctc_annual: float | None = None
    fixed_ctc_annual: float | None = None
    variable_ctc_annual: float | None = None
    currency: str | None = None
    joining_date: date | None = None
    probation_months: int | None = None
    offer_valid_until: date | None = None
    offer_status: str
    pdf_url: str | None = None
    pdf_download_url: str | None = None


class OfferDecisionIn(BaseModel):
    decision: str
    reason: str | None = None
