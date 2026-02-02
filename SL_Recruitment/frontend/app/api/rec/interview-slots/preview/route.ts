import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const interviewer = url.searchParams.get("interviewer_person_id_platform") || "";
  const interviewerEmail = url.searchParams.get("interviewer_email") || "";
  const startDate = url.searchParams.get("start_date") || "";

  const upstream = new URL(backendUrl("/rec/interview-slots/preview"));
  if (interviewer) upstream.searchParams.set("interviewer_person_id_platform", interviewer);
  if (interviewerEmail) upstream.searchParams.set("interviewer_email", interviewerEmail);
  if (startDate) upstream.searchParams.set("start_date", startDate);

  const res = await fetch(upstream.toString(), { cache: "no-store", headers: { ...await authHeaderFromCookie() } });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
