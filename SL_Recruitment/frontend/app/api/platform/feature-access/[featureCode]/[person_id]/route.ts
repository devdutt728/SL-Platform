import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

type Context = { params: Promise<{ featureCode: string; person_id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { featureCode, person_id } = await context.params;
  const body = await request.text();
  const res = await fetch(
    backendUrl(`/platform/feature-access/${encodeURIComponent(featureCode)}/${encodeURIComponent(person_id)}`),
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(await authHeaderFromCookie()),
      },
      body,
    }
  );
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
