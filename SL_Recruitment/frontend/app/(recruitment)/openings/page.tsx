import { internalUrl } from "@/lib/internal";
import { OpeningListItem } from "@/lib/types";
import { OpeningsClient } from "./ui";
import { getAuthMe } from "@/lib/auth-me";

async function fetchOpenings() {
  const res = await fetch(await internalUrl("/api/rec/openings"), { cache: "no-store" });
  if (!res.ok) return [] as OpeningListItem[];
  return (await res.json()) as OpeningListItem[];
}

export default async function OpeningsPage() {
  const [openings, me] = await Promise.all([fetchOpenings(), getAuthMe()]);
  return <OpeningsClient initialOpenings={openings} initialMe={me} />;
}

