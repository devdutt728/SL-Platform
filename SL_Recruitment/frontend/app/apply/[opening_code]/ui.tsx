"use client";

import { useRef, useState } from "react";
import { Briefcase, CalendarClock, FileText, Sparkles } from "lucide-react";

export function ApplyForm({ openingCode }: { openingCode: string }) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const runtimeBasePath =
    typeof window !== "undefined" && window.location.pathname.startsWith("/recruitment") ? "/recruitment" : "";
  const apiBase = basePath || runtimeBasePath;
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [alreadyApplied, setAlreadyApplied] = useState<boolean>(false);
  const [candidateCode, setCandidateCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cvName, setCvName] = useState<string>("");
  const [portfolioName, setPortfolioName] = useState<string>("");
  const idempotencyKeyRef = useRef<string | null>(null);

  async function onSubmit(formData: FormData) {
    const cvRaw = formData.get("cv_file");
    const portfolioRaw = formData.get("portfolio_file");
    const cv = cvRaw instanceof File && cvRaw.size > 0 ? cvRaw : null;
    const portfolio = portfolioRaw instanceof File && portfolioRaw.size > 0 ? portfolioRaw : null;
    const portfolioReason = String(formData.get("portfolio_not_uploaded_reason") || "").trim();
    if (cv && cv.size > 2 * 1024 * 1024) {
      setError("CV file is too large. Max 2MB.");
      return;
    }
    if (portfolio && portfolio.size > 10 * 1024 * 1024) {
      setError("Portfolio file is too large. Max 10MB.");
      return;
    }
    const hasPortfolio = Boolean(portfolio && portfolio.size > 0) || Boolean(portfolioName);
    if (!hasPortfolio && !portfolioReason) {
      setError("Please provide a reason if you are not uploading a portfolio.");
      return;
    }

    setSubmitting(true);
    setError(null);

    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();

    let res: Response;
    try {
      res = await fetch(`${apiBase}/api/apply/${openingCode}`, {
        method: "POST",
        body: formData,
        headers: { "Idempotency-Key": idempotencyKeyRef.current },
      });
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
      return;
    }

    const rawText = await res.text();
    if (!res.ok) {
      let message = "Application submission failed";
      try {
        const body = rawText ? (JSON.parse(rawText) as any) : null;
        if (body?.detail) message = String(body.detail);
        else if (body?.message) message = String(body.message);
        else if (body) message = JSON.stringify(body);
        else if (rawText) message = rawText;
      } catch {
        if (rawText) message = rawText;
      }
      setError(message);
      idempotencyKeyRef.current = null;
      setSubmitting(false);
      return;
    }

    try {
      const body = rawText ? (JSON.parse(rawText) as any) : null;
      setAlreadyApplied(Boolean(body?.already_applied));
      setCandidateCode(body?.candidate_code ? String(body.candidate_code) : null);
    } catch {
      setAlreadyApplied(false);
      setCandidateCode(null);
    }
    setSubmitted(true);
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="glass-panel p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500/90 to-cyan-500/80 text-white shadow-lg">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{alreadyApplied ? "Application already received" : "Application submitted"}</h2>
            <p className="mt-2 text-[13px] text-[var(--text-secondary)]">Thank you for your interest in this opportunity.</p>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              {alreadyApplied
                ? "We already have your application for this role. Our team will continue with the existing submission."
                : "Your application has been received and is currently under review."}
            </p>
            {candidateCode ? (
              <p className="mt-3 text-[13px] text-[var(--text-secondary)]">
                Candidate code: <span className="font-semibold text-slate-900">{candidateCode}</span>
              </p>
            ) : null}
            <p className="mt-4 text-[13px] text-[var(--text-secondary)]">You can expect to hear from us within 24-48 business hours.</p>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">Please do not submit another application for the same role.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      className="glass-panel relative overflow-hidden border border-white/60 bg-white/60 p-0 text-[13px] shadow-xl backdrop-blur"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="relative border-b border-slate-200/70 bg-white/75 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Apply</p>
            <p className="text-[13px] font-semibold text-slate-900">Application form</p>
          </div>
          <p className="text-[11px] text-slate-600">CV 2MB / Portfolio 10MB</p>
        </div>
      </div>

      <div className="grid gap-4 p-4 pb-20 lg:grid-cols-2">
        <section className="space-y-4">
          <Group title="Basics">
            <div className="grid gap-3 md:grid-cols-2">
              <Field dense label="Full name">
              <input
                name="name"
                required
                className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
                placeholder="Your name"
              />
              </Field>
              <Field dense label="Email">
              <input
                name="email"
                required
                type="email"
                className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
                placeholder="you@email.com"
              />
              </Field>
              <Field dense label="Phone">
              <input
                name="phone"
                className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
                placeholder="+91"
              />
              </Field>
              <Field dense label="LinkedIn (optional)">
              <input
                name="linkedin"
                className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
                placeholder="https://linkedin.com/in/"
              />
              </Field>
            </div>
          </Group>

          <Group title="Documents">
            <div className="grid gap-4 md:grid-cols-2">
            <FilePicker
              label="Upload CV"
              helper="PDF/DOC/DOCX"
              name="cv_file"
              accept=".pdf,.doc,.docx"
              filename={cvName}
              onPick={(value) => {
                setCvName(value);
                if (value) setError(null);
              }}
              icon={<FileText className="h-4 w-4 text-blue-600" />}
            />
            <FilePicker
              label="Portfolio (optional)"
              helper="PDF/PPT/PPTX/ZIP"
              name="portfolio_file"
              accept=".pdf,.ppt,.pptx,.zip"
              filename={portfolioName}
              onPick={(value) => {
                setPortfolioName(value);
                if (value) setError(null);
              }}
              icon={<Briefcase className="h-4 w-4 text-cyan-600" />}
            />
            </div>

            {!portfolioName ? (
              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-[var(--text-secondary)]">If you are not uploading a portfolio, please share a reason</span>
                <textarea
                  name="portfolio_not_uploaded_reason"
                  required
                  rows={2}
                  onChange={(e) => {
                    if (e.target.value.trim()) setError(null);
                  }}
                  className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-[13px] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
                  placeholder="e.g. NDA / work is confidential / still compiling / no portfolio available"
                />
              </label>
            ) : (
              <input type="hidden" name="portfolio_not_uploaded_reason" value="" />
            )}
          </Group>
        </section>

        <section className="space-y-5">
          <Group title="CAF (Quick Screening)">
            <div className="grid gap-3 md:grid-cols-2">
            <Field dense label="Current City">
              <input
                name="current_city"
                className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
                placeholder="Delhi"
              />
            </Field>
            <Field dense label="Current Employer (if any)">
              <input
                name="current_employer"
                className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
                placeholder="Company name"
              />
            </Field>
            <Field dense label="Total experience (years)">
              <input
                name="total_experience_years"
                type="number"
                step="0.1"
                className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
              />
            </Field>
            <Field dense label="Relevant experience (years)">
              <input
                name="relevant_experience_years"
                type="number"
                step="0.1"
                className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
              />
            </Field>
            <Field dense label="Current CTC (annual)">
              <input
                name="current_ctc_annual"
                type="number"
                step="0.01"
                className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
              />
            </Field>
            <Field dense label="Expected CTC (annual)">
              <input
                name="expected_ctc_annual"
                type="number"
                step="0.01"
                className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
              />
            </Field>
            <div className="md:col-span-2">
              <Field dense label="Willing to Relocate Delhi?">
                <select
                  name="willing_to_relocate"
                  className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
                >
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field dense label="Commit to a 2-year tenure with our organisation?">
                <select
                  name="two_year_commitment"
                  required
                  className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
                >
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
            </div>
            <Field dense label="Notice period (days)">
              <input
                name="notice_period_days"
                type="number"
                className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
              />
            </Field>
            <Field dense label="Expected joining date">
              <input
                name="expected_joining_date"
                type="date"
                className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
              />
            </Field>
            <Field dense label="Relocation notes (optional)">
              <input
                name="relocation_notes"
                className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1.5 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
              />
            </Field>
          </div>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-[var(--text-secondary)]">Reason for job change</span>
            <textarea
              name="reason_for_job_change"
              rows={2}
              className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-[13px] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
              placeholder="Briefly share why you are exploring a change"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-[var(--text-secondary)]">Anything you want us to know?</span>
            <textarea
              name="questions_from_candidate"
              rows={2}
              className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-[13px] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
              placeholder="Portfolio highlights, preferences, questions..."
            />
          </label>

          </Group>
        </section>
      </div>

      <div className="absolute inset-x-0 bottom-0 border-t border-white/50 bg-white/35 p-3 backdrop-blur">
        {error ? <p className="mb-2 text-[12px] text-red-500">{error}</p> : null}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-600">Basics / Documents / CAF</p>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-900 to-blue-800 px-4 py-2 text-[13px] font-semibold text-white shadow-card hover:from-slate-900 hover:to-blue-900 disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                Submitting...
              </>
            ) : (
              <>
                <CalendarClock className="h-4 w-4" />
                Submit
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  icon,
  dense = false,
}: {
  label: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  dense?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
        {icon ? (
          <span className={`inline-flex items-center justify-center rounded-xl bg-white/40 ${dense ? "h-6 w-6" : "h-7 w-7"}`}>
            {icon}
          </span>
        ) : null}
        {label}
      </span>
      {children}
    </label>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white/70 p-3 shadow-sm transition duration-200 hover:border-slate-200/80 hover:bg-white/80 focus-within:border-cyan-300/70 focus-within:ring-2 focus-within:ring-cyan-500/15">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-wide text-slate-600">{title}</p>
        <span className="h-px flex-1 bg-gradient-to-r from-slate-200/40 via-slate-200/10 to-transparent" />
      </div>
      {children}
    </section>
  );
}

function FilePicker({
  label,
  helper,
  name,
  accept,
  filename,
  onPick,
  icon,
}: {
  label: string;
  helper: string;
  name: string;
  accept: string;
  filename: string;
  onPick: (value: string) => void;
  icon: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="flex items-center justify-between gap-3 text-[12px] font-medium text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-white/40">{icon}</span>
          {label}
        </span>
        <span className="text-[11px] text-slate-500">{helper}</span>
      </span>
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200/70 bg-white/70 px-3 py-2 shadow-sm">
        <input
          name={name}
          type="file"
          accept={accept}
          className="w-full text-[13px] file:mr-3 file:rounded-lg file:border-0 file:bg-white/70 file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-slate-800 hover:file:bg-white"
          onChange={(e) => {
            const f = e.target.files?.[0];
            onPick(f ? f.name : "");
          }}
        />
      </div>
      {filename ? <p className="text-[11px] text-slate-600">Selected: {filename}</p> : null}
    </label>
  );
}

