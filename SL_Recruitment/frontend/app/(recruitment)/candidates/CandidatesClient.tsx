"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { CandidateListItem, OpeningListItem } from "@/lib/types";
import { AlertTriangle, CheckCircle2, Filter, XCircle } from "lucide-react";
import { parseDateUtc } from "@/lib/datetime";
import { redirectToLogin } from "@/lib/auth-client";

type Props = {
  initialCandidates: CandidateListItem[];
  openings: OpeningListItem[];
  canNavigate?: boolean;
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

export function CandidatesClient({ initialCandidates, openings, canNavigate = true }: Props) {
  const [candidates, setCandidates] = useState<CandidateListItem[]>(initialCandidates);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [initialized, setInitialized] = useState(false);

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
    return current.filter((c) => {
      const screening = (c.screening_result || "").trim().toLowerCase();
      const isHighAge = (c.ageing_days || 0) >= 2;
      const isHigh = screening === "red" || screening === "high";
      const isMedium = screening === "amber" || screening === "medium";
      const isLow = screening === "green" || screening === "low";
      const cafPendingTooLong = normalizeStage(c.current_stage) === "hr_screening" && !c.caf_submitted_at && (c.ageing_days || 0) >= 3;
      return isHighAge || isHigh || isMedium || isLow || cafPendingTooLong || !!c.needs_hr_review;
    });
  }, [candidates, needsAttention, cafToday]);

  const uniqueStages = useMemo(() => {
    const built = new Set<string>([
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
      "hired",
      "rejected",
    ]);
    for (const c of candidates) {
      const s = normalizeStage(c.current_stage);
      if (s) built.add(s);
    }
    return Array.from(built);
  }, [candidates]);

  return (
    <main className="content-pad space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-tight text-slate-500">Control panel</p>
          <h1 className="mt-1 text-2xl font-semibold">Candidates</h1>
          <p className="mt-1 text-sm text-slate-600">
            Showing <span className="font-semibold">{filtered.length}</span> candidates
            {needsAttention ? " (needs attention)" : ""}
            {cafToday ? " (CAF today)" : ""}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={clsx(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold ring-1",
              needsAttention ? "bg-amber-500/15 text-amber-800 ring-amber-500/20" : "bg-white/50 text-slate-800 ring-white/70 hover:bg-white/70"
            )}
            onClick={() => setNeedsAttention((v) => !v)}
          >
            <AlertTriangle className="h-4 w-4" />
            Needs attention
          </button>
          <button
            type="button"
            className={clsx(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold ring-1",
              cafToday ? "bg-emerald-500/15 text-emerald-800 ring-emerald-500/20" : "bg-white/50 text-slate-800 ring-white/70 hover:bg-white/70"
            )}
            onClick={() => setCafToday((v) => !v)}
          >
            CAF today
          </button>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="rounded-2xl border border-slate-200 bg-white/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Filter className="h-4 w-4 text-slate-500" />
            Filters
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["active", "all", "hired", "rejected"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={clsx(
                  "rounded-full px-4 py-2 text-xs font-semibold transition",
                  statusView === v ? "bg-slate-900 text-white" : "bg-white/60 text-slate-800 hover:bg-white"
                )}
                onClick={() => setStatusView(v)}
              >
                {v === "all" ? "All" : v === "active" ? "Active" : v === "hired" ? "Hired" : "Rejected"}
              </button>
            ))}
          </div>

          <label className="ml-auto flex w-full flex-col gap-1 md:w-auto">
            <span className="text-xs font-semibold text-slate-600">Opening</span>
            <select
              value={openingId}
              onChange={(e) => setOpeningId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm md:w-72"
            >
              <option value="">All openings</option>
              {openings.map((o) => (
                <option key={o.opening_id} value={String(o.opening_id)}>
                  {(o.title || o.opening_code || `Opening ${o.opening_id}`).slice(0, 80)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex w-full flex-col gap-2 md:w-auto">
            <span className="text-xs font-semibold text-slate-600">Stage</span>
            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/70 p-2">
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
                      "rounded-full px-3 py-1 text-xs font-semibold transition",
                      active ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-white/80"
                    )}
                  >
                    {stageLabels[stage] || stage}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setSelectedStages([])}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
                title="Clear stage filter"
              >
                <XCircle className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
            <p className="text-xs text-slate-500">Multi-select with clicks (no Ctrl/Cmd needed).</p>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-white"
          >
            <XCircle className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-200 bg-white/60">
        <div
          className={clsx(
            "gap-2 border-b border-slate-200 px-3 py-2 text-xs uppercase tracking-wide text-slate-500",
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
          {filtered.map((c) => {
            const caf = cafChip(c);
            const screening = priorityChip(c);
            const stageKey = normalizeStage(c.current_stage);
            const stageClass = stageTone[stageKey] || "bg-slate-500/10 text-slate-700 ring-1 ring-slate-500/15";
            const screeningValue = (c.screening_result || "").trim().toLowerCase();
            const isHighAge = (c.ageing_days || 0) >= 2;
            const isHigh = screeningValue === "red" || screeningValue === "high";
            const isMedium = screeningValue === "amber" || screeningValue === "medium";
            const isLow = screeningValue === "green" || screeningValue === "low";
            const cafPendingTooLong = normalizeStage(c.current_stage) === "hr_screening" && !c.caf_submitted_at && (c.ageing_days || 0) >= 3;
            const attention = needsAttention
              ? true
              : !!c.needs_hr_review ||
                isHighAge ||
                isHigh ||
                isMedium ||
                isLow ||
                cafPendingTooLong;
            const l1Count = c.l1_interview_count || 0;
            const l2Count = c.l2_interview_count || 0;
            const l1Feedback = !!c.l1_feedback_submitted;
            const l2Feedback = !!c.l2_feedback_submitted;

            const appliedAgeRaw = Number.isFinite(c.applied_ageing_days) ? c.applied_ageing_days : 0;
            const appliedAge =
              appliedAgeRaw > 0
                ? appliedAgeRaw
                : c.created_at
                  ? Math.max(
                      0,
                      Math.floor(
                        (new Date().getTime() - new Date(c.created_at).getTime()) / (24 * 60 * 60 * 1000)
                      )
                    )
                  : 0;
            const rowClass = clsx(
              "gap-2 px-3 py-3 transition",
              canNavigate ? "hover:bg-white/70" : "",
              tableGrid,
              isHighAge || isHigh ? "bg-rose-500/10" : attention ? "bg-amber-500/5" : ""
            );
            const rowContent = (
              <>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-600">{c.candidate_code}</p>
                  {sourceLabel(c) ? <p className="text-[11px] text-slate-500">{sourceLabel(c)}</p> : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{c.opening_title || "-"}</p>
                  <p className="text-xs text-slate-600">{c.opening_id ? `ID: ${c.opening_id}` : ""}</p>
                </div>
                <div className="min-w-0">
                  <span className={clsx("inline-flex rounded-full px-2 py-1 text-xs font-semibold", stageClass)}>
                    {stageLabel(c.current_stage) || "-"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
                  <span className={clsx("rounded-full px-2 py-1 text-xs font-semibold", caf.tone)}>{caf.label}</span>
                  {screening ? (
                    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold", screening.tone)}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {screening.label}
                    </span>
                  ) : null}
                  {l1Count > 0 ? (
                    <span
                      className={clsx(
                        "rounded-full px-2 py-1 text-xs font-semibold",
                        l1Feedback ? chipTone("green") : chipTone("amber")
                      )}
                    >
                      L1 feedback {l1Feedback ? "submitted" : "pending"}
                    </span>
                  ) : null}
                  {l2Count > 0 ? (
                    <span
                      className={clsx(
                        "rounded-full px-2 py-1 text-xs font-semibold",
                        l2Feedback ? chipTone("green") : chipTone("amber")
                      )}
                    >
                      L2 feedback {l2Feedback ? "submitted" : "pending"}
                    </span>
                  ) : null}
                </div>
                <div className="whitespace-nowrap text-center text-sm text-slate-800">{appliedAge}d</div>
                <div className="whitespace-nowrap text-center text-sm text-slate-800">{c.ageing_days}d</div>
                <div className="whitespace-nowrap">
                  <span className={clsx("rounded-full px-2 py-1 text-xs font-semibold", chipTone(c.status === "rejected" || c.status === "declined" ? "red" : c.status === "hired" ? "green" : "neutral"))}>
                    {c.status.split("_").join(" ")}
                  </span>
                </div>
              </>
            );

            return canNavigate ? (
              <Link
                key={c.candidate_id}
                href={`/candidates/${c.candidate_id}`}
                className={rowClass}
              >
                {rowContent}
              </Link>
            ) : (
              <div
                key={c.candidate_id}
                className={rowClass}
              >
                {rowContent}
              </div>
            );
          })}

          {filtered.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-slate-500">
              {loading ? "Loading..." : "No candidates found for these filters."}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
