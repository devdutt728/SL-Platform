import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const res = await fetch(backendUrl(`/rec/offers/${encodeURIComponent(params.id)}`), {
    cache: "no-store",
    headers: { ...authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const body = await request.text();
  const res = await fetch(backendUrl(`/rec/offers/${encodeURIComponent(params.id)}`), {
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

export async function DELETE(_request: Request, { params }: Params) {
  const res = await fetch(backendUrl(`/rec/offers/${encodeURIComponent(params.id)}`), {
    method: "DELETE",
    headers: { ...authHeaderFromCookie() },
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
