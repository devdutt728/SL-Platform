import { type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort());

  const upstream = await fetch(backendUrl("/rec/events/stream"), {
    cache: "no-store",
    headers: {
      accept: "text/event-stream",
      ...await authHeaderFromCookie(),
    },
    signal: controller.signal,
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    return new Response(text || "Unable to open events stream", {
      status: upstream.status || 502,
      headers: { "content-type": upstream.headers.get("content-type") || "text/plain" },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
