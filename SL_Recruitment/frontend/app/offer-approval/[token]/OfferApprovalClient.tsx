"use client";

import { useCallback, useEffect, useState } from "react";
import type { OfferApprovalPublic } from "@/lib/types";
import { parseDateUtc } from "@/lib/datetime";

type Props = {
  token: string;
};

function formatDate(raw?: string | null) {
  if (!raw) return "-";
  const d = parseDateUtc(raw);
  if (!d) return raw;
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { month: "short", day: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
}

function formatMoney(value?: number | null) {
  if (value == null) return "-";
  try {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
  } catch {
    return String(value);
  }
}

export function OfferApprovalClient({ token }: Props) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const [offer, setOffer] = useState<OfferApprovalPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [reason, setReason] = useState("");

  const canDecide = offer?.offer_status === "pending_approval" && !decision;

  const loadApproval = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/offer-approval/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as OfferApprovalPublic;
      setOffer(data);
      if (data.approval_decision === "approved") setDecision("approved");
      if (data.approval_decision === "rejected") setDecision("rejected");
    } catch (err: any) {
      setError(err?.message || "Approval request could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [basePath, token]);

  async function submitDecision(nextDecision: "approve" | "reject") {
    if (busy) return;
    if (nextDecision === "reject" && !reason.trim()) {
      setError("Reason is required to reject.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/offer-approval/${encodeURIComponent(token)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: nextDecision, reason: reason.trim() || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as OfferApprovalPublic;
      setOffer(data);
      setDecision(nextDecision === "approve" ? "approved" : "rejected");
    } catch (err: any) {
      setError(err?.message || "Could not save decision.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadApproval();
  }, [loadApproval]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-10">
      <div className="section-card space-y-2">
        <p className="text-xs uppercase tracking-tight text-slate-600">Principal offer approval</p>
        <h1 className="text-2xl font-semibold">Offer approval request</h1>
      </div>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {loading ? (
        <div className="section-card text-sm text-slate-600">Loading approval request...</div>
      ) : offer ? (
        <div className="section-card space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">
              <p className="text-xs uppercase tracking-tight text-slate-500">Candidate</p>
              <p className="mt-1 text-sm font-semibold">{offer.candidate_name || "-"}</p>
            </div>
            <div className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">
              <p className="text-xs uppercase tracking-tight text-slate-500">Role</p>
              <p className="mt-1 text-sm font-semibold">{offer.designation_title || offer.opening_title || "-"}</p>
            </div>
            <div className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">
              <p className="text-xs uppercase tracking-tight text-slate-500">CTC</p>
              <p className="mt-1 text-sm font-semibold">{formatMoney(offer.gross_ctc_annual)} {offer.currency || ""}</p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">
              <p className="text-xs uppercase tracking-tight text-slate-500">Joining date</p>
              <p className="mt-1 text-sm font-semibold">{formatDate(offer.joining_date)}</p>
            </div>
            <div className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">
              <p className="text-xs uppercase tracking-tight text-slate-500">Link expires</p>
              <p className="mt-1 text-sm font-semibold">{formatDate(offer.approval_request_expires_at)}</p>
            </div>
          </div>
          {offer.pdf_download_url ? (
            <a
              href={offer.pdf_download_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-slate-800 underline decoration-dotted underline-offset-2"
            >
              Download offer PDF
            </a>
          ) : null}

          {decision ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
              {decision === "approved" ? "Offer approved successfully." : "Offer rejected and returned to draft."}
            </div>
          ) : canDecide ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Rejection reason (required only for reject)
                <textarea
                  className="mt-1 h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Optional for approve, required for reject"
                />
              </label>
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={() => void submitDecision("approve")}
                  disabled={busy}
                >
                  Approve offer
                </button>
                <button
                  className="flex-1 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
                  onClick={() => void submitDecision("reject")}
                  disabled={busy}
                >
                  Reject offer
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700">
              This request is no longer pending.
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}
