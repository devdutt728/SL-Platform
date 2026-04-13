import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

type Context = { params: Promise<{ featureCode: string }> };

export async function GET(_request: Request, context: Context) {
  const { featureCode } = await context.params;
  const res = await fetch(backendUrl(`/platform/feature-access/${encodeURIComponent(featureCode)}`), {
    cache: "no-store",
    headers: { ...(await authHeaderFromCookie()) },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
