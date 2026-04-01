"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReadonlyURLSearchParams, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { CandidateListItem, OpeningListItem } from "@/lib/types";
import { AlertTriangle, CheckCircle2, ChevronDown, Filter, XCircle, Bookmark, Eye, LayoutGrid, Rows3, MoveRight } from "lucide-react";
import { parseDateUtc } from "@/lib/datetime";
import { redirectToLogin } from "@/lib/auth-client";
import { useToast } from "@/components/ui/toast-provider";
import {
  BASIC_DETAILS_FORM_LABEL,
  SCREENING_DETAILS_LABEL,
  CANDIDATE_ASSESSMENT_FORM_LABEL,
  basicDetailsStatusLabel,
  candidateAssessmentStatusLabel,
} from "@/lib/recruitment-terms";
import { trackUxMetric } from "@/lib/ux-metrics";
import {
  defaultTransitionDecision,
  normalizeRecruitmentStage,
  recruitmentStageLabel,
  recruitmentStageOrder,
  type RecruitmentStageKey,
} from "@/lib/recruitment-stages";

type Props = {
  initialCandidates: CandidateListItem[];
  openings: OpeningListItem[];
  canNavigate?: boolean;
  canViewBasicDetails?: boolean;
  showTagFilters?: boolean;
  canUseSuperadminExpiredCafResend?: boolean;
};

const stageTone: Record<string, string> = {
  enquiry: "bg-blue-600/10 text-blue-700 ring-1 ring-blue-600/10",
  hr_screening: "bg-teal-600/10 text-teal-700 ring-1 ring-teal-600/10",
  l2_shortlist: "bg-violet-600/10 text-violet-700 ring-1 ring-violet-600/10",
  l2: "bg-violet-600/10 text-violet-700 ring-1 ring-violet-600/10",
  l2_interview: "bg-violet-600/10 text-violet-700 ring-1 ring-violet-600/10",
  l2_feedback: "bg-violet-600/10 text-violet-700 ring-1 ring-violet-600/10",
  sprint: "bg-amber-600/10 text-amber-700 ring-1 ring-amber-600/10",
  l1: "bg-indigo-600/10 text-indigo-700 ring-1 ring-indigo-600/10",
  l1_shortlist: "bg-indigo-600/10 text-indigo-700 ring-1 ring-indigo-600/10",
  l1_interview: "bg-indigo-600/10 text-indigo-700 ring-1 ring-indigo-600/10",
  l1_feedback: "bg-indigo-600/10 text-indigo-700 ring-1 ring-indigo-600/10",
  offer: "bg-emerald-600/10 text-emerald-700 ring-1 ring-emerald-600/10",
  joining_documents: "bg-emerald-600/10 text-emerald-700 ring-1 ring-emerald-600/10",
  hired: "bg-emerald-600/10 text-emerald-700 ring-1 ring-emerald-600/10",
  declined: "bg-rose-600/10 text-rose-700 ring-1 ring-rose-600/10",
  rejected: "bg-rose-600/10 text-rose-700 ring-1 ring-rose-600/10",
};

const stageLabels: Record<string, string> = {
  enquiry: "Enquiry",
  hr_screening: "HR screening",
  l2_shortlist: "L2 shortlist",
  l2_interview: "L2 interview",
  l2_feedback: "L2 feedback",
  sprint: "Sprint",
  l1_shortlist: "L1 shortlist",
  l1_interview: "L1 interview",
  l1_feedback: "L1 feedback",
  offer: "Offer",
  joining_documents: "Joining documents",
  hired: "Hired",
  declined: "Declined",
  rejected: "Rejected",
};

function normalizeStage(raw?: string | null) {
  return normalizeRecruitmentStage(raw) || "";
}

function stageLabel(raw?: string | null) {
  const key = normalizeStage(raw);
  return recruitmentStageLabel(key) || stageLabels[key] || (key ? key.replace(/_/g, " ") : "");
}

function sourceLabel(candidate: CandidateListItem) {
  const origin = (candidate.source_origin || "").trim();
  const channel = (candidate.source_channel || "").trim();
  if (origin && channel) return `${origin} • ${channel}`;
  if (origin) return origin;
  if (channel) return channel;
  return "";
}

function yesNoUnknown(value: boolean | null | undefined): string {
  if (value == null) return "-";
  return value ? "Yes" : "No";
}

function cleanText(value: string | null | undefined): string {
  const trimmed = String(value || "").trim();
  return trimmed || "-";
}

function documentPreviewHref(candidateId: number, kind: "cv" | "resume" | "portfolio") {
  return `/candidates/${encodeURIComponent(String(candidateId))}/documents/${encodeURIComponent(kind)}`;
}

function chipTone(kind: "neutral" | "green" | "amber" | "red" | "blue") {
  if (kind === "green") return "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/20";
  if (kind === "amber") return "bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/20";
  if (kind === "red") return "bg-rose-500/15 text-rose-800 ring-1 ring-rose-500/20";
  if (kind === "blue") return "bg-blue-500/15 text-blue-800 ring-1 ring-blue-500/20";
  return "bg-slate-500/10 text-slate-800 ring-1 ring-slate-500/15";
}

const INTERN_OPENING_CODES = new Set(["INTR-8299B8", "CMIN-8299B0"]);
const BASIC_DETAILS_LINK_EXPIRY_HOURS = 72;
const ASSESSMENT_LINK_EXPIRY_HOURS = 72;

function isInternCandidate(candidate: CandidateListItem) {
  return INTERN_OPENING_CODES.has(String(candidate.opening_code || "").toUpperCase());
}

function isAssessmentLockedStage(toStage: RecruitmentStageKey) {
  return !["enquiry", "hr_screening", "l2_shortlist", "rejected", "declined", "hired"].includes(toStage);
}

function linkExpired(sentAt?: string | null, submittedAt?: string | null, expiryHours = 72) {
  if (!sentAt || submittedAt) return false;
  const sent = parseDateUtc(sentAt);
  if (!sent || Number.isNaN(sent.getTime())) return false;
  return Date.now() > sent.getTime() + expiryHours * 60 * 60 * 1000;
}

function cafChip(candidate: CandidateListItem) {
  const sentAt = candidate.basic_details_form_sent_at || candidate.caf_sent_at;
  const submittedAt = candidate.basic_details_form_submitted_at || candidate.caf_submitted_at;
  if (isInternCandidate(candidate)) {
    return {
      label: basicDetailsStatusLabel({ required: false, notRequiredLabel: "Basic details already available" }),
      tone: chipTone("blue"),
    };
  }
  if (linkExpired(sentAt, submittedAt, BASIC_DETAILS_LINK_EXPIRY_HOURS)) {
    return { label: `${BASIC_DETAILS_FORM_LABEL} link expired`, tone: chipTone("red"), expired: true };
  }
  if (submittedAt) return { label: basicDetailsStatusLabel({ required: true, sentAt, submittedAt }), tone: chipTone("green") };
  if (sentAt) return { label: basicDetailsStatusLabel({ required: true, sentAt }), tone: chipTone("amber") };
  return { label: `${BASIC_DETAILS_FORM_LABEL} not sent`, tone: chipTone("neutral") };
}

function assessmentChip(candidate: CandidateListItem) {
  const sentAt = candidate.candidate_assessment_form_sent_at || candidate.assessment_sent_at;
  const submittedAt = candidate.candidate_assessment_form_submitted_at || candidate.assessment_submitted_at;
  if (isInternCandidate(candidate)) return { label: candidateAssessmentStatusLabel({ required: false, shortLabel: "CAF" }), tone: chipTone("blue") };
  if (linkExpired(sentAt, submittedAt, ASSESSMENT_LINK_EXPIRY_HOURS)) {
    return { label: "CAF link expired", tone: chipTone("red"), expired: true };
  }
  if (submittedAt) return { label: candidateAssessmentStatusLabel({ required: true, submittedAt, shortLabel: "CAF" }), tone: chipTone("green") };
  return { label: candidateAssessmentStatusLabel({ required: true, shortLabel: "CAF" }), tone: chipTone("amber") };
}

function priorityChip(candidate: CandidateListItem) {
  const ageHigh = (candidate.ageing_days || 0) >= 2;
  const r = (candidate.screening_result || "").trim().toLowerCase();
  const isHigh = r === "red" || r === "high";
  const isMedium = r === "amber" || r === "medium";
  const isLow = r === "green" || r === "low";
  if (ageHigh || isHigh) return { label: "High", tone: chipTone("red") };
  if (isMedium) return { label: "Medium", tone: chipTone("amber") };
  if (isLow) return { label: "Low", tone: chipTone("green") };
  return null;
}

function isAttentionCandidate(candidate: CandidateListItem) {
  const screening = (candidate.screening_result || "").trim().toLowerCase();
  const isHighAge = (candidate.ageing_days || 0) >= 2;
  const isHigh = screening === "red" || screening === "high";
  const isMedium = screening === "amber" || screening === "medium";
  const isLow = screening === "green" || screening === "low";
  const cafPendingTooLong =
    !isInternCandidate(candidate) &&
    normalizeStage(candidate.current_stage) === "hr_screening" &&
    !(candidate.basic_details_form_submitted_at || candidate.caf_submitted_at) &&
    (candidate.ageing_days || 0) >= 3;
  return isHighAge || isHigh || isMedium || isLow || cafPendingTooLong || !!candidate.needs_hr_review;
}

const STAGE_OPTIONS = recruitmentStageOrder.map((item) => item.key);
const BOARD_COLUMNS = recruitmentStageOrder;
const CANDIDATE_TAG_LABELS: Record<string, string> = {
  standard: "Standard",
  intern: "Intern",
  basic_details_submitted: `${BASIC_DETAILS_FORM_LABEL} submitted`,
  basic_details_pending: `${BASIC_DETAILS_FORM_LABEL} pending`,
  basic_details_expired: `${BASIC_DETAILS_FORM_LABEL} expired`,
  basic_details_not_sent: `${BASIC_DETAILS_FORM_LABEL} not sent`,
  caf_submitted: "CAF submitted",
  caf_pending: "CAF pending",
  caf_expired: "CAF expired",
  high_priority: "High",
  medium_priority: "Medium",
  low_priority: "Low",
  l1_done: "L1 done",
  l1_pending: "L1 pending",
  l2_done: "L2 done",
  l2_pending: "L2 pending",
  needs_attention: "Needs attention",
};
const CANDIDATE_TAG_ORDER = [
  "standard",
  "intern",
  "basic_details_submitted",
  "basic_details_pending",
  "basic_details_expired",
  "basic_details_not_sent",
  "caf_submitted",
  "caf_pending",
  "caf_expired",
  "high_priority",
  "medium_priority",
  "low_priority",
  "l1_done",
  "l1_pending",
  "l2_done",
  "l2_pending",
  "needs_attention",
] as const;
const STAGE_SLA_DAYS: Record<string, number> = {
  enquiry: 2,
  hr_screening: 2,
  l2_shortlist: 2,
  l2_interview: 3,
  l2_feedback: 2,
  sprint: 3,
  l1_shortlist: 2,
  l1_interview: 3,
  l1_feedback: 2,
  offer: 3,
  joining_documents: 5,
  hired: 7,
  declined: 7,
  rejected: 7,
};

function candidateFilterTags(candidate: CandidateListItem) {
  const tags = new Set<string>();
  const intern = isInternCandidate(candidate);
  tags.add(intern ? "intern" : "standard");

  if (!intern) {
    const basicDetailsSent = candidate.basic_details_form_sent_at || candidate.caf_sent_at;
    const basicDetailsSubmitted = candidate.basic_details_form_submitted_at || candidate.caf_submitted_at;
    if (basicDetailsSubmitted) tags.add("basic_details_submitted");
    else if (linkExpired(basicDetailsSent, basicDetailsSubmitted, BASIC_DETAILS_LINK_EXPIRY_HOURS)) tags.add("basic_details_expired");
    else if (basicDetailsSent) tags.add("basic_details_pending");
    else tags.add("basic_details_not_sent");

    const assessmentSent = candidate.candidate_assessment_form_sent_at || candidate.assessment_sent_at;
    const assessmentSubmitted = candidate.candidate_assessment_form_submitted_at || candidate.assessment_submitted_at;
    if (assessmentSubmitted) tags.add("caf_submitted");
    else if (linkExpired(assessmentSent, assessmentSubmitted, ASSESSMENT_LINK_EXPIRY_HOURS)) tags.add("caf_expired");
    else tags.add("caf_pending");
  }

  const screening = (candidate.screening_result || "").trim().toLowerCase();
  if (screening === "red" || screening === "high" || (candidate.ageing_days || 0) >= 2) tags.add("high_priority");
  else if (screening === "amber" || screening === "medium") tags.add("medium_priority");
  else if (screening === "green" || screening === "low") tags.add("low_priority");

  if ((candidate.l1_interview_count || 0) > 0) {
    tags.add(candidate.l1_feedback_submitted ? "l1_done" : "l1_pending");
  }
  if ((candidate.l2_interview_count || 0) > 0) {
    tags.add(candidate.l2_feedback_submitted ? "l2_done" : "l2_pending");
  }
  if (isAttentionCandidate(candidate)) tags.add("needs_attention");

  return Array.from(tags);
}

type SavedView = {
  id: string;
  name: string;
  selectedStages: string[];
  openingIds: string[];
  selectedTags: string[];
  openingId?: string;
  statusView: "all" | "active" | "hired" | "rejected";
  needsAttention: boolean;
  cafToday: boolean;
};

function normalizeOpeningSelection(values: Iterable<string | null | undefined>) {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = String(value || "").trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    normalized.push(cleaned);
  }
  return normalized;
}

function parseOpeningSearchParams(searchParams: ReadonlyURLSearchParams) {
  const rawValues = searchParams.getAll("opening_id");
  const values = rawValues.length ? rawValues : [searchParams.get("opening_id") || ""];
  return normalizeOpeningSelection(values.flatMap((value) => String(value || "").split(",")));
}

function normalizeCandidateTag(value: string | null | undefined) {
  const cleaned = String(value || "").trim().toLowerCase();
  return cleaned in CANDIDATE_TAG_LABELS ? cleaned : "";
}

function parseCandidateTagSearchParams(searchParams: ReadonlyURLSearchParams) {
  const rawValues = searchParams.getAll("tag");
  const values = rawValues.length
    ? rawValues
    : searchParams.getAll("opening_tag").length
      ? searchParams.getAll("opening_tag")
      : [searchParams.get("tag") || searchParams.get("opening_tag") || ""];
  const tags: string[] = [];
  const seen = new Set<string>();
  values
    .flatMap((value) => String(value || "").split(","))
    .forEach((value) => {
      const cleaned = normalizeCandidateTag(value);
      if (!cleaned || seen.has(cleaned)) return;
      seen.add(cleaned);
      tags.push(cleaned);
    });
  return tags;
}

function normalizeSavedView(raw: unknown): SavedView | null {
  if (!raw || typeof raw !== "object") return null;
  const view = raw as Record<string, unknown>;
  const selectedStages = Array.isArray(view.selectedStages)
    ? view.selectedStages
      .map((item) => normalizeStage(String(item || "")))
      .filter((item): item is RecruitmentStageKey => item !== "")
    : [];
  const openingIds = Array.isArray(view.openingIds)
    ? normalizeOpeningSelection(view.openingIds.map((item) => String(item || "")))
    : normalizeOpeningSelection([String(view.openingId || "")]);
  const selectedTags = Array.isArray(view.selectedTags)
    ? view.selectedTags
      .map((item) => normalizeCandidateTag(String(item || "")))
      .filter(Boolean)
    : Array.isArray(view.selectedOpeningTags)
      ? view.selectedOpeningTags
        .map((item) => normalizeCandidateTag(String(item || "")))
      .filter(Boolean)
      : [];
  const statusCandidate = String(view.statusView || "active").trim().toLowerCase();
  const statusView =
    statusCandidate === "all" || statusCandidate === "active" || statusCandidate === "hired" || statusCandidate === "rejected"
      ? statusCandidate
      : "active";
  const id = String(view.id || "").trim();
  const name = String(view.name || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    selectedStages,
    openingIds,
    selectedTags,
    statusView,
    needsAttention: Boolean(view.needsAttention),
    cafToday: Boolean(view.cafToday),
  };
}

async function fetchCandidates(params: {
  stage: string[];
  openingIds: string[];
  statusView: "all" | "active" | "hired" | "rejected";
}) {
  const url = new URL("/api/rec/candidates", window.location.origin);
  for (const st of params.stage) url.searchParams.append("stage", st);
  for (const openingId of params.openingIds) url.searchParams.append("opening_id", openingId);

  if (params.statusView === "hired") url.searchParams.append("status", "hired");
  if (params.statusView === "rejected") {
    url.searchParams.append("status", "rejected");
    url.searchParams.append("status", "declined");
  }
  if (params.statusView === "active") {
    for (const s of ["new", "enquiry", "in_process", "offer"]) url.searchParams.append("status", s);
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (res.status === 401) {
    redirectToLogin();
    return [];
  }
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateListItem[];
}

async function transitionCandidateStage(params: {
  candidateId: number;
  toStage: RecruitmentStageKey;
  decision?: string;
  reason?: string;
  note?: string;
}) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(String(params.candidateId))}/transition`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      to_stage: params.toStage,
      decision: params.decision || defaultTransitionDecision(params.toStage),
      reason: params.reason || undefined,
      note: params.note || "candidate_board_transition",
    }),
  });
  if (res.status === 401) {
    redirectToLogin();
    return;
  }
  if (!res.ok) throw new Error(await res.text());
}

async function markLegacyCafComplete(candidateIds: number[]) {
  const res = await fetch("/api/rec/candidates/legacy-caf-complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      candidate_ids: candidateIds,
      note: "bulk_legacy_caf_backfill",
    }),
  });
  if (res.status === 401) {
    redirectToLogin();
    return null;
  }
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as {
    requested_count: number;
    updated_count: number;
    skipped_count: number;
    screening_seeded_count: number;
  };
}

async function resendExpiredAssessmentLinks(candidateIds: number[]) {
  const res = await fetch("/api/rec/candidates/candidate-assessment-form-link/resend-expired", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      candidate_ids: candidateIds,
    }),
  });
  if (res.status === 401) {
    redirectToLogin();
    return null;
  }
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as {
    requested_count?: number | null;
    eligible_count: number;
    attempted_count: number;
    sent_count: number;
    failed_count: number;
    skipped_count: number;
    expiry_window?: string | null;
  };
}

function canTransitionCandidate(candidate: CandidateListItem, toStage: RecruitmentStageKey) {
  const current = normalizeStage(candidate.current_stage);
  if (!current) return { ok: true as const };
  if (current === toStage) return { ok: false as const, reason: "Candidate is already in this stage." };
  const assessmentLocked =
    !isInternCandidate(candidate) &&
    isAssessmentLockedStage(toStage) &&
    !(candidate.candidate_assessment_form_submitted_at || candidate.assessment_submitted_at);
  if (assessmentLocked) {
    return {
      ok: false as const,
      reason: `${CANDIDATE_ASSESSMENT_FORM_LABEL} is pending. Moving to L2 interview and later stages is blocked.`,
    };
  }
  if (toStage === "hr_screening" && !candidate.l2_owner_email) {
    return { ok: false as const, reason: "GL/L2 owner is required before HR screening." };
  }
  return { ok: true as const };
}

function nextBestAction(candidate: CandidateListItem) {
  const stage = normalizeStage(candidate.current_stage);
  if (!candidate.l2_owner_email && stage === "enquiry") return "Assign GL/L2 owner to unlock HR screening.";
  if (!isInternCandidate(candidate) && stage === "hr_screening" && !(candidate.basic_details_form_submitted_at || candidate.caf_submitted_at)) {
    return `${BASIC_DETAILS_FORM_LABEL} should be marked submitted for this candidate record.`;
  }
  if (!isInternCandidate(candidate) && stage === "l2_shortlist" && !(candidate.candidate_assessment_form_submitted_at || candidate.assessment_submitted_at)) {
    return `Follow up for ${CANDIDATE_ASSESSMENT_FORM_LABEL.toLowerCase()} submission before scheduling the L2 interview.`;
  }
  if (stage === "l2_feedback") return "Capture decision quickly and move to Sprint/Reject.";
  if (stage === "l1_feedback") return "Create and send offer draft immediately.";
  if (stage === "offer") return "Follow up on offer decision and timeline.";
  if ((candidate.ageing_days || 0) >= 3) return "Aging breach risk. Prioritize this candidate today.";
  return "Continue stage progression based on latest feedback.";
}

export function CandidatesClient({
  initialCandidates,
  openings,
  canNavigate = true,
  canViewBasicDetails = false,
  showTagFilters = false,
  canUseSuperadminExpiredCafResend = false,
}: Props) {
  const { pushToast } = useToast();
  const [candidates, setCandidates] = useState<CandidateListItem[]>(initialCandidates);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [initialized, setInitialized] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [savedViewsHydrated, setSavedViewsHydrated] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "board">("table");
  const [dragCandidateId, setDragCandidateId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [openingFilterOpen, setOpeningFilterOpen] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<number>>(new Set());
  const [bulkTargetStage, setBulkTargetStage] = useState<RecruitmentStageKey | "">("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkLegacyCafBusy, setBulkLegacyCafBusy] = useState(false);
  const [bulkExpiredCafBusy, setBulkExpiredCafBusy] = useState(false);
  const openingFilterRef = useRef<HTMLDivElement | null>(null);

  const tableGrid =
    "grid grid-cols-[minmax(200px,2.4fr)_minmax(140px,1.2fr)_minmax(170px,1.5fr)_minmax(200px,1.9fr)_minmax(80px,0.7fr)_minmax(80px,0.7fr)_minmax(95px,0.8fr)]";

  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [openingIds, setOpeningIds] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [statusView, setStatusView] = useState<"all" | "active" | "hired" | "rejected">("active");
  const [needsAttention, setNeedsAttention] = useState(false);
  const [cafToday, setCafToday] = useState(false);

  const reloadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCandidates({ stage: selectedStages, openingIds, statusView });
      setCandidates(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load candidates");
    } finally {
      setLoading(false);
    }
  }, [selectedStages, openingIds, statusView]);

  const openingLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    openings.forEach((opening) => {
      const label = (opening.title || opening.opening_code || `Opening ${opening.opening_id}`).slice(0, 80);
      map.set(String(opening.opening_id), label);
    });
    return map;
  }, [openings]);

  const selectedOpeningLabels = useMemo(
    () => openingIds.map((id) => openingLabelMap.get(id) || `Opening ${id}`),
    [openingIds, openingLabelMap]
  );
  const allOpeningIds = useMemo(
    () => openings.map((opening) => String(opening.opening_id)),
    [openings]
  );
  const allOpeningsSelected = openings.length > 0 && openingIds.length === openings.length;

  const openingFilterLabel = useMemo(() => {
    if (!selectedOpeningLabels.length) return "All openings";
    if (selectedOpeningLabels.length <= 2) return selectedOpeningLabels.join(", ");
    return `${selectedOpeningLabels[0]} +${selectedOpeningLabels.length - 1}`;
  }, [selectedOpeningLabels]);

  const availableTags = useMemo(() => {
    const seen = new Set<string>();
    candidates.forEach((candidate) => {
      candidateFilterTags(candidate).forEach((tag) => {
        if (tag) seen.add(tag);
      });
    });
    return CANDIDATE_TAG_ORDER.filter((tag) => seen.has(tag) || selectedTags.includes(tag));
  }, [candidates, selectedTags]);

  const selectedTagLabels = useMemo(
    () => selectedTags.map((tag) => CANDIDATE_TAG_LABELS[tag] || tag),
    [selectedTags]
  );

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    ));
  }

  function toggleOpeningSelection(openingId: string) {
    setOpeningIds((prev) => (
      prev.includes(openingId) ? prev.filter((item) => item !== openingId) : [...prev, openingId]
    ));
  }

  function selectAllOpenings() {
    setOpeningIds(allOpeningIds);
  }

  function clearAllOpenings() {
    setOpeningIds([]);
  }

  function resetFilters() {
    setSelectedStages([]);
    setOpeningIds([]);
    setSelectedTags([]);
    setStatusView("active");
    setNeedsAttention(false);
    setCafToday(false);
    setOpeningFilterOpen(false);
  }

  function applySavedView(view: SavedView) {
    setSelectedStages(view.selectedStages || []);
    setOpeningIds(normalizeOpeningSelection(view.openingIds || [view.openingId || ""]));
    setSelectedTags((view.selectedTags || []).filter(Boolean));
    setStatusView(view.statusView || "active");
    setNeedsAttention(Boolean(view.needsAttention));
    setCafToday(Boolean(view.cafToday));
    setOpeningFilterOpen(false);
    pushToast({ tone: "info", title: `View loaded: ${view.name}` });
    trackUxMetric({ event_name: "candidate_saved_view_applied", entity_type: "saved_view", entity_id: view.id });
  }

  function saveCurrentView() {
    const name = `View ${savedViews.length + 1}`;
    const view: SavedView = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      selectedStages: [...selectedStages],
      openingIds: [...openingIds],
      selectedTags: [...selectedTags],
      statusView,
      needsAttention,
      cafToday,
    };
    setSavedViews((prev) => [view, ...prev].slice(0, 12));
    pushToast({ tone: "success", title: `Saved view: ${view.name}` });
    trackUxMetric({ event_name: "candidate_saved_view_created", entity_type: "saved_view", entity_id: view.id });
  }

  function toDayKey(value: Date, tz: string) {
    return value.toLocaleDateString("en-CA", { timeZone: tz });
  }

  useEffect(() => {
    if (initialized) return;
    const stageValues = new Set<string>();
    const rawStages = searchParams.getAll("stage");
    if (rawStages.length) {
      rawStages.forEach((raw) => {
        const cleaned = normalizeStage(raw);
        if (cleaned) stageValues.add(cleaned);
      });
    } else {
      const raw = searchParams.get("stage") || "";
      raw.split(",").forEach((item) => {
        const cleaned = normalizeStage(item);
        if (cleaned) stageValues.add(cleaned);
      });
    }
    if (stageValues.size) setSelectedStages(Array.from(stageValues));

    const nextStatus = (searchParams.get("status_view") || "").trim().toLowerCase();
    if (nextStatus === "all" || nextStatus === "active" || nextStatus === "hired" || nextStatus === "rejected") {
      setStatusView(nextStatus);
    }
    const nextOpenings = parseOpeningSearchParams(searchParams);
    if (nextOpenings.length) setOpeningIds(nextOpenings);
    const nextTags = parseCandidateTagSearchParams(searchParams);
    if (nextTags.length) setSelectedTags(nextTags);

    setNeedsAttention(searchParams.get("needs_attention") === "1");
    setCafToday(searchParams.get("caf_today") === "1");
    setInitialized(true);
  }, [initialized, searchParams]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("rec_candidates_saved_views_v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setSavedViews(
        parsed
          .map((item) => normalizeSavedView(item))
          .filter((item): item is SavedView => item !== null)
          .slice(0, 12)
      );
    } catch {
      // Ignore malformed local storage data.
    } finally {
      setSavedViewsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!savedViewsHydrated) return;
    try {
      window.localStorage.setItem("rec_candidates_saved_views_v1", JSON.stringify(savedViews.slice(0, 12)));
    } catch {
      // Ignore storage write issues.
    }
  }, [savedViews, savedViewsHydrated]);

  useEffect(() => {
    if (!openingFilterOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (openingFilterRef.current && !openingFilterRef.current.contains(event.target as Node)) {
        setOpeningFilterOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpeningFilterOpen(false);
    }
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [openingFilterOpen]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      (async () => {
        try {
          await reloadCandidates();
        } finally {
          // no-op
        }
      })();
    }, 150);
    return () => {
      window.clearTimeout(handle);
    };
  }, [reloadCandidates]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let pending = false;
    const source = new EventSource("/api/rec/events/stream");

    async function refresh() {
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      try {
        await reloadCandidates();
      } finally {
        inFlight = false;
        if (pending && !cancelled) {
          pending = false;
          void refresh();
        }
      }
    }

    source.onmessage = () => {
      void refresh();
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, [reloadCandidates]);

  const filtered = useMemo(() => {
    let current = candidates;
    if (cafToday) {
      const todayKey = toDayKey(new Date(), "Asia/Kolkata");
      current = current.filter((c) => {
        if (!c.caf_submitted_at) return false;
        const parsed = parseDateUtc(c.caf_submitted_at);
        if (!parsed || Number.isNaN(parsed.getTime())) return false;
        return toDayKey(parsed, "Asia/Kolkata") === todayKey;
      });
    }
    if (needsAttention) {
      current = current.filter((candidate) => isAttentionCandidate(candidate));
    }
    if (selectedTags.length) {
      current = current.filter((candidate) => {
        const tags = candidateFilterTags(candidate);
        return selectedTags.every((tag) => tags.includes(tag));
      });
    }
    return current;
  }, [candidates, needsAttention, cafToday, selectedTags]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedCandidateId(null);
      return;
    }
    if (selectedCandidateId == null || !filtered.some((item) => item.candidate_id === selectedCandidateId)) {
      setSelectedCandidateId(filtered[0].candidate_id);
    }
  }, [filtered, selectedCandidateId]);

  useEffect(() => {
    setSelectedCandidateIds((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set(filtered.map((candidate) => candidate.candidate_id));
      const next = new Set<number>();
      for (const candidateId of prev) {
        if (allowed.has(candidateId)) next.add(candidateId);
      }
      return next;
    });
  }, [filtered]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName.toLowerCase();
        if (["input", "textarea", "select"].includes(tag) || event.target.isContentEditable) return;
      }
      if (!filtered.length) return;
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        setSelectedCandidateId((prev) => {
          const currentIdx = filtered.findIndex((item) => item.candidate_id === prev);
          const nextIdx = currentIdx < 0 ? 0 : Math.min(filtered.length - 1, currentIdx + 1);
          return filtered[nextIdx].candidate_id;
        });
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSelectedCandidateId((prev) => {
          const currentIdx = filtered.findIndex((item) => item.candidate_id === prev);
          const nextIdx = currentIdx <= 0 ? 0 : currentIdx - 1;
          return filtered[nextIdx].candidate_id;
        });
      }
      if (event.key.toLowerCase() === "e") {
        const selected = filtered.find((item) => item.candidate_id === selectedCandidateId);
        if (!selected) return;
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
        window.location.href = `${basePath}/candidates/${selected.candidate_id}`;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, selectedCandidateId]);

  const selectedCandidate = useMemo(
    () => filtered.find((item) => item.candidate_id === selectedCandidateId) || null,
    [filtered, selectedCandidateId]
  );

  const stageDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const candidate of filtered) {
      const key = normalizeStage(candidate.current_stage) || "unknown";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, count]) => ({ key, label: stageLabels[key] || key.replace(/_/g, " "), count }));
  }, [filtered]);

  const attentionQueue = useMemo(() => {
    return filtered
      .filter((candidate) => isAttentionCandidate(candidate))
      .sort((a, b) => (b.ageing_days || 0) - (a.ageing_days || 0))
      .slice(0, 5);
  }, [filtered]);

  const attentionCount = useMemo(
    () => filtered.filter((candidate) => isAttentionCandidate(candidate)).length,
    [filtered]
  );

  const boardBuckets = useMemo(() => {
    const grouped = new Map<string, CandidateListItem[]>();
    for (const column of BOARD_COLUMNS) grouped.set(column.key, []);
    for (const candidate of filtered) {
      const key = normalizeStage(candidate.current_stage) || "enquiry";
      const list = grouped.get(key);
      if (list) list.push(candidate);
    }
    return BOARD_COLUMNS.map((column) => {
      const items = grouped.get(column.key) || [];
      const avgAge = items.length
        ? Math.round(items.reduce((sum, item) => sum + Number(item.ageing_days || 0), 0) / items.length)
        : 0;
      const breachCount = items.filter((item) => Number(item.ageing_days || 0) > (STAGE_SLA_DAYS[column.key] || 3)).length;
      return { column, items, avgAge, breachCount };
    });
  }, [filtered]);

  const selectedCandidates = useMemo(
    () => filtered.filter((candidate) => selectedCandidateIds.has(candidate.candidate_id)),
    [filtered, selectedCandidateIds]
  );
  const selectedExpiredCafCandidates = useMemo(
    () =>
      selectedCandidates.filter((candidate) => {
        if (isInternCandidate(candidate)) return false;
        const sentAt = candidate.basic_details_form_sent_at || candidate.caf_sent_at;
        const submittedAt = candidate.basic_details_form_submitted_at || candidate.caf_submitted_at;
        return linkExpired(sentAt, submittedAt, BASIC_DETAILS_LINK_EXPIRY_HOURS);
      }),
    [selectedCandidates]
  );

  const allFilteredSelected = filtered.length > 0 && filtered.every((candidate) => selectedCandidateIds.has(candidate.candidate_id));

  function toggleCandidateSelection(candidateId: number) {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  async function moveCandidate(candidate: CandidateListItem, toStage: RecruitmentStageKey, source: "drag_drop" | "bulk") {
    const eligibility = canTransitionCandidate(candidate, toStage);
    if (!eligibility.ok) {
      pushToast({ tone: "warning", title: "Transition blocked", description: eligibility.reason });
      return false;
    }
    const decision = defaultTransitionDecision(toStage);
    let reason: string | undefined;
    if (decision === "reject" || decision === "decline") {
      const prompted = window.prompt("Reason for this terminal transition:", "");
      if (!prompted || !prompted.trim()) {
        pushToast({ tone: "warning", title: "Reason required", description: "Transition cancelled." });
        return false;
      }
      reason = prompted.trim();
    }
    try {
      await transitionCandidateStage({
        candidateId: candidate.candidate_id,
        toStage,
        decision,
        reason,
        note: source === "drag_drop" ? "candidate_board_drag_drop" : "candidate_bulk_transition",
      });
      pushToast({
        tone: "success",
        title: `${candidate.name} moved`,
        description: `Updated to ${stageLabel(toStage)}.`,
      });
      trackUxMetric({
        event_name: source === "drag_drop" ? "candidate_stage_drag_drop" : "candidate_stage_bulk_transition_item",
        entity_type: "candidate",
        entity_id: String(candidate.candidate_id),
        metadata: { to_stage: toStage },
      });
      return true;
    } catch (e: any) {
      pushToast({
        tone: "error",
        title: `Could not move ${candidate.name}`,
        description: e?.message || "Transition failed.",
      });
      return false;
    } finally {
      // no-op
    }
  }

  async function runBulkTransition() {
    if (!bulkTargetStage) return;
    if (!selectedCandidates.length) {
      pushToast({ tone: "warning", title: "No candidates selected" });
      return;
    }
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    for (const candidate of selectedCandidates) {
      const moved = await moveCandidate(candidate, bulkTargetStage, "bulk");
      if (moved) ok += 1;
      else failed += 1;
    }
    setBulkBusy(false);
    await reloadCandidates();
    pushToast({
      tone: failed ? "warning" : "success",
      title: "Bulk transition complete",
      description: `${ok} moved, ${failed} failed.`,
    });
    trackUxMetric({
      event_name: "candidate_stage_bulk_transition",
      entity_type: "candidate_bulk",
      entity_id: String(Date.now()),
      metadata: { moved: ok, failed, to_stage: bulkTargetStage },
    });
    if (!failed) setSelectedCandidateIds(new Set());
  }

  async function runLegacyCafBackfill() {
    if (!selectedCandidates.length) {
      pushToast({ tone: "warning", title: "No candidates selected" });
      return;
    }
    setBulkLegacyCafBusy(true);
    try {
      const result = await markLegacyCafComplete(selectedCandidates.map((candidate) => candidate.candidate_id));
      if (!result) return;
      await reloadCandidates();
      pushToast({
        tone: result.skipped_count ? "warning" : "success",
        title: `Legacy ${BASIC_DETAILS_FORM_LABEL} backfill complete`,
        description: `${result.updated_count} updated, ${result.skipped_count} skipped.`,
      });
      trackUxMetric({
        event_name: "candidate_legacy_caf_backfill_bulk",
        entity_type: "candidate_bulk",
        entity_id: String(Date.now()),
        metadata: {
          requested: result.requested_count,
          updated: result.updated_count,
          skipped: result.skipped_count,
          screening_seeded: result.screening_seeded_count,
        },
      });
    } catch (e: any) {
      pushToast({
        tone: "error",
        title: `Legacy ${BASIC_DETAILS_FORM_LABEL} backfill failed`,
        description: e?.message || "Could not update selected candidates.",
      });
    } finally {
      setBulkLegacyCafBusy(false);
    }
  }

  async function runExpiredCafResend() {
    if (!selectedCandidateIds.size) {
      pushToast({ tone: "warning", title: "No candidates selected" });
      return;
    }
    if (!selectedExpiredCafCandidates.length) {
      pushToast({
        tone: "warning",
        title: "No expired CAF links in selection",
        description: "Apply CAF-expired filters or select candidates whose assessment links are already expired.",
      });
      return;
    }
    setBulkExpiredCafBusy(true);
    try {
      const result = await resendExpiredAssessmentLinks(
        selectedExpiredCafCandidates.map((candidate) => candidate.candidate_id)
      );
      if (!result) return;
      await reloadCandidates();
      pushToast({
        tone: result.failed_count || result.skipped_count ? "warning" : "success",
        title: "Expired CAF resend complete",
        description:
          result.sent_count > 0
            ? `${result.sent_count} sent, ${result.failed_count} failed, ${result.skipped_count} skipped.`
            : "No expired CAF links were found in the selected candidates.",
      });
      trackUxMetric({
        event_name: "candidate_expired_assessment_resend_bulk",
        entity_type: "candidate_bulk",
        entity_id: String(Date.now()),
        metadata: {
          requested: result.requested_count ?? selectedExpiredCafCandidates.length,
          eligible: result.eligible_count,
          attempted: result.attempted_count,
          sent: result.sent_count,
          failed: result.failed_count,
          skipped: result.skipped_count,
        },
      });
    } catch (e: any) {
      pushToast({
        tone: "error",
        title: "Expired CAF resend failed",
        description: e?.message || "Could not resend expired CAF links for the selected candidates.",
      });
    } finally {
      setBulkExpiredCafBusy(false);
    }
  }

  async function handleDropToStage(toStage: RecruitmentStageKey) {
    if (!dragCandidateId) return;
    const candidate = filtered.find((item) => item.candidate_id === dragCandidateId);
    setDragOverStage(null);
    setDragCandidateId(null);
    if (!candidate) return;
    const moved = await moveCandidate(candidate, toStage, "drag_drop");
    if (moved) await reloadCandidates();
  }

  return (
    <main className="content-pad space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Control panel</p>
          <h1 className="text-2xl font-semibold text-slate-900">Candidates</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            Total {filtered.length}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            Attention {attentionCount}
          </span>
          {loading ? <span className="text-xs text-slate-500">Refreshing...</span> : null}
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="rounded-2xl border border-slate-200 bg-white/70 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                Filters
              </div>
              <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
                {(["active", "all", "hired", "rejected"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={clsx(
                      "rounded-full px-3 py-1 text-[11px] font-semibold transition",
                      statusView === v ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                    )}
                    onClick={() => setStatusView(v)}
                  >
                    {v === "all" ? "All" : v === "active" ? "Active" : v === "hired" ? "Hired" : "Rejected"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-1">
                <span className="px-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quick</span>
                <button
                  type="button"
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ring-transparent transition",
                    needsAttention ? "bg-amber-500/15 text-amber-800 ring-amber-500/20" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                  )}
                  onClick={() => setNeedsAttention((v) => !v)}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Needs attention
                </button>
                <button
                  type="button"
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ring-transparent transition",
                    cafToday ? "bg-emerald-500/15 text-emerald-800 ring-emerald-500/20" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                  )}
                  onClick={() => setCafToday((v) => !v)}
                >
                  Basic Details today
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={openingFilterRef}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <span>Openings</span>
                <button
                  type="button"
                  onClick={() => setOpeningFilterOpen((value) => !value)}
                  className="inline-flex min-w-[10rem] max-w-[13rem] items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs text-slate-700"
                  aria-haspopup="dialog"
                  aria-expanded={openingFilterOpen}
                >
                  <span className="truncate">{openingFilterLabel}</span>
                  <ChevronDown className={clsx("h-3.5 w-3.5 shrink-0 text-slate-500 transition", openingFilterOpen && "rotate-180")} />
                </button>
              </div>
              {openingFilterOpen ? (
                <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <div className="mb-2 px-1">
                    <p className="text-xs font-semibold text-slate-900">Select openings</p>
                    <p className="text-[11px] text-slate-500">
                      Choose one or more openings to filter candidates.
                      {openingIds.length ? ` ${openingIds.length} selected.` : " Showing all openings."}
                    </p>
                  </div>
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <button
                      type="button"
                      onClick={selectAllOpenings}
                      disabled={allOpeningsSelected}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={clearAllOpenings}
                      disabled={openingIds.length === 0}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Clear all
                    </button>
                    <span className="ml-auto text-[11px] font-medium text-slate-500">
                      {allOpeningsSelected ? "All selected" : `${openingIds.length}/${openings.length}`}
                    </span>
                  </div>
                  <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                    {openings.map((opening) => {
                      const openingId = String(opening.opening_id);
                      const checked = openingIds.includes(openingId);
                      const title = (opening.title || opening.opening_code || `Opening ${opening.opening_id}`).slice(0, 80);
                      return (
                        <label
                          key={opening.opening_id}
                          className={clsx(
                            "flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 transition",
                            checked ? "bg-slate-100" : "hover:bg-slate-50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOpeningSelection(openingId)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--brand-color)] focus:ring-[var(--brand-color)]"
                          />
                          <span className="min-w-0 truncate text-xs text-slate-800">
                            <span className="font-semibold">{title}</span>
                            {opening.opening_code ? (
                              <span className="ml-1 text-[11px] font-medium text-slate-500">{opening.opening_code}</span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  viewMode === "table" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                )}
              >
                <Rows3 className="h-3.5 w-3.5" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode("board")}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  viewMode === "board" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Board
              </button>
            </div>

            <button
              type="button"
              onClick={saveCurrentView}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Bookmark className="h-3.5 w-3.5" />
              Save view
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Stage</span>
              <button
                type="button"
                onClick={() => setSelectedStages([])}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-white"
                title="Clear stage filter"
              >
                <XCircle className="h-3 w-3" />
                Clear
              </button>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1">
              {STAGE_OPTIONS.map((stage) => {
                const active = selectedStages.includes(stage);
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => {
                      setSelectedStages((prev) =>
                        prev.includes(stage) ? prev.filter((s) => s !== stage) : [...prev, stage]
                      );
                    }}
                    className={clsx(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                      active ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {stageLabels[stage] || stage}
                  </button>
                );
              })}
            </div>
          </div>

          {showTagFilters && availableTags.length ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tags</span>
                <button
                  type="button"
                  onClick={() => setSelectedTags([])}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-white"
                  title="Clear tag filter"
                >
                  <XCircle className="h-3 w-3" />
                  Clear
                </button>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1">
                {availableTags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={clsx(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                        active ? "bg-[rgba(15,118,110,0.16)] text-teal-800 ring-1 ring-teal-600/20" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                      )}
                    >
                      {CANDIDATE_TAG_LABELS[tag] || tag}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {openingIds.length || (showTagFilters && selectedTags.length) ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
            <div className="flex flex-wrap items-start gap-3">
              {openingIds.length ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Openings</span>
                  {openingIds.map((openingId, index) => (
                    <button
                      key={openingId}
                      type="button"
                      onClick={() => toggleOpeningSelection(openingId)}
                      className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                      title="Remove opening filter"
                    >
                      {selectedOpeningLabels[index] || `Opening ${openingId}`}
                      <XCircle className="h-3 w-3 text-slate-400" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={clearAllOpenings}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                  >
                    Clear openings
                  </button>
                </div>
              ) : null}

              {showTagFilters && selectedTags.length ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tags</span>
                  {selectedTags.map((tag, index) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                      title="Remove tag filter"
                    >
                      {selectedTagLabels[index] || tag}
                      <XCircle className="h-3 w-3 text-slate-400" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSelectedTags([])}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                  >
                    Clear tags
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500">Saved</span>
          {savedViews.length === 0 ? (
            <p className="text-[11px] text-slate-500">No saved views yet.</p>
          ) : (
            savedViews.map((view) => (
              <button
                key={view.id}
                type="button"
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => applySavedView(view)}
              >
                {view.name}
              </button>
            ))
          )}
          <span className="ml-auto text-[11px] text-slate-500">Shortcuts: J/K move · E open profile</span>
        </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-2.5 py-2">
            <span className="text-[11px] font-semibold text-amber-900">Bulk transition</span>
            <button
              type="button"
            className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
            onClick={() => {
              if (allFilteredSelected) {
                setSelectedCandidateIds(new Set());
                return;
              }
              setSelectedCandidateIds(new Set(filtered.map((candidate) => candidate.candidate_id)));
            }}
            >
              {allFilteredSelected ? "Clear selection" : "Select filtered"}
            </button>
            <span className="text-[11px] text-amber-800">{selectedCandidateIds.size} selected</span>
            {canUseSuperadminExpiredCafResend ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void runExpiredCafResend();
                  }}
                  disabled={
                    bulkBusy ||
                    bulkLegacyCafBusy ||
                    bulkExpiredCafBusy ||
                    selectedCandidateIds.size === 0 ||
                    selectedExpiredCafCandidates.length === 0
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] font-semibold text-amber-900 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {bulkExpiredCafBusy ? "Resending expired CAF..." : "Resend expired CAF links"}
                </button>
                <span className="text-[11px] text-amber-800">
                  {selectedExpiredCafCandidates.length} expired in selection
                </span>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void runLegacyCafBackfill();
              }}
              disabled={bulkBusy || bulkLegacyCafBusy || bulkExpiredCafBusy || selectedCandidateIds.size === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] font-semibold text-amber-900 disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {bulkLegacyCafBusy ? `Marking ${BASIC_DETAILS_FORM_LABEL}...` : `Mark selected ${BASIC_DETAILS_FORM_LABEL} done`}
            </button>
          <select
              value={bulkTargetStage}
              onChange={(e) => setBulkTargetStage((e.target.value || "") as RecruitmentStageKey | "")}
              className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] text-slate-700"
            >
            <option value="">Move selected to...</option>
            {BOARD_COLUMNS.map((stage) => (
              <option key={stage.key} value={stage.key}>
                {stage.label}
              </option>
            ))}
          </select>
          <button
              type="button"
              onClick={() => {
                void runBulkTransition();
              }}
              disabled={bulkBusy || bulkLegacyCafBusy || bulkExpiredCafBusy || !bulkTargetStage || selectedCandidateIds.size === 0}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-700 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
            >
            <MoveRight className="h-3.5 w-3.5" />
            {bulkBusy ? "Moving..." : "Run bulk move"}
          </button>
          <span className="ml-auto text-[11px] text-amber-800">Reversible: switch to Table/Classic anytime</span>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        {viewMode === "table" ? (
        <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-200 bg-white/70">
          <div
            className={clsx(
              "gap-2 border-b border-slate-200 px-3 py-1.5 text-[11px] uppercase tracking-wide text-slate-500",
              tableGrid
            )}
          >
            <span>Candidate</span>
            <span>Opening</span>
            <span>Stage</span>
            <span>{SCREENING_DETAILS_LABEL}</span>
            <span className="text-center">Applied age</span>
            <span className="text-center">Stage age</span>
            <span>Status</span>
          </div>

          <div className="divide-y divide-slate-200">
            {filtered.map((candidate) => {
              const caf = cafChip(candidate);
              const assessment = assessmentChip(candidate);
              const screening = priorityChip(candidate);
              const stageKey = normalizeStage(candidate.current_stage);
              const stageClass = stageTone[stageKey] || "bg-slate-500/10 text-slate-700 ring-1 ring-slate-500/15";
              const attention = isAttentionCandidate(candidate);
              const l1Count = candidate.l1_interview_count || 0;
              const l2Count = candidate.l2_interview_count || 0;
              const l1Feedback = !!candidate.l1_feedback_submitted;
              const l2Feedback = !!candidate.l2_feedback_submitted;

              const appliedAgeRaw = Number.isFinite(candidate.applied_ageing_days) ? candidate.applied_ageing_days : 0;
              const appliedAge =
                appliedAgeRaw > 0
                  ? appliedAgeRaw
                  : candidate.created_at
                    ? Math.max(
                        0,
                        Math.floor(
                          (new Date().getTime() - new Date(candidate.created_at).getTime()) / (24 * 60 * 60 * 1000)
                        )
                      )
                    : 0;
              const isSelected = selectedCandidateId === candidate.candidate_id;
              const rowClass = clsx(
                "gap-2 px-3 py-2.5 transition",
                canNavigate ? "hover:bg-white/80" : "",
                tableGrid,
                attention ? "bg-amber-500/5" : "",
                isSelected ? "ring-2 ring-inset ring-[rgba(19,120,209,0.45)]" : ""
              );
              const rowContent = (
                <>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{candidate.name}</p>
                    <p className="text-[11px] text-slate-600">{candidate.candidate_code}</p>
                    {sourceLabel(candidate) ? <p className="text-[10px] text-slate-500">{sourceLabel(candidate)}</p> : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{candidate.opening_title || "-"}</p>
                    <p className="text-[11px] text-slate-600">{candidate.opening_id ? `ID: ${candidate.opening_id}` : ""}</p>
                  </div>
                  <div className="min-w-0">
                    <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", stageClass)}>
                      {stageLabel(candidate.current_stage) || "-"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
                    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", caf.tone)}>
                      {caf.expired ? <AlertTriangle className="h-3 w-3" /> : null}
                      {caf.label}
                    </span>
                    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", assessment.tone)}>
                      {assessment.expired ? <AlertTriangle className="h-3 w-3" /> : null}
                      {assessment.label}
                    </span>
                    {screening ? (
                      <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", screening.tone)}>
                        <CheckCircle2 className="h-3 w-3" />
                        {screening.label}
                      </span>
                    ) : null}
                    {l1Count > 0 ? (
                      <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", l1Feedback ? chipTone("green") : chipTone("amber"))}>
                        L1 {l1Feedback ? "done" : "pending"}
                      </span>
                    ) : null}
                    {l2Count > 0 ? (
                      <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", l2Feedback ? chipTone("green") : chipTone("amber"))}>
                        L2 {l2Feedback ? "done" : "pending"}
                      </span>
                    ) : null}
                  </div>
                  <div className="whitespace-nowrap text-center text-sm text-slate-800">{appliedAge}d</div>
                  <div className="whitespace-nowrap text-center text-sm text-slate-800">{candidate.ageing_days}d</div>
                  <div className="whitespace-nowrap">
                    <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", chipTone(candidate.status === "rejected" || candidate.status === "declined" ? "red" : candidate.status === "hired" ? "green" : "neutral"))}>
                      {candidate.status.split("_").join(" ")}
                    </span>
                  </div>
                </>
              );

              return canNavigate ? (
                <Link
                  key={candidate.candidate_id}
                  href={`/candidates/${candidate.candidate_id}`}
                  className={rowClass}
                  onMouseEnter={() => setSelectedCandidateId(candidate.candidate_id)}
                >
                  {rowContent}
                </Link>
              ) : (
                <div
                  key={candidate.candidate_id}
                  className={rowClass}
                  onMouseEnter={() => setSelectedCandidateId(candidate.candidate_id)}
                >
                  {rowContent}
                </div>
              );
            })}

            {filtered.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-slate-500">
                {loading ? "Loading..." : "No candidates found for these filters."}
              </div>
            ) : null}
          </div>
        </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/70 p-3">
            <div className="flex min-w-max gap-3 pb-2">
              {boardBuckets.map(({ column, items, avgAge, breachCount }) => (
                <div
                  key={column.key}
                  className={clsx(
                    "w-[290px] shrink-0 rounded-2xl border p-2",
                    dragOverStage === column.key ? "border-[rgba(231,64,17,0.55)] bg-[rgba(231,64,17,0.07)]" : "border-slate-200 bg-white/80"
                  )}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverStage(column.key);
                  }}
                  onDragLeave={() => setDragOverStage((prev) => (prev === column.key ? null : prev))}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleDropToStage(column.key);
                  }}
                >
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900">{column.label}</p>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">{items.length}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
                      <span>Avg age: {avgAge}d</span>
                      <span className={clsx("font-semibold", breachCount > 0 ? "text-rose-700" : "text-emerald-700")}>
                        SLA breach: {breachCount}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 space-y-2">
                    {items.map((candidate) => {
                      const selected = selectedCandidateIds.has(candidate.candidate_id);
                      const assessment = assessmentChip(candidate);
                      const canMoveText = (() => {
                        const check = canTransitionCandidate(candidate, column.key);
                        return check.ok ? null : check.reason;
                      })();
                      return (
                        <div
                          key={candidate.candidate_id}
                          draggable
                          onDragStart={() => setDragCandidateId(candidate.candidate_id)}
                          onDragEnd={() => {
                            setDragCandidateId(null);
                            setDragOverStage(null);
                          }}
                          className={clsx(
                            "cursor-grab rounded-xl border p-2.5 shadow-sm transition active:cursor-grabbing",
                            selected ? "border-amber-300 bg-amber-50/80" : "border-slate-200 bg-white hover:bg-slate-50"
                          )}
                          onClick={() => {
                            setSelectedCandidateId(candidate.candidate_id);
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{candidate.name}</p>
                              <p className="text-[11px] text-slate-600">{candidate.candidate_code}</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleCandidateSelection(candidate.candidate_id)}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--brand-color)] focus:ring-[var(--brand-color)]"
                              title="Select for bulk action"
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", cafChip(candidate).tone)}>
                              {cafChip(candidate).label}
                            </span>
                            <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", assessment.tone)}>
                              {assessment.label}
                            </span>
                            <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", chipTone((candidate.ageing_days || 0) > (STAGE_SLA_DAYS[column.key] || 3) ? "red" : "green"))}>
                              Age {candidate.ageing_days || 0}d
                            </span>
                          </div>
                          {canMoveText ? <p className="mt-2 text-[11px] text-amber-700">{canMoveText}</p> : null}
                          <p className="mt-2 text-[11px] text-slate-600">{nextBestAction(candidate)}</p>
                          {canNavigate ? (
                            <Link
                              href={`/candidates/${candidate.candidate_id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 underline underline-offset-2"
                            >
                              Open 360
                            </Link>
                          ) : null}
                        </div>
                      );
                    })}
                    {items.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-2.5 py-4 text-center text-[11px] text-slate-500">
                        Drop candidate here
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <aside className="space-y-3 xl:sticky xl:top-3">
          <div className="rounded-2xl border border-slate-200 bg-white/75 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Quick preview</p>
              {selectedCandidate && canNavigate ? (
                <Link
                  href={`/candidates/${selectedCandidate.candidate_id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Open 360
                </Link>
              ) : null}
            </div>
            {selectedCandidate ? (
              <>
                <p className="mt-2 text-sm font-semibold text-slate-900">{selectedCandidate.name}</p>
                <p className="text-[11px] text-slate-600">{selectedCandidate.candidate_code} · {stageLabel(selectedCandidate.current_stage)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", cafChip(selectedCandidate).tone)}>
                    {cafChip(selectedCandidate).label}
                  </span>
                  <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", assessmentChip(selectedCandidate).tone)}>
                    {assessmentChip(selectedCandidate).label}
                  </span>
                </div>
                <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5">
                  <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px]">
                    <p className="text-slate-500">Applying for</p>
                    <p className="truncate text-right font-medium text-slate-800" title={cleanText(selectedCandidate.opening_title)}>
                      {cleanText(selectedCandidate.opening_title)}
                    </p>
                    <p className="text-slate-500">Applied age</p>
                    <p className="text-right font-medium text-slate-800">{selectedCandidate.applied_ageing_days || 0}d</p>
                    <p className="text-slate-500">Stage age</p>
                    <p className="text-right font-medium text-slate-800">{selectedCandidate.ageing_days || 0}d</p>
                    <p className="text-slate-500">Status</p>
                    <p className="text-right font-medium capitalize text-slate-800">{selectedCandidate.status.split("_").join(" ")}</p>
                  </div>
                </div>
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/80 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-900">Next best action</p>
                  <p className="mt-1 text-[11px] text-amber-900">{nextBestAction(selectedCandidate)}</p>
                </div>
                {canViewBasicDetails ? (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Candidate basic details</p>
                    <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px]">
                      <p className="text-slate-500">Full name</p>
                      <p className="truncate text-right text-slate-800" title={cleanText(`${selectedCandidate.first_name || ""} ${selectedCandidate.last_name || ""}`.trim() || selectedCandidate.name)}>
                        {cleanText(`${selectedCandidate.first_name || ""} ${selectedCandidate.last_name || ""}`.trim() || selectedCandidate.name)}
                      </p>
                      <p className="text-slate-500">Email</p>
                      <p className="truncate text-right text-slate-800" title={cleanText(selectedCandidate.email)}>{cleanText(selectedCandidate.email)}</p>
                      <p className="text-slate-500">Contact</p>
                      <p className="truncate text-right text-slate-800" title={cleanText(selectedCandidate.phone)}>{cleanText(selectedCandidate.phone)}</p>
                      <p className="text-slate-500">Education</p>
                      <p className="truncate text-right text-slate-800" title={cleanText(selectedCandidate.educational_qualification)}>
                        {cleanText(selectedCandidate.educational_qualification)}
                      </p>
                      <p className="text-slate-500">Experience</p>
                      <p className="text-right text-slate-800">
                        {selectedCandidate.years_of_experience == null ? "-" : `${selectedCandidate.years_of_experience} years`}
                      </p>
                      <p className="text-slate-500">City</p>
                      <p className="truncate text-right text-slate-800" title={cleanText(selectedCandidate.city)}>{cleanText(selectedCandidate.city)}</p>
                      <p className="text-slate-500">Relocate</p>
                      <p className="text-right text-slate-800">{yesNoUnknown(selectedCandidate.willing_to_relocate)}</p>
                      <p className="text-slate-500">Terms</p>
                      <p className="text-right text-slate-800">{yesNoUnknown(selectedCandidate.terms_consent)}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                      {selectedCandidate.portfolio_url ? (
                        <Link
                          href={documentPreviewHref(selectedCandidate.candidate_id, "portfolio")}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Portfolio
                        </Link>
                      ) : (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-400">Portfolio</span>
                      )}
                      {selectedCandidate.cv_url ? (
                        <Link
                          href={documentPreviewHref(selectedCandidate.candidate_id, "cv")}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          CV
                        </Link>
                      ) : (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-400">CV</span>
                      )}
                      {selectedCandidate.resume_url ? (
                        <Link
                          href={documentPreviewHref(selectedCandidate.candidate_id, "resume")}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Resume
                        </Link>
                      ) : (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-400">Resume</span>
                      )}
                    </div>
                  </div>
                ) : null}
                {!canViewBasicDetails ? (
                  <p className="mt-2 text-[11px] text-slate-500">Basic candidate details are not available in this view.</p>
                ) : null}
                <div className="mt-2">
                  <p className="truncate text-[11px] text-slate-500">{sourceLabel(selectedCandidate) || "Source not available"}</p>
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-600">Select a row to preview candidate details.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/75 p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Stage distribution</p>
            <div className="mt-2 space-y-1.5">
              {stageDistribution.length === 0 ? (
                <p className="text-xs text-slate-500">No stage data for current filters.</p>
              ) : (
                stageDistribution.map((item) => (
                  <div key={item.key} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="truncate text-xs font-semibold text-slate-700">{item.label}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{item.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-amber-800">Attention queue</p>
            <div className="mt-2 space-y-1.5">
              {attentionQueue.length === 0 ? (
                <p className="text-xs text-amber-700">No urgent candidates in this view.</p>
              ) : (
                attentionQueue.map((candidate) => (
                  <div key={candidate.candidate_id} className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5">
                    <p className="truncate text-xs font-semibold text-slate-800">{candidate.name}</p>
                    <p className="text-[11px] text-slate-600">{stageLabel(candidate.current_stage)} · {candidate.ageing_days}d</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
