import os

os.environ.setdefault("SL_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SL_PLATFORM_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SL_GOOGLE_OAUTH_SECRETS_PATH", "secrets/Oauth SL_Platform.json")
os.environ.setdefault("SL_AUTH_MODE", "dev")
os.environ.setdefault("SL_ROLE_MAP_JSON", '{"1":["superadmin"],"2":["admin"]}')

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.models.base import Base


@pytest.fixture()
async def async_engine():
    # Function-scoped (not session-scoped): tests that commit (e.g. bulk
    # import) permanently write to the StaticPool's single shared
    # connection, so a fresh in-memory DB per test avoids cross-test
    # collisions on unique columns like category code.
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture()
async def db_session(async_engine):
    session_factory = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()
