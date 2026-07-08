"use client";

import { useEffect, useState } from "react";

export type SavedView<T> = { name: string; values: T };

function readViews<T>(storageKey: string): SavedView<T>[] {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as SavedView<T>[]) : [];
  } catch {
    return [];
  }
}

/** Named filter presets persisted to localStorage, scoped per tab via `storageKey`. */
export function useSavedViews<T>(storageKey: string) {
  const [views, setViews] = useState<SavedView<T>[]>([]);

  useEffect(() => {
    setViews(readViews<T>(storageKey));
  }, [storageKey]);

  function persist(next: SavedView<T>[]) {
    setViews(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }

  function save(name: string, values: T) {
    const trimmed = name.trim();
    if (!trimmed) return;
    persist([...views.filter((v) => v.name !== trimmed), { name: trimmed, values }]);
  }

  function remove(name: string) {
    persist(views.filter((v) => v.name !== name));
  }

  return { views, save, remove };
}

/**
 * Save/apply/remove named filter presets for the current tab. `currentValues`
 * is a plain object snapshot of every filter the tab wants to persist together
 * (search text, dropdown selections, view mode, etc). `onApply` receives a
 * saved snapshot and is responsible for pushing each field back into state.
 */
export function SavedViewsMenu<T extends Record<string, unknown>>({
  storageKey,
  currentValues,
  onApply,
}: {
  storageKey: string;
  currentValues: T;
  onApply: (values: T) => void;
}) {
  const { views, save, remove } = useSavedViews<T>(storageKey);
  const [name, setName] = useState("");

  return (
    <details className="relative">
      <summary className="ppl-btn ppl-btn--ghost cursor-pointer list-none">
        Views{views.length ? ` (${views.length})` : ""}
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
        <div className="mb-2 flex gap-1 border-b border-slate-100 pb-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Save current filters as…"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => {
              save(name, currentValues);
              setName("");
            }}
            disabled={!name.trim()}
            className="rounded-lg bg-[var(--brand-color)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
        <div className="max-h-56 overflow-auto">
          {views.map((v) => (
            <div key={v.name} className="flex items-center gap-1 rounded-lg py-0.5 hover:bg-slate-50">
              <button
                type="button"
                onClick={() => onApply(v.values)}
                className="flex-1 truncate rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-700"
              >
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => remove(v.name)}
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          ))}
          {!views.length ? <p className="px-2 py-4 text-center text-xs text-slate-400">No saved views yet.</p> : null}
        </div>
      </div>
    </details>
  );
}
