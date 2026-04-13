import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { filterVisibleRecords } from "@/lib/recruitment-visibility";
import { proxyJsonResponse } from "@/lib/upstream-proxy";
import type { OpeningRequest } from "@/lib/types";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const upstream = new URL(backendUrl("/rec/openings/requests"));
  url.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  return proxyJsonResponse<OpeningRequest[]>(
    async () => fetch(upstream.toString(), { cache: "no-store", headers: { ...await authHeaderFromCookie() } }),
    { route: "GET /api/rec/openings/requests", transform: (payload) => filterVisibleRecords(payload || []) },
  );
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const res = await fetch(backendUrl("/rec/openings/requests"), {
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
