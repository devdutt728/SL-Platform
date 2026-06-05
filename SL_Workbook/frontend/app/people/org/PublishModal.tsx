"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { DraftMove } from "../_lib/org-types";

export function PublishModal({
  slot,
  moves,
  onConfirm,
  onClose,
}: {
  slot: number | null;
  moves: DraftMove[];
  onConfirm: (slot: number) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <AnimatePresence>
      {slot !== null ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
          >
            <h3 className="text-lg font-semibold text-slate-900">Publish org changes</h3>
            <p className="mt-1 text-sm text-steel">
              {moves.length} move{moves.length === 1 ? "" : "s"} from draft slot {slot} will be written to the live org chart and recorded in the change log.
            </p>

            <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">From</th><th className="px-3 py-2">To</th></tr>
                </thead>
                <tbody>
                  {moves.map((m) => (
                    <tr key={m.empNo} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 font-medium text-slate-800">{m.name}</td>
                      <td className="px-3 py-1.5 text-slate-500">{m.fromGroupKey || "—"}</td>
                      <td className="px-3 py-1.5 text-slate-800">{m.toGroupKey}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {err ? <p className="mt-3 text-xs text-red-600">{err}</p> : null}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button
                onClick={async () => {
                  setBusy(true); setErr(null);
                  try { await onConfirm(slot); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
                }}
                disabled={busy}
                className="rounded-xl bg-[var(--brand-color)] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#cf380f] disabled:opacity-60"
              >
                {busy ? "Publishing…" : "Confirm publish"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
