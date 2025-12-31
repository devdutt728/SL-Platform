"use client";

import { useState } from "react";
import { CafPrefill } from "@/lib/types";

type CafFormProps = {
  token: string;
  prefill: CafPrefill;
};

export function CafForm({ token, prefill }: CafFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      </div>

      <section className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Current details</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Current City">
            <input
              name="current_city"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
              placeholder="Delhi"
            />
          </Field>
          <Field label="Current Employer (if any)">
            <input
              name="current_employer"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
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
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
              type="number"
              step="0.1"
              placeholder="5.5"
            />
          </Field>
          <Field label="Relevant experience (years)">
            <input
              name="relevant_experience_years"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
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
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
              type="number"
              step="0.01"
              placeholder="1200000"
            />
          </Field>
          <Field label="Expected CTC (annual)">
            <input
              name="expected_ctc_annual"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
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
            <select name="willing_to_relocate" className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2">
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="Notice period (days)">
            <input
              name="notice_period_days"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
              type="number"
              placeholder="30"
            />
          </Field>
          <Field label="Expected joining date">
            <input
              name="expected_joining_date"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
              type="date"
            />
          </Field>
          <Field label="Relocation notes (optional)">
            <input
              name="relocation_notes"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
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
            className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            placeholder="Briefly share why you are exploring a change"
          />
        </Field>
        <Field label="Anything you’d like us to know?">
          <textarea
            name="questions_from_candidate"
            className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2"
            placeholder="Portfolio highlights, preferences, questions..."
          />
        </Field>
      </section>

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
