"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { CandidateListItem, OpeningListItem } from "@/lib/types";
import { AlertTriangle, CheckCircle2, Filter, XCircle, Bookmark, Eye } from "lucide-react";
import { parseDateUtc } from "@/lib/datetime";
import { redirectToLogin } from "@/lib/auth-client";
import { useToast } from "@/components/ui/toast-provider";
import { trackUxMetric } from "@/lib/ux-metrics";

type Props = {
  initialCandidates: CandidateListItem[];
  openings: OpeningListItem[];
  canNavigate?: boolean;
  canViewBasicDetails?: boolean;
};

const stageTone: Record<string, string> = {
  enquiry: "bg-blue-600/10 text-blue-700 ring-1 ring-blue-600/10",
  hr_screening: "bg-teal-600/10 text-teal-700 ring-1 ring-teal-600/10",
  l2_shortlist: "bg-violet-600/10 text-violet-700 ring-1 ring-violet-600/10",
  l2: "bg-violet-600/10 text-violet-700 ring-1 ring-violet-600/10",
  l2_interview: "bg-violet-600/10 text-violet-700 ring-1 ring-violet-600/10",
  l2_feedback: "bg-violet-600/10 text-violet-700 ring-1 ring-violet-600/10",
  sprint: "bg-amber-600/10 text-amber-700 ring-1 ring-amber-600/10",
  l1: "bg-indigo-600/10 text-indigo-700 ring-1 ring-indigo-600/10",
  l1_shortlist: "bg-indigo-600/10 text-indigo-700 ring-1 ring-indigo-600/10",
  l1_interview: "bg-indigo-600/10 text-indigo-700 ring-1 ring-indigo-600/10",
  l1_feedback: "bg-indigo-600/10 text-indigo-700 ring-1 ring-indigo-600/10",
  offer: "bg-emerald-600/10 text-emerald-700 ring-1 ring-emerald-600/10",
  joining_documents: "bg-emerald-600/10 text-emerald-700 ring-1 ring-emerald-600/10",
  hired: "bg-emerald-600/10 text-emerald-700 ring-1 ring-emerald-600/10",
  declined: "bg-rose-600/10 text-rose-700 ring-1 ring-rose-600/10",
  rejected: "bg-rose-600/10 text-rose-700 ring-1 ring-rose-600/10",
};

const stageLabels: Record<string, string> = {
  enquiry: "Enquiry",
  hr_screening: "HR screening",
  l2_shortlist: "L2 shortlist",
  l2_interview: "L2 interview",
  l2_feedback: "L2 feedback",
  sprint: "Sprint",
  l1_shortlist: "L1 shortlist",
  l1_interview: "L1 interview",
  l1_feedback: "L1 feedback",
  offer: "Offer",
  joining_documents: "Joining documents",
  hired: "Hired",
  declined: "Declined",
  rejected: "Rejected",
};

function normalizeStage(raw?: string | null) {
  const value = (raw || "").trim().toLowerCase();
  if (!value) return "";
  const normalized = value.replace(/\s+/g, "_");
  if (normalized === "caf") return "hr_screening";
  if (normalized === "l2") return "l2_interview";
  if (normalized === "l1") return "l1_interview";
  return normalized;
}

function stageLabel(raw?: string | null) {
  const key = normalizeStage(raw);
  return stageLabels[key] || (key ? key.replace(/_/g, " ") : "");
}

function sourceLabel(candidate: CandidateListItem) {
  const origin = (candidate.source_origin || "").trim();
  const channel = (candidate.source_channel || "").trim();
  if (origin && channel) return `${origin} • ${channel}`;
  if (origin) return origin;
  if (channel) return channel;
  return "";
}

function yesNoUnknown(value: boolean | null | undefined): string {
  if (value == null) return "-";
  return value ? "Yes" : "No";
}

function cleanText(value: string | null | undefined): string {
  const trimmed = String(value || "").trim();
  return trimmed || "-";
}

function chipTone(kind: "neutral" | "green" | "amber" | "red" | "blue") {
  if (kind === "green") return "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/20";
  if (kind === "amber") return "bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/20";
  if (kind === "red") return "bg-rose-500/15 text-rose-800 ring-1 ring-rose-500/20";
  if (kind === "blue") return "bg-blue-500/15 text-blue-800 ring-1 ring-blue-500/20";
  return "bg-slate-500/10 text-slate-800 ring-1 ring-slate-500/15";
}

function cafChip(candidate: CandidateListItem) {
  if (candidate.caf_submitted_at) return { label: "CAF submitted", tone: chipTone("green") };
  if (candidate.caf_sent_at) return { label: "CAF pending", tone: chipTone("amber") };
  return { label: "CAF not sent", tone: chipTone("neutral") };
}

function priorityChip(candidate: CandidateListItem) {
  const ageHigh = (candidate.ageing_days || 0) >= 2;
  const r = (candidate.screening_result || "").trim().toLowerCase();
  const isHigh = r === "red" || r === "high";
  const isMedium = r === "amber" || r === "medium";
  const isLow = r === "green" || r === "low";
  if (ageHigh || isHigh) return { label: "High", tone: chipTone("red") };
  if (isMedium) return { label: "Medium", tone: chipTone("amber") };
  if (isLow) return { label: "Low", tone: chipTone("green") };
  return null;
}

function isAttentionCandidate(candidate: CandidateListItem) {
  const screening = (candidate.screening_result || "").trim().toLowerCase();
  const isHighAge = (candidate.ageing_days || 0) >= 2;
  const isHigh = screening === "red" || screening === "high";
  const isMedium = screening === "amber" || screening === "medium";
  const isLow = screening === "green" || screening === "low";
  const cafPendingTooLong =
    normalizeStage(candidate.current_stage) === "hr_screening" &&
    !candidate.caf_submitted_at &&
    (candidate.ageing_days || 0) >= 3;
  return isHighAge || isHigh || isMedium || isLow || cafPendingTooLong || !!candidate.needs_hr_review;
}

const STAGE_OPTIONS = [
  "enquiry",
  "hr_screening",
  "l2_shortlist",
  "l2_interview",
  "l2_feedback",
  "sprint",
  "l1_shortlist",
  "l1_interview",
  "l1_feedback",
  "offer",
  "joining_documents",
  "hired",
  "declined",
  "rejected",
];

type SavedView = {
  id: string;
  name: string;
  selectedStages: string[];
  openingId: string;
  statusView: "all" | "active" | "hired" | "rejected";
  needsAttention: boolean;
  cafToday: boolean;
};

async function fetchCandidates(params: {
  stage: string[];
  openingId: string;
  statusView: "all" | "active" | "hired" | "rejected";
}) {
  const url = new URL("/api/rec/candidates", window.location.origin);
  for (const st of params.stage) url.searchParams.append("stage", st);
  if (params.openingId) url.searchParams.set("opening_id", params.openingId);

  if (params.statusView === "hired") url.searchParams.append("status", "hired");
  if (params.statusView === "rejected") {
    url.searchParams.append("status", "rejected");
    url.searchParams.append("status", "declined");
  }
  if (params.statusView === "active") {
    for (const s of ["new", "enquiry", "in_process", "offer"]) url.searchParams.append("status", s);
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (res.status === 401) {
    redirectToLogin();
    return [];
  }
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateListItem[];
}

export function CandidatesClient({
  initialCandidates,
  openings,
  canNavigate = true,
  canViewBasicDetails = false,
}: Props) {
  const { pushToast } = useToast();
  const [candidates, setCandidates] = useState<CandidateListItem[]>(initialCandidates);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [initialized, setInitialized] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);

  const tableGrid =
    "grid grid-cols-[minmax(200px,2.4fr)_minmax(140px,1.2fr)_minmax(170px,1.5fr)_minmax(200px,1.9fr)_minmax(80px,0.7fr)_minmax(80px,0.7fr)_minmax(95px,0.8fr)]";

  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [openingId, setOpeningId] = useState("");
  const [statusView, setStatusView] = useState<"all" | "active" | "hired" | "rejected">("active");
  const [needsAttention, setNeedsAttention] = useState(false);
  const [cafToday, setCafToday] = useState(false);

  function resetFilters() {
    setSelectedStages([]);
    setOpeningId("");
    setStatusView("active");
    setNeedsAttention(false);
    setCafToday(false);
  }

  function applySavedView(view: SavedView) {
    setSelectedStages(view.selectedStages || []);
    setOpeningId(view.openingId || "");
    setStatusView(view.statusView || "active");
    setNeedsAttention(Boolean(view.needsAttention));
    setCafToday(Boolean(view.cafToday));
    pushToast({ tone: "info", title: `View loaded: ${view.name}` });
    trackUxMetric({ event_name: "candidate_saved_view_applied", entity_type: "saved_view", entity_id: view.id });
  }

  function saveCurrentView() {
    const name = `View ${savedViews.length + 1}`;
    const view: SavedView = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      selectedStages: [...selectedStages],
      openingId,
      statusView,
      needsAttention,
      cafToday,
    };
    setSavedViews((prev) => [view, ...prev].slice(0, 12));
    pushToast({ tone: "success", title: `Saved view: ${view.name}` });
    trackUxMetric({ event_name: "candidate_saved_view_created", entity_type: "saved_view", entity_id: view.id });
  }

  function toDayKey(value: Date, tz: string) {
    return value.toLocaleDateString("en-CA", { timeZone: tz });
  }

  useEffect(() => {
    if (initialized) return;
    const stageValues = new Set<string>();
    const rawStages = searchParams.getAll("stage");
    if (rawStages.length) {
      rawStages.forEach((raw) => {
        const cleaned = normalizeStage(raw);
        if (cleaned) stageValues.add(cleaned);
      });
    } else {
      const raw = searchParams.get("stage") || "";
      raw.split(",").forEach((item) => {
        const cleaned = normalizeStage(item);
        if (cleaned) stageValues.add(cleaned);
      });
    }
    if (stageValues.size) setSelectedStages(Array.from(stageValues));

    const nextStatus = (searchParams.get("status_view") || "").trim().toLowerCase();
    if (nextStatus === "all" || nextStatus === "active" || nextStatus === "hired" || nextStatus === "rejected") {
      setStatusView(nextStatus);
    }
    const nextOpening = searchParams.get("opening_id") || "";
    if (nextOpening) setOpeningId(nextOpening);

    setNeedsAttention(searchParams.get("needs_attention") === "1");
    setCafToday(searchParams.get("caf_today") === "1");
    setInitialized(true);
  }, [initialized, searchParams]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("rec_candidates_saved_views_v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedView[];
      if (Array.isArray(parsed)) setSavedViews(parsed.slice(0, 12));
    } catch {
      // Ignore malformed local storage data.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("rec_candidates_saved_views_v1", JSON.stringify(savedViews.slice(0, 12)));
    } catch {
      // Ignore storage write issues.
    }
  }, [savedViews]);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      (async () => {
        setLoading(true);
        setError(null);
        try {
          const data = await fetchCandidates({ stage: selectedStages, openingId, statusView });
          if (!cancelled) setCandidates(data);
        } catch (e: any) {
          if (!cancelled) setError(e?.message || "Failed to load candidates");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [selectedStages, openingId, statusView]);

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
      setLoading(true);
      setError(null);
      try {
        const data = await fetchCandidates({ stage: selectedStages, openingId, statusView });
        if (!cancelled) setCandidates(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load candidates");
      } finally {
        if (!cancelled) setLoading(false);
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
  }, [selectedStages, openingId, statusView]);

  const filtered = useMemo(() => {
    let current = candidates;
    if (cafToday) {
      const todayKey = toDayKey(new Date(), "Asia/Kolkata");
      current = current.filter((c) => {
        if (!c.caf_submitted_at) return false;
        const parsed = parseDateUtc(c.caf_submitted_at);
        if (!parsed || Number.isNaN(parsed.getTime())) return false;
        return toDayKey(parsed, "Asia/Kolkata") === todayKey;
      });
    }
    if (!needsAttention) return current;
    return current.filter((candidate) => isAttentionCandidate(candidate));
  }, [candidates, needsAttention, cafToday]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedCandidateId(null);
      return;
    }
    if (selectedCandidateId == null || !filtered.some((item) => item.candidate_id === selectedCandidateId)) {
      setSelectedCandidateId(filtered[0].candidate_id);
    }
  }, [filtered, selectedCandidateId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName.toLowerCase();
        if (["input", "textarea", "select"].includes(tag) || event.target.isContentEditable) return;
      }
      if (!filtered.length) return;
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        setSelectedCandidateId((prev) => {
          const currentIdx = filtered.findIndex((item) => item.candidate_id === prev);
          const nextIdx = currentIdx < 0 ? 0 : Math.min(filtered.length - 1, currentIdx + 1);
          return filtered[nextIdx].candidate_id;
        });
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSelectedCandidateId((prev) => {
          const currentIdx = filtered.findIndex((item) => item.candidate_id === prev);
          const nextIdx = currentIdx <= 0 ? 0 : currentIdx - 1;
          return filtered[nextIdx].candidate_id;
        });
      }
      if (event.key.toLowerCase() === "e") {
        const selected = filtered.find((item) => item.candidate_id === selectedCandidateId);
        if (!selected) return;
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
        window.location.href = `${basePath}/candidates/${selected.candidate_id}`;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, selectedCandidateId]);

  const selectedCandidate = useMemo(
    () => filtered.find((item) => item.candidate_id === selectedCandidateId) || null,
    [filtered, selectedCandidateId]
  );

  const stageDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const candidate of filtered) {
      const key = normalizeStage(candidate.current_stage) || "unknown";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, count]) => ({ key, label: stageLabels[key] || key.replace(/_/g, " "), count }));
  }, [filtered]);

  const attentionQueue = useMemo(() => {
    return filtered
      .filter((candidate) => isAttentionCandidate(candidate))
      .sort((a, b) => (b.ageing_days || 0) - (a.ageing_days || 0))
      .slice(0, 5);
  }, [filtered]);

  const attentionCount = useMemo(
    () => filtered.filter((candidate) => isAttentionCandidate(candidate)).length,
    [filtered]
  );

  return (
    <main className="content-pad space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Control panel</p>
          <h1 className="text-2xl font-semibold text-slate-900">Candidates</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            Total {filtered.length}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            Attention {attentionCount}
          </span>
          {loading ? <span className="text-xs text-slate-500">Refreshing...</span> : null}
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="rounded-2xl border border-slate-200 bg-white/70 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            Filters
          </div>
          {(["active", "all", "hired", "rejected"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={clsx(
                "rounded-full px-3 py-1 text-xs font-semibold transition",
                statusView === v ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              )}
              onClick={() => setStatusView(v)}
            >
              {v === "all" ? "All" : v === "active" ? "Active" : v === "hired" ? "Hired" : "Rejected"}
            </button>
          ))}
          <button
            type="button"
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1",
              needsAttention ? "bg-amber-500/15 text-amber-800 ring-amber-500/20" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            )}
            onClick={() => setNeedsAttention((v) => !v)}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Needs attention
          </button>
          <button
            type="button"
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1",
              cafToday ? "bg-emerald-500/15 text-emerald-800 ring-emerald-500/20" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            )}
            onClick={() => setCafToday((v) => !v)}
          >
            CAF today
          </button>
          <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            Opening
            <select
              value={openingId}
              onChange={(e) => setOpeningId(e.target.value)}
              className="w-56 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
            >
              <option value="">All openings</option>
              {openings.map((o) => (
                <option key={o.opening_id} value={String(o.opening_id)}>
                  {(o.title || o.opening_code || `Opening ${o.opening_id}`).slice(0, 80)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={saveCurrentView}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Bookmark className="h-3.5 w-3.5" />
            Save view
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1">
          {STAGE_OPTIONS.map((stage) => {
            const active = selectedStages.includes(stage);
            return (
              <button
                key={stage}
                type="button"
                onClick={() => {
                  setSelectedStages((prev) =>
                    prev.includes(stage) ? prev.filter((s) => s !== stage) : [...prev, stage]
                  );
                }}
                className={clsx(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                  active ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                )}
              >
                {stageLabels[stage] || stage}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSelectedStages([])}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            title="Clear stage filter"
          >
            <XCircle className="h-3 w-3" />
            Clear stage
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500">Saved</span>
          {savedViews.length === 0 ? (
            <p className="text-[11px] text-slate-500">No saved views yet.</p>
          ) : (
            savedViews.map((view) => (
              <button
                key={view.id}
                type="button"
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => applySavedView(view)}
              >
                {view.name}
              </button>
            ))
          )}
          <span className="ml-auto text-[11px] text-slate-500">Shortcuts: J/K move · E open profile</span>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-200 bg-white/70">
          <div
            className={clsx(
              "gap-2 border-b border-slate-200 px-3 py-1.5 text-[11px] uppercase tracking-wide text-slate-500",
              tableGrid
            )}
          >
            <span>Candidate</span>
            <span>Opening</span>
            <span>Stage</span>
            <span>CAF / Screening</span>
            <span className="text-center">Applied age</span>
            <span className="text-center">Stage age</span>
            <span>Status</span>
          </div>

          <div className="divide-y divide-slate-200">
            {filtered.map((candidate) => {
              const caf = cafChip(candidate);
              const screening = priorityChip(candidate);
              const stageKey = normalizeStage(candidate.current_stage);
              const stageClass = stageTone[stageKey] || "bg-slate-500/10 text-slate-700 ring-1 ring-slate-500/15";
              const attention = isAttentionCandidate(candidate);
              const l1Count = candidate.l1_interview_count || 0;
              const l2Count = candidate.l2_interview_count || 0;
              const l1Feedback = !!candidate.l1_feedback_submitted;
              const l2Feedback = !!candidate.l2_feedback_submitted;

              const appliedAgeRaw = Number.isFinite(candidate.applied_ageing_days) ? candidate.applied_ageing_days : 0;
              const appliedAge =
                appliedAgeRaw > 0
                  ? appliedAgeRaw
                  : candidate.created_at
                    ? Math.max(
                        0,
                        Math.floor(
                          (new Date().getTime() - new Date(candidate.created_at).getTime()) / (24 * 60 * 60 * 1000)
                        )
                      )
                    : 0;
              const isSelected = selectedCandidateId === candidate.candidate_id;
              const rowClass = clsx(
                "gap-2 px-3 py-2.5 transition",
                canNavigate ? "hover:bg-white/80" : "",
                tableGrid,
                attention ? "bg-amber-500/5" : "",
                isSelected ? "ring-2 ring-inset ring-[rgba(19,120,209,0.45)]" : ""
              );
              const rowContent = (
                <>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{candidate.name}</p>
                    <p className="text-[11px] text-slate-600">{candidate.candidate_code}</p>
                    {sourceLabel(candidate) ? <p className="text-[10px] text-slate-500">{sourceLabel(candidate)}</p> : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{candidate.opening_title || "-"}</p>
                    <p className="text-[11px] text-slate-600">{candidate.opening_id ? `ID: ${candidate.opening_id}` : ""}</p>
                  </div>
                  <div className="min-w-0">
                    <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", stageClass)}>
                      {stageLabel(candidate.current_stage) || "-"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
                    <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", caf.tone)}>{caf.label}</span>
                    {screening ? (
                      <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", screening.tone)}>
                        <CheckCircle2 className="h-3 w-3" />
                        {screening.label}
                      </span>
                    ) : null}
                    {l1Count > 0 ? (
                      <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", l1Feedback ? chipTone("green") : chipTone("amber"))}>
                        L1 {l1Feedback ? "done" : "pending"}
                      </span>
                    ) : null}
                    {l2Count > 0 ? (
                      <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", l2Feedback ? chipTone("green") : chipTone("amber"))}>
                        L2 {l2Feedback ? "done" : "pending"}
                      </span>
                    ) : null}
                  </div>
                  <div className="whitespace-nowrap text-center text-sm text-slate-800">{appliedAge}d</div>
                  <div className="whitespace-nowrap text-center text-sm text-slate-800">{candidate.ageing_days}d</div>
                  <div className="whitespace-nowrap">
                    <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", chipTone(candidate.status === "rejected" || candidate.status === "declined" ? "red" : candidate.status === "hired" ? "green" : "neutral"))}>
                      {candidate.status.split("_").join(" ")}
                    </span>
                  </div>
                </>
              );

              return canNavigate ? (
                <Link
                  key={candidate.candidate_id}
                  href={`/candidates/${candidate.candidate_id}`}
                  className={rowClass}
                  onMouseEnter={() => setSelectedCandidateId(candidate.candidate_id)}
                >
                  {rowContent}
                </Link>
              ) : (
                <div
                  key={candidate.candidate_id}
                  className={rowClass}
                  onMouseEnter={() => setSelectedCandidateId(candidate.candidate_id)}
                >
                  {rowContent}
                </div>
              );
            })}

            {filtered.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-slate-500">
                {loading ? "Loading..." : "No candidates found for these filters."}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-3">
          <div className="rounded-2xl border border-slate-200 bg-white/75 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Quick preview</p>
              {selectedCandidate && canNavigate ? (
                <Link
                  href={`/candidates/${selectedCandidate.candidate_id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Open 360
                </Link>
              ) : null}
            </div>
            {selectedCandidate ? (
              <>
                <p className="mt-2 text-sm font-semibold text-slate-900">{selectedCandidate.name}</p>
                <p className="text-[11px] text-slate-600">{selectedCandidate.candidate_code} · {stageLabel(selectedCandidate.current_stage)}</p>
                <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5">
                  <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px]">
                    <p className="text-slate-500">Applying for</p>
                    <p className="truncate text-right font-medium text-slate-800" title={cleanText(selectedCandidate.opening_title)}>
                      {cleanText(selectedCandidate.opening_title)}
                    </p>
                    <p className="text-slate-500">Applied age</p>
                    <p className="text-right font-medium text-slate-800">{selectedCandidate.applied_ageing_days || 0}d</p>
                    <p className="text-slate-500">Stage age</p>
                    <p className="text-right font-medium text-slate-800">{selectedCandidate.ageing_days || 0}d</p>
                    <p className="text-slate-500">Status</p>
                    <p className="text-right font-medium capitalize text-slate-800">{selectedCandidate.status.split("_").join(" ")}</p>
                  </div>
                </div>
                {canViewBasicDetails ? (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Candidate basic details</p>
                    <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px]">
                      <p className="text-slate-500">Full name</p>
                      <p className="truncate text-right text-slate-800" title={cleanText(`${selectedCandidate.first_name || ""} ${selectedCandidate.last_name || ""}`.trim() || selectedCandidate.name)}>
                        {cleanText(`${selectedCandidate.first_name || ""} ${selectedCandidate.last_name || ""}`.trim() || selectedCandidate.name)}
                      </p>
                      <p className="text-slate-500">Email</p>
                      <p className="truncate text-right text-slate-800" title={cleanText(selectedCandidate.email)}>{cleanText(selectedCandidate.email)}</p>
                      <p className="text-slate-500">Contact</p>
                      <p className="truncate text-right text-slate-800" title={cleanText(selectedCandidate.phone)}>{cleanText(selectedCandidate.phone)}</p>
                      <p className="text-slate-500">Education</p>
                      <p className="truncate text-right text-slate-800" title={cleanText(selectedCandidate.educational_qualification)}>
                        {cleanText(selectedCandidate.educational_qualification)}
                      </p>
                      <p className="text-slate-500">Experience</p>
                      <p className="text-right text-slate-800">
                        {selectedCandidate.years_of_experience == null ? "-" : `${selectedCandidate.years_of_experience} years`}
                      </p>
                      <p className="text-slate-500">City</p>
                      <p className="truncate text-right text-slate-800" title={cleanText(selectedCandidate.city)}>{cleanText(selectedCandidate.city)}</p>
                      <p className="text-slate-500">Relocate</p>
                      <p className="text-right text-slate-800">{yesNoUnknown(selectedCandidate.willing_to_relocate)}</p>
                      <p className="text-slate-500">Terms</p>
                      <p className="text-right text-slate-800">{yesNoUnknown(selectedCandidate.terms_consent)}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                      {selectedCandidate.portfolio_url ? (
                        <a
                          href={selectedCandidate.portfolio_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Portfolio
                        </a>
                      ) : (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-400">Portfolio</span>
                      )}
                      {selectedCandidate.cv_url ? (
                        <a
                          href={selectedCandidate.cv_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          CV
                        </a>
                      ) : (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-400">CV</span>
                      )}
                      {selectedCandidate.resume_url ? (
                        <a
                          href={selectedCandidate.resume_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Resume
                        </a>
                      ) : (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-400">Resume</span>
                      )}
                    </div>
                  </div>
                ) : null}
                {!canViewBasicDetails ? (
                  <p className="mt-2 text-[11px] text-slate-500">Basic candidate details are visible to HR roles and super admin only.</p>
                ) : null}
                <div className="mt-2">
                  <p className="truncate text-[11px] text-slate-500">{sourceLabel(selectedCandidate) || "Source not available"}</p>
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-600">Select a row to preview candidate details.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/75 p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Stage distribution</p>
            <div className="mt-2 space-y-1.5">
              {stageDistribution.length === 0 ? (
                <p className="text-xs text-slate-500">No stage data for current filters.</p>
              ) : (
                stageDistribution.map((item) => (
                  <div key={item.key} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="truncate text-xs font-semibold text-slate-700">{item.label}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{item.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-amber-800">Attention queue</p>
            <div className="mt-2 space-y-1.5">
              {attentionQueue.length === 0 ? (
                <p className="text-xs text-amber-700">No urgent candidates in this view.</p>
              ) : (
                attentionQueue.map((candidate) => (
                  <div key={candidate.candidate_id} className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5">
                    <p className="truncate text-xs font-semibold text-slate-800">{candidate.name}</p>
                    <p className="text-[11px] text-slate-600">{stageLabel(candidate.current_stage)} · {candidate.ageing_days}d</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
