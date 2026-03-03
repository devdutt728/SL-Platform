export type StateFilter = "created" | "duplicate" | "retrying" | "failed_permanent" | "failed_transient" | "all";

export const STATUS_TONE: Record<StateFilter, string> = {
  all: "bg-slate-100 text-slate-700",
  created: "bg-emerald-100 text-emerald-800",
  duplicate: "bg-blue-100 text-blue-800",
  retrying: "bg-amber-100 text-amber-800",
  failed_permanent: "bg-rose-100 text-rose-800",
  failed_transient: "bg-orange-100 text-orange-800",
};

export const STATE_FILTER_OPTIONS: Array<{ value: StateFilter; label: string }> = [
  { value: "all", label: "All status" },
  { value: "created", label: "Created" },
  { value: "duplicate", label: "Duplicate" },
  { value: "retrying", label: "Retrying" },
  { value: "failed_permanent", label: "Failed permanent" },
  { value: "failed_transient", label: "Failed transient" },
];
