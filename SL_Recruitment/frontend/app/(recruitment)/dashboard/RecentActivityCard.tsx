"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity } from "lucide-react";
import type { CandidateEvent } from "@/lib/types";
import { parseDateUtc } from "@/lib/datetime";

type Props = {
  events: CandidateEvent[];
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

export default function RecentActivityCard({ events }: Props) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="section-card motion-fade-up motion-delay-7 lg:col-span-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-violet-500" />
          <p className="text-sm font-semibold">Recent activity</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-800 hover:bg-white"
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
          <Link href="/activity" className="text-xs font-semibold text-slate-700 hover:underline">
            View all
          </Link>
        </div>
      </div>
      {collapsed ? (
        <div className="mt-3 rounded-xl border border-dashed border-white/70 bg-white/30 px-3 py-2 text-xs text-slate-600">
          Activity collapsed. Expand to view the latest updates.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {events.map((ev) => (
            <Link
              key={ev.event_id}
              href={`/candidates/${ev.candidate_id}`}
              className="flex items-center justify-between rounded-xl border border-white/60 bg-white/35 px-3 py-2 hover:bg-white/50"
            >
              <div>
                <p className="text-sm font-medium">{ev.action_type.split("_").join(" ")}</p>
                <p className="text-xs text-slate-600">
                  {(ev.candidate_name || ev.candidate_code) ? (
                    <>
                      {ev.candidate_name || "Candidate"}
                      {ev.candidate_code ? ` · ${ev.candidate_code}` : ""}
                    </>
                  ) : (
                    "Candidate activity"
                  )}
                  {ev.performed_by_name || ev.performed_by_email ? (
                    <span className="text-slate-400"> · {ev.performed_by_name || ev.performed_by_email}</span>
                  ) : null}
                </p>
              </div>
              <span className="text-xs text-slate-600">{formatDateTime(ev.created_at)}</span>
            </Link>
          ))}
          {events.length === 0 ? <p className="text-sm text-slate-600">No events yet.</p> : null}
        </div>
      )}
    </div>
  );
}
