import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(_request: Request, context: { params: { person_id: string } }) {
  const res = await fetch(backendUrl(`/platform/people/${context.params.person_id}`), {
    cache: "no-store",
    headers: { ...authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function PATCH(request: Request, context: { params: { person_id: string } }) {
  const body = await request.text();
  const res = await fetch(backendUrl(`/platform/people/${context.params.person_id}`), {
    method: "PATCH",
    headers: { "content-type": "application/json", ...authHeaderFromCookie() },
    body,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function DELETE(_request: Request, context: { params: { person_id: string } }) {
  const res = await fetch(backendUrl(`/platform/people/${context.params.person_id}`), {
    method: "DELETE",
    headers: { ...authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
