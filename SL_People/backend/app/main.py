from __future__ import annotations

import asyncio
import contextlib
import logging

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.db.platform_session import PlatformSessionLocal, platform_engine
from app.db.session import SessionLocal, engine
from app.services.org import sync_missing_dim_people_to_org

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name, version="0.1.0", docs_url="/docs", redoc_url="/redoc")
_org_sync_task: asyncio.Task | None = None


if not settings.people_module_enabled:

    @app.middleware("http")
    async def _people_module_disabled(_request, _call_next):
        return JSONResponse({"detail": "Not found"}, status_code=404)

else:
    app.include_router(api_router)


@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok", "module": "people", "environment": settings.environment}


async def _sync_org_from_dim_person_once() -> int:
    async with SessionLocal() as people_session, PlatformSessionLocal() as platform_session:
        created = await sync_missing_dim_people_to_org(
            people_session,
            platform_session,
            performed_by="system:dim_person_auto_sync",
        )
        await people_session.commit()
        if created:
            logger.info("Auto-synced %s dim_person employee(s) into org", created)
        return created


async def _org_dim_person_sync_loop() -> None:
    interval = max(1, settings.org_dim_person_sync_interval_seconds)
    while True:
        try:
            await _sync_org_from_dim_person_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("dim_person org auto-sync failed")
        if interval <= 0:
            return
        await asyncio.sleep(interval)


@app.on_event("startup")
async def _startup() -> None:
    global _org_sync_task
    if settings.people_module_enabled and settings.org_dim_person_sync_interval_seconds > 0:
        _org_sync_task = asyncio.create_task(_org_dim_person_sync_loop())


@app.on_event("shutdown")
async def _shutdown() -> None:
    global _org_sync_task
    if _org_sync_task:
        _org_sync_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _org_sync_task
        _org_sync_task = None
    await engine.dispose()
    await platform_engine.dispose()
