import { NextRequest, NextResponse } from "next/server";
import { plannerAuthHeaders, plannerBackendUrl } from "@/lib/planner-api";

type Context = { params: Promise<{ projectCode: string }> };

export async function POST(_request: NextRequest, context: Context) {
  const { projectCode } = await context.params;
  const response = await fetch(plannerBackendUrl(`/planner/projects/${projectCode}/recalculate`), {
    method: "POST",
    headers: await plannerAuthHeaders(),
  });
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}
