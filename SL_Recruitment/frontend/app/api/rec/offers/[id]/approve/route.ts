import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: Params) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/rec/offers/${encodeURIComponent(params.id)}/approve`), {
    method: "POST",
    headers: { ...await authHeaderFromCookie() },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
