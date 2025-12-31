from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_session
from app.schemas.user import UserContext


async def get_db_session() -> AsyncSession:
    async for session in get_session():
        yield session


async def get_user(user: UserContext = Depends(get_current_user)) -> UserContext:
    return user
