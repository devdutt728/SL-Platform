from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel


class CandidateEventOut(BaseModel):
    event_id: int
    candidate_id: int
    candidate_name: Optional[str] = None
    candidate_code: Optional[str] = None
    action_type: str
    performed_by_person_id_platform: Optional[int] = None
    performed_by_name: Optional[str] = None
    performed_by_email: Optional[str] = None
    meta_json: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True
