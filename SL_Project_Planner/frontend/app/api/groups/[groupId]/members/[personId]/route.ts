import { NextRequest, NextResponse } from "next/server";
import { plannerAuthHeaders, plannerBackendUrl } from "@/lib/planner-api";

type Params = { params: Promise<{ groupId: string; personId: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  const { groupId, personId } = await params;
  const query = request.nextUrl.search || "";
  const response = await fetch(
    plannerBackendUrl(`/planner/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(personId)}${query}`),
    {
      method: "DELETE",
      headers: await plannerAuthHeaders(),
      cache: "no-store",
    },
  );
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}
