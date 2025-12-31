from typing import List, Optional

from pydantic import BaseModel, EmailStr

from app.core.roles import Role


class UserContext(BaseModel):
    user_id: str
    email: EmailStr
    roles: List[Role]
    person_id_platform: Optional[str] = None
    full_name: Optional[str] = None
    platform_role_id: Optional[int] = None
    platform_role_code: Optional[str] = None
    platform_role_name: Optional[str] = None
