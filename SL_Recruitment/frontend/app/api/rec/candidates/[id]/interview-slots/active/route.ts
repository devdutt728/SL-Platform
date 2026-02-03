import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const res = await fetch(
    backendUrl(`/rec/candidates/${encodeURIComponent(params.id)}/interview-slots/active`),
    {
      headers: { ...await authHeaderFromCookie() },
    }
  );
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
