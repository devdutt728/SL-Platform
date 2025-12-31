import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";

export async function GET() {
  const res = await fetch(backendUrl("/apply"), { cache: "no-store" });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

