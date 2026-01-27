import { internalUrl } from "@/lib/internal";
import { parseDateUtc } from "@/lib/datetime";
import { SprintPublicClient } from "./SprintPublicClient";

type SprintPublic = {
  candidate_id: number;
  candidate_name: string;
  opening_title?: string | null;
  sprint_template_id: number;
  template_name?: string | null;
  template_description?: string | null;
  instructions_url?: string | null;
  due_at?: string | null;
  status: string;
  submission_url?: string | null;
  submitted_at?: string | null;
  attachments?: SprintAttachment[];
};

type SprintAttachment = {
  sprint_attachment_id: number;
  file_name: string;
  content_type?: string | null;
  file_size?: number | null;
  download_url: string;
};

async function fetchSprint(token: string) {
  const res = await fetch(internalUrl(`/api/sprint/${encodeURIComponent(token)}`), { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as SprintPublic;
}

function formatDateTime(raw?: string | null) {
  if (!raw) return "";
  const d = parseDateUtc(raw);
  if (!d) return "";
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-IN", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function formatRelativeDue(raw?: string | null) {
  if (!raw) return "No due date";
  const due = parseDateUtc(raw);
  if (!due) return raw || "";
  if (Number.isNaN(due.getTime())) return raw || "";
  const diffMs = due.getTime() - Date.now();
  const diffDays = Math.ceil(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
  if (diffMs >= 0) {
    if (diffDays <= 1) return "Due within 24h";
    return `In ${diffDays} days`;
  }
  if (diffDays <= 1) return "Overdue by <1 day";
  return `Overdue by ${diffDays} days`;
}

function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function SprintPage({ params }: { params: { token: string } }) {
  const sprint = await fetchSprint(params.token);

  if (!sprint) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-10">
        <div className="section-card space-y-2">
          <p className="text-xs uppercase tracking-tight text-slate-600">Sprint assignment</p>
          <h1 className="text-2xl font-semibold">Invalid or expired link</h1>
          <p className="text-sm text-slate-600">Please check your sprint link or contact the hiring team.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 px-4 py-10">
      <div className="section-card space-y-2">
        <p className="text-xs uppercase tracking-tight text-slate-600">Sprint assignment</p>
        <h1 className="text-2xl font-semibold">{sprint.template_name || "Your sprint brief"}</h1>
        <p className="text-sm text-slate-600">
          {sprint.opening_title || "Role"} - {sprint.candidate_name}
        </p>
        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          <span>Due: {sprint.due_at ? formatDateTime(sprint.due_at) : "TBD"}</span>
          <span>• {formatRelativeDue(sprint.due_at)}</span>
        </div>
      </div>

      <div className="section-card space-y-4">
        <p className="text-sm text-slate-600">{sprint.template_description || "Complete the task and submit your work below."}</p>
        <div className="grid gap-3 md:grid-cols-2">
          {sprint.instructions_url ? (
            <a
              className="rounded-xl border border-white/60 bg-white/30 px-3 py-2 text-sm font-semibold text-slate-800"
              href={sprint.instructions_url}
              target="_blank"
              rel="noreferrer"
            >
              Open sprint brief
            </a>
          ) : (
            <span className="rounded-xl border border-white/60 bg-white/30 px-3 py-2 text-sm font-semibold text-slate-600">
              Brief will be shared by the recruiter.
            </span>
          )}
          {sprint.submission_url ? (
            <a
              className="rounded-xl border border-white/60 bg-white/30 px-3 py-2 text-sm font-semibold text-slate-800"
              href={sprint.submission_url}
              target="_blank"
              rel="noreferrer"
            >
              View current submission
            </a>
          ) : null}
        </div>
        {sprint.attachments && sprint.attachments.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">Attachments</p>
            <div className="grid gap-2">
              {sprint.attachments.map((attachment) => (
                <a
                  key={attachment.sprint_attachment_id}
                  className="flex items-center justify-between rounded-xl border border-white/60 bg-white/30 px-3 py-2 text-sm text-slate-800"
                  href={internalUrl(
                    `/api/sprint/${encodeURIComponent(params.token)}/attachments/${encodeURIComponent(
                      String(attachment.sprint_attachment_id)
                    )}`
                  )}
                >
                  <span className="truncate">{attachment.file_name}</span>
                  <span className="text-xs text-slate-500">{formatFileSize(attachment.file_size)}</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <SprintPublicClient
        token={params.token}
        defaultSubmissionUrl={sprint.submission_url}
        initialStatus={sprint.status}
        dueAt={sprint.due_at}
      />
    </main>
  );
}
