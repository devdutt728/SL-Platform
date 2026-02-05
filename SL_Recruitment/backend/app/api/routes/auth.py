from fastapi import APIRouter, Depends
from sqlalchemy import text

from app.core.config import settings
from app.db.platform_session import PlatformSessionLocal

from app.api import deps
from app.schemas.user import UserContext

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserContext)
async def me(user: UserContext = Depends(deps.get_user)):
    return user


@router.post("/logout")
async def logout(user: UserContext = Depends(deps.get_user)):
    if not user.email:
        return {"ok": True}
    async with PlatformSessionLocal() as platform_session:
        await platform_session.execute(
            text(f"DELETE FROM {settings.session_table} WHERE email = :email"),
            {"email": user.email},
        )
        await platform_session.commit()
    return {"ok": True}
