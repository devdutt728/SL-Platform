import { redirect } from "next/navigation";
import { requireSuperadminAccess } from "../server";

type SearchParams = Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

function toQueryString(searchParams: SearchParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "undefined") continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
      continue;
    }
    query.set(key, value);
  }
  return query.toString();
}

export default async function LegacyIngestOpsRoute({ searchParams }: Props) {
  await requireSuperadminAccess();
  const resolved = (await Promise.resolve(searchParams ?? {})) as SearchParams;
  const query = toQueryString(resolved);
  redirect(query ? `/superadmin/ingest-ops?${query}` : "/superadmin/ingest-ops");
}
