from fastapi import APIRouter, Depends

from app.api.routes import auth, group_management, planner, planner_ops, planner_role_access
from app.core.app_access import require_planner_app_access

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(planner.router, dependencies=[Depends(require_planner_app_access())])
api_router.include_router(planner_ops.router, dependencies=[Depends(require_planner_app_access())])
api_router.include_router(planner_role_access.router, dependencies=[Depends(require_planner_app_access())])
api_router.include_router(group_management.router, dependencies=[Depends(require_planner_app_access())])
