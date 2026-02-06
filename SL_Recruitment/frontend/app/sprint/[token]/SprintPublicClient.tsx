"use client";

import { useState } from "react";

type Props = {
  token: string;
  initialStatus?: string | null;
  dueAt?: string | null;
};

async function readError(res: Response) {
  const raw = await res.text();
  if (!raw) return `Request failed (${res.status})`;
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown; message?: unknown };
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.detail === "string") return parsed.detail;
      if (typeof parsed.message === "string") return parsed.message;
    }
  } catch {
    // Fall back to raw text.
  }
  return raw;
}

export function SprintPublicClient({ token, initialStatus, dueAt }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [expired, setExpired] = useState(false);
  const dueDate = dueAt ? new Date(dueAt) : null;
  const dueTimestamp = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.getTime() : null;
  const isExpired = expired || (dueTimestamp !== null && Date.now() > dueTimestamp);

  async function handleSubmit() {
    setError(null);
    setSuccess(false);
    if (isExpired) {
      setError("This sprint link has expired. Please contact the hiring team.");
      return;
    }
    if (!file) {
      setError("Please upload a file.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      if (file) form.append("submission_file", file);
      const res = await fetch(`/api/sprint/${encodeURIComponent(token)}`, { method: "POST", body: form });
      if (!res.ok) throw new Error(await readError(res));
      setSuccess(true);
      setExpired(true);
    } catch (e: any) {
      setError(e?.message || "Submission failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section-card space-y-4">
      <div>
        <p className="text-sm font-semibold">Submit your sprint</p>
        <p className="text-xs text-slate-600">Upload your file. You can update before the due date.</p>
        {success ? (
          <p className="mt-2 text-xs font-semibold text-emerald-600">Submission received. This link is now expired.</p>
        ) : null}
        {initialStatus === "submitted" && !success ? (
          <p className="mt-2 text-xs font-semibold text-rose-600">This sprint link has expired.</p>
        ) : null}
        {isExpired && !success ? <p className="mt-2 text-xs font-semibold text-rose-600">This sprint link has expired.</p> : null}
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Thanks! Your sprint was submitted.</div> : null}

      <label className="space-y-1 text-xs text-slate-600">
        Upload file (zip/pdf/etc.)
        <input
          type="file"
          className="w-full rounded-xl border border-white/60 bg-white/30 px-3 py-2 text-sm text-slate-700"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          disabled={isExpired || busy}
        />
        <span className="text-[11px] text-slate-500">Submission links are not accepted. Please upload a file.</span>
      </label>

      <button
        type="button"
        className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-lg"
        onClick={() => void handleSubmit()}
        disabled={busy || isExpired}
      >
        {busy ? "Submitting..." : "Submit sprint"}
      </button>
    </div>
  );
}
