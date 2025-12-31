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
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by code, title, city…"
          className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2 text-sm md:max-w-sm"
        />
        <p className="text-sm text-[var(--text-secondary)]">{filtered.length} roles</p>
      </div>

      <div className="mt-4 divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-white/40">
        {filtered.map((o) => (
          <div key={o.opening_code} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold">{o.opening_title || "Job opening"}</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {o.opening_code}
                {o.location_city || o.location_country ? ` • ${[o.location_city, o.location_country].filter(Boolean).join(", ")}` : ""}
              </p>
            </div>
            <Link
              href={`/apply/${encodeURIComponent(o.opening_code)}`}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-card hover:bg-blue-700"
            >
              Apply
            </Link>
          </div>
        ))}
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--text-secondary)]">No matching roles.</div>
        ) : null}
      </div>
    </div>
  );
}

