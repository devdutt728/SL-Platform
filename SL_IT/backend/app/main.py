from __future__ import annotations

import logging

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.base import Base
from app.db.session import engine
from app.middleware.logging import RequestLoggingMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.request_context import RequestContextMiddleware
from app.routers import admin, auth, it

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("slp")


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)

    if settings.environment == "development":
        # Best-effort auto-create missing tables in local dev.
        @app.on_event("startup")
        async def _create_tables() -> None:
            from app.models import it as _  # noqa: F401

            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)

    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(
        RateLimitMiddleware,
        limit=settings.auth_rate_limit_per_min,
        window_seconds=settings.auth_rate_limit_window_seconds,
        path_prefixes=("/auth",),
    )
    allow_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    if settings.public_app_origin:
        allow_origins.append(settings.public_app_origin.rstrip("/"))

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(admin.router)
    app.include_router(it.router)

    return app


app = create_app()
