import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { filterVisibleRecords } from "@/lib/recruitment-visibility";
import type { OpeningPublicListItem } from "@/lib/types";

export async function GET() {
  const res = await fetch(backendUrl("/apply"), { cache: "no-store" });
  const contentType = res.headers.get("content-type") || "application/json";
  const data = await res.text();
  if (!res.ok || !contentType.toLowerCase().includes("application/json")) {
    return new NextResponse(data, {
      status: res.status,
      headers: { "content-type": contentType },
    });
  }
  const parsed = data ? (JSON.parse(data) as OpeningPublicListItem[]) : [];
  return NextResponse.json(filterVisibleRecords(parsed), { status: res.status });
}

