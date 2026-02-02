import { cookieHeader } from "@/lib/cookie-header";
import { internalUrl } from "@/lib/internal";
import type { CandidateEvent, CandidateOffer, DashboardMetrics } from "@/lib/types";
import DashboardClient from "./DashboardClient";

async function fetchDashboard() {
  const url = await internalUrl("/api/rec/dashboard?stuck_days=5");
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return null;
  return (await res.json()) as DashboardMetrics;
}

async function fetchRecentEvents() {
  const url = await internalUrl("/api/rec/events?limit=10");
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return [] as CandidateEvent[];
  return (await res.json()) as CandidateEvent[];
}

async function fetchOffers() {
  const url = await internalUrl("/api/rec/offers");
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return [] as CandidateOffer[];
  return (await res.json()) as CandidateOffer[];
}

export default async function DashboardPage() {
  const [metrics, events, offers] = await Promise.all([fetchDashboard(), fetchRecentEvents(), fetchOffers()]);
  return <DashboardClient initialMetrics={metrics} initialEvents={events} initialOffers={offers} />;
}


