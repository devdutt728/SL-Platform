import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const params = await context.params;
  const url = new URL(request.url);
  const res = await fetch(backendUrl(`/sprint/${encodeURIComponent(params.token)}${url.search}`), { cache: "no-store" });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const params = await context.params;
  const url = new URL(request.url);
  const formData = await request.formData();
  const res = await fetch(backendUrl(`/sprint/${encodeURIComponent(params.token)}${url.search}`), {
    method: "POST",
    body: formData,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
