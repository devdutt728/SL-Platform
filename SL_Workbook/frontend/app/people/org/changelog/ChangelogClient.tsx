"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { pplGet, pplPost } from "../../_lib/client";
import type { ChangeLogDetail, ChangeLogList } from "../../_lib/org-types";
import type { MeResponse as Me } from "../../_lib/types";

export function ChangelogClient() {
  const [list, setList] = useState<ChangeLogList | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, ChangeLogDetail>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => pplGet<ChangeLogList>("/org/changelog?limit=100").then(setList).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    pplGet<Me>("/auth/me").then(setMe).catch(() => {});
  }, []);

  const isAdmin = me?.access_level === "admin";

  async function toggle(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!detail[id]) {
      const d = await pplGet<ChangeLogDetail>(`/org/changelog/${id}`);
      setDetail((prev) => ({ ...prev, [id]: d }));
    }
  }

  return (
    <div className="max-w-3xl">
      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {list && list.items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          No published org changes yet.
        </div>
      ) : null}

      <ol className="relative space-y-4 border-l-2 border-slate-200 pl-6">
        {list?.items.map((item) => (
          <li key={item.id} className="relative">
            <span className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[var(--brand-color)]" />
            <div className="rounded-2xl border border-slate-200 bg-white">
              <button onClick={() => toggle(item.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${item.action === "revert" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {item.action}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{item.draft_name || "Org update"}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-steel">
                    {item.changes_count} change{item.changes_count === 1 ? "" : "s"} · {new Date(item.performed_at).toLocaleString("en-IN")} · {item.performed_by_person_id}
                  </p>
                </div>
                <span className="text-slate-400">{expanded === item.id ? "▲" : "▼"}</span>
              </button>

              <AnimatePresence>
                {expanded === item.id ? (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-slate-100">
                    <div className="p-4">
                      {detail[item.id] ? (
                        <>
                          <table className="w-full text-left text-xs">
                            <thead className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              <tr><th className="pb-2">Name</th><th className="pb-2">From</th><th className="pb-2">To</th></tr>
                            </thead>
                            <tbody>
                              {detail[item.id].diff_summary.map((m) => (
                                <tr key={m.empNo} className="border-t border-slate-50">
                                  <td className="py-1.5 font-medium text-slate-800">{m.name}</td>
                                  <td className="py-1.5 text-slate-500">{m.fromGroupKey || "—"}</td>
                                  <td className="py-1.5 text-slate-800">{m.toGroupKey}</td>
                                </tr>
                              ))}
                              {detail[item.id].diff_summary.length === 0 ? (
                                <tr><td colSpan={3} className="py-2 text-slate-400">No member moves in this entry.</td></tr>
                              ) : null}
                            </tbody>
                          </table>
                          {isAdmin ? (
                            <div className="mt-4 flex justify-end">
                              <button
                                disabled={busy === item.id}
                                onClick={async () => {
                                  if (!confirm("Revert the org chart to this snapshot? This creates a new change-log entry.")) return;
                                  setBusy(item.id);
                                  try { await pplPost(`/org/revert/${item.id}`, {}); await load(); setExpanded(null); }
                                  catch (e) { setError((e as Error).message); }
                                  finally { setBusy(null); }
                                }}
                                className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                              >
                                {busy === item.id ? "Reverting…" : "Revert to this state"}
                              </button>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-xs text-slate-400">Loading…</p>
                      )}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
