from __future__ import annotations

import base64
from email.mime.text import MIMEText

from app.core.config import settings


def send_email(to: list[str], subject: str, html_body: str, cc: list[str] | None = None) -> str | None:
    if not settings.enable_gmail:
        return None
    if not settings.google_application_credentials:
        raise RuntimeError("SL_GOOGLE_APPLICATION_CREDENTIALS is not set")
    if not settings.gmail_sender_email:
        raise RuntimeError("SL_GMAIL_SENDER_EMAIL is not set")

    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    scopes = ["https://www.googleapis.com/auth/gmail.send"]
    credentials = service_account.Credentials.from_service_account_file(
        settings.google_application_credentials, scopes=scopes
    )
    delegated = credentials.with_subject(settings.gmail_sender_email)

    service = build("gmail", "v1", credentials=delegated, cache_discovery=False)

    message = MIMEText(html_body, "html")
    message["to"] = ", ".join(to)
    if cc:
        message["cc"] = ", ".join(cc)
    message["subject"] = subject
    sender_name = settings.gmail_sender_name.strip() if settings.gmail_sender_name else ""
    message["from"] = f"{sender_name} <{settings.gmail_sender_email}>" if sender_name else settings.gmail_sender_email

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    response = service.users().messages().send(userId="me", body={"raw": raw}).execute()
    return response.get("id")
