import { cookieHeader } from "@/lib/cookie-header";
import { internalUrl } from "@/lib/internal";
import { getAuthMe } from "@/lib/auth-me";
import type { CandidateEvent, CandidateListItem, CandidateOffer, DashboardMetrics, OpeningListItem, OpeningRequest } from "@/lib/types";
import { fetchJsonOr } from "@/lib/server-json";
import DashboardClient from "./DashboardClient";

function normalizeRole(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isHrRole(value: string) {
  if (!value) return false;
  const compact = value.replace(/_/g, "");
  if (value === "hr" || value.startsWith("hr_") || value.startsWith("hr")) return true;
  return compact.includes("humanresource");
}

async function fetchDashboard() {
  const url = await internalUrl("/api/rec/dashboard?stuck_days=5");
  const cookieValue = await cookieHeader();
  return fetchJsonOr<DashboardMetrics | null>(url, {
    fallback: null,
    cookie: cookieValue,
    label: "dashboard.metrics",
  });
}

async function fetchRecentEvents() {
  const url = await internalUrl("/api/rec/events?limit=10");
  const cookieValue = await cookieHeader();
  return fetchJsonOr<CandidateEvent[]>(url, {
    fallback: [],
    cookie: cookieValue,
    label: "dashboard.events",
  });
}

async function fetchOffers() {
  const url = await internalUrl("/api/rec/offers");
  const cookieValue = await cookieHeader();
  return fetchJsonOr<CandidateOffer[]>(url, {
    fallback: [],
    cookie: cookieValue,
    label: "dashboard.offers",
  });
}

async function fetchOpenings() {
  const url = await internalUrl("/api/rec/openings");
  const cookieValue = await cookieHeader();
  return fetchJsonOr<OpeningListItem[]>(url, {
    fallback: [],
    cookie: cookieValue,
    label: "dashboard.openings",
  });
}

async function fetchCandidates() {
  const url = await internalUrl("/api/rec/candidates?limit=200");
  const cookieValue = await cookieHeader();
  return fetchJsonOr<CandidateListItem[]>(url, {
    fallback: [],
    cookie: cookieValue,
    label: "dashboard.candidates",
  });
}

async function fetchPendingOpeningRequests() {
  const url = await internalUrl("/api/rec/openings/requests?status=pending_hr_approval");
  const cookieValue = await cookieHeader();
  return fetchJsonOr<OpeningRequest[]>(url, {
    fallback: [],
    cookie: cookieValue,
    label: "dashboard.opening_requests",
  });
}

export default async function DashboardPage() {
  const me = await getAuthMe();
  const roleIdRaw = me?.platform_role_id ?? null;
  const parsedRoleId =
    roleIdRaw === null || roleIdRaw === undefined || String(roleIdRaw).trim() === ""
      ? NaN
      : typeof roleIdRaw === "number"
        ? roleIdRaw
        : Number(roleIdRaw);
  const roleId = Number.isFinite(parsedRoleId) ? parsedRoleId : null;
  const roleIds = [
    roleId,
    ...((me?.platform_role_ids || []).map((id) => {
      if (id === null || id === undefined || String(id).trim() === "") return NaN;
      return typeof id === "number" ? id : Number(id);
    })),
  ].filter((id): id is number => Number.isFinite(id));
  const normalizedRoles = [
    ...(me?.roles || []),
    ...(me?.platform_role_codes || []),
    ...(me?.platform_role_names || []),
    me?.platform_role_code || "",
    me?.platform_role_name || "",
  ]
    .map((role) => normalizeRole(role))
    .filter(Boolean);
  const isSuperadmin =
    roleIds.includes(2) || normalizedRoles.some((role) => ["2", "superadmin", "s_admin", "super_admin"].includes(role));
  const isHr = isSuperadmin || normalizedRoles.some((role) => isHrRole(role));
  const isInterviewer =
    normalizedRoles.includes("interviewer") ||
    normalizedRoles.includes("gl") ||
    normalizedRoles.includes("group_lead") ||
    normalizedRoles.includes("hiring_manager") ||
    roleIds.includes(5) ||
    roleIds.includes(6);
  const canViewOffers = isHr || isSuperadmin;
  const canViewOpeningRequestNotifications = isHr || isSuperadmin;
  const roleWorkspacePreset: "hr" | "interviewer" | "ops" = isHr ? "hr" : isInterviewer ? "interviewer" : "ops";
  const lockWorkspacePreset = isInterviewer && !isHr;

  const [metrics, events, offers, openings, candidates, openingRequests] = await Promise.all([
    fetchDashboard(),
    fetchRecentEvents(),
    canViewOffers ? fetchOffers() : Promise.resolve([] as CandidateOffer[]),
    fetchOpenings(),
    fetchCandidates(),
    canViewOpeningRequestNotifications ? fetchPendingOpeningRequests() : Promise.resolve([] as OpeningRequest[]),
  ]);
  const hideActivity = isInterviewer && !isHr;
  const canNavigate = true;
  const canNavigatePipeline = true;
  return (
    <DashboardClient
      initialMetrics={metrics}
      initialEvents={events}
      initialOffers={offers}
      initialOpenings={openings}
      initialCandidates={candidates}
      initialOpeningRequests={openingRequests}
      canViewOffers={canViewOffers}
      canViewOpeningRequestNotifications={canViewOpeningRequestNotifications}
      canNavigate={canNavigate}
      canNavigatePipeline={canNavigatePipeline}
      hideActivity={hideActivity}
      roleWorkspacePreset={roleWorkspacePreset}
      lockWorkspacePreset={lockWorkspacePreset}
    />
  );
}


