"use client";

import { useEffect, useMemo, useState } from "react";
import type { CandidateEvent } from "@/lib/types";

type Props = {
  initialLimit?: number;
};

function formatDateTime(raw?: string | null) {
  if (!raw) return "";
  const d = new Date(raw);
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

export function ActivityClient({ initialLimit = 25 }: Props) {
  const [events, setEvents] = useState<CandidateEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"all" | "user" | "system">("all");
  const [personFilter, setPersonFilter] = useState("");

  const loadPage = async (offset: number) => {
    const res = await fetch(`/api/rec/events?limit=${initialLimit}&offset=${offset}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const data = (await res.json()) as CandidateEvent[];
    return data;
  };

  const loadInitial = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadPage(0);
      setEvents(data);
      setHasMore(data.length === initialLimit);
    } catch (err: any) {
      setError(err?.message || "Could not load activity.");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await loadPage(events.length);
      setEvents((prev) => [...prev, ...data]);
      setHasMore(data.length === initialLimit);
    } catch (err: any) {
      setError(err?.message || "Could not load more activity.");
    } finally {
      setLoadingMore(false);
    }
  };

  const loadAll = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const collected = [...events];
      let offset = collected.length;
      while (true) {
        const data = await loadPage(offset);
        if (data.length === 0) break;
        collected.push(...data);
        offset = collected.length;
        if (data.length < initialLimit) break;
      }
      setEvents(collected);
      setHasMore(false);
    } catch (err: any) {
      setError(err?.message || "Could not load all activity.");
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void loadInitial();
  }, []);

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
        await loadInitial();
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

  const filteredItems = useMemo(() => {
    const q = personFilter.trim().toLowerCase();
    return events.filter((event) => {
      const hasActor = !!(event.performed_by_name || event.performed_by_email || event.performed_by_person_id_platform);
      if (sourceFilter === "system" && hasActor) return false;
      if (sourceFilter === "user" && !hasActor) return false;
      if (!q) return true;
      const actor = `${event.performed_by_name || ""} ${event.performed_by_email || ""} ${event.performed_by_person_id_platform || ""}`.toLowerCase();
      return actor.includes(q);
    });
  }, [events, sourceFilter, personFilter]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-tight text-slate-500">Recent activity</p>
          <h1 className="text-2xl font-semibold">All activity</h1>
          <p className="text-xs text-slate-500">
            Showing {filteredItems.length} of {events.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-white"
            onClick={() => void loadAll()}
            disabled={loadingMore || !hasMore}
          >
            {loadingMore ? "Loading..." : "Load all"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/60 bg-white/50 px-3 py-2">
        <div className="text-xs font-semibold text-slate-500">Filters</div>
        <select
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as "all" | "user" | "system")}
        >
          <option value="all">All activity</option>
          <option value="user">User activity</option>
          <option value="system">System only</option>
        </select>
        <input
          className="w-56 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
          placeholder="Filter by person name/email"
          value={personFilter}
          onChange={(e) => setPersonFilter(e.target.value)}
        />
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="space-y-2">
        {loading ? <p className="text-sm text-slate-600">Loading activity...</p> : null}
        {!loading && filteredItems.length === 0 ? <p className="text-sm text-slate-600">No activity yet.</p> : null}
        {filteredItems.map((ev) => (
          <div key={ev.event_id} className="rounded-xl border border-white/60 bg-white/35 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{prettifyAction(ev.action_type)}</p>
                <p className="text-xs text-slate-600">
                  {(ev.candidate_name || ev.candidate_code) ? (
                    <>
                      {ev.candidate_name || "Candidate"}
                      {ev.candidate_code ? ` - ${ev.candidate_code}` : ""}
                    </>
                  ) : (
                    "Candidate activity"
                  )}
                  {ev.performed_by_name || ev.performed_by_email ? (
                    <span className="text-slate-400"> - by {ev.performed_by_name || ev.performed_by_email}</span>
                  ) : null}
                </p>
              </div>
              <span className="text-xs text-slate-500">{formatDateTime(ev.created_at)}</span>
            </div>
          </div>
        ))}
      </div>

      {hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-white"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
