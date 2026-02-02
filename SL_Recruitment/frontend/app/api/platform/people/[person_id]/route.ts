import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(_request: NextRequest, context: { params: Promise<{ person_id: string }> }) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/platform/people/${params.person_id}`), {
    cache: "no-store",
    headers: { ...await authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ person_id: string }> }) {
  const params = await context.params;
  const body = await request.text();
  const res = await fetch(backendUrl(`/platform/people/${params.person_id}`), {
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

export async function DELETE(_request: NextRequest, context: { params: Promise<{ person_id: string }> }) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/platform/people/${params.person_id}`), {
    method: "DELETE",
    headers: { ...await authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
