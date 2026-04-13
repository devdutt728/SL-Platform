const IT_TEXT_PATTERNS = [
  /\binformation\s+technology\b/i,
  /\bit\s+support\b/i,
  /\bit\s+help\s*desk\b/i,
  /\bit\s+helpdesk\b/i,
  /(?:^|[\s(/,.-])it(?:$|[\s)/,.-])/i,
];

const IT_EMAIL_PATTERNS = [/\bitsupport\b/i, /\bithelpdesk\b/i, /\bit_support\b/i];

const SIGNAL_KEYS = new Set([
  "title",
  "opening_title",
  "designation_title",
  "department",
  "sub_department",
  "business_unit",
  "job_title",
  "secondary_job_title",
  "role_name",
  "role_names",
  "candidate_email",
  "email",
  "requested_by_email",
  "interviewer_email",
]);

const CONTAINER_KEYS = new Set(["items", "rows", "meta_json", "duplicate_panel", "row"]);

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s.-]+/g, "_");
}

function matchesItText(value: string) {
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact) return false;
  return IT_TEXT_PATTERNS.some((pattern) => pattern.test(compact));
}

function matchesItEmail(value: string) {
  const compact = value.trim().toLowerCase();
  if (!compact) return false;
  return IT_EMAIL_PATTERNS.some((pattern) => pattern.test(compact));
}

function keyShouldBeScanned(key: string) {
  const normalized = normalizeKey(key);
  return SIGNAL_KEYS.has(normalized) || normalized.endsWith("_title");
}

function valueHasItSignal(key: string, value: unknown, seen: WeakSet<object>): boolean {
  if (typeof value === "string") {
    const normalizedKey = normalizeKey(key);
    if (normalizedKey.endsWith("email")) {
      return matchesItEmail(value) || matchesItText(value);
    }
    return matchesItText(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => valueHasItSignal(key, item, seen));
  }
  if (value && typeof value === "object") {
    return objectHasItSignal(value, seen);
  }
  return false;
}

function objectHasItSignal(value: unknown, seen: WeakSet<object>): boolean {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => objectHasItSignal(item, seen));
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (keyShouldBeScanned(key) && valueHasItSignal(key, entry, seen)) {
      return true;
    }
    if (CONTAINER_KEYS.has(normalizeKey(key)) && objectHasItSignal(entry, seen)) {
      return true;
    }
  }
  return false;
}

export function isHiddenItRecord(record: unknown) {
  return objectHasItSignal(record, new WeakSet<object>());
}

export function filterVisibleRecords<T>(items: readonly T[] | null | undefined) {
  if (!Array.isArray(items)) return [] as T[];
  return items.filter((item) => !isHiddenItRecord(item));
}

export function visibleRecordOrNull<T>(item: T | null | undefined) {
  if (item == null) return null;
  return isHiddenItRecord(item) ? null : item;
}
