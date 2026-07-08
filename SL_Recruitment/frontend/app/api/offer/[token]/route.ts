import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";

type Params = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, context: Params) {
  const params = await context.params;
  const url = new URL(request.url);
  const res = await fetch(backendUrl(`/offer/${encodeURIComponent(params.token)}${url.search}`), { cache: "no-store" });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
