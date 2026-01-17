"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CandidateOffer } from "@/lib/types";
import { parseDateUtc } from "@/lib/datetime";

const statusTone: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-600",
  pending_approval: "bg-amber-500/20 text-amber-600",
  approved: "bg-emerald-500/20 text-emerald-600",
  sent: "bg-emerald-500/20 text-emerald-600",
  viewed: "bg-cyan-500/20 text-cyan-600",
  accepted: "bg-emerald-500/20 text-emerald-600",
  declined: "bg-rose-500/20 text-rose-600",
  withdrawn: "bg-slate-500/10 text-slate-600",
};

const statusOptions = [
  "all",
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "withdrawn",
];

function formatDate(raw?: string | null) {
  if (!raw) return "-";
  const d = parseDateUtc(raw);
  if (!d) return "-";
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { month: "short", day: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function OffersClient() {
  const [offers, setOffers] = useState<CandidateOffer[]>([]);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [initialized, setInitialized] = useState(false);

  const loadOffers = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/rec/offers", window.location.origin);
      if (status !== "all") url.searchParams.append("status", status);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as CandidateOffer[];
      setOffers(data);
    } catch (err: any) {
      setError(err?.message || "Could not load offers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOffers();
  }, [status]);

  useEffect(() => {
    if (initialized) return;
    const rawStatus = (searchParams.get("status") || "").trim().toLowerCase();
    if (rawStatus && statusOptions.includes(rawStatus)) {
      setStatus(rawStatus);
    }
    setInitialized(true);
  }, [initialized, searchParams]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let pending = false;
    const source = new EventSource("/api/rec/events/stream");

    async function refresh() {
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      try {
        await loadOffers();
      } finally {
        inFlight = false;
        if (pending && !cancelled) {
          pending = false;
          void refresh();
        }
      }
    }

    source.onmessage = () => {
      void refresh();
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, [status]);

  return (
    <main className="content-pad space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-tight text-slate-600">Sign-offs</p>
          <h1 className="text-2xl font-semibold">Offers</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {statusOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="glass-panel overflow-hidden rounded-2xl">
        <div className="grid grid-cols-5 gap-2 border-b border-white/50 bg-white/20 px-3 py-2 text-xs uppercase tracking-wide text-slate-600">
          <span>Candidate</span>
          <span>Role</span>
          <span>Status</span>
          <span>Offer</span>
          <span>Updated</span>
        </div>
        <div className="divide-y divide-white/40">
          {loading ? (
            <div className="px-3 py-3 text-sm text-slate-600">Loading offers...</div>
          ) : offers.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-600">No offers yet.</div>
          ) : (
            offers.map((offer) => (
              <Link
                key={offer.candidate_offer_id}
                href={`/candidates/${offer.candidate_id}`}
                className="grid grid-cols-5 gap-2 px-3 py-3 hover:bg-white/40"
              >
                <div className="font-medium">{offer.candidate_name || offer.candidate_code || "Candidate"}</div>
                <div className="text-sm text-slate-600">{offer.designation_title || offer.opening_title || "-"}</div>
                <div>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone[offer.offer_status] || "bg-slate-500/10 text-slate-600"}`}>
                    {offer.offer_status.replace("_", " ")}
                  </span>
                </div>
                <div className="text-sm">
                  {offer.gross_ctc_annual != null ? offer.gross_ctc_annual : "-"} {offer.currency || ""}
                  {offer.joining_date ? ` - ${formatDate(offer.joining_date)}` : ""}
                </div>
                <div className="text-sm text-slate-600">{formatDate(offer.updated_at)}</div>
              </Link>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
