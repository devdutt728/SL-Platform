from __future__ import annotations

import base64
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import google.auth
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

from app.core.config import settings
from app.core.paths import resolve_repo_path
from app.services.events import log_event


PRIMARY_SENDER_EMAIL = "hr@studiolotus.in"


def _resolve_sender_email() -> str:
    return PRIMARY_SENDER_EMAIL


def _gmail_client():
    scopes = ["https://www.googleapis.com/auth/gmail.send"]
    service_account_path = settings.google_application_credentials
    sender_email = _resolve_sender_email()
    if not service_account_path:
        raise RuntimeError("Missing service account credentials for Gmail.")
    credentials = Credentials.from_service_account_file(str(resolve_repo_path(service_account_path)), scopes=scopes)
    credentials = credentials.with_subject(sender_email)
    return build("gmail", "v1", credentials=credentials, cache_discovery=False)


def _template_path(name: str) -> Path:
    return resolve_repo_path(f"backend/app/templates/email/{name}.html")


def render_template(name: str, context: dict[str, Any]) -> str:
    path = _template_path(name)
    raw = path.read_text(encoding="utf-8")
    html = raw.format_map({k: ("" if v is None else v) for k, v in context.items()})
    return html


async def send_email(
    session,
    *,
    candidate_id: int,
    to_emails: list[str],
    cc_emails: list[str] | None = None,
    subject: str,
    template_name: str,
    context: dict[str, Any],
    email_type: str,
    related_entity_type: str = "candidate",
    related_entity_id: int | None = None,
    meta_extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "to": to_emails,
        "cc": cc_emails or [],
        "subject": subject,
        "template": template_name,
        "email_type": email_type,
    }
    if meta_extra:
        meta.update(meta_extra)

    if related_entity_type == "candidate" and related_entity_id is None:
        related_entity_id = candidate_id

    if not to_emails:
        meta["status"] = "skipped"
        meta["reason"] = "missing_recipient"
        await log_event(
            session,
            candidate_id=candidate_id,
            action_type="email_sent",
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            performed_by_person_id_platform=None,
            meta_json=meta,
        )
        return meta

    if not settings.enable_gmail:
        meta["status"] = "skipped"
        await log_event(
            session,
            candidate_id=candidate_id,
            action_type="email_sent",
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            performed_by_person_id_platform=None,
            meta_json=meta,
        )
        return meta

    html = render_template(template_name, context)
    sender = _resolve_sender_email()
    sender_name = settings.gmail_sender_name or "SL Recruitment"
    msg = MIMEText(html, "html", "utf-8")
    msg["To"] = ", ".join(to_emails)
    if cc_emails:
        msg["Cc"] = ", ".join(cc_emails)
    msg["From"] = f"{sender_name} <{sender}>"
    msg["Reply-To"] = sender
    msg["Subject"] = subject

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
    try:
        service = _gmail_client()
        service.users().messages().send(userId=sender, body={"raw": raw}).execute()
        meta["status"] = "sent"
    except Exception as exc:  # noqa: BLE001
        meta["status"] = "failed"
        meta["error"] = str(exc)

    await log_event(
        session,
        candidate_id=candidate_id,
        action_type="email_sent",
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
        performed_by_person_id_platform=None,
        meta_json=meta,
    )
    return meta
