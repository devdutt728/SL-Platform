"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { createPortal } from "react-dom";

type ConfirmTone = "neutral" | "danger" | "success";

type InputConfig = {
  label: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  multiline?: boolean;
  initialValue?: string;
};

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  loading?: boolean;
  input?: InputConfig | null;
  error?: string | null;
  onConfirm: (value?: string) => void | Promise<void>;
  onClose: () => void;
};

function toneClass(tone: ConfirmTone) {
  if (tone === "danger") return "border-rose-600 bg-rose-600 text-white hover:bg-rose-700";
  if (tone === "success") return "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700";
  return "border-slate-900 bg-slate-900 text-white hover:bg-slate-800";
}

export function ActionDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "neutral",
  loading = false,
  input = null,
  error = null,
  onConfirm,
  onClose,
}: Props) {
  const [value, setValue] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setValue(input?.initialValue || "");
  }, [open, input?.initialValue]);

  if (!open || !mounted) return null;

  const required = Boolean(input?.required);
  const meetsLength = value.trim().length >= (input?.minLength || 0);
  const hasRequiredValue = !required || value.trim().length > 0;
  const canConfirm = !loading && hasRequiredValue && meetsLength;

  return createPortal(
    <div className="fixed inset-0 z-[360] overflow-y-auto bg-black/35 px-4 py-6" role="dialog" aria-modal="true">
      <div className="mx-auto flex min-h-full w-full max-w-lg items-center justify-center">
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.55)]">
          <p className="text-lg font-semibold text-slate-900">{title}</p>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}

          {input ? (
            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{input.label}</span>
              {input.multiline ? (
                <textarea
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={input.placeholder || ""}
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              ) : (
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={input.placeholder || ""}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              )}
            </label>
          ) : null}

          {error ? <p className="mt-2 text-xs font-medium text-rose-700">{error}</p> : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onClose}
              disabled={loading}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={clsx("rounded-lg border px-3 py-1.5 text-sm font-semibold transition", toneClass(tone))}
              onClick={() => void onConfirm(input ? value.trim() : undefined)}
              disabled={!canConfirm}
            >
              {loading ? "Working..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
