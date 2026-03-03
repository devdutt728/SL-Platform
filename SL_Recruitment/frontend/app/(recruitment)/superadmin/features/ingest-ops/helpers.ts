export function toLocal(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtHours(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}h`;
}
