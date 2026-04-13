from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.auth import get_current_user
from app.models.planner import (
    PlannerActivityDependency,
    PlannerAuditLog,
    PlannerChangeRequest,
    PlannerDocument,
    PlannerDocumentVersion,
    PlannerProjectBaseline,
)
from app.schemas.planner import (
    PlannerAuditLogOut,
    PlannerBaselineCreate,
    PlannerBaselineOut,
    PlannerChangeRequestCreate,
    PlannerChangeRequestOut,
    PlannerDecisionIn,
    PlannerDependencyCreate,
    PlannerDependencyOut,
    PlannerDocumentOut,
    PlannerDocumentVersionOut,
    PlannerScheduleRunOut,
)
from app.schemas.user import UserContext
from app.services.planner_audit import dumps_json, log_audit_event, planner_row_snapshot
from app.services.planner_scheduler import recalculate_project_schedule
from app.services.planner_storage import store_document_file
from app.api.routes.planner import _can_edit_row, _load_visible_row, _resolve_actor, _visible_project_codes

router = APIRouter(prefix="/planner", tags=["planner-ops"])


def _serialize_dependency(edge: PlannerActivityDependency) -> PlannerDependencyOut:
    return PlannerDependencyOut(
        dependency_id=edge.dependency_id,
        project_code=edge.project_code,
        planner_row_id=edge.planner_row_id,
        predecessor_row_id=edge.predecessor_row_id,
        dependency_type=edge.dependency_type,  # type: ignore[arg-type]
        lag_days=edge.lag_days,
        created_by_person_id=edge.created_by_person_id,
        updated_by_person_id=edge.updated_by_person_id,
        created_at=edge.created_at,
        updated_at=edge.updated_at,
    )


def _serialize_request(request: PlannerChangeRequest) -> PlannerChangeRequestOut:
    return PlannerChangeRequestOut(
        request_id=request.request_id,
        planner_row_id=request.planner_row_id,
        project_code=request.project_code,
        request_type=request.request_type,  # type: ignore[arg-type]
        request_status=request.request_status,  # type: ignore[arg-type]
        requested_by_person_id=request.requested_by_person_id,
        requester_role=request.requester_role,
        approver_person_id=request.approver_person_id,
        approver_role=request.approver_role,
        request_reason=request.request_reason,
        approval_note=request.approval_note,
        before_json=request.before_json,
        proposed_json=request.proposed_json,
        decided_at=request.decided_at,
        created_at=request.created_at,
        updated_at=request.updated_at,
    )


def _serialize_audit(entry: PlannerAuditLog) -> PlannerAuditLogOut:
    return PlannerAuditLogOut(
        audit_log_id=entry.audit_log_id,
        planner_row_id=entry.planner_row_id,
        project_code=entry.project_code,
        entity_type=entry.entity_type,
        entity_id=entry.entity_id,
        action_type=entry.action_type,
        change_summary=entry.change_summary,
        before_json=entry.before_json,
        after_json=entry.after_json,
        request_id=entry.request_id,
        actor_person_id=entry.actor_person_id,
        actor_role=entry.actor_role,
        created_at=entry.created_at,
    )


def _serialize_document_version(version: PlannerDocumentVersion) -> PlannerDocumentVersionOut:
    return PlannerDocumentVersionOut(
        document_version_id=version.document_version_id,
        document_id=version.document_id,
        version_no=version.version_no,
        original_filename=version.original_filename,
        stored_filename=version.stored_filename,
        mime_type=version.mime_type,
        file_size_bytes=version.file_size_bytes,
        storage_path=version.storage_path,
        checksum_sha256=version.checksum_sha256,
        version_note=version.version_note,
        uploaded_by_person_id=version.uploaded_by_person_id,
        uploaded_at=version.uploaded_at,
    )


def _serialize_document(document: PlannerDocument, versions: list[PlannerDocumentVersion]) -> PlannerDocumentOut:
    return PlannerDocumentOut(
        document_id=document.document_id,
        planner_row_id=document.planner_row_id,
        project_code=document.project_code,
        document_code=document.document_code,
        title=document.title,
        discipline_code=document.discipline_code,
        category=document.category,  # type: ignore[arg-type]
        current_version_no=document.current_version_no,
        status=document.status,  # type: ignore[arg-type]
        created_by_person_id=document.created_by_person_id,
        updated_by_person_id=document.updated_by_person_id,
        created_at=document.created_at,
        updated_at=document.updated_at,
        versions=[_serialize_document_version(version) for version in versions],
    )


def _serialize_baseline(baseline: PlannerProjectBaseline) -> PlannerBaselineOut:
    return PlannerBaselineOut(
        baseline_id=baseline.baseline_id,
        project_code=baseline.project_code,
        baseline_name=baseline.baseline_name,
        baseline_type=baseline.baseline_type,  # type: ignore[arg-type]
        snapshot_json=baseline.snapshot_json,
        created_by_person_id=baseline.created_by_person_id,
        created_at=baseline.created_at,
    )


async def _assert_project_visible(project_code: str, session: AsyncSession, actor, person_id: str | None) -> None:
    if actor.can_view_all:
        return
    visible_projects = await _visible_project_codes(session, actor, person_id)
    if not visible_projects or project_code not in visible_projects:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access restricted")


@router.get("/requests", response_model=list[PlannerChangeRequestOut])
async def list_change_requests(
    project_code: str | None = Query(default=None),
    request_status: str | None = Query(default=None),
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    visible_projects = await _visible_project_codes(session, actor, user.person_id_platform)
    if project_code and visible_projects is not None and project_code not in visible_projects:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access restricted")

    stmt = select(PlannerChangeRequest)
    if project_code:
        stmt = stmt.where(PlannerChangeRequest.project_code == project_code)
    elif visible_projects is not None:
        if not visible_projects:
            return []
        stmt = stmt.where(PlannerChangeRequest.project_code.in_(visible_projects))
    if request_status:
        stmt = stmt.where(PlannerChangeRequest.request_status == request_status)
    stmt = stmt.order_by(desc(PlannerChangeRequest.created_at), desc(PlannerChangeRequest.request_id))
    rows = (await session.execute(stmt)).scalars().all()
    return [_serialize_request(row) for row in rows]


@router.post("/{planner_row_id}/requests", response_model=PlannerChangeRequestOut, status_code=status.HTTP_201_CREATED)
async def create_change_request(
    planner_row_id: int,
    payload: PlannerChangeRequestCreate,
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    row = await _load_visible_row(planner_row_id, session=session, actor=actor, person_id=user.person_id_platform)
    if not _can_edit_row(actor, row, user.person_id_platform) and actor.role not in {"architect", "senior_architect"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    request_row = PlannerChangeRequest(
        planner_row_id=row.planner_row_id,
        project_code=row.project_code,
        request_type=payload.request_type,
        request_status="pending",
        requested_by_person_id=user.person_id_platform,
        requester_role=actor.role,
        request_reason=payload.request_reason,
        before_json=dumps_json(planner_row_snapshot(row)),
        proposed_json=dumps_json(payload.proposed_updates),
    )
    session.add(request_row)
    row.approval_status = "pending"
    row.requested_by_person_id = user.person_id_platform
    row.approval_requested_at = datetime.utcnow()
    row.updated_by_person_id = user.person_id_platform
    await session.flush()
    await log_audit_event(
        session,
        project_code=row.project_code,
        entity_type="change_request",
        entity_id=str(request_row.request_id),
        action_type="created",
        actor_person_id=user.person_id_platform,
        actor_role=actor.role,
        planner_row_id=row.planner_row_id,
        request_id=request_row.request_id,
        change_summary="Change request created",
        before_payload=planner_row_snapshot(row),
        after_payload={"request_reason": payload.request_reason, "proposed_updates": payload.proposed_updates},
    )
    await session.commit()
    await session.refresh(request_row)
    return _serialize_request(request_row)


@router.get("/audit", response_model=list[PlannerAuditLogOut])
async def list_audit_logs(
    project_code: str | None = Query(default=None),
    planner_row_id: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    visible_projects = await _visible_project_codes(session, actor, user.person_id_platform)
    if project_code and visible_projects is not None and project_code not in visible_projects:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access restricted")

    stmt = select(PlannerAuditLog)
    if planner_row_id is not None:
        row = await _load_visible_row(planner_row_id, session=session, actor=actor, person_id=user.person_id_platform)
        stmt = stmt.where(PlannerAuditLog.planner_row_id == row.planner_row_id)
    elif project_code:
        stmt = stmt.where(PlannerAuditLog.project_code == project_code)
    elif visible_projects is not None:
        if not visible_projects:
            return []
        stmt = stmt.where(PlannerAuditLog.project_code.in_(visible_projects))
    stmt = stmt.order_by(desc(PlannerAuditLog.created_at), desc(PlannerAuditLog.audit_log_id)).limit(limit)
    rows = (await session.execute(stmt)).scalars().all()
    return [_serialize_audit(row) for row in rows]


@router.get("/{planner_row_id}/dependencies", response_model=list[PlannerDependencyOut])
async def list_dependencies(
    planner_row_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    row = await _load_visible_row(planner_row_id, session=session, actor=actor, person_id=user.person_id_platform)
    edges = (
        await session.execute(
            select(PlannerActivityDependency)
            .where(PlannerActivityDependency.planner_row_id == row.planner_row_id)
            .order_by(PlannerActivityDependency.dependency_id.asc())
        )
    ).scalars().all()
    return [_serialize_dependency(edge) for edge in edges]


@router.post("/{planner_row_id}/dependencies", response_model=PlannerDependencyOut, status_code=status.HTTP_201_CREATED)
async def create_dependency(
    planner_row_id: int,
    payload: PlannerDependencyCreate,
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    row = await _load_visible_row(planner_row_id, session=session, actor=actor, person_id=user.person_id_platform)
    predecessor = await _load_visible_row(payload.predecessor_row_id, session=session, actor=actor, person_id=user.person_id_platform)
    if row.project_code != predecessor.project_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dependencies must stay within one project")
    if not _can_edit_row(actor, row, user.person_id_platform):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    edge = PlannerActivityDependency(
        project_code=row.project_code,
        planner_row_id=row.planner_row_id,
        predecessor_row_id=payload.predecessor_row_id,
        dependency_type=payload.dependency_type,
        lag_days=payload.lag_days,
        created_by_person_id=user.person_id_platform,
        updated_by_person_id=user.person_id_platform,
    )
    session.add(edge)
    await session.flush()
    result = await recalculate_project_schedule(session, row.project_code)
    await log_audit_event(
        session,
        project_code=row.project_code,
        entity_type="dependency",
        entity_id=str(edge.dependency_id),
        action_type="created",
        actor_person_id=user.person_id_platform,
        actor_role=actor.role,
        planner_row_id=row.planner_row_id,
        change_summary="Dependency created",
        after_payload={"recalculated_rows": result.recalculated_rows, "predecessor_row_id": payload.predecessor_row_id},
    )
    await session.commit()
    await session.refresh(edge)
    return _serialize_dependency(edge)


@router.delete("/dependencies/{dependency_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dependency(
    dependency_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    edge = await session.get(PlannerActivityDependency, dependency_id)
    if not edge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dependency not found")
    row = await _load_visible_row(edge.planner_row_id, session=session, actor=actor, person_id=user.person_id_platform)
    if not _can_edit_row(actor, row, user.person_id_platform):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    before = {"dependency_id": edge.dependency_id, "planner_row_id": edge.planner_row_id, "predecessor_row_id": edge.predecessor_row_id}
    await session.delete(edge)
    result = await recalculate_project_schedule(session, row.project_code)
    await log_audit_event(
        session,
        project_code=row.project_code,
        entity_type="dependency",
        entity_id=str(dependency_id),
        action_type="deleted",
        actor_person_id=user.person_id_platform,
        actor_role=actor.role,
        planner_row_id=row.planner_row_id,
        change_summary="Dependency removed",
        before_payload=before,
        after_payload={"recalculated_rows": result.recalculated_rows},
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/projects/{project_code}/recalculate", response_model=PlannerScheduleRunOut)
async def recalculate_schedule_for_project(
    project_code: str,
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    await _assert_project_visible(project_code, session, actor, user.person_id_platform)
    if not actor.can_edit_scoped and not actor.can_hard_delete:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    result = await recalculate_project_schedule(session, project_code)
    await log_audit_event(
        session,
        project_code=project_code,
        entity_type="schedule",
        entity_id=project_code,
        action_type="recalculated",
        actor_person_id=user.person_id_platform,
        actor_role=actor.role,
        change_summary="Manual schedule recalculation",
        after_payload={"recalculated_rows": result.recalculated_rows, "critical_rows": result.critical_rows},
    )
    await session.commit()
    return PlannerScheduleRunOut(
        project_code=project_code,
        recalculated_rows=result.recalculated_rows,
        critical_rows=result.critical_rows,
        updated_dependency_codes=result.updated_dependency_codes,
        ran_at=result.ran_at,
    )


@router.post("/projects/{project_code}/baselines", response_model=PlannerBaselineOut, status_code=status.HTTP_201_CREATED)
async def create_project_baseline(
    project_code: str,
    payload: PlannerBaselineCreate,
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    await _assert_project_visible(project_code, session, actor, user.person_id_platform)
    if not actor.can_edit_scoped and not actor.can_hard_delete:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    rows = (
        await session.execute(
            select(PlannerChangeRequest).where(PlannerChangeRequest.project_code == project_code)
        )
    ).scalars().all()
    baseline = PlannerProjectBaseline(
        project_code=project_code,
        baseline_name=payload.baseline_name,
        baseline_type=payload.baseline_type,
        snapshot_json=dumps_json([_serialize_request(row).model_dump() for row in rows]),
        created_by_person_id=user.person_id_platform,
    )
    session.add(baseline)
    await session.flush()
    await log_audit_event(
        session,
        project_code=project_code,
        entity_type="baseline",
        entity_id=str(baseline.baseline_id),
        action_type="created",
        actor_person_id=user.person_id_platform,
        actor_role=actor.role,
        change_summary=f"Baseline {payload.baseline_name} created",
        after_payload={"baseline_name": payload.baseline_name, "baseline_type": payload.baseline_type},
    )
    await session.commit()
    await session.refresh(baseline)
    return _serialize_baseline(baseline)


@router.get("/projects/{project_code}/baselines", response_model=list[PlannerBaselineOut])
async def list_project_baselines(
    project_code: str,
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    await _assert_project_visible(project_code, session, actor, user.person_id_platform)
    baselines = (
        await session.execute(
            select(PlannerProjectBaseline)
            .where(PlannerProjectBaseline.project_code == project_code)
            .order_by(desc(PlannerProjectBaseline.created_at), desc(PlannerProjectBaseline.baseline_id))
        )
    ).scalars().all()
    return [_serialize_baseline(baseline) for baseline in baselines]


@router.get("/{planner_row_id}/documents", response_model=list[PlannerDocumentOut])
async def list_documents(
    planner_row_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    row = await _load_visible_row(planner_row_id, session=session, actor=actor, person_id=user.person_id_platform)
    documents = (
        await session.execute(
            select(PlannerDocument)
            .where(PlannerDocument.planner_row_id == row.planner_row_id)
            .order_by(desc(PlannerDocument.updated_at), desc(PlannerDocument.document_id))
        )
    ).scalars().all()
    if not documents:
        return []
    versions = (
        await session.execute(
            select(PlannerDocumentVersion).where(PlannerDocumentVersion.document_id.in_([document.document_id for document in documents]))
        )
    ).scalars().all()
    version_map: dict[int, list[PlannerDocumentVersion]] = {}
    for version in versions:
        version_map.setdefault(version.document_id, []).append(version)
    for doc_versions in version_map.values():
        doc_versions.sort(key=lambda value: value.version_no, reverse=True)
    return [_serialize_document(document, version_map.get(document.document_id, [])) for document in documents]


@router.post("/{planner_row_id}/documents", response_model=PlannerDocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    planner_row_id: int,
    title: str = Form(...),
    category: str = Form("general"),
    discipline_code: str | None = Form(default=None),
    version_note: str | None = Form(default=None),
    document_code: str | None = Form(default=None),
    document_id: int | None = Form(default=None),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    row = await _load_visible_row(planner_row_id, session=session, actor=actor, person_id=user.person_id_platform)
    if not _can_edit_row(actor, row, user.person_id_platform):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    document = await session.get(PlannerDocument, document_id) if document_id else None
    if document and document.project_code != row.project_code:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if document is None:
        document = PlannerDocument(
            planner_row_id=row.planner_row_id,
            project_code=row.project_code,
            document_code=document_code or f"DOC-{row.project_code}-{row.planner_row_id}-{int(datetime.utcnow().timestamp())}",
            title=title,
            discipline_code=discipline_code or row.discipline_code,
            category=category,
            current_version_no=0,
            status="active",
            created_by_person_id=user.person_id_platform,
            updated_by_person_id=user.person_id_platform,
        )
        session.add(document)
        await session.flush()

    stored = await store_document_file(row.project_code, row.planner_row_id, file)
    version = PlannerDocumentVersion(
        document_id=document.document_id,
        version_no=document.current_version_no + 1,
        original_filename=file.filename or "upload.bin",
        stored_filename=str(stored["stored_filename"]),
        mime_type=file.content_type,
        file_size_bytes=int(stored["file_size_bytes"] or 0),
        storage_path=str(stored["storage_path"]),
        checksum_sha256=str(stored["checksum_sha256"]),
        version_note=version_note,
        uploaded_by_person_id=user.person_id_platform,
    )
    document.title = title
    document.category = category
    document.current_version_no += 1
    document.status = "active"
    document.updated_by_person_id = user.person_id_platform
    session.add(version)
    await session.flush()
    await log_audit_event(
        session,
        project_code=row.project_code,
        entity_type="document_version",
        entity_id=str(version.document_version_id),
        action_type="uploaded",
        actor_person_id=user.person_id_platform,
        actor_role=actor.role,
        planner_row_id=row.planner_row_id,
        change_summary="Document uploaded",
        after_payload={"document_id": document.document_id, "version_no": version.version_no, "title": title},
    )
    await session.commit()
    await session.refresh(document)
    await session.refresh(version)
    return _serialize_document(document, [version])


@router.get("/documents/{document_id}", response_model=PlannerDocumentOut)
async def get_document(
    document_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    document = await session.get(PlannerDocument, document_id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await _assert_project_visible(document.project_code, session, actor, user.person_id_platform)
    versions = (
        await session.execute(
            select(PlannerDocumentVersion)
            .where(PlannerDocumentVersion.document_id == document.document_id)
            .order_by(desc(PlannerDocumentVersion.version_no))
        )
    ).scalars().all()
    return _serialize_document(document, versions)


@router.get("/document-versions/{document_version_id}/download")
async def download_document_version(
    document_version_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    version = await session.get(PlannerDocumentVersion, document_version_id)
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document version not found")
    document = await session.get(PlannerDocument, version.document_id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await _assert_project_visible(document.project_code, session, actor, user.person_id_platform)
    return FileResponse(path=version.storage_path, filename=version.original_filename, media_type=version.mime_type or "application/octet-stream")
