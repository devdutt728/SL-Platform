"use client";

import { CandidateAssessment, Screening } from "@/lib/types";
import { Chip, Metric } from "./Candidate360Primitives";

type Props = {
  sectionRef: React.RefObject<HTMLDivElement>;
  collapsed: boolean;
  onToggle: () => void;
  screening: Screening | null | undefined;
  assessment: CandidateAssessment | null | undefined;
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

export function Candidate360ScreeningSection({
  sectionRef,
  collapsed,
  onToggle,
  screening,
  assessment,
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
        <>
          {!screening ? (
            <div className="mt-3 rounded-2xl border border-white/60 bg-white/30 p-6">
              <p className="text-sm font-semibold">No screening yet</p>
              <p className="mt-1 text-sm text-slate-600">
                {isInternWorkflow
                  ? "This candidate has not submitted screening data."
                  : "This candidate has not submitted CAF/screening data."}
              </p>
            </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-white/60 bg-white/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{isInternWorkflow ? "Screening" : "CAF screening"}</p>
                  <Chip className={screeningTone(screening.screening_result)}>
                  {screeningLabel(screening.screening_result) || screening.screening_result || "?"}
                </Chip>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-2">
                <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                  <p className="text-xs uppercase tracking-tight text-slate-500">Relocation</p>
                  <p className="mt-1 text-sm font-semibold">
                    {screening.willing_to_relocate == null ? "?" : screening.willing_to_relocate ? "Yes" : "No"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                  <p className="text-xs uppercase tracking-tight text-slate-500">Notes / questions</p>
                  <p className="mt-1 text-sm text-slate-700">{candidateQuestionsFromCandidate || "-"}</p>
                  <p className="mt-2 text-xs text-slate-600">{screening.screening_notes || ""}</p>
                </div>
                </div>
              </div>
            )}

            {isInternWorkflow ? null : !assessment ? (
              <div className="mt-4 rounded-2xl border border-white/60 bg-white/30 p-6">
                <p className="text-sm font-semibold">CAF assessment form</p>
                <p className="mt-1 text-sm text-slate-600">No CAF assessment data submitted yet.</p>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-white/60 bg-white/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">CAF assessment form</p>
                  <Chip className={assessment.assessment_submitted_at ? chipTone("green") : chipTone("amber")}>
                    {assessment.assessment_submitted_at ? "Submitted" : "Pending"}
                  </Chip>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <Metric label="Position" value={valueOrDash(assessment.position_applied_for)} />
                  <Metric label="Employer" value={valueOrDash(assessment.current_employer)} />
                  <Metric label="Relevant exp" value={valueOrDash(assessment.relevant_experience_years)} />
                  <Metric label="Architecture exp" value={valueOrDash(assessment.architecture_interior_experience_years)} />
                  <Metric label="Personal email" value={valueOrDash(assessment.personal_email)} />
                  <Metric label="Contact" value={valueOrDash(assessment.contact_number)} />
                  <Metric label="Employment status" value={valueOrDash(assessment.current_employment_status)} />
                  <Metric
                    label="Notice period"
                    value={valueOrDash(assessment.notice_period_days ?? assessment.notice_period_or_joining_time)}
                  />
                  <Metric label="Current CTC" value={valueOrDash(assessment.current_ctc_annual)} />
                  <Metric label="Expected CTC" value={valueOrDash(assessment.expected_ctc_annual)} />
                  <Metric label="Current location" value={valueOrDash(assessment.current_location)} />
                  <Metric label="Interviewer" value={valueOrDash(assessment.interviewer_name)} />
                  <Metric label="Submitted" value={assessment.assessment_submitted_at ? formatDateTime(assessment.assessment_submitted_at) : "-"} />
                </div>
                {assessment.reason_for_job_change ? (
                  <div className="mt-3 rounded-2xl border border-white/60 bg-white/35 p-3">
                    <p className="text-xs uppercase tracking-tight text-slate-500">Reason for job change</p>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{assessment.reason_for_job_change}</p>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                    <p className="text-xs uppercase tracking-tight text-slate-500">Current job</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <Metric label="Duration (months)" value={valueOrDash(assessment.current_job_duration_months)} />
                      <Metric label="Organization" value={valueOrDash(assessment.current_job_org_name)} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Role and responsibilities</p>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.current_job_role_responsibilities)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                    <p className="text-xs uppercase tracking-tight text-slate-500">Previous job</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <Metric label="Duration (months)" value={valueOrDash(assessment.previous_job_duration_months)} />
                      <Metric label="Organization" value={valueOrDash(assessment.previous_job_org_name)} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Role and responsibilities</p>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.previous_job_role_responsibilities)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                    <p className="text-xs uppercase tracking-tight text-slate-500">Education</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <Metric label="10th specialization" value={valueOrDash(assessment.education_10th_specialization)} />
                      <Metric label="10th year" value={valueOrDash(assessment.education_10th_year)} />
                      <Metric label="10th institution" value={valueOrDash(assessment.education_10th_institution)} />
                      <Metric label="10th marks" value={valueOrDash(assessment.education_10th_marks)} />
                      <Metric label="12th specialization" value={valueOrDash(assessment.education_12th_specialization)} />
                      <Metric label="12th year" value={valueOrDash(assessment.education_12th_year)} />
                      <Metric label="12th institution" value={valueOrDash(assessment.education_12th_institution)} />
                      <Metric label="12th marks" value={valueOrDash(assessment.education_12th_marks)} />
                      <Metric label="Graduation specialization" value={valueOrDash(assessment.education_graduation_specialization)} />
                      <Metric label="Graduation year" value={valueOrDash(assessment.education_graduation_year)} />
                      <Metric label="Graduation institution" value={valueOrDash(assessment.education_graduation_institution)} />
                      <Metric label="Graduation marks" value={valueOrDash(assessment.education_graduation_marks)} />
                      <Metric label="Post-grad specialization" value={valueOrDash(assessment.education_post_graduation_specialization)} />
                      <Metric label="Post-grad year" value={valueOrDash(assessment.education_post_graduation_year)} />
                      <Metric label="Post-grad institution" value={valueOrDash(assessment.education_post_graduation_institution)} />
                      <Metric label="Post-grad marks" value={valueOrDash(assessment.education_post_graduation_marks)} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                    <p className="text-xs uppercase tracking-tight text-slate-500">Training / certification</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <Metric label="Training 1" value={valueOrDash(assessment.training1_name)} />
                      <Metric label="Year" value={valueOrDash(assessment.training1_year)} />
                      <Metric label="Institute" value={valueOrDash(assessment.training1_institute)} />
                      <Metric label="Training 2" value={valueOrDash(assessment.training2_name)} />
                      <Metric label="Year" value={valueOrDash(assessment.training2_year)} />
                      <Metric label="Institute" value={valueOrDash(assessment.training2_institute)} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/60 bg-white/35 p-3">
                  <p className="text-xs uppercase tracking-tight text-slate-500">Technical proficiency (1 to 10)</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <Metric label="AutoCAD" value={valueOrDash(assessment.skill_auto_cad)} />
                    <Metric label="SketchUp" value={valueOrDash(assessment.skill_sketch_up)} />
                    <Metric label="Revit" value={valueOrDash(assessment.skill_revit)} />
                    <Metric label="Photoshop" value={valueOrDash(assessment.skill_photoshop)} />
                    <Metric label="Illustrator" value={valueOrDash(assessment.skill_illustrator)} />
                    <Metric label="MS Office" value={valueOrDash(assessment.skill_ms_office)} />
                    <Metric label="3D Max" value={valueOrDash(assessment.skill_3d_max)} />
                    <Metric label="InDesign" value={valueOrDash(assessment.skill_indesign)} />
                    <Metric label="Presentation" value={valueOrDash(assessment.skill_presentation)} />
                    <Metric label="Rhino" value={valueOrDash(assessment.skill_rhino)} />
                    <Metric label="BOQs" value={valueOrDash(assessment.skill_boqs)} />
                    <Metric label="Analytical writing" value={valueOrDash(assessment.skill_analytical_writing)} />
                    <Metric label="Graphics" value={valueOrDash(assessment.skill_graphics)} />
                    <Metric label="Drafting" value={valueOrDash(assessment.skill_drafting)} />
                    <Metric label="Hand sketching" value={valueOrDash(assessment.skill_hand_sketching)} />
                    <Metric label="Estimation" value={valueOrDash(assessment.skill_estimation)} />
                    <Metric label="Specifications" value={valueOrDash(assessment.skill_specifications)} />
                    <Metric label="Enscape" value={valueOrDash(assessment.skill_enscape)} />
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/60 bg-white/35 p-3">
                  <p className="text-xs uppercase tracking-tight text-slate-500">Generic work proficiency (1 to 10)</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <Metric label="Execution: action orientation" value={valueOrDash(assessment.proficiency_execution_action_orientation)} />
                    <Metric label="Execution: self discipline" value={valueOrDash(assessment.proficiency_execution_self_discipline)} />
                    <Metric label="Execution: independent decision" value={valueOrDash(assessment.proficiency_execution_independent_decision)} />
                    <Metric label="Process: time management" value={valueOrDash(assessment.proficiency_process_time_management)} />
                    <Metric label="Process: following processes" value={valueOrDash(assessment.proficiency_process_following_processes)} />
                    <Metric label="Process: new processes" value={valueOrDash(assessment.proficiency_process_new_processes)} />
                    <Metric label="Strategic: long term thinking" value={valueOrDash(assessment.proficiency_strategic_long_term_thinking)} />
                    <Metric label="Strategic: creativity" value={valueOrDash(assessment.proficiency_strategic_ideation_creativity)} />
                    <Metric label="Strategic: risk taking" value={valueOrDash(assessment.proficiency_strategic_risk_taking)} />
                    <Metric label="People: collaboration" value={valueOrDash(assessment.proficiency_people_collaboration)} />
                    <Metric label="People: coaching" value={valueOrDash(assessment.proficiency_people_coaching)} />
                    <Metric label="People: feedback" value={valueOrDash(assessment.proficiency_people_feedback)} />
                    <Metric label="People: conflict" value={valueOrDash(assessment.proficiency_people_conflict_resolution)} />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                    <p className="text-xs uppercase tracking-tight text-slate-500">Reasons for ratings</p>
                    <p className="mt-2 text-xs font-semibold text-slate-600">Execution orientation</p>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.proficiency_reason_execution)}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-600">Process orientation</p>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.proficiency_reason_process)}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-600">Strategic orientation</p>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.proficiency_reason_strategic)}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-600">People orientation</p>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.proficiency_reason_people)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                    <p className="text-xs uppercase tracking-tight text-slate-500">Self awareness</p>
                    <p className="mt-2 text-xs font-semibold text-slate-600">Strengths</p>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.self_strengths)}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-600">Improvement areas</p>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.self_improvement_areas)}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-600">Learning needs</p>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.self_learning_needs)}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/60 bg-white/35 p-3">
                  <p className="text-xs uppercase tracking-tight text-slate-500">Questions</p>
                  <p className="mt-2 text-xs font-semibold text-slate-600">Why Studio Lotus?</p>
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.q1_why_studio_lotus)}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-600">Project scale</p>
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.q2_project_scale)}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-600">Role and site experience</p>
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.q3_role_site_experience)}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-600">Inspired project</p>
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.q4_inspired_project)}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-600">Two year plan</p>
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.q5_two_year_plan)}</p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                    <p className="text-xs uppercase tracking-tight text-slate-500">Reference 1</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <Metric label="Name" value={valueOrDash(assessment.reference1_name)} />
                      <Metric label="Contact" value={valueOrDash(assessment.reference1_contact)} />
                      <Metric label="Relationship" value={valueOrDash(assessment.reference1_relationship)} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                    <p className="text-xs uppercase tracking-tight text-slate-500">Reference 2</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <Metric label="Name" value={valueOrDash(assessment.reference2_name)} />
                      <Metric label="Contact" value={valueOrDash(assessment.reference2_contact)} />
                      <Metric label="Relationship" value={valueOrDash(assessment.reference2_relationship)} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/60 bg-white/35 p-3">
                  <p className="text-xs uppercase tracking-tight text-slate-500">Declaration</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <Metric label="Name" value={valueOrDash(assessment.declaration_name)} />
                    <Metric label="Signature" value={valueOrDash(assessment.declaration_signature)} />
                    <Metric label="Date" value={assessment.declaration_date ? formatDate(assessment.declaration_date) : "-"} />
                    <Metric label="Accepted" value={yesNo(assessment.declaration_accepted)} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
  );
}
