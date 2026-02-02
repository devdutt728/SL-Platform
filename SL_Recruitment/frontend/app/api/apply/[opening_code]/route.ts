import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";

export async function GET(_request: NextRequest, context: { params: Promise<{ opening_code: string }> }) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/apply/${params.opening_code}`), { cache: "no-store" });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ opening_code: string }> }) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/apply/${params.opening_code}`), {
    method: "POST",
    // forward as-is to support multipart
    body: request.body,
    headers: Object.fromEntries(request.headers),
    duplex: "half",
  } as any);
  const data = await res.text();
  if (!res.ok) {
    console.error("Recruitment apply failed", {
      status: res.status,
      body: data,
    });
  }
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
