"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { OrgGroupNode, OrgPerson } from "../_lib/org-types";
import { PersonCard } from "./PersonCard";

export function GroupCard({
  group,
  editMode,
  movedEmps,
  onDragStart,
  onDrop,
  onView,
}: {
  group: OrgGroupNode;
  editMode: boolean;
  movedEmps: Set<string>;
  onDragStart: (empNo: string) => void;
  onDrop: (groupKey: string) => void;
  onView: (person: OrgPerson) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const count = (group.lead ? 1 : 0) + group.members.length;
  const accent = group.color || "var(--brand-color)";

  return (
    <motion.div
      layout
      onDragOver={(e) => {
        if (!editMode) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!editMode) return;
        e.preventDefault();
        setDragOver(false);
        onDrop(group.key);
      }}
      className={`min-w-0 rounded-xl border bg-slate-50/60 transition ${
        dragOver ? "border-[var(--brand-color)] ring-2 ring-[var(--brand-color)]/30" : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between gap-3 rounded-t-xl border-b border-slate-200 bg-white px-3.5 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-6 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
            <h4 className="truncate text-sm font-semibold text-slate-950">{group.name}</h4>
          </div>
          <p className="mt-1 truncate pl-3.5 text-[11px] text-slate-500">
            Lead: {group.lead?.name || group.lead_name || "Not mapped"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold tabular-nums text-slate-900">{count}</p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">people</p>
        </div>
      </div>

      <div className="flex max-h-[520px] flex-col gap-2 overflow-y-auto p-2.5">
        {group.lead ? (
          <PersonCard person={group.lead} editMode={editMode} isLead moved={movedEmps.has(group.lead.employee_no)} onDragStart={onDragStart} onView={onView} />
        ) : null}
        {group.members.map((m) => (
          <PersonCard key={m.employee_no} person={m} editMode={editMode} moved={movedEmps.has(m.employee_no)} onDragStart={onDragStart} onView={onView} />
        ))}
        {count === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-[11px] text-slate-400">
            {editMode ? "Drop someone here" : "No members"}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
