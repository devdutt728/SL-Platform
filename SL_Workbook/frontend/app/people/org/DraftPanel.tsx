"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { pplGet } from "../_lib/client";
import type { DraftMove, DraftState } from "../_lib/org-types";

/**
 * Compact edit sidebar. Shows what you've changed, lets you preview, save a
 * named draft, and (admins) publish it live. Advanced bits (extra draft slots)
 * are tucked behind a disclosure so the default view stays simple.
 */
export function DraftPanel({
  pendingMoves,
  isAdmin,
  onSaveDraft,
  onPublish,
  onPreview,
  previewing,
}: {
  pendingMoves: DraftMove[];
  isAdmin: boolean;
  onSaveDraft: (slot: number, name: string) => Promise<void>;
  onPublish: (slot: number) => void;
  onPreview: () => void;
  previewing: boolean;
}) {
  const [slots, setSlots] = useState<DraftState[]>([]);
  const [busy, setBusy] = useState(false);
  // Inline draft-naming (replaces a native prompt()). When set, the rail shows a
  // name field for that slot instead of firing a blocking browser dialog.
  const [naming, setNaming] = useState<{ slot: number; name: string } | null>(null);

  const refresh = () => pplGet<DraftState[]>("/org/drafts").then(setSlots).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const count = pendingMoves.length;
  const hasChanges = count > 0;

  const beginSave = (slot: number) => {
    const s = slots.find((x) => x.slot_number === slot);
    setNaming({ slot, name: s?.draft_name || `Draft ${slot}` });
  };

  const confirmSave = async () => {
    if (!naming) return;
    const { slot, name } = naming;
    setBusy(true);
    try {
      await onSaveDraft(slot, name.trim() || `Draft ${slot}`);
      await refresh();
      setNaming(null);
    } finally {
      setBusy(false);
    }
  };

  const slot1 = slots.find((x) => x.slot_number === 1);

  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="ppl-surface sticky top-[5.5rem] w-[280px] shrink-0 space-y-3 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[rgb(var(--ink))]">Your changes</h3>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${hasChanges ? "bg-[var(--brand-color)] text-white" : "bg-[rgb(var(--mist))] text-[rgb(var(--steel))]"}`}>
          {count}
        </span>
      </div>

      {!hasChanges ? (
        <p className="rounded-xl bg-[rgb(var(--sand))]/60 px-3 py-3 text-[12px] leading-relaxed text-[rgb(var(--steel))]">
          Drag a person to another team — or use <b>Move to team</b> on their card. Changes show up here before they go live.
        </p>
      ) : (
        <>
          <div className="max-h-40 space-y-1.5 overflow-auto">
            {pendingMoves.map((m) => (
              <div key={m.empNo} className="rounded-lg bg-[rgb(var(--sand))]/60 px-2.5 py-1.5 text-[11px]">
                <p className="font-medium text-[rgb(var(--ink))]">{m.name}</p>
                <p className="text-[rgb(var(--steel))]">{m.fromGroupKey || "—"} → {m.toGroupKey}</p>
              </div>
            ))}
          </div>

          <button
            onClick={onPreview}
            className={`w-full rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              previewing ? "border-[var(--brand-color)] bg-[var(--brand-color)]/10 text-[var(--brand-color)]" : "border-[var(--border-soft)] text-[rgb(var(--ink))] hover:bg-[rgb(var(--mist))]"
            }`}
          >
            {previewing ? "Hide preview" : "Preview changes"}
          </button>

          {/* Primary actions */}
          <div className="space-y-2 border-t border-[var(--border-soft)] pt-3">
            {naming && naming.slot === 1 ? (
              <DraftNameField
                value={naming.name}
                busy={busy}
                onChange={(name) => setNaming({ slot: 1, name })}
                onCancel={() => setNaming(null)}
                onConfirm={confirmSave}
              />
            ) : (
              <button
                disabled={busy}
                onClick={() => beginSave(1)}
                className="ppl-btn ppl-btn--active w-full"
              >
                Save draft
              </button>
            )}
            {isAdmin ? (
              <button
                disabled={busy || !slot1 || slot1.status === "empty"}
                onClick={() => onPublish(1)}
                title={!slot1 || slot1.status === "empty" ? "Save a draft first" : "Make these changes live"}
                className="ppl-btn ppl-btn--primary w-full"
              >
                Publish live
              </button>
            ) : (
              <p className="text-center text-[10px] text-[rgb(var(--steel))]">An admin will publish your saved draft.</p>
            )}
          </div>
        </>
      )}

      {/* Advanced: extra named draft slots, hidden by default */}
      <details className="group border-t border-slate-100 pt-2 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-600">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="transition-transform group-open:rotate-90">
            <polyline points="9 6 15 12 9 18" />
          </svg>
          More draft slots
        </summary>
        <div className="mt-2 space-y-1.5">
          {[1, 2, 3].map((slot) => {
            const s = slots.find((x) => x.slot_number === slot);
            return (
              <div key={slot} className="rounded-lg border border-[var(--border-soft)] px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-[rgb(var(--ink))]">
                      Slot {slot}{s?.draft_name ? `: ${s.draft_name}` : ""}
                    </p>
                    <p className="text-[10px] text-[rgb(var(--steel))]">{s && s.status !== "empty" ? `${s.moves_count} moves` : "empty"}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      disabled={busy || !hasChanges}
                      onClick={() => beginSave(slot)}
                      className="rounded-md bg-[rgb(var(--ink))] px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-40"
                    >
                      Save
                    </button>
                    {isAdmin && s && s.status !== "empty" ? (
                      <button
                        disabled={busy}
                        onClick={() => onPublish(slot)}
                        className="rounded-md bg-[var(--brand-color)] px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-40"
                      >
                        Publish
                      </button>
                    ) : null}
                  </div>
                </div>
                {naming && naming.slot === slot ? (
                  <div className="mt-1.5">
                    <DraftNameField
                      value={naming.name}
                      busy={busy}
                      onChange={(name) => setNaming({ slot, name })}
                      onCancel={() => setNaming(null)}
                      onConfirm={confirmSave}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </details>
    </motion.aside>
  );
}

/** Inline name input for saving a draft — replaces a blocking prompt() dialog. */
function DraftNameField({
  value,
  busy,
  onChange,
  onCancel,
  onConfirm,
}: {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Name this draft"
        className="w-full rounded-lg border border-[var(--border-soft)] px-2.5 py-1.5 text-[12px] outline-none focus:border-[var(--brand-color)]"
      />
      <div className="flex gap-1.5">
        <button
          disabled={busy}
          onClick={onConfirm}
          className="ppl-btn ppl-btn--primary flex-1 !py-1.5 !text-[11px]"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          disabled={busy}
          onClick={onCancel}
          className="ppl-btn ppl-btn--ghost !py-1.5 !text-[11px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
