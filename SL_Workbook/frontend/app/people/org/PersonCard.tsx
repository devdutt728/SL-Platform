"use client";

import { motion } from "framer-motion";
import type { OrgPerson } from "../_lib/org-types";
import { initialsFrom } from "../_lib/format";

export function PersonCard({
  person,
  editMode,
  moved,
  isLead,
  onDragStart,
  onView,
}: {
  person: OrgPerson;
  editMode: boolean;
  moved?: boolean;
  isLead?: boolean;
  onDragStart: (empNo: string) => void;
  onView: (person: OrgPerson) => void;
}) {
  const color = person.designation_color || "#707A87";
  const exp = `${person.sl_exp_display}${person.o_exp_display && person.o_exp_display !== "—" ? ` · ${person.o_exp_display}` : ""}`;

  const body = (
    <motion.div
      layout
      draggable={editMode}
      onDragStart={(e) => {
        (e as unknown as DragEvent).dataTransfer?.setData("text/plain", person.employee_no);
        onDragStart(person.employee_no);
      }}
      animate={moved ? { boxShadow: ["0 0 0 0 rgba(36,76,102,0)", "0 0 0 3px rgba(36,76,102,0.35)", "0 0 0 0 rgba(36,76,102,0)"] } : {}}
      transition={moved ? { duration: 1.4, repeat: 2 } : { duration: 0.18 }}
      className={`group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg border bg-white px-2.5 py-2 ${
        isLead ? "border-slate-300 shadow-sm ring-1 ring-slate-100" : "border-slate-200"
      } ${editMode ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ backgroundColor: color }}
        title={person.designation_level || ""}
      >
        {initialsFrom(person.name, person.employee_no)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-medium text-slate-900">{person.name}</p>
          {isLead ? <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">Lead</span> : null}
        </div>
        <p className="truncate text-[11px] text-slate-500">{person.title || "No title"}</p>
        <p className="truncate text-[10px] text-slate-400">{person.designation_level || "Support"} · {person.employee_no}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[10px] font-medium text-slate-400">{exp}</span>
        {person.license_count > 0 ? (
          <span className="rounded-full bg-[var(--brand-color)]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--brand-color)]">
            {person.license_count} lic
          </span>
        ) : null}
      </div>
      {editMode ? <span className="shrink-0 text-slate-300 group-hover:text-slate-500">::</span> : null}
    </motion.div>
  );

  if (editMode) return body;
  return (
    <button type="button" onClick={() => onView(person)} className="block w-full text-left">
      {body}
    </button>
  );
}
