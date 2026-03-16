"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CandidateConvertPayload, CandidateConvertResult, CandidateFull, CandidateOffer } from "@/lib/types";
import * as candidate360Api from "./candidate360.api";
import { cleanLetterOverrides, normalizeOfferStatus, suggestOfferTemplate } from "./candidate360.client-utils";
import { principalApproverOptions } from "./candidate360.constants";
import { normalizeRecruitmentStage, recruitmentStageLabel } from "@/lib/recruitment-stages";

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
  canAccessOffers: boolean;
  refreshAll: () => Promise<void>;
  openDialog: (next: DialogConfig) => void;
  closeDialog: () => void;
  setDialogError: (error: string) => void;
  pushToast: (toast: ToastPayload) => void;
};

export function useCandidate360Offers({
  candidateId,
  candidate,
  canAccessOffers,
  refreshAll,
  openDialog,
  closeDialog,
  setDialogError,
  pushToast,
}: Args) {
  const [candidateOffers, setCandidateOffers] = useState<CandidateOffer[] | null>(null);
  const [offersBusy, setOffersBusy] = useState(false);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [offerTemplateCode, setOfferTemplateCode] = useState("STD_OFFER");
  const [offerApprovalPrincipal, setOfferApprovalPrincipal] = useState(principalApproverOptions[0]?.email || "");
  const [offerDesignation, setOfferDesignation] = useState("");
  const [offerCurrency, setOfferCurrency] = useState("INR");
  const [offerGross, setOfferGross] = useState("");
  const [offerFixed, setOfferFixed] = useState("");
  const [offerVariable, setOfferVariable] = useState("");
  const [offerJoiningDate, setOfferJoiningDate] = useState("");
  const [offerProbationMonths, setOfferProbationMonths] = useState("3");
  const [offerGradeId, setOfferGradeId] = useState("");
  const [offerNotes, setOfferNotes] = useState("");
  const [offerLetterOverrides, setOfferLetterOverrides] = useState<Record<string, string>>({});
  const [draftLetterOverrides, setDraftLetterOverrides] = useState<Record<string, string>>({});
  const [draftOverridesOpen, setDraftOverridesOpen] = useState(false);
  const [offerPreviewOpen, setOfferPreviewOpen] = useState(false);
  const [offerPreviewHtml, setOfferPreviewHtml] = useState("");
  const [offerPreviewTitle, setOfferPreviewTitle] = useState("");
  const [offerPreviewBusy, setOfferPreviewBusy] = useState(false);
  const [offerPreviewError, setOfferPreviewError] = useState<string | null>(null);

  const refreshOffers = useCallback(async () => {
    setOffersBusy(true);
    setOffersError(null);
    try {
      const list = await candidate360Api.fetchCandidateOffers(candidateId);
      setCandidateOffers(list);
    } catch (e: any) {
      setOffersError(e?.message || "Could not load offers.");
    } finally {
      setOffersBusy(false);
    }
  }, [candidateId]);

  const syncOfferAndCandidate = useCallback(async () => {
    await refreshOffers();
    await refreshAll();
  }, [refreshAll, refreshOffers]);

  useEffect(() => {
    if (candidate.opening_title && !offerDesignation) {
      setOfferDesignation(candidate.opening_title);
    }
    if (offerTemplateCode === "STD_OFFER") {
      const suggestion = suggestOfferTemplate(candidate.opening_title);
      setOfferTemplateCode(suggestion);
    }
  }, [candidate.opening_title, offerDesignation, offerTemplateCode]);

  useEffect(() => {
    if (!canAccessOffers) return;
    if (candidateOffers === null) {
      void refreshOffers();
    }
  }, [canAccessOffers, candidateOffers, refreshOffers]);

  const latestOffer = candidateOffers && candidateOffers.length > 0 ? candidateOffers[0] : null;
  const latestOfferStatus = normalizeOfferStatus(latestOffer?.offer_status);
  const latestOfferApprovalDecision = normalizeOfferStatus(latestOffer?.approval_decision);
  const currentStageKey = normalizeRecruitmentStage(candidate.current_stage);
  const candidateStatus = normalizeOfferStatus(candidate.status);
  const canCreateRevisionFromLatestOffer = useMemo(() => {
    if (!latestOffer) return false;
    return !["draft", "pending_approval"].includes(latestOfferStatus);
  }, [latestOffer, latestOfferStatus]);
  const canSendApprovedOffer =
    latestOfferStatus === "approved" || (latestOfferStatus === "pending_approval" && latestOfferApprovalDecision === "approved");

  const reviseOfferEligibility = useMemo(() => {
    if (!canAccessOffers) {
      return { allowed: false, reason: "Offer access is not available in this view." };
    }
    if (!latestOffer) {
      return { allowed: false, reason: "No offer found for revision." };
    }
    if (!canCreateRevisionFromLatestOffer) {
        return {
          allowed: false,
          reason:
            latestOfferStatus === "draft"
            ? "Current offer is already a draft. Use Edit draft offer to update compensation and letter fields."
            : "Pending approval offer cannot be revised. Complete approval/rejection first.",
        };
      }
    if (currentStageKey === "hired" || candidateStatus === "hired") {
      return {
        allowed: false,
        reason: "Candidate is already marked as Hired; revision is not allowed.",
      };
    }
    return { allowed: true as const, reason: null as string | null };
  }, [canAccessOffers, canCreateRevisionFromLatestOffer, currentStageKey, candidateStatus, latestOffer, latestOfferStatus]);

  useEffect(() => {
    if (!latestOffer) {
      setDraftLetterOverrides({});
      setDraftOverridesOpen(false);
      return;
    }
    setDraftLetterOverrides(latestOffer.letter_overrides || {});
  }, [latestOffer]);

  useEffect(() => {
    if (!latestOffer || latestOfferStatus !== "draft") return;
    setOfferTemplateCode(latestOffer.offer_template_code || "STD_OFFER");
    setOfferDesignation(latestOffer.designation_title || candidate.opening_title || candidate.current_stage || "");
    setOfferCurrency((latestOffer.currency || "INR").trim() || "INR");
    setOfferGross(latestOffer.gross_ctc_annual != null ? String(latestOffer.gross_ctc_annual) : "");
    setOfferFixed(latestOffer.fixed_ctc_annual != null ? String(latestOffer.fixed_ctc_annual) : "");
    setOfferVariable(latestOffer.variable_ctc_annual != null ? String(latestOffer.variable_ctc_annual) : "");
    setOfferJoiningDate((latestOffer.joining_date || "").slice(0, 10));
    setOfferProbationMonths(latestOffer.probation_months != null ? String(latestOffer.probation_months) : "");
    setOfferGradeId(latestOffer.grade_id_platform != null ? String(latestOffer.grade_id_platform) : "");
    setOfferNotes(latestOffer.notes_internal || "");
  }, [candidate.current_stage, candidate.opening_title, latestOffer, latestOfferStatus]);

  const handleCreateOffer = useCallback(async () => {
    setOffersError(null);
    if (!offerTemplateCode.trim()) {
      setOffersError("Select an offer template.");
      return;
    }
    setOffersBusy(true);
    try {
      const overrides = cleanLetterOverrides(offerLetterOverrides);
      await candidate360Api.createOffer(candidateId, {
        offer_template_code: offerTemplateCode.trim(),
        designation_title: offerDesignation.trim() || candidate.opening_title || candidate.current_stage,
        currency: offerCurrency.trim() || "INR",
        gross_ctc_annual: offerGross ? Number(offerGross) : null,
        fixed_ctc_annual: offerFixed ? Number(offerFixed) : null,
        variable_ctc_annual: offerVariable ? Number(offerVariable) : null,
        joining_date: offerJoiningDate || null,
        probation_months: offerProbationMonths ? Number(offerProbationMonths) : null,
        grade_id_platform: offerGradeId ? Number(offerGradeId) : null,
        notes_internal: offerNotes.trim() || null,
        letter_overrides: Object.keys(overrides).length ? overrides : {},
      });
      await syncOfferAndCandidate();
    } catch (e: any) {
      setOffersError(e?.message || "Offer creation failed.");
    } finally {
      setOffersBusy(false);
    }
  }, [
    candidate.current_stage,
    candidate.opening_title,
    candidateId,
    offerCurrency,
    offerDesignation,
    offerFixed,
    offerGradeId,
    offerGross,
    offerJoiningDate,
    offerLetterOverrides,
    offerNotes,
    offerProbationMonths,
    offerTemplateCode,
    offerVariable,
    syncOfferAndCandidate,
  ]);

  const handleOfferPreview = useCallback(async (offerId: number, kind: "letter" | "email") => {
    setOfferPreviewBusy(true);
    setOfferPreviewError(null);
    try {
      const endpoint = kind === "email" ? "email-preview" : "preview";
      const res = await fetch(`/api/rec/offers/${offerId}/${endpoint}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const html = await res.text();
      setOfferPreviewHtml(html);
      setOfferPreviewTitle(kind === "email" ? "Offer email preview" : "Offer letter preview");
      setOfferPreviewOpen(true);
    } catch (e: any) {
      setOfferPreviewError(e?.message || "Preview failed.");
    } finally {
      setOfferPreviewBusy(false);
    }
  }, []);

  const handleSubmitOffer = useCallback(
    async (offerId: number) => {
      setOffersBusy(true);
      setOffersError(null);
      try {
        if (!offerApprovalPrincipal) {
          setOffersError("Select a principal approver before submitting.");
          return;
        }
        await candidate360Api.updateOffer(offerId, {
          submit_for_approval: true,
          approval_principal_email: offerApprovalPrincipal,
        });
        await syncOfferAndCandidate();
      } catch (e: any) {
        setOffersError(e?.message || "Offer submission failed.");
      } finally {
        setOffersBusy(false);
      }
    },
    [offerApprovalPrincipal, syncOfferAndCandidate]
  );

  const handleApproveOffer = useCallback(
    async (offerId: number) => {
      setOffersBusy(true);
      setOffersError(null);
      try {
        await candidate360Api.approveOffer(offerId);
        await syncOfferAndCandidate();
      } catch (e: any) {
        setOffersError(e?.message || "Offer approval failed.");
      } finally {
        setOffersBusy(false);
      }
    },
    [syncOfferAndCandidate]
  );

  const handleRejectOffer = useCallback(
    async (offerId: number) => {
      setOffersBusy(true);
      setOffersError(null);
      try {
        await candidate360Api.rejectOffer(offerId);
        await syncOfferAndCandidate();
      } catch (e: any) {
        setOffersError(e?.message || "Offer rejection failed.");
      } finally {
        setOffersBusy(false);
      }
    },
    [syncOfferAndCandidate]
  );

  const handleSendOffer = useCallback(
    async (offer: CandidateOffer) => {
      setOffersBusy(true);
      setOffersError(null);
      try {
        const status = normalizeOfferStatus(offer.offer_status);
        const decision = normalizeOfferStatus(offer.approval_decision);
        if (status === "pending_approval" && decision === "approved") {
          await candidate360Api.approveOffer(offer.candidate_offer_id);
        }
        await candidate360Api.sendOffer(offer.candidate_offer_id);
        await syncOfferAndCandidate();
      } catch (e: any) {
        setOffersError(e?.message || "Offer send failed.");
      } finally {
        setOffersBusy(false);
      }
    },
    [syncOfferAndCandidate]
  );

  const handleAdminDecision = useCallback(
    async (offerId: number, decision: "accept" | "decline") => {
      openDialog({
        title: `Mark offer as ${decision}`,
        description: "This updates candidate status and stage progression.",
        confirmLabel: `Mark as ${decision}`,
        tone: decision === "accept" ? "success" : "danger",
        onConfirm: async () => {
          setOffersBusy(true);
          setOffersError(null);
          try {
            await candidate360Api.adminDecideOffer(offerId, decision);
            await refreshOffers();
            await refreshAll();
            pushToast({ tone: "success", title: `Offer marked as ${decision}` });
            closeDialog();
          } catch (e: any) {
            setOffersError(e?.message || "Offer decision failed.");
            setDialogError(e?.message || "Offer decision failed.");
          } finally {
            setOffersBusy(false);
          }
        },
      });
    },
    [closeDialog, openDialog, pushToast, refreshAll, refreshOffers, setDialogError]
  );

  const handleSaveDraftOverrides = useCallback(
    async (offerId: number) => {
      const parseNullableNumber = (raw: string, label: string) => {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed)) {
          throw new Error(`${label} must be a valid number.`);
        }
        return parsed;
      };
      const parseNullableInteger = (raw: string, label: string) => {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        if (!Number.isInteger(parsed)) {
          throw new Error(`${label} must be a valid whole number.`);
        }
        return parsed;
      };
      setOffersBusy(true);
      setOffersError(null);
      try {
        const overrides = cleanLetterOverrides(draftLetterOverrides);
        await candidate360Api.updateOffer(offerId, {
          offer_template_code: offerTemplateCode.trim() || undefined,
          designation_title: offerDesignation.trim() || undefined,
          currency: offerCurrency.trim() || undefined,
          gross_ctc_annual: parseNullableNumber(offerGross, "Gross CTC"),
          fixed_ctc_annual: parseNullableNumber(offerFixed, "Fixed CTC"),
          variable_ctc_annual: parseNullableNumber(offerVariable, "Variable CTC"),
          joining_date: offerJoiningDate.trim() || undefined,
          probation_months: parseNullableInteger(offerProbationMonths, "Probation months"),
          grade_id_platform: parseNullableInteger(offerGradeId, "Grade ID"),
          notes_internal: offerNotes.trim() || undefined,
          letter_overrides: overrides,
        });
        await syncOfferAndCandidate();
      } catch (e: any) {
        setOffersError(e?.message || "Offer update failed.");
      } finally {
        setOffersBusy(false);
      }
    },
    [
      draftLetterOverrides,
      offerCurrency,
      offerDesignation,
      offerFixed,
      offerGradeId,
      offerGross,
      offerJoiningDate,
      offerNotes,
      offerProbationMonths,
      offerTemplateCode,
      offerVariable,
      syncOfferAndCandidate,
    ]
  );

  const handleDeleteOffer = useCallback(
    async (offerId: number) => {
      openDialog({
        title: "Delete draft offer",
        description: "This draft offer will be permanently removed.",
        confirmLabel: "Delete draft",
        tone: "danger",
        onConfirm: async () => {
          setOffersBusy(true);
          setOffersError(null);
          try {
            await candidate360Api.deleteOffer(offerId);
            await syncOfferAndCandidate();
            pushToast({ tone: "success", title: "Draft offer deleted" });
            closeDialog();
          } catch (e: any) {
            setOffersError(e?.message || "Offer deletion failed.");
            setDialogError(e?.message || "Offer deletion failed.");
          } finally {
            setOffersBusy(false);
          }
        },
      });
    },
    [closeDialog, openDialog, pushToast, syncOfferAndCandidate, setDialogError]
  );

  const handleReviseOffer = useCallback(
    async (offerId: number) => {
      if (!reviseOfferEligibility.allowed) {
        const reason = reviseOfferEligibility.reason || "Offer revision is not allowed in the current stage.";
        setOffersError(reason);
        pushToast({ tone: "warning", title: "Revision blocked", description: reason });
        return;
      }
      openDialog({
        title: "Create offer revision",
        description: "This will create a new editable draft offer version. Offer stage will be reopened automatically when needed.",
        confirmLabel: "Create revision",
        tone: "success",
        requireReason: true,
        reasonLabel: "Revision reason",
        reasonPlaceholder: "Candidate requested revised compensation / terms",
        onConfirm: async (value) => {
          setOffersBusy(true);
          setOffersError(null);
          try {
            await candidate360Api.reviseOffer(offerId, value);
            await refreshOffers();
            await refreshAll();
            setDraftOverridesOpen(true);
            pushToast({ tone: "success", title: "Offer revision draft created" });
            closeDialog();
          } catch (e: any) {
            const rawMessage = e?.message || "Could not create revision.";
            const message =
              rawMessage.toLowerCase().includes("invalid stage transition") && currentStageKey
                ? `Revision blocked: candidate is in ${recruitmentStageLabel(currentStageKey)} stage and could not be reopened to Offer.`
                : rawMessage;
            setOffersError(message);
            setDialogError(message);
          } finally {
            setOffersBusy(false);
          }
        },
      });
    },
    [closeDialog, currentStageKey, openDialog, pushToast, refreshAll, refreshOffers, reviseOfferEligibility, setDialogError]
  );

  const handleConvertCandidate = useCallback(async (payload: CandidateConvertPayload): Promise<CandidateConvertResult> => {
    setOffersBusy(true);
    setOffersError(null);
    try {
      const result = await candidate360Api.convertCandidate(candidateId, payload);
      await refreshAll();
      return result;
    } catch (e: any) {
      const message = e?.message || "Conversion failed.";
      setOffersError(message);
      throw new Error(message);
    } finally {
      setOffersBusy(false);
    }
  }, [candidateId, refreshAll]);

  return {
    candidateOffers,
    offersBusy,
    offersError,
    setOffersError,
    offerTemplateCode,
    setOfferTemplateCode,
    offerApprovalPrincipal,
    setOfferApprovalPrincipal,
    offerDesignation,
    setOfferDesignation,
    offerCurrency,
    setOfferCurrency,
    offerGross,
    setOfferGross,
    offerFixed,
    setOfferFixed,
    offerVariable,
    setOfferVariable,
    offerJoiningDate,
    setOfferJoiningDate,
    offerProbationMonths,
    setOfferProbationMonths,
    offerGradeId,
    setOfferGradeId,
    offerNotes,
    setOfferNotes,
    offerLetterOverrides,
    setOfferLetterOverrides,
    draftLetterOverrides,
    setDraftLetterOverrides,
    draftOverridesOpen,
    setDraftOverridesOpen,
    offerPreviewOpen,
    setOfferPreviewOpen,
    offerPreviewHtml,
    offerPreviewTitle,
    offerPreviewBusy,
    offerPreviewError,
    latestOffer,
    reviseOfferEligibility,
    canSendApprovedOffer,
    refreshOffers,
    handleCreateOffer,
    handleOfferPreview,
    handleSubmitOffer,
    handleApproveOffer,
    handleRejectOffer,
    handleSendOffer,
    handleAdminDecision,
    handleSaveDraftOverrides,
    handleDeleteOffer,
    handleReviseOffer,
    handleConvertCandidate,
  };
}
