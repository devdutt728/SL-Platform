import { NextRequest, NextResponse } from "next/server";
import { plannerAuthHeaders, plannerBackendUrl } from "@/lib/planner-api";

type Params = { params: Promise<{ groupId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { groupId } = await params;
  const response = await fetch(plannerBackendUrl(`/planner/groups/${encodeURIComponent(groupId)}/leader`), {
    method: "PATCH",
    headers: {
      ...(await plannerAuthHeaders()),
      "content-type": "application/json",
    },
    body: await request.text(),
    cache: "no-store",
  });
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}
