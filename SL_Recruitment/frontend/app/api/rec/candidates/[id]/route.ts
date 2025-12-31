import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const res = await fetch(backendUrl(`/rec/candidates/${params.id}`), {
    headers: { ...authHeaderFromCookie() },
    cache: "no-store",
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const res = await fetch(backendUrl(`/rec/candidates/${params.id}`), {
    method: "DELETE",
    headers: { ...authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
