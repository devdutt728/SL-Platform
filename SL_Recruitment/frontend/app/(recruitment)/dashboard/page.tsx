import { cookies } from "next/headers";
import { internalUrl } from "@/lib/internal";
import type { CandidateEvent, CandidateOffer, DashboardMetrics } from "@/lib/types";
import DashboardClient from "./DashboardClient";

async function fetchDashboard() {
  const url = internalUrl("/api/rec/dashboard?stuck_days=5");
  const cookieHeader = cookies().toString();
  const res = await fetch(url, { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
  if (!res.ok) return null;
  return (await res.json()) as DashboardMetrics;
}

async function fetchRecentEvents() {
  const url = internalUrl("/api/rec/events?limit=10");
  const cookieHeader = cookies().toString();
  const res = await fetch(url, { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
  if (!res.ok) return [] as CandidateEvent[];
  return (await res.json()) as CandidateEvent[];
}

async function fetchOffers() {
  const url = internalUrl("/api/rec/offers");
  const cookieHeader = cookies().toString();
  const res = await fetch(url, { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : undefined });
  if (!res.ok) return [] as CandidateOffer[];
  return (await res.json()) as CandidateOffer[];
}

export default async function DashboardPage() {
  const [metrics, events, offers] = await Promise.all([fetchDashboard(), fetchRecentEvents(), fetchOffers()]);
  return <DashboardClient initialMetrics={metrics} initialEvents={events} initialOffers={offers} />;
}
