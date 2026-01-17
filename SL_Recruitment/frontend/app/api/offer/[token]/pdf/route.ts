import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";

type Params = { params: { token: string } };

export async function GET(request: Request, { params }: Params) {
  const url = new URL(request.url);
  const res = await fetch(backendUrl(`/offer/${encodeURIComponent(params.token)}/pdf${url.search}`), { cache: "no-store" });
  const data = await res.arrayBuffer();
  const headers = new Headers();
  const contentType = res.headers.get("content-type") || "application/pdf";
  headers.set("content-type", contentType);
  const disposition = res.headers.get("content-disposition");
  if (disposition) headers.set("content-disposition", disposition);
  return new NextResponse(data, { status: res.status, headers });
}
