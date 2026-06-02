from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


platform_engine = create_async_engine(settings.platform_database_url, echo=False, pool_pre_ping=True)
PlatformSessionLocal = async_sessionmaker(bind=platform_engine, expire_on_commit=False, autoflush=False)


async def get_platform_session() -> AsyncSession:
    async with PlatformSessionLocal() as session:
        yield session
