import { NextRequest, NextResponse } from "next/server";
import { plannerAuthHeaders, plannerBackendUrl } from "@/lib/planner-api";

type Context = { params: Promise<{ plannerRowId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const { plannerRowId } = await context.params;
  const body = await request.text();
  const response = await fetch(plannerBackendUrl(`/planner/${plannerRowId}`), {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(await plannerAuthHeaders()),
    },
    body,
  });
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}

export async function DELETE(request: NextRequest, context: Context) {
  const { plannerRowId } = await context.params;
  const query = request.nextUrl.search || "";
  const response = await fetch(plannerBackendUrl(`/planner/${plannerRowId}${query}`), {
    method: "DELETE",
    headers: await plannerAuthHeaders(),
  });
  return new NextResponse(null, { status: response.status });
}
