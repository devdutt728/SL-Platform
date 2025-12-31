"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteCandidateButton({ candidateId }: { candidateId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm("Delete this candidate and their Drive folder? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rec/candidates/${candidateId}`, { method: "DELETE" });
      if (!res.ok) {
        let msg = `Delete failed (${res.status})`;
        try {
          const raw = await res.text();
          msg = raw || msg;
        } catch {
          // ignore
        }
        // Even if backend returns error after deletion, redirect back to list to avoid a stuck detail page.
        setError(msg);
        router.push("/candidates");
        router.refresh();
        return;
      }
      router.push("/candidates");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleDelete}
        disabled={busy}
        className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-600 disabled:opacity-60"
      >
        {busy ? "Deleting..." : "Delete candidate"}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
