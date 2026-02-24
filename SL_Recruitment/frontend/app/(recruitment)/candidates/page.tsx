import { cookieHeader } from "@/lib/cookie-header";
import { CandidateListItem } from "@/lib/types";
import { internalUrl } from "@/lib/internal";
import { OpeningListItem } from "@/lib/types";
import { CandidatesClient } from "./CandidatesClient";
import { redirect } from "next/navigation";
import { getAuthMe } from "@/lib/auth-me";

function normalizeRoleToken(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isHrRoleToken(value: string): boolean {
  if (!value) return false;
  const compact = value.replace(/_/g, "");
  if (value === "hr" || value.startsWith("hr_") || value.startsWith("hr")) return true;
  return compact.includes("humanresource");
}

async function fetchCandidates() {
  const url = new URL(await internalUrl("/api/rec/candidates"));
  const cookieValue = await cookieHeader();
  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: cookieValue ? { cookie: cookieValue } : undefined,
  });
  if (!res.ok) {
    console.error("Failed to load candidates", res.status, await res.text());
    return [] as CandidateListItem[];
  }
  return (await res.json()) as CandidateListItem[];
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

export default async function CandidatesPage({}: {}) {
  const me = await getAuthMe();
  const roleIdRaw = me?.platform_role_id ?? null;
  const roleId = roleIdRaw === null || roleIdRaw === undefined || String(roleIdRaw).trim() === ""
    ? NaN
    : typeof roleIdRaw === "number"
      ? roleIdRaw
      : Number(roleIdRaw);
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
  ].map((role) => normalizeRoleToken(role)).filter(Boolean);

  const isSuperadmin =
    roleIds.includes(2) ||
    normalizedRoles.some((role) => ["2", "superadmin", "s_admin", "super_admin"].includes(role));
  const isRoleFiveOrSix = roleIds.includes(5) || roleIds.includes(6);
  const isHr = isSuperadmin || normalizedRoles.some((role) => isHrRoleToken(role));
  const canAccessCandidate360 = !isRoleFiveOrSix || isHr || isSuperadmin;
  const isInterviewer = normalizedRoles.some((role) =>
    ["interviewer", "gl", "group_lead", "grouplead", "hiring_manager"].includes(role)
  );

  if (isInterviewer && !isHr && !isRoleFiveOrSix) {
    redirect("/interviewer");
  }
  const [candidates, openings] = await Promise.all([fetchCandidates(), fetchOpenings()]);
  return <CandidatesClient initialCandidates={candidates} openings={openings} canNavigate={canAccessCandidate360} />;
}


