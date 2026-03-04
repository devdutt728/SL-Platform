"use client";

import { clsx } from "clsx";

export function Chip({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", className)}>{children}</span>;
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
      <p className="text-xs uppercase tracking-tight text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
