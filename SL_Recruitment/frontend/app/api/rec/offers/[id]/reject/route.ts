import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  const body = await request.text();
  const res = await fetch(backendUrl(`/rec/offers/${encodeURIComponent(params.id)}/reject`), {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaderFromCookie() },
    body,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
