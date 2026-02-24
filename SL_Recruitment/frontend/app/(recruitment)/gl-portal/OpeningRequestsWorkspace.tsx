"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { BriefcaseBusiness, CheckCircle2, Clock3, Loader2, RefreshCw, SendHorizontal, Sparkles, XCircle } from "lucide-react";
import type { OpeningListItem, OpeningRequest } from "@/lib/types";

type Props = {
  openings: OpeningListItem[];
  canRaise: boolean;
  canRaiseNew: boolean;
  canApprove: boolean;
  canManage: boolean;
  onOpeningsChanged?: () => Promise<void> | void;
};

type RequestStatusFilter = "" | "pending_hr_approval" | "applied" | "rejected";

const STATUS_OPTIONS: Array<{ value: RequestStatusFilter; label: string }> = [
  { value: "", label: "All" },
  { value: "pending_hr_approval", label: "Pending" },
  { value: "applied", label: "Applied" },
  { value: "rejected", label: "Rejected" },
];

function parseDetail(raw: string): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.startsWith("<!doctype") || lower.startsWith("<html")) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "detail" in parsed && typeof (parsed as { detail?: unknown }).detail === "string") {
      return (parsed as { detail: string }).detail;
    }
  } catch {
    // Ignore parsing errors and fall back to raw payload.
  }
  return text.length > 320 ? `${text.slice(0, 320)}...` : text;
}

function statusPill(status: string) {
  const token = String(status || "").toLowerCase();
  if (token === "applied") return "border-emerald-200 bg-emerald-50/80 text-emerald-700";
  if (token === "pending_hr_approval") return "border-amber-200 bg-amber-50/85 text-amber-700";
  if (token === "rejected") return "border-rose-200 bg-rose-50/80 text-rose-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function formatWhen(raw?: string | null) {
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString("en-IN", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function OpeningRequestsWorkspace({ openings, canRaise, canRaiseNew, canApprove, canManage, onOpeningsChanged }: Props) {
  const canSee = canRaise || canApprove;
  const [requests, setRequests] = useState<OpeningRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>("pending_hr_approval");
  const [targetMode, setTargetMode] = useState<"existing" | "new">("existing");

  const [openingCode, setOpeningCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationCity, setLocationCity] = useState("Delhi");
  const [locationCountry, setLocationCountry] = useState("India");
  const [headcountDelta, setHeadcountDelta] = useState(1);
  const [hmPersonId, setHmPersonId] = useState("");
  const [hmEmail, setHmEmail] = useState("");
  const [glDetails, setGlDetails] = useState("");
  const [l2Details, setL2Details] = useState("");
  const [reason, setReason] = useState("");

  const sortedOpenings = useMemo(
    () =>
      openings
        .filter((item) => !!item.opening_code)
        .sort((a, b) => String(a.opening_code).localeCompare(String(b.opening_code))),
    [openings]
  );

  const pendingCount = useMemo(
    () => requests.filter((item) => item.status === "pending_hr_approval").length,
    [requests]
  );
  const appliedCount = useMemo(() => requests.filter((item) => item.status === "applied").length, [requests]);
  const rejectedCount = useMemo(() => requests.filter((item) => item.status === "rejected").length, [requests]);
  const visibleRequests = useMemo(
    () => (statusFilter ? requests.filter((item) => item.status === statusFilter) : requests),
    [requests, statusFilter]
  );

  const refreshRequests = useCallback(async () => {
    if (!canSee) return;
    setLoading(true);
    try {
      const res = await fetch("/api/rec/openings/requests", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as OpeningRequest[];
      setRequests(data);
    } catch (e: any) {
      const raw = (e?.message || "").trim();
      setError(parseDetail(raw) || raw || "Unable to load opening requests.");
    } finally {
      setLoading(false);
    }
  }, [canSee]);

  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  useEffect(() => {
    if (!notice) return;
    const handle = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(handle);
  }, [notice]);

  useEffect(() => {
    if (!canRaiseNew && targetMode !== "existing") {
      setTargetMode("existing");
    }
  }, [canRaiseNew, targetMode]);

  if (!canSee) return null;

  async function submitRequest() {
    if (!canRaise) return;

    setError(null);
    setNotice(null);

    if (!canRaiseNew && !openingCode) {
      setError("Select an existing opening code.");
      return;
    }
    if (targetMode === "existing" && !openingCode) {
      setError(canRaiseNew ? "Select an opening code or switch to New Opening mode." : "Select an existing opening code.");
      return;
    }
    if (targetMode === "new" && !canRaiseNew) {
      setError("New opening requests are not available for your role.");
      return;
    }
    if (targetMode === "new" && !title.trim()) {
      setError("Opening title is required for a new opening request.");
      return;
    }
    if (headcountDelta === 0 && !hmPersonId.trim()) {
      setError("Hiring manager person id is required when headcount delta is 0.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/rec/openings/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        opening_code: targetMode === "existing" ? openingCode : null,
        title: canRaiseNew && targetMode === "new" ? title.trim() : null,
        description: description.trim() || null,
        location_city: locationCity.trim() || null,
        location_country: locationCountry.trim() || null,
        headcount_delta: Math.max(0, Number(headcountDelta) || 0),
        hiring_manager_person_id_platform: hmPersonId.trim() || null,
        hiring_manager_email: hmEmail.trim() || null,
        gl_details: glDetails.trim() || null,
        l2_details: l2Details.trim() || null,
        request_reason: reason.trim() || null,
        source_portal: canApprove ? "hr_portal" : "gl_portal",
      }),
    });

    if (!res.ok) {
      const raw = (await res.text()).trim();
      setError(parseDetail(raw) || `Request failed (${res.status})`);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setNotice("Opening request submitted.");
    setTargetMode("existing");
    setOpeningCode("");
    setTitle("");
    setDescription("");
    setLocationCity("Delhi");
    setLocationCountry("India");
    setHeadcountDelta(1);
    setHmPersonId("");
    setHmEmail("");
    setGlDetails("");
    setL2Details("");
    setReason("");
    await Promise.all([refreshRequests(), Promise.resolve(onOpeningsChanged?.())]);
  }

  async function approveRequest(request: OpeningRequest) {
    setBusyRequestId(request.opening_request_id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/rec/openings/requests/${request.opening_request_id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hiring_manager_person_id_platform: request.hiring_manager_person_id_platform || null,
        approval_note: "Approved from GL portal",
      }),
    });
    if (!res.ok) {
      const raw = (await res.text()).trim();
      setError(parseDetail(raw) || `Approve failed (${res.status})`);
      setBusyRequestId(null);
      return;
    }
    setBusyRequestId(null);
    setNotice(`Request #${request.opening_request_id} approved.`);
    await Promise.all([refreshRequests(), Promise.resolve(onOpeningsChanged?.())]);
  }

  async function rejectRequest(request: OpeningRequest) {
    const reasonInput = window.prompt("Rejection reason:", "Insufficient details");
    if (!reasonInput || !reasonInput.trim()) return;
    setBusyRequestId(request.opening_request_id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/rec/openings/requests/${request.opening_request_id}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rejection_reason: reasonInput.trim() }),
    });
    if (!res.ok) {
      const raw = (await res.text()).trim();
      setError(parseDetail(raw) || `Reject failed (${res.status})`);
      setBusyRequestId(null);
      return;
    }
    setBusyRequestId(null);
    setNotice(`Request #${request.opening_request_id} rejected.`);
    await refreshRequests();
  }

  async function setRequestStatus(request: OpeningRequest, nextStatus: "pending_hr_approval" | "rejected" | "applied") {
    if (!canManage) return;
    const payload: Record<string, string | null> = { status: nextStatus };
    if (nextStatus === "rejected") {
      const reasonInput = window.prompt("Rejection reason:", request.rejected_reason || "Rejected by Superadmin");
      if (!reasonInput || !reasonInput.trim()) return;
      payload.rejection_reason = reasonInput.trim();
    }
    if (nextStatus === "applied") {
      payload.approval_note = "Applied by Superadmin override";
    }
    setBusyRequestId(request.opening_request_id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/rec/openings/requests/${request.opening_request_id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const raw = (await res.text()).trim();
      setError(parseDetail(raw) || `Status update failed (${res.status})`);
      setBusyRequestId(null);
      return;
    }
    setBusyRequestId(null);
    setNotice(`Request #${request.opening_request_id} moved to ${nextStatus.replace(/_/g, " ")}.`);
    await Promise.all([refreshRequests(), Promise.resolve(onOpeningsChanged?.())]);
  }

  async function deleteRequest(request: OpeningRequest) {
    if (!canManage) return;
    if (!window.confirm(`Delete request #${request.opening_request_id}?`)) return;
    setBusyRequestId(request.opening_request_id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/rec/openings/requests/${request.opening_request_id}`, { method: "DELETE" });
    if (!res.ok) {
      const raw = (await res.text()).trim();
      setError(parseDetail(raw) || `Delete failed (${res.status})`);
      setBusyRequestId(null);
      return;
    }
    setBusyRequestId(null);
    setNotice(`Request #${request.opening_request_id} deleted.`);
    await refreshRequests();
  }

  return (
    <section className="section-card relative overflow-hidden border-slate-200/80 bg-gradient-to-br from-[#f7fafc] via-white to-[#eef3f8] shadow-[0_28px_72px_rgba(15,23,42,0.14)] motion-fade-up">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(56,118,174,0.22),_transparent_70%)]" />
      <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-[radial-gradient(circle,_rgba(231,64,17,0.13),_transparent_72%)]" />

      <div className="relative space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              <Sparkles className="h-3.5 w-3.5" />
              Talent Demand Studio
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Raise Opening Request</h2>
            <p className="text-sm text-slate-600">Submit structured headcount requests with GL and L2 context directly from the GL portal.</p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
            onClick={() => void refreshRequests()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Pending</p>
            <p className="mt-1 text-xl font-semibold text-amber-700">{pendingCount}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/75 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Applied</p>
            <p className="mt-1 text-xl font-semibold text-emerald-700">{appliedCount}</p>
          </div>
          <div className="rounded-2xl border border-rose-200/80 bg-rose-50/75 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Rejected</p>
            <p className="mt-1 text-xl font-semibold text-rose-700">{rejectedCount}</p>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          {canRaise ? (
            <form
              className="rounded-3xl border border-slate-200/80 bg-white/80 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.09)] backdrop-blur"
              onSubmit={(e) => {
                e.preventDefault();
                void submitRequest();
              }}
            >
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold text-slate-700">
                <button
                  type="button"
                  className={clsx("rounded-full px-3 py-1.5", targetMode === "existing" ? "bg-slate-900 text-white" : "text-slate-600")}
                  onClick={() => setTargetMode("existing")}
                >
                  Existing opening
                </button>
                {canRaiseNew ? (
                  <button
                    type="button"
                    className={clsx("rounded-full px-3 py-1.5", targetMode === "new" ? "bg-slate-900 text-white" : "text-slate-600")}
                    onClick={() => setTargetMode("new")}
                  >
                    New opening
                  </button>
                ) : null}
              </div>
              {!canRaiseNew ? (
                <p className="mt-3 text-xs text-slate-500">Your role can raise requests only for existing openings.</p>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-semibold text-slate-600">Opening target</span>
                  {targetMode === "existing" || !canRaiseNew ? (
                    <select
                      value={openingCode}
                      onChange={(e) => setOpeningCode(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    >
                      <option value="">Select opening code</option>
                      {sortedOpenings.map((item) => (
                        <option key={item.opening_id} value={item.opening_code || ""}>
                          {item.opening_code} - {item.title || "Untitled"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                      placeholder="eg. Senior Architect - Projects"
                    />
                  )}
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-semibold text-slate-600">Role summary</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    placeholder="Role context, responsibilities, and skill expectations..."
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600">Headcount delta</span>
                  <input
                    type="number"
                    min={0}
                    value={headcountDelta}
                    onChange={(e) => setHeadcountDelta(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600">Hiring manager person id</span>
                  <input
                    value={hmPersonId}
                    onChange={(e) => setHmPersonId(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    placeholder="Platform person id"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600">Hiring manager email</span>
                  <input
                    type="email"
                    value={hmEmail}
                    onChange={(e) => setHmEmail(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    placeholder="manager@studiolotus.in"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600">City</span>
                  <input
                    value={locationCity}
                    onChange={(e) => setLocationCity(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    placeholder="Delhi"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600">Country</span>
                  <input
                    value={locationCountry}
                    onChange={(e) => setLocationCountry(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    placeholder="India"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600">GL details</span>
                  <input
                    value={glDetails}
                    onChange={(e) => setGlDetails(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    placeholder="Project urgency, bandwidth, team demand"
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-semibold text-slate-600">L2 details</span>
                  <textarea
                    value={l2Details}
                    onChange={(e) => setL2Details(e.target.value)}
                    className="h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    placeholder="L2 expectations, business outcomes, delivery constraints"
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-semibold text-slate-600">Request note</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    placeholder="Why now? any budget/timeline note?"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                  Requests route to HR approval before headcount is applied.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,0.28)] hover:bg-slate-800 disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizontal className="h-3.5 w-3.5" />}
                  {submitting ? "Submitting..." : "Raise request"}
                </button>
              </div>
            </form>
          ) : (
            <div className="rounded-3xl border border-slate-200/80 bg-white/75 p-4 text-sm text-slate-600">
              Request creation is disabled for your role.
            </div>
          )}

          <div className="rounded-3xl border border-slate-200/80 bg-white/75 p-4 shadow-[0_10px_32px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                <BriefcaseBusiness className="h-4 w-4 text-slate-700" />
                Request stream
              </p>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as RequestStatusFilter)}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 space-y-3">
              {visibleRequests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-6 text-center text-sm text-slate-500">
                  No opening requests found for this filter.
                </div>
              ) : (
                visibleRequests.map((request) => (
                  <article
                    key={request.opening_request_id}
                    className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-slate-500">Request #{request.opening_request_id}</p>
                        <p className="text-sm font-semibold text-slate-900">{request.opening_title || request.opening_code || "New opening request"}</p>
                        <p className="text-xs text-slate-600">{request.opening_code || "Code generated on apply"} • Delta {request.headcount_delta}</p>
                      </div>
                      <span className={clsx("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", statusPill(request.status))}>
                        {request.status}
                      </span>
                    </div>

                    <div className="mt-2 grid gap-1 text-xs text-slate-600">
                      <p>HM: {request.hiring_manager_person_id_platform || "-"} {request.hiring_manager_email ? `(${request.hiring_manager_email})` : ""}</p>
                      <p>Raised: {formatWhen(request.created_at)}</p>
                      {request.request_reason ? <p className="line-clamp-2">Note: {request.request_reason}</p> : null}
                      {request.rejected_reason ? <p className="text-rose-600">Rejected: {request.rejected_reason}</p> : null}
                    </div>

                    {canApprove && request.status === "pending_hr_approval" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyRequestId === request.opening_request_id}
                          onClick={() => void approveRequest(request)}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyRequestId === request.opening_request_id}
                          onClick={() => void rejectRequest(request)}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </div>
                    ) : null}
                    {canManage ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyRequestId === request.opening_request_id}
                          onClick={() => void setRequestStatus(request, "pending_hr_approval")}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                        >
                          Mark pending
                        </button>
                        <button
                          type="button"
                          disabled={busyRequestId === request.opening_request_id}
                          onClick={() => void setRequestStatus(request, "applied")}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          Mark applied
                        </button>
                        <button
                          type="button"
                          disabled={busyRequestId === request.opening_request_id}
                          onClick={() => void setRequestStatus(request, "rejected")}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          Mark rejected
                        </button>
                        <button
                          type="button"
                          disabled={busyRequestId === request.opening_request_id}
                          onClick={() => void deleteRequest(request)}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
