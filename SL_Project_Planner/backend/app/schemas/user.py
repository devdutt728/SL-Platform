from pydantic import BaseModel, EmailStr


class UserContext(BaseModel):
    user_id: str
    email: EmailStr
    roles: list[str]
    person_id_platform: str | None = None
    full_name: str | None = None
    platform_role_id: int | None = None
    platform_role_code: str | None = None
    platform_role_name: str | None = None
    platform_role_ids: list[int] | None = None
    platform_role_codes: list[str] | None = None
    platform_role_names: list[str] | None = None
    can_access_recruitment: bool = False
    can_access_planner: bool = False
