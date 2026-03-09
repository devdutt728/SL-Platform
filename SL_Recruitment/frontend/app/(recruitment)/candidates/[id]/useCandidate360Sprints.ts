"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CandidateSprint, SprintTemplate, SprintTemplateAttachment } from "@/lib/types";
import * as candidate360Api from "./candidate360.api";

type LastSprintNotice = {
  template_name?: string | null;
  template_code?: string | null;
  assigned_at?: string | null;
  due_at?: string | null;
  status: string;
  deleted_at?: string | null;
};

type Params = {
  candidateId: string;
  canSkip: boolean;
  candidateName?: string | null;
  candidateOpeningTitle?: string | null;
  refreshAll: () => Promise<void>;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPreviewDueAt(raw?: string) {
  if (!raw) return "-";
  const due = new Date(raw);
  if (Number.isNaN(due.getTime())) return raw;
  return due.toLocaleString("en-IN", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function useCandidate360Sprints({
  candidateId,
  canSkip,
  candidateName,
  candidateOpeningTitle,
  refreshAll,
}: Params) {
  const [candidateSprints, setCandidateSprints] = useState<CandidateSprint[] | null>(null);
  const [sprintsBusy, setSprintsBusy] = useState(false);
  const [sprintsError, setSprintsError] = useState<string | null>(null);
  const [lastSprintNotice, setLastSprintNotice] = useState<LastSprintNotice | null>(null);
  const [templatePreview, setTemplatePreview] = useState<SprintTemplate | null>(null);
  const [templateAttachments, setTemplateAttachments] = useState<SprintTemplateAttachment[]>([]);
  const [templatePreviewBusy, setTemplatePreviewBusy] = useState(false);
  const [templatePreviewError, setTemplatePreviewError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [sprintTemplates, setSprintTemplates] = useState<SprintTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [dueAt, setDueAt] = useState("");

  const activeSprints = useMemo(
    () => (candidateSprints || []).filter((sprint) => sprint.status !== "deleted"),
    [candidateSprints]
  );
  const hasApprovedSprint = useMemo(
    () =>
      activeSprints.some(
        (sprint) => String(sprint.decision || "").trim().toLowerCase() === "advance"
      ),
    [activeSprints]
  );
  const sprintAssigned = activeSprints.length > 0;
  const sprintAssignDisabled = sprintAssigned && !canSkip;
  const sprintApprovalPending = sprintAssigned && !hasApprovedSprint;

  const sprintEmailPreviewHtml = useMemo(() => {
    if (!templatePreview) return "";
    const candidateLabel = escapeHtml(candidateName || "Candidate");
    const sprintName = escapeHtml(templatePreview.name || "Sprint assignment");
    const openingTitle = escapeHtml(candidateOpeningTitle || "Role");
    const dueLabel = escapeHtml(formatPreviewDueAt(dueAt));
    const attachments = templateAttachments.length > 0
      ? templateAttachments.map((item) => `<li>${escapeHtml(item.file_name)}</li>`).join("")
      : "<li>No attachments</li>";
    return `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f8fafc;padding:12px 0;">
        <tr>
          <td align="center">
            <table width="640" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="padding:24px 28px 8px 28px;font-family:Arial,sans-serif;color:#0f172a;">
                  <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;">Sprint Assignment</div>
                  <h1 style="margin:10px 0 4px 0;font-size:22px;font-weight:700;">Hi ${candidateLabel},</h1>
                  <p style="margin:0;font-size:14px;color:#475569;">Your sprint assignment is ready.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px 16px 28px;font-family:Arial,sans-serif;color:#0f172a;">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
                    <tr>
                      <td style="padding:12px 16px;font-size:13px;color:#475569;">Sprint</td>
                      <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;">${sprintName}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">Role</td>
                      <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-top:1px solid #e2e8f0;">${openingTitle}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">Due by</td>
                      <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-top:1px solid #e2e8f0;">${dueLabel}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">Attachments</td>
                      <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-top:1px solid #e2e8f0;">
                        <ul style="margin:0;padding-left:18px;color:#0f172a;font-size:13px;font-weight:500;">
                          ${attachments}
                        </ul>
                      </td>
                    </tr>
                  </table>
                  <div style="margin:16px 0 18px;">
                    <a href="#" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0f172a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;">View sprint</a>
                  </div>
                  <p style="margin:16px 0 0 0;font-size:14px;line-height:1.6;color:#334155;font-family:Arial,sans-serif;">Regards,<br />Studio Lotus Recruitment Team</p>
                  <div style="margin-top:14px;">
                    <div style="font-family:arial,sans-serif;">
                      <div style="color:rgb(34,34,34);">
                        <span style="text-align:justify;font-family:georgia,palatino,serif;font-size:large;color:rgb(126,124,123);">studio</span>
                        <span style="text-align:justify;font-family:georgia,palatino,serif;font-size:large;color:rgb(241,92,55);">lotus</span>
                      </div>
                      <div style="text-align:justify;">
                        <span style="color:rgb(241,92,55);font-family:arial,sans-serif;font-size:x-small;">creating meaning </span>
                        <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;font-size:x-small;">| </span>
                        <span style="color:rgb(241,92,55);font-family:arial,sans-serif;font-size:x-small;">celebrating context</span>
                      </div>
                      <div style="color:rgb(34,34,34);font-size:x-small;font-family:arial,sans-serif;">
                        World's 100 Best Architecture Firms, Archello
                        <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;"> | </span>
                        WAF
                        <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;"> | </span>
                        TIME Magazine
                        <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;"> | </span>
                        Prix Versailles
                        <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;"> | </span>
                        Dezeen Awards
                      </div>
                      <div style="font-size:x-small;font-family:arial,sans-serif;">
                        <a href="https://studiolotus.in/" style="color:rgb(17,85,204);" target="_blank" rel="noopener">Website</a>
                        <span> | </span>
                        <a href="https://www.instagram.com/studio_lotus/" style="color:rgb(17,85,204);" target="_blank" rel="noopener">Instagram</a>
                        <span> | </span>
                        <a href="https://www.linkedin.com/company/studiolotus/" style="color:rgb(17,85,204);" target="_blank" rel="noopener">LinkedIn</a>
                        <span> | </span>
                        <a href="https://www.facebook.com/studiolotus.in/" style="color:rgb(17,85,204);" target="_blank" rel="noopener">Facebook</a>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0 0;font-size:11px;color:#94a3b8;font-family:Arial,sans-serif;">This email contains confidential information intended only for the recipient.</p>
          </td>
        </tr>
      </table>
    `;
  }, [candidateName, candidateOpeningTitle, dueAt, templateAttachments, templatePreview]);

  const refreshSprints = useCallback(async () => {
    setSprintsBusy(true);
    setSprintsError(null);
    try {
      const list = await candidate360Api.fetchCandidateSprints(candidateId);
      setCandidateSprints(list);
      const active = list.filter((sprint) => sprint.status !== "deleted");
      if (active.length === 0) {
        const deleted = list
          .filter((sprint) => sprint.status === "deleted")
          .sort((a, b) => new Date(b.deleted_at || b.updated_at).getTime() - new Date(a.deleted_at || a.updated_at).getTime());
        if (deleted.length > 0) {
          const latest = deleted[0];
          setLastSprintNotice({
            template_name: latest.template_name,
            template_code: latest.template_code,
            assigned_at: latest.assigned_at,
            due_at: latest.due_at,
            status: "deleted",
            deleted_at: latest.deleted_at || latest.updated_at,
          });
        } else {
          setLastSprintNotice(null);
        }
      } else {
        setLastSprintNotice(null);
      }
    } catch (e: any) {
      setSprintsError(e?.message || "Could not load sprints.");
    } finally {
      setSprintsBusy(false);
    }
  }, [candidateId]);

  useEffect(() => {
    if (candidateSprints === null) {
      void refreshSprints();
    }
  }, [candidateSprints, refreshSprints]);

  useEffect(() => {
    if (activeSprints.length > 0 && lastSprintNotice) {
      setLastSprintNotice(null);
    }
  }, [activeSprints, lastSprintNotice]);

  const openAssignSprint = useCallback(async () => {
    if (sprintAssignDisabled) {
      setSprintsError("Sprint already assigned. Contact a superadmin to reassign.");
      return;
    }
    setAssignOpen(true);
    setSprintsError(null);
    setSelectedTemplateId("");
    setDueAt("");
    setTemplatePreview(null);
    setTemplateAttachments([]);
    setTemplatePreviewError(null);
    setTemplatePreviewBusy(false);
    if (sprintTemplates.length === 0) {
      try {
        const templates = await candidate360Api.fetchSprintTemplates();
        setSprintTemplates(templates);
      } catch (e: any) {
        setSprintsError(e?.message || "Could not load templates.");
      }
    }
  }, [sprintAssignDisabled, sprintTemplates.length]);

  const handleTemplateSelect = useCallback(async (value: string) => {
    setSelectedTemplateId(value);
    setTemplatePreviewError(null);
    setTemplatePreview(null);
    setTemplateAttachments([]);
    if (!value) {
      setDueAt("");
      return;
    }
    const chosen = sprintTemplates.find((t) => String(t.sprint_template_id) === value) || null;
    setTemplatePreview(chosen);
    if (chosen?.expected_duration_days) {
      const target = new Date(Date.now() + chosen.expected_duration_days * 24 * 60 * 60 * 1000);
      const iso = new Date(target.getTime() - target.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setDueAt(iso);
    } else {
      setDueAt("");
    }
    setTemplatePreviewBusy(true);
    try {
      const attachments = await candidate360Api.fetchSprintTemplateAttachments(value);
      setTemplateAttachments(attachments);
    } catch (e: any) {
      setTemplatePreviewError(e?.message || "Could not load template attachments.");
    } finally {
      setTemplatePreviewBusy(false);
    }
  }, [sprintTemplates]);

  const handleAssignSprint = useCallback(async () => {
    if (!selectedTemplateId) {
      setSprintsError("Select a sprint template.");
      return;
    }
    if (!dueAt) {
      setSprintsError("Select a sprint due date.");
      return;
    }
    setSprintsBusy(true);
    setSprintsError(null);
    try {
      await candidate360Api.assignSprint(candidateId, {
        sprint_template_id: Number(selectedTemplateId),
        due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      setAssignOpen(false);
      await refreshAll();
      await refreshSprints();
    } catch (e: any) {
      setSprintsError(e?.message || "Sprint assignment failed.");
    } finally {
      setSprintsBusy(false);
    }
  }, [candidateId, dueAt, refreshAll, refreshSprints, selectedTemplateId]);

  const handleSuperadminSprintDecision = useCallback(
    async (candidateSprintId: number, decision: "advance" | "reject", reason?: string) => {
      if (!canSkip) {
        setSprintsError("Only superadmin can override sprint review.");
        return;
      }
      setSprintsBusy(true);
      setSprintsError(null);
      try {
        await candidate360Api.updateCandidateSprint(candidateSprintId, {
          status: "completed",
          decision,
          comments_internal:
            (reason || "").trim() ||
            (decision === "advance" ? "Approved by superadmin override" : "Rejected by superadmin override"),
        });
        await refreshAll();
        await refreshSprints();
      } catch (e: any) {
        setSprintsError(e?.message || "Could not update sprint decision.");
      } finally {
        setSprintsBusy(false);
      }
    },
    [canSkip, refreshAll, refreshSprints]
  );

  return {
    candidateSprints,
    setCandidateSprints,
    sprintsBusy,
    sprintsError,
    setSprintsError,
    lastSprintNotice,
    setLastSprintNotice,
    templatePreview,
    templatePreviewBusy,
    templatePreviewError,
    assignOpen,
    setAssignOpen,
    sprintTemplates,
    selectedTemplateId,
    dueAt,
    setDueAt,
    activeSprints,
    hasApprovedSprint,
    sprintAssignDisabled,
    sprintApprovalPending,
    sprintEmailPreviewHtml,
    refreshSprints,
    openAssignSprint,
    handleTemplateSelect,
    handleAssignSprint,
    handleSuperadminSprintDecision,
  };
}
