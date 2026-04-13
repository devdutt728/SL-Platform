import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const res = await fetch(backendUrl("/rec/candidates/bulk-assign/hr"), {
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
