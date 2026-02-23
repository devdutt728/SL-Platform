import { cookieHeader } from "@/lib/cookie-header";
import { notFound } from "next/navigation";
import { Interview } from "@/lib/types";
import { GLPortalClient } from "./GLPortalClient";
import { getAuthMe } from "@/lib/auth-me";
import { internalUrl } from "@/lib/internal";

type Me = {
  platform_role_id?: number | string | null;
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

export default async function GLPortalPage() {
  const me = (await getAuthMe()) as Me | null;
  const roles = (me?.roles || []).map((role) => String(role).toLowerCase());
  const isAllowed = roles.some((role) => ["gl", "interviewer", "hr_admin", "hr_exec"].includes(role));

  if (!isAllowed) notFound();

  const useMeFilter = (roles.includes("interviewer") || roles.includes("gl")) && !roles.includes("hr_admin") && !roles.includes("hr_exec");
  const interviews = await fetchInterviews({ ...(useMeFilter ? { interviewer: "me" } : {}) });

  return <GLPortalClient initialInterviews={interviews} useMeFilter={useMeFilter} />;
}


