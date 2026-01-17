import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const res = await fetch(backendUrl(`/rec/interviews/${encodeURIComponent(params.id)}/cancel`), {
    method: "POST",
    headers: { ...authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "text/html" },
  });
}
