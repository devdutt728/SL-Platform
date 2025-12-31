import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(_request: Request, context: { params: { opening_code: string } }) {
  const res = await fetch(backendUrl(`/rec/openings/by-code/${encodeURIComponent(context.params.opening_code)}`), {
    cache: "no-store",
    headers: { ...authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
