from fastapi import APIRouter

from app.api.routes import auth

api_router = APIRouter()
api_router.include_router(auth.router)

# Feature routers (employees, org, licenses, systems, peripherals, groups,
# import, access, dashboard) are added in later phases.
