import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";

type Params = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: Params) {
  const params = await context.params;
  const body = await request.text();
  const res = await fetch(backendUrl(`/offer-approval/${encodeURIComponent(params.token)}/decision`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
