"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { pplGet } from "../_lib/client";
import type { AuditLogResponse } from "../_lib/types";
import { titleCaseField } from "../_lib/format";

export function AuditSidebar({ employeeId, open, onClose }: { employeeId: string; open: boolean; onClose: () => void }) {
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    pplGet<AuditLogResponse>(`/employees/${employeeId}/audit_log?limit=100`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, employeeId]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/20"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.22 }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Change history</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="flex-1 overflow-auto px-5 py-4">
              {loading ? <p className="text-sm text-slate-400">Loading…</p> : null}
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              {data && data.items.length === 0 ? <p className="text-sm text-slate-400">No changes recorded yet.</p> : null}
              <ul className="space-y-3">
                {data?.items.map((it) => (
                  <li key={it.id} className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">{titleCaseField(it.field_name)}</span>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600">{it.section}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      <span className="text-slate-400 line-through">{it.old_value || "empty"}</span>
                      {" → "}
                      <span className="font-medium text-slate-800">{it.new_value || "empty"}</span>
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {new Date(it.performed_at).toLocaleString("en-IN")} · {it.performed_by_person_id}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
