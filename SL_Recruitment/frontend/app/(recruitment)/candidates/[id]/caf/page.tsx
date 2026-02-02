import Link from "next/link";
import { cookieHeader } from "@/lib/cookie-header";
import { notFound } from "next/navigation";
import { CandidateFull } from "@/lib/types";
import { internalUrl } from "@/lib/internal";
import { parseDateUtc } from "@/lib/datetime";

type Me = {
  platform_role_id?: number | null;
  platform_role_code?: string | null;
};

async function fetchCandidateFull(id: string): Promise<CandidateFull | null> {
  const url = await internalUrl(`/api/rec/candidates/${encodeURIComponent(id)}/full`);
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return null;
  return (await res.json()) as CandidateFull;
}

async function fetchMe(): Promise<Me | null> {
  const url = await internalUrl("/api/auth/me");
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return null;
  try {
    return (await res.json()) as Me;
  } catch {
    return null;
  }
}

function labelValue(label: string, value: string) {
  return (
    <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default async function CandidateCafPage({ params }: { params: { id: string } }) {
  const [full, me] = await Promise.all([fetchCandidateFull(params.id), fetchMe()]);
  if (!full) notFound();

  const candidate = full.candidate;
  const screening = full.screening;
  const canDelete = (me?.platform_role_id ?? null) === 2 || (me?.platform_role_code ?? "").trim() === "2";

  return (
    <main className="content-pad space-y-4">
      <div className="section-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-tight text-slate-500">CAF (read-only)</p>
            <h1 className="mt-1 truncate text-2xl font-semibold">{candidate.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {candidate.candidate_code} - {candidate.opening_title || "Not linked"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/candidates/${encodeURIComponent(params.id)}`}
              className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-white"
            >
              Back
            </Link>
            {candidate.cv_url ? (
              <a
                href={candidate.cv_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-600 to-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-card hover:from-cyan-700 hover:to-violet-700"
              >
                Open CV
              </a>
            ) : null}
            {candidate.drive_folder_url ? (
              <a
                href={candidate.drive_folder_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-white"
              >
                Drive folder
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {labelValue("Email", candidate.email || "-")}
          {labelValue("Phone", candidate.phone || "-")}
          {labelValue("CAF status", candidate.caf_submitted_at ? "Submitted" : candidate.caf_sent_at ? "Sent" : "Not sent")}
          {labelValue(
            "Submitted at",
            candidate.caf_submitted_at
              ? (parseDateUtc(candidate.caf_submitted_at)?.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) ?? "-")
              : "-"
          )}
        </div>

        {!screening ? (
          <div className="mt-4 rounded-2xl border border-white/60 bg-white/30 p-4">
            <p className="text-sm font-semibold">No CAF submission yet</p>
            <p className="mt-1 text-sm text-slate-600">Use "Copy CAF link" to send the candidate their CAF link.</p>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/60 bg-white/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Submitted responses</p>
              <span className="rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-slate-800">
                {screening.screening_result || "-"}
              </span>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {labelValue("Current city", screening.current_city ? String(screening.current_city) : "-")}
              {labelValue("Employer", screening.current_employer ? String(screening.current_employer) : "-")}
              {labelValue("Total exp (yrs)", screening.total_experience_years != null ? String(screening.total_experience_years) : "-")}
              {labelValue("Relevant exp (yrs)", screening.relevant_experience_years != null ? String(screening.relevant_experience_years) : "-")}
              {labelValue("Notice (days)", screening.notice_period_days != null ? String(screening.notice_period_days) : "-")}
              {labelValue("Expected CTC", screening.expected_ctc_annual != null ? String(screening.expected_ctc_annual) : "-")}
              {labelValue("Relocate", screening.willing_to_relocate == null ? "-" : screening.willing_to_relocate ? "Yes" : "No")}
              {labelValue(
                "2-year commitment",
                screening.two_year_commitment == null ? "-" : screening.two_year_commitment ? "Yes" : "No"
              )}
              {labelValue("Joining date", screening.expected_joining_date ? String(screening.expected_joining_date) : "-")}
              {labelValue("Job change", screening.reason_for_job_change ? String(screening.reason_for_job_change) : "-")}
            </div>

            <div className="mt-3 grid gap-3">
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Relocation notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{screening.relocation_notes || "-"}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Questions</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{screening.questions_from_candidate || "-"}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Screening notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{screening.screening_notes || "-"}</p>
              </div>
            </div>
          </div>
        )}

        {!canDelete ? (
          <p className="mt-3 text-xs text-slate-500">CAF is read-only for non-superadmin users.</p>
        ) : (
          <p className="mt-3 text-xs text-slate-500">Superadmin can update CAF via admin tools (UI not added yet).</p>
        )}
      </div>
    </main>
  );
}


