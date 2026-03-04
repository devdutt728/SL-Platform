"use client";

import { useCallback, useEffect, useState } from "react";
import { CandidateFull, PlatformPersonSuggestion } from "@/lib/types";
import { trackUxMetric } from "@/lib/ux-metrics";
import * as candidate360Api from "./candidate360.api";
import { stageLabel } from "./candidate360.client-utils";

type DialogConfig = {
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "neutral" | "danger" | "success";
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (value?: string) => void | Promise<void>;
};

type ToastPayload = {
  title: string;
  description?: string;
  tone?: "success" | "error" | "warning" | "info";
};

type Args = {
  candidateId: string;
  candidate: CandidateFull["candidate"];
  canManageCandidate360: boolean;
  refreshAll: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<CandidateFull>>;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  openDialog: (next: DialogConfig) => void;
  closeDialog: () => void;
  setDialogError: (error: string) => void;
  pushToast: (toast: ToastPayload) => void;
};

export function useCandidate360Lifecycle({
  candidateId,
  candidate,
  canManageCandidate360,
  refreshAll,
  setData,
  setBusy,
  setError,
  openDialog,
  closeDialog,
  setDialogError,
  pushToast,
}: Args) {
  const [skipStage, setSkipStage] = useState("");
  const [l2OwnerQuery, setL2OwnerQuery] = useState("");
  const [l2OwnerOptions, setL2OwnerOptions] = useState<PlatformPersonSuggestion[]>([]);
  const [l2OwnerOpen, setL2OwnerOpen] = useState(false);
  const [l2OwnerLoading, setL2OwnerLoading] = useState(false);
  const [l2OwnerSelected, setL2OwnerSelected] = useState<PlatformPersonSuggestion | null>(null);
  const [l2OwnerSaving, setL2OwnerSaving] = useState(false);
  const [l2OwnerError, setL2OwnerError] = useState<string | null>(null);

  useEffect(() => {
    if (candidate.l2_owner_email) {
      setL2OwnerSelected({
        person_id: candidate.l2_owner_email,
        person_code: "",
        full_name: candidate.l2_owner_name || candidate.l2_owner_email.split("@")[0] || candidate.l2_owner_email,
        email: candidate.l2_owner_email,
      });
      setL2OwnerQuery("");
      return;
    }
    setL2OwnerSelected(null);
    setL2OwnerQuery("");
  }, [candidate.l2_owner_email, candidate.l2_owner_name]);

  useEffect(() => {
    if (!l2OwnerOpen) return;
    const q = l2OwnerQuery.trim();
    if (!q) {
      setL2OwnerOptions([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setL2OwnerLoading(true);
      candidate360Api
        .fetchPeople(q)
        .then((items) => {
          if (!cancelled) setL2OwnerOptions(items);
        })
        .catch(() => {
          if (!cancelled) setL2OwnerOptions([]);
        })
        .finally(() => {
          if (!cancelled) setL2OwnerLoading(false);
        });
    }, q.length < 2 ? 0 : 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [l2OwnerOpen, l2OwnerQuery]);

  const handleSaveL2Owner = useCallback(async () => {
    if (!canManageCandidate360) {
      setL2OwnerError("You do not have permission to perform this action.");
      return;
    }
    const email = (l2OwnerSelected?.email || l2OwnerQuery || "").trim().toLowerCase();
    const name = (l2OwnerSelected?.full_name || "").trim() || undefined;
    if (!email || !email.includes("@")) {
      setL2OwnerError("Enter a valid email or select from suggestions.");
      return;
    }
    setL2OwnerError(null);
    setL2OwnerSaving(true);
    try {
      const updated = await candidate360Api.updateCandidate(candidateId, {
        l2_owner_email: email,
        l2_owner_name: name,
      });
      setData((prev) => ({ ...prev, candidate: updated }));
      setL2OwnerSelected({
        person_id: updated.l2_owner_email || email,
        person_code: "",
        full_name: updated.l2_owner_name || name || email.split("@")[0] || email,
        email: updated.l2_owner_email || email,
      });
      setL2OwnerQuery("");
      setL2OwnerOptions([]);
    } catch (e: any) {
      setL2OwnerError(e?.message || "Could not save GL/L2 owner.");
    } finally {
      setL2OwnerSaving(false);
    }
  }, [canManageCandidate360, l2OwnerSelected, l2OwnerQuery, candidateId, setData]);

  const performTransition = useCallback(
    async (toStage: string, decision: string, reasonOverride?: string) => {
      if (!canManageCandidate360) {
        setError("You do not have permission to perform this action.");
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        if (toStage === "hr_screening" && !candidate.l2_owner_email) {
          setBusy(false);
          setError("Assign GL/L2 email before moving to HR screening.");
          return false;
        }
        const reason = (reasonOverride || "").trim() || undefined;
        await candidate360Api.transition(candidateId, { to_stage: toStage, decision, reason, note: `UI: ${decision}` });
        await refreshAll();
        trackUxMetric({
          event_name: "candidate_stage_transition",
          entity_type: "candidate",
          entity_id: String(candidate.candidate_id),
          metadata: { to_stage: toStage, decision: decision, has_reason: Boolean(reason) },
        });
        pushToast({
          tone: "success",
          title: `Moved to ${stageLabel(toStage)}`,
          description: `${candidate.name} updated successfully.`,
        });
        return true;
      } catch (e: any) {
        setError(e?.message || "Transition failed");
        pushToast({
          tone: "error",
          title: "Transition failed",
          description: e?.message || "Could not update candidate stage.",
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [canManageCandidate360, setError, setBusy, candidate.l2_owner_email, candidate.candidate_id, candidate.name, candidateId, refreshAll, pushToast]
  );

  const handleTransition = useCallback(
    async (toStage: string, decision: string, reasonOverride?: string) => {
      if (decision === "reject" && !(reasonOverride || "").trim()) {
        openDialog({
          title: "Reject candidate",
          description: "Rejection reason is required and will be logged in the event timeline.",
          confirmLabel: "Reject candidate",
          tone: "danger",
          requireReason: true,
          reasonLabel: "Rejection reason",
          reasonPlaceholder: "Why is this candidate being rejected?",
          onConfirm: async (value) => {
            if (!value || !value.trim()) {
              setDialogError("Reason is required.");
              return;
            }
            const ok = await performTransition(toStage, decision, value.trim());
            if (ok) closeDialog();
          },
        });
        return;
      }
      await performTransition(toStage, decision, reasonOverride);
    },
    [closeDialog, openDialog, performTransition, setDialogError]
  );

  const handleSkip = useCallback(async () => {
    if (!skipStage) return;
    setBusy(true);
    setError(null);
    try {
      await candidate360Api.transition(candidateId, { to_stage: skipStage, decision: "skip", note: "superadmin_skip" });
      await refreshAll();
      pushToast({ tone: "success", title: `Skipped to ${stageLabel(skipStage)}` });
      trackUxMetric({
        event_name: "candidate_stage_skip",
        entity_type: "candidate",
        entity_id: String(candidate.candidate_id),
        metadata: { to_stage: skipStage },
      });
    } catch (e: any) {
      setError(e?.message || "Skip failed");
    } finally {
      setBusy(false);
    }
  }, [skipStage, setBusy, setError, candidateId, refreshAll, pushToast, candidate.candidate_id]);

  return {
    skipStage,
    setSkipStage,
    l2OwnerQuery,
    setL2OwnerQuery,
    l2OwnerOptions,
    setL2OwnerOptions,
    l2OwnerOpen,
    setL2OwnerOpen,
    l2OwnerLoading,
    l2OwnerSelected,
    setL2OwnerSelected,
    l2OwnerSaving,
    l2OwnerError,
    handleSaveL2Owner,
    handleTransition,
    handleSkip,
  };
}
