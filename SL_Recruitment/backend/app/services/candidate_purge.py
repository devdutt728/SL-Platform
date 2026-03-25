import logging
from urllib.parse import parse_qs, urlparse

import anyio
from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.platform_session import PlatformSessionLocal
from app.models.candidate import RecCandidate
from app.models.candidate_assessment import RecCandidateAssessment
from app.models.candidate_ingest_attempt import RecCandidateIngestAttempt
from app.models.candidate_ingest_idempotency import RecCandidateIngestIdempotency
from app.models.candidate_offer import RecCandidateOffer
from app.models.candidate_sprint import RecCandidateSprint
from app.models.candidate_sprint_attachment import RecCandidateSprintAttachment
from app.models.event import RecCandidateEvent
from app.models.interview import RecCandidateInterview
from app.models.interview_assessment import RecCandidateInterviewAssessment
from app.models.interview_slot import RecCandidateInterviewSlot
from app.models.joining_doc import RecCandidateJoiningDoc
from app.models.joining_profile import RecCandidateJoiningProfile
from app.models.operation_retry import RecOperationRetry
from app.models.platform_person import DimPerson, DimPersonExtra, DimPersonRole
from app.models.screening import RecCandidateScreening
from app.models.sprint_attachment import RecSprintAttachment
from app.models.stage import RecCandidateStage
from app.services.candidate_codes import release_candidate_code
from app.services.drive import delete_candidate_folder, delete_drive_item

logger = logging.getLogger("slr.candidate_purge")


def _extract_drive_file_id(raw_url: str | None) -> str | None:
    if not raw_url:
        return None
    try:
        parsed = urlparse(raw_url)
        if parsed.query:
            query = parse_qs(parsed.query)
            if "id" in query and query["id"]:
                return str(query["id"][0]).strip() or None
        parts = parsed.path.split("/")
        if "d" in parts:
            idx = parts.index("d")
            if idx + 1 < len(parts):
                return str(parts[idx + 1]).strip() or None
    except Exception:
        return None
    return None


async def _collect_candidate_drive_file_ids(session: AsyncSession, *, candidate_id: int) -> tuple[set[str], set[int]]:
    file_ids: set[str] = set()
    sprint_attachment_ids: set[int] = set()

    joining_file_ids = (
        await session.execute(
            select(RecCandidateJoiningDoc.file_id).where(RecCandidateJoiningDoc.candidate_id == candidate_id)
        )
    ).scalars().all()
    for file_id in joining_file_ids:
        if file_id:
            file_ids.add(str(file_id).strip())

    offer_urls = (
        await session.execute(
            select(RecCandidateOffer.pdf_url).where(RecCandidateOffer.candidate_id == candidate_id)
        )
    ).scalars().all()
    for offer_url in offer_urls:
        file_id = _extract_drive_file_id(offer_url)
        if file_id:
            file_ids.add(file_id)

    sprint_rows = (
        await session.execute(
            select(RecSprintAttachment.sprint_attachment_id, RecSprintAttachment.drive_file_id)
            .join(
                RecCandidateSprintAttachment,
                RecCandidateSprintAttachment.sprint_attachment_id == RecSprintAttachment.sprint_attachment_id,
            )
            .join(
                RecCandidateSprint,
                RecCandidateSprint.candidate_sprint_id == RecCandidateSprintAttachment.candidate_sprint_id,
            )
            .where(RecCandidateSprint.candidate_id == candidate_id)
        )
    ).all()
    for sprint_attachment_id, drive_file_id in sprint_rows:
        if sprint_attachment_id is not None:
            sprint_attachment_ids.add(int(sprint_attachment_id))
        if drive_file_id:
            file_ids.add(str(drive_file_id).strip())

    return file_ids, sprint_attachment_ids


async def _purge_drive_assets(candidate: RecCandidate, *, file_ids: set[str]) -> None:
    for file_id in sorted({fid for fid in file_ids if fid}):
        deleted = await anyio.to_thread.run_sync(delete_drive_item, file_id)
        if not deleted:
            raise RuntimeError(f"Drive delete failed for file_id={file_id}")

    folder_id = str(candidate.drive_folder_id or "").strip()
    if folder_id:
        deleted = await anyio.to_thread.run_sync(delete_drive_item, folder_id)
        if not deleted:
            raise RuntimeError(f"Drive delete failed for folder_id={folder_id}")

    candidate_code = str(candidate.candidate_code or "").strip()
    if candidate_code:
        for bucket in ("Ongoing", "Appointed", "Not Appointed"):
            await anyio.to_thread.run_sync(
                lambda bucket_name=bucket: delete_candidate_folder(
                    candidate_code=candidate_code,
                    folder_id=None,
                    bucket=bucket_name,  # type: ignore[arg-type]
                )
            )


async def _purge_platform_lineage(candidate: RecCandidate) -> None:
    person_ids = {f"REC_{candidate.candidate_id}"}
    candidate_code = str(candidate.candidate_code or "").strip().upper()
    async with PlatformSessionLocal() as platform_session:
        filters = [DimPerson.source_candidate_id == candidate.candidate_id]
        if candidate_code:
            filters.append(func.upper(func.coalesce(DimPerson.source_candidate_code, "")) == candidate_code)
        lineage_person_ids = (
            await platform_session.execute(
                select(DimPerson.person_id).where(or_(*filters))
            )
        ).scalars().all()
        for person_id in lineage_person_ids:
            if person_id:
                person_ids.add(str(person_id).strip())

        for person_id in {pid for pid in person_ids if pid}:
            await platform_session.execute(delete(DimPersonRole).where(DimPersonRole.person_id == person_id))
            await platform_session.execute(delete(DimPersonExtra).where(DimPersonExtra.person_id == person_id))
            await platform_session.execute(delete(DimPerson).where(DimPerson.person_id == person_id))
        await platform_session.commit()


async def purge_candidate_with_dependents(
    session: AsyncSession,
    candidate: RecCandidate,
    *,
    delete_drive: bool = True,
    delete_platform_lineage: bool = True,
) -> None:
    cid = candidate.candidate_id
    drive_file_ids: set[str] = set()
    sprint_attachment_ids: set[int] = set()
    if delete_drive:
        drive_file_ids, sprint_attachment_ids = await _collect_candidate_drive_file_ids(session, candidate_id=cid)

    if delete_drive:
        await _purge_drive_assets(candidate, file_ids=drive_file_ids)
    if delete_platform_lineage:
        await _purge_platform_lineage(candidate)

    await session.execute(delete(RecOperationRetry).where(RecOperationRetry.candidate_id == cid))
    await session.execute(delete(RecCandidateIngestAttempt).where(RecCandidateIngestAttempt.candidate_id == cid))
    await session.execute(delete(RecCandidateIngestIdempotency).where(RecCandidateIngestIdempotency.candidate_id == cid))
    await session.execute(delete(RecCandidateInterviewSlot).where(RecCandidateInterviewSlot.candidate_id == cid))
    await session.execute(delete(RecCandidateInterviewAssessment).where(RecCandidateInterviewAssessment.candidate_id == cid))
    await session.execute(delete(RecCandidateInterview).where(RecCandidateInterview.candidate_id == cid))
    await session.execute(delete(RecCandidateJoiningDoc).where(RecCandidateJoiningDoc.candidate_id == cid))
    await session.execute(delete(RecCandidateJoiningProfile).where(RecCandidateJoiningProfile.candidate_id == cid))
    await session.execute(delete(RecCandidateAssessment).where(RecCandidateAssessment.candidate_id == cid))
    await session.execute(delete(RecCandidateEvent).where(RecCandidateEvent.candidate_id == cid))
    await session.execute(delete(RecCandidateStage).where(RecCandidateStage.candidate_id == cid))
    await session.execute(delete(RecCandidateScreening).where(RecCandidateScreening.candidate_id == cid))

    sprint_ids = (
        await session.execute(
            select(RecCandidateSprint.candidate_sprint_id).where(RecCandidateSprint.candidate_id == cid)
        )
    ).scalars().all()
    sprint_ids = [int(sprint_id) for sprint_id in sprint_ids if sprint_id is not None]
    if sprint_ids:
        await session.execute(
            delete(RecCandidateSprintAttachment).where(
                RecCandidateSprintAttachment.candidate_sprint_id.in_(sprint_ids)
            )
        )
    if sprint_attachment_ids:
        await session.execute(
            delete(RecSprintAttachment).where(
                RecSprintAttachment.sprint_attachment_id.in_(list(sprint_attachment_ids))
            )
        )

    await session.execute(delete(RecCandidateSprint).where(RecCandidateSprint.candidate_id == cid))
    await session.execute(delete(RecCandidateOffer).where(RecCandidateOffer.candidate_id == cid))

    for table in ("rec_candidate_reference_check",):
        try:
            await session.execute(text(f"DELETE FROM {table} WHERE candidate_id = :cid"), {"cid": cid})
        except Exception:
            logger.warning("Skip purge on optional table %s for candidate_id=%s", table, cid)

    await release_candidate_code(
        session,
        candidate_code=candidate.candidate_code,
        candidate_id=candidate.candidate_id,
    )
    await session.delete(candidate)
