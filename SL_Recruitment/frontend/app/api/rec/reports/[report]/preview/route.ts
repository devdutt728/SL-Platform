import { type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { filterVisibleRecords } from "@/lib/recruitment-visibility";
import { proxyJsonResponse } from "@/lib/upstream-proxy";
import type { ReportPreview } from "@/lib/types";

export async function GET(request: NextRequest, context: { params: Promise<{ report: string }> }) {
  const params = await context.params;
  const url = new URL(request.url);
  const upstream = new URL(backendUrl(`/rec/reports/${encodeURIComponent(params.report)}/preview`));
  url.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  return proxyJsonResponse<ReportPreview>(
    async () => fetch(upstream.toString(), { cache: "no-store", headers: { ...await authHeaderFromCookie() } }),
    {
      route: "GET /api/rec/reports/[report]/preview",
      transform: (payload) => {
        const rows = filterVisibleRecords(payload?.rows || []);
        return { ...(payload || { report_id: params.report, columns: [], rows: [], total: 0, limit: 0, offset: 0 }), rows, total: rows.length };
      },
    },
  );
}
