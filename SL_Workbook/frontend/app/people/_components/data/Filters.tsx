"use client";

import { useMemo } from "react";

/**
 * Shared filter primitives for every People tab. One implementation, one look —
 * replaces the per-tab copies of FilterSelect / MultiTeamFilter / search boxes.
 */

/** Flex container that wraps filter controls into a calm, consistent row. */
export function FilterBar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}

/** Single-select dropdown. `labels` maps a raw option value to a friendly label. */
export function FilterSelect({
  value,
  onChange,
  label,
  options,
  labels,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: string[];
  labels?: Record<string, string>;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-[var(--brand-color)] focus:outline-none ${className}`}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] || option}
        </option>
      ))}
    </select>
  );
}

/** Debounced-friendly text search with a leading magnifier icon. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className = "w-60",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--steel))]"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[var(--brand-color)] focus:outline-none"
      />
    </div>
  );
}

export type SegmentOption = { value: string; label: string };

/** Pill-style segmented control — status filters, sub-tabs, view toggles. */
export function SegmentedControl({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly SegmentOption[];
  className?: string;
}) {
  return (
    <div className={`flex rounded-xl border border-slate-200 bg-white p-0.5 ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
            value === opt.value ? "bg-[var(--brand-color)] text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Checkbox-popover multi-select (generalised from Systems' MultiTeamFilter).
 * `noun` drives the summary text, e.g. "team" → "3 teams" / "All teams".
 */
export function MultiSelectFilter({
  selected,
  onChange,
  options,
  noun = "team",
  className = "",
}: {
  selected: string[];
  onChange: (value: string[]) => void;
  options: string[];
  noun?: string;
  className?: string;
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const label = selected.length
    ? `${selected.length} ${noun}${selected.length === 1 ? "" : "s"}`
    : `All ${noun}s`;

  function toggle(item: string) {
    if (selectedSet.has(item)) {
      onChange(selected.filter((v) => v !== item));
      return;
    }
    onChange([...selected, item]);
  }

  return (
    <details className={`relative ${className}`}>
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
        <span>{label}</span>
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="ml-auto text-slate-400">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="absolute left-0 z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <button type="button" onClick={() => onChange(options)} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Select all
          </button>
          <button type="button" onClick={() => onChange([])} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Clear
          </button>
        </div>
        {selected.length ? (
          <div className="mb-2 flex max-h-20 flex-wrap gap-1 overflow-auto">
            {selected.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => toggle(item)}
                className="rounded-full border border-[var(--brand-color)]/20 bg-[var(--brand-color)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--brand-color)]"
              >
                {item} ✕
              </button>
            ))}
          </div>
        ) : null}
        <div className="max-h-72 overflow-auto">
          {options.map((item) => (
            <label key={item} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
              <input type="checkbox" checked={selectedSet.has(item)} onChange={() => toggle(item)} />
              <span className="min-w-0 truncate">{item}</span>
            </label>
          ))}
          {!options.length ? <div className="px-2 py-4 text-center text-xs text-slate-400">No {noun}s available.</div> : null}
        </div>
      </div>
    </details>
  );
}

/** Small "Reset filters" button — rendered only when there is something to reset. */
export function ResetFiltersButton({ show, onReset }: { show: boolean; onReset: () => void }) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onReset}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
    >
      Reset filters
    </button>
  );
}
