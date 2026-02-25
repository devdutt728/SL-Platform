import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, context: Params) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/offer-approval/${encodeURIComponent(params.token)}`), { cache: "no-store" });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
