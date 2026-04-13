import { type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { proxyJsonResponse } from "@/lib/upstream-proxy";
import { visibleRecordOrNull } from "@/lib/recruitment-visibility";
import type { OpeningDetail } from "@/lib/types";

export async function GET(_request: NextRequest, context: { params: Promise<{ opening_code: string }> }) {
  const params = await context.params;
  return proxyJsonResponse<OpeningDetail>(
    async () =>
      fetch(backendUrl(`/rec/openings/by-code/${encodeURIComponent(params.opening_code)}`), {
        cache: "no-store",
        headers: { ...await authHeaderFromCookie() },
      }),
    { route: "GET /api/rec/openings/by-code/[opening_code]", transform: (payload) => visibleRecordOrNull(payload) },
  );
}
