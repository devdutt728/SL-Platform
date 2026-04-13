import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { filterVisibleRecords } from "@/lib/recruitment-visibility";
import { proxyJsonResponse } from "@/lib/upstream-proxy";
import type { CandidateOffer } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Params) {
  const params = await context.params;
  return proxyJsonResponse<CandidateOffer[]>(
    async () =>
      fetch(backendUrl(`/rec/candidates/${encodeURIComponent(params.id)}/offers`), {
        cache: "no-store",
        headers: { ...await authHeaderFromCookie() },
      }),
    { route: "GET /api/rec/candidates/[id]/offers", transform: (payload) => filterVisibleRecords(payload || []) },
  );
}

export async function POST(request: NextRequest, context: Params) {
  const params = await context.params;
  const body = await request.text();
  const res = await fetch(backendUrl(`/rec/candidates/${encodeURIComponent(params.id)}/offers`), {
    method: "POST",
    headers: { "content-type": "application/json", ...await authHeaderFromCookie() },
    body,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
