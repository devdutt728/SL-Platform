import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(_request: NextRequest, context: { params: Promise<{ opening_code: string }> }) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/rec/openings/by-code/${encodeURIComponent(params.opening_code)}`), {
    cache: "no-store",
    headers: { ...await authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
