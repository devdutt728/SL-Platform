import { cookieHeader } from "@/lib/cookie-header";
import { internalUrl } from "@/lib/internal";
import { getAuthMe } from "@/lib/auth-me";
import type { CandidateEvent, CandidateListItem, CandidateOffer, DashboardMetrics, OpeningListItem } from "@/lib/types";
import DashboardClient from "./DashboardClient";

async function fetchDashboard() {
  const url = await internalUrl("/api/rec/dashboard?stuck_days=5");
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return null;
  return (await res.json()) as DashboardMetrics;
}

async function fetchRecentEvents() {
  const url = await internalUrl("/api/rec/events?limit=10");
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return [] as CandidateEvent[];
  return (await res.json()) as CandidateEvent[];
}

async function fetchOffers() {
  const url = await internalUrl("/api/rec/offers");
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return [] as CandidateOffer[];
  return (await res.json()) as CandidateOffer[];
}

async function fetchOpenings() {
  const url = await internalUrl("/api/rec/openings");
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return [] as OpeningListItem[];
  try {
    return (await res.json()) as OpeningListItem[];
  } catch {
    return [] as OpeningListItem[];
  }
}

async function fetchCandidates() {
  const url = await internalUrl("/api/rec/candidates");
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return [] as CandidateListItem[];
  try {
    return (await res.json()) as CandidateListItem[];
  } catch {
    return [] as CandidateListItem[];
  }
}

export default async function DashboardPage() {
  const me = await getAuthMe();
  const roles = (me?.roles || []).map((role) => (role || "").toLowerCase());
  const isHr = roles.includes("hr_admin") || roles.includes("hr_exec");
  const isInterviewer = roles.includes("interviewer") || roles.includes("gl") || roles.includes("hiring_manager");
  const roleIdRaw = me?.platform_role_id ?? null;
  const roleIdNum = typeof roleIdRaw === "number" ? roleIdRaw : Number(roleIdRaw);
  const roleCode = (me?.platform_role_code ?? "").trim();
  const roleIdsRaw = (me?.platform_role_ids || []) as Array<number | string>;
  const roleIds = roleIdsRaw
    .map((id) => (typeof id === "number" ? id : Number(id)))
    .filter((id) => Number.isFinite(id));
  const roleCodes = (me?.platform_role_codes || []).map((code) => (code || "").trim()).filter(Boolean);
  const isRole6 =
    roleIdNum === 6 ||
    roleCode === "6" ||
    roleCodes.includes("6") ||
    roleIds.includes(6) ||
    roleIdsRaw.map((id) => String(id).trim()).includes("6");

  const [metrics, events, offers, openings, candidates] = await Promise.all([
    fetchDashboard(),
    fetchRecentEvents(),
    fetchOffers(),
    fetchOpenings(),
    fetchCandidates(),
  ]);
  const hideActivity = (isInterviewer && !isHr) || isRole6;
  const canNavigate = !isRole6;
  const canNavigatePipeline = true;
  return (
    <DashboardClient
      initialMetrics={metrics}
      initialEvents={events}
      initialOffers={offers}
      initialOpenings={openings}
      initialCandidates={candidates}
      canNavigate={canNavigate}
      canNavigatePipeline={canNavigatePipeline}
      hideActivity={hideActivity}
    />
  );
}


