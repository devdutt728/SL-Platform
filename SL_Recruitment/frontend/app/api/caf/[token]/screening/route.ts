import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const params = await context.params;
  const res = await fetch(backendUrl(`/caf/${params.token}/screening`), { cache: "no-store" });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

