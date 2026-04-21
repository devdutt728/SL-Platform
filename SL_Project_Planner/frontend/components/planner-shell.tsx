"use client";

import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, LogOut, Plus, RefreshCcw, Trash2 } from "lucide-react";

type PlannerRole = "super_admin" | "principal" | "group_leader" | "project_anchor" | "senior_architect" | "architect" | "viewer";

type PlannerBoard = {
  actor: {
    person_id_platform?: string | null;
    full_name?: string | null;
    planner_role: PlannerRole;
    planner_roles: PlannerRole[];
    can_view_all: boolean;
    can_create: boolean;
    can_create_project: boolean;
    can_edit_scoped: boolean;
    can_edit_assigned: boolean;
    can_approve_architect: boolean;
    can_approve_senior_architect: boolean;
    can_soft_delete: boolean;
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

type PlannerAssignableMember = {
  person_id: string;
  person_code?: string | null;
  full_name: string;
  email?: string | null;
  assigned_group_id?: number | null;
  assigned_group_name?: string | null;
};

type PlannerAssignmentWorkspace = {
  project_code?: string | null;
  can_assign: boolean;
  assignable_members: PlannerAssignableMember[];
  my_total_assigned_tasks: number;
  my_open_assigned_tasks: number;
};

type PlannerRow = {
  planner_row_id: number;
  project_code: string;
  project_name: string;
  contract_reference?: string | null;
  discipline_code?: string | null;
  stage_code?: string | null;
  package_code?: string | null;
  activity_code: string;
  activity_title: string;
  activity_description?: string | null;
  plan_layer: string;
  source_type?: string;
  change_type: string;
  change_reason?: string | null;
  activity_status: string;
  approval_status: string;
  priority: string;
  percent_complete: number | string;
  duration_days?: number | string | null;
  dependency_codes?: string | null;
  schedule_mode?: "manual" | "auto" | string | null;
  group_leader_person_id?: string | null;
  project_anchor_person_id?: string | null;
  assigned_to_person_id?: string | null;
  assigned_to_name?: string | null;
  senior_architect_name?: string | null;
  group_leader_name?: string | null;
  project_anchor_name?: string | null;
  baseline_start_date?: string | null;
  baseline_end_date?: string | null;
  live_start_date?: string | null;
  live_end_date?: string | null;
  scheduled_start_date?: string | null;
  scheduled_end_date?: string | null;
  float_days?: string | number | null;
  is_critical?: number;
  requester_roles?: PlannerRole[];
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_reject: boolean;
};

type PlannerDependency = {
  dependency_id: number;
  project_code: string;
  planner_row_id: number;
  predecessor_row_id: number;
  dependency_type: "finish_to_start" | "start_to_start" | "finish_to_finish" | "start_to_finish" | string;
  lag_days: number | string;
};

type StageBucket = {
  stage_key: string;
  stage_code: string;
  stage_no: number | null;
  stage_title: string;
  package_code: string | null;
  rows: PlannerRow[];
};

type RowInlineDraft = {
  stage_code: string;
  package_code: string;
  activity_title: string;
  activity_description: string;
  duration_days: string;
  dependency_codes: string;
  priority: string;
  activity_status: string;
  schedule_mode: string;
  change_reason: string;
  assigned_to_person_id: string;
};

type StageInlineDraft = {
  stage_code: string;
  stage_summary: string;
};

type PlannerRoleAssignment = {
  person_id: string;
  person_code?: string | null;
  full_name: string;
  email: string;
  status?: string | null;
  is_deleted?: number | null;
  department?: string | null;
  sub_department?: string | null;
  job_title?: string | null;
  planner_access: boolean;
  inferred_roles: PlannerRole[];
  explicit_roles: PlannerRole[];
  effective_roles: PlannerRole[];
};

type PlannerGroupSummary = {
  group_id: number;
  group_code: string;
  group_name: string;
  status?: string | null;
  group_leader_person_id?: string | null;
  group_leader_name?: string | null;
  member_count: number;
};

type PlannerGroupPerson = {
  person_id: string;
  person_code?: string | null;
  full_name: string;
  email: string;
  status?: string | null;
  department?: string | null;
  sub_department?: string | null;
  job_title?: string | null;
  assigned_group_id?: number | null;
  assigned_group_name?: string | null;
  already_member?: boolean;
};

type PlannerGroupLog = {
  log_id: number;
  group_id: number;
  person_id: string;
  person_name?: string | null;
  action_code: string;
  reason?: string | null;
  actor_person_id?: string | null;
  actor_name?: string | null;
  created_at?: string | null;
};

type PlannerGroupWorkspace = {
  can_manage_all_groups: boolean;
  groups: PlannerGroupSummary[];
  selected_group_id?: number | null;
  members: PlannerGroupPerson[];
  candidates: PlannerGroupPerson[];
  membership_logs: PlannerGroupLog[];
};

type PlannerLeaderCandidate = {
  person_id: string;
  person_code?: string | null;
  full_name: string;
  email: string;
  status?: string | null;
  department?: string | null;
  sub_department?: string | null;
  job_title?: string | null;
  planner_access: boolean;
  planner_roles: string[];
};

type PlannerAuthMe = {
  email?: string;
  full_name?: string | null;
  platform_role_name?: string | null;
  platform_role_code?: string | null;
  platform_role_names?: string[] | null;
  platform_role_codes?: string[] | null;
  can_access_recruitment?: boolean;
  can_access_planner?: boolean;
};

const statusDropdownOptions = [
  { uiValue: "to_be_assigned", backendValue: "not_started", label: "To be Assigned" },
  { uiValue: "not_started", backendValue: "not_started", label: "Not Started" },
  { uiValue: "in_progress", backendValue: "in_progress", label: "In Progress" },
  { uiValue: "to_be_checked", backendValue: "to_be_checked", label: "To be Checked" },
  { uiValue: "completed", backendValue: "completed", label: "Completed" },
  { uiValue: "hold", backendValue: "hold", label: "Holdup" },
] as const;
const backendStatusLabelMap: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  to_be_checked: "To be Checked",
  completed: "Completed",
  hold: "Holdup",
};

function normalizeStatusValue(value: string | null | undefined): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!normalized) return "not_started";
  if (normalized === "to_be_assigned") return "not_started";
  if (normalized === "holdup") return "hold";
  if (normalized in backendStatusLabelMap) return normalized;
  return "not_started";
}

function statusLabel(value: string | null | undefined): string {
  const normalized = normalizeStatusValue(value);
  return backendStatusLabelMap[normalized] || "Not Started";
}

function statusUiValueForRow(row: PlannerRow, value: string | null | undefined): string {
  const normalized = normalizeStatusValue(value);
  if (normalized === "not_started" && !String(row.assigned_to_person_id || "").trim()) {
    return "to_be_assigned";
  }
  return normalized;
}

function backendStatusFromUiValue(uiValue: string): string {
  const matched = statusDropdownOptions.find((option) => option.uiValue === uiValue);
  return matched ? matched.backendValue : normalizeStatusValue(uiValue);
}
const legacyDefaultStageDescription = "Default stage template row. Edit this deliverable as needed for the project.";
const defaultStageTemplates = [
  {
    stage_code: "Stage 0: Project Initiation",
    package_code: "Project Initiation",
    default_activity_title: "Contract signing and project kickoff",
    default_activity_description: "",
  },
  {
    stage_code: "Stage 1 & 2: Masterplan & Concept",
    package_code: "Masterplan & Concept",
    default_activity_title: "Review briefs, complete site analysis, and prepare concept options",
    default_activity_description: "",
  },
  {
    stage_code: "Stage 3 & 4: Architecture Schematic",
    package_code: "Architecture Schematic",
    default_activity_title: "Coordinate with consultants and finalize DBRs",
    default_activity_description: "",
  },
  {
    stage_code: "Stage 5: Statutory Sanctions",
    package_code: "Statutory Sanctions",
    default_activity_title: "Prepare statutory submission drawings for approvals",
    default_activity_description: "",
  },
  {
    stage_code: "Stage 6 & 7: Architecture Detailed Design",
    package_code: "Architecture Detailed Design",
    default_activity_title: "Develop detailed design package, material palette, and cost plan",
    default_activity_description: "",
  },
  {
    stage_code: "Stage 8: Architecture Tender Document",
    package_code: "Tender Documentation",
    default_activity_title: "Prepare tender package for bidding",
    default_activity_description: "",
  },
  {
    stage_code: "Stage 9 & 10: Construction Docs (GFC)",
    package_code: "Construction Docs (GFC)",
    default_activity_title: "Issue Good for Construction drawings",
    default_activity_description: "",
  },
  {
    stage_code: "Stage 11: Design Supervision",
    package_code: "Design Supervision",
    default_activity_title: "Provide design supervision during construction",
    default_activity_description: "",
  },
];

function sanitizeActivityDescription(value: string | null | undefined): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized === legacyDefaultStageDescription ? "" : normalized;
}

function roleLabel(role: PlannerRole | undefined) {
  if (!role) return "Viewer";
  return role.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

const plannerRolePriority: PlannerRole[] = [
  "super_admin",
  "principal",
  "group_leader",
  "project_anchor",
  "senior_architect",
  "architect",
  "viewer",
];

function highestPlannerRole(roles: PlannerRole[] | undefined): PlannerRole {
  const normalized = new Set((roles || []).filter(Boolean));
  for (const candidate of plannerRolePriority) {
    if (normalized.has(candidate)) return candidate;
  }
  return "viewer";
}

function manageablePlannerRoles(actorRoles: PlannerRole[] | undefined) {
  const normalized = new Set(actorRoles || []);
  if (normalized.has("super_admin")) return ["architect", "senior_architect", "project_anchor", "group_leader", "principal"] as PlannerRole[];
  if (normalized.has("group_leader")) return ["architect", "senior_architect", "project_anchor", "group_leader"] as PlannerRole[];
  return [] as PlannerRole[];
}

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function personOptionLabel(person: { full_name?: string | null; person_code?: string | null; email?: string | null; person_id?: string | null }) {
  const name = String(person.full_name || person.person_id || "").trim() || "Unknown";
  const code = String(person.person_code || "").trim();
  return code ? `${name} (${code})` : name;
}

function buildAutoProjectCode(projectName: string, existingCodes: string[]) {
  const token = projectName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
  const base = `PRJ-${token || "PROJECT"}`;
  const taken = new Set(existingCodes.map((value) => String(value || "").trim().toUpperCase()).filter(Boolean));
  if (!taken.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${String(index).padStart(2, "0")}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString().slice(-4)}`;
}

function parseStageNumber(value: string | null | undefined): number | null {
  const raw = String(value || "").trim();
  const match = raw.match(/^stage\s*(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseStageTitle(value: string | null | undefined, fallback = "Untitled Stage"): string {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const colonIndex = raw.indexOf(":");
  if (colonIndex >= 0) {
    const title = raw.slice(colonIndex + 1).trim();
    return title || fallback;
  }
  const stripped = raw.replace(/^stage\s*\d+(\s*&\s*\d+)?\s*/i, "").trim();
  return stripped || raw || fallback;
}

function formatStageCode(stageNo: number, stageTitle: string): string {
  const safeNumber = Math.max(1, Math.floor(stageNo || 1));
  const safeTitle = String(stageTitle || "").trim() || "Untitled Stage";
  return `Stage ${safeNumber}: ${safeTitle}`;
}

function buildStageBuckets(rows: PlannerRow[]): StageBucket[] {
  const map = new Map<string, StageBucket>();
  for (const row of rows) {
    const stageCode = String(row.stage_code || "").trim() || "Stage 999: Untitled Stage";
    const existing = map.get(stageCode);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    map.set(stageCode, {
      stage_key: stageCode,
      stage_code: stageCode,
      stage_no: parseStageNumber(stageCode),
      stage_title: parseStageTitle(stageCode, row.package_code || "Untitled Stage"),
      package_code: row.package_code || null,
      rows: [row],
    });
  }
  return Array.from(map.values()).sort((a, b) => {
    const aNo = a.stage_no ?? 999999;
    const bNo = b.stage_no ?? 999999;
    if (aNo !== bNo) return aNo - bNo;
    return a.stage_title.localeCompare(b.stage_title);
  });
}

function stageExpansionKey(projectCode: string, stageKey: string): string {
  return `${projectCode}::${stageKey}`;
}

function stageInlineDraftKey(projectCode: string, stageKey: string): string {
  return `${projectCode}::${stageKey}`;
}

function stageHeaderDescription(stage: StageBucket): string {
  const firstTaskTitle = String(stage.rows[0]?.activity_title || "").trim();
  if (firstTaskTitle) return firstTaskTitle;
  const explicitDescription = stage.rows
    .map((row) => sanitizeActivityDescription(row.activity_description))
    .find((value) => value.length > 0);
  if (explicitDescription) return explicitDescription;
  const packageLabel = String(stage.package_code || "").trim();
  return packageLabel || "No stage description";
}

function projectDateSnapshot(rows: PlannerRow[]) {
  const toDate = (value: string | null | undefined) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  };
  const startsContract = rows.map((row) => toDate(row.baseline_start_date)).filter((value): value is Date => Boolean(value));
  const endsContract = rows.map((row) => toDate(row.baseline_end_date)).filter((value): value is Date => Boolean(value));

  const formatIso = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : "");

  const contractStart = startsContract.length ? new Date(Math.min(...startsContract.map((value) => value.getTime()))) : null;
  const contractEnd = endsContract.length ? new Date(Math.max(...endsContract.map((value) => value.getTime()))) : null;
  return {
    baseline_start_date: formatIso(contractStart),
    baseline_end_date: formatIso(contractEnd),
  };
}

function rowDraftFromRow(row: PlannerRow): RowInlineDraft {
  return {
    stage_code: String(row.stage_code || "").trim(),
    package_code: String(row.package_code || "").trim(),
    activity_title: String(row.activity_title || "").trim(),
    activity_description: sanitizeActivityDescription(row.activity_description),
    duration_days: row.duration_days == null ? "" : String(row.duration_days),
    dependency_codes: String(row.dependency_codes || "").trim(),
    priority: String(row.priority || "medium"),
    activity_status: normalizeStatusValue(row.activity_status),
    schedule_mode: String(row.schedule_mode || "manual"),
    change_reason: String(row.change_reason || "").trim(),
    assigned_to_person_id: String(row.assigned_to_person_id || "").trim(),
  };
}

export function PlannerShell({ initialMe }: { initialMe?: PlannerAuthMe | null }) {
  const [activeTab, setActiveTab] = useState<"board" | "roles">("board");
  const [timelineView] = useState<"both" | "contract" | "live">("both");
  const [timelineMode, setTimelineMode] = useState<"linear" | "gantt">("linear");
  const [board, setBoard] = useState<PlannerBoard | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [newRowOpen, setNewRowOpen] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [expandedProjectCodes, setExpandedProjectCodes] = useState<string[]>([]);
  const [expandedStageKeys, setExpandedStageKeys] = useState<string[]>([]);
  const [selectedStageKey, setSelectedStageKey] = useState<string | null>(null);
  const [roleAssignments, setRoleAssignments] = useState<PlannerRoleAssignment[]>([]);
  const [roleLoading, setRoleLoading] = useState(false);
  const [groupWorkspace, setGroupWorkspace] = useState<PlannerGroupWorkspace | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [directorySearch, setDirectorySearch] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [pendingAddPersonIds, setPendingAddPersonIds] = useState<string[]>([]);
  const [leaderSearch, setLeaderSearch] = useState("");
  const [selectedLeaderPersonId, setSelectedLeaderPersonId] = useState<string>("");
  const [leaderCandidates, setLeaderCandidates] = useState<PlannerLeaderCandidate[]>([]);
  const [leaderLoading, setLeaderLoading] = useState(false);
  const [directorySaving, setDirectorySaving] = useState(false);
  const [bulkRoleCode, setBulkRoleCode] = useState<PlannerRole>("architect");
  const [bulkRemoveRoleCode, setBulkRemoveRoleCode] = useState<PlannerRole>("architect");
  const [directoryNotice, setDirectoryNotice] = useState<string>("");
  const [directoryError, setDirectoryError] = useState<string>("");
  const [deliverablesExpanded, setDeliverablesExpanded] = useState(true);
  const [rowDrafts, setRowDrafts] = useState<Record<number, RowInlineDraft>>({});
  const [editingStageInlineKey, setEditingStageInlineKey] = useState<string | null>(null);
  const [stageDrafts, setStageDrafts] = useState<Record<string, StageInlineDraft>>({});
  const [assignmentWorkspace, setAssignmentWorkspace] = useState<PlannerAssignmentWorkspace | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [showAssignedToMeOnly, setShowAssignedToMeOnly] = useState(false);
  const [leaderLookupOpen, setLeaderLookupOpen] = useState(false);

  async function loadBoard(filterProject?: string): Promise<PlannerBoard | null> {
    setLoading(true);
    setError("");
    try {
      const query = filterProject && filterProject !== "all" ? `?project_code=${encodeURIComponent(filterProject)}` : "";
      const response = await fetch(`/planner/api/board${query}`, { cache: "no-store" });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(extractDetail(text));
      }
      const parsed = JSON.parse(text) as PlannerBoard;
      setBoard(parsed);
      return parsed;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load planner board");
      return null;
    } finally {
      setLoading(false);
    }
  }

  const loadAssignmentWorkspace = useCallback(async (projectCode?: string | null) => {
    setAssignmentLoading(true);
    try {
      const params = new URLSearchParams();
      const normalizedProjectCode = String(projectCode || "").trim();
      if (normalizedProjectCode) {
        params.set("project_code", normalizedProjectCode);
      }
      const query = params.toString() ? `?${params.toString()}` : "";
      const response = await fetch(`/planner/api/assignments${query}`, { cache: "no-store" });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(extractDetail(text));
      }
      setAssignmentWorkspace(JSON.parse(text) as PlannerAssignmentWorkspace);
    } catch (assignmentError) {
      setAssignmentWorkspace(null);
      setError(assignmentError instanceof Error ? assignmentError.message : "Unable to load assignment workspace");
    } finally {
      setAssignmentLoading(false);
    }
  }, []);

  const loadGroupWorkspace = useCallback(async (options?: { groupId?: number | null; search?: string }) => {
    setGroupLoading(true);
    setDirectoryError("");
    try {
      const params = new URLSearchParams();
      const groupId = typeof options?.groupId === "number" ? options.groupId : selectedGroupId;
      if (typeof groupId === "number") {
        params.set("group_id", String(groupId));
      }
      const searchText = (options?.search ?? directorySearch).trim();
      if (searchText) {
        params.set("q", searchText);
      }
      const query = params.toString() ? `?${params.toString()}` : "";
      const response = await fetch(`/planner/api/groups${query}`, { cache: "no-store" });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(extractDetail(text));
      }
      const payload = JSON.parse(text) as PlannerGroupWorkspace;
      setGroupWorkspace(payload);
      const nextGroupId = typeof payload.selected_group_id === "number" ? payload.selected_group_id : null;
      if (nextGroupId !== selectedGroupId) {
        setSelectedGroupId(nextGroupId);
      }
    } catch (groupError) {
      setDirectoryError(groupError instanceof Error ? groupError.message : "Unable to load groups");
      setGroupWorkspace(null);
    } finally {
      setGroupLoading(false);
    }
  }, [directorySearch, selectedGroupId]);

  useEffect(() => {
    void loadBoard(projectFilter);
  }, [projectFilter]);

  useEffect(() => {
    if (projectFilter !== "all") return;
    const firstProjectCode = board?.projects?.[0]?.project_code;
    if (firstProjectCode) {
      setProjectFilter(firstProjectCode);
    }
  }, [board?.projects, projectFilter]);

  const visibleRows = useMemo(() => {
    let rows = board?.items || [];
    if (projectFilter !== "all") {
      rows = rows.filter((row) => row.project_code === projectFilter);
    }
    if (showAssignedToMeOnly) {
      const actorPersonId = String(board?.actor.person_id_platform || "").trim();
      if (actorPersonId) {
        rows = rows.filter((row) => String(row.assigned_to_person_id || "").trim() === actorPersonId);
      }
    }
    return rows;
  }, [board?.items, board?.actor.person_id_platform, projectFilter, showAssignedToMeOnly]);

  const selectedRow = useMemo(
    () => visibleRows.find((row) => row.planner_row_id === selectedRowId) || null,
    [selectedRowId, visibleRows],
  );
  const actorRole = board?.actor.planner_role || "viewer";
  const actorRoles = board?.actor.planner_roles || [actorRole];
  const isSuperAdmin = actorRoles.includes("super_admin");
  const assignableRoles = manageablePlannerRoles(actorRoles);
  const canManageGroups = actorRoles.includes("super_admin") || actorRoles.includes("group_leader");
  const canManagePlannerRoles = assignableRoles.length > 0;
  const canDeleteProjects = isSuperAdmin;
  const canEditTaskAssignments = Boolean(
    assignmentWorkspace?.can_assign ?? (board?.actor.can_edit_scoped || board?.actor.can_hard_delete),
  );
  const canAccessDirectory = canManagePlannerRoles || canManageGroups;
  const highestPlannerRoleLabel = roleLabel(highestPlannerRole(actorRoles));
  const displayName = board?.actor.full_name || initialMe?.full_name || "Unknown user";
  const initials = userInitials(displayName);
  const scopedSummaryRows = useMemo(() => {
    if (projectFilter !== "all") return visibleRows;
    if (selectedRow?.project_code) {
      return visibleRows.filter((row) => row.project_code === selectedRow.project_code);
    }
    const fallbackProjectCode = visibleRows[0]?.project_code;
    if (!fallbackProjectCode) return [] as PlannerRow[];
    return visibleRows.filter((row) => row.project_code === fallbackProjectCode);
  }, [projectFilter, selectedRow?.project_code, visibleRows]);
  const totalRows = scopedSummaryRows.length;
  const completedRows = scopedSummaryRows.filter((row) => normalizeStatusValue(row.activity_status) === "completed").length;
  const pendingRows = scopedSummaryRows.filter((row) => normalizeStatusValue(row.activity_status) !== "completed").length;
  const completionPct = totalRows > 0 ? Math.round((completedRows / totalRows) * 100) : 0;
  const selectedProject = useMemo(
    () => (board?.projects || []).find((project) => project.project_code === projectFilter) || null,
    [board?.projects, projectFilter],
  );
  const projectGroups = useMemo(() => {
    const map = new Map<string, { project_code: string; project_name: string; rows: PlannerRow[] }>();
    for (const row of visibleRows) {
      const existing = map.get(row.project_code);
      if (existing) {
        existing.rows.push(row);
        continue;
      }
      map.set(row.project_code, {
        project_code: row.project_code,
        project_name: row.project_name,
        rows: [row],
      });
    }
    return Array.from(map.values()).map((group) => ({
      ...group,
      rows: group.rows.slice().sort((a, b) => {
        const aStageNo = parseStageNumber(a.stage_code) ?? 999999;
        const bStageNo = parseStageNumber(b.stage_code) ?? 999999;
        if (aStageNo !== bStageNo) return aStageNo - bStageNo;
        const aStageTitle = parseStageTitle(a.stage_code, a.package_code || "Untitled Stage");
        const bStageTitle = parseStageTitle(b.stage_code, b.package_code || "Untitled Stage");
        if (aStageTitle !== bStageTitle) return aStageTitle.localeCompare(bStageTitle);
        const titleCompare = String(a.activity_title || "").localeCompare(String(b.activity_title || ""));
        if (titleCompare !== 0) return titleCompare;
        return a.planner_row_id - b.planner_row_id;
      }),
    }));
  }, [visibleRows]);
  const allStageExpansionKeys = useMemo(() => {
    return projectGroups.flatMap((group) =>
      buildStageBuckets(group.rows).map((stage) => stageExpansionKey(group.project_code, stage.stage_key)),
    );
  }, [projectGroups]);
  const boardProjectGroup = useMemo(() => {
    if (!projectGroups.length) return null;
    if (projectFilter !== "all") {
      return projectGroups.find((group) => group.project_code === projectFilter) || projectGroups[0];
    }
    return projectGroups[0];
  }, [projectGroups, projectFilter]);
  const boardProjectRows = useMemo(() => boardProjectGroup?.rows || [], [boardProjectGroup]);
  const mappedDays = useMemo(
    () => Math.round((boardProjectRows.length ? boardProjectRows : visibleRows).reduce((sum, row) => sum + rowDurationDays(row), 0)),
    [boardProjectRows, visibleRows],
  );
  const activeProjectCode = useMemo(() => {
    if (selectedRow?.project_code) return selectedRow.project_code;
    if (projectFilter !== "all") return projectFilter;
    return projectGroups[0]?.project_code || null;
  }, [projectFilter, projectGroups, selectedRow?.project_code]);
  const activeProjectRows = useMemo(
    () => (activeProjectCode ? (board?.items || []).filter((row) => row.project_code === activeProjectCode) : []),
    [activeProjectCode, board?.items],
  );
  const activeProjectStages = useMemo(() => buildStageBuckets(activeProjectRows), [activeProjectRows]);
  const selectedStage = useMemo(
    () => activeProjectStages.find((stage) => stage.stage_key === selectedStageKey) || null,
    [activeProjectStages, selectedStageKey],
  );
  const selectedGroup = useMemo(() => {
    if (!groupWorkspace || !groupWorkspace.groups.length) return null;
    const targetId = selectedGroupId ?? groupWorkspace.selected_group_id;
    if (typeof targetId !== "number") return groupWorkspace.groups[0];
    return groupWorkspace.groups.find((group) => group.group_id === targetId) || groupWorkspace.groups[0];
  }, [groupWorkspace, selectedGroupId]);

  const groupMemberMap = useMemo(() => {
    return new Map((groupWorkspace?.members || []).map((person) => [person.person_id, person]));
  }, [groupWorkspace?.members]);

  const groupCandidateMap = useMemo(() => {
    return new Map((groupWorkspace?.candidates || []).map((person) => [person.person_id, person]));
  }, [groupWorkspace?.candidates]);

  const rolePeopleMap = useMemo(() => {
    return new Map(roleAssignments.map((person) => [person.person_id, person]));
  }, [roleAssignments]);

  const taskAssignmentOptions = useMemo(() => {
    const byId = new Map<string, { person_id: string; label: string }>();
    for (const person of assignmentWorkspace?.assignable_members || []) {
      const personId = String(person.person_id || "").trim();
      if (!personId) continue;
      byId.set(personId, {
        person_id: personId,
        label: personOptionLabel(person),
      });
    }
    for (const person of roleAssignments) {
      const personId = String(person.person_id || "").trim();
      if (!personId || byId.has(personId)) continue;
      byId.set(personId, {
        person_id: personId,
        label: personOptionLabel(person),
      });
    }
    if (!byId.size) {
      for (const row of board?.items || []) {
        const personId = String(row.assigned_to_person_id || "").trim();
        if (!personId || byId.has(personId)) continue;
        byId.set(personId, {
          person_id: personId,
          label: String(row.assigned_to_name || personId),
        });
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [assignmentWorkspace?.assignable_members, roleAssignments, board?.items]);

  const directoryPeople = useMemo(() => {
    const ids = new Set<string>([...groupMemberMap.keys(), ...groupCandidateMap.keys(), ...rolePeopleMap.keys()]);
    return Array.from(ids)
      .map((personId) => {
        const memberPerson = groupMemberMap.get(personId);
        const candidatePerson = groupCandidateMap.get(personId);
        const rolePerson = rolePeopleMap.get(personId);
        const profilePerson = rolePerson || memberPerson || candidatePerson;
        const assignedGroupId =
          memberPerson && selectedGroup
            ? selectedGroup.group_id
            : (candidatePerson?.assigned_group_id ?? null);
        const assignedGroupName =
          memberPerson && selectedGroup
            ? selectedGroup.group_name
            : (candidatePerson?.assigned_group_name ?? null);
        return {
          person_id: personId,
          full_name: profilePerson?.full_name || personId,
          email: profilePerson?.email || "-",
          department: profilePerson?.department || null,
          job_title: profilePerson?.job_title || null,
          planner_access: rolePerson?.planner_access || false,
          explicit_roles: rolePerson?.explicit_roles || [],
          effective_roles: rolePerson?.effective_roles || [],
          assigned_group_id: assignedGroupId,
          assigned_group_name: assignedGroupName,
        };
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [groupMemberMap, groupCandidateMap, rolePeopleMap, selectedGroup]);

  const selectedPeopleSet = useMemo(() => new Set(selectedPeople), [selectedPeople]);
  const groupMemberIdSet = useMemo(
    () => new Set((groupWorkspace?.members || []).map((member) => member.person_id)),
    [groupWorkspace?.members],
  );
  const roleSeedPersonIds = useMemo(() => {
    if (!canManageGroups) return [] as string[];
    const ids = new Set((groupWorkspace?.members || []).map((member) => member.person_id));
    const leaderPersonId = String(selectedGroup?.group_leader_person_id || "").trim();
    if (leaderPersonId) ids.add(leaderPersonId);
    return Array.from(ids);
  }, [canManageGroups, groupWorkspace?.members, selectedGroup?.group_leader_person_id]);
  const groupMemberRows = useMemo(
    () => directoryPeople.filter((person) => groupMemberIdSet.has(person.person_id)),
    [directoryPeople, groupMemberIdSet],
  );
  const isDirectorySearching = directorySearch.trim().length > 0;
  const pendingAddSet = useMemo(() => new Set(pendingAddPersonIds), [pendingAddPersonIds]);
  const groupSearchCandidates = useMemo(() => {
    if (!canManageGroups || !selectedGroup || !isDirectorySearching) return [] as PlannerGroupPerson[];
    return (groupWorkspace?.candidates || [])
      .filter((person) => {
        const assignedElsewhere = typeof person.assigned_group_id === "number" && person.assigned_group_id !== selectedGroup.group_id;
        return !assignedElsewhere && !groupMemberIdSet.has(person.person_id);
      })
      .slice(0, 60);
  }, [canManageGroups, selectedGroup, isDirectorySearching, groupWorkspace?.candidates, groupMemberIdSet]);
  const groupLeaderOptions = useMemo(() => {
    const map = new Map<string, PlannerLeaderCandidate>();
    for (const person of leaderCandidates) {
      map.set(person.person_id, person);
    }
    if (leaderSearch.trim().length < 2 && selectedGroup?.group_leader_person_id && !map.has(selectedGroup.group_leader_person_id)) {
      map.set(selectedGroup.group_leader_person_id, {
        person_id: selectedGroup.group_leader_person_id,
        full_name: selectedGroup.group_leader_name || selectedGroup.group_leader_person_id,
        email: "",
        planner_access: false,
        planner_roles: [],
      });
    }
    return Array.from(map.values());
  }, [leaderCandidates, selectedGroup?.group_leader_person_id, selectedGroup?.group_leader_name, leaderSearch]);
  const selectedLeaderCandidate = useMemo(
    () =>
      groupLeaderOptions.find((person) => person.person_id === selectedLeaderPersonId)
      || (selectedGroup?.group_leader_person_id === selectedLeaderPersonId
        ? {
          person_id: selectedGroup.group_leader_person_id,
          full_name: selectedGroup.group_leader_name || selectedGroup.group_leader_person_id,
          email: "",
          planner_access: false,
          planner_roles: [],
        }
        : null),
    [groupLeaderOptions, selectedLeaderPersonId, selectedGroup?.group_leader_person_id, selectedGroup?.group_leader_name],
  );
  const visibleDirectoryPeople = useMemo(() => {
    if (!canManageGroups) return directoryPeople;
    return groupMemberRows;
  }, [canManageGroups, directoryPeople, groupMemberRows]);
  const selectedDirectoryRows = useMemo(
    () => visibleDirectoryPeople.filter((person) => selectedPeopleSet.has(person.person_id)),
    [visibleDirectoryPeople, selectedPeopleSet],
  );
  const allDirectorySelected = visibleDirectoryPeople.length > 0 && selectedDirectoryRows.length === visibleDirectoryPeople.length;
  const canSaveGroupChanges = Boolean(
    canManageGroups &&
      selectedGroup &&
      selectedDirectoryRows.length > 0 &&
      !directorySaving,
  );
  const canSavePendingAdds = Boolean(canManageGroups && selectedGroup && pendingAddPersonIds.length > 0 && !directorySaving);
  const canSaveLeaderAssignment = Boolean(isSuperAdmin && selectedGroup && selectedLeaderPersonId && !directorySaving);
  const canSaveRoleChanges = Boolean(canManagePlannerRoles && assignableRoles.length > 0 && selectedDirectoryRows.length > 0 && !directorySaving);
  const manageableRoleSet = useMemo(() => new Set<PlannerRole>(assignableRoles), [assignableRoles]);
  const canRemoveSelectedRole = Boolean(canManagePlannerRoles && assignableRoles.length > 0 && selectedDirectoryRows.length > 0 && !directorySaving);

  const loadRoleAssignments = useCallback(async () => {
    if (!canManagePlannerRoles || activeTab !== "roles") {
      setRoleAssignments([]);
      return;
    }
    setRoleLoading(true);
    setDirectoryError("");
    try {
      const params = new URLSearchParams();
      if (directorySearch.trim()) params.set("q", directorySearch.trim());
      if (roleSeedPersonIds.length) params.set("person_ids", roleSeedPersonIds.join(","));
      params.set("limit", "200");
      const query = params.toString() ? `?${params.toString()}` : "";
      const response = await fetch(`/planner/api/role-assignments${query}`, { cache: "no-store" });
      const text = await response.text();
      if (!response.ok) throw new Error(extractDetail(text));
      setRoleAssignments(JSON.parse(text) as PlannerRoleAssignment[]);
    } catch (roleError) {
      setDirectoryError(roleError instanceof Error ? roleError.message : "Unable to load planner role assignments");
    } finally {
      setRoleLoading(false);
    }
  }, [canManagePlannerRoles, activeTab, directorySearch, roleSeedPersonIds]);

  useEffect(() => {
    if (!canAccessDirectory && activeTab === "roles") {
      setActiveTab("board");
    }
  }, [activeTab, canAccessDirectory]);

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
    setRowDrafts({});
  }, [board?.items]);

  useEffect(() => {
    if (!selectedRow?.stage_code) return;
    const key = String(selectedRow.stage_code).trim();
    if (key) {
      setSelectedStageKey(key);
    }
  }, [selectedRow?.planner_row_id, selectedRow?.stage_code]);

  useEffect(() => {
    if (!activeProjectStages.length) {
      setSelectedStageKey(null);
      return;
    }
    if (!selectedStageKey || !activeProjectStages.some((stage) => stage.stage_key === selectedStageKey)) {
      setSelectedStageKey(activeProjectStages[0].stage_key);
    }
  }, [activeProjectStages, selectedStageKey]);

  useEffect(() => {
    if (!activeProjectCode || !selectedStageKey) return;
    const key = stageExpansionKey(activeProjectCode, selectedStageKey);
    setExpandedStageKeys((current) => (current.includes(key) ? current : [...current, key]));
  }, [activeProjectCode, selectedStageKey]);

  useEffect(() => {
    void loadAssignmentWorkspace(activeProjectCode);
  }, [activeProjectCode, loadAssignmentWorkspace]);

  // Keep selection flow one-way:
  // row -> stage (effect above), and stage -> row only on explicit UI actions.

  useEffect(() => {
    if (projectFilter === "all") return;
    setExpandedProjectCodes((current) => (current.includes(projectFilter) ? current : [...current, projectFilter]));
  }, [projectFilter]);

  useEffect(() => {
    void loadRoleAssignments();
  }, [loadRoleAssignments]);

  useEffect(() => {
    if (!canManageGroups || activeTab !== "roles") {
      setGroupWorkspace(null);
      return;
    }
    void loadGroupWorkspace();
  }, [canManageGroups, activeTab, loadGroupWorkspace]);

  useEffect(() => {
    setSelectedPeople((current) => current.filter((personId) => visibleDirectoryPeople.some((person) => person.person_id === personId)));
  }, [visibleDirectoryPeople]);

  useEffect(() => {
    setSelectedLeaderPersonId(selectedGroup?.group_leader_person_id || "");
    setLeaderSearch("");
    setLeaderLookupOpen(false);
  }, [selectedGroup?.group_id, selectedGroup?.group_leader_person_id]);

  useEffect(() => {
    async function loadLeaderCandidates() {
      if (!isSuperAdmin || !canManageGroups || activeTab !== "roles") {
        setLeaderCandidates([]);
        return;
      }
      const queryText = leaderSearch.trim();
      if (queryText.length < 2) {
        setLeaderCandidates([]);
        setLeaderLoading(false);
        return;
      }
      setLeaderLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("q", queryText);
        params.set("limit", "80");
        const query = params.toString() ? `?${params.toString()}` : "";
        const response = await fetch(`/planner/api/groups/leader-candidates${query}`, { cache: "no-store" });
        const text = await response.text();
        if (!response.ok) throw new Error(extractDetail(text));
        setLeaderCandidates(JSON.parse(text) as PlannerLeaderCandidate[]);
      } catch (leaderError) {
        setDirectoryError(leaderError instanceof Error ? leaderError.message : "Unable to load group leader candidates");
      } finally {
        setLeaderLoading(false);
      }
    }
    const timer = window.setTimeout(() => {
      void loadLeaderCandidates();
    }, 220);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isSuperAdmin, canManageGroups, activeTab, leaderSearch]);

  useEffect(() => {
    if (!assignableRoles.length) return;
    if (bulkRoleCode !== "viewer" && !assignableRoles.includes(bulkRoleCode)) {
      setBulkRoleCode(assignableRoles[0]);
    }
    if (!assignableRoles.includes(bulkRemoveRoleCode)) {
      setBulkRemoveRoleCode(assignableRoles[0]);
    }
  }, [assignableRoles, bulkRoleCode, bulkRemoveRoleCode]);

  async function patchRowRequest(plannerRowId: number, payload: Record<string, unknown>) {
    const response = await fetch(`/planner/api/rows/${plannerRowId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(extractDetail(text));
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

  async function deleteProject(projectCode: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/planner/api/projects/${encodeURIComponent(projectCode)}`, { method: "DELETE" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(extractDetail(text));
      }
      if (selectedRow?.project_code === projectCode) {
        setSelectedRowId(null);
      }
      setProjectFilter("all");
      await loadBoard("all");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete project");
    } finally {
      setSaving(false);
    }
  }

  function toggleProjectRows(projectCode: string) {
    setExpandedProjectCodes((current) =>
      current.includes(projectCode)
        ? current.filter((value) => value !== projectCode)
        : [...current, projectCode],
    );
  }

  function toggleStageRows(projectCode: string, stageKey: string) {
    const key = stageExpansionKey(projectCode, stageKey);
    setExpandedStageKeys((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key],
    );
  }

  function getRowDraft(row: PlannerRow): RowInlineDraft {
    return rowDrafts[row.planner_row_id] || rowDraftFromRow(row);
  }

  function patchRowDraft(row: PlannerRow, patch: Partial<RowInlineDraft>) {
    setRowDrafts((current) => ({
      ...current,
      [row.planner_row_id]: {
        ...(current[row.planner_row_id] || rowDraftFromRow(row)),
        ...patch,
      },
    }));
  }

  function stageDraftFromStage(stage: StageBucket): StageInlineDraft {
    return {
      stage_code: String(stage.stage_code || "").trim(),
      stage_summary: stageHeaderDescription(stage),
    };
  }

  function getStageDraft(projectCode: string, stage: StageBucket): StageInlineDraft {
    const key = stageInlineDraftKey(projectCode, stage.stage_key);
    return stageDrafts[key] || stageDraftFromStage(stage);
  }

  function patchStageDraft(projectCode: string, stage: StageBucket, patch: Partial<StageInlineDraft>) {
    const key = stageInlineDraftKey(projectCode, stage.stage_key);
    setStageDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] || stageDraftFromStage(stage)),
        ...patch,
      },
    }));
  }

  function beginStageInlineEdit(projectCode: string, stage: StageBucket) {
    const key = stageInlineDraftKey(projectCode, stage.stage_key);
    setStageDrafts((current) => ({
      ...current,
      [key]: current[key] || stageDraftFromStage(stage),
    }));
    setEditingStageInlineKey(key);
  }

  function cancelStageInlineEdit(projectCode: string, stage: StageBucket) {
    const key = stageInlineDraftKey(projectCode, stage.stage_key);
    setEditingStageInlineKey((current) => (current === key ? null : current));
    setStageDrafts((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function renumberProjectStagesByOrder(projectCode: string, orderedStageKeys: string[]) {
    const projectRows = (board?.items || []).filter((row) => row.project_code === projectCode);
    const stageMap = new Map<string, PlannerRow[]>();
    for (const row of projectRows) {
      const key = String(row.stage_code || "").trim() || "Stage 999: Untitled Stage";
      const existing = stageMap.get(key) || [];
      existing.push(row);
      stageMap.set(key, existing);
    }

    let stageNo = 1;
    for (const stageKey of orderedStageKeys) {
      const rowsInStage = stageMap.get(stageKey) || [];
      if (!rowsInStage.length) continue;
      const stageTitle = parseStageTitle(stageKey, rowsInStage[0].package_code || "Untitled Stage");
      const nextStageCode = formatStageCode(stageNo, stageTitle);
      for (const row of rowsInStage) {
        if ((row.stage_code || "") === nextStageCode) continue;
        await patchRowRequest(row.planner_row_id, { stage_code: nextStageCode });
      }
      stageNo += 1;
    }
  }

  async function insertStageRelative(position: "before" | "after") {
    if (!selectedStage || !activeProjectCode) return;
    const stageTitle = `${selectedStage.stage_title} ${position === "before" ? "Prep" : "Extension"}`.trim();
    if (!stageTitle) {
      setError("Stage title is required.");
      return;
    }
    const firstTaskTitle = "New task";

    const seedRow = selectedStage.rows[0] || selectedRow;
    if (!seedRow) return;

    setSaving(true);
    setError("");
    try {
      const tempStageCode = `Stage 999: ${stageTitle}`;
      const createResponse = await fetch("/planner/api/rows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_code: seedRow.project_code,
          project_name: seedRow.project_name,
          contract_reference: seedRow.contract_reference ?? null,
          discipline_code: seedRow.discipline_code ?? null,
          stage_code: tempStageCode,
          package_code: stageTitle,
          activity_code: "",
          activity_title: firstTaskTitle,
          activity_description: "",
          plan_layer: seedRow.plan_layer || "live_plan",
          source_type: "internal",
          change_type: "none",
          activity_status: "not_started",
          priority: "medium",
          baseline_start_date: seedRow.baseline_start_date ?? null,
          baseline_end_date: seedRow.baseline_end_date ?? null,
          live_start_date: null,
          live_end_date: null,
          duration_days: 1,
          schedule_mode: "auto",
          group_leader_person_id: selectedStage.rows[0]?.group_leader_person_id ?? null,
          project_anchor_person_id: selectedStage.rows[0]?.project_anchor_person_id ?? null,
        }),
      });
      const createText = await createResponse.text();
      if (!createResponse.ok) throw new Error(extractDetail(createText));

      const refreshedBoard = await loadBoard(projectFilter);
      const refreshedRows = (refreshedBoard?.items || board?.items || []).filter((row) => row.project_code === activeProjectCode);
      const refreshedStages = buildStageBuckets(refreshedRows);
      const orderedKeys = refreshedStages.map((stage) => stage.stage_key);
      const currentIdx = orderedKeys.findIndex((key) => key === selectedStage.stage_key);
      const insertedIdx = orderedKeys.findIndex((key) => key === tempStageCode);
      if (insertedIdx >= 0) {
        orderedKeys.splice(insertedIdx, 1);
      }
      const targetIdx = currentIdx < 0 ? orderedKeys.length : (position === "before" ? currentIdx : currentIdx + 1);
      orderedKeys.splice(Math.max(0, Math.min(targetIdx, orderedKeys.length)), 0, tempStageCode);

      await renumberProjectStagesByOrder(activeProjectCode, orderedKeys);
      const recalcResponse = await fetch(`/planner/api/projects/${encodeURIComponent(activeProjectCode)}/recalculate`, { method: "POST" });
      const recalcText = await recalcResponse.text();
      if (!recalcResponse.ok) throw new Error(extractDetail(recalcText));
      await loadBoard(projectFilter);
      setExpandedProjectCodes((current) => (current.includes(activeProjectCode) ? current : [...current, activeProjectCode]));
    } catch (stageError) {
      setError(stageError instanceof Error ? stageError.message : "Unable to insert stage");
    } finally {
      setSaving(false);
    }
  }

  async function removeSelectedStage() {
    if (!selectedStage || !activeProjectCode) return;

    setSaving(true);
    setError("");
    try {
      for (const row of selectedStage.rows) {
        const response = await fetch(`/planner/api/rows/${row.planner_row_id}`, { method: "DELETE" });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(extractDetail(text));
        }
      }
      const refreshedBoard = await loadBoard(projectFilter);
      const refreshedRows = (refreshedBoard?.items || board?.items || []).filter((row) => row.project_code === activeProjectCode);
      const refreshedStages = buildStageBuckets(refreshedRows);
      const orderedKeys = refreshedStages.map((stage) => stage.stage_key).filter((key) => key !== selectedStage.stage_key);
      await renumberProjectStagesByOrder(activeProjectCode, orderedKeys);
      const recalcResponse = await fetch(`/planner/api/projects/${encodeURIComponent(activeProjectCode)}/recalculate`, { method: "POST" });
      const recalcText = await recalcResponse.text();
      if (!recalcResponse.ok) throw new Error(extractDetail(recalcText));
      await loadBoard(projectFilter);
    } catch (stageError) {
      setError(stageError instanceof Error ? stageError.message : "Unable to remove stage");
    } finally {
      setSaving(false);
    }
  }

  async function restoreMissingTemplateStages() {
    if (!activeProjectCode) return;
    const seedRow = activeProjectRows[0] || selectedRow;
    if (!seedRow) {
      setError("Select a project row first.");
      return;
    }

    const existingTitles = new Set(
      activeProjectRows.map((row) => parseStageTitle(row.stage_code, row.package_code || "Untitled Stage").toLowerCase()),
    );

    setSaving(true);
    setError("");
    try {
      let created = 0;
      for (const template of defaultStageTemplates) {
        const titleKey = parseStageTitle(template.stage_code, template.package_code).toLowerCase();
        if (existingTitles.has(titleKey)) continue;

        const response = await fetch("/planner/api/rows", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            project_code: seedRow.project_code,
            project_name: seedRow.project_name,
            contract_reference: seedRow.contract_reference ?? null,
            discipline_code: seedRow.discipline_code ?? null,
            stage_code: template.stage_code,
            package_code: template.package_code,
            activity_code: "",
            activity_title: template.default_activity_title,
            activity_description: template.default_activity_description,
            plan_layer: seedRow.plan_layer || "live_plan",
            source_type: "contract",
            change_type: "none",
            activity_status: "not_started",
            priority: "medium",
            baseline_start_date: seedRow.baseline_start_date ?? null,
            baseline_end_date: seedRow.baseline_end_date ?? null,
            live_start_date: null,
            live_end_date: null,
            duration_days: 1,
            schedule_mode: "auto",
            group_leader_person_id: seedRow.group_leader_person_id ?? null,
            project_anchor_person_id: seedRow.project_anchor_person_id ?? null,
          }),
        });
        const text = await response.text();
        if (!response.ok) throw new Error(extractDetail(text));
        created += 1;
      }

      if (!created) {
        setError("All template stages already exist for this project.");
        return;
      }

      await loadBoard(projectFilter);
      setExpandedProjectCodes((current) => (current.includes(activeProjectCode) ? current : [...current, activeProjectCode]));
    } catch (stageError) {
      setError(stageError instanceof Error ? stageError.message : "Unable to restore missing template stages");
    } finally {
      setSaving(false);
    }
  }

  async function appendTaskAfterRow(anchorRow: PlannerRow, activityTitle: string, durationDays: number | null): Promise<boolean> {
    if (!anchorRow.can_edit) {
      setError("You do not have permission to add tasks for this stage.");
      return false;
    }

    setSaving(true);
    setError("");
    try {
      const currentBoardRows = board?.items || [];
      const projectCandidateRows = currentBoardRows.filter(
        (candidate) => candidate.project_code === anchorRow.project_code && candidate.planner_row_id !== anchorRow.planner_row_id,
      );
      const successorEdges: Array<{ successorRow: PlannerRow; edge: PlannerDependency }> = [];
      for (const candidate of projectCandidateRows) {
        const incomingResponse = await fetch(`/planner/api/rows/${candidate.planner_row_id}/dependencies`, { cache: "no-store" });
        const incomingText = await incomingResponse.text();
        if (!incomingResponse.ok) throw new Error(extractDetail(incomingText));
        const incomingEdges = JSON.parse(incomingText) as PlannerDependency[];
        const oldEdge = incomingEdges.find((edge) => edge.predecessor_row_id === anchorRow.planner_row_id);
        if (oldEdge) successorEdges.push({ successorRow: candidate, edge: oldEdge });
      }

      const createResponse = await fetch("/planner/api/rows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_code: anchorRow.project_code,
          project_name: anchorRow.project_name,
          contract_reference: anchorRow.contract_reference ?? null,
          discipline_code: anchorRow.discipline_code ?? null,
          stage_code: anchorRow.stage_code ?? null,
          package_code: anchorRow.package_code ?? null,
          activity_code: "",
          activity_title: activityTitle,
          activity_description: "",
          plan_layer: anchorRow.plan_layer || "live_plan",
          source_type: anchorRow.source_type || "internal",
          change_type: "none",
          activity_status: "not_started",
          priority: "medium",
          baseline_start_date: anchorRow.baseline_start_date ?? null,
          baseline_end_date: anchorRow.baseline_end_date ?? null,
          live_start_date: null,
          live_end_date: null,
          duration_days: durationDays,
          schedule_mode: "auto",
        }),
      });
      const createText = await createResponse.text();
      if (!createResponse.ok) throw new Error(extractDetail(createText));
      const createdRow = JSON.parse(createText) as PlannerRow;

      const linkResponse = await fetch(`/planner/api/rows/${createdRow.planner_row_id}/dependencies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          predecessor_row_id: anchorRow.planner_row_id,
          dependency_type: "finish_to_start",
          lag_days: 0,
        }),
      });
      const linkText = await linkResponse.text();
      if (!linkResponse.ok) throw new Error(extractDetail(linkText));

      for (const entry of successorEdges) {
        const removeEdgeResponse = await fetch(`/planner/api/dependencies/${entry.edge.dependency_id}`, { method: "DELETE" });
        if (!removeEdgeResponse.ok) {
          const errorText = await removeEdgeResponse.text();
          throw new Error(extractDetail(errorText));
        }

        const rewireResponse = await fetch(`/planner/api/rows/${entry.successorRow.planner_row_id}/dependencies`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            predecessor_row_id: createdRow.planner_row_id,
            dependency_type: entry.edge.dependency_type,
            lag_days: entry.edge.lag_days,
          }),
        });
        const rewireText = await rewireResponse.text();
        if (!rewireResponse.ok) throw new Error(extractDetail(rewireText));
      }

      const recalcResponse = await fetch(`/planner/api/projects/${encodeURIComponent(anchorRow.project_code)}/recalculate`, { method: "POST" });
      const recalcText = await recalcResponse.text();
      if (!recalcResponse.ok) throw new Error(extractDetail(recalcText));

      setExpandedProjectCodes((current) =>
        current.includes(anchorRow.project_code) ? current : [...current, anchorRow.project_code],
      );
      await loadBoard(projectFilter);
      setSelectedRowId(createdRow.planner_row_id);
      return true;
    } catch (appendError) {
      setError(appendError instanceof Error ? appendError.message : "Unable to add task");
      return false;
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

  async function saveProjectDates(event: FormEvent<HTMLFormElement>, projectCode: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      baseline_start_date: String(formData.get("baseline_start_date") || "").trim() || null,
      baseline_end_date: String(formData.get("baseline_end_date") || "").trim() || null,
    };
    const projectRows = (board?.items || []).filter((row) => row.project_code === projectCode && row.can_edit);
    if (!projectRows.length) {
      setError("You do not have permission to update project dates for this project.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      for (const row of projectRows) {
        await patchRowRequest(row.planner_row_id, payload);
      }
      const recalcResponse = await fetch(`/planner/api/projects/${encodeURIComponent(projectCode)}/recalculate`, { method: "POST" });
      const recalcText = await recalcResponse.text();
      if (!recalcResponse.ok) throw new Error(extractDetail(recalcText));
      await loadBoard(projectFilter);
    } catch (projectError) {
      setError(projectError instanceof Error ? projectError.message : "Unable to save project date range");
    } finally {
      setSaving(false);
    }
  }

  async function saveRowInline(row: PlannerRow) {
    const draft = getRowDraft(row);
    const durationRaw = String(draft.duration_days || "").trim();
    let durationValue: number | null = null;
    if (durationRaw) {
      const parsedDuration = Number(durationRaw);
      if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
        setError("Duration must be a positive number.");
        return;
      }
      durationValue = parsedDuration;
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        stage_code: draft.stage_code || row.stage_code || null,
        package_code: draft.package_code || null,
        activity_title: draft.activity_title || row.activity_title,
        activity_description: draft.activity_description || null,
        duration_days: durationValue,
        dependency_codes: draft.dependency_codes || null,
        priority: draft.priority || row.priority,
        activity_status: normalizeStatusValue(draft.activity_status || row.activity_status),
        schedule_mode: draft.schedule_mode || row.schedule_mode || "manual",
        change_reason: draft.change_reason || null,
      };
      if (canEditTaskAssignments) {
        payload.assigned_to_person_id = draft.assigned_to_person_id || null;
      }
      await patchRowRequest(row.planner_row_id, payload);
      await loadBoard(projectFilter);
    } catch (inlineError) {
      setError(inlineError instanceof Error ? inlineError.message : "Unable to update deliverable");
    } finally {
      setSaving(false);
    }
  }

  async function saveStageInline(projectCode: string, stage: StageBucket) {
    const draft = getStageDraft(projectCode, stage);
    const nextStageCode = String(draft.stage_code || "").trim();
    const nextStageSummary = String(draft.stage_summary || "").trim();
    if (!nextStageCode) {
      setError("Stage name is required.");
      return;
    }
    if (!nextStageSummary) {
      setError("Deliverable summary is required.");
      return;
    }
    const editableRows = stage.rows.filter((row) => row.can_edit);
    if (!editableRows.length) {
      setError("You do not have permission to update this stage.");
      return;
    }

    const stageTitle = parseStageTitle(nextStageCode, stage.stage_title || "Untitled Stage");
    const oldExpansionKey = stageExpansionKey(projectCode, stage.stage_key);
    const nextExpansionKey = stageExpansionKey(projectCode, nextStageCode);
    const key = stageInlineDraftKey(projectCode, stage.stage_key);
    const summaryAnchorRow = editableRows[0];

    setSaving(true);
    setError("");
    try {
      for (const row of editableRows) {
        const payload: Record<string, unknown> = {};
        if (String(row.stage_code || "").trim() !== nextStageCode) {
          payload.stage_code = nextStageCode;
        }
        if (String(row.package_code || "").trim() !== stageTitle) {
          payload.package_code = stageTitle;
        }
        if (Object.keys(payload).length > 0) {
          await patchRowRequest(row.planner_row_id, payload);
        }
      }
      if (summaryAnchorRow && String(summaryAnchorRow.activity_title || "").trim() !== nextStageSummary) {
        await patchRowRequest(summaryAnchorRow.planner_row_id, { activity_title: nextStageSummary });
      }

      setExpandedStageKeys((current) => current.map((value) => (value === oldExpansionKey ? nextExpansionKey : value)));
      setSelectedStageKey(nextStageCode);
      setEditingStageInlineKey((current) => (current === key ? null : current));
      setStageDrafts((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
      await loadBoard(projectFilter);
    } catch (inlineError) {
      setError(inlineError instanceof Error ? inlineError.message : "Unable to update stage");
    } finally {
      setSaving(false);
    }
  }

  async function appendTaskFromRowPrompt(row: PlannerRow) {
    await appendTaskAfterRow(row, "New task", 1);
  }

  async function createRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const formData = new FormData(formEl);
    setSaving(true);
    setError("");
    try {
      const projectName = String(formData.get("project_name") || "").trim();
      if (!projectName) {
        throw new Error("Project name is required");
      }
      const normalizedProjectName = projectName.toLowerCase();
      const existingProjects = board?.projects || [];
      const matchedProject = existingProjects.find((project) => project.project_name.trim().toLowerCase() === normalizedProjectName);
      const projectCode =
        matchedProject?.project_code
        || buildAutoProjectCode(projectName, existingProjects.map((project) => project.project_code));
      const basePayload = {
        project_code: projectCode,
        project_name: projectName,
        plan_layer: String(formData.get("plan_layer") || "live_plan"),
        activity_status: "not_started",
        priority: "medium",
        source_type: "contract",
        change_type: "none",
        baseline_start_date: String(formData.get("baseline_start_date") || "").trim() || null,
        baseline_end_date: String(formData.get("baseline_end_date") || "").trim() || null,
        live_start_date: null,
        live_end_date: null,
      };

      const postRow = async (payload: Record<string, unknown>) => {
        const response = await fetch("/planner/api/rows", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await response.text();
        if (!response.ok) throw new Error(extractDetail(text));
      };

      const existingStageCodes = new Set(
        (board?.items || [])
          .filter((row) => row.project_code === projectCode)
          .map((row) => String(row.stage_code || "").trim().toLowerCase())
          .filter(Boolean),
      );
      let createdCount = 0;
      for (const stage of defaultStageTemplates) {
        if (existingStageCodes.has(stage.stage_code.toLowerCase())) {
          continue;
        }
        await postRow({
          ...basePayload,
          activity_code: "",
          stage_code: stage.stage_code,
          package_code: stage.package_code,
          activity_title: stage.default_activity_title,
          activity_description: stage.default_activity_description,
        });
        createdCount += 1;
      }
      if (!createdCount) {
        throw new Error("This project already has all default stages.");
      }

      setNewRowOpen(false);
      formEl.reset();
      setProjectFilter(projectCode);
      await loadBoard(projectCode);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create row");
    } finally {
      setSaving(false);
    }
  }

  function toggleDirectoryPerson(personId: string, checked: boolean) {
    setSelectedPeople((current) => {
      if (checked) return Array.from(new Set([...current, personId]));
      return current.filter((value) => value !== personId);
    });
  }

  function toggleDirectoryAll(checked: boolean) {
    if (!checked) {
      setSelectedPeople([]);
      return;
    }
    setSelectedPeople(visibleDirectoryPeople.map((person) => person.person_id));
  }

  function togglePendingAdd(personId: string, checked: boolean) {
    setPendingAddPersonIds((current) => {
      if (checked) return Array.from(new Set([...current, personId]));
      return current.filter((value) => value !== personId);
    });
  }

  async function savePendingGroupAdds() {
    if (!selectedGroup || !pendingAddPersonIds.length) return;
    const reason = "bulk add";
    setDirectorySaving(true);
    setDirectoryError("");
    setDirectoryNotice("");
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    try {
      for (const personId of pendingAddPersonIds) {
        const response = await fetch(`/planner/api/groups/${selectedGroup.group_id}/members`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ person_id: personId, reason }),
        });
        if (response.ok) {
          updated += 1;
          continue;
        }
        if (response.status === 409 || response.status === 400 || response.status === 404) {
          skipped += 1;
          continue;
        }
        failed += 1;
      }
      await Promise.all([loadGroupWorkspace({ groupId: selectedGroup.group_id }), loadBoard(projectFilter)]);
      setPendingAddPersonIds([]);
      setDirectorySearch("");
      setDirectoryNotice(`Group add saved: ${updated} added, ${skipped} skipped, ${failed} failed.`);
    } catch (groupError) {
      setDirectoryError(groupError instanceof Error ? groupError.message : "Unable to add selected members");
    } finally {
      setDirectorySaving(false);
    }
  }

  async function saveSelectedGroupRemovals() {
    if (!selectedGroup || !selectedDirectoryRows.length) return;
    const reason = "bulk remove";
    setDirectorySaving(true);
    setDirectoryError("");
    setDirectoryNotice("");
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    try {
      for (const person of selectedDirectoryRows) {
        const inSelectedGroup = person.assigned_group_id === selectedGroup.group_id;
        if (!inSelectedGroup) {
          skipped += 1;
          continue;
        }
        const query = reason ? `?reason=${encodeURIComponent(reason)}` : "";
        const response = await fetch(`/planner/api/groups/${selectedGroup.group_id}/members/${encodeURIComponent(person.person_id)}${query}`, {
          method: "DELETE",
        });
        if (response.ok) updated += 1;
        else failed += 1;
      }
      await Promise.all([loadGroupWorkspace({ groupId: selectedGroup.group_id }), loadBoard(projectFilter)]);
      setSelectedPeople([]);
      setDirectoryNotice(`Group remove saved: ${updated} removed, ${skipped} skipped, ${failed} failed.`);
    } catch (groupError) {
      setDirectoryError(groupError instanceof Error ? groupError.message : "Unable to remove selected members");
    } finally {
      setDirectorySaving(false);
    }
  }

  async function saveGroupLeaderAssignment() {
    if (!selectedGroup) return;
    setDirectorySaving(true);
    setDirectoryError("");
    setDirectoryNotice("");
    try {
      const response = await fetch(`/planner/api/groups/${selectedGroup.group_id}/leader`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          person_id: selectedLeaderPersonId || null,
          reason: "manual leader assignment",
        }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(extractDetail(text));
      await Promise.all([loadGroupWorkspace({ groupId: selectedGroup.group_id }), loadBoard(projectFilter)]);
      setDirectoryNotice("Group leader updated.");
    } catch (groupError) {
      setDirectoryError(groupError instanceof Error ? groupError.message : "Unable to update group leader");
    } finally {
      setDirectorySaving(false);
    }
  }

  async function saveBulkRoleChanges() {
    if (!selectedDirectoryRows.length || !canManagePlannerRoles) return;
    setDirectorySaving(true);
    setDirectoryError("");
    setDirectoryNotice("");
    const desiredRoles = new Set<PlannerRole>(bulkRoleCode === "viewer" ? [] : [bulkRoleCode]);
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    try {
      for (const person of selectedDirectoryRows) {
        const explicitRoles = (person.explicit_roles || []) as PlannerRole[];
        const protectedRoles = explicitRoles.filter((role) => !manageableRoleSet.has(role));
        if (!isSuperAdmin && protectedRoles.length) {
          skipped += 1;
          continue;
        }
        const currentManageable = new Set(explicitRoles.filter((role) => manageableRoleSet.has(role)));
        let personAttempts = 0;
        for (const role of assignableRoles) {
          const hasRole = currentManageable.has(role);
          const shouldEnable = desiredRoles.has(role);
          if (hasRole === shouldEnable) {
            continue;
          }
          personAttempts += 1;
          const response = await fetch(`/planner/api/role-assignments/${encodeURIComponent(person.person_id)}/${encodeURIComponent(role)}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ enabled: shouldEnable }),
          });
          if (response.ok) {
            updated += 1;
          } else {
            failed += 1;
          }
        }
        if (personAttempts === 0) {
          skipped += 1;
        }
      }
      await Promise.all([loadRoleAssignments(), loadBoard(projectFilter)]);
      setDirectoryNotice(
        `Role profile applied (${roleLabel(bulkRoleCode)}): ${updated} role updates, ${skipped} users unchanged/skipped, ${failed} failed.`,
      );
    } catch (roleError) {
      setDirectoryError(roleError instanceof Error ? roleError.message : "Unable to save role changes");
    } finally {
      setDirectorySaving(false);
    }
  }

  async function removeSelectedRole() {
    if (!selectedDirectoryRows.length || !canManagePlannerRoles) return;
    setDirectorySaving(true);
    setDirectoryError("");
    setDirectoryNotice("");
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    try {
      for (const person of selectedDirectoryRows) {
        const explicitRoles = (person.explicit_roles || []) as PlannerRole[];
        const protectedRoles = explicitRoles.filter((role) => !manageableRoleSet.has(role));
        if (!isSuperAdmin && protectedRoles.length) {
          skipped += 1;
          continue;
        }
        if (!explicitRoles.includes(bulkRemoveRoleCode)) {
          skipped += 1;
          continue;
        }
        const response = await fetch(`/planner/api/role-assignments/${encodeURIComponent(person.person_id)}/${encodeURIComponent(bulkRemoveRoleCode)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        });
        if (response.ok) updated += 1;
        else failed += 1;
      }
      await Promise.all([loadRoleAssignments(), loadBoard(projectFilter)]);
      setDirectoryNotice(
        `Removed ${roleLabel(bulkRemoveRoleCode)}: ${updated} users updated, ${skipped} skipped, ${failed} failed.`,
      );
    } catch (roleError) {
      setDirectoryError(roleError instanceof Error ? roleError.message : "Unable to remove selected role");
    } finally {
      setDirectorySaving(false);
    }
  }

  async function removeRoleFromPerson(personId: string, role: PlannerRole) {
    if (!canManagePlannerRoles || !manageableRoleSet.has(role)) return;
    setDirectorySaving(true);
    setDirectoryError("");
    setDirectoryNotice("");
    try {
      const response = await fetch(`/planner/api/role-assignments/${encodeURIComponent(personId)}/${encodeURIComponent(role)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(extractDetail(text));
      await Promise.all([loadRoleAssignments(), loadBoard(projectFilter)]);
      setDirectoryNotice(`${roleLabel(role)} removed.`);
    } catch (roleError) {
      setDirectoryError(roleError instanceof Error ? roleError.message : "Unable to remove role");
    } finally {
      setDirectorySaving(false);
    }
  }

  function openNewProjectFlow() {
    setProjectFilter("all");
    setNewRowOpen(true);
  }

  function downloadDraftReport() {
    const lines: string[] = [];
    const timestamp = new Date().toISOString();
    lines.push("Studio Lotus - Planner Draft Report");
    lines.push(`Generated: ${timestamp}`);
    lines.push(`Project filter: ${projectFilter}`);
    lines.push(`Rows visible: ${visibleRows.length}`);
    lines.push(`Completed: ${completedRows}`);
    lines.push(`Pending: ${pendingRows}`);
    lines.push("");
    lines.push("Deliverables:");
    for (const row of visibleRows.slice(0, 200)) {
      lines.push(
        `- ${row.project_name} | ${row.activity_title} | status=${statusLabel(row.activity_status)} | complete=${row.percent_complete}%`,
      );
    }
    const payload = lines.join("\n");
    const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `planner-draft-report-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main style={styles.page}>
      <header style={styles.topbar}>
        <div style={styles.brandWrap}>
          <a href="/employee" style={styles.logoLink}>
            <img src="/studio-lotus-logo.png" alt="Studio Lotus" style={styles.logo} />
          </a>
          <div>
            <div style={styles.productEyebrow}>Internal Console</div>
            <div style={styles.productTitle}>Project Planner</div>
          </div>
        </div>
        <div style={styles.topbarActions}>
          {activeTab === "board" ? (
            <div style={styles.headerProjectControls}>
              <label style={styles.filterWrap}>
                <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} style={styles.select}>
                  {(board?.projects || []).map((project) => (
                    <option key={project.project_code} value={project.project_code}>
                      {project.project_name}
                    </option>
                  ))}
                </select>
              </label>
              {(board?.actor.can_create_project ?? board?.actor.can_create) ? (
                <button type="button" style={styles.primaryButton} onClick={openNewProjectFlow}>
                  + Create Project
                </button>
              ) : null}
              {canDeleteProjects ? (
                <button
                  type="button"
                  style={styles.actionButtonDanger}
                  onClick={() => {
                    if (!selectedProject) return;
                    void deleteProject(selectedProject.project_code);
                  }}
                  disabled={saving || !selectedProject}
                  title={selectedProject ? "Delete selected project" : "Select a project filter to delete"}
                >
                  <Trash2 size={14} />
                  {selectedProject ? "Delete Project" : "Delete Project (select one)"}
                </button>
              ) : null}
            </div>
          ) : null}
          <nav style={styles.appLinks}>
            <a href="/employee" style={styles.appLink}>Workbook</a>
            {initialMe?.can_access_recruitment ? <a href="/recruitment/dashboard" style={styles.appLink}>Recruitment</a> : null}
            {initialMe?.can_access_planner ? <a href="/planner" style={styles.appLinkActive}>Project Planner</a> : null}
          </nav>
          <div style={styles.userCard}>
            <div style={styles.userAvatar}>{initials}</div>
            <div style={styles.userInfo}>
              <div style={styles.userName}>{displayName}</div>
              <div style={styles.userMeta}>{highestPlannerRoleLabel}</div>
            </div>
            <a href="/api/auth/logout" style={styles.iconButton} aria-label="Sign out">
              <LogOut size={16} />
            </a>
          </div>
        </div>
      </header>

      <datalist id="planner-stage-options">
        {defaultStageTemplates.map((stage) => (
          <option key={stage.stage_code} value={stage.stage_code} />
        ))}
      </datalist>

      <section style={styles.metricsGrid}>
        <MetricCard label="Progress" value={`${completionPct}%`} kind="dark" footer={`${completedRows}/${totalRows} tasks`} />
        <MetricCard label="Pending" value={String(pendingRows)} kind="base" footer="Open tasks" />
        <MetricCard label="Mapped Days" value={String(mappedDays)} kind="orange" footer="Timeline" />
        <div style={styles.metricCardChart}>
          <div style={styles.metricLabel}>Overview</div>
          <DashboardOverviewChart
            total={totalRows}
            completed={completedRows}
            pending={pendingRows}
          />
        </div>
      </section>

      <section style={styles.tabBar}>
        <button
          type="button"
          style={activeTab === "board" ? styles.tabButtonActive : styles.tabButton}
          onClick={() => setActiveTab("board")}
        >
          Project Dashboard
        </button>
        {canAccessDirectory ? (
          <button
            type="button"
            style={activeTab === "roles" ? styles.tabButtonActive : styles.tabButton}
            onClick={() => setActiveTab("roles")}
          >
            Resource Directory
          </button>
        ) : null}
      </section>

      {activeTab === "roles" && canAccessDirectory ? (
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <div style={styles.panelTitle}>Resource Control</div>
              <div style={styles.panelMeta}>Default view shows current group members. Search to add members from master list, multi-select, then save once.</div>
            </div>
            <div style={styles.toolbar}>
              {canManageGroups ? (
                <label style={styles.filterWrap}>
                  <select
                    value={selectedGroup?.group_id || ""}
                    onChange={(event) => setSelectedGroupId(event.target.value ? Number(event.target.value) : null)}
                    style={styles.select}
                  >
                    {(groupWorkspace?.groups || []).map((group) => (
                      <option key={group.group_id} value={group.group_id}>
                        {group.group_code} - {group.group_name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {!canManageGroups ? (
                <input
                  value={directorySearch}
                  onChange={(event) => setDirectorySearch(event.target.value)}
                  placeholder="Search people by name, email, title, department"
                  style={{ ...styles.input, minWidth: 320 }}
                />
              ) : null}
            </div>
          </div>

          {directoryError ? <div style={styles.errorBox}>{directoryError}</div> : null}
          {directoryNotice ? <div style={styles.noticeBox}>{directoryNotice}</div> : null}

          <div style={styles.bulkActionGrid}>
            {canManageGroups ? (
              <div style={styles.bulkCard}>
                <div style={styles.panelTitleSmall}>Group Members</div>
                <div style={styles.meta}>Selected current members: {selectedDirectoryRows.length}</div>
                <div style={styles.actionStack}>
                  <button type="button" style={styles.secondaryButton} disabled={!canSaveGroupChanges} onClick={() => void saveSelectedGroupRemovals()}>
                    {directorySaving ? "Saving..." : "Save Group Changes"}
                  </button>
                </div>
                <div style={styles.groupPickerWrap}>
                  <input
                    value={directorySearch}
                    onChange={(event) => setDirectorySearch(event.target.value)}
                    placeholder="Search people to add (name, email, title, department)"
                    style={styles.input}
                  />
                  {isDirectorySearching ? (
                    <div style={styles.searchDropdown}>
                      {groupSearchCandidates.length ? groupSearchCandidates.map((person) => {
                        const checked = pendingAddSet.has(person.person_id);
                        return (
                          <label key={`candidate-option-${person.person_id}`} style={styles.dropdownRow}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => togglePendingAdd(person.person_id, event.target.checked)}
                            />
                            <span style={styles.metaStrong}>{person.full_name}</span>
                            <span style={styles.meta}>{person.department || "No department"}</span>
                          </label>
                        );
                      }) : (
                        <div style={styles.dropdownEmpty}>No available candidates for this search.</div>
                      )}
                    </div>
                  ) : null}
                  {pendingAddPersonIds.length ? (
                    <div style={styles.selectionChips}>
                      {pendingAddPersonIds.map((personId) => {
                        const person = groupSearchCandidates.find((candidate) => candidate.person_id === personId) || groupWorkspace?.candidates.find((candidate) => candidate.person_id === personId);
                        return (
                          <button
                            key={`pending-add-${personId}`}
                            type="button"
                            style={styles.quickChip}
                            onClick={() => togglePendingAdd(personId, false)}
                          >
                            {person?.full_name || personId} ×
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <button type="button" style={styles.primaryButton} disabled={!canSavePendingAdds} onClick={() => void savePendingGroupAdds()}>
                    {directorySaving ? "Saving..." : "Save Added Members"}
                  </button>
                </div>
              </div>
            ) : null}

            {isSuperAdmin && canManageGroups ? (
              <div style={styles.bulkCard}>
                <div style={styles.panelTitleSmall}>Group Leader (Superadmin)</div>
                <div style={styles.meta}>Current: {selectedGroup?.group_leader_name || "Not assigned"}</div>
                <input
                  value={leaderSearch}
                  onChange={(event) => {
                    setLeaderSearch(event.target.value);
                    setSelectedLeaderPersonId("");
                  }}
                  onFocus={() => setLeaderLookupOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setLeaderLookupOpen(false), 120);
                  }}
                  placeholder="Type at least 2 chars to search and select leader"
                  style={styles.input}
                />
                {leaderLookupOpen && leaderSearch.trim().length >= 2 ? (
                  <div style={styles.searchDropdown}>
                    {leaderLoading ? (
                      <div style={styles.dropdownEmpty}>Searching leader candidates...</div>
                    ) : groupLeaderOptions.length ? (
                      groupLeaderOptions.map((person) => (
                        <button
                          key={`leader-suggestion-${person.person_id}`}
                          type="button"
                          style={styles.searchSuggestionButton}
                          onMouseDown={() => {
                            setSelectedLeaderPersonId(person.person_id);
                            setLeaderSearch(personOptionLabel(person));
                            setLeaderLookupOpen(false);
                          }}
                        >
                          <span style={styles.metaStrong}>{personOptionLabel(person)}</span>
                          <span style={styles.meta}>
                            {person.email || "No email"} | {person.planner_access ? "Planner access" : "No planner access"}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div style={styles.dropdownEmpty}>No leader match found.</div>
                    )}
                  </div>
                ) : null}
                <div style={styles.meta}>
                  {selectedLeaderCandidate
                    ? `Selected: ${personOptionLabel(selectedLeaderCandidate)}`
                    : "Type and select one leader candidate."}
                </div>
                <div style={styles.actionStack}>
                  <button
                    type="button"
                    style={styles.primaryButton}
                    disabled={!canSaveLeaderAssignment}
                    onClick={() => void saveGroupLeaderAssignment()}
                  >
                    {directorySaving ? "Saving..." : "Save Group Leader"}
                  </button>
                </div>
              </div>
            ) : null}

            {canManagePlannerRoles ? (
              <div style={styles.bulkCard}>
                <div style={styles.panelTitleSmall}>Role Control</div>
                <div style={styles.meta}>Selected users: {selectedDirectoryRows.length}. Pick one role profile and save once.</div>
                <div style={styles.actionStack}>
                  <label style={styles.filterWrap}>
                    <select
                      value={bulkRoleCode}
                      onChange={(event) => setBulkRoleCode(event.target.value as PlannerRole)}
                      style={styles.select}
                    >
                      <option value="viewer">Viewer (no explicit planner role)</option>
                      {assignableRoles.map((role) => (
                        <option key={role} value={role}>{roleLabel(role)}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" style={styles.primaryButton} disabled={!canSaveRoleChanges} onClick={() => void saveBulkRoleChanges()}>
                    {directorySaving ? "Saving..." : "Apply Role Profile"}
                  </button>
                </div>
                <div style={styles.meta}>Need to remove a role from assigned users? Select the role and remove it directly.</div>
                <div style={styles.actionStack}>
                  <label style={styles.filterWrap}>
                    <select
                      value={bulkRemoveRoleCode}
                      onChange={(event) => setBulkRemoveRoleCode(event.target.value as PlannerRole)}
                      style={styles.select}
                    >
                      {assignableRoles.map((role) => (
                        <option key={`remove-${role}`} value={role}>{roleLabel(role)}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" style={styles.secondaryButton} disabled={!canRemoveSelectedRole} onClick={() => void removeSelectedRole()}>
                    {directorySaving ? "Saving..." : "Remove Selected Role"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {(roleLoading || groupLoading) && !visibleDirectoryPeople.length ? (
            <div style={styles.loadingState}>
              <Loader2 size={18} className="spin" />
              Loading resource directory...
            </div>
          ) : (
            <div style={styles.roleTableWrap}>
              {canManageGroups ? (
                <div style={styles.tableHint}>
                  Showing current group members. Use search above to pick new members and save once.
                </div>
              ) : null}
              <table style={styles.roleTable}>
                <thead>
                  <tr>
                    <th style={styles.th}>
                      <input
                        type="checkbox"
                        checked={allDirectorySelected}
                        onChange={(event) => toggleDirectoryAll(event.target.checked)}
                      />
                    </th>
                    <th style={styles.th}>User</th>
                    <th style={styles.th}>Profile</th>
                    <th style={styles.th}>Group</th>
                    <th style={styles.th}>Effective Roles</th>
                    <th style={styles.th}>Explicit Roles</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDirectoryPeople.map((person) => (
                    <tr key={person.person_id} style={styles.row}>
                      <td style={styles.tdCompact}>
                        <input
                          type="checkbox"
                          checked={selectedPeopleSet.has(person.person_id)}
                          onChange={(event) => toggleDirectoryPerson(person.person_id, event.target.checked)}
                        />
                      </td>
                      <td style={styles.tdCompact}>
                        <div style={styles.metaStrong}>{person.full_name}</div>
                        <div style={styles.meta}>{person.email}</div>
                        <div style={styles.meta}>ID: {person.person_id}</div>
                      </td>
                      <td style={styles.tdCompact}>
                        <div style={styles.meta}>{person.job_title || "No title"}</div>
                        <div style={styles.meta}>{person.department || "No department"}</div>
                        <div style={styles.meta}>
                          <span style={person.planner_access ? styles.permissionPillActive : styles.permissionPillMuted}>
                            {person.planner_access ? "Planner access" : "No planner access"}
                          </span>
                        </div>
                      </td>
                      <td style={styles.tdCompact}>
                        {person.assigned_group_name ? (
                          <span style={styles.permissionPillActive}>{person.assigned_group_name}</span>
                        ) : (
                          <span style={styles.permissionPillMuted}>Not assigned</span>
                        )}
                      </td>
                      <td style={styles.tdCompact}>
                        <div style={styles.permissionList}>
                          {person.effective_roles.length ? person.effective_roles.map((role) => (
                            <span key={`${person.person_id}-effective-${role}`} style={styles.useCasePill}>{roleLabel(role)}</span>
                          )) : <span style={styles.permissionPillMuted}>Viewer</span>}
                        </div>
                      </td>
                      <td style={styles.tdCompact}>
                        <div style={styles.permissionList}>
                          {person.explicit_roles.length ? person.explicit_roles.map((role) => {
                            const protectedRoles = person.explicit_roles.filter((entry) => !manageableRoleSet.has(entry as PlannerRole));
                            const hasProtectedRoles = !isSuperAdmin && protectedRoles.length > 0;
                            const canRemoveRole = canManagePlannerRoles && manageableRoleSet.has(role as PlannerRole) && !hasProtectedRoles;
                            if (!canRemoveRole) {
                              return <span key={`${person.person_id}-explicit-${role}`} style={styles.permissionPillActive}>{roleLabel(role as PlannerRole)}</span>;
                            }
                            return (
                              <button
                                key={`${person.person_id}-explicit-${role}`}
                                type="button"
                                style={styles.rolePillButton}
                                disabled={directorySaving}
                                onClick={() => void removeRoleFromPerson(person.person_id, role as PlannerRole)}
                                title={`Remove ${roleLabel(role as PlannerRole)}`}
                              >
                                {roleLabel(role as PlannerRole)} ×
                              </button>
                            );
                          }) : <span style={styles.permissionPillMuted}>None</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!visibleDirectoryPeople.length ? (
                    <tr>
                      <td colSpan={6} style={styles.emptyState}>
                        {isDirectorySearching ? "No users matched your search." : "No members in this group yet. Search and add members."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "board" ? (
      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <div style={styles.panelTitle}>Master Timeline</div>
            <div style={styles.panelMeta}>Linear stage progress and stage-wise Gantt view. Bar numbers represent assigned task days.</div>
          </div>
          <div style={styles.toolbar}>
            <label style={styles.filterWrap}>
              <select value={timelineMode} onChange={(event) => setTimelineMode(event.target.value as "linear" | "gantt")} style={styles.select}>
                <option value="linear">Linear %</option>
                <option value="gantt">Gantt (Days)</option>
              </select>
            </label>
          </div>
        </div>
        {loading ? (
          <div style={styles.loadingState}>
            <Loader2 size={18} className="spin" />
            Loading timeline...
          </div>
        ) : (
          <GanttTimeline rows={boardProjectRows.length ? boardProjectRows : visibleRows} mode={timelineView} displayMode={timelineMode} />
        )}
      </section>
      ) : null}

      {activeTab === "board" ? (
      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <div style={styles.panelTitle}>Deliverables</div>
            <div style={styles.panelMeta}>Task planner with single Add Task action. Double-click stage or deliverable text to edit (with access).</div>
            <div style={styles.quickFacts}>
              <span style={styles.quickChip}>
                My tasks: {assignmentWorkspace?.my_total_assigned_tasks ?? 0}
              </span>
              <span style={styles.quickChip}>
                Open: {assignmentWorkspace?.my_open_assigned_tasks ?? 0}
              </span>
              {assignmentLoading ? <span style={styles.quickChip}>Updating assignment feed...</span> : null}
            </div>
          </div>
          <div style={styles.toolbar}>
            <button
              type="button"
              style={showAssignedToMeOnly ? styles.subTabButtonActive : styles.subTabButton}
              onClick={() => setShowAssignedToMeOnly((value) => !value)}
            >
              {showAssignedToMeOnly ? "My Tasks Only" : "All Tasks"}
            </button>
            <button type="button" style={styles.secondaryButton} onClick={downloadDraftReport}>
              Draft Report
            </button>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => {
                if (deliverablesExpanded) {
                  setExpandedProjectCodes([]);
                  setExpandedStageKeys([]);
                } else {
                  setExpandedProjectCodes(projectGroups.map((group) => group.project_code));
                  setExpandedStageKeys(allStageExpansionKeys);
                }
                setDeliverablesExpanded((value) => !value);
              }}
            >
              {deliverablesExpanded ? "Collapse All ▲" : "Expand All ▼"}
            </button>
            {selectedRow ? (
              <button type="button" style={styles.secondaryButton} onClick={() => void recalculateProject(selectedRow.project_code)} disabled={saving}>
                <RefreshCcw size={16} />
                Recalculate
              </button>
            ) : null}
            <button
              type="button"
              style={styles.secondaryButton}
              disabled={saving || !selectedStage}
              onClick={() => void insertStageRelative("before")}
            >
              Add Stage Before
            </button>
            <button
              type="button"
              style={styles.secondaryButton}
              disabled={saving || !selectedStage}
              onClick={() => void insertStageRelative("after")}
            >
              Add Stage After
            </button>
            <button
              type="button"
              style={styles.actionButtonDanger}
              disabled={saving || !selectedStage}
              onClick={() => void removeSelectedStage()}
            >
              Remove Stage
            </button>
          </div>
        </div>

        {newRowOpen ? (
          <form onSubmit={createRow} style={styles.formGrid}>
            <input
              name="project_name"
              defaultValue={selectedProject?.project_name || ""}
              placeholder="Project name"
              required
              style={styles.input}
            />
            <input
              value={selectedProject?.project_code || "Auto-generated on save"}
              readOnly
              style={{ ...styles.input, background: "rgba(117,101,88,0.08)" }}
              aria-label="Project code (auto-generated)"
            />
            <input type="hidden" name="plan_layer" value="live_plan" />
            <label style={styles.fieldStack}>
              <span style={styles.fieldLabel}>Project start date</span>
              <input name="baseline_start_date" type="date" style={styles.input} />
            </label>
            <label style={styles.fieldStack}>
              <span style={styles.fieldLabel}>Project end date</span>
              <input name="baseline_end_date" type="date" style={styles.input} />
            </label>
            <div style={styles.formActions}>
              <button type="submit" style={styles.primaryButton} disabled={saving}>
                {saving ? <Loader2 size={16} /> : <Plus size={16} />}
                Create Project
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
                  <th style={styles.th}>Deliverable</th>
                  <th style={styles.th}>Progress</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {projectGroups.map((projectGroup) => {
                  const isExpandedProject = expandedProjectCodes.includes(projectGroup.project_code);
                  const completedCount = projectGroup.rows.filter((row) => normalizeStatusValue(row.activity_status) === "completed").length;
                  const holdCount = projectGroup.rows.filter((row) => normalizeStatusValue(row.activity_status) === "hold").length;
                  const stageCount = new Set(projectGroup.rows.map((row) => String(row.stage_code || "No stage"))).size;
                  const criticalCount = projectGroup.rows.filter((row) => row.is_critical === 1).length;
                  const projectDates = projectDateSnapshot(projectGroup.rows);
                  const projectStages = buildStageBuckets(projectGroup.rows);
                  return (
                    <Fragment key={`project-group-${projectGroup.project_code}`}>
                      <tr style={styles.projectSummaryRow} onClick={() => toggleProjectRows(projectGroup.project_code)}>
                        <td style={styles.td}>
                          <div style={styles.metaStrong}>{projectGroup.project_name}</div>
                          <div style={styles.meta}>{projectGroup.project_code}</div>
                          <div style={styles.metaStrong}>{stageCount} stage(s) • {projectGroup.rows.length} task(s)</div>
                        </td>
                        <td style={styles.td}>
                          <form
                            style={styles.projectDateInlineForm}
                            onSubmit={(event) => {
                              event.stopPropagation();
                              void saveProjectDates(event, projectGroup.project_code);
                            }}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <label style={styles.fieldStack}>
                              <span style={styles.fieldLabel}>Project start</span>
                              <input name="baseline_start_date" type="date" defaultValue={projectDates.baseline_start_date} style={styles.input} />
                            </label>
                            <label style={styles.fieldStack}>
                              <span style={styles.fieldLabel}>Project end</span>
                              <input name="baseline_end_date" type="date" defaultValue={projectDates.baseline_end_date} style={styles.input} />
                            </label>
                            <button type="submit" style={styles.secondaryButton} disabled={saving}>
                              Save Dates
                            </button>
                          </form>
                          <div style={styles.meta}>Critical: {criticalCount}</div>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.metaStrong}>{completedCount}/{projectGroup.rows.length} completed</div>
                          <div style={styles.meta}>{Math.round((completedCount / Math.max(1, projectGroup.rows.length)) * 100)}% done</div>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.metaStrong}>{projectGroup.rows.filter((row) => normalizeStatusValue(row.activity_status) !== "completed").length} open</div>
                          <div style={styles.meta}>{holdCount} on hold</div>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.actionStack}>
                            <button
                              type="button"
                              style={styles.secondaryButton}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleProjectRows(projectGroup.project_code);
                              }}
                            >
                              {isExpandedProject ? "Hide Stages" : "Show Stages"}
                            </button>
                            <button
                              type="button"
                              style={styles.secondaryButton}
                              disabled={saving}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (projectGroup.rows[0]) {
                                  setSelectedRowId(projectGroup.rows[0].planner_row_id);
                                  setSelectedStageKey(String(projectGroup.rows[0].stage_code || "").trim() || null);
                                }
                                void restoreMissingTemplateStages();
                              }}
                            >
                              Restore Stages
                            </button>
                            {canDeleteProjects ? (
                              <button
                                type="button"
                                style={styles.actionButtonDanger}
                                disabled={saving}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void deleteProject(projectGroup.project_code);
                                }}
                                title={`Delete ${projectGroup.project_name}`}
                              >
                                <Trash2 size={14} />
                                Delete Project
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {isExpandedProject ? projectStages.map((stage) => {
                        const expandedStageKey = stageExpansionKey(projectGroup.project_code, stage.stage_key);
                        const isExpandedStage = expandedStageKeys.includes(expandedStageKey);
                        const stageCompletedCount = stage.rows.filter((row) => normalizeStatusValue(row.activity_status) === "completed").length;
                        const stageHoldCount = stage.rows.filter((row) => normalizeStatusValue(row.activity_status) === "hold").length;
                        const stageOpenCount = stage.rows.length - stageCompletedCount;
                        const stageSummary = stageHeaderDescription(stage);
                        const stageAnchorRow = stage.rows[0] || null;
                        const appendAnchorRow =
                          stage.rows.slice().reverse().find((row) => row.can_edit)
                          || null;

                        return (
                          <Fragment key={`stage-${projectGroup.project_code}-${stage.stage_key}`}>
                            <tr
                              style={
                                selectedStageKey === stage.stage_key && activeProjectCode === projectGroup.project_code
                                  ? { ...styles.stageSummaryRow, ...styles.rowSelected }
                                  : styles.stageSummaryRow
                              }
                              onClick={() => {
                                if (stageAnchorRow) {
                                  setSelectedRowId(stageAnchorRow.planner_row_id);
                                }
                                setSelectedStageKey(stage.stage_key);
                                toggleStageRows(projectGroup.project_code, stage.stage_key);
                              }}
                            >
                              <td colSpan={5} style={styles.stageCellWide}>
                                <div style={styles.stageRowLayout}>
                                  {(() => {
                                    const editableStageRows = stage.rows.filter((row) => row.can_edit);
                                    const canEditStageInline = editableStageRows.length > 0 && editableStageRows.length === stage.rows.length;
                                    const stageInlineKey = stageInlineDraftKey(projectGroup.project_code, stage.stage_key);
                                    const isStageInlineEditing = editingStageInlineKey === stageInlineKey;
                                    const stageDraft = getStageDraft(projectGroup.project_code, stage);

                                    if (isStageInlineEditing) {
                                      return (
                                        <div style={styles.stageInlineEditWrap} onClick={(event) => event.stopPropagation()}>
                                          <div style={styles.stageEditGrid}>
                                            <label style={styles.fieldStack}>
                                              <span style={styles.fieldLabel}>Stage</span>
                                              <input
                                                value={stageDraft.stage_code}
                                                style={styles.input}
                                                disabled={saving}
                                                onClick={(event) => event.stopPropagation()}
                                                onChange={(event) => patchStageDraft(projectGroup.project_code, stage, { stage_code: event.target.value })}
                                              />
                                            </label>
                                            <label style={styles.fieldStack}>
                                              <span style={styles.fieldLabel}>Deliverable</span>
                                              <input
                                                value={stageDraft.stage_summary}
                                                style={styles.input}
                                                disabled={saving}
                                                onClick={(event) => event.stopPropagation()}
                                                onChange={(event) => patchStageDraft(projectGroup.project_code, stage, { stage_summary: event.target.value })}
                                              />
                                            </label>
                                          </div>
                                          <div style={styles.actionStack}>
                                            <button
                                              type="button"
                                              style={styles.secondaryButton}
                                              disabled={saving}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                void saveStageInline(projectGroup.project_code, stage);
                                              }}
                                            >
                                              Save Stage
                                            </button>
                                            <button
                                              type="button"
                                              style={styles.actionButtonNeutral}
                                              disabled={saving}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                cancelStageInlineEdit(projectGroup.project_code, stage);
                                              }}
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    }

                                    return (
                                      <div
                                        style={styles.stageIdentityBlock}
                                        onDoubleClick={(event) => {
                                          event.stopPropagation();
                                          if (!canEditStageInline || saving) return;
                                          beginStageInlineEdit(projectGroup.project_code, stage);
                                        }}
                                      >
                                        <div style={styles.stageTitle}>{stage.stage_code || "No stage"}</div>
                                        <div style={styles.stageSummary}>{stageSummary}</div>
                                        {canEditStageInline ? <div style={styles.meta}>Double-click stage or deliverable to edit.</div> : null}
                                      </div>
                                    );
                                  })()}
                                  <div style={styles.stageMetricGrid}>
                                    <div style={styles.stageMetricItem}>
                                      <div style={styles.metaStrong}>{stageCompletedCount}/{stage.rows.length}</div>
                                      <div style={styles.meta}>completed</div>
                                    </div>
                                    <div style={styles.stageMetricItem}>
                                      <div style={styles.metaStrong}>{Math.round((stageCompletedCount / Math.max(1, stage.rows.length)) * 100)}%</div>
                                      <div style={styles.meta}>progress</div>
                                    </div>
                                    <div style={styles.stageMetricItem}>
                                      <div style={styles.metaStrong}>{stageOpenCount}</div>
                                      <div style={styles.meta}>open</div>
                                    </div>
                                    <div style={styles.stageMetricItem}>
                                      <div style={styles.metaStrong}>{stageHoldCount}</div>
                                      <div style={styles.meta}>on hold</div>
                                    </div>
                                  </div>
                                  <div style={styles.actionStack}>
                                    <button
                                      type="button"
                                      style={styles.secondaryButton}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (stageAnchorRow) {
                                          setSelectedRowId(stageAnchorRow.planner_row_id);
                                        }
                                        setSelectedStageKey(stage.stage_key);
                                        toggleStageRows(projectGroup.project_code, stage.stage_key);
                                      }}
                                    >
                                      {isExpandedStage ? "Hide Tasks" : "Show Tasks"}
                                    </button>
                                    {appendAnchorRow ? (
                                      <button
                                        type="button"
                                        style={styles.actionButtonNeutral}
                                        disabled={saving}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setSelectedRowId(appendAnchorRow.planner_row_id);
                                          setSelectedStageKey(stage.stage_key);
                                          void appendTaskFromRowPrompt(appendAnchorRow);
                                        }}
                                      >
                                        <Plus size={14} />
                                        Add Task
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                            </tr>
                            {isExpandedStage ? (
                              <>
                                <tr>
                                  <td colSpan={5} style={styles.taskInlineHeaderCell}>
                                    <div style={styles.taskInlineHeaderGrid}>
                                      <span>Task</span>
                                      <span>Title</span>
                                      <span>Team Member</span>
                                      <span>Days</span>
                                      <span>Status</span>
                                      <span>Priority</span>
                                      <span>Notes</span>
                                      <span>Snapshot</span>
                                      <span>Actions</span>
                                    </div>
                                  </td>
                                </tr>
                                {stage.rows.map((row, taskIndex) => {
                                  const draft = getRowDraft(row);
                                  return (
                                    <tr
                                      key={row.planner_row_id}
                                      style={selectedRowId === row.planner_row_id ? { ...styles.taskRow, ...styles.rowSelected } : styles.taskRow}
                                      onClick={() => {
                                        setSelectedRowId(row.planner_row_id);
                                        setSelectedStageKey(stage.stage_key);
                                      }}
                                    >
                                      <td colSpan={5} style={styles.taskInlineRowCell}>
                                        <div style={styles.taskInlineRowGrid}>
                                          <div style={styles.taskInlineTag}>T{taskIndex + 1}</div>
                                          <div style={styles.taskInlineCellWide}>
                                            {row.can_edit ? (
                                              <input
                                                value={draft.activity_title}
                                                onChange={(event) => patchRowDraft(row, { activity_title: event.target.value })}
                                                onClick={(event) => event.stopPropagation()}
                                                style={styles.inputCompact}
                                                disabled={saving}
                                              />
                                            ) : (
                                              <div style={styles.metaStrong}>{row.activity_title}</div>
                                            )}
                                          </div>
                                          <div style={styles.taskInlineCell}>
                                            {row.can_edit && canEditTaskAssignments ? (
                                              <select
                                                style={styles.compactSelect}
                                                value={draft.assigned_to_person_id}
                                                disabled={saving}
                                                onClick={(event) => event.stopPropagation()}
                                                onChange={(event) => patchRowDraft(row, { assigned_to_person_id: event.target.value })}
                                              >
                                                <option value="">Unassigned</option>
                                                {taskAssignmentOptions.map((person) => (
                                                  <option key={person.person_id} value={person.person_id}>
                                                    {person.label}
                                                  </option>
                                                ))}
                                              </select>
                                            ) : (
                                              <div style={styles.metaStrong}>{row.assigned_to_name || "Unassigned"}</div>
                                            )}
                                          </div>
                                          <div style={styles.taskInlineCellSmall}>
                                            {row.can_edit ? (
                                              <input
                                                value={draft.duration_days}
                                                onChange={(event) => patchRowDraft(row, { duration_days: event.target.value })}
                                                onClick={(event) => event.stopPropagation()}
                                                style={styles.inputCompact}
                                                type="number"
                                                min="0.25"
                                                step="0.25"
                                                disabled={saving}
                                              />
                                            ) : (
                                              <div style={styles.metaStrong}>{row.duration_days ?? "-"}</div>
                                            )}
                                          </div>
                                          <div style={styles.taskInlineCell}>
                                            {row.can_edit ? (
                                              <select
                                                style={styles.compactSelect}
                                                value={statusUiValueForRow(row, draft.activity_status)}
                                                disabled={saving}
                                                onClick={(event) => event.stopPropagation()}
                                                onChange={(event) => patchRowDraft(row, { activity_status: backendStatusFromUiValue(event.target.value) })}
                                              >
                                                {statusDropdownOptions.map((option) => (
                                                  <option key={option.uiValue} value={option.uiValue}>
                                                    {option.label}
                                                  </option>
                                                ))}
                                              </select>
                                            ) : (
                                              <div style={styles.metaStrong}>{statusLabel(row.activity_status)}</div>
                                            )}
                                          </div>
                                          <div style={styles.taskInlineCell}>
                                            {row.can_edit ? (
                                              <select
                                                style={styles.compactSelect}
                                                value={draft.priority}
                                                disabled={saving}
                                                onClick={(event) => event.stopPropagation()}
                                                onChange={(event) => patchRowDraft(row, { priority: event.target.value })}
                                              >
                                                <option value="low">Low</option>
                                                <option value="medium">Medium</option>
                                                <option value="high">High</option>
                                              </select>
                                            ) : (
                                              <div style={styles.metaStrong}>{String(row.priority || "medium")}</div>
                                            )}
                                          </div>
                                          <div style={styles.taskInlineCellWide}>
                                            {row.can_edit ? (
                                              <input
                                                value={draft.dependency_codes}
                                                onChange={(event) => patchRowDraft(row, { dependency_codes: event.target.value })}
                                                onClick={(event) => event.stopPropagation()}
                                                style={styles.inputCompact}
                                                disabled={saving}
                                                placeholder="Dependencies or notes"
                                              />
                                            ) : (
                                              <div style={styles.meta}>{row.dependency_codes || "-"}</div>
                                            )}
                                          </div>
                                          <div style={styles.taskInlineCellMeta}>
                                            <div style={styles.badgeStatus(row.activity_status)}>{statusLabel(row.activity_status)}</div>
                                            <div style={styles.meta}>Done {row.percent_complete}%</div>
                                          </div>
                                          <div style={styles.taskInlineActions}>
                                            {row.can_edit ? (
                                              <button
                                                type="button"
                                                style={styles.secondaryButton}
                                                disabled={saving}
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  void saveRowInline(row);
                                                }}
                                              >
                                                Save
                                              </button>
                                            ) : null}
                                            {row.can_delete ? (
                                              <button
                                                type="button"
                                                style={styles.actionButtonDanger}
                                                disabled={saving}
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  void deleteRow(row.planner_row_id);
                                                }}
                                              >
                                                <Trash2 size={14} />
                                                Delete
                                              </button>
                                            ) : null}
                                          </div>
                                        </div>
                                        {row.change_reason ? <div style={styles.badgeMuted}>Reason: {row.change_reason}</div> : null}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </>
                            ) : null}
                          </Fragment>
                        );
                      }) : null}
                    </Fragment>
                  );
                })}
                {!projectGroups.length ? (
                  <tr>
                    <td colSpan={5} style={styles.emptyState}>
                      No planner rows found for the current filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </section>
      ) : null}
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
  kind,
  footer,
}: {
  label: string;
  value: string;
  kind: "dark" | "base" | "orange";
  footer?: string;
}) {
  const cardStyle = kind === "dark"
    ? styles.metricCardDark
    : kind === "orange"
      ? styles.metricCardOrange
      : styles.metricCardLight;
  const labelStyle = kind === "dark" || kind === "orange" ? styles.metricLabelInverse : styles.metricLabel;
  const footerStyle = kind === "dark" || kind === "orange" ? styles.metricFooterInverse : styles.metricFooter;
  return (
    <div style={cardStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
      {footer ? <div style={footerStyle}>{footer}</div> : null}
    </div>
  );
}

function DashboardOverviewChart({
  total,
  completed,
  pending,
}: {
  total: number;
  completed: number;
  pending: number;
}) {
  const safeTotal = Math.max(total, 1);
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const completedPct = Math.max(0, Math.min(100, Math.round((completed / safeTotal) * 100)));
  const pendingPct = Math.max(0, Math.min(100, 100 - completedPct));

  return (
    <div style={styles.overviewChart}>
      <div style={styles.donutWrap}>
        <svg width="68" height="68" viewBox="0 0 68 68" style={styles.donutSvg}>
          <circle cx="34" cy="34" r={radius} fill="none" stroke="rgba(117,101,88,0.18)" strokeWidth="8" />
          <circle
            cx="34"
            cy="34"
            r={radius}
            fill="none"
            stroke="var(--success)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(completedPct / 100) * circumference} ${circumference}`}
            transform="rotate(-90 34 34)"
          />
        </svg>
        <div style={styles.donutCenter}>
          <div style={styles.donutValue}>{completedPct}%</div>
          <div style={styles.donutLabel}>done</div>
        </div>
      </div>
      <div style={styles.chartLegend}>
        <div style={styles.legendRow}>
          <span style={{ ...styles.legendDot, background: "var(--success)" }} />
          <span style={styles.meta}>Completed: {completed}</span>
        </div>
        <div style={styles.legendRow}>
          <span style={{ ...styles.legendDot, background: "var(--warning)" }} />
          <span style={styles.meta}>Pending: {pending}</span>
        </div>
        <div style={styles.miniBars}>
          <div style={{ ...styles.miniBar, width: `${completedPct}%`, background: "var(--success)" }} />
          <div style={{ ...styles.miniBar, width: `${pendingPct}%`, background: "var(--warning)" }} />
        </div>
      </div>
    </div>
  );
}

function rowDurationDays(row: PlannerRow): number {
  const raw = Number(row.duration_days);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 0;
}

function roundTo2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function GanttTimeline({ rows, mode: _mode, displayMode }: { rows: PlannerRow[]; mode: "both" | "contract" | "live"; displayMode: "linear" | "gantt" }) {
  const items = rows
    .slice()
    .sort((a, b) => {
      const aStageNo = parseStageNumber(a.stage_code) ?? 999999;
      const bStageNo = parseStageNumber(b.stage_code) ?? 999999;
      if (aStageNo !== bStageNo) return aStageNo - bStageNo;
      const titleCompare = String(a.activity_title || "").localeCompare(String(b.activity_title || ""));
      if (titleCompare !== 0) return titleCompare;
      return a.planner_row_id - b.planner_row_id;
    })
    .map((row) => ({
      row,
      days: rowDurationDays(row),
      completion: Math.max(0, Math.min(100, Number(row.percent_complete || 0))),
    }));
  if (!items.length) {
    return <div style={styles.emptyState}>No deliverables found for the selected project.</div>;
  }

  if (displayMode === "linear") {
    const stageBuckets = buildStageBuckets(rows);
    const done = items.filter((item) => normalizeStatusValue(item.row.activity_status) === "completed").length;
    const overallPct = Math.round((done / Math.max(1, items.length)) * 100);
    const stageProgress = stageBuckets.map((stage) => {
      const total = stage.rows.length;
      const completed = stage.rows.filter((row) => normalizeStatusValue(row.activity_status) === "completed").length;
      const pct = total ? Math.round((completed / total) * 100) : 0;
      const shortLabel = (stage.stage_code || `Stage ${stage.stage_no || ""}`).split(":")[0].trim().toUpperCase();
      return {
        stageKey: stage.stage_key,
        shortLabel,
        fullLabel: stage.stage_code || stage.stage_title,
        pct,
        total,
      };
    });
    return (
      <div style={styles.ganttWrap}>
        <div style={styles.ganttLegend}>
          <span style={styles.metaStrong}>Project completion: {overallPct}%</span>
          <span style={styles.meta}>Complete</span>
          <span style={styles.meta}>Pending</span>
        </div>
        <div style={styles.linearProjectSummary}>
          <div style={styles.metaStrong}>{done}/{items.length} tasks complete</div>
          <div style={styles.linearStageMiniTrack}>
            <div style={{ ...styles.linearStageMiniFill, width: `${overallPct}%` }} />
          </div>
        </div>
        <div style={styles.linearStageLine}>
          <div style={styles.linearAxisLine} />
          {stageProgress.map((stage) => (
            <div key={stage.stageKey} style={styles.linearStageItem} title={`${stage.fullLabel} • ${stage.pct}%`}>
              <div style={styles.linearStageDot(stage.pct)}>
                <span style={styles.linearStageDotLabel}>{stage.pct}%</span>
              </div>
              <div style={styles.linearStageName}>{stage.shortLabel}</div>
              <div style={styles.linearStageMiniTrack}>
                <div style={{ ...styles.linearStageMiniFill, width: `${stage.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const withDays = items.filter((item) => item.days > 0);
  if (!withDays.length) {
    return <div style={styles.emptyState}>Assign duration days to deliverables to generate project Gantt.</div>;
  }

  const MS_DAY = 24 * 60 * 60 * 1000;
  const parseDate = (value: string | null | undefined) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  };

  const positioned = withDays.map((item) => ({
    item,
    startDate:
      parseDate(item.row.scheduled_start_date)
      || parseDate(item.row.live_start_date)
      || parseDate(item.row.baseline_start_date),
  }));
  const hasTimedStart = positioned.some((entry) => Boolean(entry.startDate));
  const spanByRowId = new Map<number, { startDay: number; endDay: number; days: number }>();

  if (hasTimedStart) {
    const startTimes = positioned
      .map((entry) => entry.startDate?.getTime())
      .filter((value): value is number => typeof value === "number");
    const projectStart = Math.min(...startTimes);
    let fallbackCursor = 0;
    for (const entry of positioned) {
      const startDay = entry.startDate
        ? Math.max(0, Math.floor((entry.startDate.getTime() - projectStart) / MS_DAY))
        : fallbackCursor;
      const endDay = startDay + entry.item.days;
      fallbackCursor = Math.max(fallbackCursor, endDay);
      spanByRowId.set(entry.item.row.planner_row_id, { startDay, endDay, days: entry.item.days });
    }
  } else {
    let cursor = 0;
    for (const entry of withDays) {
      const startDay = cursor;
      const endDay = startDay + entry.days;
      spanByRowId.set(entry.row.planner_row_id, { startDay, endDay, days: entry.days });
      cursor = endDay;
    }
  }

  const totalProjectDays = Math.max(
    1,
    Math.ceil(
      Math.max(
        ...Array.from(spanByRowId.values()).map((span) => span.endDay),
      ),
    ),
  );

  function barPalette(status: string) {
    const normalized = normalizeStatusValue(status);
    if (normalized === "completed") return { background: "#000000", color: "#ffffff" };
    if (normalized === "hold") return { background: "#ef2b2d", color: "#ffffff" };
    if (normalized === "in_progress") return { background: "#6b7280", color: "#ffffff" };
    if (normalized === "to_be_checked") return { background: "#7d8592", color: "#ffffff" };
    return { background: "#cfd4dc", color: "#111827" };
  }

  const stageRows = buildStageBuckets(rows).map((stage) => {
    const stageLabel = (stage.stage_code || `Stage ${stage.stage_no || ""}`).split(":")[0].trim().toUpperCase();
    const bars = stage.rows
      .map((row) => {
        const span = spanByRowId.get(row.planner_row_id);
        if (!span) return null;
        const leftPct = Math.max(0, (span.startDay / totalProjectDays) * 100);
        const rawWidth = Math.max((span.days / totalProjectDays) * 100, 1.2);
        const widthPct = Math.max(0, Math.min(rawWidth, 100 - leftPct));
        return {
          row,
          label: Number.isInteger(span.days) ? String(span.days) : String(roundTo2(span.days)),
          leftPct,
          widthPct,
          ...barPalette(row.activity_status),
        };
      })
      .filter((value): value is { row: PlannerRow; label: string; leftPct: number; widthPct: number; background: string; color: string } => Boolean(value))
      .sort((a, b) => a.leftPct - b.leftPct);
    return {
      stageKey: stage.stage_key,
      stageLabel,
      bars,
    };
  });

  return (
    <div style={styles.ganttMasterWrap}>
      <div style={styles.ganttAxisHeader}>
        <div style={styles.ganttAxisStageHead}>Stage</div>
        <div style={styles.ganttAxisDayHead}>
          <span style={styles.ganttAxisDayText}>Day 0</span>
          <span style={styles.ganttAxisDayText}>Day {Math.round(totalProjectDays)}</span>
        </div>
      </div>
      <div style={styles.ganttStageGrid}>
        {stageRows.map((stage) => (
          <div key={`gantt-stage-${stage.stageKey}`} style={styles.ganttStageRow}>
            <div style={styles.ganttStageLabel}>{stage.stageLabel}</div>
            <div style={styles.ganttStageTrack}>
              {stage.bars.map((bar) => (
                <div
                  key={`gantt-stage-bar-${stage.stageKey}-${bar.row.planner_row_id}`}
                  style={{
                    ...styles.ganttStageBar,
                    left: `${bar.leftPct}%`,
                    width: `${bar.widthPct}%`,
                    background: bar.background,
                    color: bar.color,
                  }}
                  title={`Task: ${bar.row.activity_title}\nDuration: ${bar.label} day(s)\nStatus: ${statusLabel(bar.row.activity_status)}`}
                >
                  {bar.label}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={styles.meta}>
        Day numbers on each bar represent assigned task duration in days.
      </div>
    </div>
  );
}

const styles: Record<string, any> = {
  page: {
    padding: "clamp(8px, 0.95vw, 20px)",
    width: "100%",
    maxWidth: "100%",
    margin: 0,
    display: "grid",
    gap: 8,
  },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    padding: "8px 12px",
    border: "2px solid #000",
    borderRadius: 0,
    background: "#fff",
    boxShadow: "2px 2px 0 0 #000",
    flexWrap: "wrap",
  },
  brandWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  logoLink: { display: "inline-flex", alignItems: "center" },
  logo: { height: 30, width: "auto", display: "block" },
  productEyebrow: { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 },
  productTitle: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  topbarActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  headerProjectControls: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  heroCompact: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.85fr)",
    gap: 10,
    alignItems: "start",
  },
  introCard: {
    border: "1px solid var(--stroke)",
    borderRadius: 18,
    background: "rgba(255,252,248,0.86)",
    boxShadow: "var(--shadow)",
    padding: 14,
  },
  kicker: {
    display: "inline-flex",
    padding: "5px 9px",
    borderRadius: 999,
    background: "rgba(196,93,44,0.12)",
    color: "var(--accent-deep)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  title: {
    margin: "10px 0 6px",
    fontSize: "clamp(18px, 2.3vw, 28px)",
    lineHeight: 1.08,
    maxWidth: 640,
  },
  subtitle: {
    margin: 0,
    maxWidth: 640,
    color: "var(--muted)",
    fontSize: 12,
    lineHeight: 1.45,
  },
  quickFacts: { marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" },
  quickChip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "5px 8px",
    borderRadius: 999,
    border: "1px solid var(--stroke)",
    background: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--ink-soft)",
  },
  actorCard: {
    border: "1px solid var(--stroke)",
    background: "linear-gradient(180deg, rgba(255,250,245,0.98), rgba(246,237,228,0.92))",
    borderRadius: 18,
    padding: 14,
    boxShadow: "var(--shadow)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  actorHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  actorLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" },
  actorName: { fontSize: 16, fontWeight: 700, marginTop: 4 },
  actorPill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 8px",
    borderRadius: 999,
    background: "rgba(196,93,44,0.12)",
    color: "var(--accent-deep)",
    fontSize: 11,
    fontWeight: 700,
  },
  roleExplainGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 },
  appLinks: { display: "flex", gap: 8, flexWrap: "wrap" },
  appLink: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(15,23,42,0.08)",
    color: "var(--ink-soft)",
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 600,
  },
  appLinkActive: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(196,93,44,0.14)",
    border: "1px solid rgba(196,93,44,0.18)",
    color: "var(--accent-deep)",
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 700,
  },
  userCard: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px",
    borderRadius: 16,
    border: "1px solid var(--stroke)",
    background: "rgba(255,255,255,0.8)",
    minWidth: 240,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, var(--accent), var(--accent-deep))",
    color: "#fff",
    fontSize: 11,
    fontWeight: 800,
  },
  userInfo: { minWidth: 0, flex: 1 },
  userName: { fontSize: 12, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  userMeta: { fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  iconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 10,
    textDecoration: "none",
    border: "1px solid var(--stroke)",
    color: "var(--text)",
    background: "var(--surface-strong)",
  },
  metricsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 },
  metricCardDark: {
    border: "2px solid #000",
    borderRadius: 0,
    background: "#000",
    color: "#fff",
    boxShadow: "2px 2px 0 0 #ea580c",
    padding: 8,
    display: "grid",
    gap: 4,
    minHeight: 82,
  },
  metricCardLight: {
    border: "2px solid #000",
    borderRadius: 0,
    background: "#fff",
    boxShadow: "2px 2px 0 0 #000",
    padding: 8,
    display: "grid",
    gap: 4,
    minHeight: 82,
  },
  metricCardOrange: {
    border: "2px solid #000",
    borderRadius: 0,
    background: "#ea580c",
    color: "#fff",
    boxShadow: "2px 2px 0 0 #000",
    padding: 8,
    display: "grid",
    gap: 4,
    minHeight: 82,
  },
  metricValue: { fontSize: 24, fontWeight: 800, lineHeight: 1 },
  metricLabel: { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 },
  metricLabelInverse: { fontSize: 10, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 },
  metricFooter: { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.85, fontWeight: 700 },
  metricFooterInverse: { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(255,255,255,0.85)", fontWeight: 700 },
  metricCardChart: {
    border: "2px solid #000",
    borderRadius: 0,
    background: "#fff",
    boxShadow: "2px 2px 0 0 #000",
    padding: 8,
    display: "grid",
    gap: 6,
    minHeight: 82,
  },
  permissionList: { display: "flex", flexWrap: "wrap", gap: 8 },
  permissionPillActive: {
    display: "inline-flex",
    padding: "6px 8px",
    borderRadius: 999,
    background: "rgba(31,122,76,0.12)",
    color: "var(--success)",
    fontSize: 11,
    fontWeight: 700,
  },
  permissionPillMuted: {
    display: "inline-flex",
    padding: "6px 8px",
    borderRadius: 999,
    background: "rgba(117,101,88,0.1)",
    color: "var(--muted)",
    fontSize: 11,
    fontWeight: 700,
  },
  roleAdminGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 12,
  },
  roleCard: {
    border: "1px solid var(--stroke)",
    borderRadius: 16,
    background: "rgba(255,255,255,0.66)",
    padding: 12,
    display: "grid",
    gap: 8,
  },
  roleCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  roleToggleOn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 8px",
    borderRadius: 999,
    border: "1px solid rgba(31,122,76,0.18)",
    background: "rgba(31,122,76,0.12)",
    color: "var(--success)",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },
  roleToggleOff: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 8px",
    borderRadius: 999,
    border: "1px solid var(--stroke)",
    background: "rgba(255,255,255,0.84)",
    color: "var(--text)",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },
  roleToggleDisabled: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 8px",
    borderRadius: 999,
    border: "1px solid var(--stroke)",
    background: "rgba(117,101,88,0.12)",
    color: "var(--muted)",
    fontSize: 11,
    fontWeight: 700,
    cursor: "not-allowed",
  },
  useCasePill: {
    display: "inline-flex",
    padding: "6px 8px",
    borderRadius: 999,
    background: "rgba(196,93,44,0.11)",
    color: "var(--accent-deep)",
    fontSize: 11,
    fontWeight: 700,
  },
  rolePillButton: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 8px",
    borderRadius: 999,
    border: "1px solid rgba(184,61,45,0.22)",
    background: "rgba(184,61,45,0.12)",
    color: "var(--danger)",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },
  infoTile: {
    border: "1px solid var(--stroke)",
    borderRadius: 12,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.56)",
    minWidth: 0,
  },
  infoLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", fontWeight: 700 },
  infoValue: { fontSize: 12, color: "var(--text)", fontWeight: 600, marginTop: 4, lineHeight: 1.35 },
  tabBar: { display: "flex", gap: 8, alignItems: "center" },
  tabButton: {
    border: "1px solid var(--stroke)",
    background: "var(--surface-strong)",
    color: "var(--muted)",
    borderRadius: 10,
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  tabButtonActive: {
    border: "1px solid rgba(196,93,44,0.24)",
    background: "rgba(196,93,44,0.14)",
    color: "var(--accent-deep)",
    borderRadius: 10,
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  subTabBar: { display: "flex", gap: 8, alignItems: "center", marginTop: -2 },
  subTabButton: {
    border: "1px solid var(--stroke)",
    background: "rgba(255,255,255,0.76)",
    color: "var(--muted)",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },
  subTabButtonActive: {
    border: "1px solid rgba(196,93,44,0.24)",
    background: "rgba(196,93,44,0.14)",
    color: "var(--accent-deep)",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },
  visibilityBar: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 10,
  },
  visibilityCard: {
    border: "1px solid var(--stroke)",
    borderRadius: 14,
    background: "rgba(255,255,255,0.72)",
    padding: 10,
    display: "grid",
    gap: 6,
  },
  progressValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text)",
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    background: "rgba(117,101,88,0.14)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, var(--accent), var(--accent-deep))",
    borderRadius: 999,
  },
  overviewChart: {
    display: "grid",
    gridTemplateColumns: "74px minmax(0, 1fr)",
    gap: 6,
    alignItems: "center",
  },
  donutWrap: {
    position: "relative",
    width: 68,
    height: 68,
  },
  donutSvg: {
    display: "block",
  },
  donutCenter: {
    position: "absolute",
    inset: 0,
    display: "grid",
    alignContent: "center",
    justifyItems: "center",
    lineHeight: 1.1,
  },
  donutValue: {
    fontSize: 12,
    fontWeight: 800,
    color: "var(--text)",
  },
  donutLabel: {
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--muted)",
    fontWeight: 700,
  },
  chartLegend: {
    display: "grid",
    gap: 5,
  },
  legendRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    flexShrink: 0,
  },
  miniBars: {
    marginTop: 4,
    display: "flex",
    gap: 4,
    width: "100%",
  },
  miniBar: {
    height: 6,
    borderRadius: 999,
    minWidth: 8,
  },
  ganttWrap: {
    display: "grid",
    gap: 8,
  },
  linearStageLine: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
    position: "relative",
    paddingTop: 14,
    marginTop: 2,
    overflowX: "auto",
    minHeight: 92,
  },
  linearAxisLine: {
    position: "absolute",
    top: 26,
    left: 12,
    right: 12,
    height: 2,
    background: "#000",
    zIndex: 0,
  },
  linearStageItem: {
    minWidth: 88,
    display: "grid",
    justifyItems: "center",
    gap: 4,
    zIndex: 1,
  },
  linearStageDot: (pct: number) => ({
    width: 34,
    height: 34,
    border: "2px solid #000",
    borderRadius: 0,
    boxShadow: "1px 1px 0 0 #000",
    background: pct >= 100 ? "#000" : pct > 0 ? "#ea580c" : "#fff",
    color: pct >= 100 || pct > 0 ? "#fff" : "#000",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: 9,
  }),
  linearStageDotLabel: { fontSize: 9, fontWeight: 800 },
  linearStageName: {
    fontSize: 9,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    textAlign: "center",
    maxWidth: 88,
  },
  linearStageMiniTrack: {
    width: 42,
    height: 4,
    border: "1px solid #000",
    background: "#fff",
  },
  linearStageMiniFill: {
    height: "100%",
    background: "#ea580c",
  },
  linearProjectWrap: {
    display: "grid",
    gap: 10,
  },
  linearProjectSummary: {
    border: "2px solid #000",
    padding: 10,
    background: "#fff",
    boxShadow: "2px 2px 0 0 #000",
    display: "grid",
    gap: 6,
  },
  ganttLegend: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  ganttMasterWrap: {
    display: "grid",
    gap: "clamp(10px, 0.8vw, 22px)",
    width: "100%",
    padding: "clamp(2px, 0.2vw, 8px) 0",
  },
  ganttAxisHeader: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 0.24fr) minmax(0, 1fr)",
    gap: "clamp(10px, 0.75vw, 22px)",
    alignItems: "end",
    paddingBottom: "clamp(6px, 0.55vw, 14px)",
    borderTop: "2px solid #111",
    borderBottom: "2px solid #111",
    paddingTop: "clamp(8px, 0.7vw, 18px)",
  },
  ganttAxisStageHead: {
    fontSize: "clamp(11px, 0.6vw, 16px)",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#111",
  },
  ganttAxisDayHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 clamp(2px, 0.2vw, 8px)",
  },
  ganttAxisDayText: {
    fontSize: "clamp(10px, 0.58vw, 15px)",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#4b5563",
  },
  ganttStageGrid: {
    display: "grid",
    gap: "clamp(10px, 0.8vw, 20px)",
    width: "100%",
  },
  ganttStageRow: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 0.24fr) minmax(0, 1fr)",
    gap: "clamp(10px, 0.75vw, 22px)",
    alignItems: "center",
  },
  ganttStageLabel: {
    fontSize: "clamp(16px, 0.8vw, 24px)",
    fontWeight: 900,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    color: "#111",
  },
  ganttStageTrack: {
    position: "relative",
    height: "clamp(30px, 1.9vw, 48px)",
    background: "#f3f4f6",
    border: "2px solid #111",
    overflow: "hidden",
  },
  ganttStageBar: {
    position: "absolute",
    top: 0,
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "clamp(12px, 0.72vw, 18px)",
    fontWeight: 900,
    borderRight: "1px solid #111",
    borderLeft: "1px solid #111",
    lineHeight: 1,
    textShadow: "0 1px 0 rgba(0,0,0,0.08)",
  },
  ganttTable: {
    display: "grid",
    gap: 8,
    maxHeight: 360,
    overflowY: "auto",
    paddingRight: 4,
  },
  ganttRow: {
    display: "grid",
    gridTemplateColumns: "minmax(240px, 0.9fr) minmax(0, 1.6fr)",
    gap: 10,
    alignItems: "center",
    border: "1px solid var(--stroke)",
    borderRadius: 12,
    padding: 8,
    background: "rgba(255,255,255,0.66)",
  },
  ganttLabel: {
    minWidth: 0,
    display: "grid",
    gap: 2,
  },
  ganttTrack: {
    position: "relative",
    height: 24,
    borderRadius: 999,
    background: "rgba(117,101,88,0.12)",
    border: "1px solid var(--stroke)",
    overflow: "hidden",
  },
  ganttTaskBar: {
    position: "absolute",
    top: 0,
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    fontWeight: 800,
    borderRight: "1px solid #000",
    cursor: "help",
  },
  linearTrack: {
    position: "relative",
    height: 24,
    borderRadius: 999,
    background: "rgba(117,101,88,0.12)",
    border: "1px solid var(--stroke)",
    overflow: "hidden",
  },
  linearFill: {
    position: "absolute",
    inset: 0,
    width: "0%",
    background: "linear-gradient(90deg, var(--accent), var(--accent-deep))",
    borderRadius: 999,
  },
  linearText: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text)",
    textShadow: "0 1px 0 rgba(255,255,255,0.35)",
  },
  ganttBarContract: {
    position: "absolute",
    top: 4,
    height: 6,
    borderRadius: 999,
    background: "#64748b",
    opacity: 0.92,
  },
  ganttBarLive: {
    position: "absolute",
    bottom: 4,
    height: 8,
    borderRadius: 999,
    background: "linear-gradient(90deg, var(--accent), var(--accent-deep))",
    opacity: 0.98,
  },
  timelineDeltaLate: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--danger)",
    marginTop: 2,
  },
  timelineDeltaEarly: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--success)",
    marginTop: 2,
  },
  panel: { border: "2px solid #000", background: "#fff", borderRadius: 0, padding: 10, boxShadow: "2px 2px 0 0 #000" },
  panelHeader: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap" },
  panelTitle: { fontSize: "clamp(20px, 1.5vw, 28px)", fontWeight: 800, textTransform: "uppercase", fontFamily: "\"Space Grotesk\", sans-serif" },
  panelMeta: { marginTop: 2, color: "var(--muted)", fontSize: 11 },
  toolbar: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  filterWrap: {
    display: "inline-flex",
    gap: 8,
    alignItems: "center",
    padding: "0 10px",
    borderRadius: 0,
    border: "2px solid #000",
    background: "#fff",
    minHeight: 32,
    boxShadow: "2px 2px 0 0 #000",
  },
  select: {
    border: "none",
    background: "transparent",
    appearance: "none",
    backgroundImage:
      'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22black%22 stroke-width=%223%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpolyline points=%226 9 12 15 18 9%22/%3E%3C/svg%3E")',
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 0.1rem center",
    paddingRight: 18,
    color: "#000",
    minWidth: 190,
    outline: "none",
    fontSize: 11,
    fontWeight: 700,
  },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "none",
    borderRadius: 0,
    background: "linear-gradient(135deg, var(--accent), var(--accent-deep))",
    color: "white",
    fontWeight: 700,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 11,
    textTransform: "uppercase",
    boxShadow: "2px 2px 0 0 #000",
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "2px solid #000",
    borderRadius: 0,
    background: "#fff",
    color: "#000",
    fontWeight: 700,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 11,
    boxShadow: "2px 2px 0 0 #000",
    textTransform: "uppercase",
  },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginBottom: 8 },
  projectDateInlineForm: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(150px, 1fr))",
    gap: 8,
    alignItems: "end",
  },
  formGridInline: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 },
  fieldStack: { display: "grid", gap: 2, alignContent: "start" },
  fieldLabel: { fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" },
  formActions: { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  appendTaskInline: { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  input: {
    width: "100%",
    border: "2px solid #000",
    background: "#fff",
    borderRadius: 0,
    padding: "5px 6px",
    outline: "none",
    color: "#000",
    fontSize: 11,
    fontWeight: 600,
    boxShadow: "none",
  },
  errorBox: {
    border: "1px solid rgba(184,61,45,0.18)",
    background: "rgba(184,61,45,0.08)",
    color: "var(--danger)",
    borderRadius: 14,
    padding: 10,
    marginBottom: 12,
    fontSize: 12,
  },
  noticeBox: {
    border: "1px solid rgba(31,122,76,0.22)",
    background: "rgba(31,122,76,0.1)",
    color: "var(--success)",
    borderRadius: 14,
    padding: 10,
    marginBottom: 12,
    fontSize: 12,
  },
  loadingState: {
    minHeight: 180,
    display: "flex",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    color: "var(--muted)",
  },
  roleTableWrap: { overflowX: "auto" },
  roleTable: { width: "100%", borderCollapse: "separate", borderSpacing: "0 6px" },
  tableHint: {
    marginBottom: 8,
    fontSize: 11,
    color: "var(--muted)",
  },
  bulkActionGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 10, marginBottom: 10 },
  bulkCard: {
    border: "1px solid var(--stroke)",
    borderRadius: 12,
    background: "rgba(255,255,255,0.7)",
    padding: 10,
    display: "grid",
    gap: 8,
  },
  groupPickerWrap: { display: "grid", gap: 8 },
  searchDropdown: {
    maxHeight: 220,
    overflowY: "auto",
    border: "1px solid var(--stroke)",
    borderRadius: 10,
    background: "rgba(255,255,255,0.94)",
    display: "grid",
    gap: 0,
  },
  dropdownRow: {
    display: "grid",
    gridTemplateColumns: "18px minmax(0, 1fr) auto",
    gap: 8,
    alignItems: "center",
    padding: "8px 10px",
    borderTop: "1px solid rgba(15,23,42,0.06)",
  },
  searchSuggestionButton: {
    appearance: "none",
    border: "none",
    borderTop: "1px solid rgba(15,23,42,0.06)",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    width: "100%",
    padding: "8px 10px",
    display: "grid",
    gap: 2,
  },
  dropdownEmpty: {
    padding: "10px 12px",
    color: "var(--muted)",
    fontSize: 12,
  },
  selectionChips: { display: "flex", flexWrap: "wrap", gap: 6 },
  simpleTableWrap: { overflowX: "auto", border: "1px solid var(--stroke)", borderRadius: 12, background: "rgba(255,255,255,0.72)" },
  compactTable: { width: "100%", borderCollapse: "collapse" },
  groupWorkspaceGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 },
  groupPanel: {
    border: "1px solid var(--stroke)",
    borderRadius: 12,
    background: "var(--surface-strong)",
    padding: 10,
    display: "grid",
    gap: 8,
    minWidth: 0,
  },
  groupPanelFull: {
    border: "1px solid var(--stroke)",
    borderRadius: 12,
    background: "var(--surface-strong)",
    padding: 10,
    display: "grid",
    gap: 8,
    minWidth: 0,
    gridColumn: "1 / -1",
  },
  groupPanelHeader: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" },
  panelTitleSmall: { fontSize: 13, fontWeight: 700, color: "var(--text)" },
  workspaceGrid: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12, alignItems: "start" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", minWidth: 1120, borderCollapse: "separate", borderSpacing: "0 8px" },
  th: {
    textAlign: "left",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--muted)",
    padding: "0 10px",
  },
  projectSummaryRow: { background: "rgba(196,93,44,0.08)", cursor: "pointer" },
  stageSummaryRow: { background: "transparent", cursor: "pointer" },
  row: { background: "var(--surface-strong)" },
  taskRow: { background: "transparent" },
  rowSelected: { boxShadow: "0 0 0 2px rgba(196,93,44,0.24)" },
  td: {
    padding: 10,
    verticalAlign: "top",
    border: "1px solid var(--stroke)",
    background: "rgba(255,255,255,0.9)",
  },
  stageCellPrimary: { padding: 10, verticalAlign: "top", border: "1px solid var(--stroke)", background: "rgba(255,255,255,0.9)", fontWeight: 700 },
  stageCellSecondary: { padding: 10, verticalAlign: "top", border: "1px solid var(--stroke)", background: "rgba(255,255,255,0.9)" },
  stageCellWide: {
    padding: 10,
    verticalAlign: "top",
    border: "1px solid rgba(117,101,88,0.3)",
    background: "rgba(255,251,246,0.95)",
  },
  stageRowLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(300px, 1.6fr) minmax(260px, 1fr) auto",
    gap: 10,
    alignItems: "center",
  },
  stageIdentityBlock: { display: "grid", gap: 4, minWidth: 0 },
  stageTitle: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  stageSummary: { fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.4 },
  stageMetricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
  },
  stageMetricItem: {
    border: "1px solid rgba(117,101,88,0.24)",
    borderRadius: 10,
    padding: "6px 8px",
    background: "rgba(255,255,255,0.78)",
    textAlign: "center",
  },
  stageInlineEditWrap: { display: "grid", gap: 8, minWidth: 0 },
  stageEditGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(180px, 1fr))", gap: 8 },
  taskInlineHeaderCell: {
    padding: "3px 8px 2px",
    border: "none",
    background: "transparent",
  },
  taskInlineHeaderGrid: {
    display: "grid",
    gridTemplateColumns: "62px minmax(250px, 1.6fr) minmax(180px, 1.05fr) minmax(90px, 0.65fr) minmax(140px, 0.9fr) minmax(120px, 0.75fr) minmax(220px, 1.3fr) minmax(150px, 0.95fr) auto",
    gap: 8,
    alignItems: "center",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--muted)",
    fontWeight: 700,
  },
  taskInlineRowCell: {
    padding: "4px 8px 6px",
    border: "none",
    background: "transparent",
  },
  taskInlineRowGrid: {
    display: "grid",
    gridTemplateColumns: "62px minmax(250px, 1.6fr) minmax(180px, 1.05fr) minmax(90px, 0.65fr) minmax(140px, 0.9fr) minmax(120px, 0.75fr) minmax(220px, 1.3fr) minmax(150px, 0.95fr) auto",
    gap: 8,
    alignItems: "center",
  },
  taskInlineTag: {
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    height: 34,
    border: "1px solid var(--stroke)",
    borderRadius: 8,
    background: "rgba(196,93,44,0.1)",
    color: "var(--accent-deep)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
  },
  taskInlineCell: {
    minHeight: 34,
    border: "1px solid var(--stroke)",
    borderRadius: 8,
    background: "rgba(255,255,255,0.94)",
    padding: "4px 6px",
    display: "grid",
    alignContent: "center",
  },
  taskInlineCellWide: {
    minHeight: 34,
    border: "1px solid var(--stroke)",
    borderRadius: 8,
    background: "rgba(255,255,255,0.94)",
    padding: "4px 6px",
    display: "grid",
    alignContent: "center",
    minWidth: 0,
  },
  taskInlineCellSmall: {
    minHeight: 34,
    border: "1px solid var(--stroke)",
    borderRadius: 8,
    background: "rgba(255,255,255,0.94)",
    padding: "4px 6px",
    display: "grid",
    alignContent: "center",
  },
  taskInlineCellMeta: {
    minHeight: 34,
    border: "1px solid var(--stroke)",
    borderRadius: 8,
    background: "rgba(255,255,255,0.94)",
    padding: "4px 6px",
    display: "grid",
    alignContent: "center",
    gap: 2,
    minWidth: 0,
  },
  taskInlineActions: {
    minHeight: 34,
    border: "1px solid var(--stroke)",
    borderRadius: 8,
    background: "rgba(255,255,255,0.94)",
    padding: "4px 6px",
    display: "flex",
    alignItems: "center",
    gap: 6,
    justifyContent: "flex-start",
  },
  inputCompact: {
    width: "100%",
    border: "1px solid rgba(117,101,88,0.3)",
    background: "#fff",
    borderRadius: 6,
    padding: "4px 6px",
    outline: "none",
    color: "#000",
    fontSize: 11,
    fontWeight: 600,
  },
  tdCompact: { padding: "6px 6px", verticalAlign: "top", borderTop: "1px solid #000" },
  code: { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent-deep)" },
  metaStrong: { fontSize: 12, fontWeight: 600 },
  meta: { fontSize: 10, color: "var(--muted)", marginTop: 2, lineHeight: 1.25 },
  titleCell: { fontSize: 12, fontWeight: 700, marginTop: 2, lineHeight: 1.2 },
  badge: {
    display: "inline-flex",
    padding: "5px 8px",
    borderRadius: 999,
    background: "rgba(196,93,44,0.11)",
    color: "var(--accent-deep)",
    fontSize: 11,
    fontWeight: 700,
  },
  badgeMuted: {
    display: "inline-flex",
    marginTop: 6,
    padding: "5px 8px",
    borderRadius: 999,
    background: "rgba(117,101,88,0.1)",
    color: "var(--muted)",
    fontSize: 11,
  },
  badgeStatus: (status: string) => ({
    display: "inline-flex",
    padding: "5px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    background:
      normalizeStatusValue(status) === "completed"
        ? "rgba(31,122,76,0.12)"
        : normalizeStatusValue(status) === "in_progress"
          ? "rgba(187,122,19,0.12)"
          : normalizeStatusValue(status) === "hold"
            ? "rgba(184,61,45,0.12)"
            : "rgba(117,101,88,0.1)",
    color:
      normalizeStatusValue(status) === "completed"
        ? "var(--success)"
        : normalizeStatusValue(status) === "in_progress"
          ? "var(--warning)"
          : normalizeStatusValue(status) === "hold"
            ? "var(--danger)"
            : "var(--muted)",
  }),
  compactSelect: {
    border: "1px solid var(--stroke)",
    background: "white",
    appearance: "none",
    backgroundImage:
      'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22black%22 stroke-width=%223%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpolyline points=%226 9 12 15 18 9%22/%3E%3C/svg%3E")',
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 0.35rem center",
    paddingRight: 22,
    color: "#000",
    padding: "5px 8px",
    borderRadius: 8,
    minWidth: 120,
    width: "100%",
    fontSize: 11,
    fontWeight: 700,
    boxShadow: "none",
    textTransform: "none",
  },
  actionStack: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  actionButtonNeutral: {
    border: "none",
    borderRadius: 8,
    background: "rgba(117,101,88,0.12)",
    color: "var(--text)",
    padding: "6px 8px",
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    gap: 6,
    alignItems: "center",
    fontSize: 12,
  },
  actionButtonDanger: {
    border: "none",
    borderRadius: 8,
    background: "rgba(184,61,45,0.12)",
    color: "var(--danger)",
    padding: "6px 8px",
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    gap: 6,
    alignItems: "center",
    fontSize: 12,
  },
  sidePanel: {
    border: "1px solid var(--stroke)",
    borderRadius: 16,
    background: "var(--surface-strong)",
    padding: 10,
    display: "grid",
    gap: 10,
  },
  sideSection: {
    border: "1px solid var(--stroke)",
    borderRadius: 14,
    background: "rgba(255,255,255,0.5)",
    padding: 10,
    display: "grid",
    gap: 6,
  },
  sideHeading: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" },
  sideTitle: { fontSize: 15, fontWeight: 700 },
  feedItem: { borderTop: "1px solid var(--stroke)", paddingTop: 8 },
  feedTitle: { fontSize: 12, fontWeight: 700 },
  uploadForm: { display: "grid", gap: 8, marginTop: 8 },
  emptyState: { textAlign: "center", padding: 18, color: "var(--muted)", fontSize: 12 },
};
