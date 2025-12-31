from __future__ import annotations

import logging

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.middleware.logging import RequestLoggingMiddleware
from app.middleware.request_context import RequestContextMiddleware
from app.routers import admin, auth, it

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("slp")


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)

    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(admin.router)
    app.include_router(it.router)

    return app


app = create_app()
