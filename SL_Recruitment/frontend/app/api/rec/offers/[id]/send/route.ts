import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

type Params = { params: { id: string } };

export async function POST(_request: Request, { params }: Params) {
  const res = await fetch(backendUrl(`/rec/offers/${encodeURIComponent(params.id)}/send`), {
    method: "POST",
    headers: { ...authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
