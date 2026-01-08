import Link from "next/link";
import { AlarmClock } from "lucide-react";
import type { DashboardMetrics } from "@/lib/types";

type Props = {
  initialMetrics: DashboardMetrics | null;
};

export default function NeedsReviewCard({ initialMetrics }: Props) {
  const metrics = initialMetrics;
  return (
    <div className="section-card space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlarmClock className="h-4 w-4 text-amber-500" />
          <p className="text-sm font-semibold">Needs review</p>
        </div>
        <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-[10px] font-semibold text-slate-700">
          Compact
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {[
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
          },
          {
            label: "New applications",
            note: "Created today",
            value: metrics?.new_applications_today ?? "--",
            href: "/candidates?status_view=all",
          },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="group rounded-xl border border-white/60 bg-white/40 px-3 py-2 shadow-sm transition hover:bg-white/60"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[12px] font-semibold text-slate-800">{item.label}</p>
                <p className="text-[11px] text-slate-500">{item.note}</p>
              </div>
              <span className="rounded-full bg-white/60 px-2.5 py-1 text-[11px] font-semibold text-slate-800">
                {item.value}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
