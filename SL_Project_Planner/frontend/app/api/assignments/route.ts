import { NextRequest, NextResponse } from "next/server";
import { plannerAuthHeaders, plannerBackendUrl } from "@/lib/planner-api";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.search || "";
  const response = await fetch(plannerBackendUrl(`/planner/assignments${query}`), {
    headers: await plannerAuthHeaders(),
    cache: "no-store",
  });
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}

