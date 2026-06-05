"use client";

import { motion } from "framer-motion";
import type { OrgPerson, OrgPrincipalNode } from "../_lib/org-types";
import { GroupCard } from "./GroupCard";

export function PrincipalSection({
  principal,
  editMode,
  movedEmps,
  index,
  onDragStart,
  onDrop,
  onView,
}: {
  principal: OrgPrincipalNode;
  editMode: boolean;
  movedEmps: Set<string>;
  index: number;
  onDragStart: (empNo: string) => void;
  onDrop: (groupKey: string) => void;
  onView: (person: OrgPerson) => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06 }}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="border-b border-slate-200 px-5 py-4" style={{ background: `linear-gradient(90deg, ${principal.color}14, #ffffff)` }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ backgroundColor: principal.color }}>
            {principal.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-slate-950">{principal.name}</h2>
            <p className="text-xs text-steel">
              Principal office · {principal.employee_count} {principal.employee_count === 1 ? "person" : "people"} · {principal.group_count} {principal.group_count === 1 ? "group" : "groups"}
            </p>
          </div>
          <span className="rounded-full border border-white/70 px-3 py-1 text-xs font-semibold text-white shadow-sm" style={{ backgroundColor: principal.color }}>
            Principal
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2 2xl:grid-cols-3">
        {principal.groups.map((g) => (
          <GroupCard
            key={g.key}
            group={g}
            editMode={editMode}
            movedEmps={movedEmps}
            onDragStart={onDragStart}
            onDrop={onDrop}
            onView={onView}
          />
        ))}
        {principal.groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">No groups under this principal yet.</p>
        ) : null}
      </div>
    </motion.section>
  );
}
