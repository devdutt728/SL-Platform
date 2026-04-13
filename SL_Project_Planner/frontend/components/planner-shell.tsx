"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardCheck, FileStack, Filter, History, Loader2, Plus, RefreshCcw, ShieldCheck, Trash2 } from "lucide-react";

type PlannerRole = "super_admin" | "principal" | "group_leader" | "project_anchor" | "senior_architect" | "architect" | "viewer";

type PlannerBoard = {
  actor: {
    full_name?: string | null;
    planner_role: PlannerRole;
    can_create: boolean;
    can_hard_delete: boolean;
  };
  projects: Array<{ project_code: string; project_name: string }>;
  summary: {
    total_rows: number;
    pending_rows: number;
    completed_rows: number;
    pending_approvals: number;
    live_rows: number;
    contract_rows: number;
    approved_change_rows: number;
    critical_rows: number;
    attached_documents: number;
  };
  items: PlannerRow[];
};

type PlannerRow = {
  planner_row_id: number;
  project_code: string;
  project_name: string;
  stage_code?: string | null;
  package_code?: string | null;
  activity_code: string;
  activity_title: string;
  activity_description?: string | null;
  plan_layer: string;
  change_type: string;
  change_reason?: string | null;
  activity_status: string;
  approval_status: string;
  priority: string;
  percent_complete: number | string;
  assigned_to_name?: string | null;
  senior_architect_name?: string | null;
  group_leader_name?: string | null;
  project_anchor_name?: string | null;
  scheduled_start_date?: string | null;
  scheduled_end_date?: string | null;
  float_days?: string | number | null;
  is_critical?: number;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_reject: boolean;
};

type PlannerRequest = {
  request_id: number;
  request_type: string;
  request_status: string;
  request_reason?: string | null;
  requester_role?: string | null;
  created_at: string;
};

type PlannerAuditEntry = {
  audit_log_id: number;
  action_type: string;
  entity_type: string;
  change_summary?: string | null;
  created_at: string;
};

type PlannerDocument = {
  document_id: number;
  title: string;
  document_code: string;
  current_version_no: number;
  category: string;
  created_at: string;
};

type PlannerAuthMe = {
  full_name?: string | null;
  can_access_recruitment?: boolean;
  can_access_planner?: boolean;
};

const statusOptions = ["not_started", "in_progress", "to_be_checked", "completed", "hold"];
const priorityOptions = ["low", "medium", "high"];
const planLayers = ["live_plan", "contract_baseline", "approved_change"];

function metricTone(kind: "base" | "success" | "warning" | "danger") {
  if (kind === "success") return { background: "rgba(31,122,76,0.12)", color: "var(--success)" };
  if (kind === "warning") return { background: "rgba(187,122,19,0.12)", color: "var(--warning)" };
  if (kind === "danger") return { background: "rgba(184,61,45,0.12)", color: "var(--danger)" };
  return { background: "rgba(196,93,44,0.12)", color: "var(--accent-deep)" };
}

export function PlannerShell({ initialMe }: { initialMe?: PlannerAuthMe | null }) {
  const [board, setBoard] = useState<PlannerBoard | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [newRowOpen, setNewRowOpen] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [requestItems, setRequestItems] = useState<PlannerRequest[]>([]);
  const [auditItems, setAuditItems] = useState<PlannerAuditEntry[]>([]);
  const [documentItems, setDocumentItems] = useState<PlannerDocument[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  async function loadBoard(filterProject?: string) {
    setLoading(true);
    setError("");
    try {
      const query = filterProject && filterProject !== "all" ? `?project_code=${encodeURIComponent(filterProject)}` : "";
      const response = await fetch(`/planner/api/board${query}`, { cache: "no-store" });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(extractDetail(text));
      }
      setBoard(JSON.parse(text) as PlannerBoard);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load planner board");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBoard(projectFilter);
  }, [projectFilter]);

  const visibleRows = useMemo(() => {
    const rows = board?.items || [];
    if (projectFilter === "all") return rows;
    return rows.filter((row) => row.project_code === projectFilter);
  }, [board?.items, projectFilter]);

  const selectedRow = useMemo(
    () => visibleRows.find((row) => row.planner_row_id === selectedRowId) || null,
    [selectedRowId, visibleRows],
  );

  useEffect(() => {
    if (!visibleRows.length) {
      setSelectedRowId(null);
      return;
    }
    if (!selectedRowId || !visibleRows.some((row) => row.planner_row_id === selectedRowId)) {
      setSelectedRowId(visibleRows[0].planner_row_id);
    }
  }, [selectedRowId, visibleRows]);

  useEffect(() => {
    async function loadContext() {
      if (!selectedRow) {
        setRequestItems([]);
        setAuditItems([]);
        setDocumentItems([]);
        return;
      }
      setActivityLoading(true);
      try {
        const [requestsRes, auditRes, docsRes] = await Promise.all([
          fetch(`/planner/api/requests?project_code=${encodeURIComponent(selectedRow.project_code)}&request_status=pending`, { cache: "no-store" }),
          fetch(`/planner/api/audit?planner_row_id=${selectedRow.planner_row_id}`, { cache: "no-store" }),
          fetch(`/planner/api/rows/${selectedRow.planner_row_id}/documents`, { cache: "no-store" }),
        ]);
        const [requestsText, auditText, docsText] = await Promise.all([requestsRes.text(), auditRes.text(), docsRes.text()]);
        if (requestsRes.ok) {
          const requestData = JSON.parse(requestsText) as PlannerRequest[];
          setRequestItems(requestData.filter((item) => requestData && item.request_status === "pending").slice(0, 8));
        }
        if (auditRes.ok) {
          setAuditItems((JSON.parse(auditText) as PlannerAuditEntry[]).slice(0, 10));
        }
        if (docsRes.ok) {
          setDocumentItems(JSON.parse(docsText) as PlannerDocument[]);
        }
      } catch {
        // Keep board usable if sidecar data fails.
      } finally {
        setActivityLoading(false);
      }
    }

    void loadContext();
  }, [selectedRow]);

  async function patchRow(plannerRowId: number, payload: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/planner/api/rows/${plannerRowId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(extractDetail(text));
      await loadBoard(projectFilter);
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "Unable to update row");
    } finally {
      setSaving(false);
    }
  }

  async function reviewRow(plannerRowId: number, decision: "approve" | "reject") {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/planner/api/rows/${plannerRowId}/${decision}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approval_note: `${decision}d from planner workspace` }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(extractDetail(text));
      await loadBoard(projectFilter);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : `Unable to ${decision} row`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(plannerRowId: number) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/planner/api/rows/${plannerRowId}`, { method: "DELETE" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(extractDetail(text));
      }
      await loadBoard(projectFilter);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete row");
    } finally {
      setSaving(false);
    }
  }

  async function recalculateProject(projectCode: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/planner/api/projects/${encodeURIComponent(projectCode)}/recalculate`, { method: "POST" });
      const text = await response.text();
      if (!response.ok) throw new Error(extractDetail(text));
      await loadBoard(projectFilter);
    } catch (recalcError) {
      setError(recalcError instanceof Error ? recalcError.message : "Unable to recalculate project schedule");
    } finally {
      setSaving(false);
    }
  }

  async function submitQuickRequest() {
    if (!selectedRow) return;
    const requestReason = window.prompt("Enter the change request reason");
    if (!requestReason) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/planner/api/rows/${selectedRow.planner_row_id}/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request_type: "schedule",
          request_reason: requestReason,
          proposed_updates: {
            change_type: selectedRow.change_type === "none" ? "modified" : selectedRow.change_type,
            change_reason: requestReason,
          },
        }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(extractDetail(text));
      await loadBoard(projectFilter);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create request");
    } finally {
      setSaving(false);
    }
  }

  async function uploadQuickDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRow) return;
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/planner/api/rows/${selectedRow.planner_row_id}/documents`, {
        method: "POST",
        body: formData,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(extractDetail(text));
      (event.currentTarget as HTMLFormElement).reset();
      await loadBoard(projectFilter);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload document");
    } finally {
      setSaving(false);
    }
  }

  async function createRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const payload = {
        project_code: String(formData.get("project_code") || "").trim(),
        project_name: String(formData.get("project_name") || "").trim(),
        activity_code: String(formData.get("activity_code") || "").trim(),
        activity_title: String(formData.get("activity_title") || "").trim(),
        activity_description: String(formData.get("activity_description") || "").trim() || null,
        stage_code: String(formData.get("stage_code") || "").trim() || null,
        package_code: String(formData.get("package_code") || "").trim() || null,
        plan_layer: String(formData.get("plan_layer") || "live_plan"),
        priority: String(formData.get("priority") || "medium"),
        activity_status: String(formData.get("activity_status") || "not_started"),
        change_type: String(formData.get("change_type") || "none"),
        change_reason: String(formData.get("change_reason") || "").trim() || null,
      };
      const response = await fetch("/planner/api/rows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(extractDetail(text));
      setNewRowOpen(false);
      event.currentTarget.reset();
      await loadBoard(projectFilter);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create row");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={styles.hero}>
        <div>
          <div style={styles.kicker}>Studio Lotus Planner</div>
          <h1 style={styles.title}>Operational planning with role-based visibility and approval control.</h1>
          <p style={styles.subtitle}>
            Built as a dedicated workspace for Group Leaders, Project Anchors, Senior Architects, Architects, Principals, and Super Admin.
          </p>
          <div style={styles.appLinks}>
            <a href="/employee" style={styles.appLink}>Workbook</a>
            {initialMe?.can_access_recruitment ? <a href="/recruitment/dashboard" style={styles.appLink}>Recruitment</a> : null}
            {initialMe?.can_access_planner ? <a href="/planner" style={styles.appLinkActive}>Project Planner</a> : null}
          </div>
        </div>
        <div style={styles.actorCard}>
          <div style={styles.actorLabel}>Current actor</div>
          <div style={styles.actorName}>{board?.actor.full_name || initialMe?.full_name || "Unknown user"}</div>
          <div style={styles.actorRole}>{board?.actor.planner_role || "viewer"}</div>
        </div>
      </div>

      <section style={styles.metricsGrid}>
        <MetricCard label="Total lines" value={String(board?.summary.total_rows || 0)} icon={<ClipboardCheck size={18} />} kind="base" />
        <MetricCard label="Pending work" value={String(board?.summary.pending_rows || 0)} icon={<AlertCircle size={18} />} kind="warning" />
        <MetricCard label="Completed" value={String(board?.summary.completed_rows || 0)} icon={<CheckCircle2 size={18} />} kind="success" />
        <MetricCard label="Approval inbox" value={String(board?.summary.pending_approvals || 0)} icon={<ShieldCheck size={18} />} kind="danger" />
        <MetricCard label="Critical path" value={String(board?.summary.critical_rows || 0)} icon={<RefreshCcw size={18} />} kind="warning" />
        <MetricCard label="Documents" value={String(board?.summary.attached_documents || 0)} icon={<FileStack size={18} />} kind="base" />
      </section>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <div style={styles.panelTitle}>Control Board</div>
            <div style={styles.panelMeta}>Filter by project, update status, raise scope changes, and review pending approvals.</div>
          </div>
          <div style={styles.toolbar}>
            <label style={styles.filterWrap}>
              <Filter size={16} />
              <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} style={styles.select}>
                <option value="all">All visible projects</option>
                {(board?.projects || []).map((project) => (
                  <option key={project.project_code} value={project.project_code}>
                    {project.project_code} - {project.project_name}
                  </option>
                ))}
              </select>
            </label>
            {board?.actor.can_create ? (
              <button type="button" style={styles.primaryButton} onClick={() => setNewRowOpen((current) => !current)}>
                <Plus size={16} />
                New Activity
              </button>
            ) : null}
            {selectedRow ? (
              <button type="button" style={styles.secondaryButton} onClick={() => void recalculateProject(selectedRow.project_code)} disabled={saving}>
                <RefreshCcw size={16} />
                Recalculate
              </button>
            ) : null}
          </div>
        </div>

        {newRowOpen ? (
          <form onSubmit={createRow} style={styles.formGrid}>
            <input name="project_code" placeholder="Project code" required style={styles.input} />
            <input name="project_name" placeholder="Project name" required style={styles.input} />
            <input name="activity_code" placeholder="Activity code" required style={styles.input} />
            <input name="activity_title" placeholder="Activity title" required style={styles.input} />
            <input name="stage_code" placeholder="Stage" style={styles.input} />
            <input name="package_code" placeholder="Package" style={styles.input} />
            <select name="plan_layer" defaultValue="live_plan" style={styles.input}>
              {planLayers.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select name="activity_status" defaultValue="not_started" style={styles.input}>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select name="priority" defaultValue="medium" style={styles.input}>
              {priorityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select name="change_type" defaultValue="none" style={styles.input}>
              <option value="none">none</option>
              <option value="added">added</option>
              <option value="modified">modified</option>
              <option value="removed">removed</option>
            </select>
            <textarea name="activity_description" placeholder="Activity description" style={{ ...styles.input, minHeight: 88, gridColumn: "span 2" }} />
            <textarea name="change_reason" placeholder="Change reason for approval-routed requests" style={{ ...styles.input, minHeight: 88, gridColumn: "span 2" }} />
            <div style={styles.formActions}>
              <button type="submit" style={styles.primaryButton} disabled={saving}>
                {saving ? <Loader2 size={16} /> : <Plus size={16} />}
                Create
              </button>
            </div>
          </form>
        ) : null}

        {error ? <div style={styles.errorBox}>{error}</div> : null}

        {loading ? (
          <div style={styles.loadingState}>
            <Loader2 size={18} className="spin" />
            Loading planner board...
          </div>
        ) : (
          <div style={styles.workspaceGrid}>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Project</th>
                  <th style={styles.th}>Activity</th>
                  <th style={styles.th}>Ownership</th>
                  <th style={styles.th}>Layer</th>
                  <th style={styles.th}>Progress</th>
                  <th style={styles.th}>Approval</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={row.planner_row_id}
                    style={selectedRowId === row.planner_row_id ? { ...styles.row, ...styles.rowSelected } : styles.row}
                    onClick={() => setSelectedRowId(row.planner_row_id)}
                  >
                    <td style={styles.td}>
                      <div style={styles.code}>{row.project_code}</div>
                      <div style={styles.meta}>{row.project_name}</div>
                      <div style={styles.meta}>{row.stage_code || "No stage"} / {row.package_code || "No package"}</div>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.code}>{row.activity_code}</div>
                      <div style={styles.titleCell}>{row.activity_title}</div>
                      {row.activity_description ? <div style={styles.meta}>{row.activity_description}</div> : null}
                      {row.change_reason ? <div style={styles.badgeMuted}>Reason: {row.change_reason}</div> : null}
                    </td>
                    <td style={styles.td}>
                      <div style={styles.metaStrong}>GL: {row.group_leader_name || "Unassigned"}</div>
                      <div style={styles.meta}>Anchor: {row.project_anchor_name || "Unassigned"}</div>
                      <div style={styles.meta}>SA: {row.senior_architect_name || "Unassigned"}</div>
                      <div style={styles.meta}>Owner: {row.assigned_to_name || "Unassigned"}</div>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.badge}>{row.plan_layer}</div>
                      <div style={styles.meta}>Change: {row.change_type}</div>
                      <div style={styles.meta}>Priority: {row.priority}</div>
                      <div style={styles.meta}>Critical: {row.is_critical ? "Yes" : "No"}</div>
                    </td>
                    <td style={styles.td}>
                      <select
                        style={styles.compactSelect}
                        value={row.activity_status}
                        disabled={!row.can_edit || saving}
                        onChange={(event) => void patchRow(row.planner_row_id, { activity_status: event.target.value })}
                      >
                        {statusOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <div style={styles.meta}>Completion: {row.percent_complete}%</div>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.badgeApproval(row.approval_status)}>{row.approval_status}</div>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actionStack}>
                        {row.can_approve ? (
                          <button type="button" style={styles.actionButtonSuccess} disabled={saving} onClick={() => void reviewRow(row.planner_row_id, "approve")}>
                            Approve
                          </button>
                        ) : null}
                        {row.can_reject ? (
                          <button type="button" style={styles.actionButtonWarn} disabled={saving} onClick={() => void reviewRow(row.planner_row_id, "reject")}>
                            Reject
                          </button>
                        ) : null}
                        {row.can_delete ? (
                          <button type="button" style={styles.actionButtonDanger} disabled={saving} onClick={() => void deleteRow(row.planner_row_id)}>
                            <Trash2 size={14} />
                            Archive
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!visibleRows.length ? (
                  <tr>
                    <td colSpan={7} style={styles.emptyState}>
                      No planner rows found for the current filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <aside style={styles.sidePanel}>
            <div style={styles.sideSection}>
              <div style={styles.sideHeading}>Selected Activity</div>
              {selectedRow ? (
                <>
                  <div style={styles.sideTitle}>{selectedRow.activity_title}</div>
                  <div style={styles.meta}>{selectedRow.project_code} / {selectedRow.activity_code}</div>
                  <div style={styles.meta}>Scheduled: {selectedRow.scheduled_start_date || "n/a"} to {selectedRow.scheduled_end_date || "n/a"}</div>
                  <div style={styles.meta}>Float: {selectedRow.float_days || 0} days</div>
                  <div style={styles.actionStack}>
                    <button type="button" style={styles.secondaryButton} onClick={() => void submitQuickRequest()} disabled={saving}>
                      Raise Request
                    </button>
                  </div>
                </>
              ) : (
                <div style={styles.meta}>Select a row to view activity context.</div>
              )}
            </div>

            <div style={styles.sideSection}>
              <div style={styles.sideHeading}><ShieldCheck size={16} /> Pending Requests</div>
              {activityLoading ? <div style={styles.meta}>Loading requests...</div> : requestItems.length ? requestItems.map((item) => (
                <div key={item.request_id} style={styles.feedItem}>
                  <div style={styles.feedTitle}>#{item.request_id} {item.request_type}</div>
                  <div style={styles.meta}>{item.request_reason || "No reason added"}</div>
                </div>
              )) : <div style={styles.meta}>No pending requests for this project.</div>}
            </div>

            <div style={styles.sideSection}>
              <div style={styles.sideHeading}><History size={16} /> Audit Trail</div>
              {activityLoading ? <div style={styles.meta}>Loading audit...</div> : auditItems.length ? auditItems.map((item) => (
                <div key={item.audit_log_id} style={styles.feedItem}>
                  <div style={styles.feedTitle}>{item.action_type}</div>
                  <div style={styles.meta}>{item.change_summary || item.entity_type}</div>
                  <div style={styles.meta}>{new Date(item.created_at).toLocaleString()}</div>
                </div>
              )) : <div style={styles.meta}>No audit history yet.</div>}
            </div>

            <div style={styles.sideSection}>
              <div style={styles.sideHeading}><FileStack size={16} /> Documents</div>
              {activityLoading ? <div style={styles.meta}>Loading documents...</div> : documentItems.length ? documentItems.map((item) => (
                <div key={item.document_id} style={styles.feedItem}>
                  <div style={styles.feedTitle}>{item.title}</div>
                  <div style={styles.meta}>{item.document_code} / v{item.current_version_no}</div>
                </div>
              )) : <div style={styles.meta}>No documents attached.</div>}
              {selectedRow ? (
                <form onSubmit={uploadQuickDocument} style={styles.uploadForm}>
                  <input name="title" placeholder="Document title" required style={styles.input} />
                  <select name="category" defaultValue="general" style={styles.input}>
                    <option value="general">general</option>
                    <option value="drawing">drawing</option>
                    <option value="minutes">minutes</option>
                    <option value="contract">contract</option>
                    <option value="reference">reference</option>
                  </select>
                  <input name="version_note" placeholder="Version note" style={styles.input} />
                  <input name="file" type="file" required style={styles.input} />
                  <button type="submit" style={styles.secondaryButton} disabled={saving}>
                    Upload Document
                  </button>
                </form>
              ) : null}
            </div>
          </aside>
          </div>
        )}
      </section>
    </main>
  );
}

function extractDetail(text: string) {
  try {
    const payload = JSON.parse(text);
    if (payload && typeof payload.detail === "string") return payload.detail;
  } catch {
    // ignore
  }
  return text || "Unexpected error";
}

function MetricCard({
  label,
  value,
  icon,
  kind,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  kind: "base" | "success" | "warning" | "danger";
}) {
  const tone = metricTone(kind);
  return (
    <div style={styles.metricCard}>
      <div style={{ ...styles.metricIcon, background: tone.background, color: tone.color }}>{icon}</div>
      <div>
        <div style={styles.metricValue}>{value}</div>
        <div style={styles.metricLabel}>{label}</div>
      </div>
    </div>
  );
}

const styles: Record<string, any> = {
  hero: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 20,
    marginBottom: 20,
    alignItems: "stretch",
  },
  kicker: {
    display: "inline-flex",
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(196,93,44,0.12)",
    color: "var(--accent-deep)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  title: {
    margin: "14px 0 10px",
    fontSize: "clamp(32px, 5vw, 54px)",
    lineHeight: 1,
    maxWidth: 900,
  },
  subtitle: {
    margin: 0,
    maxWidth: 780,
    color: "var(--muted)",
    fontSize: 16,
    lineHeight: 1.6,
  },
  actorCard: {
    border: "1px solid var(--stroke)",
    background: "linear-gradient(180deg, rgba(255,250,245,0.98), rgba(246,237,228,0.92))",
    borderRadius: 24,
    padding: 20,
    boxShadow: "var(--shadow)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  actorLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" },
  actorName: { fontSize: 24, fontWeight: 700, marginTop: 8 },
  actorRole: { marginTop: 8, color: "var(--accent-deep)", fontWeight: 600 },
  appLinks: { marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" },
  appLink: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(15,23,42,0.08)",
    color: "var(--ink-soft)",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 600,
  },
  appLinkActive: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(196,93,44,0.14)",
    border: "1px solid rgba(196,93,44,0.18)",
    color: "var(--accent-deep)",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 700,
  },
  metricsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 20 },
  metricCard: {
    border: "1px solid var(--stroke)",
    borderRadius: 20,
    background: "var(--surface-strong)",
    boxShadow: "var(--shadow)",
    padding: 18,
    display: "flex",
    gap: 14,
    alignItems: "center",
  },
  metricIcon: { width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center" },
  metricValue: { fontSize: 26, fontWeight: 700 },
  metricLabel: { fontSize: 13, color: "var(--muted)" },
  panel: { border: "1px solid var(--stroke)", background: "var(--surface)", borderRadius: 28, padding: 22, boxShadow: "var(--shadow)" },
  panelHeader: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap" },
  panelTitle: { fontSize: 24, fontWeight: 700 },
  panelMeta: { marginTop: 6, color: "var(--muted)" },
  toolbar: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },
  filterWrap: {
    display: "inline-flex",
    gap: 10,
    alignItems: "center",
    padding: "0 12px",
    borderRadius: 14,
    border: "1px solid var(--stroke)",
    background: "var(--surface-strong)",
    minHeight: 44,
  },
  select: { border: "none", background: "transparent", color: "var(--text)", minWidth: 220, outline: "none" },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    border: "none",
    borderRadius: 14,
    background: "linear-gradient(135deg, var(--accent), var(--accent-deep))",
    color: "white",
    fontWeight: 700,
    padding: "12px 16px",
    cursor: "pointer",
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid var(--stroke)",
    borderRadius: 14,
    background: "var(--surface-strong)",
    color: "var(--text)",
    fontWeight: 700,
    padding: "12px 16px",
    cursor: "pointer",
  },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 20 },
  formActions: { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" },
  input: {
    width: "100%",
    border: "1px solid var(--stroke)",
    background: "var(--surface-strong)",
    borderRadius: 14,
    padding: "12px 14px",
    outline: "none",
    color: "var(--text)",
  },
  errorBox: {
    border: "1px solid rgba(184,61,45,0.18)",
    background: "rgba(184,61,45,0.08)",
    color: "var(--danger)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  loadingState: {
    minHeight: 240,
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    color: "var(--muted)",
  },
  workspaceGrid: { display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 0.9fr)", gap: 18, alignItems: "start" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: "0 10px" },
  th: { textAlign: "left", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", padding: "0 12px" },
  row: { background: "var(--surface-strong)" },
  rowSelected: { outline: "2px solid rgba(196,93,44,0.28)" },
  td: { padding: 14, verticalAlign: "top", borderTop: "1px solid var(--stroke)", borderBottom: "1px solid var(--stroke)" },
  code: { fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent-deep)" },
  metaStrong: { fontSize: 14, fontWeight: 600 },
  meta: { fontSize: 13, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 },
  titleCell: { fontSize: 16, fontWeight: 700, marginTop: 6 },
  badge: {
    display: "inline-flex",
    padding: "7px 10px",
    borderRadius: 999,
    background: "rgba(196,93,44,0.11)",
    color: "var(--accent-deep)",
    fontSize: 12,
    fontWeight: 700,
  },
  badgeMuted: {
    display: "inline-flex",
    marginTop: 8,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(117,101,88,0.1)",
    color: "var(--muted)",
    fontSize: 12,
  },
  badgeApproval: (status: string) => ({
    display: "inline-flex",
    padding: "7px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    background:
      status === "approved"
        ? "rgba(31,122,76,0.12)"
        : status === "pending"
          ? "rgba(187,122,19,0.12)"
          : status === "rejected"
            ? "rgba(184,61,45,0.12)"
            : "rgba(117,101,88,0.1)",
    color:
      status === "approved"
        ? "var(--success)"
        : status === "pending"
          ? "var(--warning)"
          : status === "rejected"
            ? "var(--danger)"
            : "var(--muted)",
  }),
  compactSelect: {
    border: "1px solid var(--stroke)",
    background: "white",
    color: "var(--text)",
    padding: "8px 10px",
    borderRadius: 10,
    minWidth: 160,
  },
  actionStack: { display: "flex", gap: 8, flexWrap: "wrap" },
  actionButtonSuccess: {
    border: "none",
    borderRadius: 10,
    background: "rgba(31,122,76,0.12)",
    color: "var(--success)",
    padding: "9px 12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  actionButtonWarn: {
    border: "none",
    borderRadius: 10,
    background: "rgba(187,122,19,0.12)",
    color: "var(--warning)",
    padding: "9px 12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  actionButtonDanger: {
    border: "none",
    borderRadius: 10,
    background: "rgba(184,61,45,0.12)",
    color: "var(--danger)",
    padding: "9px 12px",
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    gap: 8,
    alignItems: "center",
  },
  sidePanel: {
    border: "1px solid var(--stroke)",
    borderRadius: 22,
    background: "var(--surface-strong)",
    padding: 16,
    display: "grid",
    gap: 14,
  },
  sideSection: {
    border: "1px solid var(--stroke)",
    borderRadius: 18,
    background: "rgba(255,255,255,0.5)",
    padding: 14,
    display: "grid",
    gap: 8,
  },
  sideHeading: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" },
  sideTitle: { fontSize: 18, fontWeight: 700 },
  feedItem: { borderTop: "1px solid var(--stroke)", paddingTop: 8 },
  feedTitle: { fontSize: 14, fontWeight: 700 },
  uploadForm: { display: "grid", gap: 10, marginTop: 10 },
  emptyState: { textAlign: "center", padding: 28, color: "var(--muted)" },
};
