"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

export function CafLinkButton({ candidateId }: { candidateId: number }) {
  const [cafUrl, setCafUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/rec/candidates/${candidateId}/caf-link`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { caf_url?: string };
      if (!cancelled) setCafUrl(data.caf_url || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  if (!cafUrl) return null;

  return (
    <a
      href={cafUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/60 px-3 py-2 text-sm font-semibold hover:bg-white/80"
    >
      <ExternalLink className="h-4 w-4" />
      Open CAF
    </a>
  );
}
