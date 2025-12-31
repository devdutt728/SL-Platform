from fastapi import APIRouter

from app.api.routes import auth
from app.api.routes import caf
from app.api.routes import candidates
from app.api.routes import dashboard
from app.api.routes import interviews
from app.api.routes import openings
from app.api.routes import offers
from app.api.routes import platform_people
from app.api.routes import public_apply
from app.api.routes import sprints

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(candidates.router)
api_router.include_router(caf.router)
api_router.include_router(openings.router)
api_router.include_router(offers.router)
api_router.include_router(offers.public_router)
api_router.include_router(platform_people.router)
api_router.include_router(public_apply.router)
api_router.include_router(dashboard.router)
api_router.include_router(interviews.router)
api_router.include_router(interviews.public_router)
api_router.include_router(sprints.router)
api_router.include_router(sprints.public_router)
