"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { OpeningPublicListItem } from "@/lib/types";

export function PublicOpeningsClient({ openings }: { openings: OpeningPublicListItem[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return openings;
    return openings.filter((o) => {
      const hay = `${o.opening_code} ${o.opening_title || ""} ${o.location_city || ""} ${o.location_country || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [openings, query]);

  return (
    <section className="rounded-[28px] border border-white/50 bg-white/70 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.14)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Search roles</p>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by code, title, or location"
              className="w-full rounded-2xl border border-slate-200/70 bg-white/90 px-16 py-3 text-sm text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.08)] outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Matches</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{filtered.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">All roles</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{openings.length}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {filtered.map((o) => {
          const location = [o.location_city, o.location_country].filter(Boolean).join(", ");
          return (
            <div
              key={o.opening_code}
              className="group relative overflow-hidden rounded-[22px] border border-slate-200/60 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.12)] transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_22px_50px_rgba(15,23,42,0.18)]"
            >
              <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.2),rgba(14,165,233,0))]" />
                <div className="absolute bottom-0 left-0 h-28 w-28 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.18),rgba(251,191,36,0))]" />
              </div>
              <div className="relative flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{o.opening_title || "Job opening"}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{o.opening_code}</p>
                  </div>
                  <span className="rounded-full border border-slate-200/70 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {location || "Remote / Global"}
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  Join Studio Lotus and work on projects that blend architecture, technology, and climate intelligence.
                </p>
                <div className="mt-auto flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Apply in 3 mins</span>
                  <Link
                    href={`/apply/${encodeURIComponent(o.opening_code)}`}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(15,23,42,0.25)] transition group-hover:translate-x-1"
                  >
                    Apply now
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white/80 p-10 text-center text-sm text-slate-500">
            No matching roles. Try a different title or location.
          </div>
        ) : null}
      </div>
    </section>
  );
}
