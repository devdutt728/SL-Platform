from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_db_session,
    get_platform_db_session,
    require_admin,
    require_edit,
    require_publish,
    require_view,
)
from app.models.people import (
    OrgChangeLog,
    OrgDraft,
    OrgEmployee,
    OrgGroup,
    OrgPrincipal,
)
from app.schemas.org import (
    ChangeLogDetail,
    ChangeLogItem,
    ChangeLogList,
    DraftDetail,
    DraftPut,
    DraftState,
    GroupCreate,
    GroupInfo,
    GroupPatch,
    IncludeRequest,
    MoveRequest,
    MoveResult,
    OrgLive,
    OverrideRequest,
    PrincipalInfo,
    PublishRequest,
)
from app.schemas.user import UserContext
from app.services import org as org_service

router = APIRouter(prefix="/ppl/org", tags=["org"])


def _group_info(g: OrgGroup) -> GroupInfo:
    return GroupInfo(
        group_key=g.group_key,
        name=g.name,
        principal_name=g.principal_name,
        team_lead_emp=g.team_lead_emp,
        parent_name=g.parent_name,
        color_hex=g.color_hex,
        sort_order=g.sort_order,
        is_active=g.is_active,
    )


# ── Read ──────────────────────────────────────────────────────────────────────
@router.get("/live", response_model=OrgLive)
async def get_live(
    user: UserContext = Depends(require_view),
    db: AsyncSession = Depends(get_db_session),
    platform: AsyncSession = Depends(get_platform_db_session),
) -> OrgLive:
    """Current org tree, reconciled with active dim_person employees."""
    await org_service.sync_missing_dim_people_to_org(db, platform)
    log = await org_service.latest_change_log(db)
    snap = await org_service.build_live_tree(db, platform)
    await db.commit()
    return OrgLive(
        principals=snap["principals"],
        generated_at=datetime.utcnow(),
        source="live",
        last_log_id=log.id if log else None,
    )


@router.get("/groups", response_model=list[GroupInfo])
async def get_groups(
    user: UserContext = Depends(require_view),
    db: AsyncSession = Depends(get_db_session),
) -> list[GroupInfo]:
    rows = (
        await db.execute(select(OrgGroup).order_by(OrgGroup.principal_name, OrgGroup.sort_order))
    ).scalars().all()
    return [
        _group_info(g)
        for g in rows
    ]


@router.get("/principals", response_model=list[PrincipalInfo])
async def get_principals(
    user: UserContext = Depends(require_view),
    db: AsyncSession = Depends(get_db_session),
) -> list[PrincipalInfo]:
    rows = (
        await db.execute(select(OrgPrincipal).order_by(OrgPrincipal.sort_order))
    ).scalars().all()
    return [
        PrincipalInfo(name=p.name, color=p.color, employee_no=p.employee_no, sort_order=p.sort_order)
        for p in rows
    ]


# ── Group master / move / include / override ──────────────────────────────────
@router.post("/groups", response_model=GroupInfo, status_code=status.HTTP_201_CREATED)
async def create_group(
    body: GroupCreate,
    user: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> GroupInfo:
    key = body.group_key.strip()
    if not key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="group_key is required")
    exists = (
        await db.execute(select(OrgGroup.id).where(OrgGroup.group_key == key))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="group_key already exists")
    principal = (
        await db.execute(select(OrgPrincipal).where(OrgPrincipal.name == body.principal_name))
    ).scalar_one_or_none()
    if not principal:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="principal_name does not exist")
    group = OrgGroup(
        group_key=key,
        name=body.name.strip(),
        principal_name=body.principal_name,
        team_lead_emp=body.team_lead_emp,
        parent_name=body.parent_name,
        color_hex=body.color_hex,
        sort_order=body.sort_order,
        is_active=body.is_active,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return _group_info(group)


@router.patch("/groups/{group_key}", response_model=GroupInfo)
async def patch_group(
    group_key: str,
    body: GroupPatch,
    user: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> GroupInfo:
    group = (
        await db.execute(select(OrgGroup).where(OrgGroup.group_key == group_key))
    ).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    data = body.model_dump(exclude_unset=True)
    old_key = group.group_key
    if "group_key" in data and data["group_key"]:
        new_key = str(data["group_key"]).strip()
        assigned = (
            await db.execute(select(func.count()).select_from(OrgEmployee).where(OrgEmployee.group_key == old_key))
        ).scalar_one()
        if assigned:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="group_key cannot be changed while employees are assigned",
            )
        exists = (
            await db.execute(select(OrgGroup.id).where(OrgGroup.group_key == new_key, OrgGroup.id != group.id))
        ).scalar_one_or_none()
        if exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="group_key already exists")
        group.group_key = new_key
    if "principal_name" in data and data["principal_name"]:
        principal = (
            await db.execute(select(OrgPrincipal).where(OrgPrincipal.name == data["principal_name"]))
        ).scalar_one_or_none()
        if not principal:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="principal_name does not exist")
        group.principal_name = data["principal_name"]
    for key in ("name", "team_lead_emp", "parent_name", "color_hex", "sort_order", "is_active"):
        if key in data:
            setattr(group, key, data[key])

    org_rows = (
        await db.execute(select(OrgEmployee).where(OrgEmployee.group_key == old_key))
    ).scalars().all()
    for row in org_rows:
        row.group_key = group.group_key
        row.principal_name = group.principal_name
        row.updated_at = datetime.utcnow()
        row.updated_by_person_id = user.person_id_platform

    await db.commit()
    await db.refresh(group)
    return _group_info(group)


@router.delete("/groups/{group_key}")
async def delete_group(
    group_key: str,
    user: UserContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    group = (
        await db.execute(select(OrgGroup).where(OrgGroup.group_key == group_key))
    ).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    assigned = (
        await db.execute(select(func.count()).select_from(OrgEmployee).where(OrgEmployee.group_key == group_key))
    ).scalar_one()
    if assigned:
        group.is_active = False
        await db.commit()
        return {"deleted": False, "deactivated": True, "assigned_count": int(assigned)}
    await db.delete(group)
    await db.commit()
    return {"deleted": True, "deactivated": False, "assigned_count": 0}


@router.post("/move", response_model=MoveResult)
async def move_employee(
    body: MoveRequest,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
    platform: AsyncSession = Depends(get_platform_db_session),
) -> MoveResult:
    """Port of Code.gs moveEmployee — set group_key + denormalised principal."""
    group = (
        await db.execute(select(OrgGroup).where(OrgGroup.group_key == body.newGroupKey))
    ).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown group key: {body.newGroupKey}")

    row = (
        await db.execute(select(OrgEmployee).where(OrgEmployee.employee_no == body.empNo))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Employee {body.empNo} not found in org")

    row.group_key = group.group_key
    row.principal_name = group.principal_name
    row.updated_at = datetime.utcnow()
    row.updated_by_person_id = user.person_id_platform
    await db.commit()

    # Resolve a display name for the response.
    from app.models.platform_person import DimPerson

    dp = (
        await platform.execute(select(DimPerson).where(DimPerson.person_code == body.empNo))
    ).scalar_one_or_none()
    name = (dp.full_name or dp.display_name) if dp else body.empNo
    return MoveResult(ok=True, name=name or body.empNo, team=group.name)


@router.patch("/employees/{emp_no}/include")
async def toggle_include(
    emp_no: str, body: IncludeRequest,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = (
        await db.execute(select(OrgEmployee).where(OrgEmployee.employee_no == emp_no))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not in org")
    row.include_in_org = body.include_in_org
    row.updated_at = datetime.utcnow()
    row.updated_by_person_id = user.person_id_platform
    await db.commit()
    return {"employee_no": emp_no, "include_in_org": row.include_in_org}


@router.patch("/employees/{emp_no}/override")
async def set_override(
    emp_no: str, body: OverrideRequest,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = (
        await db.execute(select(OrgEmployee).where(OrgEmployee.employee_no == emp_no))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not in org")
    row.manager_override_emp = body.manager_override_emp
    row.updated_at = datetime.utcnow()
    row.updated_by_person_id = user.person_id_platform
    await db.commit()
    return {"employee_no": emp_no, "manager_override_emp": row.manager_override_emp}


# ── Drafts ────────────────────────────────────────────────────────────────────
@router.get("/drafts", response_model=list[DraftState])
async def list_drafts(
    user: UserContext = Depends(require_view),
    db: AsyncSession = Depends(get_db_session),
) -> list[DraftState]:
    rows = (await db.execute(select(OrgDraft))).scalars().all()
    by_slot = {d.slot_number: d for d in rows}
    out: list[DraftState] = []
    for slot in (1, 2, 3):
        d = by_slot.get(slot)
        if d:
            out.append(DraftState(
                slot_number=slot, draft_name=d.draft_name,
                moves_count=len(d.moves_json or []), status=d.status,
                updated_by=d.updated_by, updated_at=d.updated_at,
            ))
        else:
            out.append(DraftState(slot_number=slot, status="empty"))
    return out


@router.get("/drafts/{slot}", response_model=DraftDetail)
async def get_draft(
    slot: int,
    user: UserContext = Depends(require_view),
    db: AsyncSession = Depends(get_db_session),
) -> DraftDetail:
    d = (
        await db.execute(select(OrgDraft).where(OrgDraft.slot_number == slot))
    ).scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft slot empty")
    return DraftDetail(
        slot_number=d.slot_number, draft_name=d.draft_name,
        moves_json=d.moves_json or [], full_snapshot=d.full_snapshot or {},
        status=d.status, updated_at=d.updated_at,
    )


@router.put("/drafts/{slot}", response_model=DraftState)
async def save_draft(
    slot: int, body: DraftPut,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> DraftState:
    if slot not in (1, 2, 3):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Slot must be 1-3")
    moves = [m.model_dump() for m in body.moves_json]
    now = datetime.utcnow()
    d = (
        await db.execute(select(OrgDraft).where(OrgDraft.slot_number == slot))
    ).scalar_one_or_none()
    if d:
        d.draft_name = body.draft_name
        d.moves_json = moves
        d.full_snapshot = body.full_snapshot
        d.status = "active"
        d.updated_by = user.person_id_platform
        d.updated_at = now
    else:
        d = OrgDraft(
            slot_number=slot, draft_name=body.draft_name, moves_json=moves,
            full_snapshot=body.full_snapshot, status="active",
            created_by=user.person_id_platform, updated_by=user.person_id_platform,
        )
        db.add(d)
    await db.commit()
    return DraftState(
        slot_number=slot, draft_name=body.draft_name, moves_count=len(moves),
        status="active", updated_by=user.person_id_platform, updated_at=now,
    )


@router.delete("/drafts/{slot}")
async def clear_draft(
    slot: int,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    d = (
        await db.execute(select(OrgDraft).where(OrgDraft.slot_number == slot))
    ).scalar_one_or_none()
    if d:
        await db.delete(d)
        await db.commit()
    return {"slot": slot, "cleared": True}


# ── Publish / revert / changelog ──────────────────────────────────────────────
@router.post("/publish/{slot}", response_model=ChangeLogItem)
async def publish_draft(
    slot: int, body: PublishRequest,
    user: UserContext = Depends(require_publish),
    db: AsyncSession = Depends(get_db_session),
    platform: AsyncSession = Depends(get_platform_db_session),
) -> ChangeLogItem:
    if not body.confirm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="confirm must be true")
    await org_service.sync_missing_dim_people_to_org(db, platform, performed_by=user.person_id_platform or user.email)
    d = (
        await db.execute(select(OrgDraft).where(OrgDraft.slot_number == slot))
    ).scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft slot empty")

    # Snapshot before = current live tree.
    before_log = await org_service.latest_change_log(db)
    before = before_log.snapshot_after if before_log and before_log.snapshot_after else await org_service.build_live_tree(db, platform)

    # Apply each move to org_employee.
    for m in (d.moves_json or []):
        emp_no = m.get("empNo")
        to_key = m.get("toGroupKey")
        if not emp_no or not to_key:
            continue
        group = (
            await db.execute(select(OrgGroup).where(OrgGroup.group_key == to_key))
        ).scalar_one_or_none()
        if not group:
            continue
        row = (
            await db.execute(select(OrgEmployee).where(OrgEmployee.employee_no == emp_no))
        ).scalar_one_or_none()
        if not row:
            continue
        row.group_key = group.group_key
        row.principal_name = group.principal_name
        row.updated_at = datetime.utcnow()
        row.updated_by_person_id = user.person_id_platform

    await db.flush()
    after = await org_service.build_live_tree(db, platform)
    diff = org_service.diff_snapshots(before, after)

    log = OrgChangeLog(
        action="publish",
        performed_by_person_id=user.person_id_platform or user.email,
        draft_name=d.draft_name,
        snapshot_before=before,
        snapshot_after=after,
        diff_summary=diff,
    )
    db.add(log)
    # Clear the published slot.
    await db.delete(d)
    await db.commit()

    return ChangeLogItem(
        id=log.id, action="publish", performed_by_person_id=log.performed_by_person_id,
        performed_at=log.performed_at, draft_name=log.draft_name, changes_count=len(diff),
    )


@router.get("/changelog", response_model=ChangeLogList)
async def list_changelog(
    page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
    user: UserContext = Depends(require_view),
    db: AsyncSession = Depends(get_db_session),
) -> ChangeLogList:
    total = (await db.execute(select(func.count()).select_from(OrgChangeLog))).scalar_one()
    rows = (
        await db.execute(
            select(OrgChangeLog).order_by(OrgChangeLog.performed_at.desc())
            .offset((page - 1) * limit).limit(limit)
        )
    ).scalars().all()
    items = [
        ChangeLogItem(
            id=r.id, action=r.action, performed_by_person_id=r.performed_by_person_id,
            performed_at=r.performed_at, draft_name=r.draft_name,
            changes_count=len(r.diff_summary or []),
        )
        for r in rows
    ]
    return ChangeLogList(items=items, total=total, page=page, limit=limit)


@router.get("/changelog/{log_id}", response_model=ChangeLogDetail)
async def get_changelog(
    log_id: str,
    user: UserContext = Depends(require_view),
    db: AsyncSession = Depends(get_db_session),
) -> ChangeLogDetail:
    r = await db.get(OrgChangeLog, log_id)
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")
    return ChangeLogDetail(
        id=r.id, action=r.action, performed_by_person_id=r.performed_by_person_id,
        performed_at=r.performed_at, draft_name=r.draft_name,
        diff_summary=r.diff_summary or [], snapshot_after=r.snapshot_after or {},
    )


@router.post("/revert/{log_id}", response_model=ChangeLogItem)
async def revert(
    log_id: str,
    user: UserContext = Depends(require_publish),
    db: AsyncSession = Depends(get_db_session),
    platform: AsyncSession = Depends(get_platform_db_session),
) -> ChangeLogItem:
    """Re-publish a past snapshot_after: rewrite org_employee group keys to match."""
    await org_service.sync_missing_dim_people_to_org(db, platform, performed_by=user.person_id_platform or user.email)
    target = await db.get(OrgChangeLog, log_id)
    if not target or not target.snapshot_after:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")

    before_log = await org_service.latest_change_log(db)
    before = before_log.snapshot_after if before_log and before_log.snapshot_after else await org_service.build_live_tree(db, platform)

    # Apply the target snapshot's group placements back onto org_employee.
    target_index = org_service.index_snapshot_members(target.snapshot_after)
    for emp_no, info in target_index.items():
        to_key = info.get("groupKey")
        if not to_key:
            continue
        row = (
            await db.execute(select(OrgEmployee).where(OrgEmployee.employee_no == emp_no))
        ).scalar_one_or_none()
        if not row:
            continue
        group = (
            await db.execute(select(OrgGroup).where(OrgGroup.group_key == to_key))
        ).scalar_one_or_none()
        if not group:
            continue
        row.group_key = group.group_key
        row.principal_name = group.principal_name
        row.updated_at = datetime.utcnow()
        row.updated_by_person_id = user.person_id_platform

    await db.flush()
    after = await org_service.build_live_tree(db, platform)
    diff = org_service.diff_snapshots(before, after)

    log = OrgChangeLog(
        action="revert",
        performed_by_person_id=user.person_id_platform or user.email,
        draft_name=target.draft_name,
        snapshot_before=before,
        snapshot_after=after,
        diff_summary=diff,
        reverted_from_log_id=target.id,
    )
    db.add(log)
    await db.commit()
    return ChangeLogItem(
        id=log.id, action="revert", performed_by_person_id=log.performed_by_person_id,
        performed_at=log.performed_at, draft_name=log.draft_name, changes_count=len(diff),
    )
