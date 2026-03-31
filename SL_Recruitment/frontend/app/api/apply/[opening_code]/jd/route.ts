import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";

type Params = { params: Promise<{ opening_code: string }> };

export async function GET(request: NextRequest, context: Params) {
  const params = await context.params;
  const url = new URL(request.url);
  const res = await fetch(backendUrl(`/apply/${encodeURIComponent(params.opening_code)}/jd${url.search}`), {
    cache: "no-store",
  });
  const data = await res.arrayBuffer();
  const headers = new Headers();
  headers.set("content-type", res.headers.get("content-type") || "application/pdf");
  const disposition = res.headers.get("content-disposition");
  if (disposition) headers.set("content-disposition", disposition);
  return new NextResponse(data, { status: res.status, headers });
}
