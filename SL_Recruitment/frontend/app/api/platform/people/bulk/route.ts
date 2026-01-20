import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const res = await fetch(backendUrl("/platform/people/bulk"), {
    method: "POST",
    headers: { ...authHeaderFromCookie() },
    body: formData,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
