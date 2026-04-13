import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { visibleRecordOrNull } from "@/lib/recruitment-visibility";
import type { OpeningApplyPrefill } from "@/lib/types";

export async function GET(_request: NextRequest, context: { params: Promise<{ opening_code: string }> }) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/apply/${params.opening_code}`), { cache: "no-store" });
  const contentType = res.headers.get("content-type") || "application/json";
  const data = await res.text();
  if (!res.ok || !contentType.toLowerCase().includes("application/json")) {
    return new NextResponse(data, {
      status: res.status,
      headers: { "content-type": contentType },
    });
  }
  const parsed = data ? (JSON.parse(data) as OpeningApplyPrefill) : null;
  const visible = visibleRecordOrNull(parsed);
  if (!visible) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }
  return NextResponse.json(visible, { status: res.status });
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
