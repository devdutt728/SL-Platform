from __future__ import annotations

import csv
from datetime import date, datetime, timedelta
from decimal import Decimal
from io import StringIO
from typing import Callable, Iterable

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.api import deps
from app.core.auth import require_roles
from app.core.roles import Role
from app.models.candidate import RecCandidate
from app.models.candidate_offer import RecCandidateOffer
from app.models.candidate_sprint import RecCandidateSprint
from app.models.interview import RecCandidateInterview
from app.models.opening import RecOpening
from app.models.sprint_template import RecSprintTemplate

router = APIRouter(prefix="/rec/reports", tags=["reports"])

MAX_PREVIEW_LIMIT = 200
MAX_DOWNLOAD_LIMIT = 10000


def _titleize(value: str) -> str:
    return value.replace("_", " ").strip().title()


def _parse_datetime(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format.") from exc


def _expand_end_of_day(raw: str | None, value: datetime | None) -> datetime | None:
    if not raw or value is None:
        return value
    if len(raw) == 10:
        return value + timedelta(days=1) - timedelta(microseconds=1)
    return value


def _csv_safe(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, Decimal):
        return format(value, "f")
    text = str(value)
    if text and text[0] in "=+-@\t":
        return f"'{text}"
    return text


def _apply_filters(
    stmt: Select,
    *,
    date_field,
    date_from: datetime | None,
    date_to: datetime | None,
    opening_field,
    opening_id: int | None,
    status_field,
    status_value: str | None,
    active_field,
    is_active: int | None,
) -> Select:
    if date_field is not None and date_from is not None:
        stmt = stmt.where(date_field >= date_from)
    if date_field is not None and date_to is not None:
        stmt = stmt.where(date_field <= date_to)
    if opening_field is not None and opening_id is not None:
        stmt = stmt.where(opening_field == opening_id)
    if status_field is not None and status_value:
        stmt = stmt.where(status_field == status_value)
    if active_field is not None and is_active is not None:
        stmt = stmt.where(active_field == is_active)
    return stmt


def _apply_joins(stmt: Select, joins: Iterable[Callable[[Select], Select]]) -> Select:
    for join in joins:
        stmt = join(stmt)
    return stmt


def _join_candidate_opening(stmt: Select) -> Select:
    return stmt.outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)


def _join_offer_context(stmt: Select) -> Select:
    return (
        stmt.outerjoin(RecCandidate, RecCandidate.candidate_id == RecCandidateOffer.candidate_id)
        .outerjoin(RecOpening, RecOpening.opening_id == RecCandidateOffer.opening_id)
    )


def _join_interview_context(stmt: Select) -> Select:
    return (
        stmt.outerjoin(RecCandidate, RecCandidate.candidate_id == RecCandidateInterview.candidate_id)
        .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
    )


def _join_sprint_context(stmt: Select) -> Select:
    return (
        stmt.outerjoin(RecCandidate, RecCandidate.candidate_id == RecCandidateSprint.candidate_id)
        .outerjoin(RecSprintTemplate, RecSprintTemplate.sprint_template_id == RecCandidateSprint.sprint_template_id)
        .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
    )


REPORTS = {
    "candidates": {
        "label": "Candidates",
        "description": "Full candidate pipeline data and sourcing details.",
        "base": RecCandidate,
        "joins": [_join_candidate_opening],
        "date_field": RecCandidate.created_at,
        "opening_field": RecCandidate.opening_id,
        "status_field": RecCandidate.status,
        "active_field": None,
        "order_by": RecCandidate.created_at.desc(),
        "columns": {
            "candidate_id": RecCandidate.candidate_id,
            "candidate_code": RecCandidate.candidate_code,
            "first_name": RecCandidate.first_name,
            "last_name": RecCandidate.last_name,
            "full_name": RecCandidate.full_name,
            "email": RecCandidate.email,
            "phone": RecCandidate.phone,
            "opening_id": RecCandidate.opening_id,
            "opening_code": RecOpening.opening_code,
            "opening_title": RecOpening.title,
            "source_channel": RecCandidate.source_channel,
            "current_location": RecCandidate.current_location,
            "current_company": RecCandidate.current_company,
            "status": RecCandidate.status,
            "final_decision": RecCandidate.final_decision,
            "cv_url": RecCandidate.cv_url,
            "portfolio_url": RecCandidate.portfolio_url,
            "portfolio_not_uploaded_reason": RecCandidate.portfolio_not_uploaded_reason,
            "linkedin_url": RecCandidate.linkedin_url,
            "owner_person_id_platform": RecCandidate.owner_person_id_platform,
            "hired_person_id_platform": RecCandidate.hired_person_id_platform,
            "drive_folder_id": RecCandidate.drive_folder_id,
            "drive_folder_url": RecCandidate.drive_folder_url,
            "caf_token": RecCandidate.caf_token,
            "caf_sent_at": RecCandidate.caf_sent_at,
            "caf_submitted_at": RecCandidate.caf_submitted_at,
            "needs_hr_review": RecCandidate.needs_hr_review,
            "application_docs_status": RecCandidate.application_docs_status,
            "joining_docs_status": RecCandidate.joining_docs_status,
            "created_at": RecCandidate.created_at,
            "updated_at": RecCandidate.updated_at,
            "archived_at": RecCandidate.archived_at,
        },
        "default_columns": [
            "candidate_code",
            "full_name",
            "email",
            "opening_title",
            "status",
            "needs_hr_review",
            "created_at",
        ],
    },
    "openings": {
        "label": "Openings",
        "description": "Role demand and opening metadata.",
        "base": RecOpening,
        "joins": [],
        "date_field": RecOpening.created_at,
        "opening_field": None,
        "status_field": None,
        "active_field": RecOpening.is_active,
        "order_by": RecOpening.created_at.desc(),
        "columns": {
            "opening_id": RecOpening.opening_id,
            "opening_code": RecOpening.opening_code,
            "title": RecOpening.title,
            "description": RecOpening.description,
            "location_city": RecOpening.location_city,
            "location_country": RecOpening.location_country,
            "practice_id_platform": RecOpening.practice_id_platform,
            "department_id_platform": RecOpening.department_id_platform,
            "role_id_platform": RecOpening.role_id_platform,
            "grade_id_platform": RecOpening.grade_id_platform,
            "reporting_person_id_platform": RecOpening.reporting_person_id_platform,
            "headcount_required": RecOpening.headcount_required,
            "headcount_filled": RecOpening.headcount_filled,
            "is_active": RecOpening.is_active,
            "created_at": RecOpening.created_at,
            "updated_at": RecOpening.updated_at,
        },
        "default_columns": [
            "opening_code",
            "title",
            "location_city",
            "headcount_required",
            "headcount_filled",
            "is_active",
            "created_at",
        ],
    },
    "offers": {
        "label": "Offers",
        "description": "Offer lifecycle and compensation details.",
        "base": RecCandidateOffer,
        "joins": [_join_offer_context],
        "date_field": RecCandidateOffer.created_at,
        "opening_field": RecCandidateOffer.opening_id,
        "status_field": RecCandidateOffer.offer_status,
        "active_field": None,
        "order_by": RecCandidateOffer.created_at.desc(),
        "columns": {
            "candidate_offer_id": RecCandidateOffer.candidate_offer_id,
            "candidate_id": RecCandidateOffer.candidate_id,
            "candidate_code": RecCandidate.candidate_code,
            "candidate_email": RecCandidate.email,
            "opening_id": RecCandidateOffer.opening_id,
            "opening_code": RecOpening.opening_code,
            "opening_title": RecOpening.title,
            "offer_template_code": RecCandidateOffer.offer_template_code,
            "offer_version": RecCandidateOffer.offer_version,
            "gross_ctc_annual": RecCandidateOffer.gross_ctc_annual,
            "fixed_ctc_annual": RecCandidateOffer.fixed_ctc_annual,
            "variable_ctc_annual": RecCandidateOffer.variable_ctc_annual,
            "currency": RecCandidateOffer.currency,
            "designation_title": RecCandidateOffer.designation_title,
            "grade_id_platform": RecCandidateOffer.grade_id_platform,
            "joining_date": RecCandidateOffer.joining_date,
            "probation_months": RecCandidateOffer.probation_months,
            "offer_valid_until": RecCandidateOffer.offer_valid_until,
            "offer_status": RecCandidateOffer.offer_status,
            "public_token": RecCandidateOffer.public_token,
            "generated_by_person_id_platform": RecCandidateOffer.generated_by_person_id_platform,
            "generated_at": RecCandidateOffer.generated_at,
            "approved_by_person_id_platform": RecCandidateOffer.approved_by_person_id_platform,
            "approved_at": RecCandidateOffer.approved_at,
            "sent_at": RecCandidateOffer.sent_at,
            "viewed_at": RecCandidateOffer.viewed_at,
            "accepted_at": RecCandidateOffer.accepted_at,
            "declined_at": RecCandidateOffer.declined_at,
            "pdf_url": RecCandidateOffer.pdf_url,
            "notes_internal": RecCandidateOffer.notes_internal,
            "offer_letter_overrides": RecCandidateOffer.offer_letter_overrides,
            "created_at": RecCandidateOffer.created_at,
            "updated_at": RecCandidateOffer.updated_at,
        },
        "default_columns": [
            "candidate_code",
            "opening_title",
            "offer_status",
            "designation_title",
            "gross_ctc_annual",
            "sent_at",
            "created_at",
        ],
    },
    "interviews": {
        "label": "Interviews",
        "description": "Scheduled interviews, feedback, and ratings.",
        "base": RecCandidateInterview,
        "joins": [_join_interview_context],
        "date_field": RecCandidateInterview.scheduled_start_at,
        "opening_field": RecCandidate.opening_id,
        "status_field": RecCandidateInterview.decision,
        "active_field": None,
        "order_by": RecCandidateInterview.scheduled_start_at.desc(),
        "columns": {
            "candidate_interview_id": RecCandidateInterview.candidate_interview_id,
            "candidate_id": RecCandidateInterview.candidate_id,
            "candidate_code": RecCandidate.candidate_code,
            "candidate_email": RecCandidate.email,
            "opening_id": RecCandidate.opening_id,
            "opening_code": RecOpening.opening_code,
            "opening_title": RecOpening.title,
            "stage_name": RecCandidateInterview.stage_name,
            "round_type": RecCandidateInterview.round_type,
            "interviewer_person_id_platform": RecCandidateInterview.interviewer_person_id_platform,
            "scheduled_start_at": RecCandidateInterview.scheduled_start_at,
            "scheduled_end_at": RecCandidateInterview.scheduled_end_at,
            "location": RecCandidateInterview.location,
            "meeting_link": RecCandidateInterview.meeting_link,
            "calendar_event_id": RecCandidateInterview.calendar_event_id,
            "feedback_submitted": RecCandidateInterview.feedback_submitted,
            "rating_overall": RecCandidateInterview.rating_overall,
            "rating_technical": RecCandidateInterview.rating_technical,
            "rating_culture_fit": RecCandidateInterview.rating_culture_fit,
            "rating_communication": RecCandidateInterview.rating_communication,
            "decision": RecCandidateInterview.decision,
            "notes_internal": RecCandidateInterview.notes_internal,
            "notes_for_candidate": RecCandidateInterview.notes_for_candidate,
            "created_by_person_id_platform": RecCandidateInterview.created_by_person_id_platform,
            "created_at": RecCandidateInterview.created_at,
            "updated_at": RecCandidateInterview.updated_at,
        },
        "default_columns": [
            "candidate_code",
            "opening_title",
            "stage_name",
            "round_type",
            "scheduled_start_at",
            "decision",
            "feedback_submitted",
        ],
    },
    "sprints": {
        "label": "Sprints",
        "description": "Candidate sprint assignments and submissions.",
        "base": RecCandidateSprint,
        "joins": [_join_sprint_context],
        "date_field": RecCandidateSprint.assigned_at,
        "opening_field": RecCandidate.opening_id,
        "status_field": RecCandidateSprint.status,
        "active_field": None,
        "order_by": RecCandidateSprint.assigned_at.desc(),
        "columns": {
            "candidate_sprint_id": RecCandidateSprint.candidate_sprint_id,
            "candidate_id": RecCandidateSprint.candidate_id,
            "candidate_code": RecCandidate.candidate_code,
            "candidate_email": RecCandidate.email,
            "opening_id": RecCandidate.opening_id,
            "opening_code": RecOpening.opening_code,
            "opening_title": RecOpening.title,
            "sprint_template_id": RecCandidateSprint.sprint_template_id,
            "sprint_template_code": RecSprintTemplate.sprint_template_code,
            "sprint_template_name": RecSprintTemplate.name,
            "assigned_by_person_id_platform": RecCandidateSprint.assigned_by_person_id_platform,
            "assigned_at": RecCandidateSprint.assigned_at,
            "due_at": RecCandidateSprint.due_at,
            "status": RecCandidateSprint.status,
            "submission_url": RecCandidateSprint.submission_url,
            "submitted_at": RecCandidateSprint.submitted_at,
            "reviewed_by_person_id_platform": RecCandidateSprint.reviewed_by_person_id_platform,
            "reviewed_at": RecCandidateSprint.reviewed_at,
            "score_overall": RecCandidateSprint.score_overall,
            "comments_internal": RecCandidateSprint.comments_internal,
            "comments_for_candidate": RecCandidateSprint.comments_for_candidate,
            "decision": RecCandidateSprint.decision,
            "public_token": RecCandidateSprint.public_token,
            "created_at": RecCandidateSprint.created_at,
            "updated_at": RecCandidateSprint.updated_at,
        },
        "default_columns": [
            "candidate_code",
            "opening_title",
            "sprint_template_name",
            "status",
            "assigned_at",
            "submitted_at",
        ],
    },
}


def _get_report(report_id: str):
    cfg = REPORTS.get(report_id)
    if not cfg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    return cfg


@router.get("", response_model=dict)
async def list_reports(
    _user=Depends(require_roles([Role.HR_ADMIN])),
):
    output = []
    for report_id, cfg in REPORTS.items():
        columns = [{"key": key, "label": _titleize(key)} for key in cfg["columns"].keys()]
        output.append(
            {
                "report_id": report_id,
                "label": cfg["label"],
                "description": cfg["description"],
                "columns": columns,
                "default_columns": cfg["default_columns"],
                "filters": {
                    "date_field": cfg["date_field"].key if cfg["date_field"] is not None else None,
                    "opening_id": cfg["opening_field"] is not None,
                    "status": cfg["status_field"] is not None,
                    "is_active": cfg["active_field"] is not None,
                },
            }
        )
    return {"reports": output}


def _parse_columns(cfg: dict, columns: str | None) -> list[str]:
    if columns:
        requested = [col.strip() for col in columns.split(",") if col.strip()]
        invalid = [col for col in requested if col not in cfg["columns"]]
        if invalid:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid columns requested.")
        return requested or cfg["default_columns"]
    return cfg["default_columns"]


async def _fetch_rows(
    session: AsyncSession,
    *,
    cfg: dict,
    columns: list[str],
    limit: int,
    offset: int,
    date_from: datetime | None,
    date_to: datetime | None,
    opening_id: int | None,
    status_value: str | None,
    is_active: int | None,
):
    expressions = [cfg["columns"][key].label(key) for key in columns]
    stmt = select(*expressions).select_from(cfg["base"])
    stmt = _apply_joins(stmt, cfg["joins"])
    stmt = _apply_filters(
        stmt,
        date_field=cfg["date_field"],
        date_from=date_from,
        date_to=date_to,
        opening_field=cfg["opening_field"],
        opening_id=opening_id,
        status_field=cfg["status_field"],
        status_value=status_value,
        active_field=cfg["active_field"],
        is_active=is_active,
    )
    stmt = stmt.order_by(cfg["order_by"]).limit(limit).offset(offset)
    result = await session.execute(stmt)
    return result.mappings().all()


async def _fetch_count(
    session: AsyncSession,
    *,
    cfg: dict,
    date_from: datetime | None,
    date_to: datetime | None,
    opening_id: int | None,
    status_value: str | None,
    is_active: int | None,
) -> int:
    stmt = select(func.count()).select_from(cfg["base"])
    stmt = _apply_joins(stmt, cfg["joins"])
    stmt = _apply_filters(
        stmt,
        date_field=cfg["date_field"],
        date_from=date_from,
        date_to=date_to,
        opening_field=cfg["opening_field"],
        opening_id=opening_id,
        status_field=cfg["status_field"],
        status_value=status_value,
        active_field=cfg["active_field"],
        is_active=is_active,
    )
    return int((await session.execute(stmt)).scalar_one())


@router.get("/{report_id}/preview", response_model=dict)
async def preview_report(
    report_id: str,
    columns: str | None = Query(default=None),
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
    opening_id: int | None = Query(default=None),
    status_value: str | None = Query(default=None, alias="status"),
    is_active: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=MAX_PREVIEW_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(deps.get_db_session),
    _user=Depends(require_roles([Role.HR_ADMIN])),
):
    cfg = _get_report(report_id)
    column_list = _parse_columns(cfg, columns)
    date_from_value = _parse_datetime(date_from)
    date_to_value = _expand_end_of_day(date_to, _parse_datetime(date_to))
    rows = await _fetch_rows(
        session,
        cfg=cfg,
        columns=column_list,
        limit=limit,
        offset=offset,
        date_from=date_from_value,
        date_to=date_to_value,
        opening_id=opening_id,
        status_value=status_value.strip() if status_value else None,
        is_active=is_active,
    )
    total = await _fetch_count(
        session,
        cfg=cfg,
        date_from=date_from_value,
        date_to=date_to_value,
        opening_id=opening_id,
        status_value=status_value.strip() if status_value else None,
        is_active=is_active,
    )
    return {
        "report_id": report_id,
        "columns": column_list,
        "rows": [dict(row) for row in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{report_id}/download")
async def download_report(
    report_id: str,
    columns: str | None = Query(default=None),
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
    opening_id: int | None = Query(default=None),
    status_value: str | None = Query(default=None, alias="status"),
    is_active: int | None = Query(default=None),
    limit: int = Query(default=5000, ge=1, le=MAX_DOWNLOAD_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(deps.get_db_session),
    _user=Depends(require_roles([Role.HR_ADMIN])),
):
    cfg = _get_report(report_id)
    column_list = _parse_columns(cfg, columns)
    date_from_value = _parse_datetime(date_from)
    date_to_value = _expand_end_of_day(date_to, _parse_datetime(date_to))
    rows = await _fetch_rows(
        session,
        cfg=cfg,
        columns=column_list,
        limit=limit,
        offset=offset,
        date_from=date_from_value,
        date_to=date_to_value,
        opening_id=opening_id,
        status_value=status_value.strip() if status_value else None,
        is_active=is_active,
    )

    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(column_list)
    for row in rows:
        writer.writerow([_csv_safe(row.get(key)) for key in column_list])
    buffer.seek(0)

    filename = f"recruitment_{report_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([buffer.getvalue()]), media_type="text/csv", headers=headers)
