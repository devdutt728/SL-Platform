import Link from "next/link";
import { AlarmClock } from "lucide-react";
import type { DashboardMetrics } from "@/lib/types";

type Props = {
  initialMetrics: DashboardMetrics | null;
  canViewOffers?: boolean;
};

export default function NeedsReviewCard({ initialMetrics, canViewOffers = false }: Props) {
  const metrics = initialMetrics;
  const cards = [
    {
      label: "CAF pending > SLA",
      note: "CAF not submitted in time",
      value: metrics?.caf_pending_overdue ?? "--",
      href: "/candidates?status_view=active&stage=hr_screening&needs_attention=1",
    },
    {
      label: "Medium CAFs",
      note: "Screening level = Medium",
      value: metrics?.needs_review_amber ?? "--",
      href: "/candidates?status_view=active&needs_attention=1",
    },
    {
      label: "Stuck > 5 days",
      note: "Pending stage ageing",
      value: metrics?.stuck_in_stage_over_days ?? "--",
      href: "/candidates?status_view=active&needs_attention=1",
    },
    {
      label: "Feedback pending",
      note: "Interviews missing feedback",
      value: metrics?.feedback_pending ?? "--",
      href: "/candidates?status_view=active&stage=l2_feedback&stage=l1_feedback",
    },
    {
      label: "Sprints overdue",
      note: "Assigned + past due",
      value: metrics?.sprints_overdue ?? "--",
      href: "/candidates?status_view=active&stage=sprint",
    },
    {
      label: "Offers awaiting response",
      note: "Sent, no decision yet",
      value: metrics?.offers_awaiting_response ?? "--",
      href: "/offers?status=sent",
      offerOnly: true,
    },
    {
      label: "New applications",
      note: "Created today",
      value: metrics?.new_applications_today ?? "--",
      href: "/candidates?status_view=all",
    },
  ].filter((item) => canViewOffers || !item.offerOnly);
  return (
    <div className="section-card motion-fade-up motion-delay-6 space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlarmClock className="h-4 w-4 text-[var(--brand-color)]" />
          <p className="text-sm font-semibold text-[var(--dim-grey)]">Needs review</p>
        </div>
        <span className="rounded-full border border-[var(--accessible-components--dark-grey)] bg-white/70 px-2.5 py-1 text-[10px] font-semibold text-[var(--dim-grey)]">
          Compact
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {cards.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="group rounded-xl border border-[var(--accessible-components--dark-grey)] bg-white/70 px-3 py-2 shadow-sm transition hover:bg-[var(--surface-card)]"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[12px] font-semibold text-[var(--dim-grey)]">{item.label}</p>
                <p className="text-[11px] text-[var(--light-grey)]">{item.note}</p>
              </div>
              <span className="rounded-full border border-[var(--accessible-components--dark-grey)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--dim-grey)]">
                {item.value}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
