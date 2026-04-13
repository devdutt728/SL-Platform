import { type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { proxyJsonResponse } from "@/lib/upstream-proxy";
import { visibleRecordOrNull } from "@/lib/recruitment-visibility";
import type { CandidateDetail } from "@/lib/types";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  return proxyJsonResponse<CandidateDetail>(
    async () =>
      fetch(backendUrl(`/rec/candidates/${params.id}/full`), {
        headers: { ...await authHeaderFromCookie() },
        cache: "no-store",
      }),
    { route: "GET /api/rec/candidates/[id]/full", transform: (payload) => visibleRecordOrNull(payload) },
  );
}

