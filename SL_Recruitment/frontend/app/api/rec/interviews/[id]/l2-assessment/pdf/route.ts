import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(_request: Request, context: { params: { id: string } }) {
  const res = await fetch(backendUrl(`/rec/interviews/${encodeURIComponent(context.params.id)}/l2-assessment/pdf`), {
    cache: "no-store",
    headers: { ...authHeaderFromCookie() },
  });
  return new Response(await res.arrayBuffer(), {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/pdf",
      "content-disposition": res.headers.get("content-disposition") || "attachment; filename=\"l2-assessment.pdf\"",
    },
  });
}
