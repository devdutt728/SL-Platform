import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Params) {
  const params = await context.params;
  const url = new URL(backendUrl(`/rec/candidates/${encodeURIComponent(params.id)}/convert-preview`));
  const employmentType = request.nextUrl.searchParams.get("employment_type");
  const email = request.nextUrl.searchParams.get("email");
  if (employmentType) {
    url.searchParams.set("employment_type", employmentType);
  }
  if (email) {
    url.searchParams.set("email", email);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { ...await authHeaderFromCookie() },
    cache: "no-store",
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
