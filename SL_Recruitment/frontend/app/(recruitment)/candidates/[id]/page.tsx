import { cookieHeader } from "@/lib/cookie-header";
import { notFound } from "next/navigation";
import { CandidateFull } from "@/lib/types";
import { internalUrl } from "@/lib/internal";
import { Candidate360Client } from "./Candidate360Client";
import { redirect } from "next/navigation";

type Me = {
  platform_role_id?: number | null;
  platform_role_code?: string | null;
  roles?: string[] | null;
};

async function fetchCandidateFull(id: string): Promise<CandidateFull | null> {
  const url = await internalUrl(`/api/rec/candidates/${encodeURIComponent(id)}/full`);
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return null;
  return (await res.json()) as CandidateFull;
}

async function fetchMe(): Promise<Me | null> {
  const url = await internalUrl("/api/auth/me");
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return null;
  try {
    return (await res.json()) as Me;
  } catch {
    return null;
  }
}

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [full, me] = await Promise.all([fetchCandidateFull(id), fetchMe()]);
  if (!full) notFound();
  const roleId = me?.platform_role_id ?? null;
  const roleCode = (me?.platform_role_code ?? "").trim();
  const roleName = (me?.platform_role_name ?? "").trim().toLowerCase();
  const roleCodes = (me?.platform_role_codes || []).map((code) => String(code).trim().toLowerCase());
  const roleNames = (me?.platform_role_names || []).map((name) => String(name).trim().toLowerCase());
  const isSuperadmin =
    roleId === 2 ||
    roleCode === "2" ||
    roleName.replace(/\s+/g, "") === "superadmin" ||
    roleCodes.includes("2") ||
    roleCodes.includes("superadmin") ||
    roleCodes.includes("s_admin") ||
    roleNames.some((name) => name.replace(/\s+/g, "") === "superadmin");
  if (roleId === 6 || roleCode === "6") {
    redirect("/interviewer");
  }
  const canDelete = isSuperadmin;
  const roles = (me?.roles || []).map((role) => String(role).toLowerCase());
  const canSchedule =
    roles.includes("hr_admin") ||
    roles.includes("hr_exec") ||
    isSuperadmin ||
    (me?.platform_role_id ?? null) === 5 ||
    ["2", "5"].includes((me?.platform_role_code ?? "").trim());
  const canSkip = isSuperadmin;
  const canCancelInterview =
    canSkip ||
    roles.includes("hr_admin") ||
    roles.includes("hr_exec") ||
    (me?.platform_role_id ?? null) === 5 ||
    ["5"].includes((me?.platform_role_code ?? "").trim());
  const canUploadJoiningDocs =
    roles.includes("hr_admin") ||
    roles.includes("hr_exec") ||
    isSuperadmin ||
    ["2"].includes((me?.platform_role_code ?? "").trim());

  return (
    <Candidate360Client
      candidateId={id}
      initial={full}
      canDelete={canDelete}
      canSchedule={canSchedule}
      canSkip={canSkip}
      canCancelInterview={canCancelInterview}
      canUploadJoiningDocs={canUploadJoiningDocs}
    />
  );
}

