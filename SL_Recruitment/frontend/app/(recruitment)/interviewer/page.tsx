import { cookieHeader } from "@/lib/cookie-header";
import { internalUrl } from "@/lib/internal";
import { CandidateListItem, Interview } from "@/lib/types";
import { InterviewerClient } from "./InterviewerClient";

type Me = {
  platform_role_id?: number | null;
  platform_role_code?: string | null;
  roles?: string[] | null;
};

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

export default async function InterviewerPage() {
  const cookieValue = await cookieHeader();
  const meRes = await fetch(await internalUrl("/api/auth/me"), {
    cache: "no-store",
    headers: cookieValue ? { cookie: cookieValue } : undefined,
  });
  const me = (meRes.ok ? ((await meRes.json()) as Me) : null) || null;
  const roles = (me?.roles || []).map((role) => String(role).toLowerCase());
  const useMeFilter = (roles.includes("interviewer") || roles.includes("gl")) && !roles.includes("hr_admin") && !roles.includes("hr_exec");
  const canAssignReviewer = roles.includes("hr_admin") || roles.includes("hr_exec");
  const roleId = me?.platform_role_id ?? null;
  const roleCode = (me?.platform_role_code ?? "").trim();
  const isInterviewerRole6 = roleId === 6 || roleCode === "6";
  const canManageInterviews = !isInterviewerRole6;
  const canViewCandidate360 = !isInterviewerRole6;

  const [upcoming, past, assignedCandidates] = await Promise.all([
    fetchInterviews({ ...(useMeFilter ? { interviewer: "me" } : {}), upcoming: "true" }),
    fetchInterviews({ ...(useMeFilter ? { interviewer: "me" } : {}), upcoming: "false" }),
    isInterviewerRole6 ? fetchCandidates() : Promise.resolve([] as CandidateListItem[]),
  ]);

  return (
    <InterviewerClient
      initialUpcoming={upcoming}
      initialPast={past}
      assignedCandidates={assignedCandidates}
      useMeFilter={useMeFilter}
      canAssignReviewer={canAssignReviewer}
      canManageInterviews={canManageInterviews}
      canViewCandidate360={canViewCandidate360}
    />
  );
}

async function fetchCandidates() {
  const url = new URL(await internalUrl("/api/rec/candidates"));
  const cookieValue = await cookieHeader();
  const res = await fetch(url.toString(), { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return [] as CandidateListItem[];
  try {
    return (await res.json()) as CandidateListItem[];
  } catch {
    return [] as CandidateListItem[];
  }
}


