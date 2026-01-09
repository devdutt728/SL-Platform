from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class JoiningDocOut(BaseModel):
    joining_doc_id: int
    candidate_id: int
    doc_type: str
    file_name: str
    content_type: Optional[str] = None
    uploaded_by: str
    uploaded_by_person_id_platform: Optional[int] = None
    created_at: datetime
    file_url: str

    class Config:
        from_attributes = True


class JoiningDocPublicOut(BaseModel):
    joining_doc_id: int
    doc_type: str
    file_name: str
    uploaded_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class JoiningDocsPublicContext(BaseModel):
    candidate_id: int
    candidate_name: str
    opening_title: str | None = None
    joining_docs_status: str
    required_doc_types: list[str]
    docs: list[JoiningDocPublicOut]
