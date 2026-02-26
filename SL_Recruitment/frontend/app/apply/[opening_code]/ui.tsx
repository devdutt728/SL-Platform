"use client";

import { useRef, useState, type ReactNode } from "react";
import { Briefcase, CalendarClock, FileText, ShieldCheck } from "lucide-react";

const inputClass =
  "w-full rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white px-3.5 py-2.5 text-[13px] text-[var(--dim-grey)] outline-none transition placeholder:text-[var(--light-grey)] focus:border-[var(--accessible-components--dodger-blue)] focus:ring-4 focus:ring-[rgba(19,120,209,0.14)]";

const pillClass =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--accessible-components--dark-grey)] bg-white px-3 py-1 text-[11px] font-medium text-[var(--dim-grey)]";

const submitClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accessible-components--dodger-blue)] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_16px_30px_-20px_rgba(19,120,209,0.9)] transition hover:-translate-y-0.5 hover:brightness-95 hover:shadow-[0_20px_34px_-18px_rgba(19,120,209,0.95)] disabled:opacity-60";

export function ApplyForm({ openingCode }: { openingCode: string }) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const runtimeBasePath =
    typeof window !== "undefined" && window.location.pathname.startsWith("/recruitment") ? "/recruitment" : "";
  const apiBase = basePath || runtimeBasePath;
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [alreadyApplied, setAlreadyApplied] = useState<boolean>(false);
  const [reapplied, setReapplied] = useState<boolean>(false);
  const [candidateCode, setCandidateCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cvName, setCvName] = useState<string>("");
  const [portfolioName, setPortfolioName] = useState<string>("");
  const [resumeName, setResumeName] = useState<string>("");
  const idempotencyKeyRef = useRef<string | null>(null);

  async function onSubmit(formData: FormData) {
    const cvRaw = formData.get("cv_file");
    const portfolioRaw = formData.get("portfolio_file");
    const resumeRaw = formData.get("resume_file");
    const cv = cvRaw instanceof File && cvRaw.size > 0 ? cvRaw : null;
    const portfolio = portfolioRaw instanceof File && portfolioRaw.size > 0 ? portfolioRaw : null;
    const resume = resumeRaw instanceof File && resumeRaw.size > 0 ? resumeRaw : null;
    const termsChecked = String(formData.get("terms_consent") || "").trim().toLowerCase() === "on";

    if (cv && cv.size > 2 * 1024 * 1024) {
      setError("CV file is too large. Max 2MB.");
      return;
    }
    if (resume && resume.size > 2 * 1024 * 1024) {
      setError("Resume file is too large. Max 2MB.");
      return;
    }
    if (portfolio && portfolio.size > 10 * 1024 * 1024) {
      setError("Portfolio file is too large. Max 10MB.");
      return;
    }

    const hasPortfolio = Boolean(portfolio && portfolio.size > 0) || Boolean(portfolioName);
    if (!hasPortfolio) {
      setError("Portfolio is mandatory.");
      return;
    }
    if (!termsChecked) {
      setError("Please accept the consent terms to continue.");
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
        const body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
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
      const body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
      setAlreadyApplied(Boolean(body?.already_applied));
      setReapplied(Boolean(body?.reapplied));
      setCandidateCode(body?.candidate_code ? String(body.candidate_code) : null);
    } catch {
      setAlreadyApplied(false);
      setReapplied(false);
      setCandidateCode(null);
    }

    setSubmitted(true);
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="rounded-[28px] border border-[var(--accessible-components--dark-grey)] bg-white p-6 shadow-[var(--shadow-soft)]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(231,64,17,0.12)] text-[var(--brand-color)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--dim-grey)]">
              {alreadyApplied ? "Application already received" : reapplied ? "Application re-submitted" : "Application submitted"}
            </h2>
            <p className="mt-2 text-[13px] text-[var(--dim-grey)]">
              Thank you for your interest. The hiring team has received your submission and will review it shortly.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={pillClass}>{alreadyApplied ? "Already received" : reapplied ? "Re-applied" : "Received"}</span>
              {candidateCode ? (
                <span className={pillClass}>
                  Candidate code: <span className="font-semibold text-[var(--dim-grey)]">{candidateCode}</span>
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-[13px] text-[var(--dim-grey)]">
              {alreadyApplied
                ? "You already applied for this role in the last 24 hours. Please reapply after 24 hours if needed."
                : "You can reapply for the same role after 24 hours if your profile has updates."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      className="overflow-hidden rounded-[30px] border border-[var(--accessible-components--dark-grey)] bg-white shadow-[var(--shadow-soft)]"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="border-b border-[var(--accessible-components--dark-grey)] bg-[rgba(19,120,209,0.05)] px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[180px]">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">Apply</p>
            <p className="text-[16px] font-semibold text-[var(--dim-grey)]">Candidate intake console</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={pillClass}>CV 2MB</span>
            <span className={pillClass}>Resume 2MB</span>
            <span className={pillClass}>Portfolio 10MB</span>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5 lg:p-6">
        <Group index="01" title="Basics" subtitle="Identity and professional details" className="motion-fade-up">
          <div className="grid gap-3 md:grid-cols-2">
            <Field dense label="First name">
              <input name="first_name" required className={inputClass} placeholder="First name" />
            </Field>
            <Field dense label="Last name">
              <input name="last_name" required className={inputClass} placeholder="Last name" />
            </Field>
            <Field dense label="Email">
              <input name="email" required type="email" className={inputClass} placeholder="you@email.com" />
            </Field>
            <Field dense label="Phone">
              <input name="phone" className={inputClass} placeholder="+91" />
            </Field>
            <Field dense label="Educational Qualification">
              <input
                name="educational_qualification"
                required
                className={inputClass}
                placeholder="e.g. B.Arch, B.Tech, M.Des"
              />
            </Field>
            <Field dense label="Years of experience">
              <input
                name="years_of_experience"
                required
                type="number"
                min="0"
                step="0.1"
                className={inputClass}
                placeholder="e.g. 5"
              />
            </Field>
            <Field dense label="City">
              <input name="city" required className={inputClass} placeholder="Current city" />
            </Field>
            <Field dense label="Willing to relocate to Delhi?">
              <select name="willing_to_relocate" className={inputClass}>
                <option value="">Select</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
          </div>
        </Group>

        <Group
          index="02"
          title="Documents"
          subtitle="Upload complete set for faster screening"
          className="motion-fade-up motion-delay-1"
        >
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
              icon={<FileText className="h-4 w-4 text-[var(--brand-color)]" />}
            />
            <FilePicker
              label="Upload Resume"
              helper="PDF/DOC/DOCX"
              name="resume_file"
              accept=".pdf,.doc,.docx"
              filename={resumeName}
              onPick={(value) => {
                setResumeName(value);
                if (value) setError(null);
              }}
              icon={<FileText className="h-4 w-4 text-[var(--accessible-components--dodger-blue)]" />}
            />
            <FilePicker
              label="Portfolio (mandatory)"
              helper="PDF/PPT/PPTX/ZIP"
              name="portfolio_file"
              accept=".pdf,.ppt,.pptx,.zip"
              required
              filename={portfolioName}
              onPick={(value) => {
                setPortfolioName(value);
                if (value) setError(null);
              }}
              icon={<Briefcase className="h-4 w-4 text-[var(--accessible-components--dodger-blue)]" />}
            />
          </div>
        </Group>

        <Group
          index="03"
          title="Consent"
          subtitle="Privacy and data processing acknowledgment"
          className="motion-fade-up motion-delay-2"
        >
          <label className="flex items-start gap-3 rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white px-3.5 py-3.5">
            <input
              type="checkbox"
              required
              name="terms_consent"
              className="mt-0.5 h-4 w-4 rounded border-[var(--accessible-components--dark-grey)] text-[var(--brand-color)]"
            />
            <span className="text-[12px] leading-relaxed text-[var(--dim-grey)]">
              I give my consent for my data to be held by Studio Lotus for the purposes of recruitment. Studio Lotus is
              committed to protecting and respecting your privacy. The data you provide will be securely stored and used
              only for recruitment purposes.
            </span>
          </label>
        </Group>

        <Group
          index="04"
          title="Additional"
          subtitle="Optional context for the hiring team"
          className="motion-fade-up motion-delay-3"
        >
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-[var(--dim-grey)]">Anything you want us to know?</span>
            <textarea
              name="questions_from_candidate"
              rows={5}
              className={inputClass}
              placeholder="Portfolio highlights, preferences, questions..."
            />
          </label>
          <div className="rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white p-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">Next steps</p>
            <p className="mt-2 text-[12px] text-[var(--dim-grey)]">
              Submit the form below. We will share the assessment link once your profile is reviewed.
            </p>
          </div>
        </Group>
      </div>

      <div className="border-t border-[var(--accessible-components--dark-grey)] bg-white p-4 sm:px-5">
        {error ? (
          <div className="mb-3 rounded-xl border border-[rgba(231,64,17,0.35)] bg-[rgba(231,64,17,0.1)] px-3 py-2 text-[12px] text-[var(--brand-color)]">
            {error}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-[var(--dim-grey)]">Sections: Basics / Documents / Consent / Additional</p>
          <button className={submitClass} disabled={submitting} type="submit">
            {submitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                Submitting...
              </>
            ) : (
              <>
                <CalendarClock className="h-4 w-4" />
                Submit application
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
  children: ReactNode;
  icon?: ReactNode;
  dense?: boolean;
}) {
  return (
    <label className="space-y-1.5">
      <span className="flex items-center gap-2 text-[12px] font-semibold text-[var(--dim-grey)]">
        {icon ? (
          <span
            className={`inline-flex items-center justify-center rounded-xl border border-[var(--accessible-components--dark-grey)] bg-white ${
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

function Group({
  index,
  title,
  subtitle,
  children,
  className = "",
}: {
  index: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[22px] border border-[var(--accessible-components--dark-grey)] bg-white p-4 transition duration-200 focus-within:border-[var(--accessible-components--dodger-blue)] focus-within:ring-4 focus-within:ring-[rgba(19,120,209,0.12)] sm:p-5 ${className}`}
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(19,120,209,0.12)] text-[11px] font-semibold text-[var(--accessible-components--dodger-blue)]">
          {index}
        </span>
        <div>
          <p className="text-[12px] font-semibold text-[var(--dim-grey)]">{title}</p>
          {subtitle ? <p className="text-[11px] text-[var(--dim-grey)]">{subtitle}</p> : null}
        </div>
        <span className="h-px flex-1 bg-gradient-to-r from-[rgba(19,120,209,0.35)] via-[rgba(209,209,209,0.7)] to-transparent" />
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
  required = false,
  filename,
  onPick,
  icon,
}: {
  label: string;
  helper: string;
  name: string;
  accept: string;
  required?: boolean;
  filename: string;
  onPick: (value: string) => void;
  icon: ReactNode;
}) {
  return (
    <label className="space-y-2.5">
      <span className="flex items-center justify-between gap-3 text-[12px] font-semibold text-[var(--dim-grey)]">
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--accessible-components--dark-grey)] bg-white">
            {icon}
          </span>
          {label}
        </span>
        <span className="text-[11px] text-[var(--light-grey)]">{helper}</span>
      </span>
      <div className="rounded-2xl border border-dashed border-[var(--accessible-components--dark-grey)] bg-white px-3 py-2.5 transition hover:border-[var(--accessible-components--dodger-blue)] focus-within:border-[var(--accessible-components--dodger-blue)]">
        <input
          name={name}
          type="file"
          required={required}
          accept={accept}
          className="w-full text-[13px] text-[var(--dim-grey)] file:mr-3 file:rounded-full file:border-0 file:bg-[rgba(19,120,209,0.14)] file:px-3.5 file:py-1.5 file:text-[11px] file:font-semibold file:text-[var(--accessible-components--dodger-blue)] hover:file:bg-[rgba(19,120,209,0.2)]"
          onChange={(e) => {
            const f = e.target.files?.[0];
            onPick(f ? f.name : "");
          }}
        />
      </div>
      {filename ? (
        <p className="text-[11px] text-[var(--dim-grey)]">
          Selected: <span className="font-semibold text-[var(--dim-grey)]">{filename}</span>
        </p>
      ) : (
        <p className="text-[11px] text-[var(--light-grey)]">No file selected yet.</p>
      )}
    </label>
  );
}
