"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock, Mail, Workflow } from "lucide-react";
import type { CandidateEvent } from "@/lib/types";
import { parseDateUtc } from "@/lib/datetime";

type ContextPanelProps = {
  title?: string;
  className?: string;
};

const iconMap: Record<string, typeof Mail> = {
  caf_submitted: Mail,
  caf_link_generated: Mail,
  interview_scheduled: CalendarClock,
  sprint_assigned: Workflow,
  sprint_submitted: Workflow,
};

function formatDateTime(raw?: string | null) {
  if (!raw) return "";
  const d = parseDateUtc(raw);
  if (!d) return "";
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-IN", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function prettifyAction(action: string) {
  return action.split("_").join(" ");
}

export function ContextPanel({ title = "Live activity", className }: ContextPanelProps) {
  const [events, setEvents] = useState<CandidateEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEvents = async () => {
    try {
      const res = await fetch("/api/rec/events?limit=10", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as CandidateEvent[];
      setEvents(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive || document.hidden) return;
      await loadEvents();
    };
    void tick();
    const handle = window.setInterval(() => {
      void tick();
    }, 20000);
    return () => {
      alive = false;
      window.clearInterval(handle);
    };
  }, []);

  const items = useMemo(() => events.slice(0, 10), [events]);

  return (
    <aside className={`glass-panel flex flex-col gap-3 rounded-2xl p-4 ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--dim-grey)]">{title}</p>
        <Clock className="h-4 w-4 text-[var(--light-grey)]" />
      </div>
      <div className="space-y-2">
        {loading && items.length === 0 ? (
          <p className="text-xs text-[var(--light-grey)]">Loading activity...</p>
        ) : null}
        {items.map((event) => {
          const Icon = iconMap[event.action_type] || Clock;
          const candidateLabel = event.candidate_name || event.candidate_code || "Candidate";
          const by = event.performed_by_name || event.performed_by_email || "System";
          return (
            <div
              key={event.event_id}
              className="rounded-xl border border-[var(--accessible-components--dark-grey)] bg-white/70 p-3 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-[var(--brand-color)]" />
                <p className="text-sm font-medium text-[var(--dim-grey)]">
                  {prettifyAction(event.action_type)}
                </p>
              </div>
              <p className="mt-1 text-xs text-[var(--dim-grey)]">
                {candidateLabel} - {by}
              </p>
              <p className="text-xs text-[var(--light-grey)]">{formatDateTime(event.created_at)}</p>
            </div>
          );
        })}
        {!loading && items.length === 0 ? (
          <p className="text-xs text-[var(--light-grey)]">No recent activity yet.</p>
        ) : null}
      </div>
    </aside>
  );
}
