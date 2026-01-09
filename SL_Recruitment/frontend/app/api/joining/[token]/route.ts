import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";

type Params = { params: { token: string } };

export async function GET(_request: Request, { params }: Params) {
  const res = await fetch(backendUrl(`/joining/${encodeURIComponent(params.token)}`), { cache: "no-store" });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
