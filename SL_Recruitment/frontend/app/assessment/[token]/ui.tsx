"use client";

import { useState } from "react";
import { CandidateAssessmentPrefill } from "@/lib/types";

type AssessmentFormProps = {
  token: string;
  prefill: CandidateAssessmentPrefill;
};

const RATING_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

export function AssessmentForm({ token, prefill }: AssessmentFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const runtimeBasePath =
    typeof window !== "undefined" && window.location.pathname.startsWith("/recruitment") ? "/recruitment" : "";
  const apiBase = basePath || runtimeBasePath || "/recruitment";

  async function onSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);

    const payload = {
      position_applied_for: stringOrNull(formData.get("position_applied_for")),
      total_experience_years: numberOrNull(formData.get("total_experience_years")),
      architecture_interior_experience_years: numberOrNull(formData.get("architecture_interior_experience_years")),
      personal_email: stringOrNull(formData.get("personal_email")),
      contact_number: stringOrNull(formData.get("contact_number")),
      current_employment_status: stringOrNull(formData.get("current_employment_status")),
      interviewer_name: stringOrNull(formData.get("interviewer_name")),
      notice_period_or_joining_time: stringOrNull(formData.get("notice_period_or_joining_time")),
      current_location: stringOrNull(formData.get("current_location")),

      current_job_duration_months: intOrNull(formData.get("current_job_duration_months")),
      current_job_org_name: stringOrNull(formData.get("current_job_org_name")),
      current_job_role_responsibilities: stringOrNull(formData.get("current_job_role_responsibilities")),
      previous_job_duration_months: intOrNull(formData.get("previous_job_duration_months")),
      previous_job_org_name: stringOrNull(formData.get("previous_job_org_name")),
      previous_job_role_responsibilities: stringOrNull(formData.get("previous_job_role_responsibilities")),

      education_10th_specialization: stringOrNull(formData.get("education_10th_specialization")),
      education_10th_year: stringOrNull(formData.get("education_10th_year")),
      education_10th_institution: stringOrNull(formData.get("education_10th_institution")),
      education_10th_marks: stringOrNull(formData.get("education_10th_marks")),
      education_12th_specialization: stringOrNull(formData.get("education_12th_specialization")),
      education_12th_year: stringOrNull(formData.get("education_12th_year")),
      education_12th_institution: stringOrNull(formData.get("education_12th_institution")),
      education_12th_marks: stringOrNull(formData.get("education_12th_marks")),
      education_graduation_specialization: stringOrNull(formData.get("education_graduation_specialization")),
      education_graduation_year: stringOrNull(formData.get("education_graduation_year")),
      education_graduation_institution: stringOrNull(formData.get("education_graduation_institution")),
      education_graduation_marks: stringOrNull(formData.get("education_graduation_marks")),
      education_post_graduation_specialization: stringOrNull(formData.get("education_post_graduation_specialization")),
      education_post_graduation_year: stringOrNull(formData.get("education_post_graduation_year")),
      education_post_graduation_institution: stringOrNull(formData.get("education_post_graduation_institution")),
      education_post_graduation_marks: stringOrNull(formData.get("education_post_graduation_marks")),

      training1_name: stringOrNull(formData.get("training1_name")),
      training1_year: stringOrNull(formData.get("training1_year")),
      training1_institute: stringOrNull(formData.get("training1_institute")),
      training2_name: stringOrNull(formData.get("training2_name")),
      training2_year: stringOrNull(formData.get("training2_year")),
      training2_institute: stringOrNull(formData.get("training2_institute")),

      skill_auto_cad: intOrNull(formData.get("skill_auto_cad")),
      skill_sketch_up: intOrNull(formData.get("skill_sketch_up")),
      skill_revit: intOrNull(formData.get("skill_revit")),
      skill_photoshop: intOrNull(formData.get("skill_photoshop")),
      skill_illustrator: intOrNull(formData.get("skill_illustrator")),
      skill_ms_office: intOrNull(formData.get("skill_ms_office")),
      skill_3d_max: intOrNull(formData.get("skill_3d_max")),
      skill_indesign: intOrNull(formData.get("skill_indesign")),
      skill_presentation: intOrNull(formData.get("skill_presentation")),
      skill_rhino: intOrNull(formData.get("skill_rhino")),
      skill_boqs: intOrNull(formData.get("skill_boqs")),
      skill_analytical_writing: intOrNull(formData.get("skill_analytical_writing")),
      skill_graphics: intOrNull(formData.get("skill_graphics")),
      skill_drafting: intOrNull(formData.get("skill_drafting")),
      skill_hand_sketching: intOrNull(formData.get("skill_hand_sketching")),
      skill_estimation: intOrNull(formData.get("skill_estimation")),
      skill_specifications: intOrNull(formData.get("skill_specifications")),
      skill_enscape: intOrNull(formData.get("skill_enscape")),

      proficiency_execution_action_orientation: intOrNull(formData.get("proficiency_execution_action_orientation")),
      proficiency_execution_self_discipline: intOrNull(formData.get("proficiency_execution_self_discipline")),
      proficiency_execution_independent_decision: intOrNull(formData.get("proficiency_execution_independent_decision")),
      proficiency_process_time_management: intOrNull(formData.get("proficiency_process_time_management")),
      proficiency_process_following_processes: intOrNull(formData.get("proficiency_process_following_processes")),
      proficiency_process_new_processes: intOrNull(formData.get("proficiency_process_new_processes")),
      proficiency_strategic_long_term_thinking: intOrNull(formData.get("proficiency_strategic_long_term_thinking")),
      proficiency_strategic_ideation_creativity: intOrNull(formData.get("proficiency_strategic_ideation_creativity")),
      proficiency_strategic_risk_taking: intOrNull(formData.get("proficiency_strategic_risk_taking")),
      proficiency_people_collaboration: intOrNull(formData.get("proficiency_people_collaboration")),
      proficiency_people_coaching: intOrNull(formData.get("proficiency_people_coaching")),
      proficiency_people_feedback: intOrNull(formData.get("proficiency_people_feedback")),
      proficiency_people_conflict_resolution: intOrNull(formData.get("proficiency_people_conflict_resolution")),

      proficiency_reason_execution: stringOrNull(formData.get("proficiency_reason_execution")),
      proficiency_reason_process: stringOrNull(formData.get("proficiency_reason_process")),
      proficiency_reason_strategic: stringOrNull(formData.get("proficiency_reason_strategic")),
      proficiency_reason_people: stringOrNull(formData.get("proficiency_reason_people")),

      self_strengths: stringOrNull(formData.get("self_strengths")),
      self_improvement_areas: stringOrNull(formData.get("self_improvement_areas")),
      self_learning_needs: stringOrNull(formData.get("self_learning_needs")),

      q1_why_studio_lotus: stringOrNull(formData.get("q1_why_studio_lotus")),
      q2_project_scale: stringOrNull(formData.get("q2_project_scale")),
      q3_role_site_experience: stringOrNull(formData.get("q3_role_site_experience")),
      q4_inspired_project: stringOrNull(formData.get("q4_inspired_project")),
      q5_two_year_plan: stringOrNull(formData.get("q5_two_year_plan")),

      reference1_name: stringOrNull(formData.get("reference1_name")),
      reference1_contact: stringOrNull(formData.get("reference1_contact")),
      reference1_relationship: stringOrNull(formData.get("reference1_relationship")),
      reference2_name: stringOrNull(formData.get("reference2_name")),
      reference2_contact: stringOrNull(formData.get("reference2_contact")),
      reference2_relationship: stringOrNull(formData.get("reference2_relationship")),

      declaration_name: stringOrNull(formData.get("declaration_name")),
      declaration_signature: stringOrNull(formData.get("declaration_signature")),
      declaration_date: stringOrNull(formData.get("declaration_date")),
      declaration_accepted: checkboxOrNull(formData.get("declaration_accepted")),
    };

    const res = await fetch(`${apiBase}/api/assessment/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      setError(text || "CAF submission failed");
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)]/70 p-6 shadow-card">
        <h2 className="text-xl font-semibold">CAF submitted successfully</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Thank you for completing the assessment.</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Our HR team will review your submission and reach out shortly.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)]/70 p-6 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
        <p className="text-sm font-semibold">{prefill.name}</p>
        <p className="text-xs text-[var(--text-secondary)]">{prefill.email}</p>
      </div>
      <Section title="Personal details">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Position applied for">
            <input
              name="position_applied_for"
              defaultValue={prefill.opening_title || ""}
              required
              readOnly
              className="w-full rounded-xl border border-[var(--border)] bg-slate-100/70 px-3 py-2 text-slate-500"
            />
          </Field>
          <Field label="Total experience (years)">
            <input
              name="total_experience_years"
              type="number"
              step="0.1"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Architecture / Interior experience (years)">
            <input
              name="architecture_interior_experience_years"
              type="number"
              step="0.1"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Personal email">
            <input
              name="personal_email"
              defaultValue={prefill.email || ""}
              required
              readOnly
              className="w-full rounded-xl border border-[var(--border)] bg-slate-100/70 px-3 py-2 text-slate-500"
            />
          </Field>
          <Field label="Contact number">
            <input
              name="contact_number"
              defaultValue={prefill.phone || ""}
              required
              readOnly
              className="w-full rounded-xl border border-[var(--border)] bg-slate-100/70 px-3 py-2 text-slate-500"
            />
          </Field>
          <Field label="Current employment status">
            <input
              name="current_employment_status"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
              placeholder="Employed / On notice / Freelancer"
            />
          </Field>
          <Field label="Notice period / joining time">
            <input
              name="notice_period_or_joining_time"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
              placeholder="30 days"
            />
          </Field>
          <Field label="Current location">
            <input
              name="current_location"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
              placeholder="City"
            />
          </Field>
          <Field label="Interviewer (if known)">
            <input
              name="interviewer_name"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
              placeholder="Name"
            />
          </Field>
        </div>
      </Section>

      <Section title="Job details">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Current job duration (months)">
            <input
              name="current_job_duration_months"
              type="number"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Current organization name">
            <input
              name="current_job_org_name"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Current role and responsibilities">
            <textarea
              name="current_job_role_responsibilities"
              required
              className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Previous job duration (months)">
            <input
              name="previous_job_duration_months"
              type="number"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Previous organization name">
            <input
              name="previous_job_org_name"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Previous role and responsibilities">
            <textarea
              name="previous_job_role_responsibilities"
              required
              className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
        </div>
      </Section>

      <Section title="Educational details">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="10th specialization">
            <input
              name="education_10th_specialization"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="10th year of passing">
            <input
              name="education_10th_year"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="10th school / university">
            <input
              name="education_10th_institution"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="10th marks (% or CGPA)">
            <input
              name="education_10th_marks"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="12th specialization">
            <input
              name="education_12th_specialization"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="12th year of passing">
            <input
              name="education_12th_year"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="12th school / university">
            <input
              name="education_12th_institution"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="12th marks (% or CGPA)">
            <input
              name="education_12th_marks"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Graduation specialization">
            <input
              name="education_graduation_specialization"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Graduation year of passing">
            <input
              name="education_graduation_year"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Graduation college / university">
            <input
              name="education_graduation_institution"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Graduation marks (% or CGPA)">
            <input
              name="education_graduation_marks"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Post-graduation specialization (if any)">
            <input
              name="education_post_graduation_specialization"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Post-graduation year of passing (if any)">
            <input
              name="education_post_graduation_year"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Post-graduation college / university (if any)">
            <input
              name="education_post_graduation_institution"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Post-graduation marks (% or CGPA)">
            <input
              name="education_post_graduation_marks"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
        </div>
      </Section>

      <Section title="Training / certification">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Training 1 name">
            <input
              name="training1_name"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Training 1 year">
            <input
              name="training1_year"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Training 1 institute">
            <input
              name="training1_institute"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Training 2 name">
            <input
              name="training2_name"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Training 2 year">
            <input
              name="training2_year"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Training 2 institute">
            <input
              name="training2_institute"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
        </div>
      </Section>

      <Section title="Technical proficiency (rate 1 to 10)">
        <div className="grid gap-4 md:grid-cols-2">
          <RatingField label="AutoCAD" name="skill_auto_cad" />
          <RatingField label="SketchUp" name="skill_sketch_up" />
          <RatingField label="Revit" name="skill_revit" />
          <RatingField label="Photoshop" name="skill_photoshop" />
          <RatingField label="Illustrator" name="skill_illustrator" />
          <RatingField label="MS Office (Word/Excel)" name="skill_ms_office" />
          <RatingField label="3D Max" name="skill_3d_max" />
          <RatingField label="InDesign" name="skill_indesign" />
          <RatingField label="Presentation skills" name="skill_presentation" />
          <RatingField label="Rhino" name="skill_rhino" />
          <RatingField label="BOQs" name="skill_boqs" />
          <RatingField label="Analytical writing" name="skill_analytical_writing" />
          <RatingField label="Graphics" name="skill_graphics" />
          <RatingField label="Drafting" name="skill_drafting" />
          <RatingField label="Hand sketching" name="skill_hand_sketching" />
          <RatingField label="Estimation" name="skill_estimation" />
          <RatingField label="Specifications" name="skill_specifications" />
          <RatingField label="Enscape" name="skill_enscape" />
        </div>
      </Section>

      <Section title="Generic work proficiency (rate 1 to 10)">
        <div className="grid gap-4 md:grid-cols-2">
          <RatingField label="Execution: action orientation" name="proficiency_execution_action_orientation" />
          <RatingField label="Execution: self-discipline and delivery" name="proficiency_execution_self_discipline" />
          <RatingField label="Execution: independent decision making" name="proficiency_execution_independent_decision" />
          <RatingField label="Process: time management and prioritization" name="proficiency_process_time_management" />
          <RatingField label="Process: following laid out processes" name="proficiency_process_following_processes" />
          <RatingField label="Process: creating new processes" name="proficiency_process_new_processes" />
          <RatingField label="Strategic: long-term thinking" name="proficiency_strategic_long_term_thinking" />
          <RatingField label="Strategic: ideation and creativity" name="proficiency_strategic_ideation_creativity" />
          <RatingField label="Strategic: risk taking ability" name="proficiency_strategic_risk_taking" />
          <RatingField label="People: collaboration and teamwork" name="proficiency_people_collaboration" />
          <RatingField label="People: coaching and developing others" name="proficiency_people_coaching" />
          <RatingField label="People: giving and taking feedback" name="proficiency_people_feedback" />
          <RatingField label="People: conflict resolution" name="proficiency_people_conflict_resolution" />
        </div>
      </Section>
      <Section title="Reasons for highest and lowest ratings">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Execution orientation">
            <textarea
              name="proficiency_reason_execution"
              required
              className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Process orientation">
            <textarea
              name="proficiency_reason_process"
              required
              className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Strategic orientation">
            <textarea
              name="proficiency_reason_strategic"
              required
              className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="People orientation">
            <textarea
              name="proficiency_reason_people"
              required
              className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
        </div>
      </Section>

      <Section title="Self-awareness">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Your strengths (min 5 qualities)">
            <textarea
              name="self_strengths"
              required
              className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Your improvement areas">
            <textarea
              name="self_improvement_areas"
              required
              className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Learning needs improved in recent years">
            <textarea
              name="self_learning_needs"
              required
              className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
        </div>
      </Section>

      <Section title="Questions">
        <div className="grid gap-4">
          <Field label="1. Why do you want to be part of Studio Lotus?">
            <textarea
              name="q1_why_studio_lotus"
              required
              className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="2. What is the type and scale of projects you have done till date?">
            <textarea
              name="q2_project_scale"
              required
              className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="3. What was your role in the projects mentioned above? Did you have site experience?">
            <textarea
              name="q3_role_site_experience"
              required
              className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="4. Which project or space inspired you to join, and why?">
            <textarea
              name="q4_inspired_project"
              required
              className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="5. Where do you see yourself after 2 years?">
            <textarea
              name="q5_two_year_plan"
              required
              className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
        </div>
      </Section>

      <Section title="Professional references">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Reference 1 name">
            <input
              name="reference1_name"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Reference 1 contact number">
            <input
              name="reference1_contact"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Reference 1 relationship">
            <input
              name="reference1_relationship"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Reference 2 name">
            <input
              name="reference2_name"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Reference 2 contact number">
            <input
              name="reference2_contact"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Reference 2 relationship">
            <input
              name="reference2_relationship"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
        </div>
      </Section>

      <Section title="Candidate declaration">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name">
            <input
              name="declaration_name"
              defaultValue={prefill.name}
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Signature (type full name)">
            <input
              name="declaration_signature"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <Field label="Date">
            <input
              name="declaration_date"
              type="date"
              required
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </Field>
          <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
            <input name="declaration_accepted" type="checkbox" required className="mt-1" />
            I hereby declare that the information furnished above is correct to the best of my knowledge and belief.
          </label>
        </div>
      </Section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <button
        className="w-full rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-card hover:bg-teal-700 disabled:opacity-60"
        type="submit"
        disabled={submitting}
      >
        {submitting ? "Submitting..." : "Submit CAF"}
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">{title}</p>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function RatingField({ label, name }: { label: string; name: string }) {
  return (
    <Field label={label}>
      <select name={name} required className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2">
        <option value="">Select</option>
        {RATING_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </Field>
  );
}

function numberOrNull(value: FormDataEntryValue | null) {
  if (value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(value: FormDataEntryValue | null) {
  if (value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function stringOrNull(value: FormDataEntryValue | null) {
  if (value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function checkboxOrNull(value: FormDataEntryValue | null) {
  if (value === null) return null;
  return String(value) === "on";
}
