from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SprintAttachmentOut(BaseModel):
    sprint_attachment_id: int
    file_name: str
    content_type: Optional[str] = None
    file_size: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SprintTemplateAttachmentOut(BaseModel):
    sprint_template_attachment_id: int
    sprint_attachment_id: int
    file_name: str
    content_type: Optional[str] = None
    file_size: Optional[int] = None
    created_at: datetime
    is_active: bool


class SprintAttachmentPublicOut(BaseModel):
    sprint_attachment_id: int
    file_name: str
    content_type: Optional[str] = None
    file_size: Optional[int] = None
    download_url: str
