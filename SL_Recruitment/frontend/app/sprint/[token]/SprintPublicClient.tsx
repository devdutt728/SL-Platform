"use client";

import { useState } from "react";

type Props = {
  token: string;
  defaultSubmissionUrl?: string | null;
  initialStatus?: string | null;
};

export function SprintPublicClient({ token, defaultSubmissionUrl, initialStatus }: Props) {
  const [submissionUrl, setSubmissionUrl] = useState(defaultSubmissionUrl || "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSuccess(false);
    if (!file && !submissionUrl.trim()) {
      setError("Please add a file or a submission link.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      if (submissionUrl.trim()) form.append("submission_url", submissionUrl.trim());
      if (file) form.append("submission_file", file);
      const res = await fetch(`/api/sprint/${encodeURIComponent(token)}`, { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      setSuccess(true);
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
        <p className="text-xs text-slate-600">Upload your file or share a link. You can update before the due date.</p>
        {initialStatus === "submitted" ? (
          <p className="mt-2 text-xs font-semibold text-amber-600">Submission received. You can resubmit if needed.</p>
        ) : null}
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Thanks! Your sprint was submitted.</div> : null}

      <label className="space-y-1 text-xs text-slate-600">
        Submission link (Drive, Figma, etc.)
        <input
          className="w-full rounded-xl border border-white/60 bg-white/30 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          value={submissionUrl}
          onChange={(e) => setSubmissionUrl(e.target.value)}
          placeholder="https://drive.google.com/..."
        />
      </label>

      <label className="space-y-1 text-xs text-slate-600">
        Upload file (zip/pdf/etc.)
        <input
          type="file"
          className="w-full rounded-xl border border-white/60 bg-white/30 px-3 py-2 text-sm text-slate-700"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>

      <button
        type="button"
        className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-lg"
        onClick={() => void handleSubmit()}
        disabled={busy}
      >
        {busy ? "Submitting..." : "Submit sprint"}
      </button>
    </div>
  );
}
