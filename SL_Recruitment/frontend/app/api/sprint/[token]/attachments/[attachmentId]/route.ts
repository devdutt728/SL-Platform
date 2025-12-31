import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";

export async function GET(_request: Request, context: { params: { token: string; attachmentId: string } }) {
  const { token, attachmentId } = context.params;
  const res = await fetch(backendUrl(`/sprint/${encodeURIComponent(token)}/attachments/${encodeURIComponent(attachmentId)}`));
  const headers: Record<string, string> = {
    "content-type": res.headers.get("content-type") || "application/octet-stream",
  };
  const disposition = res.headers.get("content-disposition");
  if (disposition) headers["content-disposition"] = disposition;
  return new NextResponse(res.body, { status: res.status, headers });
}
