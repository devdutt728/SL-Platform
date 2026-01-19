import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const body = await request.text();
  const res = await fetch(backendUrl(`/platform/roles/${context.params.id}`), {
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

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const res = await fetch(backendUrl(`/platform/roles/${context.params.id}`), {
    method: "DELETE",
    headers: { ...authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
