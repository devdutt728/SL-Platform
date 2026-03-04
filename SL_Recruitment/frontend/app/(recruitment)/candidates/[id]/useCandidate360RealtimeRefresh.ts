"use client";

import { useEffect } from "react";

type Args = {
  candidateId: string;
  refreshAll: () => Promise<void>;
  refreshInterviews: () => Promise<void>;
  refreshSprints: () => Promise<void>;
  refreshOffers: () => Promise<void>;
  refreshJoiningDocs: () => Promise<void>;
};

export function useCandidate360RealtimeRefresh({
  candidateId,
  refreshAll,
  refreshInterviews,
  refreshSprints,
  refreshOffers,
  refreshJoiningDocs,
}: Args) {
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let pending = false;
    const source = new EventSource("/api/rec/events/stream");

    async function refreshAllData() {
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      try {
        await refreshAll();
        await refreshInterviews();
        await refreshSprints();
        await refreshOffers();
        await refreshJoiningDocs();
      } finally {
        inFlight = false;
        if (pending && !cancelled) {
          pending = false;
          void refreshAllData();
        }
      }
    }

    source.onmessage = (ev) => {
      if (!ev?.data) return;
      try {
        const payload = JSON.parse(ev.data) as { candidate_id?: number };
        if (payload?.candidate_id && String(payload.candidate_id) !== String(candidateId)) return;
      } catch {
        // ignore parse errors
      }
      void refreshAllData();
    };
    source.onerror = () => {
      // EventSource will retry automatically.
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, [candidateId, refreshAll, refreshInterviews, refreshSprints, refreshOffers, refreshJoiningDocs]);
}
