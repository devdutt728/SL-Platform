import { cookieHeader } from "@/lib/cookie-header";
import { internalUrl } from "@/lib/internal";
import type { CandidateEvent, CandidateOffer, DashboardMetrics } from "@/lib/types";
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

export default async function DashboardPage() {
  const cookieValue = await cookieHeader();
  const meRes = await fetch(await internalUrl("/api/auth/me"), {
    cache: "no-store",
    headers: cookieValue ? { cookie: cookieValue } : undefined,
  });
  const me =
    (meRes.ok
      ? ((await meRes.json()) as {
          roles?: string[] | null;
          platform_role_id?: number | null;
          platform_role_code?: string | null;
          platform_role_ids?: number[] | null;
          platform_role_codes?: string[] | null;
        })
      : null) || null;
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

  const [metrics, events, offers] = await Promise.all([fetchDashboard(), fetchRecentEvents(), fetchOffers()]);
  const hideActivity = (isInterviewer && !isHr) || isRole6;
  const canNavigate = !isRole6;
  const canNavigatePipeline = true;
  return (
    <DashboardClient
      initialMetrics={metrics}
      initialEvents={events}
      initialOffers={offers}
      canNavigate={canNavigate}
      canNavigatePipeline={canNavigatePipeline}
      hideActivity={hideActivity}
    />
  );
}


