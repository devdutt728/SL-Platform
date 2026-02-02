import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const candidateId = url.searchParams.get("candidate_id") || "";
  const roundType = url.searchParams.get("round_type") || "";
  const scheduledStartAt = url.searchParams.get("scheduled_start_at") || "";
  const meetingLink = url.searchParams.get("meeting_link") || "";

  const upstream = new URL(backendUrl("/rec/interviews/email-preview"));
  if (candidateId) upstream.searchParams.set("candidate_id", candidateId);
  if (roundType) upstream.searchParams.set("round_type", roundType);
  if (scheduledStartAt) upstream.searchParams.set("scheduled_start_at", scheduledStartAt);
  if (meetingLink) upstream.searchParams.set("meeting_link", meetingLink);

  const res = await fetch(upstream.toString(), { cache: "no-store", headers: { ...await authHeaderFromCookie() } });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "text/html" },
  });
}
