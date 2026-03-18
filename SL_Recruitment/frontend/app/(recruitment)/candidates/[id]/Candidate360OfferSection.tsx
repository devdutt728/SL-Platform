"use client";

import { ExternalLink } from "lucide-react";
import { CandidateOffer } from "@/lib/types";
import { Chip, Metric } from "./Candidate360Primitives";
import { letterOverrideFields, offerTemplateOptions, principalApproverOptions } from "./candidate360.constants";

type OfferFormState = {
  offerTemplateCode: string;
  offerDesignation: string;
  offerGross: string;
  offerFixed: string;
  offerVariable: string;
  offerCurrency: string;
  offerJoiningDate: string;
  offerProbationMonths: string;
  offerGradeId: string;
  offerNotes: string;
  offerLetterOverrides: Record<string, string>;
};

type OfferFormSetters = {
  setOfferTemplateCode: (value: string) => void;
  setOfferDesignation: (value: string) => void;
  setOfferGross: (value: string) => void;
  setOfferFixed: (value: string) => void;
  setOfferVariable: (value: string) => void;
  setOfferCurrency: (value: string) => void;
  setOfferJoiningDate: (value: string) => void;
  setOfferProbationMonths: (value: string) => void;
  setOfferGradeId: (value: string) => void;
  setOfferNotes: (value: string) => void;
  setOfferLetterOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};

type OfferSectionActions = {
  handleOfferPreview: (offerId: number, kind: "letter" | "email") => Promise<void>;
  handleSubmitOffer: (offerId: number) => Promise<void>;
  handleDeleteOffer: (offerId: number) => Promise<void>;
  handleApproveOffer: (offerId: number) => Promise<void>;
  handleRejectOffer: (offerId: number) => Promise<void>;
  handleSendOffer: (offer: CandidateOffer) => Promise<void>;
  handleResendJoiningLink: (offer: CandidateOffer) => Promise<void>;
  handleAdminDecision: (offerId: number, decision: "accept" | "decline") => Promise<void>;
  handleReviseOffer: (offerId: number) => Promise<void>;
  handleConvertCandidate: () => void | Promise<void>;
  handleSaveDraftOverrides: (offerId: number) => Promise<void>;
  handleCreateOffer: () => Promise<void>;
};

type Props = {
  canAccessOffers: boolean;
  offerRef: React.RefObject<HTMLDivElement>;
  collapsed: boolean;
  onToggle: () => void;
  offersError: string | null;
  offerPreviewError: string | null;
  offersBusy: boolean;
  candidateOffers: CandidateOffer[] | null;
  latestOffer: CandidateOffer | null;
  reviseOfferEligibility: { allowed: boolean; reason: string | null };
  canDelete: boolean;
  canSkip: boolean;
  canSendApprovedOffer: boolean;
  candidateOpeningTitle?: string | null;
  offerApprovalPrincipal: string;
  setOfferApprovalPrincipal: (value: string) => void;
  draftOverridesOpen: boolean;
  setDraftOverridesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  draftLetterOverrides: Record<string, string>;
  setDraftLetterOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  offerPreviewBusy: boolean;
  form: OfferFormState;
  formSetters: OfferFormSetters;
  actions: OfferSectionActions;
  chipTone: (kind: "neutral" | "green" | "amber" | "red" | "blue") => string;
  formatMoney: (raw?: number | null) => string;
  formatDate: (raw?: string | null) => string;
  formatDateTime: (raw?: string | null) => string;
};

export function Candidate360OfferSection({
  canAccessOffers,
  offerRef,
  collapsed,
  onToggle,
  offersError,
  offerPreviewError,
  offersBusy,
  candidateOffers,
  latestOffer,
  reviseOfferEligibility,
  canDelete,
  canSkip,
  canSendApprovedOffer,
  candidateOpeningTitle,
  offerApprovalPrincipal,
  setOfferApprovalPrincipal,
  draftOverridesOpen,
  setDraftOverridesOpen,
  draftLetterOverrides,
  setDraftLetterOverrides,
  offerPreviewBusy,
  form,
  formSetters,
  actions,
  chipTone,
  formatMoney,
  formatDate,
  formatDateTime,
}: Props) {
  if (!canAccessOffers) return null;
  const latestOfferStatus = String(latestOffer?.offer_status || "").toLowerCase();
  const isDraft = latestOfferStatus === "draft";
  const isPendingApproval = latestOfferStatus === "pending_approval";
  const isAccepted = latestOfferStatus === "accepted";
  const canCreateRevisionFromLatestOffer = Boolean(latestOffer && !["draft", "pending_approval"].includes(latestOfferStatus));

  return (
    <div ref={offerRef} className="section-card">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-tight text-slate-500">Offer</p>
        <button
          type="button"
          className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
          onClick={onToggle}
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>
      {collapsed ? null : (
        <div className="mt-3 space-y-3">
          {offersError ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
              {offersError}
            </div>
          ) : null}
          {offerPreviewError ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
              {offerPreviewError}
            </div>
          ) : null}
          {offersBusy && !candidateOffers ? (
            <div className="rounded-2xl border border-white/60 bg-white/30 p-4 text-sm text-slate-600">Loading offers...</div>
          ) : latestOffer ? (
            <div className="rounded-2xl border border-white/60 bg-white/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{latestOffer.offer_template_code}</p>
                  <p className="text-xs text-slate-600">{latestOffer.designation_title || candidateOpeningTitle || "Offer role"}</p>
                </div>
                <Chip className={chipTone(isAccepted ? "green" : latestOfferStatus === "declined" ? "red" : "neutral")}>
                  {latestOfferStatus.replace("_", " ")}
                </Chip>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <Metric label="Gross CTC" value={latestOffer.gross_ctc_annual != null ? formatMoney(latestOffer.gross_ctc_annual) : "-"} />
                <Metric label="Joining date" value={latestOffer.joining_date ? formatDate(latestOffer.joining_date) : "-"} />
                <Metric label="Probation" value={latestOffer.probation_months != null ? `${latestOffer.probation_months} months` : "-"} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <Chip className={chipTone("neutral")}>Offer v{Math.max(1, Number(latestOffer.offer_version || 1))}</Chip>
                <Chip className={chipTone("neutral")}>
                  Recreated {Math.max(0, Number(latestOffer.offer_version || 1) - 1)} time{Math.max(0, Number(latestOffer.offer_version || 1) - 1) === 1 ? "" : "s"}
                </Chip>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                {latestOffer.fixed_ctc_annual != null ? <Chip className={chipTone("blue")}>Fixed {formatMoney(latestOffer.fixed_ctc_annual)}</Chip> : null}
                {latestOffer.variable_ctc_annual != null ? <Chip className={chipTone("amber")}>Variable {formatMoney(latestOffer.variable_ctc_annual)}</Chip> : null}
                {latestOffer.currency ? <Chip className={chipTone("neutral")}>{latestOffer.currency}</Chip> : null}
                {latestOffer.pdf_download_url ? (
                  <a
                    className="inline-flex items-center gap-1 text-slate-800 underline decoration-dotted underline-offset-2"
                    href={latestOffer.pdf_download_url}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Download offer PDF
                  </a>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                  onClick={() => void actions.handleOfferPreview(latestOffer.candidate_offer_id, "letter")}
                  disabled={offerPreviewBusy}
                >
                  Preview letter
                </button>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                  onClick={() => void actions.handleOfferPreview(latestOffer.candidate_offer_id, "email")}
                  disabled={offerPreviewBusy}
                >
                  Preview email
                </button>
                {isDraft ? (
                  <>
                    <label className="min-w-[280px] space-y-1 text-xs text-slate-600">
                      Principal approver
                      <select
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={offerApprovalPrincipal}
                        onChange={(e) => setOfferApprovalPrincipal(e.target.value)}
                      >
                        {principalApproverOptions.map((opt) => (
                          <option key={opt.email} value={opt.email}>
                            {opt.label} ({opt.email})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                      onClick={() => void actions.handleSubmitOffer(latestOffer.candidate_offer_id)}
                      disabled={offersBusy}
                    >
                      Submit for approval
                    </button>
                    {canDelete ? (
                      <button
                        type="button"
                        className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                        onClick={() => void actions.handleDeleteOffer(latestOffer.candidate_offer_id)}
                        disabled={offersBusy}
                      >
                        Delete draft
                      </button>
                    ) : null}
                  </>
                ) : null}
                {isPendingApproval ? (
                  <>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Awaiting principal decision from{" "}
                      <span className="font-semibold">{latestOffer.approval_principal_email || "selected approver"}</span>.
                      {latestOffer.approval_request_expires_at ? ` Link expires on ${formatDateTime(latestOffer.approval_request_expires_at)}.` : ""}
                    </div>
                    {canSkip ? (
                      <>
                        <button
                          type="button"
                          className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                          onClick={() => void actions.handleApproveOffer(latestOffer.candidate_offer_id)}
                          disabled={offersBusy}
                        >
                          Override approve
                        </button>
                        <button
                          type="button"
                          className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                          onClick={() => void actions.handleRejectOffer(latestOffer.candidate_offer_id)}
                          disabled={offersBusy}
                        >
                          Override reject
                        </button>
                      </>
                    ) : null}
                  </>
                ) : null}
                {canSendApprovedOffer ? (
                  <button
                    type="button"
                    className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                    onClick={() => void actions.handleSendOffer(latestOffer)}
                    disabled={offersBusy}
                  >
                    Send to candidate
                  </button>
                ) : null}
                {canSkip && ["approved", "sent", "viewed"].includes(latestOfferStatus) ? (
                  <>
                    <button
                      type="button"
                      className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                      onClick={() => void actions.handleAdminDecision(latestOffer.candidate_offer_id, "accept")}
                      disabled={offersBusy}
                    >
                      Mark accepted
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                      onClick={() => void actions.handleAdminDecision(latestOffer.candidate_offer_id, "decline")}
                      disabled={offersBusy}
                    >
                      Mark declined
                    </button>
                  </>
                ) : null}
                {canAccessOffers && canCreateRevisionFromLatestOffer ? (
                  <>
                    <button
                      type="button"
                      className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                      onClick={() => void actions.handleReviseOffer(latestOffer.candidate_offer_id)}
                      disabled={offersBusy || !reviseOfferEligibility.allowed}
                      title={reviseOfferEligibility.allowed ? "Create revised editable draft offer" : reviseOfferEligibility.reason || "Revision is not allowed"}
                    >
                      Create revised offer draft
                    </button>
                    {!reviseOfferEligibility.allowed ? (
                      <p className="text-xs text-amber-700">{reviseOfferEligibility.reason || "Revision is not allowed in the current stage."}</p>
                    ) : (
                      <p className="text-xs text-slate-600">Creates a new editable draft from the latest generated offer letter.</p>
                    )}
                  </>
                ) : null}
                {isAccepted ? (
                  <>
                    {canSkip ? (
                      <button
                        type="button"
                        className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                        onClick={() => void actions.handleResendJoiningLink(latestOffer)}
                        disabled={offersBusy}
                      >
                        Resend fresh joining link
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                      onClick={() => void actions.handleConvertCandidate()}
                      disabled={offersBusy}
                    >
                      Mark as joined
                    </button>
                  </>
                ) : null}
              </div>
              {isDraft ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Edit draft offer</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <label className="space-y-1 text-xs text-slate-600">
                      Template
                      <select
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={form.offerTemplateCode}
                        onChange={(e) => formSetters.setOfferTemplateCode(e.target.value)}
                      >
                        {offerTemplateOptions.map((opt) => (
                          <option key={opt.code} value={opt.code}>
                            {opt.code} - {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs text-slate-600">
                      Designation
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={form.offerDesignation}
                        onChange={(e) => formSetters.setOfferDesignation(e.target.value)}
                        placeholder="Architect - Level 2"
                      />
                    </label>
                    <label className="space-y-1 text-xs text-slate-600">
                      Gross CTC (annual)
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={form.offerGross}
                        onChange={(e) => formSetters.setOfferGross(e.target.value)}
                        placeholder="1200000"
                      />
                    </label>
                    <label className="space-y-1 text-xs text-slate-600">
                      Fixed CTC (annual)
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={form.offerFixed}
                        onChange={(e) => formSetters.setOfferFixed(e.target.value)}
                        placeholder="1000000"
                      />
                    </label>
                    <label className="space-y-1 text-xs text-slate-600">
                      Variable CTC (annual)
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={form.offerVariable}
                        onChange={(e) => formSetters.setOfferVariable(e.target.value)}
                        placeholder="200000"
                      />
                    </label>
                    <label className="space-y-1 text-xs text-slate-600">
                      Currency
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={form.offerCurrency}
                        onChange={(e) => formSetters.setOfferCurrency(e.target.value)}
                        placeholder="INR"
                      />
                    </label>
                    <label className="space-y-1 text-xs text-slate-600">
                      Joining date
                      <input
                        type="date"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={form.offerJoiningDate}
                        onChange={(e) => formSetters.setOfferJoiningDate(e.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-xs text-slate-600">
                      Probation (months)
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={form.offerProbationMonths}
                        onChange={(e) => formSetters.setOfferProbationMonths(e.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-xs text-slate-600">
                      Grade ID
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={form.offerGradeId}
                        onChange={(e) => formSetters.setOfferGradeId(e.target.value)}
                        placeholder="3"
                      />
                    </label>
                    <label className="space-y-1 text-xs text-slate-600 md:col-span-2">
                      Notes (internal)
                      <textarea
                        className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={form.offerNotes}
                        onChange={(e) => formSetters.setOfferNotes(e.target.value)}
                        placeholder="Offer notes for HR"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Appointment letter variables</p>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                      onClick={() => setDraftOverridesOpen((prev) => !prev)}
                    >
                      {draftOverridesOpen ? "Hide" : "Edit"}
                    </button>
                  </div>
                  {draftOverridesOpen ? (
                    <>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {letterOverrideFields.map((field) => (
                          <label key={field.key} className="space-y-1 text-xs text-slate-600">
                            {field.label}
                            <input
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                              value={draftLetterOverrides[field.key] || ""}
                              onChange={(e) =>
                                setDraftLetterOverrides((prev) => ({
                                  ...prev,
                                  [field.key]: e.target.value,
                                }))
                              }
                              placeholder="-"
                            />
                          </label>
                        ))}
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                          onClick={() => void actions.handleSaveDraftOverrides(latestOffer.candidate_offer_id)}
                          disabled={offersBusy}
                        >
                          Save draft offer
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                        onClick={() => void actions.handleSaveDraftOverrides(latestOffer.candidate_offer_id)}
                        disabled={offersBusy}
                      >
                        Save draft offer
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/60 bg-white/30 p-4">
              <p className="text-sm font-semibold">Create offer</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label className="space-y-1 text-xs text-slate-600">
                  Template
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    value={form.offerTemplateCode}
                    onChange={(e) => formSetters.setOfferTemplateCode(e.target.value)}
                  >
                    {offerTemplateOptions.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.code} - {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  Designation
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    value={form.offerDesignation}
                    onChange={(e) => formSetters.setOfferDesignation(e.target.value)}
                    placeholder="Architect - Level 2"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  Gross CTC (annual)
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    value={form.offerGross}
                    onChange={(e) => formSetters.setOfferGross(e.target.value)}
                    placeholder="1200000"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  Fixed CTC (annual)
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    value={form.offerFixed}
                    onChange={(e) => formSetters.setOfferFixed(e.target.value)}
                    placeholder="1000000"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  Variable CTC (annual)
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    value={form.offerVariable}
                    onChange={(e) => formSetters.setOfferVariable(e.target.value)}
                    placeholder="200000"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  Currency
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    value={form.offerCurrency}
                    onChange={(e) => formSetters.setOfferCurrency(e.target.value)}
                    placeholder="INR"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  Joining date
                  <input
                    type="date"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    value={form.offerJoiningDate}
                    onChange={(e) => formSetters.setOfferJoiningDate(e.target.value)}
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  Probation (months)
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    value={form.offerProbationMonths}
                    onChange={(e) => formSetters.setOfferProbationMonths(e.target.value)}
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  Grade ID
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    value={form.offerGradeId}
                    onChange={(e) => formSetters.setOfferGradeId(e.target.value)}
                    placeholder="3"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-600 md:col-span-2">
                  Notes (internal)
                  <textarea
                    className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    value={form.offerNotes}
                    onChange={(e) => formSetters.setOfferNotes(e.target.value)}
                    placeholder="Offer notes for HR"
                  />
                </label>
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 md:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Appointment letter variables</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {letterOverrideFields.map((field) => (
                      <label key={field.key} className="space-y-1 text-xs text-slate-600">
                        {field.label}
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          value={form.offerLetterOverrides[field.key] || ""}
                          onChange={(e) =>
                            formSetters.setOfferLetterOverrides((prev) => ({
                              ...prev,
                              [field.key]: e.target.value,
                            }))
                          }
                          placeholder="-"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                  onClick={() => void actions.handleCreateOffer()}
                  disabled={offersBusy}
                >
                  {offersBusy ? "Saving..." : "Create offer"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
