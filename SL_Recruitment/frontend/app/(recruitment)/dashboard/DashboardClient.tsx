"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { clsx } from "clsx";
import type { CandidateEvent, CandidateOffer, DashboardMetrics } from "@/lib/types";
import { LayoutPanelLeft, UsersRound, Briefcase } from "lucide-react";
import NeedsReviewCard from "./NeedsReviewCard";
import RecentActivityCard from "./RecentActivityCard";

type Props = {
  initialMetrics: DashboardMetrics | null;
  initialEvents: CandidateEvent[];
  initialOffers: CandidateOffer[];
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

export default function DashboardClient({
  initialMetrics,
  initialEvents,
  initialOffers,
  canNavigate = true,
  canNavigatePipeline = canNavigate,
  hideActivity = false,
}: Props) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(initialMetrics);
  const [events, setEvents] = useState<CandidateEvent[]>(initialEvents);
  const [offers, setOffers] = useState<CandidateOffer[]>(initialOffers);
  const [hideActivityClient, setHideActivityClient] = useState(hideActivity);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const me = (await res.json()) as {
          platform_role_id?: number | string | null;
          platform_role_ids?: Array<number | string> | null;
        };
        if (cancelled) return;
        const roleIdRaw = me.platform_role_id ?? null;
        const roleIdNum = typeof roleIdRaw === "number" ? roleIdRaw : Number(roleIdRaw);
        const roleIdsRaw = (me.platform_role_ids || []) as Array<number | string>;
        const roleIds = roleIdsRaw
          .map((id) => (typeof id === "number" ? id : Number(id)))
          .filter((id) => Number.isFinite(id));
        const isRole6 =
          roleIdNum === 6 ||
          roleIds.includes(6) ||
          roleIdsRaw.map((id) => String(id).trim()).includes("6");
        if (isRole6) setHideActivityClient(true);
      } catch {
        // ignore
      }
    })();
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
        const [metricsRes, eventsRes, offersRes] = await Promise.all([
          fetch("/api/rec/dashboard?stuck_days=5", { cache: "no-store" }),
          fetch("/api/rec/events?limit=10", { cache: "no-store" }),
          fetch("/api/rec/offers", { cache: "no-store" }),
        ]);
        if (!cancelled && metricsRes.ok) setMetrics((await metricsRes.json()) as DashboardMetrics);
        if (!cancelled && eventsRes.ok) setEvents((await eventsRes.json()) as CandidateEvent[]);
        if (!cancelled && offersRes.ok) setOffers((await offersRes.json()) as CandidateOffer[]);
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
  }, []);

  return (
    <main className="content-pad space-y-6">
      <section className="grid gap-3 lg:grid-cols-3">
        <div className="section-card motion-fade-up motion-delay-1 relative overflow-hidden border border-slate-200/70 bg-white/75 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.18),_transparent_60%)]" />
          <div className="pointer-events-none absolute -right-16 top-0 h-28 w-28 rounded-full bg-emerald-400/20 blur-2xl" />
          <div className="relative flex items-center justify-between gap-3 pb-1">
            <div>
              <p className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Snapshot</p>
              <p className="text-sm font-semibold text-slate-900">Recruitment pulse</p>
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Live</span>
          </div>
          <div className="relative mt-3 grid gap-3 sm:grid-cols-3">
            {[
              {
                label: "Total applications",
                value: metrics?.total_applications_received ?? "--",
                bg: "linear-gradient(135deg, rgba(167, 243, 208, 0.9), rgba(191, 219, 254, 0.7), rgba(255, 255, 255, 0.9))",
                href: "/candidates?status_view=all",
              },
              {
                label: "Active candidates",
                value: metrics?.total_active_candidates ?? "--",
                bg: "linear-gradient(135deg, rgba(221, 214, 254, 0.85), rgba(254, 240, 138, 0.65), rgba(255, 255, 255, 0.9))",
                href: "/candidates?status_view=active",
              },
              {
                label: "CAF today",
                value: metrics?.caf_submitted_today ?? "--",
                bg: "linear-gradient(135deg, rgba(186, 230, 253, 0.85), rgba(187, 247, 208, 0.65), rgba(255, 255, 255, 0.9))",
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
                      "group relative block w-full min-h-[132px] overflow-hidden rounded-2xl px-4 py-3 shadow-[0_12px_26px_rgba(15,23,42,0.08)] transition-all duration-200",
                      "hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(15,23,42,0.12)]"
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
                      <p className="max-w-[75%] text-[9px] sm:text-[10px] lg:text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 leading-snug">
                        {item.label}
                      </p>
                      <span className="text-[9px] sm:text-[10px] lg:text-[11px] font-semibold text-slate-500">tap</span>
                    </div>
                    <div className="relative mt-3 flex items-baseline justify-between">
                      <p className="text-[22px] sm:text-[24px] lg:text-[28px] font-semibold text-slate-900">{item.value}</p>
                    </div>
                  </Link>
                ) : (
                  <div className="group relative min-h-[132px] overflow-hidden rounded-2xl px-4 py-3 shadow-[0_12px_26px_rgba(15,23,42,0.08)] transition-all duration-200">
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
                      <p className="max-w-[75%] text-[9px] sm:text-[10px] lg:text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 leading-snug">
                        {item.label}
                      </p>
                    </div>
                    <div className="relative mt-3 flex items-baseline justify-between">
                      <p className="text-[22px] sm:text-[24px] lg:text-[28px] font-semibold text-slate-900">{item.value}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="section-card motion-fade-up motion-delay-2 relative overflow-hidden border border-slate-200/70 bg-white/75 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(2,132,199,0.16),_transparent_60%)]" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-slate-800" />
              <p className="text-sm font-semibold text-slate-900">Openings overview</p>
            </div>
            {canNavigate ? (
              <Link href="/openings" className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                View openings
              </Link>
            ) : (
              <span className="text-xs font-semibold text-slate-700">View openings</span>
            )}
          </div>
          {canNavigate ? (
            <Link
              href="/openings"
              className="relative mt-3 flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 shadow-sm transition hover:bg-white hover:shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
            >
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Active openings</p>
                <p className="mt-1 text-xs text-slate-600">Roles currently accepting candidates.</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-2xl font-semibold text-slate-900">
                {metrics?.openings_count ?? "--"}
              </div>
            </Link>
          ) : (
            <div className="relative mt-3 flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 shadow-sm transition">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Active openings</p>
                <p className="mt-1 text-xs text-slate-600">Roles currently accepting candidates.</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-2xl font-semibold text-slate-900">
                {metrics?.openings_count ?? "--"}
              </div>
            </div>
          )}
        </div>
        <div className="section-card motion-fade-up motion-delay-3 relative overflow-hidden border border-slate-200/70 bg-white/75 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,116,144,0.18),_transparent_60%)]" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-slate-800" />
              <p className="text-sm font-semibold text-slate-900">Offers summary</p>
            </div>
            {canNavigate ? (
              <Link href="/offers" className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                View offers
              </Link>
            ) : (
              <span className="text-xs font-semibold text-slate-700">View offers</span>
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
                    className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 shadow-sm transition hover:bg-white hover:shadow-[0_8px_18px_rgba(15,23,42,0.08)]"
                  >
                    <p className="text-[12px] font-semibold text-slate-700">{label}</p>
                    <span className="rounded-full border border-slate-200/70 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-800">
                      {offerSummary[key] ?? 0}
                    </span>
                  </Link>
                ) : (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 shadow-sm transition">
                    <p className="text-[12px] font-semibold text-slate-700">{label}</p>
                    <span className="rounded-full border border-slate-200/70 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-800">
                      {offerSummary[key] ?? 0}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="section-card motion-fade-up motion-delay-5 lg:col-span-2 border border-slate-200/70 bg-white/75 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LayoutPanelLeft className="h-4 w-4 text-slate-800" />
              <p className="text-sm font-semibold text-slate-900">Pipeline</p>
            </div>
            {canNavigatePipeline ? (
              <Link href="/candidates" className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                Open candidates
              </Link>
            ) : (
              <span className="text-xs font-semibold text-slate-700">Open candidates</span>
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
                    "group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/70 p-3 shadow-sm transition-all duration-200",
                    canNavigatePipeline ? "hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_12px_24px_rgba(15,23,42,0.08)]" : ""
                  )}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.06),_transparent_55%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  <div className="relative flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold text-slate-600">{stage.label}</p>
                    <span className="text-[10px] font-semibold text-slate-400">{pct}%</span>
                  </div>
                  <div className="relative mt-2 flex items-baseline justify-between">
                    <p className="text-2xl font-semibold text-slate-900">{stage.count}</p>
                    <span className="text-[10px] text-slate-400">applicants</span>
                  </div>
                  <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </PipelineItem>
              );
            })}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Post-offer</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {postOfferList.map((stage) => (
                  <PipelineItem
                    key={stage.key}
                    href={`/candidates?status_view=active&stage=${encodeURIComponent(stage.key)}`}
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800",
                      canNavigatePipeline ? "hover:bg-emerald-100" : ""
                    )}
                  >
                    <span>{stage.label}</span>
                    <span className="rounded-full border border-emerald-200/70 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-900">
                      {stage.count}
                    </span>
                  </PipelineItem>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Outcomes</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {outcomeList.map((stage) => {
                  const statusView = stage.key === "hired" ? "hired" : "rejected";
                  return (
                    <PipelineItem
                      key={stage.key}
                      href={`/candidates?status_view=${statusView}&stage=${encodeURIComponent(stage.key)}`}
                      className={clsx(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
                        canNavigatePipeline ? "hover:opacity-90" : "",
                        stage.key === "hired"
                          ? "border-emerald-200/70 bg-emerald-50 text-emerald-800"
                          : "border-rose-200/70 bg-rose-50 text-rose-800"
                      )}
                    >
                      <span>{stage.label}</span>
                      <span className="rounded-full border border-slate-200/70 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-900">
                        {stage.count}
                      </span>
                    </PipelineItem>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <NeedsReviewCard initialMetrics={metrics} />
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {!hideActivityClient ? <RecentActivityCard events={events} /> : null}

        <div className="section-card motion-fade-up motion-delay-8 border border-slate-200/70 bg-white/75 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-slate-800" />
            <p className="text-sm font-semibold text-slate-900">Quick links</p>
          </div>
          {canNavigate ? (
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>
                <Link href="/candidates" className="font-semibold text-slate-700 hover:text-slate-900">
                  Candidates control panel
                </Link>
              </li>
              <li>
                <Link href="/openings" className="font-semibold text-slate-700 hover:text-slate-900">
                  Openings
                </Link>
              </li>
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-600">Quick links are disabled for this role.</p>
          )}
        </div>
      </section>
    </main>
  );
}
