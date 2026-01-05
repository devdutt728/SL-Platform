import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

type Params = { params: { id: string } };

export const runtime = "nodejs";
export const maxDuration = 180;

const FETCH_TIMEOUT_MS = 120_000;

export async function GET(_request: Request, { params }: Params) {
  const res = await fetch(backendUrl(`/rec/offers/${encodeURIComponent(params.id)}/document`), {
    headers: { ...authHeaderFromCookie() },
  });
  const headers: Record<string, string> = {
    "content-type": res.headers.get("content-type") || "application/octet-stream",
  };
  const disposition = res.headers.get("content-disposition");
  if (disposition) headers["content-disposition"] = disposition;
  return new NextResponse(res.body, { status: res.status, headers });
}

export async function POST(request: Request, { params }: Params) {
  const body = await request.text();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const target = backendUrl(`/rec/offers/${encodeURIComponent(params.id)}/document`);
    const res = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaderFromCookie() },
      body,
      signal: controller.signal,
    });
    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
    });
  } catch (error: any) {
    const code = error?.cause?.code || error?.code || error?.name;
    const detail = error?.message || "fetch failed";
    console.error("Offer document proxy failed", error);
    return NextResponse.json(
      { detail: `Offer document service unavailable: ${detail}${code ? ` (${code})` : ""}` },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const res = await fetch(backendUrl(`/rec/offers/${encodeURIComponent(params.id)}/document`), {
    method: "DELETE",
    headers: { ...authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
