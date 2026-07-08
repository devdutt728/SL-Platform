import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";

export async function GET(request: NextRequest, context: { params: Promise<{ token: string; attachmentId: string }> }) {
  const params = await context.params;
  const url = new URL(request.url);
  const res = await fetch(
    backendUrl(`/sprint/${encodeURIComponent(params.token)}/attachments/${encodeURIComponent(params.attachmentId)}${url.search}`)
  );
  const data = await res.arrayBuffer();
  const headers = new Headers();
  const contentType = res.headers.get("content-type");
  const contentDisposition = res.headers.get("content-disposition");
  if (contentType) headers.set("content-type", contentType);
  if (contentDisposition) headers.set("content-disposition", contentDisposition);
  return new NextResponse(data, {
    status: res.status,
    headers,
  });
}
