import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  const incoming = new URL(request.url);
  const upstream = new URL(backendUrl("/rec/candidates/communications"));
  incoming.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  const res = await fetch(upstream.toString(), {
    cache: "no-store",
    headers: { ...(await authHeaderFromCookie()) },
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
