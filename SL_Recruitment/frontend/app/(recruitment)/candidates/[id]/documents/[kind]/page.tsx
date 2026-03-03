import Link from "next/link";
import { notFound } from "next/navigation";

const ALLOWED_KINDS = new Set(["cv", "resume", "portfolio"]);

export default async function CandidateDocumentPreviewPage({
  params,
}: {
  params: Promise<{ id: string; kind: string }>;
}) {
  const { id, kind } = await params;
  const normalizedKind = (kind || "").trim().toLowerCase();
  if (!ALLOWED_KINDS.has(normalizedKind)) notFound();

  const streamUrl = `/api/rec/candidates/${encodeURIComponent(id)}/documents/${encodeURIComponent(normalizedKind)}`;
  const downloadUrl = `${streamUrl}?download=true`;
  const title = normalizedKind === "cv" ? "CV" : normalizedKind === "resume" ? "Resume" : "Portfolio";

  return (
    <main className="content-pad space-y-3">
      <div className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-tight text-slate-500">Candidate document preview</p>
            <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/candidates/${encodeURIComponent(id)}`}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Back to candidate
            </Link>
            <a
              href={downloadUrl}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Download
            </a>
          </div>
        </div>
      </div>
      <section className="section-card overflow-hidden">
        <iframe
          title={`${title} preview`}
          src={streamUrl}
          className="h-[72vh] w-full rounded-2xl border border-slate-200 bg-white"
        />
      </section>
    </main>
  );
}
