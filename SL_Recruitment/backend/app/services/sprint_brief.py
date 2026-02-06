from __future__ import annotations

import re
from typing import Optional

from app.core.config import settings
from app.models.candidate import RecCandidate
from app.models.opening import RecOpening
from app.models.candidate_sprint import RecCandidateSprint
from app.models.sprint_template import RecSprintTemplate


_HTML_DETECTION = re.compile(r"</?[a-z][\s\S]*>", re.IGNORECASE)
_SIGNATURE_DETECTION = re.compile(r"regards,|studio\s*lotus", re.IGNORECASE)

SPRINT_SIGNATURE_HTML = """
<p style="margin:16px 0 0 0;font-size:14px;line-height:1.6;color:#334155;font-family:Arial,sans-serif;">Regards,<br />Studio Lotus Recruitment Team</p>
<div style="margin-top:14px;">
  <div style="font-family:arial,sans-serif;">
    <div style="color:rgb(34,34,34);">
      <span style="text-align:justify;font-family:georgia,palatino,serif;font-size:large;color:rgb(126,124,123);">studio</span>
      <span style="text-align:justify;font-family:georgia,palatino,serif;font-size:large;color:rgb(241,92,55);">lotus</span>
    </div>
    <div style="text-align:justify;">
      <span style="color:rgb(241,92,55);font-family:arial,sans-serif;font-size:x-small;">creating meaning </span>
      <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;font-size:x-small;">| </span>
      <span style="color:rgb(241,92,55);font-family:arial,sans-serif;font-size:x-small;">celebrating context</span>
    </div>
    <div style="color:rgb(34,34,34);font-size:x-small;font-family:arial,sans-serif;">
      World's 100 Best Architecture Firms, Archello
      <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;"> | </span>
      WAF
      <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;"> | </span>
      TIME Magazine
      <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;"> | </span>
      Prix Versailles
      <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;"> | </span>
      Dezeen Awards
    </div>
    <div style="font-size:x-small;font-family:arial,sans-serif;">
      <a href="https://studiolotus.in/" style="color:rgb(17,85,204);" target="_blank" rel="noopener">Website</a>
      <span> | </span>
      <a href="https://www.instagram.com/studio_lotus/" style="color:rgb(17,85,204);" target="_blank" rel="noopener">Instagram</a>
      <span> | </span>
      <a href="https://www.linkedin.com/company/studiolotus/" style="color:rgb(17,85,204);" target="_blank" rel="noopener">LinkedIn</a>
      <span> | </span>
      <a href="https://www.facebook.com/studiolotus.in/" style="color:rgb(17,85,204);" target="_blank" rel="noopener">Facebook</a>
    </div>
  </div>
</div>
""".strip()


def _escape_html(raw: str) -> str:
    return (
        raw.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _looks_like_html(raw: str) -> bool:
    return bool(_HTML_DETECTION.search(raw))


def _normalize_plaintext_html(raw: str) -> str:
    trimmed = raw.strip()
    if not trimmed:
        return ""
    escaped = _escape_html(trimmed)
    paragraphs = re.split(r"\r?\n\r?\n", escaped)
    normalized = "</p><p>".join(chunk.replace("\r\n", "<br>").replace("\n", "<br>") for chunk in paragraphs)
    return f"<p>{normalized}</p>"


def _format_due_date(value) -> str:
    if not value:
        return "TBD"
    return value.date().isoformat()


def render_sprint_brief_html(
    *,
    template: RecSprintTemplate | None,
    sprint: RecCandidateSprint,
    candidate: RecCandidate | None,
    opening: RecOpening | None,
    include_signature: bool = False,
) -> Optional[str]:
    if not template or not template.description:
        return template.description if template else None

    raw = template.description.strip()
    if not raw:
        return None

    replacements_plain = {
        "{{candidate_name}}": candidate.full_name if candidate else "",
        "{{candidate_code}}": candidate.candidate_code if candidate else "",
        "{{due_date}}": _format_due_date(sprint.due_at),
        "{{opening_title}}": opening.title if opening else "",
        "{{template_name}}": template.name,
    }
    replacements_html = {k: _escape_html(v or "") for k, v in replacements_plain.items()}

    if _looks_like_html(raw):
        html = raw
        for key, value in replacements_html.items():
            html = html.replace(key, value)
    else:
        plain = raw
        for key, value in replacements_plain.items():
            plain = plain.replace(key, value or "")
        html = _normalize_plaintext_html(plain)

    if include_signature and not settings.public_link_skip_signature and not _SIGNATURE_DETECTION.search(html):
        html = f"{html}\n{SPRINT_SIGNATURE_HTML}"

    return html
