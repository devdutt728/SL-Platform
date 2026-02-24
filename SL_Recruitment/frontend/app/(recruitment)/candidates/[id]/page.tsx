import { cookieHeader } from "@/lib/cookie-header";
import { notFound } from "next/navigation";
import { CandidateFull } from "@/lib/types";
import { internalUrl } from "@/lib/internal";
import { Candidate360Client } from "./Candidate360Client";
import { getAuthMe } from "@/lib/auth-me";

type Me = {
  platform_role_id?: number | string | null;
  platform_role_code?: string | null;
  platform_role_name?: string | null;
  platform_role_ids?: Array<number | string> | null;
  platform_role_codes?: string[] | null;
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

async function fetchCandidateFull(id: string): Promise<CandidateFull | null> {
  const url = await internalUrl(`/api/rec/candidates/${encodeURIComponent(id)}/full`);
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return null;
  return (await res.json()) as CandidateFull;
}

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = (await getAuthMe()) as Me | null;
  const roleIdRaw = me?.platform_role_id ?? null;
  const roleId =
    roleIdRaw === null || roleIdRaw === undefined || String(roleIdRaw).trim() === ""
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
  const roleCode = normalizeRole(me?.platform_role_code ?? "");
  const roleName = normalizeRole(me?.platform_role_name ?? "");
  const roleCodes = (me?.platform_role_codes || []).map((code) => normalizeRole(code));
  const roleNames = (me?.platform_role_names || []).map((name) => normalizeRole(name));
  const superadminTokens = ["2", "superadmin", "super_admin", "s_admin"];
  const isSuperadmin =
    roleIds.includes(2) ||
    superadminTokens.includes(roleCode) ||
    superadminTokens.includes(roleName) ||
    roleCodes.some((code) => superadminTokens.includes(code)) ||
    roleNames.some((name) => superadminTokens.includes(name));
  const canDelete = isSuperadmin;
  const roles = (me?.roles || []).map((role) => String(role).toLowerCase());
  const normalizedRoles = [
    ...roles,
    ...(me?.platform_role_codes || []),
    ...(me?.platform_role_names || []),
    me?.platform_role_code || "",
    me?.platform_role_name || "",
  ]
    .map((role) => normalizeRole(role))
    .filter(Boolean);
  const isHrLikeRole = isSuperadmin || normalizedRoles.some((role) => isHrRole(role));
  const isRoleFiveOrSix = roleIds.includes(5) || roleIds.includes(6);
  if (isRoleFiveOrSix && !isHrLikeRole && !isSuperadmin) {
    notFound();
  }
  const full = await fetchCandidateFull(id);
  if (!full) notFound();
  const canManageCandidate360 = !(isRoleFiveOrSix && !isHrLikeRole && !isSuperadmin);
  const canSchedule = canManageCandidate360 && (isHrLikeRole || isSuperadmin);
  const canSkip = isSuperadmin;
  const canCancelInterview = canManageCandidate360 && (canSkip || isHrLikeRole);
  const canUploadJoiningDocs = canManageCandidate360 && (isHrLikeRole || isSuperadmin);
  const canAccessOffers = canManageCandidate360 && (isHrLikeRole || isSuperadmin);

  return (
    <Candidate360Client
      candidateId={id}
      initial={full}
      canManageCandidate360={canManageCandidate360}
      canDelete={canDelete}
      canSchedule={canSchedule}
      canSkip={canSkip}
      canCancelInterview={canCancelInterview}
      canUploadJoiningDocs={canUploadJoiningDocs}
      canAccessOffers={canAccessOffers}
    />
  );
}

