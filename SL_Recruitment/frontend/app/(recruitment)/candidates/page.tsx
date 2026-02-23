import { cookieHeader } from "@/lib/cookie-header";
import { CandidateListItem } from "@/lib/types";
import { internalUrl } from "@/lib/internal";
import { OpeningListItem } from "@/lib/types";
import { CandidatesClient } from "./CandidatesClient";
import { redirect } from "next/navigation";
import { getAuthMe } from "@/lib/auth-me";

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
  const roles = (me?.roles || []).map((role) => String(role).toLowerCase());
  const roleIdRaw = me?.platform_role_id ?? null;
  const roleIdNum = typeof roleIdRaw === "number" ? roleIdRaw : Number(roleIdRaw);
  const roleCode = (me?.platform_role_code ?? "").trim();
  const isHr = roles.includes("hr_admin") || roles.includes("hr_exec") || roleIdNum === 2;
  const isInterviewer = roles.includes("interviewer") || roles.includes("gl") || roles.includes("hiring_manager");
  const isRole6 = roleIdNum === 6 || roleCode === "6";
  if (isInterviewer && !isHr && !isRole6) {
    redirect("/interviewer");
  }
  const [candidates, openings] = await Promise.all([fetchCandidates(), fetchOpenings()]);
  return <CandidatesClient initialCandidates={candidates} openings={openings} canNavigate={!isRole6} />;
}


