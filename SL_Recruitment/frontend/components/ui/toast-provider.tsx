"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from "lucide-react";

type ToastTone = "success" | "error" | "warning" | "info";

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastRecord = ToastInput & {
  id: string;
};

type ToastContextValue = {
  pushToast: (toast: ToastInput) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function toneStyles(tone: ToastTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "error") return "border-rose-200 bg-rose-50 text-rose-900";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-white text-slate-900";
}

function ToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (tone === "error") return <XCircle className="h-4 w-4 text-rose-600" />;
  if (tone === "warning") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <Info className="h-4 w-4 text-slate-500" />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: ToastInput) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const next: ToastRecord = {
        id,
        title: toast.title,
        description: toast.description || "",
        tone: toast.tone || "info",
        durationMs: toast.durationMs ?? 3200,
      };
      setToasts((prev) => [...prev, next]);
      window.setTimeout(() => dismissToast(id), next.durationMs);
    },
    [dismissToast]
  );

  const value = useMemo<ToastContextValue>(() => ({ pushToast, dismissToast }), [dismissToast, pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[400] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={clsx(
              "pointer-events-auto rounded-xl border px-3 py-2 shadow-[0_16px_32px_-18px_rgba(15,23,42,0.45)] backdrop-blur",
              toneStyles(toast.tone || "info")
            )}
          >
            <div className="flex items-start gap-2">
              <ToneIcon tone={toast.tone || "info"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description ? <p className="mt-0.5 text-xs opacity-85">{toast.description}</p> : null}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismissToast(toast.id)}
                className="rounded-md p-1 hover:bg-black/5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
