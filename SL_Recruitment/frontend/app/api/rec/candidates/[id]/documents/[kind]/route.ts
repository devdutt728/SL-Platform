import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; kind: string }> }) {
  const params = await context.params;
  const url = new URL(request.url);
  const upstream = new URL(backendUrl(`/rec/candidates/${params.id}/documents/${params.kind}`));
  url.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));
  const res = await fetch(upstream.toString(), {
    headers: { ...await authHeaderFromCookie() },
    cache: "no-store",
  });

  const headers = new Headers();
  const contentType = res.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const contentDisposition = res.headers.get("content-disposition");
  if (contentDisposition) headers.set("content-disposition", contentDisposition);
  const cacheControl = res.headers.get("cache-control");
  if (cacheControl) headers.set("cache-control", cacheControl);
  const location = res.headers.get("location");
  if (location) headers.set("location", location);

  return new NextResponse(res.body, {
    status: res.status,
    headers,
  });
}

