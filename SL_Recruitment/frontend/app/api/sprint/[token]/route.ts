import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";

export async function GET(_request: Request, context: { params: { token: string } }) {
  const res = await fetch(backendUrl(`/sprint/${encodeURIComponent(context.params.token)}`), { cache: "no-store" });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function POST(request: Request, context: { params: { token: string } }) {
  const formData = await request.formData();
  const res = await fetch(backendUrl(`/sprint/${encodeURIComponent(context.params.token)}`), {
    method: "POST",
    body: formData,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
