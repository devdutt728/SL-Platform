import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const res = await fetch(backendUrl(`/rec/sprint-templates/${encodeURIComponent(context.params.id)}`), {
    method: "PATCH",
    headers: { "content-type": "application/json", ...authHeaderFromCookie() },
    body: await request.text(),
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
