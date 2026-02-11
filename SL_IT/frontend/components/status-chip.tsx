import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  OPEN: "bg-lotus/10 text-lotus",
  TRIAGED: "bg-slate-200 text-slate-700",
  IN_PROGRESS: "bg-leaf/10 text-leaf",
  WAITING_ON_USER: "bg-slate-200 text-slate-700",
  RESOLVED: "bg-leaf/10 text-leaf",
  CLOSED: "bg-slate-300 text-slate-700",
  REOPENED: "bg-lotus/14 text-lotus",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        statusStyles[status] || "bg-slate-200 text-slate-700"
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
