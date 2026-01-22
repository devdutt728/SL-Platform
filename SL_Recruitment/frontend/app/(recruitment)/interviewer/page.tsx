import { cookies } from "next/headers";
import { internalUrl } from "@/lib/internal";
import { Interview } from "@/lib/types";
import { InterviewerClient } from "./InterviewerClient";

type Me = {
  platform_role_id?: number | null;
  platform_role_code?: string | null;
  roles?: string[] | null;
};

async function fetchInterviews(params: Record<string, string>) {
  const url = new URL(internalUrl("/api/rec/interviews"));
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const cookieHeader = cookies().toString();
  const res = await fetch(url.toString(), { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
  if (!res.ok) return [] as Interview[];
  try {
    return (await res.json()) as Interview[];
  } catch {
    return [] as Interview[];
  }
}

export default async function InterviewerPage() {
  const cookieHeader = cookies().toString();
  const meRes = await fetch(internalUrl("/api/auth/me"), {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
  const me = (meRes.ok ? ((await meRes.json()) as Me) : null) || null;
  const roles = (me?.roles || []).map((role) => String(role).toLowerCase());
  const useMeFilter = (roles.includes("interviewer") || roles.includes("gl")) && !roles.includes("hr_admin") && !roles.includes("hr_exec");
  const canAssignReviewer = roles.includes("hr_admin") || roles.includes("hr_exec");

  const [upcoming, past] = await Promise.all([
    fetchInterviews({ ...(useMeFilter ? { interviewer: "me" } : {}), upcoming: "true" }),
    fetchInterviews({ ...(useMeFilter ? { interviewer: "me" } : {}), upcoming: "false" }),
  ]);

  return <InterviewerClient initialUpcoming={upcoming} initialPast={past} useMeFilter={useMeFilter} canAssignReviewer={canAssignReviewer} />;
}
