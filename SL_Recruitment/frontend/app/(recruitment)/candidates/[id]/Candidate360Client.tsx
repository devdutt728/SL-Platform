"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BASIC_DETAILS_FORM_LABEL,
  CANDIDATE_ASSESSMENT_FORM_LABEL,
  basicDetailsStatusLabel,
} from "@/lib/recruitment-terms";
import { CandidateAssessment, CandidateConvertPayload, CandidateFull, JoiningDoc, JoiningProfile, Screening } from "@/lib/types";
import { ExternalLink } from "lucide-react";
import { defaultTransitionDecision, normalizeRecruitmentStage } from "@/lib/recruitment-stages";
import { DeleteCandidateButton } from "./DeleteCandidateButton";
import { ActionDialog } from "@/components/ui/action-dialog";
import { useToast } from "@/components/ui/toast-provider";
import * as candidate360Api from "./candidate360.api";
import { Candidate360HtmlPreviewModal } from "./Candidate360HtmlPreviewModal";
import { Candidate360ConvertDialog, type CandidateConvertFormState } from "./Candidate360ConvertDialog";
import { Candidate360OfferSection } from "./Candidate360OfferSection";
import { Chip } from "./Candidate360Primitives";
import { Candidate360TimelineSection } from "./Candidate360TimelineSection";
import { Candidate360DocumentsSection } from "./Candidate360DocumentsSection";
import { Candidate360ScreeningSection } from "./Candidate360ScreeningSection";
import { Candidate360InterviewsSection } from "./Candidate360InterviewsSection";
import { Candidate360SchedulePanel } from "./Candidate360SchedulePanel";
import { Candidate360SprintSection } from "./Candidate360SprintSection";
import { Candidate360OverviewSection } from "./Candidate360OverviewSection";
import { buildCandidate360StageButtons, type Candidate360StageButton } from "./candidate360.stage-actions";
import { useCandidate360Sprints } from "./useCandidate360Sprints";
import { useCandidate360Offers } from "./useCandidate360Offers";
import { useCandidate360Interviews } from "./useCandidate360Interviews";
import { useCandidate360Lifecycle } from "./useCandidate360Lifecycle";
import { useCandidate360SectionState } from "./useCandidate360SectionState";
import { useCandidate360RealtimeRefresh } from "./useCandidate360RealtimeRefresh";
import {
  bestEffortFromMeta,
  chipTone,
  decisionTone,
  docTone,
  findStage,
  formatBytes,
  formatDate,
  formatDateTime,
  formatEventDateTime,
  formatInviteExpiry,
  formatMoney,
  formatRelativeDue,
  isCancelledInterview,
  isNotTakenInterview,
  joiningDocLabel,
  joiningDocOptions,
  normalizeJoiningDocType,
  normalizeStage,
  pipelineStages,
  postAcceptanceStages,
  postDeclineStages,
  postRejectStages,
  requiredJoiningDocTypes,
  screeningLabel,
  screeningTone,
  skipStageOptions,
  stageLabel,
  stageOrder,
  stageStateKey,
  statusTone,
  valueOrDash,
  yesNo,
  documentPreviewPath,
} from "./candidate360.client-utils";

type Props = {
  candidateId: string;
  initial: CandidateFull;
  canManageCandidate360: boolean;
  canDelete: boolean;
  canSchedule: boolean;
  canSkip: boolean;
  canCancelInterview: boolean;
  canUploadJoiningDocs: boolean;
  canAccessOffers: boolean;
  canOpenDriveFolder: boolean;
  canViewJoiningWorkspace: boolean;
};

type DialogState = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "neutral" | "danger" | "success";
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  error?: string | null;
  onConfirm: (value?: string) => void | Promise<void>;
};

const fetchFull = candidate360Api.fetchFull;
const fetchCafLink = candidate360Api.fetchCafLink;
const fetchAssessmentLink = candidate360Api.fetchAssessmentLink;
const resendAssessmentLink = candidate360Api.resendAssessmentLink;
const fetchCandidateSprints = candidate360Api.fetchCandidateSprints;
const deleteCandidateSprint = candidate360Api.deleteCandidateSprint;
const fetchJoiningDocs = candidate360Api.fetchJoiningDocs;
const uploadJoiningDoc = candidate360Api.uploadJoiningDoc;
const sendInternSelectionEmailRequest = candidate360Api.sendInternSelectionEmail;

const STUDIOLOTUS_EMAIL_DOMAIN = "studiolotus.in";
const INTERN_OPENING_CODES = new Set(["INTR-8299B8", "CMIN-8299B0"]);

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalInteger(value: string, label: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be a whole number.`);
  }
  return parsed;
}

function splitFullName(name: string): { firstName: string; lastName: string } {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
  return { firstName, lastName };
}

function looksLikeIntern(value: string | null | undefined): boolean {
  return (value || "").toLowerCase().includes("intern");
}

function emptyConvertForm(): CandidateConvertFormState {
  return {
    personal_id: "",
    aadhaar_number: "",
    pan_verified: false,
    aadhaar_verified: false,
    first_name: "",
    last_name: "",
    email: "",
    mobile_number: "",
    role_id: "",
    grade_id: "",
    department_id: "",
    manager_id: "",
    employment_type: "",
    join_date: "",
    exit_date: "",
    status: "working",
    source_system: "recruitment",
    full_name: "",
    display_name: "",
  };
}

export function Candidate360Client({
  candidateId,
  initial,
  canManageCandidate360,
  canDelete,
  canSchedule,
  canSkip,
  canCancelInterview,
  canUploadJoiningDocs,
  canAccessOffers,
  canOpenDriveFolder,
  canViewJoiningWorkspace,
}: Props) {
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const [data, setData] = useState<CandidateFull>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({
    open: false,
    title: "",
    description: "",
    confirmLabel: "Confirm",
    tone: "neutral",
    requireReason: false,
    reasonLabel: "Reason",
    reasonPlaceholder: "",
    error: null,
    onConfirm: () => undefined,
  });
  const [cafLink, setCafLink] = useState<{
    basic_details_form_token?: string;
    basic_details_form_url?: string;
    caf_token?: string;
    caf_url?: string;
  } | null>(null);
  const [assessmentLink, setAssessmentLink] = useState<{
    candidate_assessment_form_token?: string;
    candidate_assessment_form_url?: string;
    assessment_token?: string;
    assessment_url?: string;
  } | null>(null);
  const [joiningDocs, setJoiningDocs] = useState<JoiningDoc[] | null>(null);
  const [joiningDocsBusy, setJoiningDocsBusy] = useState(false);
  const [joiningDocsError, setJoiningDocsError] = useState<string | null>(null);
  const [joiningDocsNotice, setJoiningDocsNotice] = useState<string | null>(null);
  const [joiningDocType, setJoiningDocType] = useState(joiningDocOptions[0]?.value || "pan");
  const [joiningDocFile, setJoiningDocFile] = useState<File | null>(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertDialogBusy, setConvertDialogBusy] = useState(false);
  const [convertDialogError, setConvertDialogError] = useState<string | null>(null);
  const [convertForm, setConvertForm] = useState<CandidateConvertFormState>(emptyConvertForm);
  const [convertPersonCodePreview, setConvertPersonCodePreview] = useState("");
  const [convertPersonCodePreviewBusy, setConvertPersonCodePreviewBusy] = useState(false);
  const [convertNormalizedEmploymentType, setConvertNormalizedEmploymentType] = useState("");
  const [sprintDeleteBusy, setSprintDeleteBusy] = useState(false);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const screeningRef = useRef<HTMLDivElement | null>(null);
  const documentsRef = useRef<HTMLDivElement | null>(null);
  const interviewsRef = useRef<HTMLDivElement | null>(null);
  const sprintRef = useRef<HTMLDivElement | null>(null);
  const offerRef = useRef<HTMLDivElement | null>(null);
  const { collapsedSections, toggleSection, setAllSections, focusSection } = useCandidate360SectionState();

  const candidate = data.candidate;
  const assessment = data.assessment as CandidateAssessment | null | undefined;
  const joiningProfile = data.joining_profile as JoiningProfile | null | undefined;
  const isInternWorkflow =
    candidate.workflow_variant === "intern_l2_only" || INTERN_OPENING_CODES.has(String(candidate.opening_code || "").toUpperCase());
  const candidateInitials = useMemo(() => {
    const parts = (candidate.name || "").trim().split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || "";
    const second = parts.length > 1 ? parts[1]?.[0] || "" : "";
    return (first + second).toUpperCase() || "C";
  }, [candidate.name]);
  const currentStageKey = normalizeStage(candidate.current_stage);
  const hasInternSelectionEmailSent = useMemo(() => {
    if (!isInternWorkflow) return false;
    return (data.events || []).some((event) => {
      if ((event.action_type || "").toLowerCase() !== "email_sent") return false;
      const emailType = String((event.meta_json as { email_type?: unknown })?.email_type || "").trim().toLowerCase();
      return emailType === "intern_selection";
    });
  }, [data.events, isInternWorkflow]);
  const cafSentAt = isInternWorkflow ? null : candidate.basic_details_form_sent_at || candidate.caf_sent_at || null;
  const cafSubmittedAt = isInternWorkflow ? null : candidate.basic_details_form_submitted_at || candidate.caf_submitted_at || null;
  const assessmentSentAt =
    isInternWorkflow ? null : assessment?.candidate_assessment_form_sent_at || assessment?.assessment_sent_at || null;
  const assessmentSubmittedAt =
    isInternWorkflow
      ? null
      : assessment?.candidate_assessment_form_submitted_at || assessment?.assessment_submitted_at || null;
  const assessmentGateActive = !isInternWorkflow && !!assessmentSentAt;
  const assessmentLocked = assessmentGateActive && !assessmentSubmittedAt;
  const assessmentExpiryDays = 3;
  const assessmentSentDate = assessmentSentAt ? new Date(assessmentSentAt) : null;
  const assessmentExpiresAt = assessmentSentDate
    ? new Date(assessmentSentDate.getTime() + assessmentExpiryDays * 24 * 60 * 60 * 1000)
    : null;
  const assessmentDaysLeft =
    assessmentExpiresAt && assessmentSentDate
      ? Math.max(0, Math.ceil((assessmentExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : null;

  const cafState = useMemo(() => {
    if (isInternWorkflow) {
      return {
        label: basicDetailsStatusLabel({ required: false, notRequiredLabel: "Basic details already available" }),
        tone: chipTone("blue"),
      };
    }
    const generated = !!cafSentAt;
    const submitted = !!cafSubmittedAt;
    if (submitted) return { label: basicDetailsStatusLabel({ required: true, sentAt: cafSentAt, submittedAt: cafSubmittedAt }), tone: chipTone("green") };
    if (generated) return { label: basicDetailsStatusLabel({ required: true, sentAt: cafSentAt }), tone: chipTone("amber") };
    return { label: basicDetailsStatusLabel({ required: true }), tone: chipTone("neutral") };
  }, [cafSentAt, cafSubmittedAt, isInternWorkflow]);
  const needsReviewChip = useMemo(() => {
    if (!candidate.needs_hr_review) return null;
    return <Chip className={chipTone("amber")}>Needs HR review</Chip>;
  }, [candidate.needs_hr_review]);

  function closeDialog() {
    setDialog((prev) => ({ ...prev, open: false, error: null }));
  }

  function openDialog(next: Omit<DialogState, "open">) {
    setDialog({ ...next, open: true, error: null });
  }

  const refreshAll = useCallback(async () => {
    const full = await fetchFull(candidateId);
    setData(full);
    if (isInternWorkflow) {
      setCafLink(null);
      setAssessmentLink(null);
      return;
    }
    try {
      const nextAssessment = full.assessment as CandidateAssessment | null | undefined;
      const [nextCafLink, nextAssessmentLink] = await Promise.all([
        fetchCafLink(candidateId).catch(() => null),
        nextAssessment?.candidate_assessment_form_sent_at || nextAssessment?.assessment_sent_at || assessmentLink
          ? fetchAssessmentLink(candidateId).catch(() => null)
          : Promise.resolve(null),
      ]);
      setCafLink(nextCafLink);
      setAssessmentLink(nextAssessmentLink);
    } catch {
      // ignore
    }
  }, [assessmentLink, candidateId, isInternWorkflow]);

  const {
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
  } = useCandidate360Lifecycle({
    candidateId,
    candidate,
    canManageCandidate360,
    refreshAll,
    setData,
    setBusy,
    setError,
    openDialog,
    closeDialog,
    setDialogError: (dialogError) => {
      setDialog((prev) => ({ ...prev, error: dialogError }));
    },
    pushToast,
  });

  const {
    candidateOffers,
    offersBusy,
    offersError,
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
    handleResendJoiningLink,
    handleAdminDecision,
    handleSaveDraftOverrides,
    handleDeleteOffer,
    handleReviseOffer,
    handleConvertCandidate,
  } = useCandidate360Offers({
    candidateId,
    candidate,
    canAccessOffers,
    refreshAll,
    openDialog,
    closeDialog,
    setDialogError: (dialogError) => {
      setDialog((prev) => ({ ...prev, error: dialogError }));
    },
    pushToast,
  });

  const openConvertDialog = useCallback(() => {
    const splitFromName = splitFullName(candidate.name || "");
    const firstName = (candidate.first_name || splitFromName.firstName || "").trim();
    const lastName = (candidate.last_name || splitFromName.lastName || "").trim();
    const fullName = (candidate.name || [firstName, lastName].filter(Boolean).join(" ")).trim();
    const internByRole = looksLikeIntern(latestOffer?.designation_title) || looksLikeIntern(candidate.opening_title);
    const offerGradeId = latestOffer?.grade_id_platform != null ? String(latestOffer.grade_id_platform) : "";
    const offerJoinDate = latestOffer?.joining_date ? latestOffer.joining_date.slice(0, 10) : "";

    setConvertForm({
      personal_id: (joiningProfile?.personal_id || "").trim(),
      aadhaar_number: (joiningProfile?.aadhaar_number || "").trim(),
      pan_verified: Boolean(joiningProfile?.pan_verified),
      aadhaar_verified: Boolean(joiningProfile?.aadhaar_verified),
      first_name: firstName,
      last_name: lastName,
      email: (candidate.email || "").trim().toLowerCase(),
      mobile_number: (joiningProfile?.mobile_number || assessment?.contact_number || candidate.phone || "").trim(),
      role_id: offerGradeId,
      grade_id: offerGradeId,
      department_id: "",
      manager_id: "",
      employment_type: internByRole ? "Intern" : "Permanent",
      join_date: offerJoinDate,
      exit_date: "",
      status: "working",
      source_system: "recruitment",
      full_name: fullName,
      display_name: fullName,
    });
    setConvertPersonCodePreview("");
    setConvertPersonCodePreviewBusy(false);
    setConvertNormalizedEmploymentType("");
    setConvertDialogError(null);
    setConvertDialogOpen(true);
  }, [
    candidate.email,
    candidate.first_name,
    candidate.last_name,
    candidate.name,
    candidate.opening_title,
    candidate.phone,
    joiningProfile?.aadhaar_number,
    joiningProfile?.aadhaar_verified,
    joiningProfile?.mobile_number,
    joiningProfile?.pan_verified,
    joiningProfile?.personal_id,
    latestOffer?.designation_title,
    latestOffer?.grade_id_platform,
    latestOffer?.joining_date,
    assessment?.contact_number,
  ]);

  useEffect(() => {
    if (!convertDialogOpen) {
      setConvertPersonCodePreview("");
      setConvertPersonCodePreviewBusy(false);
      setConvertNormalizedEmploymentType("");
      return;
    }

    const employmentType = (convertForm.employment_type || "").trim();
    const email = (convertForm.email || "").trim().toLowerCase();
    if (!employmentType) {
      setConvertPersonCodePreview("");
      setConvertPersonCodePreviewBusy(false);
      setConvertNormalizedEmploymentType("");
      return;
    }

    let cancelled = false;
    setConvertPersonCodePreviewBusy(true);
    candidate360Api
      .fetchConvertPreview(candidateId, employmentType, email)
      .then((preview) => {
        if (cancelled) return;
        setConvertPersonCodePreview((preview.person_code || "").trim());
        setConvertNormalizedEmploymentType((preview.normalized_employment_type || "").trim());
      })
      .catch((e: any) => {
        if (cancelled) return;
        setConvertPersonCodePreview("");
        setConvertNormalizedEmploymentType("");
        setConvertDialogError((prev) => prev || e?.message || "Could not generate employee code preview.");
      })
      .finally(() => {
        if (cancelled) return;
        setConvertPersonCodePreviewBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [candidateId, convertDialogOpen, convertForm.email, convertForm.employment_type]);

  const convertInternRoleDetected = useMemo(() => {
    return looksLikeIntern(convertForm.employment_type) || looksLikeIntern(latestOffer?.designation_title);
  }, [convertForm.employment_type, latestOffer?.designation_title]);

  const convertRequiresStudioLotusDomain = useMemo(() => {
    const employmentType = (convertNormalizedEmploymentType || convertForm.employment_type || "").toLowerCase();
    const permanent = employmentType.includes("permanent");
    return permanent && !convertInternRoleDetected;
  }, [convertForm.employment_type, convertInternRoleDetected, convertNormalizedEmploymentType]);

  const handleSubmitConvertDialog = useCallback(async () => {
    setConvertDialogBusy(true);
    setConvertDialogError(null);
    try {
      const firstName = (convertForm.first_name || "").trim();
      const employmentType = (convertForm.employment_type || "").trim();
      const email = (convertForm.email || "").trim().toLowerCase();
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      if (!firstName) throw new Error("First name is required.");
      if (!employmentType) throw new Error("Employment type is required.");
      if (!convertPersonCodePreview.trim()) throw new Error("Employee code preview is not ready yet.");
      if (!email || !emailValid) throw new Error("Enter a valid email address.");
      if (convertRequiresStudioLotusDomain && !email.endsWith(`@${STUDIOLOTUS_EMAIL_DOMAIN}`)) {
        throw new Error("Permanent employees must use a @studiolotus.in email.");
      }
      if (!convertForm.personal_id.trim()) throw new Error("PAN number is missing from the joining profile.");
      if (!convertForm.aadhaar_number.trim()) throw new Error("Aadhaar number is missing from the joining profile.");
      if (!convertForm.pan_verified) throw new Error("Verify PAN against the uploaded document before final hire.");
      if (!convertForm.aadhaar_verified) throw new Error("Verify Aadhaar against the uploaded document before final hire.");

      const lastName = normalizeOptionalText(convertForm.last_name);
      const fallbackFullName = [firstName, lastName].filter(Boolean).join(" ").trim();
      const fullName = normalizeOptionalText(convertForm.full_name) || fallbackFullName;
      const displayName = normalizeOptionalText(convertForm.display_name) || fullName || firstName;

      const payload: CandidateConvertPayload = {
        employee_profile: {
          personal_id: normalizeOptionalText(convertForm.personal_id),
          first_name: firstName,
          last_name: lastName,
          email,
          mobile_number: normalizeOptionalText(convertForm.mobile_number),
          role_id: parseOptionalInteger(convertForm.role_id, "Role ID"),
          grade_id: parseOptionalInteger(convertForm.grade_id, "Grade ID"),
          department_id: parseOptionalInteger(convertForm.department_id, "Department ID"),
          manager_id: normalizeOptionalText(convertForm.manager_id),
          employment_type: employmentType,
          join_date: normalizeOptionalText(convertForm.join_date),
          exit_date: normalizeOptionalText(convertForm.exit_date),
          status: normalizeOptionalText(convertForm.status) || "working",
          source_system: normalizeOptionalText(convertForm.source_system) || "recruitment",
          full_name: fullName || null,
          display_name: displayName || null,
        },
        joining_profile_review: {
          pan_verified: convertForm.pan_verified,
          aadhaar_verified: convertForm.aadhaar_verified,
        },
      };

      const result = await handleConvertCandidate(payload);
      setConvertDialogOpen(false);
      const sourceCode = (result?.source_candidate_code || candidate.candidate_code || "").trim();
      const personCode = (result?.person_code || "").trim();
      pushToast({
        tone: "success",
        title: "Candidate marked as joined",
        description: sourceCode && personCode ? `${sourceCode} mapped to ${personCode}` : undefined,
      });
    } catch (e: any) {
      setConvertDialogError(e?.message || "Conversion failed.");
    } finally {
      setConvertDialogBusy(false);
    }
  }, [candidate.candidate_code, convertForm, convertPersonCodePreview, convertRequiresStudioLotusDomain, handleConvertCandidate, pushToast]);

  const {
    candidateSprints,
    setCandidateSprints,
    sprintsBusy,
    sprintsError,
    setSprintsError,
    lastSprintNotice,
    setLastSprintNotice,
    templatePreview,
    templateAttachments,
    templatePreviewBusy,
    templatePreviewError,
    assignOpen,
    setAssignOpen,
    sprintTemplates,
    selectedTemplateId,
    dueAt,
    setDueAt,
    activeSprints,
    hasApprovedSprint,
    sprintAssignDisabled,
    sprintApprovalPending,
    sprintEmailPreviewHtml,
    refreshSprints,
    openAssignSprint,
    handleTemplateSelect,
    handleAssignSprint,
    handleSuperadminSprintDecision,
  } = useCandidate360Sprints({
    candidateId,
    canSkip,
    candidateName: candidate.name,
    candidateOpeningTitle: candidate.opening_title,
    refreshAll,
  });

  async function initCafLinkIfNeeded() {
    if (isInternWorkflow) return;
    if (cafLink || cafSentAt) return;
    try {
      const link = await fetchCafLink(candidateId);
      setCafLink(link);
    } catch {
      // ignore
    }
  }

  async function initAssessmentLinkIfNeeded() {
    if (isInternWorkflow) return;
    if (assessmentLink || assessmentSentAt) return;
    try {
      const link = await fetchAssessmentLink(candidateId);
      setAssessmentLink(link);
    } catch {
      // ignore
    }
  }

  async function handleCopyCafLink() {
    if (isInternWorkflow) return;
    setError(null);
    try {
      const link = cafLink || (await fetchCafLink(candidateId));
      setCafLink(link);
      const basicDetailsUrl = link?.basic_details_form_url || link?.caf_url;
      if (!basicDetailsUrl) {
        setError(`${BASIC_DETAILS_FORM_LABEL} link is not available for this candidate yet.`);
        return;
      }
      const absolute = `${window.location.origin}${basicDetailsUrl}`;
      await navigator.clipboard.writeText(absolute);
      setError(`${BASIC_DETAILS_FORM_LABEL} link copied.`);
      window.setTimeout(() => setError(null), 1200);
    } catch (e: any) {
      setError(e?.message || `Could not copy ${BASIC_DETAILS_FORM_LABEL} link`);
    }
  }

  const {
    schedulePanelRef,
    interviews,
    interviewsBusy,
    interviewsError,
    interviewsNotice,
    slotInviteRound,
    slotInviteCancelBusy,
    activeSlotInvites,
    expandedInterviewId,
    rescheduleInterviewId,
    scheduleEmailPreviewOpen,
    setScheduleEmailPreviewOpen,
    scheduleEmailPreviewHtml,
    scheduleEmailPreviewBusy,
    scheduleEmailPreviewError,
    scheduleOpen,
    scheduleRound,
    setScheduleRound,
    scheduleLocation,
    setScheduleLocation,
    scheduleMeetLink,
    setScheduleMeetLink,
    scheduleInterviewer,
    scheduleReason,
    setScheduleReason,
    slotInviteBusy,
    personQuery,
    setPersonQuery,
    personResults,
    personBusy,
    personOpen,
    setPersonOpen,
    personHighlight,
    setPersonHighlight,
    slotPreviewDate,
    setSlotPreviewDate,
    slotPreviewSlots,
    slotPreviewBusy,
    slotPreviewError,
    selectedSlot,
    setSelectedSlot,
    scheduleAllowed,
    refreshInterviews,
    handleScheduleSubmit,
    handleScheduleEmailPreview,
    handleSendSlotInvite,
    handleCancelSlotInvite,
    openSchedule,
    interviewUpcoming,
    interviewPast,
    interviewTaken,
    interviewNotTaken,
    interviewPastOther,
    handleScheduleL2FromInterviews,
    handleScheduleL1FromInterviews,
    handleRescheduleFromInterviews,
    handleCancelInterviewFromInterviews,
    handleToggleExpandedInterview,
    closeSchedulePanel,
    handlePickScheduleInterviewer,
    handleSelectScheduleSlot,
  } = useCandidate360Interviews({
    candidateId,
    canSchedule,
    canSkip,
    allowL1Scheduling: !isInternWorkflow,
    currentStageKey,
    assessmentSubmittedAt,
    refreshAll,
    candidateL2OwnerEmail: candidate.l2_owner_email,
    candidateL2OwnerName: candidate.l2_owner_name,
    searchParams,
    handleTransition,
    openDialog,
    closeDialog,
    setDialogError: (dialogError) => {
      setDialog((prev) => ({ ...prev, error: dialogError }));
    },
    setBusy,
    pushToast,
  });

  const hasL2FeedbackSubmitted = useMemo(() => {
    const list = interviews || [];
    return list.some((item) => item.feedback_submitted && item.round_type.toLowerCase().includes("l2"));
  }, [interviews]);

  const hasL1FeedbackSubmitted = useMemo(() => {
    const list = interviews || [];
    return list.some((item) => item.feedback_submitted && item.round_type.toLowerCase().includes("l1"));
  }, [interviews]);

  const l2FeedbackEvent = useMemo(() => {
    const list = interviews || [];
    const submitted = list
      .filter((item) => item.feedback_submitted && item.round_type.toLowerCase().includes("l2"))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
    if (submitted) {
      return { created_at: submitted.updated_at };
    }
    const events = data.events || [];
    const matches = events.filter((ev) => {
      if (ev.action_type !== "interview_feedback_submitted") return false;
      const roundType = (ev.meta_json as { round_type?: unknown })?.round_type;
      const feedbackSubmitted = (ev.meta_json as { feedback_submitted?: unknown })?.feedback_submitted;
      const isFeedbackSubmitted =
        feedbackSubmitted === true ||
        feedbackSubmitted === "true" ||
        feedbackSubmitted === 1 ||
        feedbackSubmitted === "1";
      return isFeedbackSubmitted && typeof roundType === "string" && roundType.toLowerCase().includes("l2");
    });
    if (matches.length === 0) return null;
    return matches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  }, [data.events, interviews]);

  const l1FeedbackEvent = useMemo(() => {
    const list = interviews || [];
    const submitted = list
      .filter((item) => item.feedback_submitted && item.round_type.toLowerCase().includes("l1"))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
    if (submitted) {
      return { created_at: submitted.updated_at };
    }
    const events = data.events || [];
    const matches = events.filter((ev) => {
      if (ev.action_type !== "interview_feedback_submitted") return false;
      const roundType = (ev.meta_json as { round_type?: unknown })?.round_type;
      const feedbackSubmitted = (ev.meta_json as { feedback_submitted?: unknown })?.feedback_submitted;
      const isFeedbackSubmitted =
        feedbackSubmitted === true ||
        feedbackSubmitted === "true" ||
        feedbackSubmitted === 1 ||
        feedbackSubmitted === "1";
      return isFeedbackSubmitted && typeof roundType === "string" && roundType.toLowerCase().includes("l1");
    });
    if (matches.length === 0) return null;
    return matches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  }, [data.events, interviews]);

  const refreshJoiningDocs = useCallback(async () => {
    if (!canViewJoiningWorkspace) {
      setJoiningDocs(null);
      setJoiningDocsError(null);
      return;
    }
    setJoiningDocsBusy(true);
    setJoiningDocsError(null);
    try {
      const docs = await fetchJoiningDocs(candidateId);
      setJoiningDocs(docs);
    } catch (e: any) {
      setJoiningDocsError(e?.message || "Could not load joining documents.");
    } finally {
      setJoiningDocsBusy(false);
    }
  }, [canViewJoiningWorkspace, candidateId]);

  async function handleUploadJoiningDoc() {
    if (!joiningDocFile) {
      setJoiningDocsError("Select a file to upload.");
      return;
    }
    setJoiningDocsBusy(true);
    setJoiningDocsError(null);
    setJoiningDocsNotice(null);
    try {
      await uploadJoiningDoc(candidateId, { doc_type: joiningDocType, file: joiningDocFile });
      setJoiningDocFile(null);
      setJoiningDocsNotice("Joining document uploaded.");
      await refreshJoiningDocs();
      await refreshAll();
    } catch (e: any) {
      setJoiningDocsError(e?.message || "Joining document upload failed.");
    } finally {
      setJoiningDocsBusy(false);
    }
  }

  async function handleCopyAssessmentLink() {
    if (isInternWorkflow) return;
    setError(null);
    try {
      const link = assessmentLink || (await fetchAssessmentLink(candidateId));
      setAssessmentLink(link);
      const assessmentUrl = link?.candidate_assessment_form_url || link?.assessment_url;
      if (!assessmentUrl) {
        setError(`${CANDIDATE_ASSESSMENT_FORM_LABEL} link is not available for this candidate yet.`);
        return;
      }
      const absolute = `${window.location.origin}${assessmentUrl}`;
      await navigator.clipboard.writeText(absolute);
      setError(`${CANDIDATE_ASSESSMENT_FORM_LABEL} link copied.`);
      window.setTimeout(() => setError(null), 1200);
    } catch (e: any) {
      setError(e?.message || `Could not copy ${CANDIDATE_ASSESSMENT_FORM_LABEL.toLowerCase()} link`);
    }
  }

  async function handleSendAssessmentLink() {
    if (isInternWorkflow) return;
    setBusy(true);
    setError(null);
    try {
      const result = await resendAssessmentLink(candidateId);
      const assessmentToken = result.candidate_assessment_form_token || result.assessment_token;
      const assessmentUrl = result.candidate_assessment_form_url || result.assessment_url;
      if (assessmentToken && assessmentUrl) {
        setAssessmentLink({
          candidate_assessment_form_token: assessmentToken,
          candidate_assessment_form_url: assessmentUrl,
          assessment_token: assessmentToken,
          assessment_url: assessmentUrl,
        });
      }
      await refreshAll();

      if (result.attempted && result.email_status !== "failed") {
        pushToast({
          title: `${CANDIDATE_ASSESSMENT_FORM_LABEL} email sent`,
          description:
            result.email_status === "resent"
              ? `The updated ${CANDIDATE_ASSESSMENT_FORM_LABEL.toLowerCase()} link has been re-sent.`
              : `The updated ${CANDIDATE_ASSESSMENT_FORM_LABEL.toLowerCase()} link has been sent.`,
          tone: "success",
        });
        return;
      }

      if (result.email_status === "failed") {
        throw new Error(result.email_error || `${CANDIDATE_ASSESSMENT_FORM_LABEL} email could not be sent.`);
      }

      const reason = (result.reason || "").trim();
      if (reason === "already_submitted") {
        pushToast({
          title: `${CANDIDATE_ASSESSMENT_FORM_LABEL} already submitted`,
          description: `No new email was sent because this candidate has already completed the ${CANDIDATE_ASSESSMENT_FORM_LABEL.toLowerCase()}.`,
          tone: "warning",
        });
        return;
      }

      if (reason === "missing_recipient") {
        throw new Error("Candidate email is missing.");
      }

      if (reason === "disabled_for_workflow") {
        throw new Error(`${CANDIDATE_ASSESSMENT_FORM_LABEL} is not enabled for this opening.`);
      }

      pushToast({
        title: `${CANDIDATE_ASSESSMENT_FORM_LABEL} email not sent`,
        description: reason || `No new ${CANDIDATE_ASSESSMENT_FORM_LABEL.toLowerCase()} email was sent.`,
        tone: "warning",
      });
    } catch (e: any) {
      setError(e?.message || `Could not send ${CANDIDATE_ASSESSMENT_FORM_LABEL.toLowerCase()} email`);
    } finally {
      setBusy(false);
    }
  }

  function handleSendInternSelectionEmail() {
    openDialog({
      title: hasInternSelectionEmailSent ? "Resend selection email" : "Send selection email",
      description: hasInternSelectionEmailSent
        ? "This will resend the internship selection email using the current placeholder template."
        : "This sends the internship selection email using the current placeholder template.",
      confirmLabel: hasInternSelectionEmailSent ? "Resend email" : "Send email",
      tone: "success",
      onConfirm: async () => {
        setBusy(true);
        setError(null);
        try {
          await sendInternSelectionEmailRequest(candidateId);
          await refreshAll();
          pushToast({
            tone: "success",
            title: hasInternSelectionEmailSent ? "Selection email resent" : "Selection email sent",
          });
          closeDialog();
        } catch (e: any) {
          const message = e?.message || "Could not send selection email.";
          setError(message);
          setDialog((prev) => ({ ...prev, error: message }));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  useCandidate360RealtimeRefresh({
    candidateId,
    refreshAll,
    refreshInterviews,
    refreshSprints,
    refreshOffers,
    refreshJoiningDocs,
  });

  async function handleDeleteSprint(candidateSprintId: number) {
    if (!canSkip) return;
    openDialog({
      title: "Delete sprint assignment",
      description: "This action removes the assignment and cannot be undone.",
      confirmLabel: "Delete sprint",
      tone: "danger",
      onConfirm: async () => {
        setSprintsError(null);
        setSprintDeleteBusy(true);
        try {
          const deleted = (candidateSprints || []).find((sprint) => sprint.candidate_sprint_id === candidateSprintId);
          await deleteCandidateSprint(candidateSprintId);
          const list = await fetchCandidateSprints(candidateId);
          setCandidateSprints(list);
          await refreshAll();
          if (deleted) {
            setLastSprintNotice({
              template_name: deleted.template_name,
              template_code: deleted.template_code,
              assigned_at: deleted.assigned_at,
              due_at: deleted.due_at,
              status: "deleted",
              deleted_at: new Date().toISOString(),
            });
          }
          pushToast({ tone: "success", title: "Sprint assignment deleted" });
          closeDialog();
        } catch (e: any) {
          setSprintsError(e?.message || "Could not delete sprint.");
          setDialog((prev) => ({ ...prev, error: e?.message || "Could not delete sprint." }));
        } finally {
          setSprintDeleteBusy(false);
        }
      },
    });
  }

  useEffect(() => {
    if (!canViewJoiningWorkspace) return;
    if (joiningDocs === null) {
      void refreshJoiningDocs();
    }
  }, [canViewJoiningWorkspace, joiningDocs, refreshJoiningDocs]);

  const joiningDocsComplete = useMemo(() => {
    if ((candidate.joining_docs_status || "").toLowerCase() === "complete") return true;
    if (!joiningDocs || joiningDocs.length === 0) return false;
    const seen = new Set(
      joiningDocs
        .map((doc) => normalizeJoiningDocType(doc.doc_type))
        .filter((docType): docType is string => Boolean(docType))
    );
    return requiredJoiningDocTypes.every((docType) => seen.has(docType));
  }, [candidate.joining_docs_status, joiningDocs]);

  const stageButtons: Candidate360StageButton[] = buildCandidate360StageButtons({
    currentStageKey,
    isInternWorkflow,
    canManageCandidate360,
    canSchedule,
    canAccessOffers,
    canSkip,
    assessmentLocked,
    hasL2FeedbackSubmitted,
    hasL1FeedbackSubmitted,
    hasInternSelectionEmailSent,
    candidateL2OwnerEmail: candidate.l2_owner_email,
    sprintAssignDisabled,
    hasApprovedSprint,
    joiningDocsComplete,
    offersBusy,
    canReviseOffer: reviseOfferEligibility.allowed,
    latestOfferStatus: latestOffer?.offer_status || null,
    latestOfferId: latestOffer?.candidate_offer_id || null,
    handleTransition,
    handleSendInternSelectionEmail,
    handleConvertCandidate: openConvertDialog,
    handleReviseOffer,
    focusSection: (section) => {
      if (section === "screening") {
        focusSection("screening", screeningRef);
        return;
      }
      if (section === "documents") {
        focusSection("documents", documentsRef);
        return;
      }
      if (section === "interviews") {
        focusSection("interviews", interviewsRef);
        return;
      }
      if (section === "sprint") {
        focusSection("sprint", sprintRef);
        return;
      }
      focusSection("offer", offerRef);
    },
    openSchedule,
    openAssignSprint,
  });

  const screening = data.screening as Screening | null | undefined;
  const stageProgressSteps = useMemo(() => {
    const hasStage = (key: string) => data.stages.some((stage) => normalizeStage(stage.stage_name) === key);
    const status = (candidate.status || "").toLowerCase();
    const isDeclined = status === "declined" || hasStage("declined");
    const isRejected = status === "rejected" || hasStage("rejected");
    const isAccepted =
      (latestOffer?.offer_status || "").toLowerCase() === "accepted" || hasStage("joining_documents") || hasStage("hired") || status === "hired";

    let steps = isInternWorkflow
      ? ["enquiry", "hr_screening", "l2_shortlist", "l2_interview", "l2_feedback"]
      : [...pipelineStages];
    if (isRejected) {
      steps = [...steps, ...postRejectStages];
    } else if (isDeclined) {
      steps = [...steps, ...postDeclineStages];
    } else if (!isInternWorkflow && isAccepted) {
      steps = [...steps, ...postAcceptanceStages];
    }

    return steps
      .map((key) => stageOrder.find((stage) => stage.key === key))
      .filter(Boolean) as Array<{ key: string; label: string }>;
  }, [candidate.status, data.stages, isInternWorkflow, latestOffer?.offer_status]);

  const nextBestActions = useMemo(() => {
    const actions: string[] = [];
    if (!candidate.l2_owner_email && currentStageKey === "enquiry") {
      actions.push("Assign GL/L2 owner to unlock HR screening.");
    }
    if (assessmentLocked) {
      actions.push("Collect assessment submission before moving to the L2 interview and later stages.");
    }
    if (currentStageKey === "l2_feedback" && !hasL2FeedbackSubmitted) {
      actions.push("Submit at least one L2 interview feedback to unlock stage transitions.");
    }
    if (currentStageKey === "l2_feedback" && hasL2FeedbackSubmitted) {
      if (isInternWorkflow) {
        actions.push(
          hasInternSelectionEmailSent
            ? "Selection email already sent. HR can resend it or reject the candidate from this stage."
            : "Review the L2 hiring recommendation, then send the selection email or reject the candidate."
        );
      } else {
        actions.push("Finalize L2 decision and move to Sprint or Reject.");
      }
    }
    if (!isInternWorkflow && currentStageKey === "sprint" && !hasApprovedSprint) {
      actions.push("Get at least one approved sprint before L1 shortlist.");
    }
    if (!isInternWorkflow && currentStageKey === "l1_feedback" && !hasL1FeedbackSubmitted) {
      actions.push("Submit at least one L1 interview feedback to unlock Offer/Reject actions.");
    }
    if (!isInternWorkflow && currentStageKey === "l1_feedback" && hasL1FeedbackSubmitted) {
      actions.push("Finalize L1 decision and move to Offer or Reject.");
    }
    if (!isInternWorkflow && currentStageKey === "offer" && canAccessOffers) {
      if ((latestOffer?.offer_status || "").toLowerCase() === "declined") {
        actions.push("Candidate declined latest offer. Negotiate and create revised draft, or close explicitly as Rejected with a reason.");
      } else {
        actions.push("Push offer decision follow-up to close this candidate.");
      }
    }
    if (!isInternWorkflow && currentStageKey === "joining_documents" && !joiningDocsComplete) {
      actions.push("Collect mandatory joining docs to unlock final hire.");
    }
    if (!actions.length) actions.push("Continue progression based on latest interview/sprint feedback.");
    return actions;
  }, [
    candidate.l2_owner_email,
    canAccessOffers,
    assessmentLocked,
    currentStageKey,
    hasInternSelectionEmailSent,
    hasApprovedSprint,
    hasL1FeedbackSubmitted,
    hasL2FeedbackSubmitted,
    isInternWorkflow,
    joiningDocsComplete,
    latestOffer?.offer_status,
  ]);

  const pipelineReplay = useMemo(() => {
    return [...(data.events || [])]
      .filter((event) => {
        const action = (event.action_type || "").toLowerCase();
        return action.includes("stage") || action.includes("offer") || action.includes("interview") || action.includes("sprint");
      })
      .sort((a, b) => {
        const aTs = Date.parse(a.created_at || "");
        const bTs = Date.parse(b.created_at || "");
        return (Number.isFinite(aTs) ? aTs : 0) - (Number.isFinite(bTs) ? bTs : 0);
      })
      .slice(-14);
  }, [data.events]);

  return (
    <main className="content-pad w-full space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-tight text-slate-500">Candidate 360</p>
          <h1 className="mt-1 text-2xl font-semibold">{candidate.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip className={statusTone(candidate.status)}>{candidate.status.split("_").join(" ")}</Chip>
            <Chip className={chipTone("blue")}>Stage: {stageLabel(candidate.current_stage)}</Chip>
            {candidate.duplicate_tag ? (
              <Chip className={chipTone("amber")}>
                Duplicate
                {candidate.duplicate_application_count && candidate.duplicate_application_count > 1
                  ? ` x${candidate.duplicate_application_count}`
                  : ""}
              </Chip>
            ) : null}
            {candidate.latest_reapplication_at ? (
              <Chip className={chipTone("neutral")}>Last reapply: {formatDate(candidate.latest_reapplication_at)}</Chip>
            ) : null}
            <Chip className={cafState.tone}>{cafState.label}</Chip>
            {needsReviewChip}
            {screening?.screening_result ? (
              <Chip className={screeningTone(screening.screening_result)}>Screening: {screeningLabel(screening.screening_result) || screening.screening_result}</Chip>
            ) : null}
            <span className="text-xs text-slate-500">Code: {candidate.candidate_code}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canDelete ? <DeleteCandidateButton candidateId={candidate.candidate_id} /> : null}
          {canOpenDriveFolder && candidate.drive_folder_url ? (
            <Link
              href={candidate.drive_folder_url}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-600 to-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-card hover:from-cyan-700 hover:to-violet-700"
            >
              <ExternalLink className="h-4 w-4" />
              Open Drive folder
            </Link>
          ) : null}
        </div>
      </div>
      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {!canManageCandidate360 ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          Candidate 360 is in view-only mode. You can view data but cannot perform lifecycle actions.
        </div>
      ) : null}

      <Candidate360OverviewSection
        candidateId={candidateId}
        candidate={candidate}
        candidateInitials={candidateInitials}
        canDelete={canDelete}
        canManageCandidate360={canManageCandidate360}
        busy={busy}
        showCafSection={!isInternWorkflow}
        cafState={cafState}
        cafSubmittedAt={cafSubmittedAt}
        cafSentAt={cafSentAt}
        assessmentSubmittedAt={assessmentSubmittedAt}
        assessmentSentAt={assessmentSentAt}
        l2FeedbackEvent={l2FeedbackEvent}
        l1FeedbackEvent={l1FeedbackEvent}
        onCopyCafLink={() => {
          void handleCopyCafLink();
        }}
        onInitCafLinkIfNeeded={() => {
          void initCafLinkIfNeeded();
        }}
        onCopyAssessmentLink={() => {
          void handleCopyAssessmentLink();
        }}
        onInitAssessmentLinkIfNeeded={() => {
          void initAssessmentLinkIfNeeded();
        }}
        onSendAssessmentLink={() => {
          void handleSendAssessmentLink();
        }}
        docTone={docTone}
        chipTone={chipTone}
        formatDateTime={formatDateTime}
        formatEventDateTime={formatEventDateTime}
        formatDate={formatDate}
        onExpandAll={() => setAllSections(false)}
        onCollapseAll={() => setAllSections(true)}
        collapsed={collapsedSections.overview}
        assessmentLocked={assessmentLocked}
        assessmentExpiresAt={assessmentExpiresAt}
        assessmentDaysLeft={assessmentDaysLeft}
        l2OwnerSelected={l2OwnerSelected}
        l2OwnerQuery={l2OwnerQuery}
        setL2OwnerSelected={setL2OwnerSelected}
        setL2OwnerQuery={setL2OwnerQuery}
        l2OwnerOpen={l2OwnerOpen}
        setL2OwnerOpen={setL2OwnerOpen}
        l2OwnerLoading={l2OwnerLoading}
        l2OwnerOptions={l2OwnerOptions}
        setL2OwnerOptions={setL2OwnerOptions}
        l2OwnerSaving={l2OwnerSaving}
        l2OwnerError={l2OwnerError}
        onSaveL2Owner={() => {
          void handleSaveL2Owner();
        }}
        stageProgressSteps={stageProgressSteps}
        stages={data.stages}
        currentStageKey={currentStageKey}
        stageStateKey={stageStateKey}
        findStage={findStage}
        latestOffer={latestOffer}
        screening={screening}
        stageButtons={stageButtons}
        stageLabel={stageLabel}
        canAccessOffers={canAccessOffers}
        joiningDocsComplete={joiningDocsComplete}
        canSkip={canSkip}
        skipStage={skipStage}
        setSkipStage={setSkipStage}
        skipStageOptions={skipStageOptions}
        onSkip={() => {
          void handleSkip();
        }}
        onStageTransition={(toStage) => {
          const normalized = normalizeRecruitmentStage(toStage);
          if (!normalized || normalized === currentStageKey) return;
          const from = currentStageKey || null;
          const fromTerminal = from === "rejected" || from === "declined" || from === "hired";
          const toTerminal = normalized === "rejected" || normalized === "declined" || normalized === "hired";
          const decision = fromTerminal && !toTerminal ? "skip" : defaultTransitionDecision(normalized);
          void handleTransition(normalized, decision);
        }}
        nextBestActions={nextBestActions}
        pipelineReplay={pipelineReplay}
        onJumpTimeline={() => focusSection("timeline", timelineRef)}
        onJumpScreening={() => focusSection("screening", screeningRef)}
        onJumpDocuments={() => focusSection("documents", documentsRef)}
        onJumpInterviews={() => focusSection("interviews", interviewsRef)}
        showSprintSection={!isInternWorkflow}
        onJumpSprint={() => focusSection("sprint", sprintRef)}
        showOfferSection={!isInternWorkflow}
        onJumpOffer={() => focusSection("offer", offerRef)}
      />

      <section className="space-y-4">
          <Candidate360TimelineSection
            sectionRef={timelineRef}
            collapsed={collapsedSections.timeline}
            onToggle={() => toggleSection("timeline")}
            events={data.events}
            bestEffortFromMeta={bestEffortFromMeta}
            formatEventDateTime={formatEventDateTime}
            chipTone={chipTone}
          />

        <Candidate360ScreeningSection
          sectionRef={screeningRef}
          collapsed={collapsedSections.screening}
          onToggle={() => toggleSection("screening")}
          candidate={candidate}
          screening={screening}
          assessment={assessment}
          assessmentCompensationVisible={data.assessment_compensation_visible !== false}
          isInternWorkflow={isInternWorkflow}
          candidateQuestionsFromCandidate={candidate.questions_from_candidate}
          screeningTone={screeningTone}
          screeningLabel={screeningLabel}
          chipTone={chipTone}
          valueOrDash={valueOrDash}
          yesNo={yesNo}
          formatDate={formatDate}
          formatDateTime={formatDateTime}
        />

          <Candidate360DocumentsSection
            sectionRef={documentsRef}
            collapsed={collapsedSections.documents}
            onToggle={() => toggleSection("documents")}
            candidateId={candidateId}
            candidate={candidate}
            joiningProfile={joiningProfile}
            canOpenDriveFolder={canOpenDriveFolder}
            canViewJoiningWorkspace={canViewJoiningWorkspace && !isInternWorkflow}
            canUploadJoiningDocs={canUploadJoiningDocs && !isInternWorkflow}
            joiningDocsNotice={joiningDocsNotice}
            joiningDocsError={joiningDocsError}
            joiningDocsBusy={joiningDocsBusy}
            joiningDocs={joiningDocs}
            joiningDocType={joiningDocType}
            joiningDocFile={joiningDocFile}
            joiningDocOptions={joiningDocOptions}
            setJoiningDocType={setJoiningDocType}
            setJoiningDocFile={setJoiningDocFile}
            handleUploadJoiningDoc={handleUploadJoiningDoc}
            docTone={docTone}
            documentPreviewPath={documentPreviewPath}
            joiningDocLabel={joiningDocLabel}
            formatDateTime={formatDateTime}
          />

          <Candidate360InterviewsSection
            sectionRef={interviewsRef}
            collapsed={collapsedSections.interviews}
            onToggle={() => toggleSection("interviews")}
            scheduleAllowed={scheduleAllowed}
            allowL1Scheduling={!isInternWorkflow}
            onScheduleL2={handleScheduleL2FromInterviews}
            onScheduleL1={handleScheduleL1FromInterviews}
            interviewsError={interviewsError}
            interviewsNotice={interviewsNotice}
            slotInviteRound={slotInviteRound}
            slotInviteCancelBusy={slotInviteCancelBusy}
            activeSlotInvites={activeSlotInvites}
            onCancelSlotInvite={(roundOverride) => {
              void handleCancelSlotInvite(roundOverride);
            }}
            interviewsBusy={interviewsBusy}
            interviews={interviews}
            interviewUpcoming={interviewUpcoming}
            interviewPast={interviewPast}
            interviewTaken={interviewTaken}
            interviewNotTaken={interviewNotTaken}
            interviewPastOther={interviewPastOther}
            formatInviteExpiry={formatInviteExpiry}
            formatDateTime={formatDateTime}
            chipTone={chipTone}
            decisionTone={decisionTone}
            isNotTaken={isNotTakenInterview}
            isCancelled={isCancelledInterview}
            canSchedule={canSchedule}
            canCancelInterview={canCancelInterview}
            busy={busy}
            onRescheduleInterview={handleRescheduleFromInterviews}
            onCancelInterview={handleCancelInterviewFromInterviews}
            expandedInterviewId={expandedInterviewId}
            onToggleExpandedInterview={handleToggleExpandedInterview}
          />

          <Candidate360SchedulePanel
            panelRef={schedulePanelRef}
            open={scheduleOpen}
            rescheduleInterviewId={rescheduleInterviewId}
            allowedRounds={isInternWorkflow ? ["L2"] : ["L2", "L1", "HR"]}
            scheduleRound={scheduleRound}
            setScheduleRound={setScheduleRound}
            personQuery={personQuery}
            setPersonQuery={setPersonQuery}
            scheduleInterviewer={scheduleInterviewer}
            personOpen={personOpen}
            setPersonOpen={setPersonOpen}
            personResults={personResults}
            personHighlight={personHighlight}
            setPersonHighlight={setPersonHighlight}
            personBusy={personBusy}
            onPickInterviewer={handlePickScheduleInterviewer}
            slotPreviewDate={slotPreviewDate}
            setSlotPreviewDate={(value) => {
              setSlotPreviewDate(value);
              setSelectedSlot(null);
            }}
            slotPreviewBusy={slotPreviewBusy}
            slotPreviewError={slotPreviewError}
            slotPreviewSlots={slotPreviewSlots}
            selectedSlot={selectedSlot}
            onSelectSlot={handleSelectScheduleSlot}
            scheduleLocation={scheduleLocation}
            setScheduleLocation={setScheduleLocation}
            scheduleMeetLink={scheduleMeetLink}
            setScheduleMeetLink={setScheduleMeetLink}
            scheduleReason={scheduleReason}
            setScheduleReason={setScheduleReason}
            scheduleEmailPreviewError={scheduleEmailPreviewError}
            slotInviteBusy={slotInviteBusy}
            interviewsBusy={interviewsBusy}
            scheduleEmailPreviewBusy={scheduleEmailPreviewBusy}
            onClose={closeSchedulePanel}
            onSendSlotInvite={() => {
              void handleSendSlotInvite();
            }}
            onPreviewEmail={() => {
              void handleScheduleEmailPreview();
            }}
            onSubmit={() => {
              void handleScheduleSubmit();
            }}
          />

          {!isInternWorkflow ? (
            <Candidate360SprintSection
              sectionRef={sprintRef}
              collapsed={collapsedSections.sprint}
              onToggle={() => toggleSection("sprint")}
              hasApprovedSprint={hasApprovedSprint}
              sprintApprovalPending={sprintApprovalPending}
              sprintsError={sprintsError}
              sprintsBusy={sprintsBusy}
              candidateSprints={candidateSprints}
              activeSprints={activeSprints}
              lastSprintNotice={lastSprintNotice}
              currentStageKey={currentStageKey}
              sprintAssignDisabled={sprintAssignDisabled}
              canSkip={canSkip}
              sprintDeleteBusy={sprintDeleteBusy}
              onDeleteSprint={(candidateSprintId) => {
                void handleDeleteSprint(candidateSprintId);
              }}
              onSuperadminSprintDecision={(candidateSprintId, decision, reason) => {
                void handleSuperadminSprintDecision(candidateSprintId, decision, reason);
              }}
              onOpenAssignSprint={() => {
                void openAssignSprint();
              }}
              assignOpen={assignOpen}
              onCloseAssign={() => setAssignOpen(false)}
              sprintTemplates={sprintTemplates}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={(value) => {
                void handleTemplateSelect(value);
              }}
              dueAt={dueAt}
              setDueAt={setDueAt}
              templatePreviewBusy={templatePreviewBusy}
              templatePreview={templatePreview}
              templateAttachments={templateAttachments}
              sprintEmailPreviewHtml={sprintEmailPreviewHtml}
              templatePreviewError={templatePreviewError}
              onAssignSprint={() => {
                void handleAssignSprint();
              }}
              chipTone={chipTone}
              decisionTone={decisionTone}
              formatDateTime={formatDateTime}
              formatRelativeDue={formatRelativeDue}
              formatBytes={formatBytes}
            />
          ) : null}

          {!isInternWorkflow ? (
            <Candidate360OfferSection
              canAccessOffers={canAccessOffers}
              offerRef={offerRef}
              collapsed={collapsedSections.offer}
              onToggle={() => toggleSection("offer")}
              offersError={offersError}
              offerPreviewError={offerPreviewError}
              offersBusy={offersBusy}
              candidateOffers={candidateOffers}
              latestOffer={latestOffer}
              reviseOfferEligibility={reviseOfferEligibility}
              canDelete={canDelete}
              canSkip={canSkip}
              canSendApprovedOffer={canSendApprovedOffer}
              candidateOpeningTitle={candidate.opening_title}
              offerApprovalPrincipal={offerApprovalPrincipal}
              setOfferApprovalPrincipal={setOfferApprovalPrincipal}
              draftOverridesOpen={draftOverridesOpen}
              setDraftOverridesOpen={setDraftOverridesOpen}
              draftLetterOverrides={draftLetterOverrides}
              setDraftLetterOverrides={setDraftLetterOverrides}
              offerPreviewBusy={offerPreviewBusy}
              form={{
                offerTemplateCode,
                offerDesignation,
                offerGross,
                offerFixed,
                offerVariable,
                offerCurrency,
                offerJoiningDate,
                offerProbationMonths,
                offerGradeId,
                offerNotes,
                offerLetterOverrides,
              }}
              formSetters={{
                setOfferTemplateCode,
                setOfferDesignation,
                setOfferGross,
                setOfferFixed,
                setOfferVariable,
                setOfferCurrency,
                setOfferJoiningDate,
                setOfferProbationMonths,
                setOfferGradeId,
                setOfferNotes,
                setOfferLetterOverrides,
              }}
              actions={{
                handleOfferPreview,
                handleSubmitOffer,
                handleDeleteOffer,
                handleApproveOffer,
                handleRejectOffer,
                handleSendOffer,
                handleResendJoiningLink,
                handleAdminDecision,
                handleReviseOffer,
                handleConvertCandidate: openConvertDialog,
                handleSaveDraftOverrides,
                handleCreateOffer,
              }}
              chipTone={chipTone}
              formatMoney={formatMoney}
              formatDate={formatDate}
              formatDateTime={formatDateTime}
            />
          ) : null}
        </section>
      <Candidate360HtmlPreviewModal
        open={scheduleEmailPreviewOpen}
        title="Interview email preview"
        html={scheduleEmailPreviewHtml}
        onClose={() => setScheduleEmailPreviewOpen(false)}
      />
      <Candidate360HtmlPreviewModal
        open={offerPreviewOpen}
        title={offerPreviewTitle}
        html={offerPreviewHtml}
        onClose={() => setOfferPreviewOpen(false)}
      />
      <Candidate360ConvertDialog
        open={convertDialogOpen}
        busy={convertDialogBusy || offersBusy}
        personCodePreview={convertPersonCodePreview}
        personCodePreviewBusy={convertPersonCodePreviewBusy}
        normalizedEmploymentType={convertNormalizedEmploymentType}
        legacyCandidateCode={(candidate.candidate_code || "").trim()}
        error={convertDialogError}
        requiresStudioLotusDomain={convertRequiresStudioLotusDomain}
        form={convertForm}
        joiningProfile={joiningProfile}
        onChange={(patch) => {
          setConvertForm((prev) => ({ ...prev, ...patch }));
          if (convertDialogError) setConvertDialogError(null);
        }}
        onClose={() => {
          if (convertDialogBusy || offersBusy) return;
          setConvertDialogOpen(false);
          setConvertDialogError(null);
        }}
        onSubmit={() => {
          void handleSubmitConvertDialog();
        }}
      />
      <ActionDialog
        open={dialog.open}
        title={dialog.title}
        description={dialog.description}
        confirmLabel={dialog.confirmLabel || "Confirm"}
        tone={dialog.tone || "neutral"}
        loading={busy || offersBusy || sprintDeleteBusy}
        error={dialog.error || null}
        input={
          dialog.requireReason
            ? {
                label: dialog.reasonLabel || "Reason",
                placeholder: dialog.reasonPlaceholder || "",
                required: true,
                minLength: 2,
                multiline: true,
              }
            : null
        }
        onConfirm={async (value) => {
          await dialog.onConfirm(value);
        }}
        onClose={closeDialog}
      />
    </main>
  );
}


