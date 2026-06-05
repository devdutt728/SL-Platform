"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { pplGet } from "../_lib/client";
import type { PersonLookupItem, PersonLookupResponse } from "../_lib/types";

/**
 * Type-ahead picker over the shared people directory (dim_person).
 *
 * - Searches by name OR email as the user types.
 * - Picking a suggestion fills the email and (via onPick) the display name.
 * - Never blocks: a freely typed value that doesn't match the directory is
 *   allowed, and the caller can render a gentle "not in directory" warning
 *   using the `directoryMatch` callback / the exported useDirectoryMatch hook.
 */
export function PersonCombobox({
  value,
  onChange,
  onPick,
  placeholder = "Search name or email…",
  className = "",
  inputClassName = "",
}: {
  value: string;
  onChange: (email: string) => void;
  onPick: (person: PersonLookupItem) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PersonLookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Debounced lookup.
  useEffect(() => {
    if (!open) return;
    const q = value.trim();
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      pplGet<PersonLookupResponse>(`/people/lookup?q=${encodeURIComponent(q)}&limit=8`)
        .then((res) => {
          if (cancelled) return;
          setItems(res.items);
          setActive(0);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, open]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(person: PersonLookupItem) {
    onChange(person.email);
    onPick(person);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        className={inputClassName || "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[var(--brand-color)] focus:outline-none"}
      />
      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {loading && !items.length ? (
            <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>
          ) : items.length ? (
            items.map((p, i) => (
              <button
                key={p.email}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(p)}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left ${i === active ? "bg-slate-50" : ""}`}
              >
                <span className="text-sm font-medium text-slate-900">{p.name}</span>
                <span className="text-[11px] text-steel">
                  {p.email}
                  {p.team ? ` · ${p.team}` : ""}
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-slate-400">No directory match — value will be saved as typed.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Resolves whether an email currently corresponds to a directory person.
 * Returns `null` while unknown/loading, `true` if matched, `false` if not.
 * Used to render the gentle inline warning next to a combobox.
 */
export function useDirectoryMatch(email: string): boolean | null {
  const [match, setMatch] = useState<boolean | null>(null);
  const normalized = useMemo(() => email.trim().toLowerCase(), [email]);

  useEffect(() => {
    if (!normalized) {
      setMatch(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      pplGet<PersonLookupResponse>(`/people/lookup?q=${encodeURIComponent(normalized)}&limit=8`)
        .then((res) => {
          if (cancelled) return;
          setMatch(res.items.some((p) => p.email.trim().toLowerCase() === normalized));
        })
        .catch(() => {
          if (!cancelled) setMatch(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [normalized]);

  return match;
}

/** Small amber inline note for an unmatched (free-typed) holder/assignee. */
export function DirectoryWarning({ email }: { email: string }) {
  const match = useDirectoryMatch(email);
  if (!email.trim() || match !== false) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-600">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      Not found in directory — will be saved as typed.
    </p>
  );
}
