import { internalUrl } from "@/lib/internal";
import { OpeningListItem } from "@/lib/types";
import { fetchJsonOr } from "@/lib/server-json";
import { OpeningsClient } from "./ui";
import { getAuthMe } from "@/lib/auth-me";

async function fetchOpenings() {
  return fetchJsonOr<OpeningListItem[]>(await internalUrl("/api/rec/openings"), {
    fallback: [],
    label: "openings.list",
  });
}

export default async function OpeningsPage() {
  const [openings, me] = await Promise.all([fetchOpenings(), getAuthMe()]);
  return <OpeningsClient initialOpenings={openings} initialMe={me} />;
}

