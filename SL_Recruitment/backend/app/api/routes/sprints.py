from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

import hashlib
import io
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status, Response
from fastapi.responses import StreamingResponse
import re

from sqlalchemy import select, func, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import OperationalError, SQLAlchemyError, DataError

from app.api import deps
from app.api.routes.candidates import transition_stage
from app.core.auth import require_roles, require_superadmin
from app.core.config import settings
from app.core.roles import Role
from app.core.uploads import SPRINT_EXTENSIONS, SPRINT_MIME_TYPES, normalize_submission_url, validate_upload
from app.models.candidate import RecCandidate
from app.models.candidate_sprint_attachment import RecCandidateSprintAttachment
from app.models.stage import RecCandidateStage
from app.models.candidate_sprint import RecCandidateSprint
from app.models.opening import RecOpening
from app.models.sprint_attachment import RecSprintAttachment
from app.models.sprint_template import RecSprintTemplate
from app.models.sprint_template_attachment import RecSprintTemplateAttachment
from app.db.platform_session import PlatformSessionLocal
from app.models.platform_person import DimPerson
from app.schemas.sprint import CandidateSprintOut, SprintAssignIn, SprintPublicOut, SprintUpdateIn, SprintReviewerAssignIn
from app.schemas.sprint_attachment import SprintAttachmentPublicOut, SprintTemplateAttachmentOut
from app.schemas.stage import StageTransitionRequest
from app.schemas.sprint_template import SprintTemplateCreateIn, SprintTemplateListItem, SprintTemplateUpdateIn
from app.schemas.user import UserContext
import anyio
from app.services.platform_identity import active_status_filter, resolve_identity_by_email
from app.services.drive import (
    copy_sprint_attachment_to_candidate,
    download_drive_file,
    upload_sprint_doc,
    upload_sprint_template_attachment,
)
from app.services.email import send_email
from app.services.public_links import build_public_link
from app.services.events import log_event
from app.services.sprint_brief import render_sprint_brief_html

router = APIRouter(prefix="/rec", tags=["sprints"])
public_router = APIRouter(prefix="/sprint", tags=["sprints-public"])

MAX_SPRINT_ATTACHMENT_BYTES = 25 * 1024 * 1024
logger = logging.getLogger(__name__)


def _normalize_person_id(raw: str | None) -> str | None:
    if raw is None:
        return None
    val = raw.strip()
    return val or None


async def _resolve_person_id_by_email(email: str | None) -> str | None:
    email_norm = (email or "").strip().lower()
    if not email_norm:
        return None
    try:
        async with PlatformSessionLocal() as platform_session:
            identity = await resolve_identity_by_email(platform_session, email_norm)
            if identity and identity.person_id:
                return str(identity.person_id)
    except Exception:
        return None
    return None


async def _fetch_platform_people(ids: set[str]) -> dict[str, dict]:
    ids = {pid for pid in ids if pid}
    if not ids:
        return {}
    try:
        async with PlatformSessionLocal() as platform_session:
            person_rows = (
                await platform_session.execute(
                    select(
                        DimPerson.person_id,
                        DimPerson.display_name,
                        DimPerson.full_name,
                        DimPerson.first_name,
                        DimPerson.last_name,
                        DimPerson.email,
                    ).where(DimPerson.person_id.in_(list(ids)), active_status_filter())
                )
            ).all()
            out: dict[str, dict] = {}
            for pr in person_rows:
                full_name = (pr.display_name or pr.full_name or f"{(pr.first_name or '').strip()} {(pr.last_name or '').strip()}").strip()
                out[_normalize_person_id(pr.person_id) or pr.person_id] = {
                    "name": full_name or pr.email or pr.person_id,
                    "email": pr.email,
                }
            return out
    except Exception:
        return {}


def _normalize_template_code(raw: str | None) -> str | None:
    if raw is None:
        return None
    code = raw.strip().upper().replace(" ", "-")
    code = re.sub(r"[^A-Z0-9_-]+", "", code)
    return code or None


def _default_template_code(name: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", name.strip())
    initials = "".join(word[0].upper() for word in words if word)
    base = (initials or "SPR").upper()[:6]
    digest = hashlib.sha1(name.strip().encode("utf-8")).hexdigest()[:4].upper()
    return f"{base}-{digest}"


def _assert_public_sprint_active(sprint: RecCandidateSprint) -> None:
    if sprint.status in {"deleted", "submitted"}:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Sprint link expired")
    if sprint.due_at and datetime.utcnow() > sprint.due_at:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Sprint link expired")


async def _generate_unique_template_code(session: AsyncSession, name: str) -> str:
    base = _default_template_code(name)
    candidate = base
    suffix = 1
    while True:
        exists = (
            await session.execute(select(RecSprintTemplate.sprint_template_id).where(RecSprintTemplate.sprint_template_code == candidate))
        ).scalar_one_or_none()
        if not exists:
            return candidate
        suffix += 1
        candidate = f"{base}-{suffix}"


async def _current_stage_name(session: AsyncSession, *, candidate_id: int) -> str | None:
    stage_row = (
        await session.execute(
            select(RecCandidateStage.stage_name)
            .where(RecCandidateStage.candidate_id == candidate_id, RecCandidateStage.stage_status == "pending")
            .order_by(RecCandidateStage.started_at.desc(), RecCandidateStage.stage_id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return stage_row


def _compute_due_at(now: datetime, template: RecSprintTemplate, due_at: datetime | None) -> datetime | None:
    if due_at is not None:
        return due_at
    if template.expected_duration_days:
        return now + timedelta(days=int(template.expected_duration_days))
    return None


def _render_template_description(
    template: RecSprintTemplate | None,
    sprint: RecCandidateSprint,
    candidate: RecCandidate | None,
    opening: RecOpening | None,
) -> str | None:
    return render_sprint_brief_html(
        template=template,
        sprint=sprint,
        candidate=candidate,
        opening=opening,
        include_signature=False,
    )


async def _build_candidate_sprint(
    session: AsyncSession,
    sprint: RecCandidateSprint,
    template: RecSprintTemplate | None,
    candidate: RecCandidate | None = None,
    opening: RecOpening | None = None,
    reviewer_meta: dict | None = None,
) -> CandidateSprintOut:
    attachments: list[SprintAttachmentPublicOut] = []
    if sprint.public_token:
        attachments = await _load_public_attachments(session, candidate_sprint_id=sprint.candidate_sprint_id, token=sprint.public_token)

    return CandidateSprintOut(
        candidate_sprint_id=sprint.candidate_sprint_id,
        candidate_id=sprint.candidate_id,
        sprint_template_id=sprint.sprint_template_id,
        assigned_by_person_id_platform=sprint.assigned_by_person_id_platform,
        assigned_at=sprint.assigned_at,
        due_at=sprint.due_at,
        status=sprint.status,
        submission_url=sprint.submission_url,
        submitted_at=sprint.submitted_at,
        deleted_at=sprint.deleted_at,
        reviewed_by_person_id_platform=sprint.reviewed_by_person_id_platform,
        reviewed_by_name=(reviewer_meta or {}).get("name"),
        reviewed_by_email=(reviewer_meta or {}).get("email"),
        reviewed_at=sprint.reviewed_at,
        score_overall=float(sprint.score_overall) if sprint.score_overall is not None else None,
        comments_internal=sprint.comments_internal,
        comments_for_candidate=sprint.comments_for_candidate,
        decision=sprint.decision,
        public_token=sprint.public_token,
        created_at=sprint.created_at,
        updated_at=sprint.updated_at,
        template_name=template.name if template else None,
        template_code=template.sprint_template_code if template else None,
        template_description=_render_template_description(template, sprint, candidate, opening),
        instructions_url=template.instructions_url if template else None,
        expected_duration_days=template.expected_duration_days if template else None,
        candidate_name=candidate.full_name if candidate else None,
        candidate_code=candidate.candidate_code if candidate else None,
        opening_title=opening.title if opening else None,
        attachments=attachments,
    )


async def _load_public_attachments(
    session: AsyncSession, *, candidate_sprint_id: int, token: str
) -> list[SprintAttachmentPublicOut]:
    rows = (
        await session.execute(
            select(RecCandidateSprintAttachment, RecSprintAttachment)
            .join(RecSprintAttachment, RecSprintAttachment.sprint_attachment_id == RecCandidateSprintAttachment.sprint_attachment_id)
            .where(RecCandidateSprintAttachment.candidate_sprint_id == candidate_sprint_id)
            .order_by(RecCandidateSprintAttachment.created_at.asc(), RecCandidateSprintAttachment.candidate_sprint_attachment_id.asc())
        )
    ).all()
    attachments: list[SprintAttachmentPublicOut] = []
    for link, attachment in rows:
        attachments.append(
            SprintAttachmentPublicOut(
                sprint_attachment_id=attachment.sprint_attachment_id,
                file_name=attachment.file_name,
                content_type=attachment.content_type,
                file_size=attachment.file_size,
                download_url=f"/sprint/{token}/attachments/{attachment.sprint_attachment_id}",
            )
        )
    if attachments:
        return attachments

    sprint_template_id = (
        await session.execute(
            select(RecCandidateSprint.sprint_template_id)
            .where(RecCandidateSprint.candidate_sprint_id == candidate_sprint_id)
        )
    ).scalar_one_or_none()
    if not sprint_template_id:
        return []
    template_rows = (
        await session.execute(
            select(RecSprintTemplateAttachment, RecSprintAttachment)
            .join(RecSprintAttachment, RecSprintAttachment.sprint_attachment_id == RecSprintTemplateAttachment.sprint_attachment_id)
            .where(
                RecSprintTemplateAttachment.sprint_template_id == sprint_template_id,
                RecSprintTemplateAttachment.is_active == 1,
            )
            .order_by(RecSprintTemplateAttachment.created_at.asc(), RecSprintTemplateAttachment.sprint_template_attachment_id.asc())
        )
    ).all()
    if not template_rows:
        template_rows = (
            await session.execute(
                select(RecSprintTemplateAttachment, RecSprintAttachment)
                .join(RecSprintAttachment, RecSprintAttachment.sprint_attachment_id == RecSprintTemplateAttachment.sprint_attachment_id)
                .where(RecSprintTemplateAttachment.sprint_template_id == sprint_template_id)
                .order_by(RecSprintTemplateAttachment.created_at.asc(), RecSprintTemplateAttachment.sprint_template_attachment_id.asc())
            )
        ).all()
    for link, attachment in template_rows:
        attachments.append(
            SprintAttachmentPublicOut(
                sprint_attachment_id=attachment.sprint_attachment_id,
                file_name=attachment.file_name,
                content_type=attachment.content_type,
                file_size=attachment.file_size,
                download_url=f"/sprint/{token}/attachments/{attachment.sprint_attachment_id}",
            )
        )
    return attachments


@router.get("/sprint-templates", response_model=list[SprintTemplateListItem])
async def list_sprint_templates(
    include_inactive: bool = False,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    rows = (await session.execute(select(RecSprintTemplate).order_by(RecSprintTemplate.updated_at.desc()))).scalars().all()
    return [
        SprintTemplateListItem(
            sprint_template_id=t.sprint_template_id,
            sprint_template_code=t.sprint_template_code,
            name=t.name,
            description=t.description,
            opening_id=t.opening_id,
            role_id_platform=t.role_id_platform,
            instructions_url=t.instructions_url,
            expected_duration_days=t.expected_duration_days,
            is_active=bool(t.is_active),
        )
        for t in rows
        if include_inactive or t.is_active
    ]


@router.post("/sprint-templates", response_model=SprintTemplateListItem, status_code=status.HTTP_201_CREATED)
async def create_sprint_template(
    payload: SprintTemplateCreateIn,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_superadmin()),
):
    code = _normalize_template_code(payload.sprint_template_code)
    if not code:
        code = await _generate_unique_template_code(session, payload.name)
    existing = (
        await session.execute(select(RecSprintTemplate.sprint_template_id).where(RecSprintTemplate.sprint_template_code == code))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sprint template code already exists")

    now = datetime.utcnow()
    template = RecSprintTemplate(
        sprint_template_code=code,
        name=payload.name.strip(),
        description=payload.description,
        opening_id=payload.opening_id,
        role_id_platform=payload.role_id_platform,
        instructions_url=payload.instructions_url,
        expected_duration_days=payload.expected_duration_days,
        is_active=1 if payload.is_active else 0,
        created_at=now,
        updated_at=now,
    )
    session.add(template)
    await session.commit()

    return SprintTemplateListItem(
        sprint_template_id=template.sprint_template_id,
        sprint_template_code=template.sprint_template_code,
        name=template.name,
        description=template.description,
        opening_id=template.opening_id,
        role_id_platform=template.role_id_platform,
        instructions_url=template.instructions_url,
        expected_duration_days=template.expected_duration_days,
        is_active=bool(template.is_active),
    )


@router.patch("/sprint-templates/{sprint_template_id}", response_model=SprintTemplateListItem)
async def update_sprint_template(
    sprint_template_id: int,
    payload: SprintTemplateUpdateIn,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_superadmin()),
):
    template = await session.get(RecSprintTemplate, sprint_template_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint template not found")

    updates = payload.model_dump(exclude_none=True)
    if "sprint_template_code" in updates:
        code = _normalize_template_code(updates.pop("sprint_template_code"))
        if code:
            existing = (
                await session.execute(
                    select(RecSprintTemplate.sprint_template_id).where(
                        RecSprintTemplate.sprint_template_code == code, RecSprintTemplate.sprint_template_id != sprint_template_id
                    )
                )
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sprint template code already exists")
        template.sprint_template_code = code

    for key, value in updates.items():
        if hasattr(template, key):
            setattr(template, key, value)

    template.updated_at = datetime.utcnow()
    await session.commit()

    return SprintTemplateListItem(
        sprint_template_id=template.sprint_template_id,
        sprint_template_code=template.sprint_template_code,
        name=template.name,
        description=template.description,
        opening_id=template.opening_id,
        role_id_platform=template.role_id_platform,
        instructions_url=template.instructions_url,
        expected_duration_days=template.expected_duration_days,
        is_active=bool(template.is_active),
    )


@router.get("/sprint-templates/{sprint_template_id}/attachments", response_model=list[SprintTemplateAttachmentOut])
async def list_sprint_template_attachments(
    sprint_template_id: int,
    include_inactive: bool = False,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    query = (
        select(RecSprintTemplateAttachment, RecSprintAttachment)
        .join(RecSprintAttachment, RecSprintAttachment.sprint_attachment_id == RecSprintTemplateAttachment.sprint_attachment_id)
        .where(RecSprintTemplateAttachment.sprint_template_id == sprint_template_id)
    )
    if not include_inactive:
        query = query.where(RecSprintTemplateAttachment.is_active == 1)
    rows = (await session.execute(query.order_by(RecSprintTemplateAttachment.created_at.desc(), RecSprintTemplateAttachment.sprint_template_attachment_id.desc()))).all()
    return [
        SprintTemplateAttachmentOut(
            sprint_template_attachment_id=link.sprint_template_attachment_id,
            sprint_attachment_id=attachment.sprint_attachment_id,
            file_name=attachment.file_name,
            content_type=attachment.content_type,
            file_size=attachment.file_size,
            created_at=link.created_at,
            is_active=bool(link.is_active),
        )
        for link, attachment in rows
    ]


@router.delete("/sprint-templates/{sprint_template_id}/attachments/{sprint_template_attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sprint_template_attachment(
    sprint_template_id: int,
    sprint_template_attachment_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_superadmin()),
):
    link = await session.get(RecSprintTemplateAttachment, sprint_template_attachment_id)
    if not link or link.sprint_template_id != sprint_template_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    if not link.is_active:
        return
    link.is_active = 0
    await session.commit()
    return


@router.post(
    "/sprint-templates/{sprint_template_id}/attachments",
    response_model=SprintTemplateAttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_sprint_template_attachment_route(
    sprint_template_id: int,
    upload: UploadFile = File(...),
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    template = await session.get(RecSprintTemplate, sprint_template_id)
    if not template or not template.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint template not found")

    safe_name = validate_upload(
        upload,
        allowed_extensions=SPRINT_EXTENSIONS,
        allowed_mime_types=SPRINT_MIME_TYPES,
        allow_unknown_content_type=True,
    )
    data = await upload.read()
    if len(data) > MAX_SPRINT_ATTACHMENT_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attachment too large (max 25MB).")

    sha256 = hashlib.sha256(data).hexdigest()
    file_name = safe_name
    drive_file_id, _ = await anyio.to_thread.run_sync(
        lambda: upload_sprint_template_attachment(
            sprint_template_id,
            filename=file_name,
            content_type=upload.content_type or "application/octet-stream",
            data=data,
        )
    )

    attachment = RecSprintAttachment(
        drive_file_id=drive_file_id,
        file_name=file_name,
        content_type=upload.content_type,
        file_size=len(data),
        sha256=sha256,
        created_by_person_id_platform=_normalize_person_id(user.person_id_platform),
        created_at=datetime.utcnow(),
    )
    session.add(attachment)
    await session.flush()

    link = RecSprintTemplateAttachment(
        sprint_template_id=sprint_template_id,
        sprint_attachment_id=attachment.sprint_attachment_id,
        is_active=True,
        created_at=datetime.utcnow(),
    )
    session.add(link)
    await session.commit()

    return SprintTemplateAttachmentOut(
        sprint_template_attachment_id=link.sprint_template_attachment_id,
        sprint_attachment_id=attachment.sprint_attachment_id,
        file_name=attachment.file_name,
        content_type=attachment.content_type,
        file_size=attachment.file_size,
        created_at=link.created_at,
        is_active=bool(link.is_active),
    )


@router.post("/candidates/{candidate_id}/sprints", response_model=CandidateSprintOut, status_code=status.HTTP_201_CREATED)
async def assign_sprint(
    candidate_id: int,
    payload: SprintAssignIn,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    template = await session.get(RecSprintTemplate, payload.sprint_template_id)
    if not template or not template.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint template not found")
    if payload.due_at is None and not template.expected_duration_days:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sprint due date is required")

    now = datetime.utcnow()
    due_at = _compute_due_at(now, template, payload.due_at)
    public_token = uuid4().hex

    reviewer_person_id = await _resolve_person_id_by_email(candidate.l2_owner_email)
    sprint = RecCandidateSprint(
        candidate_id=candidate_id,
        sprint_template_id=template.sprint_template_id,
        assigned_by_person_id_platform=_normalize_person_id(user.person_id_platform),
        assigned_at=now,
        due_at=due_at,
        status="assigned",
        reviewed_by_person_id_platform=_normalize_person_id(reviewer_person_id),
        public_token=public_token,
        created_at=now,
        updated_at=now,
    )
    session.add(sprint)
    try:
        await session.flush()
    except DataError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "DB schema mismatch: `rec_candidate_sprint.assigned_by_person_id_platform` "
                "and `reviewed_by_person_id_platform` must be VARCHAR(64). "
                "Apply `backend/migrations/0022_candidate_sprint_platform_id_varchar.sql`."
            ),
        ) from exc

    template_attachments = (
        await session.execute(
            select(RecSprintTemplateAttachment, RecSprintAttachment)
            .join(RecSprintAttachment, RecSprintAttachment.sprint_attachment_id == RecSprintTemplateAttachment.sprint_attachment_id)
            .where(
                RecSprintTemplateAttachment.sprint_template_id == template.sprint_template_id,
                RecSprintTemplateAttachment.is_active == 1,
            )
        )
    ).all()
    attachment_names = [attachment.file_name for _, attachment in template_attachments if attachment.file_name]
    attachment_list_html = "".join(f"<li>{name}</li>" for name in attachment_names)
    attachment_summary = attachment_list_html or "<li>No attachments</li>"
    if settings.drive_root_folder_id:
        for template_link, attachment in template_attachments:
            try:
                copied_drive_id = await anyio.to_thread.run_sync(
                    lambda: copy_sprint_attachment_to_candidate(
                        candidate_id=candidate.candidate_id,
                        candidate_sprint_id=sprint.candidate_sprint_id,
                        source_file_id=attachment.drive_file_id,
                        filename=attachment.file_name,
                    )
                )
                copied_attachment = RecSprintAttachment(
                    drive_file_id=copied_drive_id,
                    file_name=attachment.file_name,
                    content_type=attachment.content_type,
                    file_size=attachment.file_size,
                    sha256=attachment.sha256,
                    created_by_person_id_platform=_normalize_person_id(user.person_id_platform),
                    created_at=datetime.utcnow(),
                )
                session.add(copied_attachment)
                await session.flush()
                session.add(
                    RecCandidateSprintAttachment(
                        candidate_sprint_id=sprint.candidate_sprint_id,
                        sprint_attachment_id=copied_attachment.sprint_attachment_id,
                        source_sprint_template_attachment_id=template_link.sprint_template_attachment_id,
                        created_at=datetime.utcnow(),
                    )
                )
            except Exception:
                logger.exception(
                    "Failed to copy sprint attachment",
                    extra={
                        "candidate_id": candidate.candidate_id,
                        "candidate_sprint_id": sprint.candidate_sprint_id,
                        "attachment_id": attachment.sprint_attachment_id,
                    },
                )

    await log_event(
        session,
        candidate_id=candidate_id,
        action_type="sprint_assigned",
        performed_by_person_id_platform=int(user.person_id_platform) if (user.person_id_platform or "").isdigit() else None,
        related_entity_type="sprint",
        related_entity_id=sprint.candidate_sprint_id,
        meta_json={"sprint_template_id": template.sprint_template_id, "due_at": due_at.isoformat() if due_at else None},
    )

    opening = None
    if candidate.opening_id is not None:
        opening = (await session.execute(select(RecOpening).where(RecOpening.opening_id == candidate.opening_id))).scalars().first()

    if candidate.email:
        await send_email(
            session,
            candidate_id=candidate_id,
            to_emails=[candidate.email],
            subject="Sprint assignment",
            template_name="sprint_assigned",
            context={
                "candidate_name": candidate.full_name,
                "sprint_name": template.name,
                "due_at": due_at.isoformat() if due_at else "",
                "sprint_link": build_public_link(f"/sprint/{public_token}"),
                "opening_title": opening.title if opening else "",
                "attachment_list": attachment_summary,
            },
            email_type="sprint_assigned",
            related_entity_type="sprint",
            related_entity_id=sprint.candidate_sprint_id,
            meta_extra={"sprint_id": sprint.candidate_sprint_id},
        )

    current_stage = await _current_stage_name(session, candidate_id=candidate_id)
    if current_stage != "sprint":
        await transition_stage(
            candidate_id,
            StageTransitionRequest(to_stage="sprint", decision="advance", note="sprint_assigned"),
            session,
            user,
        )

    await session.commit()
    return await _build_candidate_sprint(session, sprint, template, candidate, opening)


@router.get("/candidates/{candidate_id}/sprints", response_model=list[CandidateSprintOut])
async def list_candidate_sprints(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    try:
        rows = (
            await session.execute(
                select(RecCandidateSprint, RecSprintTemplate)
                .join(RecSprintTemplate, RecSprintTemplate.sprint_template_id == RecCandidateSprint.sprint_template_id)
                .where(RecCandidateSprint.candidate_id == candidate_id)
                .order_by(RecCandidateSprint.assigned_at.desc(), RecCandidateSprint.candidate_sprint_id.desc())
            )
        ).all()
    except OperationalError:
        # Sprint tables missing or migration not applied.
        return []
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Could not load sprints: {exc}")

    opening = None
    if candidate.opening_id is not None:
        opening = (await session.execute(select(RecOpening).where(RecOpening.opening_id == candidate.opening_id))).scalars().first()

    reviewer_ids = {_normalize_person_id(sprint.reviewed_by_person_id_platform) or "" for sprint, _ in rows}
    reviewer_meta = await _fetch_platform_people(reviewer_ids)
    return [
        await _build_candidate_sprint(
            session,
            sprint,
            template,
            candidate,
            opening,
            reviewer_meta=reviewer_meta.get(_normalize_person_id(sprint.reviewed_by_person_id_platform) or "", {}),
        )
        for sprint, template in rows
    ]


@router.get("/sprints/{candidate_sprint_id}", response_model=CandidateSprintOut)
async def get_sprint(
    candidate_sprint_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    row = (
        await session.execute(
            select(RecCandidateSprint, RecSprintTemplate, RecCandidate, RecOpening)
            .join(RecSprintTemplate, RecSprintTemplate.sprint_template_id == RecCandidateSprint.sprint_template_id)
            .join(RecCandidate, RecCandidate.candidate_id == RecCandidateSprint.candidate_id)
            .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
            .where(RecCandidateSprint.candidate_sprint_id == candidate_sprint_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")
    sprint, template, candidate, opening = row
    reviewer_meta = await _fetch_platform_people({_normalize_person_id(sprint.reviewed_by_person_id_platform) or ""})
    return await _build_candidate_sprint(
        session,
        sprint,
        template,
        candidate,
        opening,
        reviewer_meta=reviewer_meta.get(_normalize_person_id(sprint.reviewed_by_person_id_platform) or "", {}),
    )


@router.get("/sprints", response_model=list[CandidateSprintOut])
async def list_sprints(
    status_filter: str | None = None,
    reviewer: str | None = None,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER])),
):
    query = (
        select(RecCandidateSprint, RecSprintTemplate, RecCandidate, RecOpening)
        .join(RecSprintTemplate, RecSprintTemplate.sprint_template_id == RecCandidateSprint.sprint_template_id)
        .join(RecCandidate, RecCandidate.candidate_id == RecCandidateSprint.candidate_id)
        .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
        .order_by(RecCandidateSprint.assigned_at.desc(), RecCandidateSprint.candidate_sprint_id.desc())
    )
    if status_filter:
        query = query.where(RecCandidateSprint.status == status_filter)
    if reviewer == "me":
        reviewer_filter = None
        if user.person_id_platform:
            reviewer_filter = RecCandidateSprint.reviewed_by_person_id_platform == _normalize_person_id(user.person_id_platform)
        if user.email:
            email_filter = func.lower(RecCandidate.l2_owner_email) == user.email.lower()
            reviewer_filter = email_filter if reviewer_filter is None else or_(reviewer_filter, email_filter)
        if reviewer_filter is not None:
            query = query.where(reviewer_filter)

    rows = (await session.execute(query)).all()
    reviewer_ids = {_normalize_person_id(sprint.reviewed_by_person_id_platform) or "" for sprint, _, _, _ in rows}
    reviewer_meta = await _fetch_platform_people(reviewer_ids)
    return [
        await _build_candidate_sprint(
            session,
            sprint,
            template,
            candidate,
            opening,
            reviewer_meta=reviewer_meta.get(_normalize_person_id(sprint.reviewed_by_person_id_platform) or "", {}),
        )
        for sprint, template, candidate, opening in rows
    ]


@router.patch("/sprints/{candidate_sprint_id}", response_model=CandidateSprintOut)
async def update_sprint(
    candidate_sprint_id: int,
    payload: SprintUpdateIn,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER])),
):
    sprint = await session.get(RecCandidateSprint, candidate_sprint_id)
    if not sprint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")

    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    now = datetime.utcnow()
    for key, value in updates.items():
        setattr(sprint, key, value)

    if updates.get("status") or updates.get("decision") or updates.get("comments_internal") or updates.get("score_overall") is not None:
        sprint.reviewed_by_person_id_platform = _normalize_person_id(user.person_id_platform)
        sprint.reviewed_at = now

    sprint.updated_at = now

    await log_event(
        session,
        candidate_id=sprint.candidate_id,
        action_type="sprint_reviewed",
        performed_by_person_id_platform=int(user.person_id_platform) if (user.person_id_platform or "").isdigit() else None,
        related_entity_type="sprint",
        related_entity_id=sprint.candidate_sprint_id,
        meta_json={"status": sprint.status, "decision": sprint.decision, "score_overall": sprint.score_overall},
    )

    if sprint.decision == "advance":
        await transition_stage(
            sprint.candidate_id,
            StageTransitionRequest(to_stage="l1_shortlist", decision="advance", note="sprint_review"),
            session,
            user,
        )
    elif sprint.decision == "reject":
        await transition_stage(
            sprint.candidate_id,
            StageTransitionRequest(to_stage="rejected", decision="reject", note="sprint_review"),
            session,
            user,
        )

    await session.commit()

    row = (
        await session.execute(
            select(RecCandidateSprint, RecSprintTemplate, RecCandidate, RecOpening)
            .join(RecSprintTemplate, RecSprintTemplate.sprint_template_id == RecCandidateSprint.sprint_template_id)
            .join(RecCandidate, RecCandidate.candidate_id == RecCandidateSprint.candidate_id)
            .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
            .where(RecCandidateSprint.candidate_sprint_id == candidate_sprint_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")
    sprint, template, candidate, opening = row
    reviewer_meta = await _fetch_platform_people({_normalize_person_id(sprint.reviewed_by_person_id_platform) or ""})
    return await _build_candidate_sprint(
        session,
        sprint,
        template,
        candidate,
        opening,
        reviewer_meta=reviewer_meta.get(_normalize_person_id(sprint.reviewed_by_person_id_platform) or "", {}),
    )


@router.patch("/sprints/{candidate_sprint_id}/assign-reviewer", response_model=CandidateSprintOut)
async def assign_sprint_reviewer(
    candidate_sprint_id: int,
    payload: SprintReviewerAssignIn,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    sprint = await session.get(RecCandidateSprint, candidate_sprint_id)
    if not sprint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")

    reviewer_id = _normalize_person_id(payload.reviewer_person_id_platform)
    sprint.reviewed_by_person_id_platform = reviewer_id
    sprint.updated_at = datetime.utcnow()

    await log_event(
        session,
        candidate_id=sprint.candidate_id,
        action_type="sprint_reviewer_assigned",
        performed_by_person_id_platform=int(user.person_id_platform) if (user.person_id_platform or "").isdigit() else None,
        related_entity_type="sprint",
        related_entity_id=sprint.candidate_sprint_id,
        meta_json={"reviewer_person_id_platform": reviewer_id},
    )
    await session.commit()

    row = (
        await session.execute(
            select(RecCandidateSprint, RecSprintTemplate, RecCandidate, RecOpening)
            .join(RecSprintTemplate, RecSprintTemplate.sprint_template_id == RecCandidateSprint.sprint_template_id)
            .join(RecCandidate, RecCandidate.candidate_id == RecCandidateSprint.candidate_id)
            .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
            .where(RecCandidateSprint.candidate_sprint_id == candidate_sprint_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")
    sprint, template, candidate, opening = row
    reviewer_meta = await _fetch_platform_people({_normalize_person_id(sprint.reviewed_by_person_id_platform) or ""})
    return await _build_candidate_sprint(
        session,
        sprint,
        template,
        candidate,
        opening,
        reviewer_meta=reviewer_meta.get(_normalize_person_id(sprint.reviewed_by_person_id_platform) or "", {}),
    )


@router.delete("/sprints/{candidate_sprint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sprint(
    candidate_sprint_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_superadmin()),
):
    sprint = await session.get(RecCandidateSprint, candidate_sprint_id)
    if not sprint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")

    sprint.status = "deleted"
    sprint.deleted_at = datetime.utcnow()
    sprint.updated_at = datetime.utcnow()
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@public_router.get("/{token}", response_model=SprintPublicOut)
async def get_public_sprint(
    token: str,
    session: AsyncSession = Depends(deps.get_db_session),
):
    row = (
        await session.execute(
            select(RecCandidateSprint, RecSprintTemplate, RecCandidate, RecOpening)
            .join(RecSprintTemplate, RecSprintTemplate.sprint_template_id == RecCandidateSprint.sprint_template_id)
            .join(RecCandidate, RecCandidate.candidate_id == RecCandidateSprint.candidate_id)
            .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
            .where(RecCandidateSprint.public_token == token)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid sprint token")
    sprint, template, candidate, opening = row
    _assert_public_sprint_active(sprint)
    _assert_public_sprint_active(sprint)
    attachments = await _load_public_attachments(session, candidate_sprint_id=sprint.candidate_sprint_id, token=token)
    return SprintPublicOut(
        candidate_id=candidate.candidate_id,
        candidate_name=candidate.full_name,
        opening_title=opening.title if opening else None,
        sprint_template_id=template.sprint_template_id,
        template_name=template.name,
        template_description=render_sprint_brief_html(
            template=template,
            sprint=sprint,
            candidate=candidate,
            opening=opening,
            include_signature=True,
        ),
        instructions_url=template.instructions_url,
        due_at=sprint.due_at,
        status=sprint.status,
        submission_url=sprint.submission_url,
        submitted_at=sprint.submitted_at,
        attachments=attachments,
    )


@public_router.post("/{token}", response_model=SprintPublicOut, status_code=status.HTTP_201_CREATED)
async def submit_public_sprint(
    token: str,
    submission_url: str | None = Form(default=None),
    submission_file: UploadFile | None = None,
    session: AsyncSession = Depends(deps.get_db_session),
):
    row = (
        await session.execute(
            select(RecCandidateSprint, RecSprintTemplate, RecCandidate, RecOpening)
            .join(RecSprintTemplate, RecSprintTemplate.sprint_template_id == RecCandidateSprint.sprint_template_id)
            .join(RecCandidate, RecCandidate.candidate_id == RecCandidateSprint.candidate_id)
            .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
            .where(RecCandidateSprint.public_token == token)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid sprint token")
    sprint, template, candidate, opening = row
    _assert_public_sprint_active(sprint)

    cleaned_url = normalize_submission_url(submission_url)
    if cleaned_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Submission links are not allowed. Please upload a file.")
    if submission_file is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please upload a file.")

    uploaded_url = None
    if submission_file is not None:
        safe_name = validate_upload(
            submission_file,
            allowed_extensions=SPRINT_EXTENSIONS,
            allowed_mime_types=SPRINT_MIME_TYPES,
            allow_unknown_content_type=True,
        )
        data = await submission_file.read()
        if len(data) > 15 * 1024 * 1024:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sprint file too large (max 15MB).")
        if not candidate.drive_folder_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Candidate drive folder missing")
        filename = f"{candidate.candidate_code or candidate.candidate_id}-sprint-{safe_name}"
        _, uploaded_url = await anyio.to_thread.run_sync(
            lambda: upload_sprint_doc(
                candidate.drive_folder_id,
                filename=filename,
                content_type=submission_file.content_type or "application/octet-stream",
                data=data,
            )
        )

    sprint.submission_url = uploaded_url
    sprint.submitted_at = datetime.utcnow()
    sprint.status = "submitted"
    sprint.updated_at = datetime.utcnow()

    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="sprint_submitted",
        related_entity_type="sprint",
        related_entity_id=sprint.candidate_sprint_id,
        meta_json={"submission_url": sprint.submission_url},
    )

    await session.commit()

    return SprintPublicOut(
        candidate_id=candidate.candidate_id,
        candidate_name=candidate.full_name,
        opening_title=opening.title if opening else None,
        sprint_template_id=template.sprint_template_id,
        template_name=template.name,
        template_description=render_sprint_brief_html(
            template=template,
            sprint=sprint,
            candidate=candidate,
            opening=opening,
            include_signature=True,
        ),
        instructions_url=template.instructions_url,
        due_at=sprint.due_at,
        status=sprint.status,
        submission_url=sprint.submission_url,
        submitted_at=sprint.submitted_at,
        attachments=await _load_public_attachments(session, candidate_sprint_id=sprint.candidate_sprint_id, token=token),
    )


@public_router.get("/{token}/attachments/{attachment_id}")
async def download_public_sprint_attachment(
    token: str,
    attachment_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
):
    row = (
        await session.execute(
            select(RecSprintAttachment, RecCandidateSprintAttachment, RecCandidateSprint)
            .join(RecCandidateSprintAttachment, RecCandidateSprintAttachment.sprint_attachment_id == RecSprintAttachment.sprint_attachment_id)
            .join(RecCandidateSprint, RecCandidateSprint.candidate_sprint_id == RecCandidateSprintAttachment.candidate_sprint_id)
            .where(RecCandidateSprint.public_token == token, RecSprintAttachment.sprint_attachment_id == attachment_id)
        )
    ).first()
    sprint = None
    attachment = None
    if row:
        attachment, _, sprint = row
    else:
        fallback = (
            await session.execute(
                select(RecSprintAttachment, RecCandidateSprint)
                .join(RecSprintTemplateAttachment, RecSprintTemplateAttachment.sprint_attachment_id == RecSprintAttachment.sprint_attachment_id)
                .join(RecCandidateSprint, RecCandidateSprint.sprint_template_id == RecSprintTemplateAttachment.sprint_template_id)
                .where(
                    RecCandidateSprint.public_token == token,
                    RecSprintAttachment.sprint_attachment_id == attachment_id,
                    RecSprintTemplateAttachment.is_active == 1,
                )
            )
        ).first()
        if not fallback:
            fallback = (
                await session.execute(
                    select(RecSprintAttachment, RecCandidateSprint)
                    .join(RecSprintTemplateAttachment, RecSprintTemplateAttachment.sprint_attachment_id == RecSprintAttachment.sprint_attachment_id)
                    .join(RecCandidateSprint, RecCandidateSprint.sprint_template_id == RecSprintTemplateAttachment.sprint_template_id)
                    .where(
                        RecCandidateSprint.public_token == token,
                        RecSprintAttachment.sprint_attachment_id == attachment_id,
                    )
                )
            ).first()
        if fallback:
            attachment, sprint = fallback
    if not attachment or not sprint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    _assert_public_sprint_active(sprint)

    data, content_type, file_name = await anyio.to_thread.run_sync(lambda: download_drive_file(attachment.drive_file_id))
    headers = {"Content-Disposition": f'attachment; filename="{file_name}"'}
    return StreamingResponse(io.BytesIO(data), media_type=content_type, headers=headers)
