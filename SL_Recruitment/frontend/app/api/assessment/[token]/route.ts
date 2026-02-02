import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/assessment/${params.token}`), { cache: "no-store" });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const params = await context.params;
  const body = await request.text();
  const res = await fetch(backendUrl(`/assessment/${params.token}`), {
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
