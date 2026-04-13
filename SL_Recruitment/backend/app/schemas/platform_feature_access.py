from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class FeatureAccessToggleIn(BaseModel):
    enabled: bool


class FeatureAccessAssignmentOut(BaseModel):
    feature_code: str
    feature_label: str
    person_id: str
    person_code: str | None = None
    full_name: str
    email: str
    status: str | None = None
    is_deleted: int | None = None
    granted_at: datetime | None = None
    granted_by_person_id: str | None = None
    enabled: bool = True


class FeatureAccessFeatureOut(BaseModel):
    feature_code: str
    feature_label: str


ReportsAccessToggleIn = FeatureAccessToggleIn
ReportsAccessAssignmentOut = FeatureAccessAssignmentOut
