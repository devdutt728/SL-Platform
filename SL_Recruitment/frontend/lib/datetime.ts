export function parseDateUtc(raw?: string | null): Date | null {
  if (!raw) return null;
  const hasZone = /[zZ]$|[+\-]\d{2}:\d{2}$/.test(raw);
  const normalized = raw.includes(" ") ? raw.replace(" ", "T") : raw;
  return new Date(hasZone ? normalized : `${normalized}Z`);
}
