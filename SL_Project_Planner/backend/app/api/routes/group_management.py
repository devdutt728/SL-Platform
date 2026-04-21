from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.routes.planner import _resolve_actor
from app.models.platform_group import DimGroup, GroupMemberChangeLog
from app.models.platform_person import DimPerson, DimPersonFeatureAccess
from app.schemas.group_management import (
    GroupMemberAddIn,
    GroupLeaderCandidateOut,
    GroupLeaderAssignIn,
    GroupLeaderAssignOut,
    GroupMemberLogOut,
    GroupMemberMutationOut,
    GroupPersonOut,
    GroupSummaryOut,
    GroupWorkspaceOut,
)
from app.schemas.user import UserContext
from app.services.planner_role_access import list_explicit_planner_roles
from app.services.platform_feature_access import PLANNER_APP_FEATURE_CODE

router = APIRouter(prefix="/planner/groups", tags=["planner-groups"])

ACTIVE_STATUSES = {"working", "active", ""}
_log_table_ready = False


def _normalize_status(value: object) -> str:
    return str(value or "").strip().lower()


def _is_active_person(person: DimPerson | None) -> bool:
    if person is None:
        return False
    if int(person.is_deleted or 0) == 1:
        return False
    return _normalize_status(person.status) in ACTIVE_STATUSES


def _parse_member_ids(raw_value: str | None) -> list[str]:
    values = []
    seen: set[str] = set()
    for token in str(raw_value or "").split(","):
        person_id = token.strip()
        if not person_id or person_id in seen:
            continue
        seen.add(person_id)
        values.append(person_id)
    return values


def _serialize_member_ids(member_ids: list[str]) -> str:
    return ",".join(member_ids)


def _person_display_name(person: DimPerson | None, fallback_id: str) -> str:
    if person is None:
        return fallback_id
    fallback = " ".join(part for part in [str(person.first_name or "").strip(), str(person.last_name or "").strip()] if part).strip()
    return str(person.display_name or person.full_name or fallback or person.email or fallback_id).strip()


async def _ensure_group_log_table(session: AsyncSession) -> None:
    global _log_table_ready
    if _log_table_ready:
        return
    await session.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS group_member_change_log (
              log_id BIGINT NOT NULL AUTO_INCREMENT,
              group_id INT NOT NULL,
              person_id VARCHAR(64) NOT NULL,
              action_code VARCHAR(64) NOT NULL,
              reason VARCHAR(255) NULL,
              actor_person_id VARCHAR(64) NULL,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (log_id),
              KEY idx_group_member_change_log_group (group_id),
              KEY idx_group_member_change_log_person (person_id),
              KEY idx_group_member_change_log_actor (actor_person_id),
              KEY idx_group_member_change_log_created (created_at)
            )
            """
        )
    )
    await session.commit()
    _log_table_ready = True


def _group_summary(group: DimGroup, leader_name: str | None = None) -> GroupSummaryOut:
    member_ids = _parse_member_ids(group.member_person_ids)
    leader_person_id = str(group.group_leader_person_id or "").strip()
    member_count = len(member_ids) + (1 if leader_person_id and leader_person_id not in member_ids else 0)
    return GroupSummaryOut(
        group_id=group.group_id,
        group_code=group.group_code,
        group_name=group.group_name,
        status=group.status,
        group_leader_person_id=group.group_leader_person_id,
        group_leader_name=leader_name,
        member_count=member_count,
    )


async def _load_groups(session: AsyncSession, *, leader_person_id: str | None = None) -> list[DimGroup]:
    stmt = select(DimGroup).order_by(DimGroup.group_name.asc(), DimGroup.group_id.asc())
    if leader_person_id:
        stmt = stmt.where(DimGroup.group_leader_person_id == leader_person_id)
    return (await session.execute(stmt)).scalars().all()


def _pick_selected_group(groups: list[DimGroup], group_id: int | None) -> DimGroup | None:
    if not groups:
        return None
    if group_id is None:
        return groups[0]
    for group in groups:
        if int(group.group_id) == int(group_id):
            return group
    return None


async def _log_membership_change(
    session: AsyncSession,
    *,
    group_id: int,
    person_id: str,
    action_code: str,
    reason: str | None,
    actor_person_id: str | None,
) -> None:
    await _ensure_group_log_table(session)
    session.add(
        GroupMemberChangeLog(
            group_id=int(group_id),
            person_id=str(person_id),
            action_code=action_code,
            reason=(reason or None),
            actor_person_id=actor_person_id,
            created_at=datetime.utcnow(),
        )
    )


async def _cleanup_inactive_members(session: AsyncSession, groups: list[DimGroup], actor_person_id: str | None) -> None:
    member_ids = sorted({member_id for group in groups for member_id in _parse_member_ids(group.member_person_ids)})
    if not member_ids:
        return
    people = (
        await session.execute(select(DimPerson).where(DimPerson.person_id.in_(member_ids)))
    ).scalars().all()
    people_map = {person.person_id: person for person in people}
    changed = False
    for group in groups:
        current = _parse_member_ids(group.member_person_ids)
        retained: list[str] = []
        for person_id in current:
            person = people_map.get(person_id)
            if _is_active_person(person):
                retained.append(person_id)
                continue
            reason_status = _normalize_status(person.status if person else "missing") or "missing"
            await _log_membership_change(
                session,
                group_id=group.group_id,
                person_id=person_id,
                action_code="auto_removed_inactive",
                reason=f"status={reason_status}",
                actor_person_id=actor_person_id,
            )
            changed = True
        if retained != current:
            group.member_person_ids = _serialize_member_ids(retained)
            group.updated_at = datetime.utcnow()
            changed = True
    if changed:
        await session.commit()


def _person_out(
    person: DimPerson,
    *,
    assigned_group_id: int | None = None,
    assigned_group_name: str | None = None,
    already_member: bool = False,
) -> GroupPersonOut:
    return GroupPersonOut(
        person_id=person.person_id,
        person_code=person.person_code,
        full_name=_person_display_name(person, person.person_id),
        email=person.email,
        status=person.status,
        department=person.department,
        sub_department=person.sub_department,
        job_title=person.job_title,
        assigned_group_id=assigned_group_id,
        assigned_group_name=assigned_group_name,
        already_member=already_member,
    )


async def _actor_scope(platform_session: AsyncSession, user: UserContext) -> tuple[bool, str]:
    actor = await _resolve_actor(platform_session, user)
    actor_roles = set(actor.roles)
    if "super_admin" in actor_roles:
        if not user.person_id_platform:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid platform identity")
        return True, user.person_id_platform
    if "group_leader" in actor_roles and user.person_id_platform:
        return False, user.person_id_platform
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Group Leaders or Super Admin can manage groups")


@router.get("", response_model=GroupWorkspaceOut)
async def group_workspace(
    group_id: int | None = Query(default=None),
    q: str | None = Query(default=None),
    limit_candidates: int = Query(default=80, ge=10, le=250),
    limit_logs: int = Query(default=60, ge=10, le=250),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(deps.get_user),
):
    can_manage_all, actor_person_id = await _actor_scope(platform_session, user)
    groups = await _load_groups(platform_session, leader_person_id=None if can_manage_all else actor_person_id)
    await _cleanup_inactive_members(platform_session, groups, actor_person_id)

    selected_group = _pick_selected_group(groups, group_id)
    if group_id is not None and selected_group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found in your scope")

    leader_ids = sorted({group.group_leader_person_id for group in groups if group.group_leader_person_id})
    leaders = (
        await platform_session.execute(select(DimPerson).where(DimPerson.person_id.in_(leader_ids or [""])))
    ).scalars().all()
    leader_map = {person.person_id: _person_display_name(person, person.person_id) for person in leaders}

    group_summaries = [_group_summary(group, leader_map.get(group.group_leader_person_id or "")) for group in groups]
    if selected_group is None:
        return GroupWorkspaceOut(
            can_manage_all_groups=can_manage_all,
            groups=group_summaries,
            selected_group_id=None,
            members=[],
            candidates=[],
            membership_logs=[],
        )

    selected_member_ids = _parse_member_ids(selected_group.member_person_ids)
    selected_leader_id = str(selected_group.group_leader_person_id or "").strip()
    if selected_leader_id and selected_leader_id not in selected_member_ids:
        selected_member_ids = [selected_leader_id, *selected_member_ids]
    members = (
        await platform_session.execute(select(DimPerson).where(DimPerson.person_id.in_(selected_member_ids or [""])))
    ).scalars().all()
    member_map = {person.person_id: person for person in members}
    member_out = [
        _person_out(member_map[person_id], already_member=True)
        for person_id in selected_member_ids
        if person_id in member_map and _is_active_person(member_map[person_id])
    ]

    all_groups = await _load_groups(platform_session)
    person_to_group: dict[str, tuple[int, str]] = {}
    for group in all_groups:
        for person_id in _parse_member_ids(group.member_person_ids):
            person_to_group.setdefault(person_id, (group.group_id, group.group_name))
        leader_person_id = str(group.group_leader_person_id or "").strip()
        if leader_person_id:
            person_to_group.setdefault(leader_person_id, (group.group_id, group.group_name))

    people_stmt = select(DimPerson).where(
        or_(DimPerson.is_deleted.is_(None), DimPerson.is_deleted == 0),
        func.lower(func.coalesce(DimPerson.status, "")).in_(["working", "active", ""]),
    ).order_by(DimPerson.display_name.asc(), DimPerson.full_name.asc(), DimPerson.email.asc()).limit(limit_candidates)
    if q:
        pattern = f"%{q.strip()}%"
        people_stmt = people_stmt.where(
            (DimPerson.display_name.ilike(pattern))
            | (DimPerson.full_name.ilike(pattern))
            | (DimPerson.email.ilike(pattern))
            | (DimPerson.job_title.ilike(pattern))
            | (DimPerson.department.ilike(pattern))
        )
    candidates = (await platform_session.execute(people_stmt)).scalars().all()
    candidate_out: list[GroupPersonOut] = []
    for person in candidates:
        assigned_group = person_to_group.get(person.person_id)
        candidate_out.append(
            _person_out(
                person,
                assigned_group_id=assigned_group[0] if assigned_group else None,
                assigned_group_name=assigned_group[1] if assigned_group else None,
                already_member=person.person_id in selected_member_ids,
            )
        )

    await _ensure_group_log_table(platform_session)
    logs = (
        await platform_session.execute(
            select(GroupMemberChangeLog)
            .where(GroupMemberChangeLog.group_id == selected_group.group_id)
            .order_by(GroupMemberChangeLog.log_id.desc())
            .limit(limit_logs)
        )
    ).scalars().all()
    log_person_ids = sorted(
        {
            *[entry.person_id for entry in logs if entry.person_id],
            *[entry.actor_person_id for entry in logs if entry.actor_person_id],
        }
    )
    log_people = (
        await platform_session.execute(select(DimPerson).where(DimPerson.person_id.in_(log_person_ids or [""])))
    ).scalars().all()
    log_name_map = {person.person_id: _person_display_name(person, person.person_id) for person in log_people}
    log_out = [
        GroupMemberLogOut(
            log_id=int(entry.log_id),
            group_id=int(entry.group_id),
            person_id=entry.person_id,
            person_name=log_name_map.get(entry.person_id),
            action_code=entry.action_code,
            reason=entry.reason,
            actor_person_id=entry.actor_person_id,
            actor_name=log_name_map.get(entry.actor_person_id or ""),
            created_at=entry.created_at,
        )
        for entry in logs
    ]

    return GroupWorkspaceOut(
        can_manage_all_groups=can_manage_all,
        groups=group_summaries,
        selected_group_id=selected_group.group_id,
        members=member_out,
        candidates=candidate_out,
        membership_logs=log_out,
    )


@router.post("/{group_id}/members", response_model=GroupMemberMutationOut)
async def add_group_member(
    group_id: int,
    payload: GroupMemberAddIn,
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(deps.get_user),
):
    can_manage_all, actor_person_id = await _actor_scope(platform_session, user)
    scoped_groups = await _load_groups(platform_session, leader_person_id=None if can_manage_all else actor_person_id)
    selected_group = _pick_selected_group(scoped_groups, group_id)
    if selected_group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found in your scope")

    await _cleanup_inactive_members(platform_session, [selected_group], actor_person_id)
    current_members = _parse_member_ids(selected_group.member_person_ids)
    if payload.person_id in current_members:
        return GroupMemberMutationOut(group_id=group_id, person_id=payload.person_id, action_code="already_member", member_count=len(current_members))

    person = await platform_session.get(DimPerson, payload.person_id)
    if not _is_active_person(person):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only active working users can be added")

    all_groups = await _load_groups(platform_session)
    for group in all_groups:
        if int(group.group_id) == int(group_id):
            continue
        if payload.person_id in _parse_member_ids(group.member_person_ids):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Person is already assigned to group {group.group_name}",
            )

    current_members.append(payload.person_id)
    selected_group.member_person_ids = _serialize_member_ids(current_members)
    selected_group.updated_at = datetime.utcnow()
    await _log_membership_change(
        platform_session,
        group_id=selected_group.group_id,
        person_id=payload.person_id,
        action_code="added",
        reason=payload.reason or "manual add",
        actor_person_id=actor_person_id,
    )
    await platform_session.commit()
    return GroupMemberMutationOut(group_id=group_id, person_id=payload.person_id, action_code="added", member_count=len(current_members))


@router.delete("/{group_id}/members/{person_id}", response_model=GroupMemberMutationOut)
async def remove_group_member(
    group_id: int,
    person_id: str,
    reason: str | None = Query(default=None),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(deps.get_user),
):
    can_manage_all, actor_person_id = await _actor_scope(platform_session, user)
    scoped_groups = await _load_groups(platform_session, leader_person_id=None if can_manage_all else actor_person_id)
    selected_group = _pick_selected_group(scoped_groups, group_id)
    if selected_group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found in your scope")

    await _cleanup_inactive_members(platform_session, [selected_group], actor_person_id)
    current_members = _parse_member_ids(selected_group.member_person_ids)
    if person_id not in current_members:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person is not a member of this group")
    if str(selected_group.group_leader_person_id or "").strip() == str(person_id).strip():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Current group leader cannot be removed. Reassign group leader first.",
        )

    current_members = [value for value in current_members if value != person_id]
    selected_group.member_person_ids = _serialize_member_ids(current_members)
    selected_group.updated_at = datetime.utcnow()
    await _log_membership_change(
        platform_session,
        group_id=selected_group.group_id,
        person_id=person_id,
        action_code="removed",
        reason=reason or "manual remove",
        actor_person_id=actor_person_id,
    )
    await platform_session.commit()
    return GroupMemberMutationOut(group_id=group_id, person_id=person_id, action_code="removed", member_count=len(current_members))


@router.patch("/{group_id}/leader", response_model=GroupLeaderAssignOut)
async def assign_group_leader(
    group_id: int,
    payload: GroupLeaderAssignIn,
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(deps.get_user),
):
    actor = await _resolve_actor(platform_session, user)
    if "super_admin" not in set(actor.roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only super admin can assign group leaders")

    group = await platform_session.get(DimGroup, group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    previous_leader_person_id = str(group.group_leader_person_id or "").strip() or None
    next_leader_person_id = (payload.person_id or "").strip() or None
    if next_leader_person_id:
        person = await platform_session.get(DimPerson, next_leader_person_id)
        if not _is_active_person(person):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only active working users can be assigned as group leader")

        all_groups = await _load_groups(platform_session)
        for scoped_group in all_groups:
            if int(scoped_group.group_id) == int(group_id):
                continue
            scoped_leader_id = str(scoped_group.group_leader_person_id or "").strip()
            if scoped_leader_id == next_leader_person_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Person is already a group leader for {scoped_group.group_name}",
                )
            if next_leader_person_id in _parse_member_ids(scoped_group.member_person_ids):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Person is already assigned to group {scoped_group.group_name}",
                )

        current_members = _parse_member_ids(group.member_person_ids)
        if next_leader_person_id not in current_members:
            current_members.append(next_leader_person_id)
            group.member_person_ids = _serialize_member_ids(current_members)
            await _log_membership_change(
                platform_session,
                group_id=group.group_id,
                person_id=next_leader_person_id,
                action_code="added_as_group_leader",
                reason=payload.reason or "leader assignment",
                actor_person_id=user.person_id_platform,
            )

    group.group_leader_person_id = next_leader_person_id
    group.updated_at = datetime.utcnow()
    if previous_leader_person_id != next_leader_person_id and next_leader_person_id:
        await _log_membership_change(
            platform_session,
            group_id=group.group_id,
            person_id=next_leader_person_id,
            action_code="leader_assigned",
            reason=payload.reason or "manual leader assignment",
            actor_person_id=user.person_id_platform,
        )
    await platform_session.commit()

    return GroupLeaderAssignOut(group_id=group.group_id, group_leader_person_id=group.group_leader_person_id)


@router.get("/leader-candidates", response_model=list[GroupLeaderCandidateOut])
async def list_group_leader_candidates(
    q: str | None = Query(default=None),
    limit: int = Query(default=40, ge=10, le=200),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(deps.get_user),
):
    actor = await _resolve_actor(platform_session, user)
    if "super_admin" not in set(actor.roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only super admin can search group leader candidates")

    stmt = select(DimPerson).where(
        or_(DimPerson.is_deleted.is_(None), DimPerson.is_deleted == 0),
        func.lower(func.coalesce(DimPerson.status, "")).in_(["working", "active", ""]),
    )
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            (DimPerson.display_name.ilike(pattern))
            | (DimPerson.full_name.ilike(pattern))
            | (DimPerson.email.ilike(pattern))
            | (DimPerson.person_code.ilike(pattern))
            | (DimPerson.job_title.ilike(pattern))
            | (DimPerson.department.ilike(pattern))
        )
    stmt = stmt.order_by(DimPerson.display_name.asc(), DimPerson.full_name.asc(), DimPerson.email.asc()).limit(limit)
    people = (await platform_session.execute(stmt)).scalars().all()
    person_ids = [person.person_id for person in people]
    explicit_roles = await list_explicit_planner_roles(platform_session, person_ids)
    access_people = set(
        (
            await platform_session.execute(
                select(DimPersonFeatureAccess.person_id).where(
                    DimPersonFeatureAccess.feature_code == PLANNER_APP_FEATURE_CODE,
                    DimPersonFeatureAccess.person_id.in_(person_ids or [""]),
                )
            )
        ).scalars().all()
    )

    return [
        GroupLeaderCandidateOut(
            person_id=person.person_id,
            person_code=person.person_code,
            full_name=_person_display_name(person, person.person_id),
            email=person.email,
            status=person.status,
            department=person.department,
            sub_department=person.sub_department,
            job_title=person.job_title,
            planner_access=person.person_id in access_people,
            planner_roles=explicit_roles.get(person.person_id, []),
        )
        for person in people
    ]
