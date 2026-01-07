import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const candidateId = url.searchParams.get("candidate_id") || "";
  const roundType = url.searchParams.get("round_type") || "";
  const interviewerEmail = url.searchParams.get("interviewer_email") || "";
  const startDate = url.searchParams.get("start_date") || "";

  const upstream = new URL(backendUrl("/rec/interview-slots/email-preview"));
  if (candidateId) upstream.searchParams.set("candidate_id", candidateId);
  if (roundType) upstream.searchParams.set("round_type", roundType);
  if (interviewerEmail) upstream.searchParams.set("interviewer_email", interviewerEmail);
  if (startDate) upstream.searchParams.set("start_date", startDate);

  const res = await fetch(upstream.toString(), { cache: "no-store", headers: { ...authHeaderFromCookie() } });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "text/html" },
  });
}
