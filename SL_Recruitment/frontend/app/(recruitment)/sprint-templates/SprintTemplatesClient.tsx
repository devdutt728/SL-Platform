"use client";

import { useEffect, useMemo, useState } from "react";
import { CandidateListItem, SprintTemplate, SprintTemplateAttachment } from "@/lib/types";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";


type Props = {
  initialTemplates: SprintTemplate[];
};

type TemplateForm = {
  sprint_template_code: string;
  name: string;
  description: string;
  instructions_url: string;
  expected_duration_days: string;
  is_active: boolean;
};

export function SprintTemplatesClient({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState<SprintTemplate[]>(initialTemplates);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [platformRoleId, setPlatformRoleId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [form, setForm] = useState<TemplateForm>({
    sprint_template_code: "",
    name: "",
    description: "",
    instructions_url: "",
    expected_duration_days: "",
    is_active: true,
  });

  const [attachmentTemplateId, setAttachmentTemplateId] = useState<string>("");
  const [attachments, setAttachments] = useState<SprintTemplateAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<string>("");
  const [previewCandidateName, setPreviewCandidateName] = useState("");
  const [previewCandidateCode, setPreviewCandidateCode] = useState("");
  const [previewDueDate, setPreviewDueDate] = useState("");
  const [previewOpeningTitle, setPreviewOpeningTitle] = useState("");
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [previewCandidateId, setPreviewCandidateId] = useState<string>("");
  const [previewCandidates, setPreviewCandidates] = useState<CandidateListItem[]>([]);
  const [previewCandidatesLoading, setPreviewCandidatesLoading] = useState(false);

  const isSuperadmin = useMemo(
    () => platformRoleId === 2 || (platformRoleId == null && !!roles?.includes("hr_admin")),
    [platformRoleId, roles]
  );
  const isHr = useMemo(() => platformRoleId === 5 || (platformRoleId == null && !!roles?.includes("hr_exec")), [platformRoleId, roles]);
  const canPreview = isSuperadmin || isHr;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${basePath}/api/auth/me`, { cache: "no-store" });
        if (!res.ok) return;
        const me = (await res.json()) as { roles?: string[]; platform_role_id?: number | null };
        if (cancelled) return;
        setRoles(me.roles || []);
        setPlatformRoleId(me.platform_role_id ?? null);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canPreview) return;
    let cancelled = false;
    (async () => {
      setPreviewCandidatesLoading(true);
      try {
        const url = new URL("/api/rec/candidates", window.location.origin);
        url.searchParams.set("stage", "sprint");
        url.searchParams.set("limit", "200");
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as CandidateListItem[];
        if (!cancelled) setPreviewCandidates(data);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setPreviewCandidatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canPreview]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setForm({
        sprint_template_code: "",
        name: "",
        description: "",
        instructions_url: "",
        expected_duration_days: "",
        is_active: true,
      });
      return;
    }
    const template = templates.find((t) => String(t.sprint_template_id) === selectedTemplateId);
    if (!template) return;
    setForm({
      sprint_template_code: template.sprint_template_code || "",
      name: template.name || "",
      description: template.description || "",
      instructions_url: template.instructions_url || "",
      expected_duration_days: template.expected_duration_days ? String(template.expected_duration_days) : "",
      is_active: !!template.is_active,
    });
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    let cancelled = false;
    if (!attachmentTemplateId) {
      setAttachments([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/rec/sprint-templates/${encodeURIComponent(attachmentTemplateId)}/attachments`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as SprintTemplateAttachment[];
        if (!cancelled) setAttachments(data);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachmentTemplateId]);

  async function refreshTemplates() {
    try {
      const res = await fetch("/api/rec/sprint-templates?include_inactive=1", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as SprintTemplate[];
      setTemplates(data);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let pending = false;
    const source = new EventSource("/api/rec/events/stream");

    async function refreshAll() {
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      try {
        await refreshTemplates();
      } finally {
        inFlight = false;
        if (pending && !cancelled) {
          pending = false;
          void refreshAll();
        }
      }
    }

    source.onmessage = () => {
      void refreshAll();
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  async function saveTemplate() {
    if (!isSuperadmin) {
      setError("Only Superadmin can manage sprint templates.");
      return;
    }
    if (!form.name.trim()) {
      setError("Template name is required.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      sprint_template_code: form.sprint_template_code.trim() || null,
      name: form.name.trim(),
      description: form.description.trim() || null,
      instructions_url: form.instructions_url.trim() || null,
      expected_duration_days: form.expected_duration_days ? Number(form.expected_duration_days) : null,
      is_active: form.is_active,
    };

    const isUpdate = !!selectedTemplateId;
    const res = await fetch(isUpdate ? `/api/rec/sprint-templates/${encodeURIComponent(selectedTemplateId)}` : "/api/rec/sprint-templates", {
      method: isUpdate ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setError(await formatApiError(res));
      setSaving(false);
      return;
    }

    const saved = (await res.json()) as SprintTemplate;
    setTemplates((prev) => {
      if (isUpdate) {
        return prev.map((t) => (t.sprint_template_id === saved.sprint_template_id ? saved : t));
      }
      return [saved, ...prev];
    });
    setSelectedTemplateId(String(saved.sprint_template_id));
    setSaving(false);
  }

  async function uploadAttachment() {
    if (!isSuperadmin) {
      setUploadError("Only Superadmin can upload attachments.");
      return;
    }
    if (!attachmentTemplateId) {
      setUploadError("Select a template first.");
      return;
    }
    if (!attachmentFile) {
      setUploadError("Choose a file to upload.");
      return;
    }
    if (attachmentFile.size > 25 * 1024 * 1024) {
      setUploadError("Max file size is 25 MB.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("upload", attachmentFile);
      const res = await fetch(`/api/rec/sprint-templates/${encodeURIComponent(attachmentTemplateId)}/attachments`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        setUploadError(await formatApiError(res));
        setUploading(false);
        return;
      }
      const saved = (await res.json()) as SprintTemplateAttachment;
      setAttachments((prev) => [saved, ...prev]);
      setAttachmentFile(null);
    } catch {
      setUploadError("Attachment upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(attachmentId: number) {
    if (!isSuperadmin) {
      setUploadError("Only Superadmin can remove attachments.");
      return;
    }
    if (!attachmentTemplateId) {
      setUploadError("Select a template first.");
      return;
    }
    setUploadError(null);
    try {
      const res = await fetch(
        `/api/rec/sprint-templates/${encodeURIComponent(attachmentTemplateId)}/attachments/${attachmentId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setUploadError(await formatApiError(res));
        return;
      }
      setAttachments((prev) => prev.filter((att) => att.sprint_template_attachment_id !== attachmentId));
    } catch {
      setUploadError("Attachment removal failed.");
    }
  }

  useEffect(() => {
    setPreviewBody(null);
  }, [previewTemplateId, previewCandidateName, previewCandidateCode, previewDueDate, previewOpeningTitle]);

  function renderPreview() {
    if (!previewTemplateId) {
      setPreviewBody("Select a template to preview.");
      return;
    }
    const template = templates.find((t) => String(t.sprint_template_id) === previewTemplateId);
    if (!template) {
      setPreviewBody("Template not found.");
      return;
    }
    const description = template.description || "";
    const dueDateValue = previewDueDate || deriveDueDate(template.expected_duration_days);
    const replacements: Record<string, string> = {
      "{{candidate_name}}": previewCandidateName.trim(),
      "{{candidate_code}}": previewCandidateCode.trim(),
      "{{due_date}}": dueDateValue || "TBD",
      "{{opening_title}}": previewOpeningTitle.trim(),
      "{{template_name}}": template.name || "",
    };
    let output = description;
    Object.entries(replacements).forEach(([key, value]) => {
      output = output.split(key).join(value);
    });
    setPreviewBody(output || "(No description set)");
  }

  return (
    <main className="content-pad space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-tight text-slate-500">Sprint setup</p>
          <h1 className="text-2xl font-semibold">Sprint Templates</h1>
          <p className="text-sm text-slate-500">Create reusable briefs and manage attachments.</p>
        </div>
        <span className="text-xs font-semibold text-slate-500">Live</span>
      </div>

      {isSuperadmin ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-tight text-slate-500">Template details</p>
                <p className="text-sm text-slate-500">Create a new template or update an existing one.</p>
              </div>
              <button
                className="rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-card hover:bg-amber-700 disabled:opacity-60"
                disabled={saving}
                type="button"
                onClick={() => void saveTemplate()}
              >
                {saving ? "Saving..." : "Save template"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-slate-600">Edit template</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                >
                  <option value="">New template</option>
                  {templates.map((t) => (
                    <option key={t.sprint_template_id} value={String(t.sprint_template_id)}>
                      {t.sprint_template_code || "No code"} - {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs text-slate-600">Template code</span>
                <input
                  value={form.sprint_template_code}
                  onChange={(e) => setForm((prev) => ({ ...prev, sprint_template_code: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
                  placeholder="AUTO-GENERATE"
                />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs text-slate-600">Template name</span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
                  placeholder="Frontend Takehome Sprint"
                />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs text-slate-600">Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="min-h-24 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
                  placeholder="Short brief and expectations for the sprint."
                />
                <span className="text-[11px] text-slate-500">
                  Supports placeholders: {"{{candidate_name}}"}, {"{{candidate_code}}"}, {"{{due_date}}"}, {"{{opening_title}}"}, {"{{template_name}}"}.
                </span>
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs text-slate-600">Instructions URL (optional)</span>
                <input
                  value={form.instructions_url}
                  onChange={(e) => setForm((prev) => ({ ...prev, instructions_url: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
                  placeholder="https://..."
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-slate-600">Expected duration (days)</span>
                <input
                  type="number"
                  min={1}
                  value={form.expected_duration_days}
                  onChange={(e) => setForm((prev) => ({ ...prev, expected_duration_days: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
                  placeholder="3"
                />
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                Active
              </label>
            </div>

            {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-tight text-slate-500">Attachments</p>
              <p className="text-sm text-slate-500">Upload the files that will be snapshotted per candidate.</p>
            </div>

            <div className="mt-4 space-y-3">
              <label className="space-y-1">
                <span className="text-xs text-slate-600">Template</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm"
                  value={attachmentTemplateId}
                  onChange={(e) => setAttachmentTemplateId(e.target.value)}
                >
                  <option value="">Select template</option>
                  {templates.map((t) => (
                    <option key={t.sprint_template_id} value={String(t.sprint_template_id)}>
                      {t.sprint_template_code || "No code"} - {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs text-slate-600">Upload file (max 25 MB)</span>
                <input
                  type="file"
                  className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm text-slate-700"
                  onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                />
              </label>

              <button
                type="button"
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-card disabled:opacity-60"
                onClick={() => void uploadAttachment()}
                disabled={uploading}
              >
                {uploading ? "Uploading..." : "Add attachment"}
              </button>

              {uploadError ? <p className="text-xs text-red-500">{uploadError}</p> : null}
            </div>

            <div className="mt-4 space-y-2">
              {attachments.length === 0 ? (
                <p className="text-xs text-slate-500">No attachments yet.</p>
              ) : (
                attachments.map((att) => (
                  <div key={att.sprint_template_attachment_id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/60 px-3 py-2 text-sm">
                    <span className="truncate">{att.file_name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">{formatFileSize(att.file_size)}</span>
                      <button
                        type="button"
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                        onClick={() => void removeAttachment(att.sprint_template_attachment_id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {canPreview ? (
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-tight text-slate-500">Preview email body</p>
              <p className="text-sm text-slate-500">Use a sprint-stage candidate and preview the email output.</p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white"
              onClick={() => renderPreview()}
            >
              Preview email body
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-slate-600">Template</span>
              <select
                className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm"
                value={previewTemplateId}
                onChange={(e) => setPreviewTemplateId(e.target.value)}
              >
                <option value="">Select template</option>
                {templates.map((t) => (
                  <option key={t.sprint_template_id} value={String(t.sprint_template_id)}>
                    {t.sprint_template_code || "No code"} - {t.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-slate-600">Candidate (Sprint stage)</span>
              <select
                className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm"
                value={previewCandidateId}
                onChange={(e) => {
                  const value = e.target.value;
                  setPreviewCandidateId(value);
                  const selected = previewCandidates.find((c) => String(c.candidate_id) === value);
                  setPreviewCandidateName(selected?.name || "");
                  setPreviewCandidateCode(selected?.candidate_code || "");
                  setPreviewOpeningTitle(selected?.opening_title || "");
                }}
              >
                <option value="">{previewCandidatesLoading ? "Loading candidates..." : "Select candidate"}</option>
                {previewCandidates.map((c) => (
                  <option key={c.candidate_id} value={String(c.candidate_id)}>
                    {c.name} ({c.candidate_code})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs text-slate-600">Candidate name</span>
              <input
                value={previewCandidateName}
                onChange={(e) => setPreviewCandidateName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
                placeholder="Candidate name"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-slate-600">Candidate code</span>
              <input
                value={previewCandidateCode}
                onChange={(e) => setPreviewCandidateCode(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
                placeholder="Candidate code"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-slate-600">Due date (optional)</span>
              <input
                type="date"
                value={previewDueDate}
                onChange={(e) => setPreviewDueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-slate-600">Opening title</span>
              <input
                value={previewOpeningTitle}
                onChange={(e) => setPreviewOpeningTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
                placeholder="Opening title"
              />
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white/60 p-3 text-sm text-slate-700">
            {previewBody ? (
              <div dangerouslySetInnerHTML={{ __html: previewBody }} />
            ) : (
              "Click preview to render the email body."
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-700 shadow-sm">
          Only <span className="font-semibold">Superadmin</span> can manage sprint templates and attachments. HR can preview once roles are loaded.
        </div>
      )}
    </main>
  );
}

function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function deriveDueDate(durationDays?: number | null) {
  if (!durationDays) return "";
  const d = new Date();
  d.setDate(d.getDate() + durationDays);
  return d.toISOString().slice(0, 10);
}

async function formatApiError(res: Response): Promise<string> {
  const raw = (await res.text()).trim();
  const detail = extractDetail(raw);
  if (res.status === 409) return detail || "Duplicate code or conflicting data.";
  if (res.status === 401) return detail || "Unauthorized. Sign in at /login and try again.";
  if (res.status === 403) return detail || "Forbidden. You may not have permission for this action.";
  return detail || raw || `Request failed (${res.status})`;
}

function extractDetail(raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "detail" in parsed && typeof (parsed as any).detail === "string") {
      return (parsed as any).detail;
    }
  } catch {
    // ignore
  }
  return null;
}