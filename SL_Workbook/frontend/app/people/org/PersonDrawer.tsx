"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { OrgPerson } from "../_lib/org-types";
import { initialsFrom } from "../_lib/format";

export function PersonDrawer({ person, onClose }: { person: OrgPerson | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {person ? (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween", duration: 0.22 }}
          >
            <div className="flex items-start gap-3 border-b border-slate-100 p-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white" style={{ backgroundColor: person.designation_color || "#707A87" }}>
                {initialsFrom(person.name, person.employee_no)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-semibold text-slate-900">{person.name}</h3>
                <p className="text-sm text-steel">{person.title || "—"}</p>
                <p className="text-xs text-slate-400">{person.employee_no}</p>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="flex-1 space-y-3 overflow-auto p-5 text-sm">
              <Row label="Designation" value={person.designation_level} />
              <Row label="Group" value={`${person.principal} · ${person.group_name}`} />
              <Row label="Email" value={person.email} />
              <Row label="SL Experience" value={person.sl_exp_display} />
              <Row label="Overall Experience" value={person.o_exp_display} />
              <Row label="Licenses" value={String(person.license_count)} />
              {person.manager_override_emp ? <Row label="Manager Override" value={person.manager_override_emp} /> : null}
              {person.source_manager_emp ? <Row label="HR Manager" value={person.source_manager_emp} /> : null}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-50 pb-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-right text-sm text-slate-800">{value || "—"}</span>
    </div>
  );
}
