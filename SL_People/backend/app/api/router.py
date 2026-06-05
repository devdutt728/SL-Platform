from fastapi import APIRouter

from app.api.routes import auth, employees, groups, licenses, org, people_lookup, peripherals, systems

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(employees.router)
api_router.include_router(licenses.router)
api_router.include_router(org.router)
api_router.include_router(systems.router)
api_router.include_router(peripherals.router)
api_router.include_router(groups.router)
api_router.include_router(people_lookup.router)

# Remaining feature routers (import, access, dashboard) are added in later phases.
