import logging

from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import settings
from app.jobs.scheduler import start_scheduler
from app.middleware.logging import RequestLoggingMiddleware

logging.basicConfig(level=logging.INFO)
logging.getLogger("apscheduler").setLevel(logging.WARNING)
logging.getLogger("apscheduler.scheduler").setLevel(logging.WARNING)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(RequestLoggingMiddleware)


@app.get("/health")
async def health_check():
    return {"status": "ok", "environment": settings.environment}


app.include_router(api_router)


@app.on_event("startup")
async def _startup_jobs() -> None:
    app.state.scheduler = start_scheduler()


@app.on_event("shutdown")
async def _shutdown_jobs() -> None:
    scheduler = getattr(app.state, "scheduler", None)
    if scheduler:
        scheduler.shutdown()
