"use client";

import { CandidateFull } from "@/lib/types";
import { Chip, Metric } from "./Candidate360Primitives";

type Props = {
  sectionRef: React.RefObject<HTMLDivElement>;
  collapsed: boolean;
  onToggle: () => void;
  events: CandidateFull["events"];
  bestEffortFromMeta: (meta: Record<string, unknown>, key: string) => string;
  formatEventDateTime: (raw?: string | null) => string;
  chipTone: (kind: "neutral" | "green" | "amber" | "red" | "blue") => string;
};

export function Candidate360TimelineSection({
  sectionRef,
  collapsed,
  onToggle,
  events,
  bestEffortFromMeta,
  formatEventDateTime,
  chipTone,
}: Props) {
  return (
    <div ref={sectionRef} className="section-card">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-tight text-slate-500">Event timeline</p>
        <button
          type="button"
          className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
          onClick={onToggle}
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {collapsed ? null : (
        <div className="mt-4 space-y-3">
          {events.map((ev) => {
            const meta = ev.meta_json || {};
            const fromStage = bestEffortFromMeta(meta, "from_stage") || bestEffortFromMeta(meta, "from_status");
            const toStage = bestEffortFromMeta(meta, "to_stage") || bestEffortFromMeta(meta, "to_status");
            const note = bestEffortFromMeta(meta, "note");
            const decision = bestEffortFromMeta(meta, "decision") || bestEffortFromMeta(meta, "reason");
            const reasonCode = bestEffortFromMeta(meta, "reason_code");
            const actor = ev.performed_by_name || ev.performed_by_email || "System";
            const title =
              ev.action_type === "stage_change" && (fromStage || toStage)
                ? `Stage: ${fromStage || "?"} -> ${toStage || "?"}`
                : ev.action_type.split("_").join(" ");
            return (
              <div key={ev.event_id} className="rounded-2xl border border-white/60 bg-white/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="mt-1 text-xs text-slate-600">{formatEventDateTime(ev.created_at)} · {actor}</p>
                  </div>
                  <Chip className={chipTone("neutral")}>{ev.action_type}</Chip>
                </div>

                {(decision || note || reasonCode) ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {decision ? <Metric label="Decision" value={decision} /> : null}
                    {note ? <Metric label="Note" value={note} /> : null}
                    {reasonCode ? <Metric label="Reason code" value={reasonCode} /> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {events.length === 0 ? <p className="text-sm text-slate-600">No events yet.</p> : null}
        </div>
      )}
    </div>
  );
}
