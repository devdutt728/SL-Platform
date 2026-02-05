import { cookieHeader } from "@/lib/cookie-header";
import { CandidateListItem } from "@/lib/types";
import { internalUrl } from "@/lib/internal";
import { OpeningListItem } from "@/lib/types";
import { CandidatesClient } from "./CandidatesClient";
import { redirect } from "next/navigation";

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

async function fetchMe() {
  const url = await internalUrl("/api/auth/me");
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return null;
  try {
    return (await res.json()) as { roles?: string[] | null; platform_role_id?: number | null };
  } catch {
    return null;
  }
}

export default async function CandidatesPage({}: {}) {
  const me = await fetchMe();
  const roles = (me?.roles || []).map((role) => String(role).toLowerCase());
  const isHr = roles.includes("hr_admin") || roles.includes("hr_exec") || (me?.platform_role_id ?? null) === 2;
  const isInterviewer = roles.includes("interviewer") || roles.includes("gl") || roles.includes("hiring_manager");
  if (isInterviewer && !isHr) {
    redirect("/interviewer");
  }
  const [candidates, openings] = await Promise.all([fetchCandidates(), fetchOpenings()]);
  return <CandidatesClient initialCandidates={candidates} openings={openings} />;
}


