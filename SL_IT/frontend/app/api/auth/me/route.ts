import { proxyToBackend } from "@/lib/proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyToBackend(request, "/auth/me");
}
