import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(request: NextRequest, context: { params: Promise<{ report: string }> }) {
  const params = await context.params;
  const url = new URL(request.url);
  const upstream = new URL(backendUrl(`/rec/reports/${encodeURIComponent(params.report)}/preview`));
  url.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  const res = await fetch(upstream.toString(), { cache: "no-store", headers: { ...await authHeaderFromCookie() } });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
