import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { backendUrl } from "@/lib/backend";

function shouldHaveBody(method: string) {
  return !["GET", "HEAD"].includes(method.toUpperCase());
}

export async function proxyToBackend(request: Request, upstreamPath: string) {
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(backendUrl(upstreamPath));
  targetUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cookie");
  headers.delete("content-length");

  const token = (await cookies()).get("slp_token")?.value;
  if (token && !headers.get("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  const sessionId = (await cookies()).get("slp_sid")?.value;
  if (sessionId && !headers.get("x-slp-session")) {
    headers.set("x-slp-session", sessionId);
  }

  const body = shouldHaveBody(request.method) ? await request.arrayBuffer() : undefined;

  const upstream = await fetch(targetUrl.toString(), {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstream.headers);
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
