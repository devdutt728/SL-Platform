"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { OpeningListItem, OpeningRequest, PlatformPersonSuggestion } from "@/lib/types";

type Props = {
  openings: OpeningListItem[];
  canRaise: boolean;
  canRaiseNew: boolean;
  canApprove: boolean;
  canManage: boolean;
  isHr: boolean;
  isGl: boolean;
  currentUserEmail?: string | null;
  currentUserPersonId?: string | null;
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

const requestStatusOrder: Record<string, number> = {
  pending_hr_approval: 0,
  applied: 1,
  rejected: 2,
};

function parseDetail(raw: string): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.startsWith("<!doctype") || lower.startsWith("<html")) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "detail" in parsed && typeof (parsed as any).detail === "string") {
      return (parsed as any).detail;
    }
  } catch {
    // ignore
  }
  return text.length > 320 ? `${text.slice(0, 320)}...` : text;
}

export function OpeningRequestsPanel({
  openings,
  canRaise,
  canRaiseNew,
  canApprove,
  canManage,
  isHr,
  isGl,
  currentUserEmail,
  currentUserPersonId,
  onError,
  onOpeningsChanged,
}: Props) {
  const [requests, setRequests] = useState<OpeningRequest[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const [openingCode, setOpeningCode] = useState("");
  const [title, setTitle] = useState("");
  const [headcountDelta, setHeadcountDelta] = useState(1);
  const [hmPersonId, setHmPersonId] = useState("");
  const [hmEmail, setHmEmail] = useState("");
  const [hmSuggestions, setHmSuggestions] = useState<PlatformPersonSuggestion[]>([]);
  const [hmSuggestionsLoading, setHmSuggestionsLoading] = useState(false);
  const [hmSuggestionsOpen, setHmSuggestionsOpen] = useState(false);
  const [hmSelected, setHmSelected] = useState<PlatformPersonSuggestion | null>(null);
  const [glDetails, setGlDetails] = useState("");
  const [l2Details, setL2Details] = useState("");
  const [reason, setReason] = useState("");

  const canSee = canRaise || canApprove;
  const isRoleFiveOrSixActor = canRaise && !canApprove;
  const isHrOrSuperadminActor = canApprove;
  const lockedEmail = useMemo(() => String(currentUserEmail || "").trim().toLowerCase(), [currentUserEmail]);
  const lockedPersonId = useMemo(() => String(currentUserPersonId || "").trim(), [currentUserPersonId]);
  const sortedOpenings = useMemo(
    () => openings.filter((o) => !!o.opening_code).sort((a, b) => String(a.opening_code).localeCompare(String(b.opening_code))),
    [openings]
  );

  const refreshRequests = useCallback(async () => {
    if (!canSee) return;
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await fetch(`/api/rec/openings/requests${query}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as OpeningRequest[];
      const sorted = [...data].sort((a, b) => {
        const aRank = requestStatusOrder[String(a.status || "").toLowerCase()] ?? 9;
        const bRank = requestStatusOrder[String(b.status || "").toLowerCase()] ?? 9;
        if (aRank !== bRank) return aRank - bRank;
        const aTs = Date.parse(a.updated_at || a.created_at || "");
        const bTs = Date.parse(b.updated_at || b.created_at || "");
        return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
      });
      setRequests(sorted);
    } catch {
      // ignore
    }
  }, [canSee, statusFilter]);

  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  const loadPeopleSuggestions = useCallback(async (query: string, limit = 10) => {
    const res = await fetch(`/api/platform/people?q=${encodeURIComponent(query)}&limit=${limit}`, { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as PlatformPersonSuggestion[];
  }, []);

  const applySelectedHmPerson = useCallback((person: PlatformPersonSuggestion) => {
    setHmSelected(person);
    setHmEmail(String(person.email || "").trim());
    setHmPersonId(String(person.person_id || "").trim());
    setHmSuggestions([]);
  }, []);

  const resolveHmPersonByEmail = useCallback(async (rawEmail: string) => {
    const email = String(rawEmail || "").trim().toLowerCase();
    if (!email) {
      setHmSelected(null);
      setHmPersonId("");
      return;
    }
    try {
      const options = await loadPeopleSuggestions(email, 15);
      const exact = options.find((item) => String(item.email || "").trim().toLowerCase() === email);
      if (exact) {
        applySelectedHmPerson(exact);
        return;
      }
      setHmSelected(null);
      if (!isRoleFiveOrSixActor) setHmPersonId("");
    } catch {
      // ignore lookup failures
    }
  }, [applySelectedHmPerson, isRoleFiveOrSixActor, loadPeopleSuggestions]);

  useEffect(() => {
    if (!isRoleFiveOrSixActor) return;
    setHmSuggestions((prev) => (prev.length > 0 ? [] : prev));
    setHmSuggestionsOpen(false);
    setHmSelected(null);
    setHmEmail((prev) => (prev === lockedEmail ? prev : lockedEmail));
    setHmPersonId((prev) => (prev === lockedPersonId ? prev : lockedPersonId));
    if (lockedEmail && !lockedPersonId) {
      void resolveHmPersonByEmail(lockedEmail);
    }
  }, [isRoleFiveOrSixActor, lockedEmail, lockedPersonId, resolveHmPersonByEmail]);

  useEffect(() => {
    if (!isHrOrSuperadminActor || !hmSuggestionsOpen) return;
    let cancelled = false;
    const query = hmEmail.trim();
    const handle = window.setTimeout(() => {
      (async () => {
        setHmSuggestionsLoading(true);
        try {
          const options = await loadPeopleSuggestions(query, 10);
          if (!cancelled) setHmSuggestions(options);
        } catch {
          if (!cancelled) setHmSuggestions([]);
        } finally {
          if (!cancelled) setHmSuggestionsLoading(false);
        }
      })();
    }, query.length < 2 ? 0 : 250);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [isHrOrSuperadminActor, hmSuggestionsOpen, hmEmail, loadPeopleSuggestions]);

  if (!canSee) return null;

  async function submitRequest() {
    if (!canRaise) return;
    const resolvedHmEmail = (isRoleFiveOrSixActor ? lockedEmail : hmEmail).trim().toLowerCase();
    const resolvedHmPersonId = (isRoleFiveOrSixActor ? lockedPersonId : hmPersonId).trim();
    if (!canRaiseNew && !openingCode) {
      onError("Select an existing opening code.");
      return;
    }
    if (canRaiseNew && !openingCode && !title.trim()) {
      onError("Select an existing opening code or enter title for new opening.");
      return;
    }
    if (headcountDelta === 0 && !resolvedHmPersonId) {
      onError("Hiring manager person id is required when headcount delta is 0.");
      return;
    }
    if (isRoleFiveOrSixActor && !resolvedHmEmail) {
      onError("Your login email could not be resolved for this request.");
      return;
    }
    if (isRoleFiveOrSixActor && !resolvedHmPersonId) {
      onError("Your person id could not be auto-fetched. Please contact HR.");
      return;
    }
    setSubmitting(true);
    onError(null);
    const res = await fetch("/api/rec/openings/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        opening_code: openingCode || null,
        title: canRaiseNew && !openingCode ? title.trim() || null : null,
        headcount_delta: Math.max(0, Number(headcountDelta) || 0),
        hiring_manager_person_id_platform: resolvedHmPersonId || null,
        hiring_manager_email: resolvedHmEmail || null,
        gl_details: glDetails.trim() || null,
        l2_details: l2Details.trim() || null,
        request_reason: reason.trim() || null,
        source_portal: isHr ? "hr_portal" : isGl ? "gl_portal" : "recruitment_portal",
      }),
    });
    if (!res.ok) {
      const raw = (await res.text()).trim();
      onError(parseDetail(raw) || `Request failed (${res.status})`);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setOpeningCode("");
    setTitle("");
    setHeadcountDelta(1);
    if (isRoleFiveOrSixActor) {
      setHmPersonId(lockedPersonId);
      setHmEmail(lockedEmail);
    } else {
      setHmPersonId("");
      setHmEmail("");
    }
    setHmSuggestions([]);
    setHmSuggestionsOpen(false);
    setHmSelected(null);
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
      onError(parseDetail(raw) || `Request failed (${res.status})`);
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
      onError(parseDetail(raw) || `Request failed (${res.status})`);
      setBusyId(null);
      return;
    }
    setBusyId(null);
    await refreshRequests();
  }

  async function setStatus(req: OpeningRequest, status: "pending_hr_approval" | "rejected" | "applied") {
    if (!canManage) return;
    const payload: Record<string, string> = { status };
    if (status === "rejected") {
      const reasonInput = window.prompt("Rejection reason:", req.rejected_reason || "Rejected by Superadmin");
      if (!reasonInput || !reasonInput.trim()) return;
      payload.rejection_reason = reasonInput.trim();
    }
    if (status === "applied") {
      payload.approval_note = "Applied by Superadmin override";
    }
    setBusyId(req.opening_request_id);
    onError(null);
    const res = await fetch(`/api/rec/openings/requests/${req.opening_request_id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const raw = (await res.text()).trim();
      onError(parseDetail(raw) || `Request failed (${res.status})`);
      setBusyId(null);
      return;
    }
    setBusyId(null);
    await Promise.all([refreshRequests(), onOpeningsChanged()]);
  }

  async function deleteReq(req: OpeningRequest) {
    if (!canManage) return;
    if (!window.confirm(`Delete request #${req.opening_request_id}?`)) return;
    setBusyId(req.opening_request_id);
    onError(null);
    const res = await fetch(`/api/rec/openings/requests/${req.opening_request_id}`, { method: "DELETE" });
    if (!res.ok) {
      const raw = (await res.text()).trim();
      onError(parseDetail(raw) || `Request failed (${res.status})`);
      setBusyId(null);
      return;
    }
    setBusyId(null);
    await Promise.all([refreshRequests(), onOpeningsChanged()]);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-tight text-slate-500">Opening Requests</p>
          <p className="text-sm text-slate-500">HR, Superadmin, and Role 5/6 can raise requests with HM, GL, L2 details. Role 5/6 can raise only from existing openings. HR approval applies headcount increase.</p>
          {isRoleFiveOrSixActor ? <p className="text-xs text-slate-500">HM email and person id are locked to your logged-in account.</p> : null}
          {isHrOrSuperadminActor ? <p className="text-xs text-slate-500">Type HM email and pick from DB suggestions to auto-fill person id.</p> : null}
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
            <option value="">{canRaiseNew ? "New opening - enter title" : "Select existing opening code"}</option>
            {sortedOpenings.map((o) => <option key={o.opening_id} value={o.opening_code || ""}>{o.opening_code} - {o.title || "Untitled"}</option>)}
          </select>
          {canRaiseNew ? (
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Opening title (for new code)" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm md:col-span-2" />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 md:col-span-2">
              Your role can raise requests only for existing opening codes.
            </div>
          )}
          <input type="number" min={0} value={headcountDelta} onChange={(e) => setHeadcountDelta(Number(e.target.value) || 0)} placeholder="Headcount delta" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm" />
          <input
            value={hmPersonId}
            onChange={(e) => {
              if (isRoleFiveOrSixActor) return;
              setHmPersonId(e.target.value);
            }}
            readOnly={isRoleFiveOrSixActor}
            placeholder={isRoleFiveOrSixActor ? "Auto-fetched from your login" : "Hiring manager person id"}
            className={clsx(
              "rounded-xl border border-slate-200 px-3 py-2 text-sm",
              isRoleFiveOrSixActor ? "cursor-not-allowed bg-slate-100 text-slate-500" : "bg-transparent"
            )}
          />
          <div className="relative">
            <input
              type="email"
              value={hmEmail}
              onChange={(e) => {
                if (isRoleFiveOrSixActor) return;
                const next = e.target.value;
                setHmEmail(next);
                setHmSelected(null);
                if (!next.trim()) setHmPersonId("");
              }}
              onFocus={() => {
                if (!isRoleFiveOrSixActor && isHrOrSuperadminActor) setHmSuggestionsOpen(true);
              }}
              onBlur={() => {
                if (!isRoleFiveOrSixActor && isHrOrSuperadminActor) {
                  window.setTimeout(() => setHmSuggestionsOpen(false), 150);
                  void resolveHmPersonByEmail(hmEmail);
                }
              }}
              readOnly={isRoleFiveOrSixActor}
              placeholder={isRoleFiveOrSixActor ? "Auto-fetched from your login" : "Hiring manager email"}
              className={clsx(
                "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm",
                isRoleFiveOrSixActor ? "cursor-not-allowed bg-slate-100 text-slate-500" : "bg-transparent"
              )}
            />
            {hmSuggestionsLoading && hmSuggestionsOpen && !isRoleFiveOrSixActor ? (
              <div className="absolute right-3 top-2 text-[11px] text-slate-500">Searching...</div>
            ) : null}
            {!isRoleFiveOrSixActor && hmSuggestionsOpen && hmSuggestions.length > 0 ? (
              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.14)]">
                {hmSuggestions.map((person) => (
                  <button
                    key={person.person_id}
                    type="button"
                    className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => applySelectedHmPerson(person)}
                  >
                    <span className="truncate">
                      <span className="font-medium text-slate-800">{person.full_name}</span>{" "}
                      <span className="text-slate-500">({person.email})</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">{person.person_id}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <input value={glDetails} onChange={(e) => setGlDetails(e.target.value)} placeholder="GL details" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm" />
          <input value={l2Details} onChange={(e) => setL2Details(e.target.value)} placeholder="L2 details" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm md:col-span-2" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason / notes" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm md:col-span-2" />
          {hmSelected && !isRoleFiveOrSixActor ? (
            <p className="text-xs text-slate-500 md:col-span-4">Auto-mapped person id: {hmSelected.person_id}</p>
          ) : null}
          <div className="md:col-span-4">
            <button type="button" disabled={submitting} onClick={() => void submitRequest()} className="rounded-full bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
              {submitting ? "Submitting..." : "Raise request"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 max-h-[360px] overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 bg-white/60">
        <table className="min-w-[980px] w-full table-fixed border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-white/90"><tr className="uppercase tracking-wide text-slate-500"><th className="border-b border-slate-200 px-1.5 py-1.5 text-left font-semibold">Req</th><th className="border-b border-slate-200 px-1.5 py-1.5 text-left font-semibold">Opening</th><th className="border-b border-slate-200 px-1.5 py-1.5 text-left font-semibold">Delta</th><th className="border-b border-slate-200 px-1.5 py-1.5 text-left font-semibold">HM</th><th className="border-b border-slate-200 px-1.5 py-1.5 text-left font-semibold">GL / L2</th><th className="border-b border-slate-200 px-1.5 py-1.5 text-left font-semibold">Status</th><th className="border-b border-slate-200 px-1.5 py-1.5 text-left font-semibold">Actions</th></tr></thead>
          <tbody>
            {requests.map((req) => (
              <tr key={req.opening_request_id} className="text-slate-800">
                <td className="border-b border-slate-200 px-1.5 py-1 font-semibold">{req.opening_request_id}</td>
                <td className="border-b border-slate-200 px-1.5 py-1"><div className="truncate">{req.opening_code || "-"}</div><div className="truncate text-[11px] text-slate-500">{req.opening_title || "-"}</div></td>
                <td className="border-b border-slate-200 px-1.5 py-1 font-semibold">{req.headcount_delta}</td>
                <td className="border-b border-slate-200 px-1.5 py-1"><div className="text-[11px]">{req.hiring_manager_person_id_platform || "-"}</div><div className="text-[11px] text-slate-500">{req.hiring_manager_email || "-"}</div></td>
                <td className="border-b border-slate-200 px-1.5 py-1"><div className="text-[11px]">{req.gl_details || "-"}</div><div className="text-[11px] text-slate-500">{req.l2_details || "-"}</div></td>
                <td className="border-b border-slate-200 px-1.5 py-1"><span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusPill(req.status)}`}>{req.status}</span></td>
                <td className="border-b border-slate-200 px-1.5 py-1">
                  <div className="flex items-center gap-0.5">
                    {canApprove && req.status === "pending_hr_approval" ? <><button type="button" disabled={busyId === req.opening_request_id} onClick={() => void approve(req)} className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Approve</button><button type="button" disabled={busyId === req.opening_request_id} onClick={() => void reject(req)} className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Reject</button></> : null}
                    {canManage ? <><button type="button" disabled={busyId === req.opening_request_id} onClick={() => void setStatus(req, "pending_hr_approval")} className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">Pending</button><button type="button" disabled={busyId === req.opening_request_id} onClick={() => void setStatus(req, "applied")} className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Applied</button><button type="button" disabled={busyId === req.opening_request_id} onClick={() => void setStatus(req, "rejected")} className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Rejected</button><button type="button" disabled={busyId === req.opening_request_id} onClick={() => void deleteReq(req)} className="rounded-full border border-red-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Delete</button></> : null}
                    {!canApprove && !canManage ? <span className="text-xs text-slate-400">-</span> : null}
                  </div>
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
