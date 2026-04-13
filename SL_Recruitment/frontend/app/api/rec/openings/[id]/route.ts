import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { proxyJsonResponse } from "@/lib/upstream-proxy";
import { visibleRecordOrNull } from "@/lib/recruitment-visibility";
import type { OpeningDetail } from "@/lib/types";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  return proxyJsonResponse<OpeningDetail>(
    async () =>
      fetch(backendUrl(`/rec/openings/${params.id}`), {
        method: "GET",
        headers: { ...await authHeaderFromCookie() },
      }),
    { route: "GET /api/rec/openings/[id]", transform: (payload) => visibleRecordOrNull(payload) },
  );
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const body = await request.text();
  const res = await fetch(backendUrl(`/rec/openings/${params.id}`), {
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

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/rec/openings/${params.id}`), {
    method: "DELETE",
    headers: { ...await authHeaderFromCookie() },
  });
  return new NextResponse(null, { status: res.status });
}
