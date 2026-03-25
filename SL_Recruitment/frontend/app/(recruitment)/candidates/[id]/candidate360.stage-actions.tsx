"use client";

import { CheckCircle2, Layers, XCircle } from "lucide-react";

export type Candidate360StageButton = {
  label: string;
  tone: string;
  icon: JSX.Element;
  intent: string;
  action: () => void | Promise<void>;
  disabled?: boolean;
};

type BuildStageButtonsParams = {
  currentStageKey: string | null;
  isInternWorkflow: boolean;
  canManageCandidate360: boolean;
  canSchedule: boolean;
  canAccessOffers: boolean;
  canSkip: boolean;
  cafLocked: boolean;
  hasL2FeedbackSubmitted: boolean;
  hasL1FeedbackSubmitted: boolean;
  hasInternSelectionEmailSent: boolean;
  candidateL2OwnerEmail?: string | null;
  sprintAssignDisabled: boolean;
  hasApprovedSprint: boolean;
  joiningDocsComplete: boolean;
  offersBusy: boolean;
  canReviseOffer: boolean;
  latestOfferStatus?: string | null;
  latestOfferId?: number | null;
  handleTransition: (toStage: string, decision: string) => void | Promise<void>;
  handleSendInternSelectionEmail: () => void | Promise<void>;
  handleConvertCandidate: () => void | Promise<void>;
  handleReviseOffer: (offerId: number) => void | Promise<void>;
  focusSection: (section: "screening" | "documents" | "interviews" | "sprint" | "offer") => void;
  openSchedule: (round: string) => void;
  openAssignSprint: () => void | Promise<void>;
};

export function buildCandidate360StageButtons({
  currentStageKey,
  isInternWorkflow,
  canManageCandidate360,
  canSchedule,
  canAccessOffers,
  canSkip,
  cafLocked,
  hasL2FeedbackSubmitted,
  hasL1FeedbackSubmitted,
  hasInternSelectionEmailSent,
  candidateL2OwnerEmail,
  sprintAssignDisabled,
  hasApprovedSprint,
  joiningDocsComplete,
  offersBusy,
  canReviseOffer,
  latestOfferStatus,
  latestOfferId,
  handleTransition,
  handleSendInternSelectionEmail,
  handleConvertCandidate,
  handleReviseOffer,
  focusSection,
  openSchedule,
  openAssignSprint,
}: BuildStageButtonsParams): Candidate360StageButton[] {
  if (!canManageCandidate360) return [];
  const status = String(latestOfferStatus || "").toLowerCase();
  const canCreateRevisionFromLatestOffer = Boolean(latestOfferId && !["draft", "pending_approval"].includes(status));
  const current = currentStageKey;
  if (cafLocked && current && current !== "rejected" && current !== "declined" && current !== "hired") {
    return [
      {
        label: "Reject (CAF pending)",
        tone: "btn-action-danger",
        icon: <XCircle className="h-4 w-4" />,
        intent: "reject",
        action: () => handleTransition("rejected", "reject"),
      },
    ];
  }
  if (current === "hr_screening") {
    return [
      {
        label: "Advance to L2 shortlist",
        tone: "btn-action-success",
        icon: <CheckCircle2 className="h-4 w-4" />,
        intent: "advance",
        action: () => handleTransition("l2_shortlist", "advance"),
      },
      {
        label: "Reject after HR screening",
        tone: "btn-action-danger",
        icon: <XCircle className="h-4 w-4" />,
        intent: "reject",
        action: () => handleTransition("rejected", "reject"),
      },
      {
        label: "Review screening",
        tone: "btn-action-neutral",
        icon: <Layers className="h-4 w-4" />,
        intent: "review",
        action: () => focusSection("screening"),
      },
    ];
  }
  if (current === "enquiry") {
    return [
      {
        label: "Move to HR screening",
        tone: "btn-action-success",
        icon: <CheckCircle2 className="h-4 w-4" />,
        intent: "advance",
        disabled: !candidateL2OwnerEmail,
        action: () => handleTransition("hr_screening", "advance"),
      },
      {
        label: "Reject",
        tone: "btn-action-danger",
        icon: <XCircle className="h-4 w-4" />,
        intent: "reject",
        action: () => handleTransition("rejected", "reject"),
      },
    ];
  }
  if (current === "l2_shortlist") {
    const actions: Candidate360StageButton[] = [];
    actions.push({
      label: "Advance to L2 interview",
      tone: "btn-action-success",
      icon: <CheckCircle2 className="h-4 w-4" />,
      intent: "advance",
      action: () => handleTransition("l2_interview", "advance"),
    });
    if (canSchedule) {
      actions.push({
        label: "Schedule L2 interview",
        tone: "btn-action-neutral",
        icon: <CheckCircle2 className="h-4 w-4" />,
        intent: "review",
        action: () => {
          void (async () => {
            await handleTransition("l2_interview", "advance");
            focusSection("interviews");
            openSchedule("L2");
          })();
        },
      });
    }
    actions.push({
      label: "Go to interviews",
      tone: "btn-action-neutral",
      icon: <Layers className="h-4 w-4" />,
      intent: "review",
      action: () => focusSection("interviews"),
    });
    return actions;
  }
  if (current === "l2_interview") {
    const actions: Candidate360StageButton[] = [];
    if (canSchedule) {
      actions.push({
        label: "Schedule L2 interview",
        tone: "btn-action-success",
        icon: <CheckCircle2 className="h-4 w-4" />,
        intent: "advance",
        action: () => {
          focusSection("interviews");
          openSchedule("L2");
        },
      });
    }
    actions.push({
      label: "Go to interviews",
      tone: "btn-action-neutral",
      icon: <Layers className="h-4 w-4" />,
      intent: "review",
      action: () => focusSection("interviews"),
    });
    return actions;
  }
  if (current === "l2_feedback") {
    const feedbackPending = !hasL2FeedbackSubmitted;
    if (isInternWorkflow) {
      return [
        {
          label: feedbackPending
            ? "Send selection email (locked)"
            : hasInternSelectionEmailSent
              ? "Resend selection email"
              : "Send selection email",
          tone: "btn-action-success",
          icon: <CheckCircle2 className="h-4 w-4" />,
          intent: "advance",
          disabled: feedbackPending || !canAccessOffers,
          action: () => handleSendInternSelectionEmail(),
        },
        {
          label: feedbackPending ? "Reject after L2 feedback (locked)" : "Reject after L2 feedback",
          tone: "btn-action-danger",
          icon: <XCircle className="h-4 w-4" />,
          intent: "reject",
          disabled: feedbackPending,
          action: () => handleTransition("rejected", "reject"),
        },
        {
          label: "Go to interviews",
          tone: "btn-action-neutral",
          icon: <Layers className="h-4 w-4" />,
          intent: "review",
          action: () => focusSection("interviews"),
        },
      ];
    }
    return [
      {
        label: feedbackPending ? "Advance to sprint (locked)" : "Advance to sprint",
        tone: "btn-action-success",
        icon: <CheckCircle2 className="h-4 w-4" />,
        intent: "advance",
        disabled: feedbackPending,
        action: () => handleTransition("sprint", "advance"),
      },
      {
        label: feedbackPending ? "Reject after L2 feedback (locked)" : "Reject after L2 feedback",
        tone: "btn-action-danger",
        icon: <XCircle className="h-4 w-4" />,
        intent: "reject",
        disabled: feedbackPending,
        action: () => handleTransition("rejected", "reject"),
      },
      {
        label: "Go to interviews",
        tone: "btn-action-neutral",
        icon: <Layers className="h-4 w-4" />,
        intent: "review",
        action: () => focusSection("interviews"),
      },
    ];
  }
  if (current === "l1_interview") {
    const actions: Candidate360StageButton[] = [];
    if (canSchedule) {
      actions.push({
        label: "Schedule L1 interview",
        tone: "btn-action-success",
        icon: <CheckCircle2 className="h-4 w-4" />,
        intent: "advance",
        action: () => {
          focusSection("interviews");
          openSchedule("L1");
        },
      });
    }
    actions.push({
      label: "Go to interviews",
      tone: "btn-action-neutral",
      icon: <Layers className="h-4 w-4" />,
      intent: "review",
      action: () => focusSection("interviews"),
    });
    return actions;
  }
  if (current === "l1_shortlist") {
    const actions: Candidate360StageButton[] = [];
    actions.push({
      label: "Advance to L1 interview",
      tone: "btn-action-success",
      icon: <CheckCircle2 className="h-4 w-4" />,
      intent: "advance",
      action: () => handleTransition("l1_interview", "advance"),
    });
    if (canSchedule) {
      actions.push({
        label: "Schedule L1 interview",
        tone: "btn-action-neutral",
        icon: <CheckCircle2 className="h-4 w-4" />,
        intent: "review",
        action: () => {
          void (async () => {
            await handleTransition("l1_interview", "advance");
            focusSection("interviews");
            openSchedule("L1");
          })();
        },
      });
    }
    actions.push({
      label: "Go to interviews",
      tone: "btn-action-neutral",
      icon: <Layers className="h-4 w-4" />,
      intent: "review",
      action: () => focusSection("interviews"),
    });
    return actions;
  }
  if (current === "l1_feedback") {
    const feedbackPending = !hasL1FeedbackSubmitted;
    return [
      {
        label: feedbackPending ? "Advance to offer (locked)" : "Advance to offer",
        tone: "btn-action-success",
        icon: <CheckCircle2 className="h-4 w-4" />,
        intent: "advance",
        disabled: feedbackPending,
        action: () => handleTransition("offer", "advance"),
      },
      {
        label: feedbackPending ? "Reject after L1 feedback (locked)" : "Reject after L1 feedback",
        tone: "btn-action-danger",
        icon: <XCircle className="h-4 w-4" />,
        intent: "reject",
        disabled: feedbackPending,
        action: () => handleTransition("rejected", "reject"),
      },
      {
        label: "Go to interviews",
        tone: "btn-action-neutral",
        icon: <Layers className="h-4 w-4" />,
        intent: "review",
        action: () => focusSection("interviews"),
      },
    ];
  }
  if (current === "sprint") {
    const actions: Candidate360StageButton[] = [];
    actions.push({
      label: hasApprovedSprint ? "Advance to L1 shortlist" : "L1 shortlist locked",
      tone: "btn-action-success",
      icon: <CheckCircle2 className="h-4 w-4" />,
      intent: "advance",
      disabled: !hasApprovedSprint,
      action: () => handleTransition("l1_shortlist", "advance"),
    });
    actions.push(
      {
        label: "Assign sprint",
        tone: "btn-action-success",
        icon: <CheckCircle2 className="h-4 w-4" />,
        intent: "advance",
        disabled: sprintAssignDisabled,
        action: () => {
          focusSection("sprint");
          void openAssignSprint();
        },
      },
      {
        label: "Go to sprint",
        tone: "btn-action-neutral",
        icon: <Layers className="h-4 w-4" />,
        intent: "review",
        action: () => focusSection("sprint"),
      }
    );
    return actions;
  }
  if (current === "offer") {
    const actions: Candidate360StageButton[] = [
      {
        label: "Go to offer",
        tone: "btn-action-neutral",
        icon: <Layers className="h-4 w-4" />,
        intent: "review",
        action: () => focusSection("offer"),
      },
    ];
    if (canAccessOffers && canCreateRevisionFromLatestOffer && latestOfferId) {
      actions.push({
        label: canReviseOffer ? "Create revised offer draft" : "Revision unavailable",
        tone: canReviseOffer ? "btn-action-success" : "btn-action-neutral",
        icon: <CheckCircle2 className="h-4 w-4" />,
        intent: "review",
        disabled: !canReviseOffer,
        action: () => handleReviseOffer(latestOfferId),
      });
    }
    return actions;
  }
  if (current === "joining_documents") {
    const actions: Candidate360StageButton[] = [
      {
        label: "Go to documents",
        tone: "btn-action-neutral",
        icon: <Layers className="h-4 w-4" />,
        intent: "review",
        action: () => focusSection("documents"),
      },
    ];
    if (canAccessOffers && joiningDocsComplete) {
      actions.unshift({
        label: "Mark as joined",
        tone: "btn-action-success",
        icon: <CheckCircle2 className="h-4 w-4" />,
        intent: "advance",
        disabled: offersBusy,
        action: () => handleConvertCandidate(),
      });
    }
    return actions;
  }
  if (current === "rejected" || current === "declined" || current === "hired") {
    const actions: Candidate360StageButton[] = [];
    if (canAccessOffers) {
      actions.push({
        label: "Go to offer",
        tone: "btn-action-neutral",
        icon: <Layers className="h-4 w-4" />,
        intent: "review",
        action: () => focusSection("offer"),
      });
      if (canCreateRevisionFromLatestOffer && latestOfferId) {
        actions.push({
          label: canReviseOffer ? "Create revised offer draft" : "Revision unavailable",
          tone: canReviseOffer ? "btn-action-success" : "btn-action-neutral",
          icon: <CheckCircle2 className="h-4 w-4" />,
          intent: "review",
          disabled: !canReviseOffer,
          action: () => handleReviseOffer(latestOfferId),
        });
      }
      if (canSkip) {
        actions.push({
          label: "Reopen stage to offer",
          tone: "btn-action-neutral",
          icon: <CheckCircle2 className="h-4 w-4" />,
          intent: "advance",
          action: () => handleTransition("offer", "skip"),
        });
      }
    }
    return actions;
  }
  return [];
}
