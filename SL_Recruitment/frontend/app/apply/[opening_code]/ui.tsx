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

  const inputClass =
    "w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-[13px] text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20";

  if (submitted) {
    return (
      <div className="relative rounded-[32px] bg-gradient-to-br from-cyan-400/60 via-blue-400/40 to-emerald-400/50 p-[1px] shadow-[0_32px_70px_-60px_rgba(14,116,144,0.6)]">
        <div className="rounded-[31px] bg-white/90 p-6 backdrop-blur-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-400 to-cyan-400 text-slate-900 shadow-[0_0_26px_rgba(16,185,129,0.35)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {alreadyApplied ? "Application already received" : "Application submitted"}
              </h2>
              <p className="mt-2 text-[13px] text-slate-600">
                Thank you for your interest in this opportunity. Our team will review the details and move you forward
                if there is a match.
              </p>
              <p className="mt-1 text-[13px] text-slate-600">
                {alreadyApplied
                  ? "We already have your application for this role. The existing submission remains active."
                  : "Your application has been received and is now in review."}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <span className="rounded-full border border-emerald-200/70 bg-emerald-50 px-3 py-1 text-emerald-700">
                  {alreadyApplied ? "Already received" : "Received"}
                </span>
                {candidateCode ? (
                  <span className="rounded-full border border-slate-200/70 bg-white px-3 py-1 text-slate-900">
                    Candidate code: <span className="font-semibold">{candidateCode}</span>
                  </span>
                ) : null}
              </div>
              <p className="mt-4 text-[13px] text-slate-600">You can expect to hear from us within 24-48 business hours.</p>
              <p className="mt-1 text-[13px] text-slate-600">Please do not submit another application for the same role.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-[36px] bg-gradient-to-br from-cyan-400/60 via-blue-400/40 to-emerald-400/50 p-[1px] shadow-[0_40px_90px_-70px_rgba(14,116,144,0.6)]">
      <form
        className="relative overflow-hidden rounded-[35px] bg-white/90 text-[13px] backdrop-blur-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit(new FormData(e.currentTarget));
        }}
      >
        <div className="relative border-b border-slate-200/70 bg-white/70 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-[180px]">
              <p className="text-[10px] uppercase tracking-[0.4em] text-cyan-700/70">Apply</p>
              <p className="text-[14px] font-semibold text-slate-900">Candidate intake console</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              <span className="rounded-full border border-cyan-200/70 bg-cyan-50 px-3 py-1 text-cyan-700">CV 2MB</span>
              <span className="rounded-full border border-emerald-200/70 bg-emerald-50 px-3 py-1 text-emerald-700">
                Portfolio 10MB
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-6 pb-24">
          <section className="space-y-4">
            <Group title="Basics">
              <div className="grid gap-3 md:grid-cols-2">
                <Field dense label="Full name">
                  <input name="name" required className={inputClass} placeholder="Your name" />
                </Field>
                <Field dense label="Email">
                  <input name="email" required type="email" className={inputClass} placeholder="you@email.com" />
                </Field>
                <Field dense label="Phone">
                  <input name="phone" className={inputClass} placeholder="+91" />
                </Field>
                <Field dense label="Willing to Relocate to Delhi?">
                  <select name="willing_to_relocate" className={inputClass}>
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
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
                  icon={<FileText className="h-4 w-4 text-cyan-300" />}
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
                  icon={<Briefcase className="h-4 w-4 text-emerald-300" />}
                />
              </div>

              {!portfolioName ? (
                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-slate-600">
                    If you are not uploading a portfolio, please share a reason
                  </span>
                  <textarea
                    name="portfolio_not_uploaded_reason"
                    required
                    rows={2}
                    onChange={(e) => {
                      if (e.target.value.trim()) setError(null);
                    }}
                    className={inputClass}
                    placeholder="e.g. NDA / work is confidential / still compiling / no portfolio available"
                  />
                </label>
              ) : (
                <input type="hidden" name="portfolio_not_uploaded_reason" value="" />
              )}
            </Group>

            <Group title="Additional">
              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-slate-600">Anything you want us to know?</span>
                <textarea
                  name="questions_from_candidate"
                  rows={6}
                  className={inputClass}
                  placeholder="Portfolio highlights, preferences, questions..."
                />
              </label>
              <div className="mt-4 rounded-2xl border border-cyan-200/70 bg-cyan-50/70 p-4">
                <p className="text-[10px] uppercase tracking-[0.4em] text-cyan-700/70">Next steps</p>
                <p className="mt-2 text-[12px] text-slate-600">
                  Submit the form below. We will share the assessment link after review.
                </p>
              </div>
            </Group>
          </section>
        </div>

        <div className="absolute inset-x-0 bottom-0 border-t border-slate-200/70 bg-white/85 p-4 backdrop-blur-2xl">
          {error ? (
            <div className="mb-3 rounded-xl border border-rose-200/70 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">Basics / Documents / Additional</p>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 via-sky-500 to-emerald-400 px-4 py-2 text-[13px] font-semibold text-white shadow-[0_16px_30px_-18px_rgba(14,116,144,0.6)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-18px_rgba(14,116,144,0.7)] disabled:opacity-60"
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
    </div>
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
      <span className="flex items-center gap-2 text-[12px] font-medium text-slate-600">
        {icon ? (
          <span
            className={`inline-flex items-center justify-center rounded-xl border border-cyan-200/70 bg-cyan-50 ${
              dense ? "h-6 w-6" : "h-7 w-7"
            }`}
          >
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
    <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-[0_22px_50px_-40px_rgba(15,23,42,0.35)] transition duration-200 hover:border-slate-200 hover:bg-white focus-within:border-cyan-400/70 focus-within:ring-2 focus-within:ring-cyan-500/20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-700/70">{title}</p>
        <span className="h-px flex-1 bg-gradient-to-r from-cyan-300/60 via-slate-200/60 to-transparent" />
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
      <span className="flex items-center justify-between gap-3 text-[12px] font-medium text-slate-600">
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-slate-200/70 bg-slate-50">
            {icon}
          </span>
          {label}
        </span>
        <span className="text-[11px] text-slate-500">{helper}</span>
      </span>
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-cyan-300/70 bg-slate-50 px-3 py-2">
        <input
          name={name}
          type="file"
          accept={accept}
          className="w-full text-[13px] text-slate-700 file:mr-3 file:rounded-lg file:border file:border-cyan-200/70 file:bg-cyan-50 file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-cyan-700 hover:file:bg-cyan-100"
          onChange={(e) => {
            const f = e.target.files?.[0];
            onPick(f ? f.name : "");
          }}
        />
      </div>
      {filename ? <p className="text-[11px] text-cyan-700/80">Selected: {filename}</p> : null}
    </label>
  );
}
