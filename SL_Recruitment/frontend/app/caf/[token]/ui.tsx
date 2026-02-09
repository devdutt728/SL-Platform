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
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const runtimeBasePath =
    typeof window !== "undefined" && window.location.pathname.startsWith("/recruitment") ? "/recruitment" : "";
  const apiBase = basePath || runtimeBasePath;
  const readOnlyMode = Boolean(
    prefill.caf_submitted_at ||
      screening?.screening_notes
  );
  const readonlyFieldClass = readOnlyMode
    ? "bg-slate-100/70 text-slate-500 cursor-not-allowed"
    : "bg-transparent";

  async function onSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);

    const payload = {
      screening_notes: stringOrNull(formData.get("screening_notes")),
    };

    const res = await fetch(`${apiBase}/api/caf/${token}`, {
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
        <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Availability</p>
        <div className="grid gap-4 md:grid-cols-2">
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Notes</p>
        <Field label="Screening notes">
          <textarea
            name="screening_notes"
            defaultValue={screening?.screening_notes || ""}
            disabled={readOnlyMode}
            className={`min-h-24 w-full rounded-xl border border-[var(--border)] px-3 py-2 ${readonlyFieldClass}`}
            placeholder="Notes for HR review"
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

function stringOrNull(value: FormDataEntryValue | null) {
  if (value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

