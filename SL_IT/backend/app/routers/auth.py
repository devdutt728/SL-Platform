from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.schemas.user import UserContext

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserContext)
async def me(user: UserContext = Depends(get_current_user)):
    return user
