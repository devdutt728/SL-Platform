import { cookieHeader } from "@/lib/cookie-header";
import { Interview } from "@/lib/types";
import { InterviewerClient } from "./InterviewerClient";
import { getAuthMe } from "@/lib/auth-me";
import { internalUrl } from "@/lib/internal";

type Me = {
  platform_role_id?: number | string | null;
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
  const me = (await getAuthMe()) as Me | null;
  const roles = (me?.roles || []).map((role) => String(role).toLowerCase());
  const useMeFilter = (roles.includes("interviewer") || roles.includes("gl")) && !roles.includes("hr_admin") && !roles.includes("hr_exec");
  const canAssignReviewer = roles.includes("hr_admin") || roles.includes("hr_exec");
  const canManageInterviews = true;
  const canViewCandidate360 = true;

  const [upcoming, past] = await Promise.all([
    fetchInterviews({ ...(useMeFilter ? { interviewer: "me" } : {}), upcoming: "true" }),
    fetchInterviews({ ...(useMeFilter ? { interviewer: "me" } : {}), upcoming: "false" }),
  ]);

  return (
    <InterviewerClient
      initialUpcoming={upcoming}
      initialPast={past}
      assignedCandidates={[]}
      useMeFilter={useMeFilter}
      canAssignReviewer={canAssignReviewer}
      canManageInterviews={canManageInterviews}
      canViewCandidate360={canViewCandidate360}
    />
  );
}


