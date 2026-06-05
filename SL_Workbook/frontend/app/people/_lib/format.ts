export function initialsFrom(name: string | null | undefined, fallback: string): string {
  const cleaned = (name || "").trim();
  if (!cleaned) return fallback.slice(0, 2).toUpperCase();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export const STATUS_STYLES: Record<string, string> = {
  working: "bg-emerald-50 text-emerald-700 border-emerald-200",
  relieved: "bg-slate-100 text-slate-600 border-slate-200",
  terminated: "bg-red-50 text-red-700 border-red-200",
};

export function titleCaseField(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
