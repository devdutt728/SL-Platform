"use client";

/**
 * Shared IMS design-system primitives. One system → consistent, calm, "wow".
 * Every IMS surface (workspace flows + analytics) is built from these.
 */
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import QRCode from "qrcode";

import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { PersonRef } from "@/lib/types";

// ── formatters ────────────────────────────────────────────────────────────────
export function money(value?: number | string | null, currency = "INR") {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── status / semantic badge ───────────────────────────────────────────────────
const TONES: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  // asset lifecycle
  IN_STOCK: "emerald", RESERVED: "amber", ASSIGNED: "blue", IN_REPAIR: "orange", RETIRED: "slate", LOST: "red",
  // repair
  SENT: "amber", IN_PROGRESS: "blue", RETURNED: "emerald", CANCELLED: "slate",
  // warranty
  IN_WARRANTY: "emerald", EXPIRING_SOON: "amber", EXPIRED: "red",
  // condition
  NEW: "emerald", GOOD: "green", FAIR: "amber", POOR: "orange", DAMAGED: "red",
  // generic signals
  OK: "emerald", LOW: "red", HIGH: "red", MEDIUM: "amber", ACTIVE: "emerald",
};

export function StatusBadge({ value, tone }: { value?: string | null; tone?: keyof typeof TONES }) {
  if (!value) return <span className="text-steel">—</span>;
  const key = String(value).toUpperCase();
  const t = tone || STATUS_TONE[key] || "slate";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1", TONES[t])}>
      {String(value).replace(/_/g, " ")}
    </span>
  );
}

// ── page header ───────────────────────────────────────────────────────────────
export function PageHeader({
  icon: Icon, title, subtitle, actions,
}: { icon: any; title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/15">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {subtitle ? <p className="text-sm text-steel">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ── KPI tile ──────────────────────────────────────────────────────────────────
export function KpiTile({
  label, value, icon: Icon, tone = "slate", sub,
}: { label: string; value: React.ReactNode; icon?: any; tone?: keyof typeof TONES; sub?: React.ReactNode }) {
  return (
    <div className="section-card !p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-steel">{label}</p>
        {Icon ? <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg ring-1", TONES[tone])}><Icon className="h-3.5 w-3.5" /></span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-steel">{sub}</p> : null}
    </div>
  );
}

// ── data table ────────────────────────────────────────────────────────────────
export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  className?: string;
  render?: (row: T) => React.ReactNode;
};

export function DataTable<T>({
  columns, rows, keyField, onRowClick, empty, minWidth = 720,
}: {
  columns: Column<T>[];
  rows: T[];
  keyField: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            {columns.map((c) => (
              <th key={c.key} className={cn("px-3 pb-2 font-semibold", c.align === "right" && "text-right", c.align === "center" && "text-center")}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-steel">{empty || "Nothing here yet."}</td></tr>
          ) : (
            rows.map((row) => (
              <tr
                key={keyField(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn("border-b border-slate-100 last:border-0", onRowClick && "cursor-pointer hover:bg-slate-50/70")}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2.5 align-middle text-slate-700", c.align === "right" && "text-right tabular-nums", c.align === "center" && "text-center", c.className)}>
                    {c.render ? c.render(row) : (row as any)[c.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, hint, action }: { icon?: any; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {Icon ? <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Icon className="h-6 w-6" /></span> : null}
      <p className="font-semibold text-ink">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-steel">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

// ── form controls ─────────────────────────────────────────────────────────────
const controlCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";

export function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}{required ? <span className="text-brand"> *</span> : null}
      </span>
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-1 block text-xs text-steel">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlCls, props.className)} />;
}
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(controlCls, props.className)} />;
}
export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={cn(controlCls, "appearance-none pr-9", props.className)} />
      <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
    </div>
  );
}

// ── banner (inline feedback) ──────────────────────────────────────────────────
export function Banner({ tone = "info", children, onClose }: { tone?: "success" | "error" | "info"; children: React.ReactNode; onClose?: () => void }) {
  const cls = tone === "success" ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
    : tone === "error" ? "bg-red-50 text-red-700 ring-red-200"
    : "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <div className={cn("flex items-start justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-medium ring-1", cls)}>
      <span>{children}</span>
      {onClose ? <button onClick={onClose} aria-label="Dismiss"><X className="h-4 w-4 opacity-60 hover:opacity-100" /></button> : null}
    </div>
  );
}

// ── modal ─────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = "max-w-lg" }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[8vh] backdrop-blur-sm" onClick={onClose}>
      <div className={cn("w-full rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5", width)} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── person picker (employee typeahead → /ims/people/search) ───────────────────
export function PersonPicker({
  value, onChange, placeholder = "Search employee by name or email",
}: { value?: PersonRef | null; onChange: (person: PersonRef | null) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PersonRef[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!q.trim() || q.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      apiFetch<PersonRef[]>(`/ims/people/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]));
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
        <span className="min-w-0 truncate"><span className="font-semibold text-ink">{value.full_name || value.email}</span>{value.email ? <span className="text-steel"> · {value.email}</span> : null}</span>
        <button type="button" onClick={() => { onChange(null); setQ(""); }} className="ml-2 shrink-0 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={cn(controlCls, "pl-9")}
      />
      {open && results.length > 0 ? (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {results.map((p) => (
            <button
              type="button"
              key={p.person_id || p.email}
              onClick={() => { onChange(p); setOpen(false); setResults([]); }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-ink">{p.full_name || p.email}</span>
              {p.email ? <span className="block text-xs text-steel">{p.email}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── mini bar (for analytics panels) ───────────────────────────────────────────
export function MiniBar({ label, value, max, isMoney }: { label: string; value: number; max: number; isMoney?: boolean }) {
  const width = Math.max(3, Math.min(100, (Number(value || 0) / (max || 1)) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-ink">{label.replace(/_/g, " ")}</span>
        <span className="tabular-nums text-steel">{isMoney ? money(value) : value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-gradient-to-r from-brand to-[#f0703f]" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

// ── QR code (client-rendered, no external service) ────────────────────────────
export function QrCode({ value, size = 96, className }: { value: string; size?: number; className?: string }) {
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSvg("");
      return;
    }
    QRCode.toString(value, { type: "svg", margin: 0, color: { dark: "#1c1917", light: "#ffffff" } })
      .then((s) => !cancelled && setSvg(s))
      .catch(() => !cancelled && setSvg(""));
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!svg) {
    return <div className={cn("flex items-center justify-center rounded-lg bg-slate-100", className)} style={{ width: size, height: size }} />;
  }
  return (
    <div
      className={cn("[&_svg]:h-full [&_svg]:w-full", className)}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="section-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-steel">{title}</h2>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
