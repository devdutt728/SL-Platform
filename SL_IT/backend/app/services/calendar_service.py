from __future__ import annotations

from datetime import datetime

from app.core.config import settings


def create_event(
    calendar_id: str,
    summary: str,
    start_dt: datetime,
    end_dt: datetime,
    attendees: list[str],
    description: str | None = None,
) -> tuple[str, str] | None:
    if not settings.enable_calendar:
        return None
    if not settings.google_application_credentials:
        raise RuntimeError("SL_GOOGLE_APPLICATION_CREDENTIALS is not set")
    if not settings.gmail_sender_email:
        raise RuntimeError("SL_GMAIL_SENDER_EMAIL is not set")

    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    scopes = ["https://www.googleapis.com/auth/calendar.events"]
    credentials = service_account.Credentials.from_service_account_file(
        settings.google_application_credentials, scopes=scopes
    )
    delegated = credentials.with_subject(settings.gmail_sender_email)

    service = build("calendar", "v3", credentials=delegated, cache_discovery=False)

    event = {
        "summary": summary,
        "description": description,
        "start": {"dateTime": start_dt.isoformat(), "timeZone": settings.calendar_timezone},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": settings.calendar_timezone},
        "attendees": [{"email": attendee} for attendee in attendees],
    }

    created = service.events().insert(calendarId=calendar_id, body=event).execute()
    return created.get("id", ""), created.get("htmlLink", "")
