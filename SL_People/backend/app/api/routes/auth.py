from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_user
from app.schemas.user import UserContext

router = APIRouter(prefix="/ppl/auth", tags=["auth"])


@router.get("/me")
async def me(user: UserContext = Depends(get_user)) -> dict:
    return {
        "person_id": user.person_id_platform,
        "person_code": user.person_code,
        "email": user.email,
        "name": user.full_name,
        "access_level": user.access_level.value,
        "platform_role_id": user.platform_role_id,
        "platform_role_code": user.platform_role_code,
        "platform_role_name": user.platform_role_name,
        "platform_role_ids": user.platform_role_ids or [],
        "platform_role_codes": user.platform_role_codes or [],
        "platform_role_names": user.platform_role_names or [],
        "roles": user.roles,
        "is_platform_superadmin": user.is_platform_superadmin,
    }
