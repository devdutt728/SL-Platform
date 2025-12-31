import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  OPEN: "bg-lotus/10 text-lotus",
  TRIAGED: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-leaf/10 text-leaf",
  WAITING_ON_USER: "bg-slate-200 text-slate-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-ink/10 text-ink",
  REOPENED: "bg-orange-100 text-orange-700",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        statusStyles[status] || "bg-black/5 text-ink"
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
