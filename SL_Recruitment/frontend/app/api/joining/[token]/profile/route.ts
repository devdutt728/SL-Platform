import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";

type Params = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: Params) {
  const params = await context.params;
  const search = request.nextUrl.search || "";
  const body = await request.text();
  const res = await fetch(backendUrl(`/joining/${encodeURIComponent(params.token)}/profile${search}`), {
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
