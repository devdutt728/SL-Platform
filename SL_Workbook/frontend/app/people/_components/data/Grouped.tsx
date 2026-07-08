"use client";

import { useState } from "react";

/**
 * Group an array by a string key. Rows whose key resolves empty are bucketed
 * under `emptyLabel`. Returns entries sorted alphabetically, with the empty
 * bucket pushed to the end.
 */
export function groupBy<T>(
  rows: T[],
  keyFn: (row: T) => string | null | undefined,
  emptyLabel = "Unassigned",
): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const raw = keyFn(row);
    const key = raw && String(raw).trim() ? String(raw).trim() : emptyLabel;
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return Array.from(map.entries()).sort(([a], [b]) => {
    if (a === emptyLabel) return 1;
    if (b === emptyLabel) return -1;
    return a.localeCompare(b);
  });
}

/**
 * Collapsible group section with a consistent header: title, count chip, an
 * optional accent stripe, and a slot for per-group summary metrics.
 */
export function CollapsibleGroup({
  title,
  count,
  countNoun = "item",
  accent,
  meta,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  children,
}: {
  title: string;
  count: number;
  countNoun?: string;
  accent?: string | null;
  meta?: React.ReactNode;
  defaultOpen?: boolean;
  /** Pass to control open/closed externally, e.g. from an Expand all / Collapse all toggle. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = openProp ?? internalOpen;
  const toggle = () => (onOpenChange ? onOpenChange(!open) : setInternalOpen((v) => !v));
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-left hover:bg-slate-100/70"
      >
        <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent || "var(--brand-color)" }} />
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          className={`shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        {meta ? <div className="hidden shrink-0 items-center gap-3 sm:flex">{meta}</div> : null}
        <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
          {count} {countNoun}
          {count === 1 ? "" : "s"}
        </span>
      </button>
      {open ? <div>{children}</div> : null}
    </section>
  );
}

/** Tiny label/value pill for a group header's summary metrics. */
export function GroupMetaStat({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "good" | "warn" | "risk" }) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "risk"
          ? "text-red-700"
          : "text-slate-700";
  return (
    <div className="text-right">
      <p className={`text-sm font-semibold leading-none ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
