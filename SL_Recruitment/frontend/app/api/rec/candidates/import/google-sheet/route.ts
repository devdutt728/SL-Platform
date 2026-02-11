import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const ingestToken = request.headers.get("x-sheet-ingest-token") || "";
  const res = await fetch(backendUrl("/rec/candidates/import/google-sheet"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(ingestToken ? { "x-sheet-ingest-token": ingestToken } : {}),
    },
    body,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
