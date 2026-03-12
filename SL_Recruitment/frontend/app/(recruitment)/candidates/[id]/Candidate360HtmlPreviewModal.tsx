"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title: string;
  html: string;
  onClose: () => void;
};

export function Candidate360HtmlPreviewModal({ open, title, html, onClose }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4">
      <div className="mx-auto flex min-h-full w-full max-w-4xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-2xl border border-white/30 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">{title}</p>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              onClick={onClose}
            >
              Close
            </button>
          </div>
          <iframe title={title} className="h-[70vh] w-full bg-white" srcDoc={html} />
        </div>
      </div>
    </div>,
    document.body
  );
}
