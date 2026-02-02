import { proxyToBackend } from "@/lib/proxy";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return proxyToBackend(request, "/auth/me");
}
