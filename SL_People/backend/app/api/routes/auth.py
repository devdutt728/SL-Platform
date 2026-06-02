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
    }
