import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { proxyJsonResponse } from "@/lib/upstream-proxy";
import { visibleRecordOrNull } from "@/lib/recruitment-visibility";
import type { CandidateDetail } from "@/lib/types";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  return proxyJsonResponse<CandidateDetail>(
    async () =>
      fetch(backendUrl(`/rec/candidates/${params.id}`), {
        headers: { ...await authHeaderFromCookie() },
        cache: "no-store",
      }),
    { route: "GET /api/rec/candidates/[id]", transform: (payload) => visibleRecordOrNull(payload) },
  );
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/rec/candidates/${params.id}`), {
    method: "DELETE",
    headers: { ...await authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const body = await request.text();
  const res = await fetch(backendUrl(`/rec/candidates/${params.id}`), {
    method: "PATCH",
    headers: { ...await authHeaderFromCookie(), "content-type": request.headers.get("content-type") || "application/json" },
    body,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
