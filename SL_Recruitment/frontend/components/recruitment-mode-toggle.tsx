"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";

type RecruitmentUxMode = "classic" | "warm_executive";

const STORAGE_KEY = "sl_rec_ux_mode_v1";

function applyMode(mode: RecruitmentUxMode) {
  const root = document.documentElement;
  root.classList.remove("rec-theme-classic", "rec-theme-warm-executive");
  root.classList.add(mode === "warm_executive" ? "rec-theme-warm-executive" : "rec-theme-classic");
}

export function RecruitmentModeToggle() {
  const [mode, setMode] = useState<RecruitmentUxMode>("warm_executive");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const next = saved === "classic" || saved === "warm_executive" ? saved : "warm_executive";
    setMode(next);
    applyMode(next);
  }, []);

  function changeMode(next: RecruitmentUxMode) {
    setMode(next);
    applyMode(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <div className="hidden items-center gap-1 rounded-full border border-[var(--accessible-components--dark-grey)] bg-white/75 p-1 lg:inline-flex">
      <button
        type="button"
        onClick={() => changeMode("classic")}
        className={clsx(
          "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
          mode === "classic" ? "bg-[var(--dim-grey)] text-white" : "text-[var(--dim-grey)] hover:bg-[var(--surface-card)]"
        )}
        title="Revert to previous classic look"
      >
        Classic
      </button>
      <button
        type="button"
        onClick={() => changeMode("warm_executive")}
        className={clsx(
          "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
          mode === "warm_executive"
            ? "bg-[rgba(231,64,17,0.9)] text-white"
            : "text-[var(--dim-grey)] hover:bg-[var(--surface-card)]"
        )}
        title="Warm Executive redesign"
      >
        Warm
      </button>
    </div>
  );
}
