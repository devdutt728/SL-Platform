import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  ClipboardCheck,
  FileQuestion,
  GraduationCap,
  HandCoins,
  Mail,
  MapPin,
  NotebookText,
  Phone,
  UserRound,
} from "lucide-react";
import { getAuthMe } from "@/lib/auth-me";
import { cookieHeader } from "@/lib/cookie-header";
import { parseDateUtc } from "@/lib/datetime";
import { internalUrl } from "@/lib/internal";
import { BASIC_DETAILS_FORM_LABEL, CANDIDATE_ASSESSMENT_FORM_LABEL, SCREENING_DETAILS_LABEL } from "@/lib/recruitment-terms";
import { fetchJsonOr } from "@/lib/server-json";
import { CandidateAssessment, CandidateFull } from "@/lib/types";

type Me = {
  platform_role_id?: number | string | null;
  platform_role_code?: string | null;
};

type MetricItem = {
  label: string;
  value: string | number;
};

async function fetchCandidateFull(id: string): Promise<CandidateFull | null> {
  const url = await internalUrl(`/api/rec/candidates/${encodeURIComponent(id)}/full`);
  const cookieValue = await cookieHeader();
  return fetchJsonOr<CandidateFull | null>(url, {
    fallback: null,
    cookie: cookieValue,
    label: "candidate_caf.full",
  });
}

function valueOrDash(value: unknown) {
  if (value === null || value === undefined) return "-";
  const s = String(value).trim();
  return s ? s : "-";
}

function valueOrEmpty(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isMeaningfulValue(value: unknown) {
  const text = valueOrEmpty(value);
  if (!text) return false;
  const normalized = text.toLowerCase();
  return normalized !== "-" && normalized !== "null" && normalized !== "undefined" && normalized !== "n/a";
}

function formatDateTime(raw?: string | null) {
  return parseDateUtc(raw)?.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) ?? "-";
}

function formatDate(raw?: string | null) {
  if (!raw) return "-";
  const date = parseDateUtc(raw);
  return date ? date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : raw;
}

function yesNo(value?: boolean | null) {
  if (value === null || value === undefined) return "-";
  return value ? "Yes" : "No";
}

function toneChip(kind: "neutral" | "green" | "amber" | "blue") {
  if (kind === "green") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (kind === "amber") return "border-amber-200 bg-amber-50 text-amber-800";
  if (kind === "blue") return "border-cyan-200 bg-cyan-50 text-cyan-800";
  return "border-slate-200 bg-white/80 text-slate-700";
}

function metricItems(items: MetricItem[]) {
  return items.filter((item) => isMeaningfulValue(item.value));
}

function narrativeItems(items: MetricItem[]) {
  return items.filter((item) => isMeaningfulValue(item.value));
}

function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${className}`.trim()}
    >
      {children}
    </span>
  );
}

function MetricCard({ label, value }: MetricItem) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/55 p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">{value}</p>
    </div>
  );
}

function NarrativeCard({ label, value }: MetricItem) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/55 p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function EmptyBlock({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300/80 bg-white/35 p-6 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function SectionShell({
  id,
  icon,
  title,
  subtitle,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="rounded-[30px] border border-white/80 bg-white/35 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function AnchorLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="rounded-full border border-white/80 bg-white/75 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-200 hover:bg-white"
    >
      {label}
    </a>
  );
}

export default async function CandidateCafPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [full, me] = await Promise.all([fetchCandidateFull(id), getAuthMe() as Promise<Me | null>]);
  if (!full) notFound();

  const candidate = full.candidate;
  const screening = full.screening;
  const assessment = (full.assessment || null) as CandidateAssessment | null;
  const assessmentCompensationVisible = full.assessment_compensation_visible !== false;
  const roleIdRaw = me?.platform_role_id ?? null;
  const roleId = typeof roleIdRaw === "number" ? roleIdRaw : Number(roleIdRaw);
  const canDelete = roleId === 2 || (me?.platform_role_code ?? "").trim() === "2";

  const basicDetailsSubmittedAt = candidate.basic_details_form_submitted_at || candidate.caf_submitted_at;
  const basicDetailsSentAt = candidate.basic_details_form_sent_at || candidate.caf_sent_at;
  const candidateAssessmentSubmittedAt =
    assessment?.candidate_assessment_form_submitted_at || assessment?.assessment_submitted_at;

  const cafStatus = basicDetailsSubmittedAt
    ? "Submitted"
    : basicDetailsSentAt
      ? "Shared"
      : "Not shared";
  const screeningStatus = screening?.screening_result || (screening ? "Submitted" : "No screening response");
  const assessmentStatus = candidateAssessmentSubmittedAt ? "Submitted" : assessment ? "Draft / Pending" : "Not submitted";

  const heroMetrics = [
    { label: "Candidate code", value: valueOrDash(candidate.candidate_code) },
    { label: "Opening", value: valueOrDash(candidate.opening_title) },
    { label: `${BASIC_DETAILS_FORM_LABEL} status`, value: cafStatus },
    { label: `${BASIC_DETAILS_FORM_LABEL} submitted`, value: basicDetailsSubmittedAt ? formatDateTime(basicDetailsSubmittedAt) : "-" },
    { label: `${CANDIDATE_ASSESSMENT_FORM_LABEL} status`, value: assessmentStatus },
    { label: "Source", value: valueOrDash(candidate.source_channel) },
  ];

  const screeningMetrics = metricItems([
    { label: "Screening result", value: screeningStatus },
    { label: "Relocation", value: screening ? yesNo(screening.willing_to_relocate) : "" },
    { label: "Submitted at", value: basicDetailsSubmittedAt ? formatDateTime(basicDetailsSubmittedAt) : "" },
    { label: "Updated at", value: screening?.updated_at ? formatDateTime(screening.updated_at) : "" },
  ]);

  const availabilityMetrics = metricItems([
    { label: "Position", value: assessment?.position_applied_for ?? "" },
    { label: "Employer", value: assessment?.current_employer ?? "" },
    { label: "Relevant experience (yrs)", value: assessment?.relevant_experience_years ?? "" },
    { label: "Architecture / interior exp (yrs)", value: assessment?.architecture_interior_experience_years ?? "" },
    { label: "Personal email", value: assessment?.personal_email ?? "" },
    { label: "Contact", value: assessment?.contact_number ?? "" },
    { label: "Employment status", value: assessment?.current_employment_status ?? "" },
    { label: "Notice period", value: assessment?.notice_period_days ?? assessment?.notice_period_or_joining_time ?? "" },
    { label: "Earliest joining date", value: assessment?.earliest_joining_date ? formatDate(assessment.earliest_joining_date) : "" },
    { label: "Current location", value: assessment?.current_location ?? "" },
    { label: "Interviewer", value: assessment?.interviewer_name ?? "" },
    { label: `${CANDIDATE_ASSESSMENT_FORM_LABEL} submitted`, value: candidateAssessmentSubmittedAt ? formatDateTime(candidateAssessmentSubmittedAt) : "" },
  ]);

  const compensationMetrics = metricItems([
    { label: "Current annual CTC", value: assessment?.current_ctc_annual ?? "" },
    { label: "Current monthly take-home", value: assessment?.current_monthly_take_home ?? "" },
    { label: "Expected annual CTC", value: assessment?.expected_ctc_annual ?? "" },
  ]);

  const currentRoleMetrics = metricItems([
    { label: "Duration (months)", value: assessment?.current_job_duration_months ?? "" },
    { label: "Organization", value: assessment?.current_job_org_name ?? "" },
  ]);

  const previousRoleMetrics = metricItems([
    { label: "Duration (months)", value: assessment?.previous_job_duration_months ?? "" },
    { label: "Organization", value: assessment?.previous_job_org_name ?? "" },
  ]);

  const educationSchoolMetrics = metricItems([
    { label: "10th specialization", value: assessment?.education_10th_specialization ?? "" },
    { label: "10th year", value: assessment?.education_10th_year ?? "" },
    { label: "10th institution", value: assessment?.education_10th_institution ?? "" },
    { label: "10th marks", value: assessment?.education_10th_marks ?? "" },
    { label: "12th specialization", value: assessment?.education_12th_specialization ?? "" },
    { label: "12th year", value: assessment?.education_12th_year ?? "" },
    { label: "12th institution", value: assessment?.education_12th_institution ?? "" },
    { label: "12th marks", value: assessment?.education_12th_marks ?? "" },
  ]);

  const educationHigherMetrics = metricItems([
    { label: "Graduation specialization", value: assessment?.education_graduation_specialization ?? "" },
    { label: "Graduation year", value: assessment?.education_graduation_year ?? "" },
    { label: "Graduation institution", value: assessment?.education_graduation_institution ?? "" },
    { label: "Graduation marks", value: assessment?.education_graduation_marks ?? "" },
    { label: "Post-grad specialization", value: assessment?.education_post_graduation_specialization ?? "" },
    { label: "Post-grad year", value: assessment?.education_post_graduation_year ?? "" },
    { label: "Post-grad institution", value: assessment?.education_post_graduation_institution ?? "" },
    { label: "Post-grad marks", value: assessment?.education_post_graduation_marks ?? "" },
  ]);

  const trainingMetrics = metricItems([
    { label: "Training 1", value: assessment?.training1_name ?? "" },
    { label: "Training 1 year", value: assessment?.training1_year ?? "" },
    { label: "Training 1 institute", value: assessment?.training1_institute ?? "" },
    { label: "Training 2", value: assessment?.training2_name ?? "" },
    { label: "Training 2 year", value: assessment?.training2_year ?? "" },
    { label: "Training 2 institute", value: assessment?.training2_institute ?? "" },
  ]);

  const technicalSkills = metricItems([
    { label: "AutoCAD", value: assessment?.skill_auto_cad ?? "" },
    { label: "SketchUp", value: assessment?.skill_sketch_up ?? "" },
    { label: "Revit", value: assessment?.skill_revit ?? "" },
    { label: "Photoshop", value: assessment?.skill_photoshop ?? "" },
    { label: "Illustrator", value: assessment?.skill_illustrator ?? "" },
    { label: "MS Office", value: assessment?.skill_ms_office ?? "" },
    { label: "3D Max", value: assessment?.skill_3d_max ?? "" },
    { label: "InDesign", value: assessment?.skill_indesign ?? "" },
    { label: "Presentation", value: assessment?.skill_presentation ?? "" },
    { label: "Rhino", value: assessment?.skill_rhino ?? "" },
    { label: "BOQs", value: assessment?.skill_boqs ?? "" },
    { label: "Analytical writing", value: assessment?.skill_analytical_writing ?? "" },
    { label: "Graphics", value: assessment?.skill_graphics ?? "" },
    { label: "Drafting", value: assessment?.skill_drafting ?? "" },
    { label: "Hand sketching", value: assessment?.skill_hand_sketching ?? "" },
    { label: "Estimation", value: assessment?.skill_estimation ?? "" },
    { label: "Specifications", value: assessment?.skill_specifications ?? "" },
    { label: "Enscape", value: assessment?.skill_enscape ?? "" },
  ]);

  const proficiencySkills = metricItems([
    { label: "Execution: action orientation", value: assessment?.proficiency_execution_action_orientation ?? "" },
    { label: "Execution: self discipline", value: assessment?.proficiency_execution_self_discipline ?? "" },
    { label: "Execution: independent decision", value: assessment?.proficiency_execution_independent_decision ?? "" },
    { label: "Process: time management", value: assessment?.proficiency_process_time_management ?? "" },
    { label: "Process: following processes", value: assessment?.proficiency_process_following_processes ?? "" },
    { label: "Process: new processes", value: assessment?.proficiency_process_new_processes ?? "" },
    { label: "Strategic: long term thinking", value: assessment?.proficiency_strategic_long_term_thinking ?? "" },
    { label: "Strategic: creativity", value: assessment?.proficiency_strategic_ideation_creativity ?? "" },
    { label: "Strategic: risk taking", value: assessment?.proficiency_strategic_risk_taking ?? "" },
    { label: "People: collaboration", value: assessment?.proficiency_people_collaboration ?? "" },
    { label: "People: coaching", value: assessment?.proficiency_people_coaching ?? "" },
    { label: "People: feedback", value: assessment?.proficiency_people_feedback ?? "" },
    { label: "People: conflict resolution", value: assessment?.proficiency_people_conflict_resolution ?? "" },
  ]);

  const proficiencyNarratives = narrativeItems([
    { label: "Execution orientation", value: assessment?.proficiency_reason_execution ?? "" },
    { label: "Process orientation", value: assessment?.proficiency_reason_process ?? "" },
    { label: "Strategic orientation", value: assessment?.proficiency_reason_strategic ?? "" },
    { label: "People orientation", value: assessment?.proficiency_reason_people ?? "" },
  ]);

  const selfNarratives = narrativeItems([
    { label: "Strengths", value: assessment?.self_strengths ?? "" },
    { label: "Improvement areas", value: assessment?.self_improvement_areas ?? "" },
    { label: "Learning needs", value: assessment?.self_learning_needs ?? "" },
  ]);

  const fitNarratives = narrativeItems([
    { label: "Why Studio Lotus?", value: assessment?.q1_why_studio_lotus ?? "" },
    { label: "Project scale", value: assessment?.q2_project_scale ?? "" },
    { label: "Role / site experience", value: assessment?.q3_role_site_experience ?? "" },
    { label: "Inspired project", value: assessment?.q4_inspired_project ?? "" },
    { label: "Two year plan", value: assessment?.q5_two_year_plan ?? "" },
  ]);

  const referenceOneMetrics = metricItems([
    { label: "Name", value: assessment?.reference1_name ?? "" },
    { label: "Contact", value: assessment?.reference1_contact ?? "" },
    { label: "Relationship", value: assessment?.reference1_relationship ?? "" },
  ]);

  const referenceTwoMetrics = metricItems([
    { label: "Name", value: assessment?.reference2_name ?? "" },
    { label: "Contact", value: assessment?.reference2_contact ?? "" },
    { label: "Relationship", value: assessment?.reference2_relationship ?? "" },
  ]);

  const declarationMetrics = metricItems([
    { label: "Declaration name", value: assessment?.declaration_name ?? "" },
    { label: "Signature", value: assessment?.declaration_signature ?? "" },
    { label: "Declaration date", value: assessment?.declaration_date ? formatDate(assessment.declaration_date) : "" },
    { label: "Declaration accepted", value: assessment ? yesNo(assessment.declaration_accepted) : "" },
  ]);

  return (
    <main className="content-pad space-y-5">
      <section className="rounded-[32px] border border-white/80 bg-gradient-to-br from-white via-cyan-50/75 to-slate-100/80 p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{SCREENING_DETAILS_LABEL}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{candidate.name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              {valueOrDash(candidate.candidate_code)} · {valueOrDash(candidate.opening_title)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Chip className={toneChip("blue")}>{cafStatus}</Chip>
              <Chip
                className={toneChip(
                  assessment?.assessment_submitted_at ? "green" : assessment ? "amber" : "neutral"
                )}
              >
                {assessmentStatus}
              </Chip>
              <Chip className={toneChip(screening ? "green" : candidate.caf_submitted_at ? "amber" : "neutral")}>
                {screening ? valueOrDash(screening.screening_result || "Screening submitted") : "Screening pending"}
              </Chip>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/candidates/${encodeURIComponent(id)}`}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Link>
            {candidate.cv_url ? (
              <a
                href={`/candidates/${encodeURIComponent(id)}/documents/cv`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-600 to-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-card hover:from-cyan-700 hover:to-violet-700"
              >
                Preview CV
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {heroMetrics.map((item) => (
              <MetricCard key={item.label} {...item} />
            ))}
          </div>

          <div className="rounded-[28px] border border-white/80 bg-white/70 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Candidate Snapshot</p>
            <div className="mt-3 space-y-3 text-sm text-slate-700">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 text-slate-500" />
                <span className="min-w-0 break-all">{valueOrDash(candidate.email)}</span>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 text-slate-500" />
                <span>{valueOrDash(candidate.phone)}</span>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 text-slate-500" />
                <span>{valueOrDash(candidate.city || assessment?.current_location)}</span>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Review guidance</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                This page is intentionally read-only. Empty blocks are hidden where possible so the submitted signal stands
                out, especially for legacy candidates whose basic details form was backfilled after initial creation.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <AnchorLink href="#screening" label="Screening" />
          <AnchorLink href="#availability" label="Availability" />
          <AnchorLink href="#compensation" label="Compensation" />
          <AnchorLink href="#experience" label="Experience" />
          <AnchorLink href="#education" label="Education" />
          <AnchorLink href="#skills" label="Skills" />
          <AnchorLink href="#narrative" label="Narrative" />
          <AnchorLink href="#references" label="References" />
        </div>
      </section>

      <SectionShell
        id="screening"
        icon={<ClipboardCheck className="h-4 w-4" />}
        title="Screening Review"
        subtitle="Basic details submission and screening context grouped together for faster review."
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
              <p className="text-sm font-semibold text-slate-900">Submission Snapshot</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(screeningMetrics.length ? screeningMetrics : heroMetrics.slice(2, 6)).map((item) => (
                  <MetricCard key={item.label} {...item} />
                ))}
              </div>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
              <p className="text-sm font-semibold text-slate-900">Candidate questions</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {valueOrDash(candidate.questions_from_candidate)}
              </p>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
            <p className="text-sm font-semibold text-slate-900">Screening notes</p>
            {screening?.screening_notes ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{screening.screening_notes}</p>
            ) : (
              <EmptyBlock
                title="No screening notes yet"
                description="The candidate may have basic details submitted already, but no explicit reviewer notes were stored for this record."
              />
            )}
          </div>
        </div>
      </SectionShell>

      {!assessment ? (
        <EmptyBlock
          title={`No ${CANDIDATE_ASSESSMENT_FORM_LABEL} submitted`}
          description={`This candidate currently has ${BASIC_DETAILS_FORM_LABEL.toLowerCase()} status only. The detailed ${CANDIDATE_ASSESSMENT_FORM_LABEL.toLowerCase()} has not been submitted yet.`}
        />
      ) : (
        <>
          <SectionShell
            id="availability"
            icon={<UserRound className="h-4 w-4" />}
            title="Availability & Contact"
            subtitle="Scheduling, notice period, role context, and contact details grouped into one review surface."
          >
            {availabilityMetrics.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {availabilityMetrics.map((item) => (
                  <MetricCard key={item.label} {...item} />
                ))}
              </div>
            ) : (
              <EmptyBlock
                title="Availability details not captured"
                description="This assessment does not contain enough structured availability data yet."
              />
            )}
          </SectionShell>

          <SectionShell
            id="compensation"
            icon={<HandCoins className="h-4 w-4" />}
            title="Compensation"
            subtitle="Compensation inputs are separated so finance-sensitive fields remain easy to scan without crowding the rest of the form."
          >
            {assessmentCompensationVisible ? (
              compensationMetrics.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {compensationMetrics.map((item) => (
                    <MetricCard key={item.label} {...item} />
                  ))}
                </div>
              ) : (
                <EmptyBlock
                  title="No compensation details"
                  description="Current or expected compensation details were not provided in this assessment."
                />
              )
            ) : (
              <EmptyBlock
                title="Compensation hidden"
                description="Current and expected compensation values are intentionally hidden for this account."
              />
            )}
          </SectionShell>

          <SectionShell
            id="experience"
            icon={<BriefcaseBusiness className="h-4 w-4" />}
            title="Career Experience"
            subtitle="Current and previous role details are split into cleaner cards so reviewers can compare them quickly."
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
                <p className="text-sm font-semibold text-slate-900">Current role</p>
                {currentRoleMetrics.length ? (
                  <>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {currentRoleMetrics.map((item) => (
                        <MetricCard key={item.label} {...item} />
                      ))}
                    </div>
                    {isMeaningfulValue(assessment.current_job_role_responsibilities) ? (
                      <div className="mt-3">
                        <NarrativeCard
                          label="Role and responsibilities"
                          value={valueOrDash(assessment.current_job_role_responsibilities)}
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <EmptyBlock
                    title="No current-role details"
                    description="Current employment details were not filled in this assessment."
                  />
                )}
              </div>

              <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
                <p className="text-sm font-semibold text-slate-900">Previous role</p>
                {previousRoleMetrics.length || isMeaningfulValue(assessment.previous_job_role_responsibilities) ? (
                  <>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {previousRoleMetrics.map((item) => (
                        <MetricCard key={item.label} {...item} />
                      ))}
                    </div>
                    {isMeaningfulValue(assessment.previous_job_role_responsibilities) ? (
                      <div className="mt-3">
                        <NarrativeCard
                          label="Role and responsibilities"
                          value={valueOrDash(assessment.previous_job_role_responsibilities)}
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <EmptyBlock
                    title="No previous-role details"
                    description="Previous employment details were not provided in this submission."
                  />
                )}
              </div>
            </div>

            {isMeaningfulValue(assessment.reason_for_job_change) ? (
              <div className="mt-4">
                <NarrativeCard label="Reason for job change" value={valueOrDash(assessment.reason_for_job_change)} />
              </div>
            ) : null}
          </SectionShell>

          <SectionShell
            id="education"
            icon={<GraduationCap className="h-4 w-4" />}
            title="Education & Training"
            subtitle="Academic background is separated into school, higher education, and certifications so blank records do not dominate the page."
          >
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
                <p className="text-sm font-semibold text-slate-900">School</p>
                {educationSchoolMetrics.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {educationSchoolMetrics.map((item) => (
                      <MetricCard key={item.label} {...item} />
                    ))}
                  </div>
                ) : (
                  <EmptyBlock
                    title="No school details"
                    description="10th and 12th records were not captured in this assessment."
                  />
                )}
              </div>

              <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
                <p className="text-sm font-semibold text-slate-900">Higher education</p>
                {educationHigherMetrics.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {educationHigherMetrics.map((item) => (
                      <MetricCard key={item.label} {...item} />
                    ))}
                  </div>
                ) : (
                  <EmptyBlock
                    title="No higher-education details"
                    description="Graduation and post-graduation details were not provided."
                  />
                )}
              </div>

              <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
                <p className="text-sm font-semibold text-slate-900">Training / certification</p>
                {trainingMetrics.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {trainingMetrics.map((item) => (
                      <MetricCard key={item.label} {...item} />
                    ))}
                  </div>
                ) : (
                  <EmptyBlock
                    title="No training records"
                    description={`No training or certification entries were submitted in the ${CANDIDATE_ASSESSMENT_FORM_LABEL.toLowerCase()}.`}
                  />
                )}
              </div>
            </div>
          </SectionShell>

          <SectionShell
            id="skills"
            icon={<NotebookText className="h-4 w-4" />}
            title="Skills & Proficiency"
            subtitle="Technical tools and work-style proficiencies are separated so the reviewer can scan strengths without reading through blanks."
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
                <p className="text-sm font-semibold text-slate-900">Technical skills</p>
                {technicalSkills.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {technicalSkills.map((item) => (
                      <MetricCard key={item.label} {...item} />
                    ))}
                  </div>
                ) : (
                  <EmptyBlock
                    title="No technical skill ratings"
                    description="Tool proficiency ratings were not filled in for this assessment."
                  />
                )}
              </div>

              <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
                <p className="text-sm font-semibold text-slate-900">Work-style proficiency</p>
                {proficiencySkills.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {proficiencySkills.map((item) => (
                      <MetricCard key={item.label} {...item} />
                    ))}
                  </div>
                ) : (
                  <EmptyBlock
                    title="No proficiency ratings"
                    description="Execution, process, strategy, and people ratings were not captured."
                  />
                )}
              </div>
            </div>
          </SectionShell>

          <SectionShell
            id="narrative"
            icon={<FileQuestion className="h-4 w-4" />}
            title="Narrative Responses"
            subtitle="Long-form answers are grouped by theme so reviewers can understand motivation, self-awareness, and fit faster."
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-4">
                <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
                  <p className="text-sm font-semibold text-slate-900">Proficiency reasoning</p>
                  {proficiencyNarratives.length ? (
                    <div className="mt-3 grid gap-3">
                      {proficiencyNarratives.map((item) => (
                        <NarrativeCard key={item.label} {...item} />
                      ))}
                    </div>
                  ) : (
                    <EmptyBlock
                      title="No reasoning captured"
                      description="The candidate did not provide written explanations for their self-rated proficiencies."
                    />
                  )}
                </div>

                <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
                  <p className="text-sm font-semibold text-slate-900">Self reflection</p>
                  {selfNarratives.length ? (
                    <div className="mt-3 grid gap-3">
                      {selfNarratives.map((item) => (
                        <NarrativeCard key={item.label} {...item} />
                      ))}
                    </div>
                  ) : (
                    <EmptyBlock
                      title="No self-reflection answers"
                      description="Strengths, improvement areas, and learning needs were not submitted."
                    />
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
                <p className="text-sm font-semibold text-slate-900">Studio Lotus fit & intent</p>
                {fitNarratives.length ? (
                  <div className="mt-3 grid gap-3">
                    {fitNarratives.map((item) => (
                      <NarrativeCard key={item.label} {...item} />
                    ))}
                  </div>
                ) : (
                  <EmptyBlock
                    title="No fit questions answered"
                    description="The candidate did not submit the long-form Studio Lotus intent questions."
                  />
                )}
              </div>
            </div>
          </SectionShell>

          <SectionShell
            id="references"
            icon={<ClipboardCheck className="h-4 w-4" />}
            title="References & Declaration"
            subtitle="Reference checks and declaration data are placed at the end of the page as a compact final review block."
          >
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
                <p className="text-sm font-semibold text-slate-900">Reference 1</p>
                {referenceOneMetrics.length ? (
                  <div className="mt-3 grid gap-2">
                    {referenceOneMetrics.map((item) => (
                      <MetricCard key={item.label} {...item} />
                    ))}
                  </div>
                ) : (
                  <EmptyBlock
                    title="No first reference"
                    description="Reference 1 details were not added."
                  />
                )}
              </div>

              <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
                <p className="text-sm font-semibold text-slate-900">Reference 2</p>
                {referenceTwoMetrics.length ? (
                  <div className="mt-3 grid gap-2">
                    {referenceTwoMetrics.map((item) => (
                      <MetricCard key={item.label} {...item} />
                    ))}
                  </div>
                ) : (
                  <EmptyBlock
                    title="No second reference"
                    description="Reference 2 details were not added."
                  />
                )}
              </div>

              <div className="rounded-[28px] border border-white/80 bg-white/45 p-4">
                <p className="text-sm font-semibold text-slate-900">Declaration</p>
                {declarationMetrics.length ? (
                  <div className="mt-3 grid gap-2">
                    {declarationMetrics.map((item) => (
                      <MetricCard key={item.label} {...item} />
                    ))}
                  </div>
                ) : (
                  <EmptyBlock
                    title="No declaration details"
                    description="No declaration or signature details are stored for this submission."
                  />
                )}
              </div>
            </div>
          </SectionShell>
        </>
      )}

      <div className="rounded-2xl border border-white/80 bg-white/45 px-4 py-3 text-xs leading-6 text-slate-500">
        {canDelete
          ? `Superadmin can still adjust ${BASIC_DETAILS_FORM_LABEL.toLowerCase()} and ${SCREENING_DETAILS_LABEL.toLowerCase()} data through admin tools, but this page remains read-only by design.`
          : `${BASIC_DETAILS_FORM_LABEL} remains read-only for non-superadmin users.`}
      </div>
    </main>
  );
}
