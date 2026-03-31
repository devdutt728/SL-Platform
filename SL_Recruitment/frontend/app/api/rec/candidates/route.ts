import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { proxyTextResponse } from "@/lib/upstream-proxy";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const upstream = new URL(backendUrl("/rec/candidates"));
  // Preserve multi-value filters like `status` and `stage`.
  url.searchParams.forEach((value, key) => upstream.searchParams.append(key, value));

  return proxyTextResponse(
    async () => fetch(upstream.toString(), { cache: "no-store", headers: { ...await authHeaderFromCookie() } }),
    { route: "GET /api/rec/candidates" },
  );
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const res = await fetch(backendUrl("/rec/candidates"), {
    method: "POST",
    headers: { "content-type": "application/json", ...await authHeaderFromCookie() },
    body,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
