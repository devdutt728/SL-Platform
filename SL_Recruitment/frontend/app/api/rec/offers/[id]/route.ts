import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { proxyJsonResponse } from "@/lib/upstream-proxy";
import { visibleRecordOrNull } from "@/lib/recruitment-visibility";
import type { CandidateOffer } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Params) {
  const params = await context.params;
  return proxyJsonResponse<CandidateOffer>(
    async () =>
      fetch(backendUrl(`/rec/offers/${encodeURIComponent(params.id)}`), {
        cache: "no-store",
        headers: { ...await authHeaderFromCookie() },
      }),
    { route: "GET /api/rec/offers/[id]", transform: (payload) => visibleRecordOrNull(payload) },
  );
}

export async function PATCH(request: NextRequest, context: Params) {
  const params = await context.params;
  const body = await request.text();
  const res = await fetch(backendUrl(`/rec/offers/${encodeURIComponent(params.id)}`), {
    method: "PATCH",
    headers: { "content-type": "application/json", ...await authHeaderFromCookie() },
    body,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function DELETE(_request: NextRequest, context: Params) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/rec/offers/${encodeURIComponent(params.id)}`), {
    method: "DELETE",
    headers: { ...await authHeaderFromCookie() },
  });
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
