"use client";

import { useEffect, useState } from "react";
import type { VisibilityState } from "@tanstack/react-table";

/** Debounce a fast-changing value (search boxes, live previews). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Column-visibility state persisted to localStorage under `key`. Restores on
 * mount and writes on every change, so each tab remembers what a user hid.
 */
export function usePersistentColumns(
  key: string,
  initial: VisibilityState = {},
): [VisibilityState, React.Dispatch<React.SetStateAction<VisibilityState>>] {
  const [state, setState] = useState<VisibilityState>(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setState((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch {
      /* ignore malformed prefs */
    }
    // Restore once per key (on mount / key change).
  }, [key]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [key, state]);

  return [state, setState];
}
