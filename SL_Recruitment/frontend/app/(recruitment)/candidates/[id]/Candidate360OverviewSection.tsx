"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleDot, Copy, ExternalLink, FileText, Layers, Lock, Mail, Phone, Sparkles } from "lucide-react";
import { CandidateEvent, CandidateFull, CandidateOffer, CandidateStage, PlatformPersonSuggestion, Screening } from "@/lib/types";
import { Chip, Metric } from "./Candidate360Primitives";

type StageButton = {
  label: string;
  tone: string;
  icon: JSX.Element;
  intent: string;
  action: () => void | Promise<void>;
  disabled?: boolean;
};

type Props = {
  candidateId: string;
  candidate: CandidateFull["candidate"];
  candidateInitials: string;
  canDelete: boolean;
  canManageCandidate360: boolean;
  busy: boolean;
  showCafSection: boolean;
  cafState: { label: string; tone: string };
  cafSubmittedAt: string | null;
  cafSentAt: string | null;
  assessmentSubmittedAt: string | null;
  assessmentSentAt: string | null;
  l2FeedbackEvent: { created_at: string } | null;
  l1FeedbackEvent: { created_at: string } | null;
  onCopyCafLink: () => void;
  onInitCafLinkIfNeeded: () => void;
  onCopyAssessmentLink: () => void;
  onInitAssessmentLinkIfNeeded: () => void;
  onSendAssessmentLink: () => void;
  docTone: (status?: string | null) => string;
  chipTone: (kind: "neutral" | "green" | "amber" | "red" | "blue") => string;
  formatDateTime: (raw?: string | null) => string;
  formatEventDateTime: (raw?: string | null) => string;
  formatDate: (raw?: string | null) => string;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  collapsed: boolean;
  assessmentLocked: boolean;
  assessmentExpiresAt: Date | null;
  assessmentDaysLeft: number | null;
  l2OwnerSelected: PlatformPersonSuggestion | null;
  l2OwnerQuery: string;
  setL2OwnerSelected: React.Dispatch<React.SetStateAction<PlatformPersonSuggestion | null>>;
  setL2OwnerQuery: (value: string) => void;
  l2OwnerOpen: boolean;
  setL2OwnerOpen: (value: boolean) => void;
  l2OwnerLoading: boolean;
  l2OwnerOptions: PlatformPersonSuggestion[];
  setL2OwnerOptions: React.Dispatch<React.SetStateAction<PlatformPersonSuggestion[]>>;
  l2OwnerSaving: boolean;
  l2OwnerError: string | null;
  onSaveL2Owner: () => void;
  stageProgressSteps: Array<{ key: string; label: string }>;
  stages: CandidateStage[];
  currentStageKey: string | null;
  stageStateKey: (stages: CandidateStage[], currentKey: string | null, stepKey: string) => string;
  findStage: (stages: CandidateStage[], stageName: string) => CandidateStage | null;
  latestOffer: CandidateOffer | null;
  screening: Screening | null | undefined;
  stageButtons: StageButton[];
  stageLabel: (raw?: string | null) => string;
  canAccessOffers: boolean;
  joiningDocsComplete: boolean;
  canSkip: boolean;
  skipStage: string;
  setSkipStage: (value: string) => void;
  skipStageOptions: Array<{ value: string; label: string }>;
  onSkip: () => void;
  onStageTransition: (toStage: string) => void;
  nextBestActions: string[];
  pipelineReplay: CandidateEvent[];
  onJumpTimeline: () => void;
  onJumpScreening: () => void;
  onJumpDocuments: () => void;
  onJumpInterviews: () => void;
  showSprintSection: boolean;
  onJumpSprint: () => void;
  showOfferSection: boolean;
  onJumpOffer: () => void;
};

function isAssessmentLockedStage(stageKey: string) {
  return !["enquiry", "hr_screening", "l2_shortlist", "rejected", "declined", "hired"].includes(stageKey);
}

export function Candidate360OverviewSection({
  candidateId,
  candidate,
  candidateInitials,
  canDelete,
  canManageCandidate360,
  busy,
  showCafSection,
  cafState,
  cafSubmittedAt,
  cafSentAt,
  assessmentSubmittedAt,
  assessmentSentAt,
  l2FeedbackEvent,
  l1FeedbackEvent,
  onCopyCafLink,
  onInitCafLinkIfNeeded,
  onCopyAssessmentLink,
  onInitAssessmentLinkIfNeeded,
  onSendAssessmentLink,
  docTone,
  chipTone,
  formatDateTime,
  formatEventDateTime,
  formatDate,
  onExpandAll,
  onCollapseAll,
  collapsed,
  assessmentLocked,
  assessmentExpiresAt,
  assessmentDaysLeft,
  l2OwnerSelected,
  l2OwnerQuery,
  setL2OwnerSelected,
  setL2OwnerQuery,
  l2OwnerOpen,
  setL2OwnerOpen,
  l2OwnerLoading,
  l2OwnerOptions,
  setL2OwnerOptions,
  l2OwnerSaving,
  l2OwnerError,
  onSaveL2Owner,
  stageProgressSteps,
  stages,
  currentStageKey,
  stageStateKey,
  findStage,
  latestOffer,
  screening,
  stageButtons,
  stageLabel,
  canAccessOffers,
  joiningDocsComplete,
  canSkip,
  skipStage,
  setSkipStage,
  skipStageOptions,
  onSkip,
  onStageTransition,
  nextBestActions,
  pipelineReplay,
  onJumpTimeline,
  onJumpScreening,
  onJumpDocuments,
  onJumpInterviews,
  showSprintSection,
  onJumpSprint,
  showOfferSection,
  onJumpOffer,
}: Props) {
  const assessmentState = assessmentSubmittedAt
    ? { label: "Assessment submitted", tone: chipTone("green") }
    : assessmentSentAt
      ? { label: "Assessment pending", tone: chipTone("amber") }
      : { label: "Assessment not shared", tone: chipTone("neutral") };
  const [selectedStageKey, setSelectedStageKey] = useState<string | null>(currentStageKey);

  useEffect(() => {
    if (!stageProgressSteps.length) {
      setSelectedStageKey(null);
      return;
    }
    const exists = selectedStageKey ? stageProgressSteps.some((item) => item.key === selectedStageKey) : false;
    if (!exists) {
      setSelectedStageKey(currentStageKey || stageProgressSteps[0].key);
    }
  }, [currentStageKey, selectedStageKey, stageProgressSteps]);

  const selectedStage = useMemo(
    () => stageProgressSteps.find((step) => step.key === selectedStageKey) || null,
    [selectedStageKey, stageProgressSteps]
  );
  const selectedStageState = selectedStage ? stageStateKey(stages, currentStageKey, selectedStage.key) : null;
  const selectedStageRow = selectedStage ? findStage(stages, selectedStage.key) : null;
  const canTransitionToSelected =
    canManageCandidate360 &&
    !busy &&
    !!selectedStage &&
    selectedStage.key !== currentStageKey &&
    selectedStageState !== "done" &&
    (!assessmentLocked || !isAssessmentLockedStage(selectedStage.key));
  const stageStateCounts = useMemo(() => {
    return stageProgressSteps.reduce(
      (acc, step) => {
        const state = stageStateKey(stages, currentStageKey, step.key);
        if (state === "done") acc.done += 1;
        if (state === "current") acc.current += 1;
        if (state === "future") acc.future += 1;
        return acc;
      },
      { done: 0, current: 0, future: 0 }
    );
  }, [currentStageKey, stageProgressSteps, stageStateKey, stages]);
  const transitionCtaLabel = busy
    ? "Updating stage..."
    : !canManageCandidate360
      ? "View-only access"
            : !selectedStage
        ? "Select a stage"
        : selectedStage.key === currentStageKey
          ? "Already current stage"
          : selectedStageState === "done"
            ? "Select an upcoming stage"
            : assessmentLocked && isAssessmentLockedStage(selectedStage.key)
              ? "Assessment pending: L2 interview and later stages are locked"
              : `Move to ${selectedStage.label}`;
  return (
    <div className="grid gap-3 xl:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="section-card space-y-3">
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Application docs" value={candidate.application_docs_status} />
            <Metric label="Joining docs" value={candidate.joining_docs_status} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip className={docTone(candidate.application_docs_status)}><FileText className="h-3.5 w-3.5" />Application</Chip>
            <Chip className={docTone(candidate.joining_docs_status)}><FileText className="h-3.5 w-3.5" />Joining</Chip>
          </div>
        </div>

        {showCafSection ? (
        <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
          <p className="text-xs uppercase tracking-tight text-slate-500">CAF & Assessment</p>

          <div className="mt-2 rounded-2xl border border-white/60 bg-gradient-to-r from-cyan-500/10 via-white/20 to-violet-500/10 p-3 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-600 to-violet-600 text-sm font-extrabold tracking-wide text-white shadow-card">
                {candidateInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Basic</p>
                <p className="truncate text-sm font-semibold text-slate-900">{candidate.name}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                  <Layers className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="truncate">{candidate.opening_title || "Not linked"}</span>
                </div>
              </div>
            </div>

            <div className="mt-2 grid gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <Mail className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="truncate">{candidate.email || "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <Phone className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="truncate">{candidate.phone || "—"}</span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip className={cafState.tone}>{cafState.label}</Chip>
            {cafSubmittedAt ? (
              <span className="text-xs text-slate-600">Submitted: {formatDateTime(cafSubmittedAt)}</span>
            ) : cafSentAt ? (
              <span className="text-xs text-slate-600">Sent: {formatDateTime(cafSentAt)}</span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip className={assessmentState.tone}>{assessmentState.label}</Chip>
            {assessmentSubmittedAt ? (
              <span className="text-xs text-slate-600">Submitted: {formatDateTime(assessmentSubmittedAt)}</span>
            ) : assessmentSentAt ? (
              <span className="text-xs text-slate-600">Sent: {formatDateTime(assessmentSentAt)}</span>
            ) : null}
          </div>
          {l2FeedbackEvent ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Chip className={chipTone("green")}>L2 feedback</Chip>
              <span className="text-xs text-slate-600">Submitted: {formatDateTime(l2FeedbackEvent.created_at)}</span>
            </div>
          ) : null}
          {l1FeedbackEvent && l2FeedbackEvent ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Chip className={chipTone("green")}>L1 feedback submitted</Chip>
              <span className="text-xs text-slate-600">Submitted: {formatDateTime(l1FeedbackEvent.created_at)}</span>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-white"
              onClick={onCopyCafLink}
              onMouseEnter={onInitCafLinkIfNeeded}
              disabled={busy || !canManageCandidate360}
            >
              <Copy className="h-4 w-4" />
              Copy CAF link
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-white disabled:opacity-60"
              onClick={onCopyAssessmentLink}
              onMouseEnter={onInitAssessmentLinkIfNeeded}
              disabled={busy || !canManageCandidate360 || !!assessmentSubmittedAt}
            >
              <Copy className="h-4 w-4" />
              Copy assessment link
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-white disabled:opacity-60"
              onClick={onSendAssessmentLink}
              disabled={busy || !canManageCandidate360 || !!assessmentSubmittedAt}
            >
              <Mail className="h-4 w-4" />
              {assessmentSentAt ? "Resend assessment email" : "Send assessment email"}
            </button>
            <Link
              href={`/candidates/${encodeURIComponent(candidateId)}/caf`}
              className={clsx(
                "btn-action-neutral inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-card"
              )}
            >
              <ExternalLink className="h-4 w-4" />
              View CAF
            </Link>
          </div>
        </div>
        ) : null}

        {canDelete ? (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3">
            <p className="text-xs uppercase tracking-tight text-rose-700">Restricted</p>
            <p className="mt-1 text-sm text-rose-700">Delete is available on this candidate.</p>
          </div>
        ) : null}
      </aside>

      <div className="space-y-4">
        <div className="section-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-tight text-slate-500">Overview</p>
              <h2 className="text-lg font-semibold">All controls in one place</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Auto-updating
              </span>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
                onClick={onExpandAll}
              >
                Expand all
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
                onClick={onCollapseAll}
              >
                Collapse all
              </button>
            </div>
          </div>

          {collapsed ? null : (
            <div className="mt-4 space-y-4">
              {showCafSection && assessmentLocked ? (
                <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-white to-cyan-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-tight text-amber-700">Assessment pending</p>
                      <p className="mt-1 text-sm text-slate-700">
                        Candidate must submit the assessment before moving to the L2 interview and later stages.
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-600">
                      {assessmentSentAt ? <p>Sent: {formatDateTime(assessmentSentAt)}</p> : null}
                      {assessmentExpiresAt ? <p>Expires: {formatDate(assessmentExpiresAt.toISOString())}</p> : null}
                      {assessmentDaysLeft != null ? <p>{assessmentDaysLeft} days left</p> : null}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-cyan-50 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-tight text-slate-500">GL / L2 Owner</p>
                    <p className="mt-1 text-sm text-slate-700">Required before HR screening. Used for interview visibility.</p>
                  </div>
                  <Chip className={candidate.l2_owner_email ? chipTone("green") : chipTone("amber")}>
                    {candidate.l2_owner_email ? "Assigned" : "Required"}
                  </Chip>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                  <div className="relative">
                    <input
                      value={
                        l2OwnerSelected
                          ? `${l2OwnerSelected.full_name} (${l2OwnerSelected.email})`
                          : l2OwnerQuery
                      }
                      onChange={(e) => {
                        if (!canManageCandidate360) return;
                        setL2OwnerSelected(null);
                        setL2OwnerQuery(e.target.value);
                      }}
                      onFocus={() => {
                        if (!canManageCandidate360) return;
                        setL2OwnerOpen(true);
                      }}
                      onBlur={() => window.setTimeout(() => setL2OwnerOpen(false), 150)}
                      className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                      placeholder="Type name or email"
                      disabled={!canManageCandidate360}
                    />
                    {l2OwnerLoading ? (
                      <div className="absolute right-3 top-2 text-xs text-slate-500">Searching…</div>
                    ) : null}
                    {!l2OwnerSelected && canManageCandidate360 && l2OwnerOpen && l2OwnerOptions.length > 0 ? (
                      <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
                        {l2OwnerOptions.map((person) => (
                          <button
                            key={person.person_id}
                            type="button"
                            className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() => {
                              setL2OwnerSelected(person);
                              setL2OwnerOptions([]);
                            }}
                          >
                            <span className="truncate">
                              <span className="font-medium">{person.full_name}</span>{" "}
                              <span className="text-slate-500">({person.email})</span>
                            </span>
                            <span className="shrink-0 text-xs text-slate-500">{person.role_name || person.role_code || ""}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-card disabled:opacity-60"
                    onClick={onSaveL2Owner}
                    disabled={!canManageCandidate360 || l2OwnerSaving}
                  >
                    {l2OwnerSaving ? "Saving..." : canManageCandidate360 ? "Save" : "View only"}
                  </button>
                </div>
                {l2OwnerSelected ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Selected: {l2OwnerSelected.full_name} • {l2OwnerSelected.email}
                  </p>
                ) : candidate.l2_owner_email ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Current: {candidate.l2_owner_name || candidate.l2_owner_email} • {candidate.l2_owner_email}
                  </p>
                ) : null}
                {l2OwnerError ? (
                  <p className="mt-2 text-xs text-rose-700">{l2OwnerError}</p>
                ) : null}
                {!canManageCandidate360 ? (
                  <p className="mt-2 text-xs text-slate-500">GL / L2 owner updates are not available in this view.</p>
                ) : null}
              </div>
              <div>
                <p className="text-xs uppercase tracking-tight text-slate-500">Stage progress</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {[
                    { label: "Timeline", action: onJumpTimeline },
                    { label: "Screening", action: onJumpScreening },
                    { label: "Documents", action: onJumpDocuments },
                    { label: "Interviews", action: onJumpInterviews },
                    ...(showSprintSection ? [{ label: "Sprint", action: onJumpSprint }] : []),
                    ...(showOfferSection ? [{ label: "Offer", action: onJumpOffer }] : []),
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={item.action}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 rounded-3xl border border-[#e9d8cc] bg-[linear-gradient(155deg,rgba(255,251,247,0.94),rgba(247,239,233,0.78))] p-2.5 shadow-[0_10px_30px_rgba(93,85,82,0.10)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-tight text-[#70594d]">Cozy Stage Flow</p>
                      <p className="mt-1 text-xs text-[#79685f]">
                        {canManageCandidate360
                          ? "Select a stage card, review details, then transition from the side panel."
                          : "Stage transitions are locked in this access mode. You can still inspect all stages."}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full border border-[#bdd4c7] bg-[#eef8f1] px-2.5 py-1 text-[11px] font-semibold text-[#3f6a53]">
                        <span className="h-2 w-2 rounded-full bg-[#5d9878] animate-pulse" />
                        Live sync on
                      </span>
                      <Chip className={chipTone("green")}>Done: {stageStateCounts.done}</Chip>
                      <Chip className={chipTone("amber")}>Upcoming: {stageStateCounts.future}</Chip>
                    </div>
                  </div>

                  <div className="mt-2.5 grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_270px]">
                    <div className="rounded-2xl border border-[#ead9cd] bg-white/70 p-2">
                      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
                        {stageProgressSteps.map((step, idx) => {
                          const state = stageStateKey(stages, currentStageKey, step.key);
                          const stageRow = findStage(stages, step.key);
                          const isCurrent = state === "current";
                          const isDone = state === "done";
                          const isSelected = selectedStageKey === step.key;
                          const isNegative = ["declined", "rejected"].includes(step.key);
                          const isTerminal = ["declined", "rejected", "hired"].includes(step.key);
                          const cardTone = isCurrent
                            ? isTerminal
                              ? isNegative
                                ? "border-[#b35b5b] bg-[linear-gradient(135deg,#905050,#b35b5b)] text-rose-50"
                                : "border-[#4e7b66] bg-[linear-gradient(135deg,#3f6756,#4e7b66)] text-emerald-50"
                              : "border-[#6a4f42] bg-[linear-gradient(135deg,#5d453b,#7a5a4a)] text-amber-50"
                            : isDone
                              ? isNegative
                                ? "border-[#efcaca] bg-[#fff5f5] text-[#7f4a4a]"
                                : "border-[#c8dece] bg-[#f3faf5] text-[#2f5f4a]"
                              : "border-[#e5d8ce] bg-[#fffdfa] text-[#6a5c54]";
                          return (
                            <button
                              key={step.key}
                              type="button"
                              className={clsx(
                                "group relative overflow-hidden rounded-md border px-2 py-1.5 text-left transition hover:-translate-y-0.5 hover:shadow-sm",
                                cardTone,
                                isSelected ? "ring-1 ring-[#d28a63]" : ""
                              )}
                              onClick={() => setSelectedStageKey(step.key)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className={clsx(
                                    "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                                    isCurrent ? "bg-white/20" : "bg-black/5"
                                  )}>
                                    {isCurrent ? <Sparkles className="h-2.5 w-2.5" /> : isDone ? <CheckCircle2 className="h-2.5 w-2.5" /> : <CircleDot className="h-2.5 w-2.5" />}
                                  </span>
                                  <span className="truncate text-[12px] font-semibold">{step.label}</span>
                                </div>
                                <span className={clsx(
                                  "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                                  isCurrent ? "bg-white/20 text-white" : "bg-black/10 text-current"
                                )}>
                                  #{idx + 1}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-1.5">
                                <span className={clsx("text-[9px]", isCurrent ? "text-white/85" : "opacity-80")}>
                                  {stageRow?.started_at ? formatDate(stageRow.started_at) : "Not started"}
                                </span>
                                <span className={clsx(
                                  "rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide",
                                  isCurrent ? "bg-white/20 text-white" : "bg-black/10 text-current"
                                )}>
                                  {isCurrent ? "Current" : isDone ? "Done" : "Next"}
                                </span>
                              </div>
                              {isSelected ? (
                                <span className={clsx(
                                  "pointer-events-none absolute bottom-0 left-0 h-0.5 w-full",
                                  isCurrent ? "bg-white/70" : "bg-[#d28a63]"
                                )} />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#e2c8b8] bg-[linear-gradient(160deg,#fff8f2,#fffdfb)] p-3 shadow-[0_10px_24px_rgba(93,85,82,0.12)]">
                      <p className="text-xs uppercase tracking-tight text-[#ad5f38]">Selected stage</p>
                      <p className="mt-1 text-[15px] font-semibold text-slate-900">{selectedStage?.label || "No stage selected"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Chip className={chipTone("neutral")}>Current: {stageStateCounts.current}</Chip>
                        {selectedStageState === "current" ? <Chip className={chipTone("blue")}>Current</Chip> : null}
                        {selectedStageState === "done" ? <Chip className={chipTone("green")}>Completed</Chip> : null}
                        {selectedStageState === "future" ? <Chip className={chipTone("amber")}>Upcoming</Chip> : null}
                        {selectedStageRow?.started_at ? (
                          <span className="text-xs text-slate-600">Started: {formatDate(selectedStageRow.started_at)}</span>
                        ) : (
                          <span className="text-xs text-slate-600">No start timestamp yet</span>
                        )}
                      </div>
                      <p className="mt-2.5 text-xs text-[#79685f]">
                        {canManageCandidate360
                          ? "Transitions are one-click from this panel and sync live across sessions."
                          : "You can inspect stage readiness here, but transitions require manage access."}
                      </p>
                      {assessmentLocked ? (
                        <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                          <Lock className="h-3.5 w-3.5" />
                          Assessment pending: L2 interview and later stages are blocked
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className={clsx(
                          "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-card disabled:opacity-60",
                          canTransitionToSelected ? "btn-action-success" : "bg-slate-400 cursor-not-allowed"
                        )}
                        onClick={() => {
                          if (!selectedStage || !canTransitionToSelected) return;
                          onStageTransition(selectedStage.key);
                        }}
                        disabled={!canTransitionToSelected}
                      >
                        <ArrowRight className="h-4 w-4" />
                        {transitionCtaLabel}
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-500">
                    {latestOffer?.offer_status === "declined"
                      ? "Latest offer was declined. Candidate stays active for negotiation until HR closes as Rejected with a reason or marks Hired."
                      : latestOffer?.offer_status === "accepted"
                        ? "Offer accepted. Collect joining documents before final hire."
                        : "Offer decision will unlock the next path."}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-white/60 bg-white/30 p-4">
                    <p className="text-xs uppercase tracking-tight text-slate-500">Key screening values</p>
                    {screening ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <Metric label="Relocate" value={screening.willing_to_relocate == null ? "?" : screening.willing_to_relocate ? "Yes" : "No"} />
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">No screening submitted yet.</p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                    <p className="text-xs uppercase tracking-tight text-amber-800">Next best actions</p>
                    <div className="mt-2 space-y-1.5">
                      {nextBestActions.map((item) => (
                        <p key={item} className="text-sm text-amber-900">
                          - {item}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/60 bg-white/30 p-4">
                  <p className="text-xs uppercase tracking-tight text-slate-500">Stage controls</p>
                  <p className="mt-2 text-sm text-slate-700">Current stage: <span className="font-semibold">{stageLabel(candidate.current_stage)}</span></p>
                  {stageButtons.length ? (
                    <div className="mt-3 grid gap-2">
                      {stageButtons.map((b) => (
                        <button
                          key={b.label}
                          type="button"
                          className={clsx(
                            "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-card disabled:opacity-60",
                            b.disabled ? "bg-slate-400 cursor-not-allowed" : b.tone
                          )}
                          onClick={() => void b.action()}
                          disabled={busy || b.disabled}
                        >
                          {b.icon}
                          {busy ? "Working..." : b.label}
                        </button>
                      ))}
                    </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">
                  {canManageCandidate360 ? "Use the action buttons above to jump into the next step." : "Stage actions are locked in this view."}
                </p>
              )}
                  {!candidate.l2_owner_email && currentStageKey === "enquiry" ? (
                    <p className="mt-2 text-xs text-amber-700">Assign GL/L2 email to unlock HR screening.</p>
                  ) : null}
                  {currentStageKey === "joining_documents" && canAccessOffers && !joiningDocsComplete ? (
                    <p className="mt-2 text-xs text-amber-700">
                      Upload all mandatory joining documents (PAN, Aadhaar, marksheets, experience letters, salary slips) to unlock Mark as joined.
                    </p>
                  ) : null}

                  {canSkip ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
                      <p className="text-xs uppercase tracking-tight text-amber-700">Advanced skip</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 md:w-auto"
                          value={skipStage}
                          onChange={(e) => setSkipStage(e.target.value)}
                        >
                          <option value="">Advance/Skip to...</option>
                          {skipStageOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-card disabled:opacity-60"
                          onClick={onSkip}
                          disabled={busy || !skipStage}
                        >
                          {busy ? "Working..." : "Confirm skip"}
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] text-amber-700">Use only when skipping is required by leadership.</p>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/60 p-4 lg:col-span-2">
                  <p className="text-xs uppercase tracking-tight text-slate-500">Pipeline replay</p>
                  {pipelineReplay.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600">No replay events yet.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {pipelineReplay.map((event) => (
                        <div key={event.event_id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
                          <span className="text-[11px] font-semibold text-slate-800">{event.action_type.replace(/_/g, " ")}</span>
                          <span className="text-[10px] text-slate-500">{formatEventDateTime(event.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
