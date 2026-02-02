import { cookies } from "next/headers";
import { CandidateListItem } from "@/lib/types";
import { internalUrl } from "@/lib/internal";
import { OpeningListItem } from "@/lib/types";
import { CandidatesClient } from "./CandidatesClient";

async function fetchCandidates() {
  const url = new URL(await internalUrl("/api/rec/candidates"));
  const cookieHeader = cookies().toString();
  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
  if (!res.ok) {
    console.error("Failed to load candidates", res.status, await res.text());
    return [] as CandidateListItem[];
  }
  return (await res.json()) as CandidateListItem[];
}

async function fetchOpenings() {
  const url = await internalUrl("/api/rec/openings");
  const cookieHeader = cookies().toString();
  const res = await fetch(url, { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
  if (!res.ok) return [] as OpeningListItem[];
  try {
    return (await res.json()) as OpeningListItem[];
  } catch {
    return [] as OpeningListItem[];
  }
}

export default async function CandidatesPage({
}: {
}) {
  const [candidates, openings] = await Promise.all([fetchCandidates(), fetchOpenings()]);
  return <CandidatesClient initialCandidates={candidates} openings={openings} />;
}
