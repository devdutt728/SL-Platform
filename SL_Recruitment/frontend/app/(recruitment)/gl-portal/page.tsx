import { cookieHeader } from "@/lib/cookie-header";
import { notFound } from "next/navigation";
import { Interview, OpeningListItem } from "@/lib/types";
import { GLPortalClient } from "./GLPortalClient";
import { getAuthMe } from "@/lib/auth-me";
import { internalUrl } from "@/lib/internal";

type Me = {
  email?: string | null;
  person_id_platform?: string | null;
  full_name?: string | null;
  platform_role_id?: number | string | null;
  platform_role_ids?: Array<number | string> | null;
  platform_role_code?: string | null;
  platform_role_codes?: string[] | null;
  platform_role_name?: string | null;
  platform_role_names?: string[] | null;
  roles?: string[] | null;
};

function normalizeRole(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isHrRole(value: string) {
  if (!value) return false;
  const compact = value.replace(/_/g, "");
  if (value === "hr" || value.startsWith("hr_") || value.startsWith("hr")) return true;
  return compact.includes("humanresource");
}

function isGlRole(value: string) {
  if (!value) return false;
  return value === "gl" || value === "group_lead" || value === "grouplead" || value === "hiring_manager";
}

async function fetchInterviews(params: Record<string, string>) {
  const url = new URL(await internalUrl("/api/rec/interviews"));
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const cookieValue = await cookieHeader();
  const res = await fetch(url.toString(), { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return [] as Interview[];
  try {
    return (await res.json()) as Interview[];
  } catch {
    return [] as Interview[];
  }
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

export default async function GLPortalPage() {
  const me = (await getAuthMe()) as Me | null;
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
  const normalizedRoles = (me?.roles || []).map((role) => normalizeRole(role)).filter(Boolean);
  const normalizedRoleCodes = [...(me?.platform_role_codes || []), me?.platform_role_code || ""]
    .map((code) => normalizeRole(code))
    .filter(Boolean);
  const normalizedRoleNames = [...(me?.platform_role_names || []), me?.platform_role_name || ""]
    .map((name) => normalizeRole(name))
    .filter(Boolean);
  const hasPlatformRoleMeta = roleIds.length > 0 || normalizedRoleCodes.length > 0 || normalizedRoleNames.length > 0;

  const isSuperadmin =
    roleIds.includes(2) ||
    normalizedRoleCodes.some((role) => ["2", "superadmin", "s_admin", "super_admin"].includes(role)) ||
    normalizedRoleNames.some((role) => ["2", "superadmin", "s_admin", "super_admin"].includes(role));
  const isHr =
    isSuperadmin ||
    (hasPlatformRoleMeta
      ? [...normalizedRoleCodes, ...normalizedRoleNames].some((role) => isHrRole(role))
      : normalizedRoles.some((role) => role === "hr_admin" || role === "hr_exec" || isHrRole(role)));
  const isGl = hasPlatformRoleMeta
    ? [...normalizedRoleCodes, ...normalizedRoleNames].some((role) => isGlRole(role))
    : normalizedRoles.some((role) => isGlRole(role));
  const isInterviewer = hasPlatformRoleMeta
    ? [...normalizedRoleCodes, ...normalizedRoleNames].includes("interviewer")
    : normalizedRoles.includes("interviewer");
  const isRoleFiveOrSix = roleIds.includes(5) || roleIds.includes(6);
  const isAllowed = isHr || isGl || isInterviewer || isRoleFiveOrSix;

  if (!isAllowed) notFound();

  const useMeFilter = (isInterviewer || isGl || isRoleFiveOrSix) && !isHr;
  const canRaiseOpeningRequests = isHr || isRoleFiveOrSix;
  const canRaiseNewOpeningRequests = isHr;
  const canApproveOpeningRequests = isHr;
  const canManageOpeningRequests = isSuperadmin;
  const [interviews, openings] = await Promise.all([
    fetchInterviews({ ...(useMeFilter ? { interviewer: "me" } : {}) }),
    fetchOpenings(),
  ]);

  return (
    <GLPortalClient
      initialInterviews={interviews}
      useMeFilter={useMeFilter}
      initialOpenings={openings}
      currentUser={{
        email: me?.email || null,
        person_id_platform: me?.person_id_platform || null,
        full_name: me?.full_name || null,
      }}
      canRaiseOpeningRequests={canRaiseOpeningRequests}
      canRaiseNewOpeningRequests={canRaiseNewOpeningRequests}
      canApproveOpeningRequests={canApproveOpeningRequests}
      canManageOpeningRequests={canManageOpeningRequests}
    />
  );
}


