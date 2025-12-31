import { cookies } from "next/headers";
import { internalUrl } from "@/lib/internal";
import { Interview } from "@/lib/types";
import { InterviewerClient } from "./InterviewerClient";

async function fetchInterviews(params: Record<string, string>) {
  const url = new URL(internalUrl("/api/rec/interviews"));
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const cookieHeader = cookies().toString();
  const res = await fetch(url.toString(), { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
  if (!res.ok) return [] as Interview[];
  try {
    return (await res.json()) as Interview[];
  } catch {
    return [] as Interview[];
  }
}

export default async function InterviewerPage() {
  const [upcoming, pending] = await Promise.all([
    fetchInterviews({ interviewer: "me", upcoming: "true" }),
    fetchInterviews({ interviewer: "me", pending_feedback: "true" }),
  ]);

  return <InterviewerClient initialUpcoming={upcoming} initialPending={pending} />;
}
