import { NextRequest, NextResponse } from "next/server";
import { plannerAuthHeaders, plannerBackendUrl } from "@/lib/planner-api";

type Context = { params: Promise<{ projectCode: string }> };

export async function DELETE(_request: NextRequest, context: Context) {
  const { projectCode } = await context.params;
  const response = await fetch(plannerBackendUrl(`/planner/projects/${projectCode}`), {
    method: "DELETE",
    headers: await plannerAuthHeaders(),
  });
  return new NextResponse(null, { status: response.status });
}
