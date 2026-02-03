"use client";

import { useState } from "react";
import { CafPrefill, Screening } from "@/lib/types";

type CafFormProps = {
  token: string;
  prefill: CafPrefill;
  screening?: Screening | null;
};

export function CafForm({ token, prefill, screening }: CafFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const relocateLocked = screening?.willing_to_relocate !== null && screening?.willing_to_relocate !== undefined;
  const commitmentLocked = screening?.two_year_commitment !== null && screening?.two_year_commitment !== undefined;
  const joiningLocked = screening?.expected_joining_date != null;
  const relocateValue =
    screening?.willing_to_relocate == null ? "" : screening.willing_to_relocate ? "yes" : "no";
  const commitmentValue =
    screening?.two_year_commitment == null ? "" : screening.two_year_commitment ? "yes" : "no";
  const joiningValue = screening?.expected_joining_date ? formatDateInput(screening.expected_joining_date) : "";
  const readOnlyMode = Boolean(
    prefill.caf_submitted_at ||
      screening?.current_city ||
      screening?.current_employer ||
      screening?.total_experience_years != null ||
      screening?.relevant_experience_years != null ||
      screening?.current_ctc_annual != null ||
      screening?.expected_ctc_annual != null ||
      screening?.willing_to_relocate != null ||
      screening?.two_year_commitment != null ||
      screening?.notice_period_days != null ||
      screening?.expected_joining_date != null ||
      screening?.reason_for_job_change ||
      screening?.relocation_notes ||
      screening?.questions_from_candidate
  );
  const readonlyFieldClass = readOnlyMode
    ? "bg-slate-100/70 text-slate-500 cursor-not-allowed"
    : "bg-transparent";

  async function onSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);

    const payload = {
      current_city: stringOrNull(formData.get("current_city")),
      current_employer: stringOrNull(formData.get("current_employer")),
      total_experience_years: numberOrNull(formData.get("total_experience_years")),
      relevant_experience_years: numberOrNull(formData.get("relevant_experience_years")),
      current_ctc_annual: numberOrNull(formData.get("current_ctc_annual")),
      expected_ctc_annual: numberOrNull(formData.get("expected_ctc_annual")),
      willing_to_relocate: boolOrNull(formData.get("willing_to_relocate")),
      two_year_commitment: boolOrNull(formData.get("two_year_commitment")),
      notice_period_days: numberOrNull(formData.get("notice_period_days")),
      expected_joining_date: stringOrNull(formData.get("expected_joining_date")),
      reason_for_job_change: stringOrNull(formData.get("reason_for_job_change")),
      relocation_notes: stringOrNull(formData.get("relocation_notes")),
      questions_from_candidate: stringOrNull(formData.get("questions_from_candidate")),
      screening_notes: stringOrNull(formData.get("screening_notes")),
    };

    const res = await fetch(`/api/caf/${token}`, {
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
        <h2 className="text-xl font-semibold">Application Submitted Successfully</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Thank you for your interest in this opportunity.</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Your application has been received and is currently under review.</p>
        <p className="mt-4 text-sm text-[var(--text-secondary)]">You can expect to hear from us within 24–48 business hours.</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Please do not submit another application for the same role.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)]/70 p-6 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
        <p className="text-sm font-semibold">{prefill.name}</p>
        <p className="text-xs text-[var(--text-secondary)]">{prefill.email}</p>
        <p className="text-xs text-[var(--text-secondary)]">{prefill.phone || "—"}</p>
      </div>

      <section className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Current details</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Current City">
            <input
              name="current_city"
              defaultValue={screening?.current_city || ""}
              disabled={readOnlyMode}
              className={`w-full rounded-xl border border-[var(--border)] px-3 py-2 ${readonlyFieldClass}`}
              placeholder="Delhi"
            />
          </Field>
          <Field label="Current Employer (if any)">
            <input
              name="current_employer"
              defaultValue={screening?.current_employer || ""}
              disabled={readOnlyMode}
              className={`w-full rounded-xl border border-[var(--border)] px-3 py-2 ${readonlyFieldClass}`}
              placeholder="Company name"
            />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Experience</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Total experience (years)">
            <input
              name="total_experience_years"
              defaultValue={screening?.total_experience_years ?? ""}
              disabled={readOnlyMode}
              className={`w-full rounded-xl border border-[var(--border)] px-3 py-2 ${readonlyFieldClass}`}
              type="number"
              step="0.1"
              placeholder="5.5"
            />
          </Field>
          <Field label="Relevant experience (years)">
            <input
              name="relevant_experience_years"
              defaultValue={screening?.relevant_experience_years ?? ""}
              disabled={readOnlyMode}
              className={`w-full rounded-xl border border-[var(--border)] px-3 py-2 ${readonlyFieldClass}`}
              type="number"
              step="0.1"
              placeholder="3.0"
            />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Compensation</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Current CTC (annual)">
            <input
              name="current_ctc_annual"
              defaultValue={screening?.current_ctc_annual ?? ""}
              disabled={readOnlyMode}
              className={`w-full rounded-xl border border-[var(--border)] px-3 py-2 ${readonlyFieldClass}`}
              type="number"
              step="0.01"
              placeholder="1200000"
            />
          </Field>
          <Field label="Expected CTC (annual)">
            <input
              name="expected_ctc_annual"
              defaultValue={screening?.expected_ctc_annual ?? ""}
              disabled={readOnlyMode}
              className={`w-full rounded-xl border border-[var(--border)] px-3 py-2 ${readonlyFieldClass}`}
              type="number"
              step="0.01"
              placeholder="1600000"
            />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Availability</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Willing to relocate?">
            <select
              name="willing_to_relocate"
              defaultValue={relocateValue}
              disabled={readOnlyMode || relocateLocked}
              className={`w-full rounded-xl border border-[var(--border)] px-3 py-2 disabled:opacity-70 ${readonlyFieldClass}`}
            >
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="Commit to a 2-year tenure with our organisation?">
            <select
              name="two_year_commitment"
              required
              defaultValue={commitmentValue}
              disabled={readOnlyMode || commitmentLocked}
              className={`w-full rounded-xl border border-[var(--border)] px-3 py-2 disabled:opacity-70 ${readonlyFieldClass}`}
            >
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="Notice period (days)">
            <input
              name="notice_period_days"
              defaultValue={screening?.notice_period_days ?? ""}
              disabled={readOnlyMode}
              className={`w-full rounded-xl border border-[var(--border)] px-3 py-2 ${readonlyFieldClass}`}
              type="number"
              placeholder="30"
            />
          </Field>
          <Field label="Expected joining date">
            <input
              name="expected_joining_date"
              className={`w-full rounded-xl border border-[var(--border)] px-3 py-2 ${readonlyFieldClass}`}
              type="date"
              defaultValue={joiningValue}
              disabled={readOnlyMode || joiningLocked}
            />
          </Field>
          <Field label="Relocation notes (optional)">
            <input
              name="relocation_notes"
              defaultValue={screening?.relocation_notes || ""}
              disabled={readOnlyMode}
              className={`w-full rounded-xl border border-[var(--border)] px-3 py-2 ${readonlyFieldClass}`}
              placeholder="Any constraints"
            />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Notes</p>
        <Field label="Reason for Job Change">
          <textarea
            name="reason_for_job_change"
            defaultValue={screening?.reason_for_job_change || ""}
            disabled={readOnlyMode}
            className={`min-h-20 w-full rounded-xl border border-[var(--border)] px-3 py-2 ${readonlyFieldClass}`}
            placeholder="Briefly share why you are exploring a change"
          />
        </Field>
        <Field label="Anything you’d like us to know?">
          <textarea
            name="questions_from_candidate"
            defaultValue={screening?.questions_from_candidate || ""}
            disabled={readOnlyMode}
            className={`min-h-24 w-full rounded-xl border border-[var(--border)] px-3 py-2 ${readonlyFieldClass}`}
            placeholder="Portfolio highlights, preferences, questions..."
          />
        </Field>
      </section>

      {error && !readOnlyMode && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {!readOnlyMode ? (
        <button
          className="w-full rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-card hover:bg-teal-700 disabled:opacity-60"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Submitting..." : "Submit CAF"}
        </button>
      ) : null}
    </form>
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

function numberOrNull(value: FormDataEntryValue | null) {
  if (value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function stringOrNull(value: FormDataEntryValue | null) {
  if (value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function boolOrNull(value: FormDataEntryValue | null) {
  if (value === null) return null;
  const s = String(value);
  if (s === "yes") return true;
  if (s === "no") return false;
  return null;
}

function formatDateInput(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  if (raw.includes("T")) return raw.split("T")[0];
  return raw;
}
