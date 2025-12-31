from typing import Optional

from pydantic import BaseModel, EmailStr


class PlatformPersonSuggestion(BaseModel):
    person_id: str
    person_code: str
    full_name: str
    email: EmailStr
    role_name: Optional[str] = None
    role_code: Optional[str] = None
