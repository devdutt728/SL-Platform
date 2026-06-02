from __future__ import annotations

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.platform_session import get_platform_session
from app.db.session import get_session
from app.schemas.user import AccessLevel, UserContext, at_least


async def get_db_session() -> AsyncSession:
    async for session in get_session():
        yield session


async def get_platform_db_session() -> AsyncSession:
    async for session in get_platform_session():
        yield session


async def get_user(user: UserContext = Depends(get_current_user)) -> UserContext:
    return user


def require_access(required: AccessLevel):
    """Dependency factory enforcing a minimum People access level."""

    async def dependency(user: UserContext = Depends(get_current_user)) -> UserContext:
        if not at_least(user.access_level, required):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires '{required.value}' access",
            )
        return user

    return dependency


require_view = require_access(AccessLevel.VIEW)
require_edit = require_access(AccessLevel.EDIT)
require_admin = require_access(AccessLevel.ADMIN)
