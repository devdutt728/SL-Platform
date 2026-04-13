import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { filterVisibleRecords } from "@/lib/recruitment-visibility";
import { proxyJsonResponse } from "@/lib/upstream-proxy";
import type { CandidateCommunicationFeed } from "@/lib/types";

export async function GET(request: NextRequest) {
  const incoming = new URL(request.url);
  const upstream = new URL(backendUrl("/rec/candidates/communications"));
  incoming.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  return proxyJsonResponse<CandidateCommunicationFeed>(
    async () =>
      fetch(upstream.toString(), {
        cache: "no-store",
        headers: { ...(await authHeaderFromCookie()) },
      }),
    {
      route: "GET /api/rec/candidates/communications",
      transform: (payload) => {
        const items = filterVisibleRecords(payload?.items || []);
        return { ...(payload || { total: 0, limit: 0, offset: 0, items: [] }), items, total: items.length };
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const incoming = new URL(request.url);
  const action = incoming.searchParams.get("action") || "";
  if (action !== "resend_expired_basic_details_links" && action !== "resend_expired_caf_links") {
    return NextResponse.json({ detail: "Unsupported communications action." }, { status: 400 });
  }

  const backendPath =
    action === "resend_expired_caf_links"
      ? "/rec/candidates/candidate-assessment-form-link/resend-expired"
      : "/rec/candidates/basic-details-link/resend-expired";

  const res = await fetch(backendUrl(backendPath), {
    method: "POST",
    headers: { ...(await authHeaderFromCookie()) },
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
