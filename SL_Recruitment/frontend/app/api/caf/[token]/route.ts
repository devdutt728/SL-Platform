import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";

export async function GET(_request: Request, context: { params: { token: string } }) {
  const res = await fetch(backendUrl(`/caf/${context.params.token}`), { cache: "no-store" });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function POST(request: Request, context: { params: { token: string } }) {
  const body = await request.text();
  const res = await fetch(backendUrl(`/caf/${context.params.token}`), {
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

