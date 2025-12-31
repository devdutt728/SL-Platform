import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const upstream = new URL(backendUrl("/rec/candidates"));
  // Preserve multi-value filters like `status` and `stage`.
  url.searchParams.forEach((value, key) => upstream.searchParams.append(key, value));

  const res = await fetch(upstream.toString(), { cache: "no-store", headers: { ...authHeaderFromCookie() } });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  const res = await fetch(backendUrl("/rec/candidates"), {
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
