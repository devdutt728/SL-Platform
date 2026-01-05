from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
import os
from pathlib import Path
import json
import subprocess
import sys
import tempfile

import anyio
from jinja2 import Template
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.candidate import RecCandidate
from app.models.candidate_offer import RecCandidateOffer
from app.models.opening import RecOpening
from app.schemas.user import UserContext
from app.services.drive import create_candidate_folder, upload_joining_doc
from app.services.events import log_event


@dataclass(frozen=True)
class OfferDocumentContext:
    issue_date: str
    salutation: str
    candidate_name: str
    candidate_address: str
    designation: str
    current_ctc_annual: str | None
    expected_ctc_annual: str | None
    unit: str
    reporting_to: str
    joining_date: str
    office_address: str
    gross_salary_monthly: str
    joining_bonus_monthly: str | None
    joining_bonus_installment: str | None
    joining_bonus_end_month_year: str | None
    variable_start_month_year: str | None
    variable_eval_year_range: str | None
    variable_payout_year_range: str | None
    include_joining_bonus: bool
    signatory_name: str
    signatory_title: str
    candidate_signature_name: str
    candidate_signature_date: str | None


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _template_path() -> Path:
    return _project_root() / "templates" / "offer" / "offer_template.html"


def _generated_dir() -> Path:
    base = os.environ.get("SL_OFFER_GENERATED_DIR")
    if base:
        return Path(base)
    return Path(tempfile.gettempdir()) / "sl_recruitment" / "offers"


def _fallback_candidate_code(candidate: RecCandidate) -> str:
    if candidate.candidate_code:
        return candidate.candidate_code
    return f"SLR-{candidate.candidate_id:03d}"


def _format_date(value: date | datetime) -> str:
    month = value.strftime("%B")
    return f"{month} {value.day}, {value.year}"


def _build_context(
    *,
    offer: RecCandidateOffer,
    candidate: RecCandidate,
    opening: RecOpening | None,
    payload: dict,
) -> OfferDocumentContext:
    issue_date = payload.get("issue_date")
    if not issue_date:
        issue_date = _format_date(datetime.utcnow())

    salutation = (payload.get("salutation") or "Mr").strip()

    candidate_name = (payload.get("candidate_name") or "").strip()
    if not candidate_name:
        candidate_name = (candidate.full_name or "").strip() or f"{candidate.first_name} {candidate.last_name or ''}".strip()
    if not candidate_name:
        raise ValueError("Candidate name is required.")
    candidate_address = (payload.get("candidate_address") or "").strip()
    if not candidate_address:
        raise ValueError("Candidate address is required.")

    designation = (payload.get("designation") or offer.designation_title or (opening.title if opening else "") or "").strip()
    if not designation:
        raise ValueError("Designation is required.")

    current_ctc_annual = (payload.get("current_ctc_annual") or "").strip() or None
    expected_ctc_annual = (payload.get("expected_ctc_annual") or "").strip() or None

    unit = (payload.get("unit") or "").strip()
    reporting_to = (payload.get("reporting_to") or "").strip()
    if not unit or not reporting_to:
        raise ValueError("Unit and reporting_to are required.")

    joining_date = payload.get("joining_date")
    if not joining_date and offer.joining_date:
        joining_date = _format_date(offer.joining_date)
    if not joining_date:
        raise ValueError("Joining date is required.")

    office_address = (payload.get("office_address") or "").strip()
    if not office_address:
        raise ValueError("Office address is required.")

    gross_salary_monthly = payload.get("gross_salary_monthly")
    if not gross_salary_monthly and offer.gross_ctc_annual:
        monthly = float(offer.gross_ctc_annual) / 12
        gross_salary_monthly = f"Rs. {monthly:,.0f}/-"
    if not gross_salary_monthly:
        raise ValueError("Gross salary monthly is required.")

    include_joining_bonus = bool(payload.get("include_joining_bonus", False))
    joining_bonus_monthly = payload.get("joining_bonus_monthly")
    joining_bonus_installment = payload.get("joining_bonus_installment")
    joining_bonus_end_month_year = payload.get("joining_bonus_end_month_year")
    if include_joining_bonus:
        if not joining_bonus_monthly:
            raise ValueError("Joining bonus monthly is required when include_joining_bonus is true.")
        if not joining_bonus_installment:
            raise ValueError("Joining bonus installment is required when include_joining_bonus is true.")
        if not joining_bonus_end_month_year:
            raise ValueError("Joining bonus end month/year is required when include_joining_bonus is true.")

    variable_start_month_year = payload.get("variable_start_month_year")
    variable_eval_year_range = payload.get("variable_eval_year_range")
    variable_payout_year_range = payload.get("variable_payout_year_range")

    signatory_name = (payload.get("signatory_name") or "Harsh Vardhan").strip()
    signatory_title = (payload.get("signatory_title") or "Principal").strip()
    candidate_signature_name = (payload.get("candidate_signature_name") or candidate_name).strip()
    candidate_signature_date = payload.get("candidate_signature_date")

    return OfferDocumentContext(
        issue_date=issue_date,
        salutation=salutation,
        candidate_name=candidate_name,
        candidate_address=candidate_address,
        designation=designation,
        current_ctc_annual=current_ctc_annual,
        expected_ctc_annual=expected_ctc_annual,
        unit=unit,
        reporting_to=reporting_to,
        joining_date=joining_date,
        office_address=office_address,
        gross_salary_monthly=gross_salary_monthly,
        joining_bonus_monthly=joining_bonus_monthly,
        joining_bonus_installment=joining_bonus_installment,
        joining_bonus_end_month_year=joining_bonus_end_month_year,
        variable_start_month_year=variable_start_month_year,
        variable_eval_year_range=variable_eval_year_range,
        variable_payout_year_range=variable_payout_year_range,
        include_joining_bonus=include_joining_bonus,
        signatory_name=signatory_name,
        signatory_title=signatory_title,
        candidate_signature_name=candidate_signature_name,
        candidate_signature_date=candidate_signature_date,
    )


def _render_offer_pdf_subprocess(template_path: Path, output_path: Path, ctx: OfferDocumentContext) -> None:
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as ctx_file:
        json.dump(ctx.__dict__, ctx_file)
        ctx_path = Path(ctx_file.name)
    try:
        env = os.environ.copy()
        env["PYTHONPATH"] = f"{_project_root()}{os.pathsep}{env.get('PYTHONPATH', '')}"
        subprocess.run(
            [
                sys.executable,
                "-m",
                "app.scripts.render_offer_pdf",
                str(template_path),
                str(output_path),
                str(ctx_path),
            ],
            cwd=str(_project_root()),
            env=env,
            check=True,
            timeout=90,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        stdout = (exc.stdout or "").strip()
        detail = stderr or stdout or f"Process failed (exit={exc.returncode})."
        raise RuntimeError(f"PDF rendering failed: {detail}") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("PDF rendering timed out.") from exc
    finally:
        try:
            ctx_path.unlink()
        except Exception:
            pass


async def _upload_offer_pdf_to_drive(
    *,
    candidate: RecCandidate,
    offer: RecCandidateOffer,
    pdf_path: Path,
) -> str:
    if not candidate.drive_folder_id:
        raise ValueError("Candidate drive folder missing.")
    filename = f"{candidate.candidate_code or offer.candidate_offer_id}-offer-v{offer.offer_version}.pdf"
    data = pdf_path.read_bytes()
    try:
        # Avoid blocking the event loop on slow Drive API calls.
        with anyio.fail_after(90):
            _, file_url = await anyio.to_thread.run_sync(
                lambda: upload_joining_doc(
                    candidate.drive_folder_id,
                    filename=filename,
                    content_type="application/pdf",
                    data=data,
                )
            )
        return file_url
    except TimeoutError as exc:
        raise RuntimeError("Drive upload timed out.") from exc
    except Exception as exc:
        raise RuntimeError(f"Drive upload failed: {exc}") from exc


async def generate_offer_document(
    session: AsyncSession,
    *,
    offer: RecCandidateOffer,
    candidate: RecCandidate,
    opening: RecOpening | None,
    payload: dict,
    user: UserContext,
) -> Path:
    ctx = _build_context(offer=offer, candidate=candidate, opening=opening, payload=payload)
    if not candidate.drive_folder_id:
        folder_id, folder_url = await anyio.to_thread.run_sync(
            create_candidate_folder, _fallback_candidate_code(candidate), candidate.full_name or ""
        )
        candidate.drive_folder_id = folder_id
        candidate.drive_folder_url = folder_url
        candidate.updated_at = datetime.utcnow()
        await log_event(
            session,
            candidate_id=candidate.candidate_id,
            action_type="drive_folder_created",
            performed_by_person_id_platform=_platform_person_id(user),
            related_entity_type="candidate",
            related_entity_id=candidate.candidate_id,
            meta_json={"drive_folder_id": folder_id, "drive_folder_url": folder_url},
        )
    template_path = _template_path()
    if not template_path.exists():
        raise FileNotFoundError(f"Offer template not found at {template_path}")

    output_dir = _generated_dir()
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    pdf_path = output_dir / f"offer_{offer.candidate_offer_id}_v{offer.offer_version}_{timestamp}.pdf"

    # Run PDF rendering in a subprocess to avoid crashing the main worker if GTK/Pango misbehaves.
    await anyio.to_thread.run_sync(_render_offer_pdf_subprocess, template_path, pdf_path, ctx)
    pdf_url = await _upload_offer_pdf_to_drive(candidate=candidate, offer=offer, pdf_path=pdf_path)
    try:
        pdf_path.unlink()
    except Exception:
        pass

    now = datetime.utcnow()
    offer.docx_url = None
    offer.pdf_url = pdf_url
    if await _has_offer_doc_payload(session):
        offer.offer_doc_payload = json.dumps(ctx.__dict__)
    offer.generated_by_person_id_platform = _platform_person_id(user)
    offer.generated_at = now
    offer.updated_at = now

    await log_event(
        session,
        candidate_id=offer.candidate_id,
        action_type="offer_document_generated",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_json={"offer_id": offer.candidate_offer_id, "docx_url": offer.docx_url, "pdf_url": offer.pdf_url},
    )
    return pdf_path


def _platform_person_id(user: UserContext) -> int | None:
    raw = (user.person_id_platform or "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except Exception:
        return None


async def _has_offer_doc_payload(session: AsyncSession) -> bool:
    try:
        result = await session.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = DATABASE() "
                "AND table_name = 'rec_candidate_offer' "
                "AND column_name = 'offer_doc_payload' "
                "LIMIT 1"
            )
        )
        return result.first() is not None
    except Exception:
        return False
