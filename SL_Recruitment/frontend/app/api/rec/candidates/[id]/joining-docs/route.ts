import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Params) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/rec/candidates/${encodeURIComponent(params.id)}/joining-docs`), {
    cache: "no-store",
    headers: { ...await authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function POST(request: NextRequest, context: Params) {
  const params = await context.params;
  const form = await request.formData();
  const res = await fetch(backendUrl(`/rec/candidates/${encodeURIComponent(params.id)}/joining-docs`), {
    method: "POST",
    headers: { ...await authHeaderFromCookie() },
    body: form,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
