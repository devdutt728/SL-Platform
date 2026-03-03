import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

type Params = { params: Promise<{ candidate_ingest_attempt_id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { candidate_ingest_attempt_id } = await params;
  const url = new URL(request.url);
  const upstream = new URL(
    backendUrl(`/rec/candidates/import/google-sheet/ops/rows/${candidate_ingest_attempt_id}/timeline`)
  );
  url.searchParams.forEach((value, key) => upstream.searchParams.append(key, value));
  const res = await fetch(upstream.toString(), {
    cache: "no-store",
    headers: { ...await authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
