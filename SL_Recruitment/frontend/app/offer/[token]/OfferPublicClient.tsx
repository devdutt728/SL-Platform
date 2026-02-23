"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OfferPublic } from "@/lib/types";
import { parseDateUtc } from "@/lib/datetime";

type Props = {
  token: string;
};

function formatMoney(value?: number | null) {
  if (value == null) return "-";
  try {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
  } catch {
    return String(value);
  }
}

function formatDate(raw?: string | null) {
  if (!raw) return "-";
  const d = parseDateUtc(raw);
  if (!d) return "-";
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { month: "short", day: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function OfferPublicClient({ token }: Props) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const [offer, setOffer] = useState<OfferPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<"accepted" | "declined" | null>(null);
  const canRespond = offer?.offer_status === "sent" || offer?.offer_status === "viewed";

  const loadOffer = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/offer/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as OfferPublic;
      setOffer(data);
    } catch (err: any) {
      setError(err?.message || "Offer could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const submitDecision = async (value: "accept" | "decline") => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/offer/${encodeURIComponent(token)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: value }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as OfferPublic;
      setOffer(data);
      setDecision(value === "accept" ? "accepted" : "declined");
    } catch (err: any) {
      setError(err?.message || "Decision could not be recorded.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void loadOffer();
  }, []);

  useEffect(() => {
    if (!offer?.offer_status) return;
    if (offer.offer_status === "accepted") setDecision("accepted");
    if (offer.offer_status === "declined") setDecision("declined");
  }, [offer?.offer_status]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-10">
      <div className="section-card space-y-2">
        <p className="text-xs uppercase tracking-tight text-slate-600">Offer letter</p>
        <h1 className="text-3xl font-semibold">Congratulations{offer?.candidate_name ? `, ${offer.candidate_name}` : ""}</h1>
        <p className="text-sm text-slate-600">{offer?.designation_title || offer?.opening_title || "Offer details"}</p>
      </div>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {loading ? (
        <div className="section-card text-sm text-slate-600">Loading offer...</div>
      ) : offer ? (
        <div className="section-card space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">
              <p className="text-xs uppercase tracking-tight text-slate-500">Gross CTC</p>
              <p className="mt-1 text-sm font-semibold">{formatMoney(offer.gross_ctc_annual)} {offer.currency || ""}</p>
            </div>
            <div className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">
              <p className="text-xs uppercase tracking-tight text-slate-500">Joining date</p>
              <p className="mt-1 text-sm font-semibold">{formatDate(offer.joining_date)}</p>
            </div>
            <div className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">
              <p className="text-xs uppercase tracking-tight text-slate-500">Probation</p>
              <p className="mt-1 text-sm font-semibold">{offer.probation_months != null ? `${offer.probation_months} months` : "-"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-slate-600">
            <span>Fixed: {formatMoney(offer.fixed_ctc_annual)}</span>
            <span>Variable: {formatMoney(offer.variable_ctc_annual)}</span>
          </div>
          {offer.pdf_download_url ? (
            <a
              href={offer.pdf_download_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-slate-800 underline decoration-dotted underline-offset-2"
              download
            >
              Download offer PDF
            </a>
          ) : null}
          {decision ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
              {decision === "accepted" ? "Thanks! Your acceptance has been recorded." : "We have recorded your decision."}
            </div>
          ) : canRespond ? (
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg disabled:opacity-60"
                onClick={() => void submitDecision("accept")}
                disabled={submitting}
              >
                Accept offer
              </button>
              <button
                className="flex-1 rounded-xl border border-white/60 bg-white/40 px-4 py-2 text-sm font-semibold text-slate-800 backdrop-blur disabled:opacity-60"
                onClick={() => void submitDecision("decline")}
                disabled={submitting}
              >
                Decline offer
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700">
              Offer response will be available after the offer is sent to the candidate.
            </div>
          )}
          {offer.offer_status === "accepted" ? (
            <Link
              href={`/joining/${encodeURIComponent(token)}`}
              className="inline-flex items-center justify-center rounded-xl border border-white/60 bg-white/60 px-4 py-2 text-sm font-semibold text-slate-800 backdrop-blur"
            >
              Upload joining documents
            </Link>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
