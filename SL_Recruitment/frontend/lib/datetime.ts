const IST_OFFSET_MINUTES = 5 * 60 + 30;

function parseNaiveAsIst(raw: string): Date | null {
  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?)?$/,
  );
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText = "00", minuteText = "00", secondText = "00", msText = "0"] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(msText.padEnd(3, "0").slice(0, 3));

  if ([year, month, day, hour, minute, second, millisecond].some((part) => Number.isNaN(part))) return null;

  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs);
}

export function parseDateUtc(raw?: string | null): Date | null {
  if (!raw) return null;

  const normalized = raw.includes(" ") ? raw.replace(" ", "T") : raw;
  const hasZone = /[zZ]$|[+\-]\d{2}:\d{2}$/.test(normalized);
  if (hasZone) return new Date(normalized);

  const naiveIstDate = parseNaiveAsIst(normalized);
  if (naiveIstDate) return naiveIstDate;

  return new Date(normalized);
}
