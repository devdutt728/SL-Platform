import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const limit = url.searchParams.get("limit") || "10";
  const includeDeleted = url.searchParams.get("include_deleted");

  const upstream = new URL(backendUrl("/platform/people"));
  upstream.searchParams.set("q", q);
  upstream.searchParams.set("limit", limit);
  if (includeDeleted != null) {
    upstream.searchParams.set("include_deleted", includeDeleted);
  }

  const res = await fetch(upstream.toString(), { cache: "no-store", headers: { ...authHeaderFromCookie() } });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  const res = await fetch(backendUrl("/platform/people"), {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaderFromCookie() },
    body,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
