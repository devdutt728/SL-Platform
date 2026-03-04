"use client";

type Props = {
  open: boolean;
  title: string;
  html: string;
  onClose: () => void;
};

export function Candidate360HtmlPreviewModal({ open, title, html, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/30 bg-white shadow-2xl">
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
  );
}
