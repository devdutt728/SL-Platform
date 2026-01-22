import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(_request: Request, context: { params: { id: string } }) {
  const res = await fetch(backendUrl(`/rec/interviews/${encodeURIComponent(context.params.id)}/l1-assessment/pdf`), {
    headers: { ...authHeaderFromCookie() },
  });
  const data = await res.arrayBuffer();
  return new NextResponse(data, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/pdf",
      "content-disposition": res.headers.get("content-disposition") || "attachment; filename=\"l1-assessment.pdf\"",
    },
  });
}
