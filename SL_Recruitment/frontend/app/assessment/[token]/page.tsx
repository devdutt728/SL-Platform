import { internalUrl } from "@/lib/internal";
import { CandidateAssessmentPrefill } from "@/lib/types";
import { AssessmentForm } from "./ui";

async function fetchPrefill(token: string) {
  const res = await fetch(await internalUrl(`/api/assessment/${token}`), { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as CandidateAssessmentPrefill;
}

export default async function AssessmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const prefill = await fetchPrefill(token);

  if (!prefill) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 px-4 py-10">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)]/70 p-6 shadow-card">
          <p className="text-xs uppercase tracking-tight text-[var(--text-secondary)]">CAF</p>
          <h1 className="text-2xl font-semibold">Invalid or expired link</h1>
          <p className="text-sm text-[var(--text-secondary)]">Please check the URL or contact HR.</p>
        </div>
      </main>
    );
  }

  if (prefill.assessment_submitted_at) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 px-4 py-10">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)]/70 p-6 shadow-card">
          <p className="text-xs uppercase tracking-tight text-[var(--text-secondary)]">Candidate Assessment Form</p>
          <h1 className="text-2xl font-semibold">{prefill.opening_title || "Studio Lotus"}</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">This CAF has already been submitted.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 px-4 py-10">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)]/70 p-6 shadow-card">
        <p className="text-xs uppercase tracking-tight text-[var(--text-secondary)]">Candidate Assessment Form (CAF)</p>
        <h1 className="text-2xl font-semibold">{prefill.opening_title || "Studio Lotus"}</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Please complete the form below to finish your application.
        </p>
        {prefill.opening_description ? (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Role description</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{prefill.opening_description}</p>
          </div>
        ) : null}
      </div>

      <AssessmentForm token={token} prefill={prefill} />
    </main>
  );
}
