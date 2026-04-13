import { type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { filterVisibleRecords } from "@/lib/recruitment-visibility";
import { proxyJsonResponse } from "@/lib/upstream-proxy";
import type { Interview } from "@/lib/types";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const upstream = new URL(backendUrl("/rec/interviews"));
  url.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  return proxyJsonResponse<Interview[]>(
    async () => fetch(upstream.toString(), { cache: "no-store", headers: { ...await authHeaderFromCookie() } }),
    { route: "GET /api/rec/interviews", transform: (payload) => filterVisibleRecords(payload || []) },
  );
}
