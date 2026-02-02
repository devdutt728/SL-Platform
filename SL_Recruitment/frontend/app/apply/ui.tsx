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
    <div className="section-card">
      <div className="grid items-stretch gap-4 lg:grid-cols-[1.2fr_0.4fr]">
        <label className="relative flex h-full">
          <span className="sr-only">Search roles</span>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">&gt;</span>
          <span className="pointer-events-none absolute inset-x-4 top-2 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by code, title, city..."
            className="h-14 w-full rounded-2xl border border-white/60 bg-white/60 pl-8 pr-4 text-sm text-slate-700 shadow-sm transition focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200"
          />
        </label>
        <div className="relative flex h-14 items-center justify-between gap-3 overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/40 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-cyan-400/20 blur-2xl" />
          <div className="absolute -left-8 bottom-4 h-12 w-12 rounded-full bg-emerald-400/20 blur-2xl" />
          <p className="relative text-xs font-semibold text-slate-500">Roles available</p>
          <div className="relative flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.75)]" />
            <p className="text-3xl font-semibold text-slate-800">{filtered.length}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        {filtered.map((o) => (
          <div
            key={o.opening_code}
            className="group relative overflow-hidden rounded-2xl border border-white/70 bg-white/60 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-white hover:bg-white/80"
          >
            <div className="absolute -right-10 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-500/10 blur-2xl transition group-hover:opacity-90" />
            <div className="absolute -left-8 -bottom-10 h-24 w-24 rounded-full bg-gradient-to-br from-emerald-400/20 to-amber-400/10 blur-2xl opacity-70 transition group-hover:opacity-90" />
            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{o.opening_code}</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{o.opening_title || "Job opening"}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {[o.location_city, o.location_country].filter(Boolean).join(", ") || "Remote-ready team"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-white/70 bg-white/60 px-3 py-1 text-xs font-semibold text-slate-600">
                  Impact role
                </span>
                <Link
                  href={`/apply/${encodeURIComponent(o.opening_code)}`}
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-slate-900 to-blue-800 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/15 transition group-hover:translate-x-1"
                >
                  Apply now
                </Link>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/60 bg-white/60 p-8 text-center text-sm text-slate-600">
            No matching roles. Try a different keyword.
          </div>
        ) : null}
      </div>
    </div>
  );
}
