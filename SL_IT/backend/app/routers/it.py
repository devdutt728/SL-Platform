from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.roles import Role
from app.db.platform_session import get_platform_session
from app.db.session import get_session
from app.models.it import (
    ITAsset,
    ITCategory,
    ITLicense,
    ITLicenseAssignment,
    ITLicenseAttachment,
    ITLicenseCredential,
    ITCredential,
    ITVendor,
    ITRoutingRule,
    ITSlaPolicy,
    ITSubcategory,
    ITTicket,
    ITTicketComment,
)
from app.request_context import get_request_context
from app.rbac import require_employee, require_it_agent, require_it_lead
from app.schemas.it import (
    AssetCreate,
    AssetOut,
    AssetUpdate,
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    LicenseAssignmentCreate,
    LicenseAssignmentOut,
    LicenseCreate,
    LicenseOut,
    LicenseUpdate,
    SlaPolicyCreate,
    SlaPolicyOut,
    SlaPolicyUpdate,
    SubcategoryCreate,
    SubcategoryOut,
    SubcategoryUpdate,
    TicketAssign,
    TicketCommentCreate,
    TicketCommentOut,
    TicketCreate,
    TicketDetail,
    TicketListItem,
    TicketTransition,
    TicketUpdate,
    VendorCreate,
    VendorOut,
)
from app.schemas.user import UserContext
from app.services.audit_service import write_audit_log
from app.services.gmail_service import send_email
from app.services.platform_identity import resolve_identity_by_person_id
from app.services.user_service import is_active_status
from app.services.ticketing_service import (
    compute_sla_due,
    get_sla_policy,
    next_ticket_number,
    suggest_priority,
    validate_transition,
)
from app.constants import (
    IT_STATUS_CLOSED,
    IT_STATUS_IN_PROGRESS,
    IT_STATUS_OPEN,
    IT_STATUS_REOPENED,
    IT_STATUS_RESOLVED,
    IT_STATUS_TRIAGED,
    IT_STATUS_WAITING_ON_USER,
)

router = APIRouter(prefix="/it", tags=["it"])


def _is_it_role(user: UserContext) -> bool:
    return any(role in user.roles for role in [Role.IT_AGENT, Role.IT_LEAD, Role.ADMIN, Role.SUPERADMIN])


def _can_override_priority(user: UserContext) -> bool:
    return any(role in user.roles for role in [Role.IT_LEAD, Role.ADMIN, Role.SUPERADMIN])


def _map_platform_role(role_id: int | None, role_code: str | None) -> list[Role]:
    if role_id is not None and role_id in settings.role_map:
        mapped: list[Role] = []
        for role_name in settings.role_map[role_id]:
            try:
                mapped.append(Role(role_name))
            except Exception:
                continue
        return mapped or [Role.VIEWER]
    if role_code:
        try:
            return [Role(role_code.strip().lower())]
        except Exception:
            return [Role.VIEWER]
    return [Role.VIEWER]


@router.get("/categories", response_model=list[CategoryOut])
async def list_active_categories(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_employee()),
):
    result = await session.execute(
        select(ITCategory).where(ITCategory.is_active.is_(True)).order_by(ITCategory.name.asc())
    )
    return result.scalars().all()


@router.get("/subcategories", response_model=list[SubcategoryOut])
async def list_active_subcategories(
    category_id: int | None = None,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_employee()),
):
    stmt = select(ITSubcategory).where(ITSubcategory.is_active.is_(True))
    if category_id is not None:
        stmt = stmt.where(ITSubcategory.category_id == category_id)
    result = await session.execute(stmt.order_by(ITSubcategory.name.asc()))
    return result.scalars().all()


@router.post("/tickets", response_model=TicketDetail)
async def create_ticket(
    payload: TicketCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_employee()),
):
    if not user.person_id_platform:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="missing_platform_person_id")

    now = datetime.utcnow()
    window_start = now - timedelta(minutes=1)
    result = await session.execute(
        select(func.count(ITTicket.ticket_id))
        .where(ITTicket.requester_person_id == user.person_id_platform)
        .where(ITTicket.created_at >= window_start)
    )
    recent_count = result.scalar() or 0
    if recent_count >= settings.rate_limit_ticket_per_minute:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="rate_limited")

    priority = payload.priority or suggest_priority(payload.impact, payload.urgency)
    if payload.priority and not _can_override_priority(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="priority_override_not_allowed")

    sla_policy = await get_sla_policy(session, payload.category_id, priority)
    first_due, resolution_due = compute_sla_due(now, sla_policy)

    ticket_number = await next_ticket_number(session, now)
    ticket = ITTicket(
        ticket_number=ticket_number,
        requester_person_id=user.person_id_platform,
        requester_email=user.email,
        requester_name=user.full_name or user.email,
        category_id=payload.category_id,
        subcategory_id=payload.subcategory_id,
        priority=priority,
        impact=payload.impact,
        urgency=payload.urgency,
        status=IT_STATUS_OPEN,
        subject=payload.subject,
        description=payload.description,
        sla_policy_id=sla_policy.sla_policy_id if sla_policy else None,
        first_response_due_at=first_due,
        resolution_due_at=resolution_due,
    )
    session.add(ticket)
    await session.flush()

    await write_audit_log(
        session,
        actor=user,
        action="IT_TICKET_CREATE",
        entity_type="it_ticket",
        entity_id=str(ticket.ticket_id),
        before=None,
        after={"status": ticket.status, "priority": ticket.priority},
        context=get_request_context(request),
    )
    await session.commit()

    try:
        await run_in_threadpool(
            send_email,
            [user.email],
            f"Ticket created {ticket.ticket_number}",
            f"<p>Your ticket <strong>{ticket.ticket_number}</strong> has been created.</p>",
        )
    except Exception:
        pass

    return TicketDetail.model_validate(ticket)


@router.get("/tickets", response_model=list[TicketListItem])
async def list_tickets(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_employee()),
):
    stmt = select(ITTicket)
    if not _is_it_role(user):
        stmt = stmt.where(ITTicket.requester_person_id == user.person_id_platform)
    result = await session.execute(stmt.order_by(ITTicket.created_at.desc()))
    return result.scalars().all()


@router.get("/tickets/{ticket_id}", response_model=TicketDetail)
async def get_ticket(
    ticket_id: int,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_employee()),
):
    ticket = (
        await session.execute(
            select(ITTicket)
            .options(selectinload(ITTicket.comments))
            .where(ITTicket.ticket_id == ticket_id)
        )
    ).scalars().one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket_not_found")
    if not _is_it_role(user) and ticket.requester_person_id != user.person_id_platform:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="access_denied")

    comments = ticket.comments
    if not _is_it_role(user):
        comments = [comment for comment in comments if not comment.is_internal]

    detail = TicketDetail.model_validate(ticket)
    detail.comments = [TicketCommentOut.model_validate(comment) for comment in comments]
    return detail


@router.patch("/tickets/{ticket_id}", response_model=TicketDetail)
async def update_ticket(
    ticket_id: int,
    payload: TicketUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_employee()),
):
    ticket = (await session.execute(select(ITTicket).where(ITTicket.ticket_id == ticket_id))).scalars().one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket_not_found")

    if not _is_it_role(user) and ticket.requester_person_id != user.person_id_platform:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="access_denied")

    if ticket.status in {IT_STATUS_RESOLVED, IT_STATUS_CLOSED} and not _is_it_role(user):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ticket_read_only")

    before = {"subject": ticket.subject, "description": ticket.description}
    if payload.subject:
        ticket.subject = payload.subject
    if payload.description:
        ticket.description = payload.description

    session.add(ticket)

    await write_audit_log(
        session,
        actor=user,
        action="IT_TICKET_UPDATE",
        entity_type="it_ticket",
        entity_id=str(ticket.ticket_id),
        before=before,
        after={"subject": ticket.subject, "description": ticket.description},
        context=get_request_context(request),
    )
    await session.commit()

    return TicketDetail.model_validate(ticket)


@router.post("/tickets/{ticket_id}/comments", response_model=TicketCommentOut)
async def add_comment(
    ticket_id: int,
    payload: TicketCommentCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_employee()),
):
    ticket = (await session.execute(select(ITTicket).where(ITTicket.ticket_id == ticket_id))).scalars().one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket_not_found")
    if not _is_it_role(user) and ticket.requester_person_id != user.person_id_platform:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="access_denied")
    if payload.is_internal and not _is_it_role(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="internal_note_forbidden")

    comment = ITTicketComment(
        ticket_id=ticket.ticket_id,
        author_person_id=user.person_id_platform or user.user_id,
        author_email=user.email,
        body=payload.body,
        is_internal=payload.is_internal,
    )
    session.add(comment)
    await session.flush()

    await write_audit_log(
        session,
        actor=user,
        action="IT_TICKET_COMMENT",
        entity_type="it_ticket_comment",
        entity_id=str(comment.comment_id),
        before=None,
        after={"ticket_id": ticket.ticket_id},
        context=get_request_context(request),
    )
    await session.commit()

    return TicketCommentOut.model_validate(comment)


@router.post("/tickets/{ticket_id}/assign", response_model=TicketDetail)
async def assign_ticket(
    ticket_id: int,
    payload: TicketAssign,
    request: Request,
    session: AsyncSession = Depends(get_session),
    platform_session: AsyncSession = Depends(get_platform_session),
    user: UserContext = Depends(require_it_agent()),
):
    ticket = (await session.execute(select(ITTicket).where(ITTicket.ticket_id == ticket_id))).scalars().one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket_not_found")

    before = {"assignee_person_id": ticket.assignee_person_id}

    if payload.assignee_person_id:
        identity = await resolve_identity_by_person_id(platform_session, payload.assignee_person_id)
        if not identity:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="assignee_not_found")
        if identity.is_deleted:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="assignee_deleted")
        if identity.status and not is_active_status(identity.status):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="assignee_inactive")

        roles = _map_platform_role(identity.role_id, identity.role_code)
        if not any(role in roles for role in [Role.IT_AGENT, Role.IT_LEAD, Role.ADMIN, Role.SUPERADMIN]):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="assignee_not_it_role")

        ticket.assignee_person_id = identity.person_id
        ticket.assignee_email = identity.email
        ticket.assignee_name = identity.full_name
    else:
        ticket.assignee_person_id = None
        ticket.assignee_email = None
        ticket.assignee_name = None

    session.add(ticket)

    await write_audit_log(
        session,
        actor=user,
        action="IT_TICKET_ASSIGN",
        entity_type="it_ticket",
        entity_id=str(ticket.ticket_id),
        before=before,
        after={"assignee_person_id": ticket.assignee_person_id},
        context=get_request_context(request),
    )
    await session.commit()

    try:
        recipients = [ticket.requester_email]
        if ticket.assignee_email:
            recipients.append(ticket.assignee_email)
        await run_in_threadpool(
            send_email,
            recipients,
            f"Ticket assigned {ticket.ticket_number}",
            f"<p>Ticket <strong>{ticket.ticket_number}</strong> has been assigned.</p>",
        )
    except Exception:
        pass

    return TicketDetail.model_validate(ticket)


@router.post("/tickets/{ticket_id}/transition", response_model=TicketDetail)
async def transition_ticket(
    ticket_id: int,
    payload: TicketTransition,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_employee()),
):
    ticket = (await session.execute(select(ITTicket).where(ITTicket.ticket_id == ticket_id))).scalars().one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket_not_found")

    if payload.is_internal and not _is_it_role(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="internal_note_forbidden")

    if not _is_it_role(user):
        if ticket.requester_person_id != user.person_id_platform or payload.new_status != IT_STATUS_REOPENED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="transition_forbidden")

    now = datetime.utcnow()
    validate_transition(ticket, payload.new_status, now)

    before = {"status": ticket.status}
    ticket.status = payload.new_status
    if (
        not ticket.first_response_at
        and _is_it_role(user)
        and payload.new_status
        in {
            IT_STATUS_TRIAGED,
            IT_STATUS_IN_PROGRESS,
            IT_STATUS_WAITING_ON_USER,
            IT_STATUS_RESOLVED,
            IT_STATUS_CLOSED,
        }
    ):
        ticket.first_response_at = now
    if payload.new_status == IT_STATUS_RESOLVED:
        ticket.resolved_at = now
    if payload.new_status == IT_STATUS_CLOSED:
        ticket.closed_at = now
    if payload.new_status == IT_STATUS_REOPENED:
        ticket.reopened_at = now

    session.add(ticket)

    if payload.comment:
        comment = ITTicketComment(
            ticket_id=ticket.ticket_id,
            author_person_id=user.person_id_platform or user.user_id,
            author_email=user.email,
            body=payload.comment,
            is_internal=payload.is_internal,
        )
        session.add(comment)

    await write_audit_log(
        session,
        actor=user,
        action="IT_TICKET_STATUS_CHANGE",
        entity_type="it_ticket",
        entity_id=str(ticket.ticket_id),
        before=before,
        after={"status": ticket.status},
        context=get_request_context(request),
    )
    await session.commit()

    try:
        recipients = [ticket.requester_email]
        if ticket.assignee_email:
            recipients.append(ticket.assignee_email)
        await run_in_threadpool(
            send_email,
            recipients,
            f"Ticket update {ticket.ticket_number}",
            f"<p>Status changed to <strong>{ticket.status}</strong>.</p>",
        )
    except Exception:
        pass

    return TicketDetail.model_validate(ticket)


@router.post("/admin/categories", response_model=CategoryOut)
async def create_category(
    payload: CategoryCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    category = ITCategory(name=payload.name, is_active=payload.is_active)
    session.add(category)
    await session.flush()

    await write_audit_log(
        session,
        actor=user,
        action="IT_CATEGORY_CREATE",
        entity_type="it_category",
        entity_id=str(category.category_id),
        before=None,
        after={"name": category.name, "is_active": category.is_active},
        context=get_request_context(request),
    )
    await session.commit()
    return CategoryOut.model_validate(category)


@router.get("/admin/categories", response_model=list[CategoryOut])
async def list_categories(session: AsyncSession = Depends(get_session), user: UserContext = Depends(require_it_lead())):
    result = await session.execute(select(ITCategory).order_by(ITCategory.name.asc()))
    return result.scalars().all()


@router.patch("/admin/categories/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int,
    payload: CategoryUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    category = (await session.execute(select(ITCategory).where(ITCategory.category_id == category_id))).scalars().one_or_none()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="category_not_found")

    before = {"name": category.name, "is_active": category.is_active}
    if payload.name is not None:
        category.name = payload.name
    if payload.is_active is not None:
        category.is_active = payload.is_active

    session.add(category)

    await write_audit_log(
        session,
        actor=user,
        action="IT_CATEGORY_UPDATE",
        entity_type="it_category",
        entity_id=str(category.category_id),
        before=before,
        after={"name": category.name, "is_active": category.is_active},
        context=get_request_context(request),
    )
    await session.commit()

    return CategoryOut.model_validate(category)


@router.delete("/admin/categories/{category_id}", response_model=CategoryOut)
async def deactivate_category(
    category_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    category = (await session.execute(select(ITCategory).where(ITCategory.category_id == category_id))).scalars().one_or_none()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="category_not_found")

    before = {"is_active": category.is_active}
    category.is_active = False
    session.add(category)

    await write_audit_log(
        session,
        actor=user,
        action="IT_CATEGORY_DEACTIVATE",
        entity_type="it_category",
        entity_id=str(category.category_id),
        before=before,
        after={"is_active": category.is_active},
        context=get_request_context(request),
    )
    await session.commit()
    return CategoryOut.model_validate(category)


@router.post("/admin/subcategories", response_model=SubcategoryOut)
async def create_subcategory(
    payload: SubcategoryCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    subcategory = ITSubcategory(
        category_id=payload.category_id,
        name=payload.name,
        is_active=payload.is_active,
    )
    session.add(subcategory)
    await session.flush()

    await write_audit_log(
        session,
        actor=user,
        action="IT_SUBCATEGORY_CREATE",
        entity_type="it_subcategory",
        entity_id=str(subcategory.subcategory_id),
        before=None,
        after={"name": subcategory.name, "is_active": subcategory.is_active},
        context=get_request_context(request),
    )
    await session.commit()
    return SubcategoryOut.model_validate(subcategory)


@router.get("/admin/subcategories", response_model=list[SubcategoryOut])
async def list_subcategories(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    result = await session.execute(select(ITSubcategory).order_by(ITSubcategory.name.asc()))
    return result.scalars().all()


@router.patch("/admin/subcategories/{subcategory_id}", response_model=SubcategoryOut)
async def update_subcategory(
    subcategory_id: int,
    payload: SubcategoryUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    subcategory = (
        await session.execute(select(ITSubcategory).where(ITSubcategory.subcategory_id == subcategory_id))
    ).scalars().one_or_none()
    if not subcategory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="subcategory_not_found")

    before = {"name": subcategory.name, "is_active": subcategory.is_active}
    if payload.name is not None:
        subcategory.name = payload.name
    if payload.is_active is not None:
        subcategory.is_active = payload.is_active

    session.add(subcategory)

    await write_audit_log(
        session,
        actor=user,
        action="IT_SUBCATEGORY_UPDATE",
        entity_type="it_subcategory",
        entity_id=str(subcategory.subcategory_id),
        before=before,
        after={"name": subcategory.name, "is_active": subcategory.is_active},
        context=get_request_context(request),
    )
    await session.commit()

    return SubcategoryOut.model_validate(subcategory)


@router.delete("/admin/subcategories/{subcategory_id}", response_model=SubcategoryOut)
async def deactivate_subcategory(
    subcategory_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    subcategory = (
        await session.execute(select(ITSubcategory).where(ITSubcategory.subcategory_id == subcategory_id))
    ).scalars().one_or_none()
    if not subcategory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="subcategory_not_found")

    before = {"is_active": subcategory.is_active}
    subcategory.is_active = False
    session.add(subcategory)

    await write_audit_log(
        session,
        actor=user,
        action="IT_SUBCATEGORY_DEACTIVATE",
        entity_type="it_subcategory",
        entity_id=str(subcategory.subcategory_id),
        before=before,
        after={"is_active": subcategory.is_active},
        context=get_request_context(request),
    )
    await session.commit()

    return SubcategoryOut.model_validate(subcategory)


@router.post("/admin/sla", response_model=SlaPolicyOut)
async def create_sla_policy(
    payload: SlaPolicyCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    policy = ITSlaPolicy(**payload.model_dump())
    session.add(policy)
    await session.flush()

    await write_audit_log(
        session,
        actor=user,
        action="IT_SLA_CREATE",
        entity_type="it_sla_policy",
        entity_id=str(policy.sla_policy_id),
        before=None,
        after=payload.model_dump(),
        context=get_request_context(request),
    )
    await session.commit()
    return SlaPolicyOut.model_validate(policy)


@router.get("/admin/sla", response_model=list[SlaPolicyOut])
async def list_sla_policies(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    result = await session.execute(select(ITSlaPolicy).order_by(ITSlaPolicy.name.asc()))
    return result.scalars().all()


@router.patch("/admin/sla/{policy_id}", response_model=SlaPolicyOut)
async def update_sla_policy(
    policy_id: int,
    payload: SlaPolicyUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    policy = (await session.execute(select(ITSlaPolicy).where(ITSlaPolicy.sla_policy_id == policy_id))).scalars().one_or_none()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="sla_policy_not_found")

    before = {
        "name": policy.name,
        "category_id": policy.category_id,
        "priority": policy.priority,
        "first_response_minutes": policy.first_response_minutes,
        "resolution_minutes": policy.resolution_minutes,
        "is_active": policy.is_active,
    }
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(policy, key, value)

    session.add(policy)

    await write_audit_log(
        session,
        actor=user,
        action="IT_SLA_UPDATE",
        entity_type="it_sla_policy",
        entity_id=str(policy.sla_policy_id),
        before=before,
        after=data,
        context=get_request_context(request),
    )
    await session.commit()

    return SlaPolicyOut.model_validate(policy)


@router.delete("/admin/sla/{policy_id}", response_model=SlaPolicyOut)
async def deactivate_sla_policy(
    policy_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    policy = (await session.execute(select(ITSlaPolicy).where(ITSlaPolicy.sla_policy_id == policy_id))).scalars().one_or_none()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="sla_policy_not_found")

    before = {"is_active": policy.is_active}
    policy.is_active = False
    session.add(policy)

    await write_audit_log(
        session,
        actor=user,
        action="IT_SLA_DEACTIVATE",
        entity_type="it_sla_policy",
        entity_id=str(policy.sla_policy_id),
        before=before,
        after={"is_active": policy.is_active},
        context=get_request_context(request),
    )
    await session.commit()

    return SlaPolicyOut.model_validate(policy)


@router.post("/admin/routing", response_model=dict)
async def create_routing_rule(
    payload: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    rule = ITRoutingRule(
        category_id=payload.get("category_id"),
        subcategory_id=payload.get("subcategory_id"),
        default_assignee_person_id=payload.get("default_assignee_person_id"),
        is_active=payload.get("is_active", True),
    )
    session.add(rule)
    await session.flush()

    await write_audit_log(
        session,
        actor=user,
        action="IT_ROUTING_CREATE",
        entity_type="it_routing_rule",
        entity_id=str(rule.rule_id),
        before=None,
        after={
            "category_id": rule.category_id,
            "subcategory_id": rule.subcategory_id,
            "default_assignee_person_id": rule.default_assignee_person_id,
            "is_active": rule.is_active,
        },
        context=get_request_context(request),
    )
    await session.commit()

    return {"rule_id": rule.rule_id}


@router.get("/admin/routing", response_model=list[dict])
async def list_routing_rules(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    result = await session.execute(select(ITRoutingRule).order_by(ITRoutingRule.rule_id.desc()))
    rules = result.scalars().all()
    return [
        {
            "rule_id": rule.rule_id,
            "category_id": rule.category_id,
            "subcategory_id": rule.subcategory_id,
            "default_assignee_person_id": rule.default_assignee_person_id,
            "is_active": rule.is_active,
        }
        for rule in rules
    ]


@router.patch("/admin/routing/{rule_id}", response_model=dict)
async def update_routing_rule(
    rule_id: int,
    payload: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    rule = (await session.execute(select(ITRoutingRule).where(ITRoutingRule.rule_id == rule_id))).scalars().one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="routing_rule_not_found")

    before = {
        "category_id": rule.category_id,
        "subcategory_id": rule.subcategory_id,
        "default_assignee_person_id": rule.default_assignee_person_id,
        "is_active": rule.is_active,
    }

    for key in ["category_id", "subcategory_id", "default_assignee_person_id", "is_active"]:
        if key in payload:
            setattr(rule, key, payload.get(key))

    session.add(rule)

    await write_audit_log(
        session,
        actor=user,
        action="IT_ROUTING_UPDATE",
        entity_type="it_routing_rule",
        entity_id=str(rule.rule_id),
        before=before,
        after={
            "category_id": rule.category_id,
            "subcategory_id": rule.subcategory_id,
            "default_assignee_person_id": rule.default_assignee_person_id,
            "is_active": rule.is_active,
        },
        context=get_request_context(request),
    )
    await session.commit()

    return {"rule_id": rule.rule_id}


@router.delete("/admin/routing/{rule_id}", response_model=dict)
async def deactivate_routing_rule(
    rule_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    rule = (await session.execute(select(ITRoutingRule).where(ITRoutingRule.rule_id == rule_id))).scalars().one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="routing_rule_not_found")

    before = {"is_active": rule.is_active}
    rule.is_active = False
    session.add(rule)

    await write_audit_log(
        session,
        actor=user,
        action="IT_ROUTING_DEACTIVATE",
        entity_type="it_routing_rule",
        entity_id=str(rule.rule_id),
        before=before,
        after={"is_active": rule.is_active},
        context=get_request_context(request),
    )
    await session.commit()

    return {"rule_id": rule.rule_id}


@router.get("/admin/assets", response_model=list[AssetOut])
async def list_assets(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    result = await session.execute(select(ITAsset).order_by(ITAsset.updated_at.desc(), ITAsset.asset_id.desc()))
    return result.scalars().all()


@router.post("/admin/assets", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
async def create_asset(
    payload: AssetCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    now = datetime.utcnow()
    asset = ITAsset(**payload.model_dump(), created_at=now, updated_at=now)
    session.add(asset)
    await session.flush()

    await write_audit_log(
        session,
        actor=user,
        action="IT_ASSET_CREATE",
        entity_type="it_asset",
        entity_id=str(asset.asset_id),
        before=None,
        after=payload.model_dump(),
        context=get_request_context(request),
    )
    await session.commit()
    return AssetOut.model_validate(asset)


@router.patch("/admin/assets/{asset_id}", response_model=AssetOut)
async def update_asset(
    asset_id: int,
    payload: AssetUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    asset = (await session.execute(select(ITAsset).where(ITAsset.asset_id == asset_id))).scalars().one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="asset_not_found")

    before = {
        "asset_tag": asset.asset_tag,
        "asset_type": asset.asset_type,
        "status": asset.status,
        "assigned_email": asset.assigned_email,
        "assigned_name": asset.assigned_name,
    }

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(asset, key, value)
    asset.updated_at = datetime.utcnow()
    session.add(asset)

    await write_audit_log(
        session,
        actor=user,
        action="IT_ASSET_UPDATE",
        entity_type="it_asset",
        entity_id=str(asset.asset_id),
        before=before,
        after=data,
        context=get_request_context(request),
    )
    await session.commit()
    return AssetOut.model_validate(asset)


@router.post("/admin/assets/import", response_model=dict)
async def import_assets_csv(
    request: Request,
    upload: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    def _parse_date(raw: str | None) -> datetime | None:
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw.strip())
        except Exception:
            return None

    raw = await upload.read()
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    created = 0
    for row in reader:
        asset_tag = (row.get("asset_tag") or "").strip()
        if not asset_tag:
            continue
        asset = ITAsset(
            asset_tag=asset_tag,
            asset_type=(row.get("asset_type") or "OTHER").strip(),
            status=(row.get("status") or "IN_STOCK").strip(),
            serial_number=(row.get("serial_number") or "").strip() or None,
            manufacturer=(row.get("manufacturer") or "").strip() or None,
            model=(row.get("model") or "").strip() or None,
            operating_system=(row.get("operating_system") or "").strip() or None,
            purchase_date=_parse_date(row.get("purchase_date")),
            warranty_end=_parse_date(row.get("warranty_end")),
            location=(row.get("location") or "").strip() or None,
            assigned_person_id=(row.get("assigned_person_id") or "").strip() or None,
            assigned_email=(row.get("assigned_email") or "").strip() or None,
            assigned_name=(row.get("assigned_name") or "").strip() or None,
            notes=(row.get("notes") or "").strip() or None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        session.add(asset)
        created += 1

    await write_audit_log(
        session,
        actor=user,
        action="IT_ASSET_IMPORT",
        entity_type="it_asset",
        entity_id="bulk",
        before=None,
        after={"created": created, "filename": upload.filename},
        context=get_request_context(request),
    )
    await session.commit()
    return {"created": created}


@router.get("/admin/vendors", response_model=list[VendorOut])
async def list_vendors(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    result = await session.execute(select(ITVendor).order_by(ITVendor.name.asc()))
    return result.scalars().all()


@router.post("/admin/vendors", response_model=VendorOut, status_code=status.HTTP_201_CREATED)
async def create_vendor(
    payload: VendorCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    vendor = ITVendor(
        name=payload.name.strip(),
        website=(payload.website or "").strip() or None,
        support_email=(payload.support_email or "").strip() or None,
        support_phone=(payload.support_phone or "").strip() or None,
        is_active=bool(payload.is_active),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    session.add(vendor)
    await session.flush()

    await write_audit_log(
        session,
        actor=user,
        action="IT_VENDOR_CREATE",
        entity_type="it_vendor",
        entity_id=str(vendor.vendor_id),
        before=None,
        after=payload.model_dump(),
        context=get_request_context(request),
    )
    await session.commit()
    return VendorOut.model_validate(vendor)


@router.get("/admin/licenses", response_model=list[LicenseOut])
async def list_licenses(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    result = await session.execute(select(ITLicense).order_by(ITLicense.updated_at.desc(), ITLicense.license_id.desc()))
    return result.scalars().all()


@router.post("/admin/licenses", response_model=LicenseOut, status_code=status.HTTP_201_CREATED)
async def create_license(
    payload: LicenseCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    now = datetime.utcnow()
    license_obj = ITLicense(**payload.model_dump(), created_at=now, updated_at=now)
    session.add(license_obj)
    await session.flush()

    await write_audit_log(
        session,
        actor=user,
        action="IT_LICENSE_CREATE",
        entity_type="it_license",
        entity_id=str(license_obj.license_id),
        before=None,
        after=payload.model_dump(),
        context=get_request_context(request),
    )
    await session.commit()
    return LicenseOut.model_validate(license_obj)


@router.patch("/admin/licenses/{license_id}", response_model=LicenseOut)
async def update_license(
    license_id: int,
    payload: LicenseUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    license_obj = (await session.execute(select(ITLicense).where(ITLicense.license_id == license_id))).scalars().one_or_none()
    if not license_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="license_not_found")

    before = {"name": license_obj.name, "total_seats": license_obj.total_seats, "is_active": license_obj.is_active}
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(license_obj, key, value)
    license_obj.updated_at = datetime.utcnow()
    session.add(license_obj)

    await write_audit_log(
        session,
        actor=user,
        action="IT_LICENSE_UPDATE",
        entity_type="it_license",
        entity_id=str(license_obj.license_id),
        before=before,
        after=data,
        context=get_request_context(request),
    )
    await session.commit()
    return LicenseOut.model_validate(license_obj)


@router.get("/admin/license-assignments", response_model=list[LicenseAssignmentOut])
async def list_license_assignments(
    license_id: int,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    result = await session.execute(
        select(ITLicenseAssignment)
        .where(ITLicenseAssignment.license_id == license_id)
        .order_by(ITLicenseAssignment.assigned_at.desc(), ITLicenseAssignment.assignment_id.desc())
    )
    return result.scalars().all()


@router.post("/admin/license-assignments", response_model=LicenseAssignmentOut, status_code=status.HTTP_201_CREATED)
async def create_license_assignment(
    payload: LicenseAssignmentCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    license_obj = (await session.execute(select(ITLicense).where(ITLicense.license_id == payload.license_id))).scalars().one_or_none()
    if not license_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="license_not_found")

    assignment = ITLicenseAssignment(
        license_id=payload.license_id,
        asset_id=payload.asset_id,
        assignee_person_id=payload.assignee_person_id,
        assignee_email=(payload.assignee_email or "").strip() or None,
        assignee_name=(payload.assignee_name or "").strip() or None,
        status=(payload.status or "ASSIGNED").strip(),
        notes=(payload.notes or "").strip() or None,
        assigned_at=datetime.utcnow(),
        created_at=datetime.utcnow(),
    )
    session.add(assignment)
    await session.flush()

    await write_audit_log(
        session,
        actor=user,
        action="IT_LICENSE_ASSIGN",
        entity_type="it_license_assignment",
        entity_id=str(assignment.assignment_id),
        before=None,
        after=payload.model_dump(),
        context=get_request_context(request),
    )
    await session.commit()
    return LicenseAssignmentOut.model_validate(assignment)


@router.post("/admin/license-assignments/import", response_model=dict)
async def import_license_assignments_csv(
    request: Request,
    upload: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    def _parse_date(raw: str | None) -> datetime | None:
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw.strip())
        except Exception:
            return None

    raw = await upload.read()
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    created = 0
    for row in reader:
        raw_license_id = (row.get("license_id") or "").strip()
        if not raw_license_id:
            continue
        try:
            license_id = int(raw_license_id)
        except Exception:
            continue
        exists = (await session.execute(select(ITLicense).where(ITLicense.license_id == license_id))).scalars().one_or_none()
        if not exists:
            continue

        assignment = ITLicenseAssignment(
            license_id=license_id,
            asset_id=int(raw_asset_id) if (raw_asset_id := (row.get("asset_id") or "").strip()) else None,
            assignee_person_id=(row.get("assignee_person_id") or "").strip() or None,
            assignee_email=(row.get("assignee_email") or "").strip() or None,
            assignee_name=(row.get("assignee_name") or "").strip() or None,
            status=(row.get("status") or "ASSIGNED").strip(),
            notes=(row.get("notes") or "").strip() or None,
            assigned_at=datetime.utcnow(),
            unassigned_at=_parse_date(row.get("unassigned_at")),
            created_at=_parse_date(row.get("created_at")) or datetime.utcnow(),
        )
        session.add(assignment)
        created += 1

    await write_audit_log(
        session,
        actor=user,
        action="IT_LICENSE_ASSIGN_IMPORT",
        entity_type="it_license_assignment",
        entity_id="bulk",
        before=None,
        after={"created": created, "filename": upload.filename},
        context=get_request_context(request),
    )
    await session.commit()
    return {"created": created}


@router.post("/admin/licenses/import", response_model=dict)
async def import_licenses_csv(
    request: Request,
    upload: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_it_lead()),
):
    def _parse_date(raw: str | None) -> datetime | None:
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw.strip())
        except Exception:
            return None

    raw = await upload.read()
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    created = 0
    for row in reader:
        name = (row.get("name") or "").strip()
        if not name:
            continue
        vendor_name = (row.get("vendor") or "").strip() or None
        vendor_id = None
        if vendor_name:
            existing = (await session.execute(select(ITVendor).where(ITVendor.name == vendor_name))).scalars().one_or_none()
            if not existing:
                existing = ITVendor(name=vendor_name, is_active=True, created_at=datetime.utcnow(), updated_at=datetime.utcnow())
                session.add(existing)
                await session.flush()
            vendor_id = existing.vendor_id

        license_obj = ITLicense(
            vendor_id=vendor_id,
            name=name,
            sku=(row.get("sku") or "").strip() or None,
            license_type=(row.get("license_type") or "SUBSCRIPTION").strip(),
            billing_cycle=(row.get("billing_cycle") or "ANNUAL").strip(),
            total_seats=int((row.get("total_seats") or row.get("seats_total") or "1").strip() or 1),
            contract_start=_parse_date(row.get("contract_start")),
            contract_end=_parse_date(row.get("contract_end")),
            renewal_date=_parse_date(row.get("renewal_date")),
            registered_email=(row.get("registered_email") or "").strip() or None,
            cost_currency=(row.get("cost_currency") or row.get("currency") or "INR").strip() or "INR",
            cost_amount=int((row.get("cost_amount") or "0").strip() or 0) or None,
            notes=(row.get("notes") or "").strip() or None,
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        session.add(license_obj)
        created += 1

    await write_audit_log(
        session,
        actor=user,
        action="IT_LICENSE_IMPORT",
        entity_type="it_license",
        entity_id="bulk",
        before=None,
        after={"created": created, "filename": upload.filename},
        context=get_request_context(request),
    )
    await session.commit()
    return {"created": created}
