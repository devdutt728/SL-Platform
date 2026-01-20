from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class PlatformPersonSuggestion(BaseModel):
    person_id: str
    person_code: str
    full_name: str
    email: EmailStr
    role_name: Optional[str] = None
    role_code: Optional[str] = None
    role_ids: list[int] = Field(default_factory=list)
    role_codes: list[str] = Field(default_factory=list)
    role_names: list[str] = Field(default_factory=list)
