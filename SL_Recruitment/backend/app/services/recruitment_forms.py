from __future__ import annotations

from datetime import datetime

from app.models.candidate import RecCandidate
from app.models.candidate_assessment import RecCandidateAssessment
from app.services.public_links import build_public_link, build_public_path

LEGACY_BASIC_DETAILS_FORM_LINK_GENERATED = "caf_link_generated"
LEGACY_BASIC_DETAILS_FORM_SUBMITTED = "caf_submitted"
LEGACY_BASIC_DETAILS_FORM_REMINDER_SENT = "caf_reminder"
LEGACY_CANDIDATE_ASSESSMENT_FORM_LINK_GENERATED = "assessment_link_generated"
LEGACY_CANDIDATE_ASSESSMENT_FORM_SUBMITTED = "candidate_assessment_submitted"

BASIC_DETAILS_FORM_LINK_GENERATED = "basic_details_form_link_generated"
BASIC_DETAILS_FORM_SUBMITTED = "basic_details_form_submitted"
BASIC_DETAILS_FORM_REMINDER_SENT = "basic_details_form_reminder_sent"
CANDIDATE_ASSESSMENT_FORM_LINK_GENERATED = "candidate_assessment_form_link_generated"
CANDIDATE_ASSESSMENT_FORM_SUBMITTED = "candidate_assessment_form_submitted"

BASIC_DETAILS_COMMUNICATION_ACTION_TYPES = {
    LEGACY_BASIC_DETAILS_FORM_LINK_GENERATED,
    BASIC_DETAILS_FORM_LINK_GENERATED,
}
CANDIDATE_ASSESSMENT_COMMUNICATION_ACTION_TYPES = {
    LEGACY_CANDIDATE_ASSESSMENT_FORM_LINK_GENERATED,
    CANDIDATE_ASSESSMENT_FORM_LINK_GENERATED,
}


def basic_details_form_token_filter(token: str):
    return RecCandidate.basic_details_form_token == token


def candidate_assessment_form_token_filter(token: str):
    return RecCandidateAssessment.candidate_assessment_form_token == token


def get_basic_details_form_token(candidate: RecCandidate) -> str | None:
    return candidate.basic_details_form_token


def get_basic_details_form_sent_at(candidate: RecCandidate) -> datetime | None:
    return candidate.basic_details_form_sent_at


def get_basic_details_form_submitted_at(candidate: RecCandidate) -> datetime | None:
    return candidate.basic_details_form_submitted_at


def set_basic_details_form_token(candidate: RecCandidate, value: str | None) -> None:
    candidate.basic_details_form_token = value


def set_basic_details_form_sent_at(candidate: RecCandidate, value: datetime | None) -> None:
    candidate.basic_details_form_sent_at = value


def set_basic_details_form_submitted_at(candidate: RecCandidate, value: datetime | None) -> None:
    candidate.basic_details_form_submitted_at = value


def sync_basic_details_form_fields(candidate: RecCandidate) -> None:
    return None


def get_candidate_assessment_form_token(assessment: RecCandidateAssessment) -> str | None:
    return assessment.candidate_assessment_form_token


def get_candidate_assessment_form_sent_at(assessment: RecCandidateAssessment) -> datetime | None:
    return assessment.candidate_assessment_form_sent_at


def get_candidate_assessment_form_submitted_at(assessment: RecCandidateAssessment) -> datetime | None:
    return assessment.candidate_assessment_form_submitted_at


def set_candidate_assessment_form_token(assessment: RecCandidateAssessment, value: str | None) -> None:
    assessment.candidate_assessment_form_token = value


def set_candidate_assessment_form_sent_at(assessment: RecCandidateAssessment, value: datetime | None) -> None:
    assessment.candidate_assessment_form_sent_at = value


def set_candidate_assessment_form_submitted_at(assessment: RecCandidateAssessment, value: datetime | None) -> None:
    assessment.candidate_assessment_form_submitted_at = value


def sync_candidate_assessment_form_fields(assessment: RecCandidateAssessment) -> None:
    return None


def build_basic_details_form_path(token: str) -> str:
    return build_public_path(f"/basic-details/{token}")


def build_basic_details_form_link(token: str) -> str:
    return build_public_link(f"/basic-details/{token}")


def build_candidate_assessment_form_path(token: str) -> str:
    return build_public_path(f"/candidate-assessment-form/{token}")


def build_candidate_assessment_form_link(token: str) -> str:
    return build_public_link(f"/candidate-assessment-form/{token}")
