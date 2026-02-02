import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; kind: string }> }) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/rec/candidates/${params.id}/documents/${params.kind}`), {
    headers: { ...await authHeaderFromCookie() },
    cache: "no-store",
  });

  const headers = new Headers();
  const contentType = res.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const contentDisposition = res.headers.get("content-disposition");
  if (contentDisposition) headers.set("content-disposition", contentDisposition);

  return new NextResponse(res.body, {
    status: res.status,
    headers,
  });
}

