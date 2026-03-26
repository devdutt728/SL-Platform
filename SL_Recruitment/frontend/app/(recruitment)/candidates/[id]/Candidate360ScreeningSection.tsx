"use client";

import {
  BriefcaseBusiness,
  ClipboardCheck,
  FileQuestion,
  GraduationCap,
  HandCoins,
  LucideIcon,
  Mail,
  MapPin,
  NotebookText,
  Phone,
  UserRound,
} from "lucide-react";
import { CandidateAssessment, CandidateDetail, Screening } from "@/lib/types";
import { Chip, Metric } from "./Candidate360Primitives";

type Props = {
  sectionRef: React.RefObject<HTMLDivElement>;
  collapsed: boolean;
  onToggle: () => void;
  candidate: CandidateDetail;
  screening: Screening | null | undefined;
  assessment: CandidateAssessment | null | undefined;
  assessmentCompensationVisible: boolean;
  isInternWorkflow: boolean;
  candidateQuestionsFromCandidate?: string | null;
  screeningTone: (result?: string | null) => string;
  screeningLabel: (result?: string | null) => string | null;
  chipTone: (kind: "neutral" | "green" | "amber" | "red" | "blue") => string;
  valueOrDash: (value?: string | number | null) => string;
  yesNo: (value?: boolean | null) => string;
  formatDate: (raw?: string | null) => string;
  formatDateTime: (raw?: string | null) => string;
};

function SectionBlock({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/35 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {subtitle ? <p className="mt-1 text-xs text-slate-600">{subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function NarrativeField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/45 p-3">
      <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function EmptyBlock({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300/80 bg-white/20 p-6 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </div>
  );
}

export function Candidate360ScreeningSection({
  sectionRef,
  collapsed,
  onToggle,
  candidate,
  screening,
  assessment,
  assessmentCompensationVisible,
  isInternWorkflow,
  candidateQuestionsFromCandidate,
  screeningTone,
  screeningLabel,
  chipTone,
  valueOrDash,
  yesNo,
  formatDate,
  formatDateTime,
}: Props) {
  const candidateSnapshotMetrics = [
    { label: "Candidate code", value: valueOrDash(candidate.candidate_code) },
    { label: "Opening", value: valueOrDash(candidate.opening_title) },
    { label: "Experience", value: valueOrDash(candidate.years_of_experience) },
    { label: "Qualification", value: valueOrDash(candidate.educational_qualification) },
    { label: "Source", value: valueOrDash(candidate.source_channel) },
    { label: "Applied", value: formatDateTime(candidate.created_at) || "-" },
  ];

  const screeningSummaryMetrics = screening
    ? [
        {
          label: isInternWorkflow ? "Screening status" : "Screening result",
          value: screeningLabel(screening.screening_result) || valueOrDash(screening.screening_result),
        },
        { label: "Relocation", value: yesNo(screening.willing_to_relocate) },
        { label: "Salary band fit", value: valueOrDash(screening.salary_band_fit) },
        { label: "Updated", value: formatDateTime(screening.updated_at) || "-" },
      ]
    : [];

  const availabilityMetrics = assessment
    ? [
        { label: "Position", value: valueOrDash(assessment.position_applied_for) },
        { label: "Employer", value: valueOrDash(assessment.current_employer) },
        { label: "Relevant exp", value: valueOrDash(assessment.relevant_experience_years) },
        {
          label: "Architecture exp",
          value: valueOrDash(assessment.architecture_interior_experience_years),
        },
        { label: "Personal email", value: valueOrDash(assessment.personal_email) },
        { label: "Contact", value: valueOrDash(assessment.contact_number) },
        { label: "Employment status", value: valueOrDash(assessment.current_employment_status) },
        {
          label: "Notice period",
          value: valueOrDash(assessment.notice_period_days ?? assessment.notice_period_or_joining_time),
        },
        { label: "Earliest joining", value: formatDate(assessment.earliest_joining_date) || "-" },
        { label: "Current location", value: valueOrDash(assessment.current_location) },
        { label: "Interviewer", value: valueOrDash(assessment.interviewer_name) },
        {
          label: "Assessment submitted",
          value: assessment.assessment_submitted_at ? formatDateTime(assessment.assessment_submitted_at) : "-",
        },
      ]
    : [];

  const compensationMetrics = assessment
    ? [
        { label: "Current annual CTC", value: valueOrDash(assessment.current_ctc_annual) },
        { label: "Current monthly take-home", value: valueOrDash(assessment.current_monthly_take_home) },
        { label: "Expected annual CTC", value: valueOrDash(assessment.expected_ctc_annual) },
      ]
    : [];

  const technicalSkills = assessment
    ? [
        { label: "AutoCAD", value: valueOrDash(assessment.skill_auto_cad) },
        { label: "SketchUp", value: valueOrDash(assessment.skill_sketch_up) },
        { label: "Revit", value: valueOrDash(assessment.skill_revit) },
        { label: "Photoshop", value: valueOrDash(assessment.skill_photoshop) },
        { label: "Illustrator", value: valueOrDash(assessment.skill_illustrator) },
        { label: "MS Office", value: valueOrDash(assessment.skill_ms_office) },
        { label: "3D Max", value: valueOrDash(assessment.skill_3d_max) },
        { label: "InDesign", value: valueOrDash(assessment.skill_indesign) },
        { label: "Presentation", value: valueOrDash(assessment.skill_presentation) },
        { label: "Rhino", value: valueOrDash(assessment.skill_rhino) },
        { label: "BOQs", value: valueOrDash(assessment.skill_boqs) },
        { label: "Analytical writing", value: valueOrDash(assessment.skill_analytical_writing) },
        { label: "Graphics", value: valueOrDash(assessment.skill_graphics) },
        { label: "Drafting", value: valueOrDash(assessment.skill_drafting) },
        { label: "Hand sketching", value: valueOrDash(assessment.skill_hand_sketching) },
        { label: "Estimation", value: valueOrDash(assessment.skill_estimation) },
        { label: "Specifications", value: valueOrDash(assessment.skill_specifications) },
        { label: "Enscape", value: valueOrDash(assessment.skill_enscape) },
      ]
    : [];

  const workStyleSkills = assessment
    ? [
        {
          label: "Execution: action orientation",
          value: valueOrDash(assessment.proficiency_execution_action_orientation),
        },
        {
          label: "Execution: self discipline",
          value: valueOrDash(assessment.proficiency_execution_self_discipline),
        },
        {
          label: "Execution: independent decision",
          value: valueOrDash(assessment.proficiency_execution_independent_decision),
        },
        { label: "Process: time management", value: valueOrDash(assessment.proficiency_process_time_management) },
        {
          label: "Process: following processes",
          value: valueOrDash(assessment.proficiency_process_following_processes),
        },
        { label: "Process: new processes", value: valueOrDash(assessment.proficiency_process_new_processes) },
        {
          label: "Strategic: long term thinking",
          value: valueOrDash(assessment.proficiency_strategic_long_term_thinking),
        },
        {
          label: "Strategic: creativity",
          value: valueOrDash(assessment.proficiency_strategic_ideation_creativity),
        },
        { label: "Strategic: risk taking", value: valueOrDash(assessment.proficiency_strategic_risk_taking) },
        { label: "People: collaboration", value: valueOrDash(assessment.proficiency_people_collaboration) },
        { label: "People: coaching", value: valueOrDash(assessment.proficiency_people_coaching) },
        { label: "People: feedback", value: valueOrDash(assessment.proficiency_people_feedback) },
        { label: "People: conflict", value: valueOrDash(assessment.proficiency_people_conflict_resolution) },
      ]
    : [];

  return (
    <div ref={sectionRef} className="section-card">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-tight text-slate-500">Screening</p>
        <button
          type="button"
          className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
          onClick={onToggle}
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {collapsed ? null : (
        <div className="mt-4 space-y-4">
          <div className="rounded-[28px] border border-white/80 bg-gradient-to-br from-white/75 via-cyan-50/70 to-slate-100/80 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Candidate Snapshot</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">{candidate.name}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Chip className={chipTone("blue")}>{valueOrDash(candidate.candidate_code)}</Chip>
                  {candidate.status ? <Chip className={chipTone("neutral")}>{valueOrDash(candidate.status)}</Chip> : null}
                  {screening ? (
                    <Chip className={screeningTone(screening.screening_result)}>
                      {screeningLabel(screening.screening_result) || screening.screening_result || "Screening"}
                    </Chip>
                  ) : (
                    <Chip
                      className={chipTone(
                        isInternWorkflow
                          ? "amber"
                          : candidate.caf_submitted_at
                            ? "green"
                            : candidate.caf_sent_at
                              ? "amber"
                              : "neutral"
                      )}
                    >
                      {isInternWorkflow
                        ? "Screening pending"
                        : candidate.caf_submitted_at
                          ? "CAF submitted"
                          : candidate.caf_sent_at
                            ? "CAF pending"
                            : "CAF not shared"}
                    </Chip>
                  )}
                  {!isInternWorkflow ? (
                    <Chip className={assessment?.assessment_submitted_at ? chipTone("green") : chipTone("amber")}>
                      {assessment?.assessment_submitted_at ? "Assessment submitted" : "Assessment pending"}
                    </Chip>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-2 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-500" />
                  <span className="truncate">{candidate.email || "-"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-500" />
                  <span>{candidate.phone || "-"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-500" />
                  <span>{candidate.city || assessment?.current_location || "-"}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)]">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {candidateSnapshotMetrics.map((item) => (
                  <Metric key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
              <div className="rounded-3xl border border-white/80 bg-white/65 p-4">
                <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Candidate notes</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {candidateQuestionsFromCandidate || "No additional questions shared by the candidate."}
                </p>
                {screening?.screening_notes ? (
                  <>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-tight text-slate-500">
                      Screening notes
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {screening.screening_notes}
                    </p>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {screening ? (
            <SectionBlock
              icon={ClipboardCheck}
              title={isInternWorkflow ? "Screening Review" : "Screening Decision"}
              subtitle="High-signal screening indicators grouped together for quick review."
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {screeningSummaryMetrics.map((item) => (
                    <Metric key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
                <div className="rounded-2xl border border-white/60 bg-white/45 p-3">
                  <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Reviewer notes</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {screening.screening_notes || "No screening notes captured yet."}
                  </p>
                </div>
              </div>
            </SectionBlock>
          ) : (
            <EmptyBlock
              title={isInternWorkflow ? "No screening submission yet" : "No CAF screening yet"}
              description={
                isInternWorkflow
                  ? "This candidate has not submitted screening data yet."
                  : "This candidate has not submitted CAF screening data yet."
              }
            />
          )}

          {isInternWorkflow ? null : !assessment ? (
            <EmptyBlock
              title="CAF assessment form"
              description="No CAF assessment data has been submitted yet."
            />
          ) : (
            <>
              <SectionBlock
                icon={UserRound}
                title="Availability & Contact"
                subtitle="Core candidate context needed for screening and scheduling decisions."
              >
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {availabilityMetrics.map((item) => (
                    <Metric key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              </SectionBlock>

              <SectionBlock
                icon={HandCoins}
                title="Compensation"
                subtitle={
                  assessmentCompensationVisible
                    ? "Compensation inputs from the CAF assessment."
                    : "Compensation values are hidden for this account."
                }
              >
                {assessmentCompensationVisible ? (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {compensationMetrics.map((item) => (
                      <Metric key={item.label} label={item.label} value={item.value} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300/80 bg-white/35 p-4 text-sm text-slate-600">
                    Current and expected CTC are intentionally hidden for this user.
                  </div>
                )}
              </SectionBlock>

              <SectionBlock
                icon={BriefcaseBusiness}
                title="Work Experience"
                subtitle="Current and previous roles, responsibilities, and change motivation."
              >
                <div className="grid gap-3 xl:grid-cols-2">
                  <div className="rounded-2xl border border-white/60 bg-white/45 p-3">
                    <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Current role</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Metric label="Duration (months)" value={valueOrDash(assessment.current_job_duration_months)} />
                      <Metric label="Organization" value={valueOrDash(assessment.current_job_org_name)} />
                    </div>
                    <div className="mt-3">
                      <NarrativeField
                        label="Role and responsibilities"
                        value={valueOrDash(assessment.current_job_role_responsibilities)}
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-white/45 p-3">
                    <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Previous role</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Metric label="Duration (months)" value={valueOrDash(assessment.previous_job_duration_months)} />
                      <Metric label="Organization" value={valueOrDash(assessment.previous_job_org_name)} />
                    </div>
                    <div className="mt-3">
                      <NarrativeField
                        label="Role and responsibilities"
                        value={valueOrDash(assessment.previous_job_role_responsibilities)}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <NarrativeField
                    label="Reason for job change"
                    value={valueOrDash(assessment.reason_for_job_change)}
                  />
                </div>
              </SectionBlock>

              <SectionBlock
                icon={GraduationCap}
                title="Education & Training"
                subtitle="Academic background and supplementary training in one place."
              >
                <div className="grid gap-3 xl:grid-cols-2">
                  <div className="rounded-2xl border border-white/60 bg-white/45 p-3">
                    <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Education</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Metric label="10th specialization" value={valueOrDash(assessment.education_10th_specialization)} />
                      <Metric label="10th year" value={valueOrDash(assessment.education_10th_year)} />
                      <Metric label="10th institution" value={valueOrDash(assessment.education_10th_institution)} />
                      <Metric label="10th marks" value={valueOrDash(assessment.education_10th_marks)} />
                      <Metric label="12th specialization" value={valueOrDash(assessment.education_12th_specialization)} />
                      <Metric label="12th year" value={valueOrDash(assessment.education_12th_year)} />
                      <Metric label="12th institution" value={valueOrDash(assessment.education_12th_institution)} />
                      <Metric label="12th marks" value={valueOrDash(assessment.education_12th_marks)} />
                      <Metric
                        label="Graduation specialization"
                        value={valueOrDash(assessment.education_graduation_specialization)}
                      />
                      <Metric label="Graduation year" value={valueOrDash(assessment.education_graduation_year)} />
                      <Metric
                        label="Graduation institution"
                        value={valueOrDash(assessment.education_graduation_institution)}
                      />
                      <Metric label="Graduation marks" value={valueOrDash(assessment.education_graduation_marks)} />
                      <Metric
                        label="Post-grad specialization"
                        value={valueOrDash(assessment.education_post_graduation_specialization)}
                      />
                      <Metric label="Post-grad year" value={valueOrDash(assessment.education_post_graduation_year)} />
                      <Metric
                        label="Post-grad institution"
                        value={valueOrDash(assessment.education_post_graduation_institution)}
                      />
                      <Metric label="Post-grad marks" value={valueOrDash(assessment.education_post_graduation_marks)} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-white/45 p-3">
                    <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Training / certification</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Metric label="Training 1" value={valueOrDash(assessment.training1_name)} />
                      <Metric label="Training 1 year" value={valueOrDash(assessment.training1_year)} />
                      <Metric label="Training 1 institute" value={valueOrDash(assessment.training1_institute)} />
                      <Metric label="Training 2" value={valueOrDash(assessment.training2_name)} />
                      <Metric label="Training 2 year" value={valueOrDash(assessment.training2_year)} />
                      <Metric label="Training 2 institute" value={valueOrDash(assessment.training2_institute)} />
                    </div>
                  </div>
                </div>
              </SectionBlock>

              <SectionBlock
                icon={NotebookText}
                title="Skills & Proficiency"
                subtitle="Technical capability and work-style ratings arranged separately for easier scanning."
              >
                <div className="grid gap-3 xl:grid-cols-2">
                  <div className="rounded-2xl border border-white/60 bg-white/45 p-3">
                    <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Technical proficiency (1 to 10)</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {technicalSkills.map((item) => (
                        <Metric key={item.label} label={item.label} value={item.value} />
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-white/45 p-3">
                    <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Work proficiency (1 to 10)</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {workStyleSkills.map((item) => (
                        <Metric key={item.label} label={item.label} value={item.value} />
                      ))}
                    </div>
                  </div>
                </div>
              </SectionBlock>

              <SectionBlock
                icon={FileQuestion}
                title="Narrative Assessment"
                subtitle="Free-text rationale, self-awareness, and long-form candidate responses."
              >
                <div className="grid gap-3 xl:grid-cols-2">
                  <div className="grid gap-3">
                    <NarrativeField label="Execution orientation" value={valueOrDash(assessment.proficiency_reason_execution)} />
                    <NarrativeField label="Process orientation" value={valueOrDash(assessment.proficiency_reason_process)} />
                    <NarrativeField label="Strategic orientation" value={valueOrDash(assessment.proficiency_reason_strategic)} />
                    <NarrativeField label="People orientation" value={valueOrDash(assessment.proficiency_reason_people)} />
                  </div>
                  <div className="grid gap-3">
                    <NarrativeField label="Strengths" value={valueOrDash(assessment.self_strengths)} />
                    <NarrativeField label="Improvement areas" value={valueOrDash(assessment.self_improvement_areas)} />
                    <NarrativeField label="Learning needs" value={valueOrDash(assessment.self_learning_needs)} />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <NarrativeField label="Why Studio Lotus?" value={valueOrDash(assessment.q1_why_studio_lotus)} />
                  <NarrativeField label="Project scale" value={valueOrDash(assessment.q2_project_scale)} />
                  <NarrativeField
                    label="Role and site experience"
                    value={valueOrDash(assessment.q3_role_site_experience)}
                  />
                  <NarrativeField label="Inspired project" value={valueOrDash(assessment.q4_inspired_project)} />
                </div>
                <div className="mt-3">
                  <NarrativeField label="Two year plan" value={valueOrDash(assessment.q5_two_year_plan)} />
                </div>
              </SectionBlock>

              <SectionBlock
                icon={ClipboardCheck}
                title="References & Declaration"
                subtitle="Reference checks and declaration details kept together at the end of the review."
              >
                <div className="grid gap-3 xl:grid-cols-2">
                  <div className="rounded-2xl border border-white/60 bg-white/45 p-3">
                    <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Reference 1</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Metric label="Name" value={valueOrDash(assessment.reference1_name)} />
                      <Metric label="Contact" value={valueOrDash(assessment.reference1_contact)} />
                      <Metric label="Relationship" value={valueOrDash(assessment.reference1_relationship)} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-white/45 p-3">
                    <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Reference 2</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Metric label="Name" value={valueOrDash(assessment.reference2_name)} />
                      <Metric label="Contact" value={valueOrDash(assessment.reference2_contact)} />
                      <Metric label="Relationship" value={valueOrDash(assessment.reference2_relationship)} />
                    </div>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-white/60 bg-white/45 p-3">
                  <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Declaration</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <Metric label="Name" value={valueOrDash(assessment.declaration_name)} />
                    <Metric label="Signature" value={valueOrDash(assessment.declaration_signature)} />
                    <Metric label="Date" value={assessment.declaration_date ? formatDate(assessment.declaration_date) : "-"} />
                    <Metric label="Accepted" value={yesNo(assessment.declaration_accepted)} />
                  </div>
                </div>
              </SectionBlock>
            </>
          )}
        </div>
      )}
    </div>
  );
}
