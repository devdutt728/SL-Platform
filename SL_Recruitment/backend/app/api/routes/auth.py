from fastapi import APIRouter, Depends

from app.api import deps
from app.schemas.user import UserContext

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserContext)
async def me(user: UserContext = Depends(deps.get_user)):
    return user

