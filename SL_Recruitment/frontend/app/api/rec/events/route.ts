import { type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { filterVisibleRecords } from "@/lib/recruitment-visibility";
import { proxyJsonResponse } from "@/lib/upstream-proxy";
import type { CandidateEvent } from "@/lib/types";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const upstream = new URL(backendUrl("/rec/events"));
  url.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  return proxyJsonResponse<CandidateEvent[]>(
    async () => fetch(upstream.toString(), { cache: "no-store", headers: { ...await authHeaderFromCookie() } }),
    { route: "GET /api/rec/events", transform: (payload) => filterVisibleRecords(payload || []) },
  );
}

