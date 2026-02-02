import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string; attachmentId: string }> }) {
  const params = await context.params;
  const { token, attachmentId } = params;
  const res = await fetch(backendUrl(`/sprint/${encodeURIComponent(token)}/attachments/${encodeURIComponent(attachmentId)}`));
  const headers: Record<string, string> = {
    "content-type": res.headers.get("content-type") || "application/octet-stream",
  };
  const disposition = res.headers.get("content-disposition");
  if (disposition) headers["content-disposition"] = disposition;
  return new NextResponse(res.body, { status: res.status, headers });
}
