"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { createPortal } from "react-dom";
import { CandidateSprint, SprintTemplate, SprintTemplateAttachment } from "@/lib/types";
import { Chip, Metric } from "./Candidate360Primitives";

type LastSprintNotice = {
  template_name?: string | null;
  template_code?: string | null;
  assigned_at?: string | null;
  due_at?: string | null;
  status: string;
  deleted_at?: string | null;
};

type Props = {
  sectionRef: React.RefObject<HTMLDivElement>;
  collapsed: boolean;
  onToggle: () => void;
  hasApprovedSprint: boolean;
  sprintApprovalPending: boolean;
  sprintsError: string | null;
  sprintsBusy: boolean;
  candidateSprints: CandidateSprint[] | null;
  activeSprints: CandidateSprint[];
  lastSprintNotice: LastSprintNotice | null;
  currentStageKey: string | null;
  sprintAssignDisabled: boolean;
  canSkip: boolean;
  sprintDeleteBusy: boolean;
  onDeleteSprint: (candidateSprintId: number) => void;
  onSuperadminSprintDecision: (candidateSprintId: number, decision: "advance" | "reject", reason?: string) => void;
  onOpenAssignSprint: () => void;
  assignOpen: boolean;
  onCloseAssign: () => void;
  sprintTemplates: SprintTemplate[];
  selectedTemplateId: string;
  onSelectTemplate: (value: string) => void;
  dueAt: string;
  setDueAt: (value: string) => void;
  templatePreviewBusy: boolean;
  templatePreview: SprintTemplate | null;
  templateAttachments: SprintTemplateAttachment[];
  sprintEmailPreviewHtml: string;
  templatePreviewError: string | null;
  onAssignSprint: () => void;
  chipTone: (kind: "neutral" | "green" | "amber" | "red" | "blue") => string;
  decisionTone: (decision?: string | null) => string;
  formatDateTime: (raw?: string | null) => string;
  formatRelativeDue: (raw?: string | null) => string;
  formatBytes: (raw?: number | null) => string;
};

export function Candidate360SprintSection({
  sectionRef,
  collapsed,
  onToggle,
  hasApprovedSprint,
  sprintApprovalPending,
  sprintsError,
  sprintsBusy,
  candidateSprints,
  activeSprints,
  lastSprintNotice,
  currentStageKey,
  sprintAssignDisabled,
  canSkip,
  sprintDeleteBusy,
  onDeleteSprint,
  onSuperadminSprintDecision,
  onOpenAssignSprint,
  assignOpen,
  onCloseAssign,
  sprintTemplates,
  selectedTemplateId,
  onSelectTemplate,
  dueAt,
  setDueAt,
  templatePreviewBusy,
  templatePreview,
  templateAttachments,
  sprintEmailPreviewHtml,
  templatePreviewError,
  onAssignSprint,
  chipTone,
  decisionTone,
  formatDateTime,
  formatRelativeDue,
  formatBytes,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function decodeHtmlEntities(raw: string) {
    return raw
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, "&");
  }

  function sanitizeSprintHtml(raw?: string | null) {
    if (!raw) return "";
    return decodeHtmlEntities(raw)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .trim();
  }

  function formatTemplateLabel(template: SprintTemplate) {
    const code = (template.sprint_template_code || "").trim();
    const name = (template.name || "").trim() || "Unnamed sprint";
    const duration =
      template.expected_duration_days && template.expected_duration_days > 0
        ? ` · ${template.expected_duration_days} day${template.expected_duration_days === 1 ? "" : "s"}`
        : "";
    return code ? `${code} · ${name}${duration}` : `${name}${duration}`;
  }

  const templateBriefHtml = sanitizeSprintHtml(templatePreview?.description);

  return (
    <>
      {assignOpen && mounted
        ? createPortal(
            <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 px-4 py-6">
              <div className="mx-auto flex min-h-full w-full max-w-3xl items-center justify-center">
                <div className="w-full rounded-3xl border border-white/20 bg-white/95 p-6 shadow-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-tight text-slate-500">Assign sprint</p>
                      <h3 className="text-lg font-semibold">Select a template</h3>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                      onClick={onCloseAssign}
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <label className="space-y-1 text-xs text-slate-600">
                      Sprint template
                      <select
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={selectedTemplateId}
                        onChange={(e) => onSelectTemplate(e.target.value)}
                      >
                        <option value="">Select template</option>
                        {sprintTemplates.map((template) => (
                          <option key={template.sprint_template_id} value={String(template.sprint_template_id)}>
                            {formatTemplateLabel(template)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-xs text-slate-600">
                      Due date
                      <input
                        type="datetime-local"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={dueAt}
                        onChange={(e) => setDueAt(e.target.value)}
                      />
                    </label>

                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-700">
                      <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Selected sprint</p>
                      {templatePreviewBusy ? (
                        <p className="mt-2 text-sm text-slate-600">Loading preview...</p>
                      ) : templatePreview ? (
                        <div className="mt-2 space-y-3">
                          <div className="grid gap-2 md:grid-cols-4">
                            <Metric label="Sprint code" value={templatePreview.sprint_template_code || "-"} />
                            <Metric label="Sprint name" value={templatePreview.name || "-"} />
                            <Metric
                              label="Expected duration"
                              value={
                                templatePreview.expected_duration_days
                                  ? `${templatePreview.expected_duration_days} day${templatePreview.expected_duration_days === 1 ? "" : "s"}`
                                  : "-"
                              }
                            />
                            <Metric label="Due date" value={dueAt ? formatDateTime(dueAt) : "-"} />
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Sprint brief</p>
                              {templatePreview.instructions_url ? (
                                <a
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 underline decoration-dotted underline-offset-2"
                                  href={templatePreview.instructions_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Open instructions
                                </a>
                              ) : null}
                            </div>
                            {templateBriefHtml ? (
                              <div
                                className="prose prose-slate prose-sm mt-3 max-w-none"
                                dangerouslySetInnerHTML={{ __html: templateBriefHtml }}
                              />
                            ) : (
                              <p className="mt-3 text-sm text-slate-600">No sprint brief text provided for this template.</p>
                            )}
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">
                              Attachments {templateAttachments.length ? `(${templateAttachments.length})` : ""}
                            </p>
                            {templateAttachments.length > 0 ? (
                              <div className="mt-3 space-y-2">
                                {templateAttachments.map((attachment) => (
                                  <div
                                    key={attachment.sprint_template_attachment_id}
                                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-700"
                                  >
                                    <span className="truncate font-medium">{attachment.file_name}</span>
                                    <span className="shrink-0 text-slate-500">{formatBytes(attachment.file_size)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-sm text-slate-600">No attachments will be sent with this sprint.</p>
                            )}
                          </div>

                          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <div className="border-b border-slate-200 px-4 py-3">
                              <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Candidate email preview</p>
                              <p className="mt-1 text-[11px] text-slate-500">The sprint link activates after assignment.</p>
                            </div>
                            <div
                              className="max-h-[360px] overflow-auto p-4"
                              dangerouslySetInnerHTML={{ __html: sprintEmailPreviewHtml }}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-600">Select a template to preview the sprint brief, due date, and attachments.</p>
                      )}
                      {templatePreviewError ? (
                        <div className="mt-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-700">
                          {templatePreviewError}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {sprintsError ? (
                    <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-700">
                      {sprintsError}
                    </div>
                  ) : null}

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                      onClick={onCloseAssign}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                      onClick={onAssignSprint}
                      disabled={sprintsBusy || sprintAssignDisabled}
                    >
                      {sprintsBusy ? "Assigning..." : "Assign sprint"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <div ref={sectionRef} className="section-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-tight text-slate-500">Sprint</p>
            {hasApprovedSprint ? <Chip className={chipTone("green")}>L2 approved</Chip> : null}
            {sprintApprovalPending ? <Chip className={chipTone("amber")}>Awaiting L2 approval</Chip> : null}
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
            onClick={onToggle}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
        {collapsed ? null : (
          <>
            {sprintsError ? (
              <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
                {sprintsError}
              </div>
            ) : null}
            <div className="mt-3 space-y-3">
              {sprintsBusy && !candidateSprints ? (
                <div className="rounded-2xl border border-white/60 bg-white/30 p-4 text-sm text-slate-600">Loading sprint data...</div>
              ) : activeSprints.length > 0 ? (
                activeSprints.map((sprint) => {
                  const attachments = sprint.attachments || [];
                  const sprintBriefHtml = sanitizeSprintHtml(sprint.template_description);
                  return (
                    <div key={sprint.candidate_sprint_id} className="rounded-2xl border border-white/60 bg-white/30 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{sprint.template_name || "Sprint assignment"}</p>
                            {sprint.template_code ? (
                              <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {sprint.template_code}
                              </span>
                            ) : null}
                            {sprint.expected_duration_days ? (
                              <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {sprint.expected_duration_days} day{sprint.expected_duration_days === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip className={chipTone(sprint.status === "submitted" ? "amber" : sprint.status === "completed" ? "green" : "neutral")}>
                          {sprint.status.replace("_", " ")}
                        </Chip>
                        {canSkip && String(sprint.status || "").toLowerCase() !== "deleted" ? (
                          <>
                            <button
                              type="button"
                              className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                              onClick={() => {
                                const reason = window.prompt("Approval note (optional):", "Approved by superadmin override") || undefined;
                                onSuperadminSprintDecision(sprint.candidate_sprint_id, "advance", reason);
                              }}
                              disabled={sprintsBusy}
                            >
                              Approve sprint
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                              onClick={() => {
                                const reason = window.prompt("Rejection reason:", "Rejected by superadmin override");
                                if (!reason || !reason.trim()) return;
                                onSuperadminSprintDecision(sprint.candidate_sprint_id, "reject", reason.trim());
                              }}
                              disabled={sprintsBusy}
                            >
                              Reject sprint
                            </button>
                          </>
                        ) : null}
                        {canSkip ? (
                          <button
                            type="button"
                            className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                            onClick={() => onDeleteSprint(sprint.candidate_sprint_id)}
                            disabled={sprintDeleteBusy}
                          >
                            {sprintDeleteBusy ? "Deleting..." : "Delete sprint"}
                          </button>
                        ) : null}
                      </div>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-4">
                        <Metric label="Assigned" value={formatDateTime(sprint.assigned_at)} />
                        <Metric label="Due" value={sprint.due_at ? formatDateTime(sprint.due_at) : "-"} />
                        <Metric label="Status" value={formatRelativeDue(sprint.due_at)} />
                        <Metric label="Submitted" value={sprint.submitted_at ? formatDateTime(sprint.submitted_at) : "-"} />
                      </div>
                      <div className="mt-3 rounded-xl border border-white/60 bg-white/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Sprint brief</p>
                          {sprint.instructions_url ? (
                            <a
                              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 underline decoration-dotted underline-offset-2"
                              href={sprint.instructions_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Open instructions
                            </a>
                          ) : null}
                        </div>
                        {sprintBriefHtml ? (
                          <div
                            className="prose prose-slate prose-sm mt-3 max-w-none"
                            dangerouslySetInnerHTML={{ __html: sprintBriefHtml }}
                          />
                        ) : (
                          <p className="mt-3 text-sm text-slate-600">No sprint brief text provided.</p>
                        )}
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <div className="rounded-xl border border-white/60 bg-white/60 p-3">
                          <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Links</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                            {sprint.public_token && sprint.status !== "submitted" ? (
                              <Link
                                className="inline-flex items-center gap-1 text-slate-800 underline decoration-dotted underline-offset-2"
                                href={`/sprint/${encodeURIComponent(sprint.public_token)}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink className="h-3.5 w-3.5" /> Open sprint page
                              </Link>
                            ) : sprint.status === "submitted" ? (
                              <span className="text-xs text-slate-500">Public sprint link expired after submission.</span>
                            ) : null}
                            {sprint.instructions_url ? (
                              <a
                                className="inline-flex items-center gap-1 text-slate-800 underline decoration-dotted underline-offset-2"
                                href={sprint.instructions_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink className="h-3.5 w-3.5" /> Sprint brief
                              </a>
                            ) : null}
                            {sprint.submission_url ? (
                              <a
                                className="inline-flex items-center gap-1 text-slate-800 underline decoration-dotted underline-offset-2"
                                href={sprint.submission_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink className="h-3.5 w-3.5" /> Submission file
                              </a>
                            ) : (
                              <span className="text-xs text-slate-500">No submission yet.</span>
                            )}
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/60 bg-white/60 p-3">
                          <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Attachments</p>
                          {attachments.length > 0 ? (
                            <div className="mt-2 space-y-1 text-xs text-slate-700">
                              {attachments.map((attachment) => (
                                <a
                                  key={attachment.sprint_attachment_id}
                                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white/80 px-2 py-1 underline decoration-dotted underline-offset-2"
                                  href={`/api/rec/sprints/${encodeURIComponent(
                                    String(sprint.candidate_sprint_id)
                                  )}/attachments/${encodeURIComponent(String(attachment.sprint_attachment_id))}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <span className="truncate">{attachment.file_name}</span>
                                  <span className="text-slate-500">{formatBytes(attachment.file_size)}</span>
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-slate-500">No attachments available.</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        {sprint.score_overall != null ? <Chip className={chipTone("blue")}>Score {sprint.score_overall}</Chip> : null}
                        {sprint.decision ? <Chip className={decisionTone(sprint.decision)}>{sprint.decision.replace("_", " ")}</Chip> : null}
                      </div>
                    </div>
                  );
                })
              ) : lastSprintNotice ? (
                <div className="rounded-2xl border border-white/60 bg-white/30 p-4 text-sm text-slate-600">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{lastSprintNotice.template_name || "Sprint assignment"}</p>
                      {lastSprintNotice.template_code ? (
                        <p className="mt-1 text-xs text-slate-500">Code: {lastSprintNotice.template_code}</p>
                      ) : null}
                    </div>
                    <Chip className={chipTone("neutral")}>Deleted</Chip>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <Metric label="Assigned" value={lastSprintNotice.assigned_at ? formatDateTime(lastSprintNotice.assigned_at) : "-"} />
                    <Metric label="Due" value={lastSprintNotice.due_at ? formatDateTime(lastSprintNotice.due_at) : "-"} />
                    <Metric
                      label="Deleted"
                      value={lastSprintNotice.deleted_at ? formatDateTime(lastSprintNotice.deleted_at) : "-"}
                    />
                  </div>
                </div>
              ) : currentStageKey === "sprint" ? (
                <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-500/5 p-4">
                  <p className="text-sm font-semibold text-amber-700">Sprint stage active</p>
                  <p className="mt-1 text-sm text-amber-700">Assign a sprint template to share the brief with the candidate.</p>
                  <button
                    type="button"
                    className={[
                      "mt-3 rounded-full px-4 py-2 text-xs font-semibold text-white",
                      sprintAssignDisabled ? "bg-slate-400 cursor-not-allowed" : "bg-amber-500 hover:bg-amber-600",
                    ].join(" ")}
                    onClick={onOpenAssignSprint}
                    disabled={sprintAssignDisabled}
                  >
                    Assign sprint
                  </button>
                  {sprintAssignDisabled ? (
                    <p className="mt-2 text-xs text-slate-500">Sprint already assigned. Only superadmin can reassign.</p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/60 bg-white/30 p-4 text-sm text-slate-600">
                  No sprint assigned yet.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
