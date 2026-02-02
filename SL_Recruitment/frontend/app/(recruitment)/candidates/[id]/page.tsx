import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CandidateFull } from "@/lib/types";
import { internalUrl } from "@/lib/internal";
import { Candidate360Client } from "./Candidate360Client";

type Me = {
  platform_role_id?: number | null;
  platform_role_code?: string | null;
  roles?: string[] | null;
};

async function fetchCandidateFull(id: string): Promise<CandidateFull | null> {
  const url = await internalUrl(`/api/rec/candidates/${encodeURIComponent(id)}/full`);
  const cookieHeader = cookies().toString();
  const res = await fetch(url, { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
  if (!res.ok) return null;
  return (await res.json()) as CandidateFull;
}

async function fetchMe(): Promise<Me | null> {
  const url = await internalUrl("/api/auth/me");
  const cookieHeader = cookies().toString();
  const res = await fetch(url, { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
  if (!res.ok) return null;
  try {
    return (await res.json()) as Me;
  } catch {
    return null;
  }
}

export default async function CandidateDetailPage({ params }: { params: { id: string } }) {
  const [full, me] = await Promise.all([fetchCandidateFull(params.id), fetchMe()]);
  if (!full) notFound();
  const canDelete = (me?.platform_role_id ?? null) === 2 || (me?.platform_role_code ?? "").trim() === "2";
  const roles = (me?.roles || []).map((role) => String(role).toLowerCase());
  const canSchedule =
    roles.includes("hr_admin") ||
    roles.includes("hr_exec") ||
    (me?.platform_role_id ?? null) === 2 ||
    (me?.platform_role_id ?? null) === 5 ||
    ["2", "5"].includes((me?.platform_role_code ?? "").trim());
  const canSkip = (me?.platform_role_id ?? null) === 2 || (me?.platform_role_code ?? "").trim() === "2";
  const canCancelInterview =
    canSkip ||
    roles.includes("hr_admin") ||
    roles.includes("hr_exec") ||
    (me?.platform_role_id ?? null) === 5 ||
    ["5"].includes((me?.platform_role_code ?? "").trim());
  const canUploadJoiningDocs =
    roles.includes("hr_admin") ||
    roles.includes("hr_exec") ||
    (me?.platform_role_id ?? null) === 2 ||
    ["2"].includes((me?.platform_role_code ?? "").trim());

  return (
    <Candidate360Client
      candidateId={params.id}
      initial={full}
      canDelete={canDelete}
      canSchedule={canSchedule}
      canSkip={canSkip}
      canCancelInterview={canCancelInterview}
      canUploadJoiningDocs={canUploadJoiningDocs}
    />
  );
}
