import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import type { NextRequest } from "next/server";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/rec/interviews/${encodeURIComponent(params.id)}/l2-assessment/pdf`), {
    cache: "no-store",
    headers: { ...await authHeaderFromCookie() },
  });
  return new Response(await res.arrayBuffer(), {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/pdf",
      "content-disposition": res.headers.get("content-disposition") || "attachment; filename=\"l2-assessment.pdf\"",
    },
  });
}
