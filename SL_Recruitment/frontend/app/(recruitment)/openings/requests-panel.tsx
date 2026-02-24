"use client";

import { useEffect, useMemo, useState } from "react";
import { OpeningListItem, OpeningRequest } from "@/lib/types";

type Props = {
  openings: OpeningListItem[];
  canRaise: boolean;
  canApprove: boolean;
  isHr: boolean;
  isGl: boolean;
  onError: (message: string | null) => void;
  onOpeningsChanged: () => Promise<void> | void;
};

function statusPill(status: string) {
  const token = String(status || "").toLowerCase();
  if (token === "applied") return "bg-emerald-50 text-emerald-700";
  if (token === "pending_hr_approval") return "bg-amber-50 text-amber-700";
  if (token === "rejected") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-600";
}

function parseDetail(raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "detail" in parsed && typeof (parsed as any).detail === "string") {
      return (parsed as any).detail;
    }
  } catch {
    // ignore
  }
  return null;
}

export function OpeningRequestsPanel({ openings, canRaise, canApprove, isHr, isGl, onError, onOpeningsChanged }: Props) {
  const [requests, setRequests] = useState<OpeningRequest[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const [openingCode, setOpeningCode] = useState("");
  const [title, setTitle] = useState("");
  const [headcountDelta, setHeadcountDelta] = useState(1);
  const [hmPersonId, setHmPersonId] = useState("");
  const [hmEmail, setHmEmail] = useState("");
  const [glDetails, setGlDetails] = useState("");
  const [l2Details, setL2Details] = useState("");
  const [reason, setReason] = useState("");

  const canSee = canRaise || canApprove;
  const sortedOpenings = useMemo(
    () => openings.filter((o) => !!o.opening_code).sort((a, b) => String(a.opening_code).localeCompare(String(b.opening_code))),
    [openings]
  );

  async function refreshRequests() {
    if (!canSee) return;
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await fetch(`/api/rec/openings/requests${query}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as OpeningRequest[];
      setRequests(data);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void refreshRequests();
  }, [canSee, statusFilter]);

  if (!canSee) return null;

  async function submitRequest() {
    if (!canRaise) return;
    if (!openingCode && !title.trim()) {
      onError("Select an existing opening code or enter title for new opening.");
      return;
    }
    setSubmitting(true);
    onError(null);
    const res = await fetch("/api/rec/openings/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        opening_code: openingCode || null,
        title: openingCode ? null : title.trim() || null,
        headcount_delta: Math.max(0, Number(headcountDelta) || 0),
        hiring_manager_person_id_platform: hmPersonId.trim() || null,
        hiring_manager_email: hmEmail.trim() || null,
        gl_details: glDetails.trim() || null,
        l2_details: l2Details.trim() || null,
        request_reason: reason.trim() || null,
        source_portal: isHr ? "hr_portal" : isGl ? "gl_portal" : "recruitment_portal",
      }),
    });
    if (!res.ok) {
      const raw = (await res.text()).trim();
      onError(parseDetail(raw) || raw || `Request failed (${res.status})`);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setOpeningCode("");
    setTitle("");
    setHeadcountDelta(1);
    setHmPersonId("");
    setHmEmail("");
    setGlDetails("");
    setL2Details("");
    setReason("");
    await Promise.all([refreshRequests(), onOpeningsChanged()]);
  }

  async function approve(req: OpeningRequest) {
    setBusyId(req.opening_request_id);
    onError(null);
    const res = await fetch(`/api/rec/openings/requests/${req.opening_request_id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hiring_manager_person_id_platform: req.hiring_manager_person_id_platform || null,
        approval_note: "Approved from Opening section",
      }),
    });
    if (!res.ok) {
      const raw = (await res.text()).trim();
      onError(parseDetail(raw) || raw || `Request failed (${res.status})`);
      setBusyId(null);
      return;
    }
    setBusyId(null);
    await Promise.all([refreshRequests(), onOpeningsChanged()]);
  }

  async function reject(req: OpeningRequest) {
    const reasonInput = window.prompt("Rejection reason:", "Insufficient details");
    if (!reasonInput || !reasonInput.trim()) return;
    setBusyId(req.opening_request_id);
    onError(null);
    const res = await fetch(`/api/rec/openings/requests/${req.opening_request_id}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rejection_reason: reasonInput.trim() }),
    });
    if (!res.ok) {
      const raw = (await res.text()).trim();
      onError(parseDetail(raw) || raw || `Request failed (${res.status})`);
      setBusyId(null);
      return;
    }
    setBusyId(null);
    await refreshRequests();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-tight text-slate-500">Opening Requests</p>
          <p className="text-sm text-slate-500">HR/GL can raise requests with HM, GL, L2 details. HR approval applies headcount increase.</p>
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
          <option value="">All</option>
          <option value="pending_hr_approval">Pending</option>
          <option value="applied">Applied</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {canRaise ? (
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <select value={openingCode} onChange={(e) => setOpeningCode(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2">
            <option value="">New opening - enter title</option>
            {sortedOpenings.map((o) => <option key={o.opening_id} value={o.opening_code || ""}>{o.opening_code} - {o.title || "Untitled"}</option>)}
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Opening title (for new code)" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm md:col-span-2" />
          <input type="number" min={0} value={headcountDelta} onChange={(e) => setHeadcountDelta(Number(e.target.value) || 0)} placeholder="Headcount delta" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm" />
          <input value={hmPersonId} onChange={(e) => setHmPersonId(e.target.value)} placeholder="Hiring manager person id" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm" />
          <input type="email" value={hmEmail} onChange={(e) => setHmEmail(e.target.value)} placeholder="Hiring manager email" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm" />
          <input value={glDetails} onChange={(e) => setGlDetails(e.target.value)} placeholder="GL details" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm" />
          <input value={l2Details} onChange={(e) => setL2Details(e.target.value)} placeholder="L2 details" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm md:col-span-2" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason / notes" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm md:col-span-2" />
          <div className="md:col-span-4">
            <button type="button" disabled={submitting} onClick={() => void submitRequest()} className="rounded-full bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
              {submitting ? "Submitting..." : "Raise request"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white/60">
        <table className="min-w-[980px] w-full table-fixed border-collapse">
          <thead className="bg-white/30"><tr className="text-xs uppercase tracking-wide text-slate-500"><th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Req</th><th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Opening</th><th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Delta</th><th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">HM</th><th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">GL / L2</th><th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Status</th><th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Actions</th></tr></thead>
          <tbody>
            {requests.map((req) => (
              <tr key={req.opening_request_id} className="text-sm text-slate-800">
                <td className="border-b border-slate-200 px-2 py-2 font-semibold">{req.opening_request_id}</td>
                <td className="border-b border-slate-200 px-2 py-2"><div className="truncate">{req.opening_code || "-"}</div><div className="truncate text-xs text-slate-500">{req.opening_title || "-"}</div></td>
                <td className="border-b border-slate-200 px-2 py-2 font-semibold">{req.headcount_delta}</td>
                <td className="border-b border-slate-200 px-2 py-2"><div className="text-xs">{req.hiring_manager_person_id_platform || "-"}</div><div className="text-xs text-slate-500">{req.hiring_manager_email || "-"}</div></td>
                <td className="border-b border-slate-200 px-2 py-2"><div className="text-xs">{req.gl_details || "-"}</div><div className="text-xs text-slate-500">{req.l2_details || "-"}</div></td>
                <td className="border-b border-slate-200 px-2 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusPill(req.status)}`}>{req.status}</span></td>
                <td className="border-b border-slate-200 px-2 py-2">
                  {canApprove && req.status === "pending_hr_approval" ? <div className="flex items-center gap-1"><button type="button" disabled={busyId === req.opening_request_id} onClick={() => void approve(req)} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Approve</button><button type="button" disabled={busyId === req.opening_request_id} onClick={() => void reject(req)} className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Reject</button></div> : <span className="text-xs text-slate-400">-</span>}
                </td>
              </tr>
            ))}
            {requests.length === 0 ? <tr><td className="px-3 py-8 text-center text-sm text-slate-500" colSpan={7}>No opening requests found.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
