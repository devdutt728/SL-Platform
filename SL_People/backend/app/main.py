from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.db.platform_session import platform_engine
from app.db.session import engine

logging.basicConfig(level=logging.INFO)

app = FastAPI(title=settings.app_name, version="0.1.0", docs_url="/docs", redoc_url="/redoc")


if not settings.people_module_enabled:

    @app.middleware("http")
    async def _people_module_disabled(_request, _call_next):
        return JSONResponse({"detail": "Not found"}, status_code=404)

else:
    app.include_router(api_router)


@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok", "module": "people", "environment": settings.environment}


@app.on_event("shutdown")
async def _shutdown() -> None:
    await engine.dispose()
    await platform_engine.dispose()
