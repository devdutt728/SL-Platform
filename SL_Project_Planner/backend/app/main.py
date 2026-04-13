from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import settings
from app.db.platform_session import platform_engine
from app.db.session import engine

app = FastAPI(title=settings.app_name, version="0.1.0", docs_url="/docs", redoc_url="/redoc")
app.include_router(api_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "environment": settings.environment}


@app.on_event("shutdown")
async def _shutdown() -> None:
    await engine.dispose()
    await platform_engine.dispose()
