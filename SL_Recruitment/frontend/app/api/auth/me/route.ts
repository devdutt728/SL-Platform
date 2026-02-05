import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const sessionHeader = request.headers.get("x-slp-session");
  const headers = authHeader
    ? {
        authorization: authHeader,
        ...(sessionHeader ? { "x-slp-session": sessionHeader } : {}),
      }
    : await authHeaderFromCookie();

  const res = await fetch(backendUrl("/auth/me"), {
    headers,
    cache: "no-store",
  });

  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
