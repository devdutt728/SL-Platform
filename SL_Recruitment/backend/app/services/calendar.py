from __future__ import annotations

from datetime import timezone
from typing import Any
from uuid import uuid4

import google.auth
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

from datetime import datetime

from app.core.config import settings
from app.core.paths import resolve_repo_path


def _calendar_client(subject_email: str | None = None):
    scopes = ["https://www.googleapis.com/auth/calendar"]
    service_account_path = settings.google_application_credentials
    if service_account_path:
        credentials = Credentials.from_service_account_file(str(resolve_repo_path(service_account_path)), scopes=scopes)
        subject = subject_email or settings.gmail_sender_email
        if subject:
            credentials = credentials.with_subject(subject)
    else:
        credentials, _ = google.auth.default(scopes=scopes)
    return build("calendar", "v3", credentials=credentials, cache_discovery=False)


def _find_meeting_link(event: dict[str, Any]) -> str | None:
    link = event.get("hangoutLink")
    if link:
        return link
    conference = event.get("conferenceData") or {}
    for entry in conference.get("entryPoints", []) or []:
        if entry.get("entryPointType") == "video":
            return entry.get("uri")
    return None


def create_calendar_event(
    *,
    summary: str,
    description: str | None,
    start_at,
    end_at,
    attendees: list[str],
    calendar_id: str | None = None,
    subject_email: str | None = None,
) -> dict[str, Any]:
    if not settings.enable_calendar:
        return {"status": "skipped", "event_id": None, "meeting_link": None}

    tz = settings.calendar_timezone or "UTC"
    start_iso = start_at.replace(tzinfo=timezone.utc).isoformat()
    end_iso = end_at.replace(tzinfo=timezone.utc).isoformat()

    body = {
        "summary": summary,
        "description": description or "",
        "start": {"dateTime": start_iso, "timeZone": tz},
        "end": {"dateTime": end_iso, "timeZone": tz},
        "attendees": [{"email": email} for email in attendees if email],
        "conferenceData": {
            "createRequest": {
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
                "requestId": uuid4().hex,
            }
        },
    }

    service = _calendar_client(subject_email=subject_email)
    event = (
        service.events()
        .insert(
            calendarId=calendar_id or settings.calendar_id or "primary",
            body=body,
            conferenceDataVersion=1,
            sendUpdates="none",
        )
        .execute()
    )
    return {
        "status": "created",
        "event_id": event.get("id"),
        "meeting_link": _find_meeting_link(event),
    }


def update_calendar_event(
    *,
    event_id: str,
    summary: str,
    description: str | None,
    start_at,
    end_at,
    attendees: list[str],
    calendar_id: str | None = None,
    subject_email: str | None = None,
) -> dict[str, Any]:
    if not settings.enable_calendar:
        return {"status": "skipped"}

    tz = settings.calendar_timezone or "UTC"
    start_iso = start_at.replace(tzinfo=timezone.utc).isoformat()
    end_iso = end_at.replace(tzinfo=timezone.utc).isoformat()

    body = {
        "summary": summary,
        "description": description or "",
        "start": {"dateTime": start_iso, "timeZone": tz},
        "end": {"dateTime": end_iso, "timeZone": tz},
        "attendees": [{"email": email} for email in attendees if email],
    }

    service = _calendar_client(subject_email=subject_email)
    event = (
        service.events()
        .patch(
            calendarId=calendar_id or settings.calendar_id or "primary",
            eventId=event_id,
            body=body,
            sendUpdates="none",
        )
        .execute()
    )
    return {
        "status": "updated",
        "event_id": event.get("id"),
        "meeting_link": _find_meeting_link(event),
    }


def delete_calendar_event(
    *,
    event_id: str,
    calendar_id: str | None = None,
    subject_email: str | None = None,
) -> dict[str, Any]:
    if not settings.enable_calendar:
        return {"status": "skipped"}

    service = _calendar_client(subject_email=subject_email)
    service.events().delete(
        calendarId=calendar_id or settings.calendar_id or "primary",
        eventId=event_id,
        sendUpdates="none",
    ).execute()
    return {"status": "deleted"}


def query_freebusy(
    *,
    calendar_ids: list[str],
    start_at: datetime,
    end_at: datetime,
    subject_email: str | None = None,
) -> dict[str, list[dict[str, str]]]:
    if not settings.enable_calendar:
        return {cid: [] for cid in calendar_ids}

    tz = settings.calendar_timezone or "UTC"
    body = {
        "timeMin": start_at.astimezone(timezone.utc).isoformat(),
        "timeMax": end_at.astimezone(timezone.utc).isoformat(),
        "timeZone": tz,
        "items": [{"id": cid} for cid in calendar_ids],
    }
    service = _calendar_client(subject_email=subject_email)
    resp = service.freebusy().query(body=body).execute()
    calendars = resp.get("calendars") or {}
    out: dict[str, list[dict[str, str]]] = {}
    for cid in calendar_ids:
        out[cid] = list(calendars.get(cid, {}).get("busy") or [])
    return out


def list_visible_calendar_ids(*, subject_email: str | None = None) -> list[str]:
    if not settings.enable_calendar:
        return []
    service = _calendar_client(subject_email=subject_email)
    calendar_ids: list[str] = []
    page_token = None
    while True:
        resp = service.calendarList().list(pageToken=page_token).execute()
        for item in resp.get("items", []) or []:
            if item.get("deleted"):
                continue
            access = (item.get("accessRole") or "").lower()
            if access in {"none", "freebusy"}:
                continue
            cid = (item.get("id") or "").strip()
            if cid:
                calendar_ids.append(cid)
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return calendar_ids


def list_calendar_list_details(*, subject_email: str | None = None) -> list[dict[str, Any]]:
    if not settings.enable_calendar:
        return []
    service = _calendar_client(subject_email=subject_email)
    out: list[dict[str, Any]] = []
    page_token = None
    while True:
        resp = service.calendarList().list(pageToken=page_token).execute()
        for item in resp.get("items", []) or []:
            if item.get("deleted"):
                continue
            out.append(
                {
                    "id": item.get("id"),
                    "summary": item.get("summary"),
                    "primary": bool(item.get("primary")),
                    "selected": bool(item.get("selected")),
                    "accessRole": item.get("accessRole"),
                }
            )
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return out


def list_calendar_events(
    *,
    calendar_id: str | None = None,
    start_at: datetime,
    end_at: datetime,
    subject_email: str | None = None,
) -> list[dict[str, Any]]:
    if not settings.enable_calendar:
        return []

    service = _calendar_client(subject_email=subject_email)
    time_min = start_at.astimezone(timezone.utc).isoformat()
    time_max = end_at.astimezone(timezone.utc).isoformat()
    events: list[dict[str, Any]] = []
    page_token = None
    while True:
        resp = (
            service.events()
            .list(
                calendarId=calendar_id or settings.calendar_id or "primary",
                timeMin=time_min,
                timeMax=time_max,
                singleEvents=True,
                orderBy="startTime",
                showDeleted=False,
                pageToken=page_token,
            )
            .execute()
        )
        events.extend(resp.get("items", []) or [])
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return events
