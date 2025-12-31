import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";

export async function GET(_request: Request, context: { params: { token: string } }) {
  const res = await fetch(backendUrl(`/caf/${context.params.token}/screening`), { cache: "no-store" });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

