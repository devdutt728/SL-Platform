import { cookies } from "next/headers";
import { internalUrl } from "@/lib/internal";
import { notFound } from "next/navigation";
import { Interview } from "@/lib/types";
import { GLPortalClient } from "./GLPortalClient";

type Me = {
  platform_role_id?: number | null;
  roles?: string[] | null;
};

async function fetchInterviews(params: Record<string, string>) {
  const url = new URL(await internalUrl("/api/rec/interviews"));
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

export default async function GLPortalPage() {
  const cookieHeader = cookies().toString();
  const meRes = await fetch(await internalUrl("/api/auth/me"), {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
  const me = (meRes.ok ? ((await meRes.json()) as Me) : null) || null;
  const roles = (me?.roles || []).map((role) => String(role).toLowerCase());
  const isAllowed = roles.some((role) => ["gl", "interviewer", "hr_admin", "hr_exec"].includes(role));

  if (!isAllowed) notFound();

  const useMeFilter = (roles.includes("interviewer") || roles.includes("gl")) && !roles.includes("hr_admin") && !roles.includes("hr_exec");
  const interviews = await fetchInterviews({ ...(useMeFilter ? { interviewer: "me" } : {}) });

  return <GLPortalClient initialInterviews={interviews} useMeFilter={useMeFilter} />;
}
