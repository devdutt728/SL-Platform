"use client";

export type StatTone = "neutral" | "good" | "warn" | "risk";

export type StatItem = {
  label: string;
  value: string | number;
  detail?: string;
  tone?: StatTone;
  onClick?: () => void;
  active?: boolean;
};

const BORDER: Record<StatTone, string> = {
  neutral: "border-slate-200",
  good: "border-emerald-200",
  warn: "border-amber-200",
  risk: "border-red-200",
};

const VALUE: Record<StatTone, string> = {
  neutral: "text-slate-900",
  good: "text-emerald-700",
  warn: "text-amber-700",
  risk: "text-red-700",
};

/**
 * Executive metric band shared across tabs. `cols` controls the xl column count
 * so a 5-metric band and a 6-metric band both stay tidy.
 */
export function StatBand({ items, cols = 6 }: { items: StatItem[]; cols?: 4 | 5 | 6 }) {
  const colClass = cols === 4 ? "xl:grid-cols-4" : cols === 5 ? "xl:grid-cols-5" : "xl:grid-cols-6";
  return (
    <section className={`grid gap-3 sm:grid-cols-2 md:grid-cols-3 ${colClass}`}>
      {items.map((item) => {
        const tone = item.tone || "neutral";
        const cardClass = `rounded-2xl border bg-white p-4 text-left ${BORDER[tone]} ${
          item.onClick ? "cursor-pointer transition hover:border-[var(--brand-color)] hover:shadow-sm" : ""
        } ${item.active ? "ring-2 ring-[var(--brand-color)]" : ""}`;
        const content = (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--steel))]">{item.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${VALUE[tone]}`}>{item.value}</p>
            {item.detail ? <p className="mt-1 text-xs text-[rgb(var(--steel))]">{item.detail}</p> : null}
          </>
        );
        return item.onClick ? (
          <button key={item.label} type="button" onClick={item.onClick} className={cardClass}>
            {content}
          </button>
        ) : (
          <div key={item.label} className={cardClass}>
            {content}
          </div>
        );
      })}
    </section>
  );
}
