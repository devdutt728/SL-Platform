"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { clsx } from "clsx";
import type { CandidateEvent, CandidateListItem, CandidateOffer, DashboardMetrics, OpeningListItem, OpeningRequest } from "@/lib/types";
import { Bell, Briefcase, LayoutPanelLeft, UsersRound } from "lucide-react";
import { fetchDeduped } from "@/lib/fetch-deduped";
import NeedsReviewCard from "./NeedsReviewCard";
import RecentActivityCard from "./RecentActivityCard";

type Props = {
  initialMetrics: DashboardMetrics | null;
  initialEvents: CandidateEvent[];
  initialOffers: CandidateOffer[];
  initialOpenings: OpeningListItem[];
  initialCandidates: CandidateListItem[];
  initialOpeningRequests: OpeningRequest[];
  canViewOffers?: boolean;
  canViewOpeningRequestNotifications?: boolean;
  canNavigate?: boolean;
  canNavigatePipeline?: boolean;
  hideActivity?: boolean;
};

const stageOrder = [
  { key: "enquiry", label: "Enquiry" },
  { key: "hr_screening", label: "HR screening" },
  { key: "l2_shortlist", label: "L2 shortlist" },
  { key: "l2_interview", label: "L2 interview" },
  { key: "l2_feedback", label: "L2 feedback" },
  { key: "sprint", label: "Sprint" },
  { key: "l1_shortlist", label: "L1 shortlist" },
  { key: "l1_interview", label: "L1 interview" },
  { key: "l1_feedback", label: "L1 feedback" },
  { key: "offer", label: "Offer" },
  { key: "joining_documents", label: "Joining documents" },
  { key: "hired", label: "Hired" },
  { key: "declined", label: "Declined" },
  { key: "rejected", label: "Rejected" },
];

const pipelineStages = [
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
];

const postOfferStages = ["joining_documents"];
const outcomeStages = ["hired", "declined", "rejected"];
const openingHoverStageKeys = stageOrder.map((item) => item.key);

function normalizeStage(raw?: string | null) {
  const value = (raw || "").trim().toLowerCase();
  if (!value) return "";
  if (value === "caf") return "hr_screening";
  if (value === "l2") return "l2_interview";
  if (value === "l1") return "l1_interview";
  return value.replace(/\s+/g, "_");
}

function stageLabel(raw?: string | null) {
  const key = normalizeStage(raw);
  return stageOrder.find((s) => s.key === key)?.label || key.replace(/_/g, " ");
}

function formatRequestTime(raw?: string | null) {
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

export default function DashboardClient({
  initialMetrics,
  initialEvents,
  initialOffers,
  initialOpenings,
  initialCandidates,
  initialOpeningRequests,
  canViewOffers = false,
  canViewOpeningRequestNotifications = false,
  canNavigate = true,
  canNavigatePipeline = canNavigate,
  hideActivity = false,
}: Props) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(initialMetrics);
  const [events, setEvents] = useState<CandidateEvent[]>(initialEvents);
  const [offers, setOffers] = useState<CandidateOffer[]>(initialOffers);
  const [openings, setOpenings] = useState<OpeningListItem[]>(initialOpenings);
  const [candidates, setCandidates] = useState<CandidateListItem[]>(initialCandidates);
  const [openingRequests, setOpeningRequests] = useState<OpeningRequest[]>(initialOpeningRequests);
  const [hoveredOpeningId, setHoveredOpeningId] = useState<number | null>(null);
  const [hoverPanelLeft, setHoverPanelLeft] = useState(8);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const requestBellRef = useRef<HTMLDivElement | null>(null);
  const [requestBellOpen, setRequestBellOpen] = useState(false);
  const [hideActivityClient] = useState(hideActivity);

  const PipelineItem = ({
    href,
    className,
    children,
  }: {
    href: string;
    className: string;
    children: ReactNode;
  }) => {
    return canNavigatePipeline ? (
      <Link href={href} className={className}>
        {children}
      </Link>
    ) : (
      <div className={className}>{children}</div>
    );
  };

  const offerSummary = useMemo(() => {
    return offers.reduce(
      (acc, offer) => {
        const key = offer.offer_status || "unknown";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [offers]);
  const pendingOpeningRequests = useMemo(
    () => openingRequests.filter((request) => request.status === "pending_hr_approval"),
    [openingRequests]
  );

  const perStage = metrics?.candidates_per_stage || [];
  const stageCounts = new Map(perStage.map((row) => [normalizeStage(row.stage), row.count]));
  const knownKeys = new Set(stageOrder.map((s) => s.key));
  const extraStages = perStage
    .filter((row) => !knownKeys.has(normalizeStage(row.stage)))
    .map((row) => ({ key: normalizeStage(row.stage) || row.stage, label: stageLabel(row.stage), count: row.count }));

  const stageData = (key: string) => {
    const label = stageOrder.find((stage) => stage.key === key)?.label || stageLabel(key);
    return { key, label, count: stageCounts.get(key) ?? 0 };
  };

  const pipelineList = [
    ...pipelineStages.map(stageData),
    ...extraStages.filter((stage) => !postOfferStages.includes(stage.key) && !outcomeStages.includes(stage.key)),
  ];
  const postOfferList = postOfferStages.map(stageData);
  const outcomeList = outcomeStages.map(stageData);
  const pipelineTotal = Math.max(1, pipelineList.reduce((sum, s) => sum + s.count, 0));

  const openingStripRows = useMemo(() => {
    const totals = new Map<number, number>();
    const stageCountsByOpening = new Map<number, Map<string, number>>();

    for (const candidate of candidates) {
      const openingId = candidate.opening_id;
      if (typeof openingId !== "number") continue;
      totals.set(openingId, (totals.get(openingId) || 0) + 1);
      const stage = normalizeStage(candidate.current_stage);
      if (!stage) continue;
      const openingStageMap = stageCountsByOpening.get(openingId) || new Map<string, number>();
      openingStageMap.set(stage, (openingStageMap.get(stage) || 0) + 1);
      stageCountsByOpening.set(openingId, openingStageMap);
    }

    return openings
      .map((opening) => ({
        openingId: opening.opening_id,
        title: opening.title || opening.opening_code || `Opening ${opening.opening_id}`,
        code: opening.opening_code || `ID-${opening.opening_id}`,
        isActive: !!opening.is_active,
        count: totals.get(opening.opening_id) || 0,
        stageCounts: stageCountsByOpening.get(opening.opening_id) || new Map<string, number>(),
      }))
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.count !== b.count) return b.count - a.count;
        return a.title.localeCompare(b.title);
      });
  }, [openings, candidates]);
  const maxOpeningCount = useMemo(() => Math.max(1, ...openingStripRows.map((row) => row.count || 0)), [openingStripRows]);
  const hoveredOpening = useMemo(
    () => openingStripRows.find((opening) => opening.openingId === hoveredOpeningId) || null,
    [openingStripRows, hoveredOpeningId]
  );

  function handleOpeningHover(openingId: number, event: React.MouseEvent<HTMLDivElement>) {
    const host = stripRef.current;
    if (!host) {
      setHoveredOpeningId(openingId);
      return;
    }
    const hostRect = host.getBoundingClientRect();
    const cardRect = event.currentTarget.getBoundingClientRect();
    const panelWidth = 280;
    const unclampedLeft = cardRect.left - hostRect.left;
    const maxLeft = Math.max(8, host.clientWidth - panelWidth - 8);
    const nextLeft = Math.min(Math.max(8, unclampedLeft), maxLeft);
    setHoverPanelLeft(nextLeft);
    setHoveredOpeningId(openingId);
  }

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
        const offersRequest = canViewOffers
          ? fetchDeduped("/api/rec/offers", { cache: "no-store" })
          : Promise.resolve(null);
        const requestsRequest = canViewOpeningRequestNotifications
          ? fetchDeduped("/api/rec/openings/requests?status=pending_hr_approval", { cache: "no-store" })
          : Promise.resolve(null);
        const [metricsRes, eventsRes, offersRes, openingsRes, candidatesRes, requestsRes] = await Promise.all([
          fetchDeduped("/api/rec/dashboard?stuck_days=5", { cache: "no-store" }),
          fetchDeduped("/api/rec/events?limit=10", { cache: "no-store" }),
          offersRequest,
          fetchDeduped("/api/rec/openings", { cache: "no-store" }),
          fetchDeduped("/api/rec/candidates", { cache: "no-store" }),
          requestsRequest,
        ]);
        if (!cancelled && metricsRes.ok) setMetrics((await metricsRes.json()) as DashboardMetrics);
        if (!cancelled && eventsRes.ok) setEvents((await eventsRes.json()) as CandidateEvent[]);
        if (!cancelled && offersRes && offersRes.ok) setOffers((await offersRes.json()) as CandidateOffer[]);
        if (!cancelled && openingsRes.ok) setOpenings((await openingsRes.json()) as OpeningListItem[]);
        if (!cancelled && candidatesRes.ok) setCandidates((await candidatesRes.json()) as CandidateListItem[]);
        if (!cancelled && requestsRes && requestsRes.ok) setOpeningRequests((await requestsRes.json()) as OpeningRequest[]);
      } catch {
        // ignore live refresh failures
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
  }, [canViewOffers, canViewOpeningRequestNotifications]);

  useEffect(() => {
    if (!requestBellOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (!requestBellRef.current) return;
      if (event.target instanceof Node && !requestBellRef.current.contains(event.target)) {
        setRequestBellOpen(false);
      }
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [requestBellOpen]);

  return (
    <main className="content-pad space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--light-grey)]">Recruitment</p>
          <h1 className="text-2xl font-semibold text-[var(--dim-grey)]">Dashboard</h1>
        </div>
        {canViewOpeningRequestNotifications ? (
          <div ref={requestBellRef} className="relative">
            <button
              type="button"
              className="relative inline-flex items-center gap-2 rounded-full border border-[var(--accessible-components--dark-grey)] bg-white px-4 py-2 text-xs font-semibold text-[var(--dim-grey)] shadow-sm hover:bg-[var(--surface-card)]"
              onClick={() => setRequestBellOpen((prev) => !prev)}
            >
              <Bell className="h-4 w-4" />
              Opening requests
              <span className="rounded-full bg-[var(--brand-color)] px-2 py-0.5 text-[10px] font-semibold text-white">
                {pendingOpeningRequests.length}
              </span>
            </button>
            {requestBellOpen ? (
              <div className="absolute right-0 top-[calc(100%+10px)] z-[220] w-[360px] max-w-[90vw] rounded-2xl border border-[var(--border-soft)] bg-white p-3 shadow-[0_24px_45px_-25px_rgba(15,23,42,0.45)]">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--dim-grey)]">Pending opening requests</p>
                  <Link href="/openings" className="text-xs font-semibold text-[var(--brand-color)]">
                    Open queue
                  </Link>
                </div>
                <div className="mt-3 space-y-2">
                  {pendingOpeningRequests.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--accessible-components--dark-grey)] bg-[var(--surface-card)] px-3 py-5 text-center text-xs text-[var(--light-grey)]">
                      No pending requests.
                    </div>
                  ) : (
                    pendingOpeningRequests.slice(0, 6).map((request) => (
                      <div key={request.opening_request_id} className="rounded-xl border border-[var(--accessible-components--dark-grey)] bg-white px-3 py-2">
                        <p className="text-xs font-semibold text-[var(--dim-grey)]">
                          #{request.opening_request_id} • {request.opening_title || request.opening_code || "Opening request"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--light-grey)]">
                          Delta {request.headcount_delta} • {formatRequestTime(request.created_at)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="section-card motion-fade-up motion-delay-1 relative z-[90] overflow-visible border border-[var(--border-soft)] bg-white/80 p-3">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(231,64,17,0.08),_transparent_40%)]" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-[var(--dim-grey)]" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--light-grey)]">Openings Live Strip</p>
          </div>
          <p className="text-[11px] text-[var(--light-grey)]">Hover for pipeline breakdown</p>
        </div>
        <div
          ref={stripRef}
          className="relative mt-2 overflow-visible"
          onMouseLeave={() => setHoveredOpeningId(null)}
        >
          <div className="overflow-x-auto overflow-y-hidden pb-1">
            <div className="flex min-w-max gap-1.5">
              {canNavigate ? (
                <Link
                  href="/candidates?status_view=all"
                  className={clsx(
                    "h-14 w-[180px] shrink-0 rounded-lg border px-2 py-1.5 transition",
                    "border-[var(--dim-grey)] bg-[var(--dim-grey)] text-white shadow-[0_8px_16px_-12px_rgba(93,85,82,0.9)]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] font-semibold text-white">All openings</p>
                    <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {candidates.length}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-white/75">Total candidates</p>
                </Link>
              ) : (
                <div className="h-14 w-[180px] shrink-0 rounded-lg border border-[var(--dim-grey)] bg-[var(--dim-grey)] px-2 py-1.5 text-white">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] font-semibold text-white">All openings</p>
                    <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {candidates.length}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-white/75">Total candidates</p>
                </div>
              )}
              {openingStripRows.map((opening) => {
                const barWidth = Math.max(8, Math.round((opening.count / maxOpeningCount) * 100));
                return (
                  <div
                    key={opening.openingId}
                    className="relative shrink-0"
                    onMouseEnter={(event) => handleOpeningHover(opening.openingId, event)}
                  >
                    {canNavigate ? (
                      <Link
                        href={`/candidates?status_view=all&opening_id=${opening.openingId}`}
                        className={clsx(
                          "block h-14 w-[175px] shrink-0 rounded-lg border px-2 py-1.5 text-left transition-all duration-150",
                          opening.isActive
                            ? "border-[var(--accessible-components--dark-grey)] bg-white/95 text-[var(--dim-grey)] hover:bg-[var(--surface-card)]"
                            : "border-[var(--accessible-components--dark-grey)] bg-[var(--surface-card)] text-[var(--light-grey)] hover:bg-white"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[10px] font-semibold">{opening.title}</p>
                          <span className="rounded-md bg-[var(--surface-card)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--dim-grey)]">
                            {opening.count}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-[var(--light-grey)]">{opening.code}</p>
                        <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-[rgba(93,85,82,0.14)]">
                          <div
                            className="h-full rounded-full bg-[rgba(231,64,17,0.55)] transition-all duration-200"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </Link>
                    ) : (
                      <div
                        className={clsx(
                          "h-14 w-[175px] shrink-0 rounded-lg border px-2 py-1.5 text-left",
                          opening.isActive
                            ? "border-[var(--accessible-components--dark-grey)] bg-white/95 text-[var(--dim-grey)]"
                            : "border-[var(--accessible-components--dark-grey)] bg-[var(--surface-card)] text-[var(--light-grey)]"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[10px] font-semibold">{opening.title}</p>
                          <span className="rounded-md bg-[var(--surface-card)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--dim-grey)]">
                            {opening.count}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-[var(--light-grey)]">{opening.code}</p>
                        <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-[rgba(93,85,82,0.14)]">
                          <div
                            className="h-full rounded-full bg-[rgba(231,64,17,0.55)]"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {hoveredOpeningId !== null && hoveredOpening ? (
            <div
              className="absolute top-[calc(100%+6px)] z-[180] w-[280px] rounded-lg border border-[var(--border-soft)] bg-white p-2 shadow-[0_16px_30px_-18px_rgba(93,85,82,0.45)]"
              style={{ left: `${hoverPanelLeft}px` }}
              onMouseEnter={() => setHoveredOpeningId(hoveredOpening.openingId)}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--light-grey)]">{hoveredOpening.title}</p>
                <span className="rounded-md bg-[var(--surface-card)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--dim-grey)]">
                  {hoveredOpening.count}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {openingHoverStageKeys
                  .map((key) => ({
                    key,
                    label: stageLabel(key),
                    count: hoveredOpening.stageCounts.get(key) || 0,
                  }))
                  .filter((item) => item.count > 0)
                  .map((stage) =>
                    canNavigate ? (
                      <Link
                        key={stage.key}
                        href={`/candidates?status_view=all&opening_id=${hoveredOpening.openingId}&stage=${encodeURIComponent(stage.key)}`}
                        className="flex items-center justify-between rounded-md border border-[var(--accessible-components--dark-grey)] bg-white px-1.5 py-1 text-[10px] text-[var(--dim-grey)] transition hover:bg-[var(--surface-card)]"
                      >
                        <span className="truncate pr-1">{stage.label}</span>
                        <span className="rounded bg-[var(--surface-card)] px-1 py-0.5 font-semibold">{stage.count}</span>
                      </Link>
                    ) : (
                      <div
                        key={stage.key}
                        className="flex items-center justify-between rounded-md border border-[var(--accessible-components--dark-grey)] bg-white px-1.5 py-1 text-[10px] text-[var(--dim-grey)]"
                      >
                        <span className="truncate pr-1">{stage.label}</span>
                        <span className="rounded bg-[var(--surface-card)] px-1 py-0.5 font-semibold">{stage.count}</span>
                      </div>
                    )
                  )}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="relative z-0 grid gap-3 lg:grid-cols-3">
        <div className="section-card motion-fade-up motion-delay-1 relative overflow-hidden border border-[var(--border-soft)] bg-white/75 p-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(231,64,17,0.14),_transparent_60%)]" />
          <div className="pointer-events-none absolute -right-16 top-0 h-28 w-28 rounded-full bg-[rgba(93,85,82,0.14)] blur-2xl" />
          <div className="relative flex items-center justify-between gap-3 pb-1">
            <div>
              <p className="text-[11px] uppercase tracking-[0.26em] text-[var(--light-grey)]">Snapshot</p>
              <p className="text-sm font-semibold text-[var(--dim-grey)]">Recruitment pulse</p>
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--light-grey)]">Live</span>
          </div>
          <div className="relative mt-3 grid gap-3 sm:grid-cols-3">
            {[
              {
                label: "Total applications",
                value: metrics?.total_applications_received ?? "--",
                bg: "linear-gradient(135deg, rgba(231, 64, 17, 0.16), rgba(255, 255, 255, 0.92), rgba(93, 85, 82, 0.08))",
                href: "/candidates?status_view=all",
              },
              {
                label: "Active candidates",
                value: metrics?.total_active_candidates ?? "--",
                bg: "linear-gradient(135deg, rgba(93, 85, 82, 0.13), rgba(255, 255, 255, 0.94), rgba(231, 64, 17, 0.12))",
                href: "/candidates?status_view=active",
              },
              {
                label: "CAF today",
                value: metrics?.caf_submitted_today ?? "--",
                bg: "linear-gradient(135deg, rgba(231, 64, 17, 0.12), rgba(255, 255, 255, 0.93), rgba(93, 85, 82, 0.1))",
                href: "/candidates?status_view=all&caf_today=1",
              },
            ].map((item, idx) => (
              <div
                key={item.label}
                className={clsx(
                  "motion-fade-up",
                  idx === 0 ? "motion-delay-2" : idx === 1 ? "motion-delay-3" : "motion-delay-4"
                )}
              >
                {canNavigate ? (
                  <Link
                    href={item.href}
                    className={clsx(
                      "group relative block w-full min-h-[132px] overflow-hidden rounded-2xl px-4 py-3 shadow-sm transition-all duration-200",
                      "hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft-hover)]"
                    )}
                  >
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        backgroundImage: item.bg,
                        backgroundRepeat: "no-repeat",
                        backgroundSize: "cover",
                      }}
                    />
                    <div className="pointer-events-none absolute inset-0 bg-white/35" />
                    <div className="relative flex items-center justify-between">
                      <p className="max-w-[75%] text-[9px] sm:text-[10px] lg:text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--dim-grey)] leading-snug">
                        {item.label}
                      </p>
                      <span className="text-[9px] sm:text-[10px] lg:text-[11px] font-semibold text-[var(--light-grey)]">tap</span>
                    </div>
                    <div className="relative mt-3 flex items-baseline justify-between">
                      <p className="text-[22px] sm:text-[24px] lg:text-[28px] font-semibold text-[var(--dim-grey)]">{item.value}</p>
                    </div>
                  </Link>
                ) : (
                  <div className="group relative min-h-[132px] overflow-hidden rounded-2xl px-4 py-3 shadow-sm transition-all duration-200">
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        backgroundImage: item.bg,
                        backgroundRepeat: "no-repeat",
                        backgroundSize: "cover",
                      }}
                    />
                    <div className="pointer-events-none absolute inset-0 bg-white/35" />
                    <div className="relative flex items-center justify-between">
                      <p className="max-w-[75%] text-[9px] sm:text-[10px] lg:text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--dim-grey)] leading-snug">
                        {item.label}
                      </p>
                    </div>
                    <div className="relative mt-3 flex items-baseline justify-between">
                      <p className="text-[22px] sm:text-[24px] lg:text-[28px] font-semibold text-[var(--dim-grey)]">{item.value}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="section-card motion-fade-up motion-delay-2 relative overflow-hidden border border-[var(--border-soft)] bg-white/75 p-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(231,64,17,0.1),_transparent_60%)]" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-[var(--dim-grey)]" />
              <p className="text-sm font-semibold text-[var(--dim-grey)]">Openings overview</p>
            </div>
            {canNavigate ? (
              <Link href="/openings" className="text-xs font-semibold text-[var(--dim-grey)] hover:text-[var(--brand-color)]">
                View openings
              </Link>
            ) : (
              <span className="text-xs font-semibold text-[var(--dim-grey)]">View openings</span>
            )}
          </div>
          {canNavigate ? (
            <Link
              href="/openings"
              className="relative mt-3 flex items-center justify-between rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white/70 px-4 py-3 shadow-sm transition hover:bg-[var(--surface-card)]"
            >
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--light-grey)]">Active openings</p>
                <p className="mt-1 text-xs text-[var(--dim-grey)]">Roles currently accepting candidates.</p>
              </div>
              <div className="rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white px-3 py-2 text-2xl font-semibold text-[var(--dim-grey)]">
                {metrics?.openings_count ?? "--"}
              </div>
            </Link>
          ) : (
            <div className="relative mt-3 flex items-center justify-between rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white/70 px-4 py-3 shadow-sm transition">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--light-grey)]">Active openings</p>
                <p className="mt-1 text-xs text-[var(--dim-grey)]">Roles currently accepting candidates.</p>
              </div>
              <div className="rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white px-3 py-2 text-2xl font-semibold text-[var(--dim-grey)]">
                {metrics?.openings_count ?? "--"}
              </div>
            </div>
          )}
        </div>
        {canViewOffers ? (
          <div className="section-card motion-fade-up motion-delay-3 relative overflow-hidden border border-[var(--border-soft)] bg-white/75 p-4">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(231,64,17,0.1),_transparent_60%)]" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UsersRound className="h-4 w-4 text-[var(--dim-grey)]" />
                <p className="text-sm font-semibold text-[var(--dim-grey)]">Offers summary</p>
              </div>
              {canNavigate ? (
                <Link href="/offers" className="text-xs font-semibold text-[var(--dim-grey)] hover:text-[var(--brand-color)]">
                  View offers
                </Link>
              ) : (
                <span className="text-xs font-semibold text-[var(--dim-grey)]">View offers</span>
              )}
            </div>
            <div className="relative mt-3 grid gap-2 md:grid-cols-2">
              {[
                ["pending_approval", "Pending approval"],
                ["sent", "Sent"],
                ["accepted", "Accepted"],
                ["declined", "Declined"],
              ].map(([key, label]) => (
                <div key={key}>
                  {canNavigate ? (
                    <Link
                      href={`/offers?status=${key}`}
                      className="flex items-center justify-between rounded-xl border border-[var(--accessible-components--dark-grey)] bg-white/70 px-3 py-2 shadow-sm transition hover:bg-[var(--surface-card)]"
                    >
                      <p className="text-[12px] font-semibold text-[var(--dim-grey)]">{label}</p>
                      <span className="rounded-full border border-[var(--accessible-components--dark-grey)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--dim-grey)]">
                        {offerSummary[key] ?? 0}
                      </span>
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border border-[var(--accessible-components--dark-grey)] bg-white/70 px-3 py-2 shadow-sm transition">
                      <p className="text-[12px] font-semibold text-[var(--dim-grey)]">{label}</p>
                      <span className="rounded-full border border-[var(--accessible-components--dark-grey)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--dim-grey)]">
                        {offerSummary[key] ?? 0}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="section-card motion-fade-up motion-delay-5 lg:col-span-2 border border-[var(--border-soft)] bg-white/75 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LayoutPanelLeft className="h-4 w-4 text-[var(--dim-grey)]" />
              <p className="text-sm font-semibold text-[var(--dim-grey)]">Pipeline</p>
            </div>
            {canNavigatePipeline ? (
              <Link href="/candidates" className="text-xs font-semibold text-[var(--dim-grey)] hover:text-[var(--brand-color)]">
                Open candidates
              </Link>
            ) : (
              <span className="text-xs font-semibold text-[var(--dim-grey)]">Open candidates</span>
            )}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {pipelineList.map((stage) => {
              const pct = Math.round((stage.count / pipelineTotal) * 100);
              const statusView = "active";
              return (
                <PipelineItem
                  key={stage.key}
                  href={`/candidates?status_view=${statusView}&stage=${encodeURIComponent(stage.key)}`}
                  className={clsx(
                    "group relative overflow-hidden rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white/70 p-3 shadow-sm transition-all duration-200",
                    canNavigatePipeline ? "hover:-translate-y-0.5 hover:bg-[var(--surface-card)] hover:shadow-[var(--shadow-soft-hover)]" : ""
                  )}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.06),_transparent_55%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  <div className="relative flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold text-[var(--dim-grey)]">{stage.label}</p>
                    <span className="text-[10px] font-semibold text-[var(--light-grey)]">{pct}%</span>
                  </div>
                  <div className="relative mt-2 flex items-baseline justify-between">
                    <p className="text-2xl font-semibold text-[var(--dim-grey)]">{stage.count}</p>
                    <span className="text-[10px] text-[var(--light-grey)]">applicants</span>
                  </div>
                  <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--brand-color)] via-[rgba(231,64,17,0.72)] to-[rgba(93,85,82,0.8)] transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </PipelineItem>
              );
            })}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white/70 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--light-grey)]">Post-offer</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {postOfferList.map((stage) => (
                  <PipelineItem
                    key={stage.key}
                    href={`/candidates?status_view=active&stage=${encodeURIComponent(stage.key)}`}
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800",
                      canNavigatePipeline ? "hover:bg-amber-100" : ""
                    )}
                  >
                    <span>{stage.label}</span>
                    <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                      {stage.count}
                    </span>
                  </PipelineItem>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white/70 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--light-grey)]">Outcomes</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {outcomeList.map((stage) => {
                  const statusView = stage.key === "hired" ? "hired" : "rejected";
                  return (
                    <PipelineItem
                      key={stage.key}
                      href={`/candidates?status_view=${statusView}&stage=${encodeURIComponent(stage.key)}`}
                      className={clsx(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
                        canNavigatePipeline ? "hover:opacity-95" : "",
                        stage.key === "hired"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-rose-200 bg-rose-50 text-rose-800"
                      )}
                    >
                      <span>{stage.label}</span>
                      <span className="rounded-full border border-[var(--accessible-components--dark-grey)] bg-white px-2 py-0.5 text-[10px] font-semibold text-[var(--dim-grey)]">
                        {stage.count}
                      </span>
                    </PipelineItem>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <NeedsReviewCard initialMetrics={metrics} canViewOffers={canViewOffers} />
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {!hideActivityClient ? <RecentActivityCard events={events} /> : null}

        <div className="section-card motion-fade-up motion-delay-8 border border-[var(--border-soft)] bg-white/75 p-4">
          <div className="flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-[var(--brand-color)]" />
            <p className="text-sm font-semibold text-[var(--dim-grey)]">Quick links</p>
          </div>
          {canNavigate ? (
            <ul className="mt-3 space-y-2 text-sm text-[var(--dim-grey)]">
              <li>
                <Link href="/candidates" className="font-semibold text-[var(--dim-grey)] hover:text-[var(--brand-color)]">
                  Candidates control panel
                </Link>
              </li>
              <li>
                <Link href="/openings" className="font-semibold text-[var(--dim-grey)] hover:text-[var(--brand-color)]">
                  Openings
                </Link>
              </li>
            </ul>
          ) : (
            <p className="mt-3 text-sm text-[var(--dim-grey)]">Quick links are disabled for this role.</p>
          )}
        </div>
      </section>
    </main>
  );
}
