import Link from "next/link";
import { cookieHeader } from "@/lib/cookie-header";
import { notFound } from "next/navigation";
import { CandidateAssessment, CandidateFull } from "@/lib/types";
import { internalUrl } from "@/lib/internal";
import { parseDateUtc } from "@/lib/datetime";

type Me = {
  platform_role_id?: number | null;
  platform_role_code?: string | null;
};

async function fetchCandidateFull(id: string): Promise<CandidateFull | null> {
  const url = await internalUrl(`/api/rec/candidates/${encodeURIComponent(id)}/full`);
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return null;
  return (await res.json()) as CandidateFull;
}

async function fetchMe(): Promise<Me | null> {
  const url = await internalUrl("/api/auth/me");
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return null;
  try {
    return (await res.json()) as Me;
  } catch {
    return null;
  }
}

function labelValue(label: string, value: string) {
  return (
    <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function valueOrDash(value: unknown) {
  if (value === null || value === undefined) return "-";
  const s = String(value).trim();
  return s ? s : "-";
}

function formatDateTime(raw?: string | null) {
  return parseDateUtc(raw)?.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) ?? "-";
}

function formatDate(raw?: string | null) {
  if (!raw) return "-";
  const date = parseDateUtc(raw);
  return date ? date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : raw;
}

export default async function CandidateCafPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [full, me] = await Promise.all([fetchCandidateFull(id), fetchMe()]);
  if (!full) notFound();

  const candidate = full.candidate;
  const screening = full.screening;
  const assessment = (full.assessment || null) as CandidateAssessment | null;
  const canDelete = (me?.platform_role_id ?? null) === 2 || (me?.platform_role_code ?? "").trim() === "2";

  return (
    <main className="content-pad space-y-4">
      <div className="section-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-tight text-slate-500">CAF (read-only)</p>
            <h1 className="mt-1 truncate text-2xl font-semibold">{candidate.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {candidate.candidate_code} - {candidate.opening_title || "Not linked"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/candidates/${encodeURIComponent(id)}`}
              className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-white"
            >
              Back
            </Link>
            {candidate.cv_url ? (
              <a
                href={candidate.cv_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-600 to-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-card hover:from-cyan-700 hover:to-violet-700"
              >
                Open CV
              </a>
            ) : null}
            {candidate.drive_folder_url ? (
              <a
                href={candidate.drive_folder_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-white"
              >
                Drive folder
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {labelValue("Email", candidate.email || "-")}
          {labelValue("Phone", candidate.phone || "-")}
          {labelValue("CAF status", candidate.caf_submitted_at ? "Submitted" : candidate.caf_sent_at ? "Sent" : "Not sent")}
          {labelValue(
            "Submitted at",
            candidate.caf_submitted_at
              ? (parseDateUtc(candidate.caf_submitted_at)?.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) ?? "-")
              : "-"
          )}
        </div>

        {!screening ? (
          <div className="mt-4 rounded-2xl border border-white/60 bg-white/30 p-4">
            <p className="text-sm font-semibold">No CAF submission yet</p>
            <p className="mt-1 text-sm text-slate-600">Use "Copy CAF link" to send the candidate their CAF link.</p>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/60 bg-white/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Submitted responses</p>
              <span className="rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-slate-800">
                {screening.screening_result || "-"}
              </span>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {labelValue("Relocate", screening.willing_to_relocate == null ? "-" : screening.willing_to_relocate ? "Yes" : "No")}
            </div>

            <div className="mt-3 grid gap-3">
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Questions</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{candidate.questions_from_candidate || "-"}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Screening notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{screening.screening_notes || "-"}</p>
              </div>
            </div>
          </div>
        )}

        {!assessment ? (
          <div className="mt-4 rounded-2xl border border-white/60 bg-white/30 p-4">
            <p className="text-sm font-semibold">CAF assessment form</p>
            <p className="mt-1 text-sm text-slate-600">No CAF assessment data submitted yet.</p>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/60 bg-white/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">CAF assessment form</p>
              <span className="rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-slate-800">
                {assessment.assessment_submitted_at ? "Submitted" : "Pending"}
              </span>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {labelValue("Position", valueOrDash(assessment.position_applied_for))}
              {labelValue("Employer", valueOrDash(assessment.current_employer))}
              {labelValue("Relevant exp (yrs)", valueOrDash(assessment.relevant_experience_years))}
              {labelValue("Architecture exp (yrs)", valueOrDash(assessment.architecture_interior_experience_years))}
              {labelValue("Personal email", valueOrDash(assessment.personal_email))}
              {labelValue("Contact", valueOrDash(assessment.contact_number))}
              {labelValue("Employment status", valueOrDash(assessment.current_employment_status))}
              {labelValue(
                "Notice period",
                valueOrDash(assessment.notice_period_days ?? assessment.notice_period_or_joining_time)
              )}
              {labelValue("Current CTC", valueOrDash(assessment.current_ctc_annual))}
              {labelValue("Expected CTC", valueOrDash(assessment.expected_ctc_annual))}
              {labelValue("Current location", valueOrDash(assessment.current_location))}
              {labelValue("Interviewer", valueOrDash(assessment.interviewer_name))}
              {labelValue("Submitted", assessment.assessment_submitted_at ? formatDateTime(assessment.assessment_submitted_at) : "-")}
            </div>
            {assessment.reason_for_job_change ? (
              <div className="mt-3 rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Reason for job change</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{valueOrDash(assessment.reason_for_job_change)}</p>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {labelValue("Current job duration (months)", valueOrDash(assessment.current_job_duration_months))}
              {labelValue("Current organization", valueOrDash(assessment.current_job_org_name))}
              {labelValue("Previous job duration (months)", valueOrDash(assessment.previous_job_duration_months))}
              {labelValue("Previous organization", valueOrDash(assessment.previous_job_org_name))}
            </div>

            <div className="mt-3 grid gap-3">
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Current role and responsibilities</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {valueOrDash(assessment.current_job_role_responsibilities)}
                </p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Previous role and responsibilities</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {valueOrDash(assessment.previous_job_role_responsibilities)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {labelValue("10th specialization", valueOrDash(assessment.education_10th_specialization))}
              {labelValue("10th year", valueOrDash(assessment.education_10th_year))}
              {labelValue("10th institution", valueOrDash(assessment.education_10th_institution))}
              {labelValue("10th marks", valueOrDash(assessment.education_10th_marks))}
              {labelValue("12th specialization", valueOrDash(assessment.education_12th_specialization))}
              {labelValue("12th year", valueOrDash(assessment.education_12th_year))}
              {labelValue("12th institution", valueOrDash(assessment.education_12th_institution))}
              {labelValue("12th marks", valueOrDash(assessment.education_12th_marks))}
              {labelValue("Graduation specialization", valueOrDash(assessment.education_graduation_specialization))}
              {labelValue("Graduation year", valueOrDash(assessment.education_graduation_year))}
              {labelValue("Graduation institution", valueOrDash(assessment.education_graduation_institution))}
              {labelValue("Graduation marks", valueOrDash(assessment.education_graduation_marks))}
              {labelValue("Post-grad specialization", valueOrDash(assessment.education_post_graduation_specialization))}
              {labelValue("Post-grad year", valueOrDash(assessment.education_post_graduation_year))}
              {labelValue("Post-grad institution", valueOrDash(assessment.education_post_graduation_institution))}
              {labelValue("Post-grad marks", valueOrDash(assessment.education_post_graduation_marks))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {labelValue("Training 1", valueOrDash(assessment.training1_name))}
              {labelValue("Training 1 year", valueOrDash(assessment.training1_year))}
              {labelValue("Training 1 institute", valueOrDash(assessment.training1_institute))}
              {labelValue("Training 2", valueOrDash(assessment.training2_name))}
              {labelValue("Training 2 year", valueOrDash(assessment.training2_year))}
              {labelValue("Training 2 institute", valueOrDash(assessment.training2_institute))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {labelValue("AutoCAD", valueOrDash(assessment.skill_auto_cad))}
              {labelValue("SketchUp", valueOrDash(assessment.skill_sketch_up))}
              {labelValue("Revit", valueOrDash(assessment.skill_revit))}
              {labelValue("Photoshop", valueOrDash(assessment.skill_photoshop))}
              {labelValue("Illustrator", valueOrDash(assessment.skill_illustrator))}
              {labelValue("MS Office", valueOrDash(assessment.skill_ms_office))}
              {labelValue("3D Max", valueOrDash(assessment.skill_3d_max))}
              {labelValue("InDesign", valueOrDash(assessment.skill_indesign))}
              {labelValue("Presentation", valueOrDash(assessment.skill_presentation))}
              {labelValue("Rhino", valueOrDash(assessment.skill_rhino))}
              {labelValue("BOQs", valueOrDash(assessment.skill_boqs))}
              {labelValue("Analytical writing", valueOrDash(assessment.skill_analytical_writing))}
              {labelValue("Graphics", valueOrDash(assessment.skill_graphics))}
              {labelValue("Drafting", valueOrDash(assessment.skill_drafting))}
              {labelValue("Hand sketching", valueOrDash(assessment.skill_hand_sketching))}
              {labelValue("Estimation", valueOrDash(assessment.skill_estimation))}
              {labelValue("Specifications", valueOrDash(assessment.skill_specifications))}
              {labelValue("Enscape", valueOrDash(assessment.skill_enscape))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {labelValue("Execution: action orientation", valueOrDash(assessment.proficiency_execution_action_orientation))}
              {labelValue("Execution: self discipline", valueOrDash(assessment.proficiency_execution_self_discipline))}
              {labelValue("Execution: independent decision", valueOrDash(assessment.proficiency_execution_independent_decision))}
              {labelValue("Process: time management", valueOrDash(assessment.proficiency_process_time_management))}
              {labelValue("Process: following processes", valueOrDash(assessment.proficiency_process_following_processes))}
              {labelValue("Process: new processes", valueOrDash(assessment.proficiency_process_new_processes))}
              {labelValue("Strategic: long term thinking", valueOrDash(assessment.proficiency_strategic_long_term_thinking))}
              {labelValue("Strategic: creativity", valueOrDash(assessment.proficiency_strategic_ideation_creativity))}
              {labelValue("Strategic: risk taking", valueOrDash(assessment.proficiency_strategic_risk_taking))}
              {labelValue("People: collaboration", valueOrDash(assessment.proficiency_people_collaboration))}
              {labelValue("People: coaching", valueOrDash(assessment.proficiency_people_coaching))}
              {labelValue("People: feedback", valueOrDash(assessment.proficiency_people_feedback))}
              {labelValue("People: conflict", valueOrDash(assessment.proficiency_people_conflict_resolution))}
            </div>

            <div className="mt-3 grid gap-3">
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Execution reasoning</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{valueOrDash(assessment.proficiency_reason_execution)}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Process reasoning</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{valueOrDash(assessment.proficiency_reason_process)}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Strategic reasoning</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{valueOrDash(assessment.proficiency_reason_strategic)}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">People reasoning</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{valueOrDash(assessment.proficiency_reason_people)}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-3">
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Strengths</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{valueOrDash(assessment.self_strengths)}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Improvement areas</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{valueOrDash(assessment.self_improvement_areas)}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Learning needs</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{valueOrDash(assessment.self_learning_needs)}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-3">
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Q1. Why Studio Lotus?</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{valueOrDash(assessment.q1_why_studio_lotus)}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Q2. Project scale</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{valueOrDash(assessment.q2_project_scale)}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Q3. Role / site experience</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{valueOrDash(assessment.q3_role_site_experience)}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Q4. Inspired project</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{valueOrDash(assessment.q4_inspired_project)}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Q5. Two year plan</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{valueOrDash(assessment.q5_two_year_plan)}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {labelValue("Reference 1 name", valueOrDash(assessment.reference1_name))}
              {labelValue("Reference 1 contact", valueOrDash(assessment.reference1_contact))}
              {labelValue("Reference 1 relationship", valueOrDash(assessment.reference1_relationship))}
              {labelValue("Reference 2 name", valueOrDash(assessment.reference2_name))}
              {labelValue("Reference 2 contact", valueOrDash(assessment.reference2_contact))}
              {labelValue("Reference 2 relationship", valueOrDash(assessment.reference2_relationship))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {labelValue("Declaration name", valueOrDash(assessment.declaration_name))}
              {labelValue("Signature", valueOrDash(assessment.declaration_signature))}
              {labelValue("Declaration date", formatDate(assessment.declaration_date))}
              {labelValue("Declaration accepted", assessment.declaration_accepted ? "Yes" : "No")}
            </div>
          </div>
        )}

        {!canDelete ? (
          <p className="mt-3 text-xs text-slate-500">CAF is read-only for non-superadmin users.</p>
        ) : (
          <p className="mt-3 text-xs text-slate-500">Superadmin can update CAF via admin tools (UI not added yet).</p>
        )}
      </div>
    </main>
  );
}


