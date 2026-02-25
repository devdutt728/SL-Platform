"use client";

import { useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { clsx } from "clsx";
import { ContextPanel } from "@/components/context-panel";

type LiveActivityDockProps = {
  hidden?: boolean;
};

export function LiveActivityDock({ hidden = false }: LiveActivityDockProps) {
  const [open, setOpen] = useState(false);

  if (hidden) return null;

  return (
    <>
      {!open ? (
        <button
          type="button"
          aria-label="Open live activity"
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className="glass-panel fixed right-0 top-1/2 z-30 hidden -translate-y-1/2 rounded-r-none border-r-0 px-2 py-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--dim-grey)] md:flex"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        >
          <PanelRightOpen className="mb-2 h-4 w-4 rotate-180 text-[var(--brand-color)]" />
          Live activity
        </button>
      ) : null}

      <div
        className={clsx(
          "fixed right-4 top-4 bottom-4 z-30 hidden w-[min(22rem,calc(100vw-6.5rem))] transition-transform duration-300 ease-out md:block",
          open ? "translate-x-0" : "translate-x-[calc(100%+1rem)] pointer-events-none"
        )}
      >
        <div className="relative flex h-full flex-col">
          <button
            type="button"
            aria-label="Collapse live activity"
            aria-expanded={open}
            onClick={() => setOpen(false)}
            className="glass-panel absolute -left-10 top-1/2 z-40 -translate-y-1/2 rounded-l-xl rounded-r-none border-r-0 p-2 text-[var(--dim-grey)] hover:text-[var(--brand-color)]"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
          <div className="h-20 shrink-0" aria-hidden="true" />
          <ContextPanel className="flex-1 overflow-auto" />
        </div>
      </div>
    </>
  );
}
