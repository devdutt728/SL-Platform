from fastapi import APIRouter, Depends

from app.api.routes import auth, planner, planner_ops
from app.core.app_access import require_planner_app_access

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(planner.router, dependencies=[Depends(require_planner_app_access())])
api_router.include_router(planner_ops.router, dependencies=[Depends(require_planner_app_access())])
