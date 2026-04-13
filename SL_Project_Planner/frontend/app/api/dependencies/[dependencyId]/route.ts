import { NextRequest, NextResponse } from "next/server";
import { plannerAuthHeaders, plannerBackendUrl } from "@/lib/planner-api";

type Context = { params: Promise<{ dependencyId: string }> };

export async function DELETE(_request: NextRequest, context: Context) {
  const { dependencyId } = await context.params;
  const response = await fetch(plannerBackendUrl(`/planner/dependencies/${dependencyId}`), {
    method: "DELETE",
    headers: await plannerAuthHeaders(),
  });
  return new NextResponse(null, { status: response.status });
}
