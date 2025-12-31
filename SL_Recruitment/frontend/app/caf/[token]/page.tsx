import { internalUrl } from "@/lib/internal";
import { CafPrefill, Screening } from "@/lib/types";
import { CafForm } from "./ui";

async function fetchPrefill(token: string) {
  const res = await fetch(internalUrl(`/api/caf/${token}`), { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as CafPrefill;
}

async function fetchScreening(token: string) {
  const res = await fetch(internalUrl(`/api/caf/${token}/screening`), { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as Screening;
}

export default async function CafPage({ params }: { params: { token: string } }) {
  const prefill = await fetchPrefill(params.token);

  if (!prefill) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-10">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)]/70 p-6 shadow-card">
          <p className="text-xs uppercase tracking-tight text-[var(--text-secondary)]">CAF</p>
          <h1 className="text-2xl font-semibold">Invalid or expired link</h1>
          <p className="text-sm text-[var(--text-secondary)]">Please check the URL or contact HR.</p>
        </div>
      </main>
    );
  }

  if (prefill.caf_submitted_at) {
    const screening = await fetchScreening(params.token);
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-10">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)]/70 p-6 shadow-card">
          <p className="text-xs uppercase tracking-tight text-[var(--text-secondary)]">CAF</p>
          <h1 className="text-2xl font-semibold">{prefill.opening_title || "Studio Lotus"}</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">This CAF has already been submitted and is now read-only.</p>

          <div className="mt-4 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Candidate</p>
              <p className="text-sm font-semibold">{prefill.name}</p>
              <p className="text-xs text-[var(--text-secondary)]">{prefill.candidate_code}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)]/60 p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Email</p>
                <p className="mt-1 truncate text-sm font-semibold">{prefill.email}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)]/60 p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Phone</p>
                <p className="mt-1 truncate text-sm font-semibold">{prefill.phone || "—"}</p>
              </div>
            </div>
            {prefill.cv_url ? (
              <a
                href={prefill.cv_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-card hover:from-cyan-700 hover:to-violet-700"
              >
                Open uploaded CV
              </a>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)]/70 p-6 shadow-card">
          <p className="text-xs uppercase tracking-tight text-[var(--text-secondary)]">Submitted data</p>
          {screening ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)]/60 p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Total experience</p>
                <p className="mt-1 text-sm font-semibold">{screening.total_experience_years ?? "—"}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)]/60 p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Relevant experience</p>
                <p className="mt-1 text-sm font-semibold">{screening.relevant_experience_years ?? "—"}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)]/60 p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Current CTC</p>
                <p className="mt-1 text-sm font-semibold">{screening.current_ctc_annual ?? "—"}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)]/60 p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Expected CTC</p>
                <p className="mt-1 text-sm font-semibold">{screening.expected_ctc_annual ?? "—"}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)]/60 p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Notice period (days)</p>
                <p className="mt-1 text-sm font-semibold">{screening.notice_period_days ?? "—"}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)]/60 p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Relocate</p>
                <p className="mt-1 text-sm font-semibold">
                  {screening.willing_to_relocate == null ? "—" : screening.willing_to_relocate ? "Yes" : "No"}
                </p>
              </div>
              <div className="sm:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)]/60 p-3">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{screening.screening_notes || "—"}</p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">No screening details found.</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-10">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)]/70 p-6 shadow-card">
        <p className="text-xs uppercase tracking-tight text-[var(--text-secondary)]">Candidate Application Form</p>
        <h1 className="text-2xl font-semibold">{prefill.opening_title || "Studio Lotus"}</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          This helps us quickly understand fit and schedule the next steps.
        </p>
        {prefill.opening_description ? (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Role description</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{prefill.opening_description}</p>
          </div>
        ) : null}
      </div>

      <CafForm token={params.token} prefill={prefill} />
    </main>
  );
}
