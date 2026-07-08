import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const params = await context.params;
  const url = new URL(request.url);
  const res = await fetch(backendUrl(`/basic-details/${params.token}/screening${url.search}`), { cache: "no-store" });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
