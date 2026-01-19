import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(_request: Request, context: { params: { id: string } }) {
  const res = await fetch(backendUrl(`/rec/interviews/${encodeURIComponent(context.params.id)}/l2-assessment`), {
    cache: "no-store",
    headers: { ...authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function PUT(request: Request, context: { params: { id: string } }) {
  const body = await request.text();
  const res = await fetch(backendUrl(`/rec/interviews/${encodeURIComponent(context.params.id)}/l2-assessment`), {
    method: "PUT",
    headers: { "content-type": "application/json", ...authHeaderFromCookie() },
    body,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
