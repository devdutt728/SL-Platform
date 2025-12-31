import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(_request: Request, context: { params: { id: string } }) {
  const res = await fetch(backendUrl(`/rec/sprint-templates/${encodeURIComponent(context.params.id)}/attachments`), {
    cache: "no-store",
    headers: { ...authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const formData = await request.formData();
  const res = await fetch(backendUrl(`/rec/sprint-templates/${encodeURIComponent(context.params.id)}/attachments`), {
    method: "POST",
    headers: { ...authHeaderFromCookie() },
    body: formData,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
