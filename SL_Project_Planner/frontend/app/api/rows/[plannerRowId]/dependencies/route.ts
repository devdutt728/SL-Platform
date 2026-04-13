import { NextRequest, NextResponse } from "next/server";
import { plannerAuthHeaders, plannerBackendUrl } from "@/lib/planner-api";

type Context = { params: Promise<{ plannerRowId: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const { plannerRowId } = await context.params;
  const response = await fetch(plannerBackendUrl(`/planner/${plannerRowId}/dependencies`), {
    headers: await plannerAuthHeaders(),
    cache: "no-store",
  });
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}

export async function POST(request: NextRequest, context: Context) {
  const { plannerRowId } = await context.params;
  const body = await request.text();
  const response = await fetch(plannerBackendUrl(`/planner/${plannerRowId}/dependencies`), {
    method: "POST",
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
