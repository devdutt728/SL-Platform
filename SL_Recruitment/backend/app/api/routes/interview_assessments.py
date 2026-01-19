from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.auth import require_roles, require_superadmin
from app.core.config import settings
from app.core.roles import Role
from app.models.candidate import RecCandidate
from app.models.interview import RecCandidateInterview
from app.models.interview_assessment import RecCandidateInterviewAssessment
from app.schemas.interview_assessment import L2AssessmentOut, L2AssessmentPayload
from app.schemas.user import UserContext
from app.services.events import log_event

router = APIRouter(prefix="/rec", tags=["interview-assessments"])


def _clean_platform_person_id(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = raw.strip()
    return value or None


def _safe_load_json(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except Exception:
        return {}
    return value if isinstance(value, dict) else {}


def _assert_assessment_access(user: UserContext, interview: RecCandidateInterview) -> None:
    if Role.HR_ADMIN in user.roles or Role.HR_EXEC in user.roles:
        return
    if Role.INTERVIEWER in user.roles or Role.GROUP_LEAD in user.roles:
        if user.person_id_platform and interview.interviewer_person_id_platform:
            if _clean_platform_person_id(user.person_id_platform) == _clean_platform_person_id(interview.interviewer_person_id_platform):
                return
        if settings.environment != "production" and not user.person_id_platform:
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


def _is_superadmin(user: UserContext) -> bool:
    return (user.platform_role_id or None) == 2 or (Role.HR_ADMIN in user.roles and user.platform_role_id is None)


def _build_out(
    assessment: RecCandidateInterviewAssessment | None,
    *,
    interview: RecCandidateInterview,
    locked: bool,
) -> L2AssessmentOut:
    return L2AssessmentOut(
        candidate_interview_assessment_id=assessment.candidate_interview_assessment_id if assessment else None,
        candidate_interview_id=interview.candidate_interview_id,
        candidate_id=interview.candidate_id,
        interviewer_person_id_platform=assessment.interviewer_person_id_platform if assessment else interview.interviewer_person_id_platform,
        status=assessment.status if assessment else "draft",
        data=_safe_load_json(assessment.data_json if assessment else None),
        submitted_at=assessment.submitted_at if assessment else None,
        created_at=assessment.created_at if assessment else None,
        updated_at=assessment.updated_at if assessment else None,
        locked=locked,
    )


async def _get_interview(session: AsyncSession, interview_id: int) -> RecCandidateInterview:
    interview = await session.get(RecCandidateInterview, interview_id)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    return interview


@router.get("/interviews/{candidate_interview_id}/l2-assessment", response_model=L2AssessmentOut)
async def get_l2_assessment(
    candidate_interview_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.INTERVIEWER, Role.GROUP_LEAD])),
):
    interview = await _get_interview(session, candidate_interview_id)
    _assert_assessment_access(user, interview)
    assessment = (
        await session.execute(
            select(RecCandidateInterviewAssessment).where(
                RecCandidateInterviewAssessment.candidate_interview_id == candidate_interview_id
            )
        )
    ).scalar_one_or_none()
    readonly = (Role.HR_ADMIN in user.roles or Role.HR_EXEC in user.roles) and not _is_superadmin(user)
    locked = bool((assessment and assessment.status == "submitted" and not _is_superadmin(user)) or readonly)
    return _build_out(assessment, interview=interview, locked=locked)


@router.put("/interviews/{candidate_interview_id}/l2-assessment", response_model=L2AssessmentOut)
async def save_l2_assessment(
    candidate_interview_id: int,
    payload: L2AssessmentPayload,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.INTERVIEWER, Role.GROUP_LEAD])),
):
    interview = await _get_interview(session, candidate_interview_id)
    _assert_assessment_access(user, interview)
    if (Role.HR_ADMIN in user.roles or Role.HR_EXEC in user.roles) and not _is_superadmin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR roles cannot edit assessments")
    if "l2" not in (interview.round_type or "").lower() and not _is_superadmin(user):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="L2 assessments are only for L2 interviews")
    assessment = (
        await session.execute(
            select(RecCandidateInterviewAssessment).where(
                RecCandidateInterviewAssessment.candidate_interview_id == candidate_interview_id
            )
        )
    ).scalar_one_or_none()

    if assessment and assessment.status == "submitted" and not _is_superadmin(user):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Assessment is locked")

    if not assessment:
        assessment = RecCandidateInterviewAssessment(
            candidate_interview_id=candidate_interview_id,
            candidate_id=interview.candidate_id,
            interviewer_person_id_platform=_clean_platform_person_id(interview.interviewer_person_id_platform),
            status="draft",
            data_json=json.dumps(payload.data),
            created_by_person_id_platform=_clean_platform_person_id(user.person_id_platform),
            updated_by_person_id_platform=_clean_platform_person_id(user.person_id_platform),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        session.add(assessment)
    else:
        assessment.data_json = json.dumps(payload.data)
        assessment.updated_by_person_id_platform = _clean_platform_person_id(user.person_id_platform)
        assessment.updated_at = datetime.utcnow()

    await session.commit()
    locked = bool(assessment.status == "submitted" and not _is_superadmin(user))
    return _build_out(assessment, interview=interview, locked=locked)


@router.post("/interviews/{candidate_interview_id}/l2-assessment/submit", response_model=L2AssessmentOut)
async def submit_l2_assessment(
    candidate_interview_id: int,
    payload: L2AssessmentPayload,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.INTERVIEWER, Role.GROUP_LEAD])),
):
    interview = await _get_interview(session, candidate_interview_id)
    _assert_assessment_access(user, interview)
    if (Role.HR_ADMIN in user.roles or Role.HR_EXEC in user.roles) and not _is_superadmin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR roles cannot submit assessments")
    if "l2" not in (interview.round_type or "").lower() and not _is_superadmin(user):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="L2 assessments are only for L2 interviews")
    assessment = (
        await session.execute(
            select(RecCandidateInterviewAssessment).where(
                RecCandidateInterviewAssessment.candidate_interview_id == candidate_interview_id
            )
        )
    ).scalar_one_or_none()

    if assessment and assessment.status == "submitted" and not _is_superadmin(user):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Assessment already submitted")

    now = datetime.utcnow()
    if not assessment:
        assessment = RecCandidateInterviewAssessment(
            candidate_interview_id=candidate_interview_id,
            candidate_id=interview.candidate_id,
            interviewer_person_id_platform=_clean_platform_person_id(interview.interviewer_person_id_platform),
            status="submitted",
            data_json=json.dumps(payload.data),
            created_by_person_id_platform=_clean_platform_person_id(user.person_id_platform),
            updated_by_person_id_platform=_clean_platform_person_id(user.person_id_platform),
            submitted_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(assessment)
    else:
        assessment.status = "submitted"
        assessment.data_json = json.dumps(payload.data)
        assessment.updated_by_person_id_platform = _clean_platform_person_id(user.person_id_platform)
        assessment.submitted_at = now
        assessment.updated_at = now

    interview.feedback_submitted = True
    interview.updated_at = now

    performed_by = None
    if user.person_id_platform:
        try:
            performed_by = int(user.person_id_platform)
        except Exception:
            performed_by = None

    await log_event(
        session,
        candidate_id=interview.candidate_id,
        action_type="l2_assessment_submitted",
        performed_by_person_id_platform=performed_by,
        related_entity_type="interview",
        related_entity_id=interview.candidate_interview_id,
        meta_json={"candidate_interview_id": candidate_interview_id},
    )

    await session.commit()
    locked = bool(assessment.status == "submitted" and not _is_superadmin(user))
    return _build_out(assessment, interview=interview, locked=locked)


@router.delete("/interviews/{candidate_interview_id}/l2-assessment", status_code=status.HTTP_204_NO_CONTENT)
async def delete_l2_assessment(
    candidate_interview_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_superadmin()),
):
    assessment = (
        await session.execute(
            select(RecCandidateInterviewAssessment).where(
                RecCandidateInterviewAssessment.candidate_interview_id == candidate_interview_id
            )
        )
    ).scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")
    await session.delete(assessment)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/interviews/{candidate_interview_id}/l2-assessment/pdf")
async def download_l2_assessment_pdf(
    candidate_interview_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.INTERVIEWER, Role.GROUP_LEAD])),
):
    interview = await _get_interview(session, candidate_interview_id)
    _assert_assessment_access(user, interview)
    assessment = (
        await session.execute(
            select(RecCandidateInterviewAssessment).where(
                RecCandidateInterviewAssessment.candidate_interview_id == candidate_interview_id
            )
        )
    ).scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    candidate = await session.get(RecCandidate, interview.candidate_id)
    data = _safe_load_json(assessment.data_json)

    html = _render_l2_assessment_html(
        candidate_name=candidate.full_name if candidate else "",
        candidate_code=candidate.candidate_code if candidate else "",
        round_type=interview.round_type,
        data=data,
    )
    pdf = _render_pdf_bytes(html)
    filename = f"{(candidate.candidate_code if candidate else 'candidate')}-l2-assessment.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _render_pdf_bytes(html: str) -> bytes:
    try:
        from weasyprint import HTML
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="WeasyPrint not available") from exc
    try:
        return HTML(string=html).write_pdf()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to render PDF") from exc


def _render_l2_assessment_html(*, candidate_name: str, candidate_code: str, round_type: str, data: dict) -> str:
    def _val(path: list[str], default: str = "") -> str:
        cursor = data
        for key in path:
            if not isinstance(cursor, dict):
                return default
            cursor = cursor.get(key)
        return "" if cursor is None else str(cursor)

    def _yes_no(value: str) -> str:
        if value is None:
            return "-"
        return str(value).strip().upper() or "-"

    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>L2 Assessment</title>
    <style>
      @page {{ size: A4; margin: 2cm 2cm 2.4cm; }}
      body {{ font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #111827; }}
      h1 {{ font-size: 16pt; margin: 0 0 8px; }}
      h2 {{ font-size: 12pt; margin: 18px 0 6px; }}
      p {{ margin: 0 0 8px; line-height: 1.4; }}
      table {{ width: 100%; border-collapse: collapse; margin: 8px 0 12px; }}
      th, td {{ border: 1px solid #111; padding: 6px 8px; vertical-align: top; text-align: left; }}
      .muted {{ color: #475569; }}
      .section {{ margin-top: 12px; }}
      .label {{ font-weight: 700; }}
    </style>
  </head>
  <body>
    <h1>2nd Interview: L2 Assessment Form</h1>
    <p class="muted">{candidate_name} ({candidate_code}) - {round_type}</p>

    <div class="section">
      <h2>HR Screening (Prior to L2 Interview)</h2>
      <table>
        <tr>
          <th>Candidate Name</th>
          <th>Team Lead</th>
          <th>Preferred Date of Joining</th>
          <th>Min 2 year commitment response</th>
        </tr>
        <tr>
          <td>{_val(["pre_interview", "candidate_name"])}</td>
          <td>{_val(["pre_interview", "team_lead"])}</td>
          <td>{_val(["pre_interview", "preferred_joining_date"])}</td>
          <td>{_val(["pre_interview", "two_year_commitment"])}</td>
        </tr>
        <tr>
          <th>On-site/Studio Timings</th>
          <th>Family relocation support</th>
          <th colspan="2">Questions or doubts</th>
        </tr>
        <tr>
          <td>{_val(["pre_interview", "on_site_timings"])}</td>
          <td>{_val(["pre_interview", "family_support"])}</td>
          <td colspan="2">{_val(["pre_interview", "other_questions"])}</td>
        </tr>
      </table>
    </div>

    <div class="section">
      <h2>Section 1: Why Studio Lotus? &amp; Candidate Longevity</h2>
      <p class="label">Interview notes</p>
      <p>{_val(["section1", "notes"])}</p>
      <table>
        <tr><th>Hiring manager to assess on</th><th>Yes / No</th></tr>
        <tr><td>Authentic reasons for job change</td><td>{_yes_no(_val(["section1", "assess_authenticity"]))}</td></tr>
        <tr><td>Serious about taking up the job</td><td>{_yes_no(_val(["section1", "assess_serious"]))}</td></tr>
        <tr><td>Researched Studio Lotus</td><td>{_yes_no(_val(["section1", "assess_researched"]))}</td></tr>
        <tr><td>Thoughtful criteria for choosing Studio Lotus</td><td>{_yes_no(_val(["section1", "assess_criteria"]))}</td></tr>
        <tr><td>Clear career aspirations</td><td>{_yes_no(_val(["section1", "assess_aspirations"]))}</td></tr>
        <tr><td>Studio Lotus meets expectations</td><td>{_yes_no(_val(["section1", "assess_expectations"]))}</td></tr>
      </table>
      <p class="label">Hiring manager notes</p>
      <p>{_val(["section1", "manager_notes"])}</p>
    </div>

    <div class="section">
      <h2>Section 2: Functional Role Fitment</h2>
      <p class="label">Interview notes</p>
      <p>{_val(["section2", "notes"])}</p>
      <table>
        <tr><th>Hiring manager to assess on</th><th>Yes / No</th></tr>
        <tr><td>Clear on role being offered</td><td>{_yes_no(_val(["section2", "assess_role_clear"]))}</td></tr>
        <tr><td>Shares strengths and learning needs</td><td>{_yes_no(_val(["section2", "assess_strengths"]))}</td></tr>
        <tr><td>Set clear role expectations</td><td>{_yes_no(_val(["section2", "assess_expectations"]))}</td></tr>
        <tr><td>Fit for the role</td><td>{_yes_no(_val(["section2", "assess_fit"]))}</td></tr>
      </table>
      <p class="label">Hiring manager notes</p>
      <p>{_val(["section2", "manager_notes"])}</p>
    </div>

    <div class="section">
      <h2>Section 3: Candidate Expectations &amp; Preferences</h2>
      <p class="label">Interview notes</p>
      <p>{_val(["section3", "notes"])}</p>
      <table>
        <tr><th>Hiring manager to assess on</th><th>Yes / No</th></tr>
        <tr><td>Flexible for multiple kinds of work</td><td>{_yes_no(_val(["section3", "assess_flexibility"]))}</td></tr>
        <tr><td>Specific interest area</td><td>{_val(["section3", "interest_area"])}</td></tr>
        <tr><td>Studio Lotus meets expectations</td><td>{_yes_no(_val(["section3", "assess_expectations"]))}</td></tr>
      </table>
      <p class="label">Hiring manager notes</p>
      <p>{_val(["section3", "manager_notes"])}</p>
    </div>

    <div class="section">
      <h2>Section 4: Leadership Competencies (1-5)</h2>
      <table>
        <tr><th>Leadership Area</th><th>Details</th><th>Rating</th></tr>
        <tr><td>Execution Orientation</td><td>Action orientation</td><td>{_val(["section4", "ratings", "execution_action"])}</td></tr>
        <tr><td></td><td>Self-discipline and on-time delivery</td><td>{_val(["section4", "ratings", "execution_discipline"])}</td></tr>
        <tr><td></td><td>Independent Decision Making</td><td>{_val(["section4", "ratings", "execution_decision"])}</td></tr>
        <tr><td>Process Orientation</td><td>Time Management &amp; Prioritisation</td><td>{_val(["section4", "ratings", "process_time"])}</td></tr>
        <tr><td></td><td>Following laid out processes</td><td>{_val(["section4", "ratings", "process_follow"])}</td></tr>
        <tr><td></td><td>Creating new processes and rules</td><td>{_val(["section4", "ratings", "process_create"])}</td></tr>
        <tr><td>Strategic Orientation</td><td>Strategic, Futuristic thinking</td><td>{_val(["section4", "ratings", "strategic_futuristic"])}</td></tr>
        <tr><td></td><td>Ideation and Creativity</td><td>{_val(["section4", "ratings", "strategic_ideation"])}</td></tr>
        <tr><td></td><td>Risk taking ability</td><td>{_val(["section4", "ratings", "strategic_risk"])}</td></tr>
        <tr><td>People Orientation</td><td>Collaboration &amp; Team Work</td><td>{_val(["section4", "ratings", "people_collaboration"])}</td></tr>
        <tr><td></td><td>Coaching and developing others</td><td>{_val(["section4", "ratings", "people_coaching"])}</td></tr>
        <tr><td></td><td>Giving and Taking Feedback</td><td>{_val(["section4", "ratings", "people_feedback"])}</td></tr>
        <tr><td></td><td>Conflict Resolution</td><td>{_val(["section4", "ratings", "people_conflict"])}</td></tr>
      </table>
      <p class="label">Hiring manager notes</p>
      <p>{_val(["section4", "manager_notes"])}</p>
    </div>

    <div class="section">
      <h2>Section 5: Self-awareness &amp; Culture Fit (1-5)</h2>
      <table>
        <tr><th>Hiring manager to assess on</th><th>Rating</th></tr>
        <tr><td>Self-awareness</td><td>{_val(["section5", "ratings", "self_awareness"])}</td></tr>
        <tr><td>Openness to feedback</td><td>{_val(["section5", "ratings", "openness"])}</td></tr>
        <tr><td>Personal mastery &amp; learning</td><td>{_val(["section5", "ratings", "mastery"])}</td></tr>
      </table>
      <p class="label">Interview notes</p>
      <p>{_val(["section5", "notes"])}</p>
      <p class="label">Hiring manager notes</p>
      <p>{_val(["section5", "manager_notes"])}</p>
    </div>

    <div class="section">
      <h2>Section 6: Strengths &amp; Learning Needs</h2>
      <p class="label">Interview notes</p>
      <p>{_val(["section6", "notes"])}</p>
      <table>
        <tr><th>Key Strengths</th><th>Key Learning Needs</th></tr>
        <tr><td>{_val(["section6", "key_strengths"])}</td><td>{_val(["section6", "key_learning_needs"])}</td></tr>
      </table>
      <p class="label">Hiring manager notes</p>
      <p>{_val(["section6", "manager_notes"])}</p>
    </div>

    <div class="section">
      <h2>Section 7: Coachability &amp; Decision</h2>
      <table>
        <tr><th>Hiring manager to assess on</th><th>Yes / No</th></tr>
        <tr><td>Open to feedback from previous managers</td><td>{_yes_no(_val(["section7", "assess_open_feedback"]))}</td></tr>
        <tr><td>Seems coachable</td><td>{_yes_no(_val(["section7", "assess_coachable"]))}</td></tr>
        <tr><td>Good to hire</td><td>{_yes_no(_val(["section7", "assess_good_to_hire"]))}</td></tr>
      </table>
      <p class="label">Anything specific for L1 to assess</p>
      <p>{_val(["section7", "l1_focus_notes"])}</p>
    </div>
  </body>
</html>"""
