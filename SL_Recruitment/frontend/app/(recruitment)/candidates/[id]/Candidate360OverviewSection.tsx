"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { Copy, ExternalLink, FileText, Layers, Mail, Phone } from "lucide-react";
import { CandidateFull, CandidateOffer, CandidateStage, PlatformPersonSuggestion, Screening } from "@/lib/types";
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
  cafState: { label: string; tone: string };
  cafAssessmentSubmittedAt: string | null;
  cafAssessmentSentAt: string | null;
  l2FeedbackEvent: { created_at: string } | null;
  l1FeedbackEvent: { created_at: string } | null;
  onCopyCafLink: () => void;
  onInitCafLinkIfNeeded: () => void;
  docTone: (status?: string | null) => string;
  chipTone: (kind: "neutral" | "green" | "amber" | "red" | "blue") => string;
  formatDateTime: (raw?: string | null) => string;
  formatDate: (raw?: string | null) => string;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  collapsed: boolean;
  cafLocked: boolean;
  cafExpiresAt: Date | null;
  cafDaysLeft: number | null;
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
};

export function Candidate360OverviewSection({
  candidateId,
  candidate,
  candidateInitials,
  canDelete,
  canManageCandidate360,
  busy,
  cafState,
  cafAssessmentSubmittedAt,
  cafAssessmentSentAt,
  l2FeedbackEvent,
  l1FeedbackEvent,
  onCopyCafLink,
  onInitCafLinkIfNeeded,
  docTone,
  chipTone,
  formatDateTime,
  formatDate,
  onExpandAll,
  onCollapseAll,
  collapsed,
  cafLocked,
  cafExpiresAt,
  cafDaysLeft,
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
}: Props) {
  return (
    <div className="grid gap-3 xl:grid-cols-[360px_1fr]">
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

        <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
          <p className="text-xs uppercase tracking-tight text-slate-500">CAF</p>

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
            {cafAssessmentSubmittedAt ? (
              <span className="text-xs text-slate-600">Submitted: {formatDateTime(cafAssessmentSubmittedAt)}</span>
            ) : cafAssessmentSentAt ? (
              <span className="text-xs text-slate-600">Sent: {formatDateTime(cafAssessmentSentAt)}</span>
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
              {cafLocked ? (
                <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-white to-cyan-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-tight text-amber-700">CAF pending</p>
                      <p className="mt-1 text-sm text-slate-700">
                        Candidate must submit CAF before moving to the next stages.
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-600">
                      {cafAssessmentSentAt ? <p>Sent: {formatDateTime(cafAssessmentSentAt)}</p> : null}
                      {cafExpiresAt ? <p>Expires: {formatDate(cafExpiresAt.toISOString())}</p> : null}
                      {cafDaysLeft != null ? <p>{cafDaysLeft} days left</p> : null}
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
                <div className="stage-rail mt-3 rounded-2xl border border-white/70 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    {stageProgressSteps.map((step, idx) => {
                      const state = stageStateKey(stages, currentStageKey, step.key);
                      const stageRow = findStage(stages, step.key);
                      const isTerminal = ["declined", "rejected", "hired"].includes(step.key);
                      const isNegative = ["declined", "rejected"].includes(step.key);
                      const staggerClass = `stage-node-stagger-${(idx % 4) + 1}`;
                      const motion = state === "current" ? `stage-node-active ${staggerClass}` : "";
                      const tone =
                        state === "done"
                          ? isNegative
                            ? "bg-rose-600 text-white"
                            : "bg-emerald-500 text-white"
                          : state === "current"
                            ? isTerminal
                              ? isNegative
                                ? "bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.45)]"
                                : "bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.45)]"
                              : "bg-slate-900 text-white shadow-[0_0_20px_rgba(15,23,42,0.35)]"
                            : "bg-white text-slate-700 border border-slate-200";
                      return (
                        <div key={step.key} className="flex items-center gap-3">
                          <div className={clsx("flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm", tone, motion)}>
                            <span>{step.label}</span>
                            <span className="text-[10px] opacity-80">
                              {stageRow?.started_at ? formatDate(stageRow.started_at) : ""}
                            </span>
                          </div>
                          {idx < stageProgressSteps.length - 1 ? (
                            <div className={clsx("stage-connector", state === "current" ? "" : "stage-connector--idle")} />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {latestOffer?.offer_status === "declined"
                      ? "Offer declined. Joining documents and hiring steps are closed."
                      : latestOffer?.offer_status === "accepted"
                        ? "Offer accepted. Collect joining documents before final hire."
                        : "Offer decision will unlock the next path."}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
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
                            b.disabled || (b.intent !== "reject" && cafLocked) ? "bg-slate-400 cursor-not-allowed" : b.tone
                          )}
                          onClick={() => void b.action()}
                          disabled={busy || (cafLocked && b.intent !== "reject") || b.disabled}
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
