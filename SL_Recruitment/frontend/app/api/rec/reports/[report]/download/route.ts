import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(request: Request, context: { params: { report: string } }) {
  const url = new URL(request.url);
  const upstream = new URL(backendUrl(`/rec/reports/${encodeURIComponent(context.params.report)}/download`));
  url.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  const res = await fetch(upstream.toString(), { cache: "no-store", headers: { ...authHeaderFromCookie() } });
  const data = await res.arrayBuffer();
  return new NextResponse(data, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "text/csv",
      "content-disposition": res.headers.get("content-disposition") || "attachment",
    },
  });
}
