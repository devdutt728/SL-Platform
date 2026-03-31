import { type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { proxyTextResponse } from "@/lib/upstream-proxy";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const upstream = new URL(backendUrl("/rec/dashboard"));
  url.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  return proxyTextResponse(
    async () => fetch(upstream.toString(), { cache: "no-store", headers: { ...await authHeaderFromCookie() } }),
    { route: "GET /api/rec/dashboard" },
  );
}

