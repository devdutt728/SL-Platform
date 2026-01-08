"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CandidateFull, CandidateOffer, CandidateStage, CandidateSprint, Interview, PlatformPersonSuggestion, Screening, SprintTemplate } from "@/lib/types";
import { clsx } from "clsx";
import { CheckCircle2, Copy, ExternalLink, FileText, Layers, Mail, Phone, XCircle } from "lucide-react";
import { DeleteCandidateButton } from "./DeleteCandidateButton";
import { parseDateUtc } from "@/lib/datetime";

type Props = {
  candidateId: string;
  initial: CandidateFull;
  canDelete: boolean;
  canSchedule: boolean;
  canSkip: boolean;
  canCancelInterview: boolean;
};

type SlotPreview = {
  slot_start_at: string;
  slot_end_at: string;
  label: string;
};

const stageOrder = [
  { key: "enquiry", label: "Enquiry" },
  { key: "hr_screening", label: "HR screening" },
  { key: "l2_shortlist", label: "L2 shortlist" },
  { key: "l2_interview", label: "L2 interview" },
  { key: "l2_feedback", label: "L2 feedback" },
  { key: "sprint", label: "Sprint" },
  { key: "l1_shortlist", label: "L1 shortlist" },
  { key: "l1_interview", label: "L1 interview" },
  { key: "l1_feedback", label: "L1 feedback" },
  { key: "offer", label: "Offer" },
  { key: "hired", label: "Hired" },
  { key: "rejected", label: "Rejected" },
];

function normalizeStage(raw?: string | null) {
  const s = (raw || "").trim().toLowerCase();
  if (!s) return null;
  const normalized = s.replace(/\s+/g, "_");
  if (normalized === "caf") return "hr_screening";
  if (normalized === "l2") return "l2_interview";
  if (normalized === "l1") return "l1_interview";
  return normalized;
}

function stageLabel(raw?: string | null) {
  const key = normalizeStage(raw);
  if (!key) return "?";
  return stageOrder.find((s) => s.key === key)?.label || key.split("_").join(" ");
}

function formatDateTime(raw?: string | null) {
  if (!raw) return "";
  const d = parseDateUtc(raw);
  if (!d) return "";
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-IN", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function formatDate(raw?: string | null) {
  if (!raw) return "";
  const d = parseDateUtc(raw);
  if (!d) return "";
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { month: "short", day: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
}

function formatRelativeDue(raw?: string | null) {
  if (!raw) return "No due date";
  const due = parseDateUtc(raw);
  if (!due || Number.isNaN(due.getTime())) return raw;
  const diffMs = due.getTime() - Date.now();
  const diffDays = Math.ceil(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
  if (diffMs >= 0) {
    if (diffDays <= 1) return "Due within 24h";
    return `In ${diffDays} days`;
  }
  if (diffDays <= 1) return "Overdue by <1 day";
  return `Overdue by ${diffDays} days`;
}

function chipTone(kind: "neutral" | "green" | "amber" | "red" | "blue") {
  if (kind === "green") return "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/20";
  if (kind === "amber") return "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/20";
  if (kind === "red") return "bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/20";
  if (kind === "blue") return "bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/20";
  return "bg-slate-500/10 text-slate-700 ring-1 ring-slate-500/15";
}

function screeningTone(result?: string | null) {
  const r = (result || "").trim().toLowerCase();
  if (r === "green" || r === "low") return chipTone("green");
  if (r === "amber" || r === "medium") return chipTone("amber");
  if (r === "red" || r === "high") return chipTone("red");
  return chipTone("neutral");
}

function screeningLabel(result?: string | null) {
  const r = (result || "").trim().toLowerCase();
  if (r === "green" || r === "low") return "Low";
  if (r === "amber" || r === "medium") return "Medium";
  if (r === "red" || r === "high") return "High";
  return null;
}

function docTone(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (s === "complete") return chipTone("green");
  if (s === "partial") return chipTone("amber");
  if (s === "none") return chipTone("neutral");
  return chipTone("neutral");
}

function statusTone(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (s === "rejected") return chipTone("red");
  if (s === "hired") return chipTone("green");
  if (s === "offer") return chipTone("blue");
  return chipTone("neutral");
}

function decisionTone(decision?: string | null) {
  const d = (decision || "").toLowerCase();
  if (d === "advance") return chipTone("green");
  if (d === "reject") return chipTone("red");
  if (d === "keep_warm") return chipTone("amber");
  if (d === "cancelled") return chipTone("red");
  return chipTone("neutral");
}

function findStage(stages: CandidateStage[], stageName: string) {
  const target = stageName.toLowerCase();
  return stages.find((s) => normalizeStage(s.stage_name) === target) || null;
}

function stageStateKey(stages: CandidateStage[], currentKey: string | null, stepKey: string) {
  if (!currentKey) return "future";
  if (stepKey === currentKey) return "current";
  const currentIndex = stageOrder.findIndex((s) => s.key === currentKey);
  const stepIndex = stageOrder.findIndex((s) => s.key === stepKey);
  if (currentIndex === -1 || stepIndex === -1) return "future";
  return stepIndex < currentIndex ? "done" : "future";
}

function bestEffortFromMeta(meta: Record<string, unknown>, key: string) {
  const value = meta[key];
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function fetchFull(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/full`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateFull;
}

async function fetchCafLink(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/caf-link`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { caf_token: string; caf_url: string };
}

const skipStageOptions = [
  { value: "enquiry", label: "Enquiry" },
  { value: "hr_screening", label: "HR screening" },
  { value: "l2_shortlist", label: "L2 shortlist" },
  { value: "l2_interview", label: "L2 interview" },
  { value: "l2_feedback", label: "L2 feedback" },
  { value: "sprint", label: "Sprint" },
  { value: "l1_shortlist", label: "L1 shortlist" },
  { value: "l1_interview", label: "L1 interview" },
  { value: "l1_feedback", label: "L1 feedback" },
  { value: "offer", label: "Offer" },
  { value: "hired", label: "Hired" },
  { value: "rejected", label: "Rejected" },
];

async function fetchInterviews(candidateId: string) {
  const res = await fetch(`/api/rec/interviews?candidate_id=${encodeURIComponent(candidateId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Interview[];
}

async function cancelInterview(interviewId: number) {
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/cancel`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
}

async function fetchCandidateSprints(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/sprints`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateSprint[];
}

async function fetchSprintTemplates() {
  const res = await fetch("/api/rec/sprint-templates", { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as SprintTemplate[];
}

async function fetchCandidateOffers(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/offers`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer[];
}

async function createOffer(candidateId: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/offers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer;
}

async function updateOffer(offerId: number, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/offers/${offerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer;
}

async function approveOffer(offerId: number) {
  const res = await fetch(`/api/rec/offers/${offerId}/approve`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer;
}

async function rejectOffer(offerId: number, reason?: string) {
  const res = await fetch(`/api/rec/offers/${offerId}/reject`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "reject", reason }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer;
}

async function sendOffer(offerId: number) {
  const res = await fetch(`/api/rec/offers/${offerId}/send`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer;
}

async function deleteOffer(offerId: number) {
  const res = await fetch(`/api/rec/offers/${encodeURIComponent(String(offerId))}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

async function convertCandidate(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/convert`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

async function assignSprint(candidateId: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/sprints`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateSprint;
}

async function createInterview(candidateId: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/interviews`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Interview;
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

async function fetchPeople(query: string) {
  const res = await fetch(`${basePath}/api/platform/people?q=${encodeURIComponent(query)}&limit=10`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as PlatformPersonSuggestion[];
}

async function fetchSlotPreview(interviewerId: string, startDate: string) {
  const url = new URL(`${basePath}/api/rec/interview-slots/preview`, window.location.origin);
  url.searchParams.set("interviewer_email", interviewerId);
  if (startDate) url.searchParams.set("start_date", startDate);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as SlotPreview[];
}

async function transition(candidateId: string, payload: { to_stage: string; decision?: string; note?: string }) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/transition`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
}

function Chip({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", className)}>{children}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/60 bg-white/35 px-3 py-2">
      <p className="text-xs uppercase tracking-tight text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function formatMoney(raw?: number | null) {
  if (raw === null || raw === undefined) return "?";
  try {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(raw);
  } catch {
    return String(raw);
  }
}

const offerTemplateOptions = [
  { code: "STD_OFFER", label: "Standard offer" },
  { code: "ARCH_L2_STD", label: "Architect L2 standard" },
  { code: "ID_JUNIOR_STD", label: "Interior junior standard" },
];

const letterOverrideFields = [
  { key: "candidate_address", label: "Candidate address" },
  { key: "unit_name", label: "Unit name" },
  { key: "reporting_to", label: "Reporting to" },
  { key: "joining_address", label: "Joining address" },
  { key: "joining_bonus_monthly", label: "Joining bonus monthly (Rs.)" },
  { key: "joining_bonus_until", label: "Joining bonus until" },
  { key: "ctc_revision_from", label: "CTC revision from" },
  { key: "ctc_revision_window", label: "CTC revision window" },
  { key: "ctc_revision_payout", label: "CTC revision payout" },
  { key: "minimum_commitment_years", label: "Minimum commitment (years)" },
  { key: "probation_notice_days", label: "Probation notice (days)" },
  { key: "signatory_name", label: "Signatory name" },
  { key: "signatory_title", label: "Signatory title" },
];

function suggestOfferTemplate(openingTitle?: string | null) {
  const title = (openingTitle || "").toLowerCase();
  if (!title) return "STD_OFFER";
  if (title.includes("architect")) return "ARCH_L2_STD";
  if (title.includes("interior") || title.includes("id ")) return "ID_JUNIOR_STD";
  return "STD_OFFER";
}

function parseMoneyString(raw: string) {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function cleanLetterOverrides(raw: Record<string, string>) {
  const cleaned: Record<string, string> = {};
  Object.entries(raw).forEach(([key, value]) => {
    const trimmed = value.trim();
    if (trimmed) cleaned[key] = trimmed;
  });
  return cleaned;
}

export function Candidate360Client({ candidateId, initial, canDelete, canSchedule, canSkip, canCancelInterview }: Props) {
  const [data, setData] = useState<CandidateFull>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cafLink, setCafLink] = useState<{ caf_token: string; caf_url: string } | null>(null);
  const [interviews, setInterviews] = useState<Interview[] | null>(null);
  const [interviewsBusy, setInterviewsBusy] = useState(false);
  const [interviewsError, setInterviewsError] = useState<string | null>(null);
  const [interviewsNotice, setInterviewsNotice] = useState<string | null>(null);
  const [expandedInterviewId, setExpandedInterviewId] = useState<number | null>(null);
  const [scheduleEmailPreviewOpen, setScheduleEmailPreviewOpen] = useState(false);
  const [scheduleEmailPreviewHtml, setScheduleEmailPreviewHtml] = useState("");
  const [scheduleEmailPreviewBusy, setScheduleEmailPreviewBusy] = useState(false);
  const [scheduleEmailPreviewError, setScheduleEmailPreviewError] = useState<string | null>(null);
  const [candidateSprints, setCandidateSprints] = useState<CandidateSprint[] | null>(null);
  const [sprintsBusy, setSprintsBusy] = useState(false);
  const [sprintsError, setSprintsError] = useState<string | null>(null);
  const [candidateOffers, setCandidateOffers] = useState<CandidateOffer[] | null>(null);
  const [offersBusy, setOffersBusy] = useState(false);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [offerTemplateCode, setOfferTemplateCode] = useState("STD_OFFER");
  const [offerDesignation, setOfferDesignation] = useState("");
  const [offerCurrency, setOfferCurrency] = useState("INR");
  const [offerGross, setOfferGross] = useState("");
  const [offerFixed, setOfferFixed] = useState("");
  const [offerVariable, setOfferVariable] = useState("");
  const [offerJoiningDate, setOfferJoiningDate] = useState("");
  const [offerProbationMonths, setOfferProbationMonths] = useState("3");
  const [offerGradeId, setOfferGradeId] = useState("");
  const [offerNotes, setOfferNotes] = useState("");
  function isCancelled(item: Interview) {
    if ((item.decision || "").toLowerCase() === "cancelled") return true;
    const note = (item.notes_internal || "").toLowerCase();
    return note.includes("cancelled by superadmin");
  }

  const scheduleAllowed = useMemo(() => {
    if (!canSchedule) return false;
    if (canSkip) return true;
    if (!interviews) return false;
    return interviews.length === 0;
  }, [canSchedule, canSkip, interviews]);
  const [offerLetterOverrides, setOfferLetterOverrides] = useState<Record<string, string>>({});
  const [draftLetterOverrides, setDraftLetterOverrides] = useState<Record<string, string>>({});
  const [draftOverridesOpen, setDraftOverridesOpen] = useState(false);
  const [offerPreviewOpen, setOfferPreviewOpen] = useState(false);
  const [offerPreviewHtml, setOfferPreviewHtml] = useState("");
  const [offerPreviewTitle, setOfferPreviewTitle] = useState("");
  const [offerPreviewBusy, setOfferPreviewBusy] = useState(false);
  const [offerPreviewError, setOfferPreviewError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [sprintTemplates, setSprintTemplates] = useState<SprintTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleRound, setScheduleRound] = useState("L2");
  const [skipStage, setSkipStage] = useState("");
  const [scheduleStartAt, setScheduleStartAt] = useState("");
  const [scheduleEndAt, setScheduleEndAt] = useState("");
  const [scheduleLocation, setScheduleLocation] = useState("");
  const [scheduleMeetLink, setScheduleMeetLink] = useState("");
  const [scheduleInterviewer, setScheduleInterviewer] = useState<PlatformPersonSuggestion | null>(null);
  const [slotInviteBusy, setSlotInviteBusy] = useState(false);
  const [personQuery, setPersonQuery] = useState("");
  const [personResults, setPersonResults] = useState<PlatformPersonSuggestion[]>([]);
  const [personBusy, setPersonBusy] = useState(false);
  const [personOpen, setPersonOpen] = useState(false);
  const [personHighlight, setPersonHighlight] = useState(0);
  const [slotPreviewDate, setSlotPreviewDate] = useState("");
  const [slotPreviewSlots, setSlotPreviewSlots] = useState<SlotPreview[]>([]);
  const [slotPreviewBusy, setSlotPreviewBusy] = useState(false);
  const [slotPreviewError, setSlotPreviewError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotPreview | null>(null);
  const schedulePanelRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const screeningRef = useRef<HTMLDivElement | null>(null);
  const documentsRef = useRef<HTMLDivElement | null>(null);
  const interviewsRef = useRef<HTMLDivElement | null>(null);
  const sprintRef = useRef<HTMLDivElement | null>(null);
  const offerRef = useRef<HTMLDivElement | null>(null);
  const [collapsedSections, setCollapsedSections] = useState({
    overview: false,
    timeline: true,
    screening: true,
    documents: true,
    interviews: true,
    sprint: true,
    offer: true,
  });

  const candidate = data.candidate;
  const candidateInitials = useMemo(() => {
    const parts = (candidate.name || "").trim().split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || "";
    const second = parts.length > 1 ? parts[1]?.[0] || "" : "";
    return (first + second).toUpperCase() || "C";
  }, [candidate.name]);
  const currentStageKey = normalizeStage(candidate.current_stage);

  useEffect(() => {
    if (candidate.opening_title && !offerDesignation) {
      setOfferDesignation(candidate.opening_title);
    }
    if (offerTemplateCode === "STD_OFFER") {
      const suggestion = suggestOfferTemplate(candidate.opening_title);
      setOfferTemplateCode(suggestion);
    }
  }, [candidate.opening_title]);

  const cafState = useMemo(() => {
    const generated = !!candidate.caf_sent_at || !!cafLink?.caf_token;
    const submitted = !!candidate.caf_submitted_at;
    if (submitted) return { label: "CAF submitted", tone: chipTone("green") };
    if (generated) return { label: "CAF pending", tone: chipTone("amber") };
    return { label: "CAF not sent", tone: chipTone("neutral") };
  }, [candidate.caf_sent_at, candidate.caf_submitted_at, cafLink?.caf_token]);

  const needsReviewChip = useMemo(() => {
    if (!candidate.needs_hr_review) return null;
    return <Chip className={chipTone("amber")}>Needs HR review</Chip>;
  }, [candidate.needs_hr_review]);

  async function refreshAll() {
    const full = await fetchFull(candidateId);
    setData(full);
    try {
      const link = await fetchCafLink(candidateId);
      setCafLink(link);
    } catch {
      // ignore
    }
  }

  async function initCafLinkIfNeeded() {
    if (cafLink || candidate.caf_sent_at) return;
    try {
      const link = await fetchCafLink(candidateId);
      setCafLink(link);
    } catch {
      // ignore
    }
  }

  async function handleCopyCafLink() {
    setError(null);
    try {
      const link = cafLink || (await fetchCafLink(candidateId));
      setCafLink(link);
      if (!link) {
        setError("CAF link is not available for this candidate yet.");
        return;
      }
      const absolute = `${window.location.origin}${link.caf_url}`;
      await navigator.clipboard.writeText(absolute);
      setError("CAF link copied.");
      window.setTimeout(() => setError(null), 1200);
    } catch (e: any) {
      setError(e?.message || "Could not copy CAF link");
    }
  }

  async function handleTransition(toStage: string, decision: string) {
    setBusy(true);
    setError(null);
    try {
      await transition(candidateId, { to_stage: toStage, decision, note: `UI: ${decision}` });
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Transition failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSkip() {
    if (!skipStage) return;
    setBusy(true);
    setError(null);
    try {
      await transition(candidateId, { to_stage: skipStage, decision: "skip", note: "superadmin_skip" });
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Skip failed");
    } finally {
      setBusy(false);
    }
  }

  async function refreshInterviews() {
    setInterviewsBusy(true);
    setInterviewsError(null);
    try {
      const list = await fetchInterviews(candidateId);
      setInterviews(list);
    } catch (e: any) {
      setInterviewsError(e?.message || "Could not load interviews.");
    } finally {
      setInterviewsBusy(false);
    }
  }

  async function refreshSprints() {
    setSprintsBusy(true);
    setSprintsError(null);
    try {
      const list = await fetchCandidateSprints(candidateId);
      setCandidateSprints(list);
    } catch (e: any) {
      setSprintsError(e?.message || "Could not load sprints.");
    } finally {
      setSprintsBusy(false);
    }
  }

  async function refreshOffers() {
    setOffersBusy(true);
    setOffersError(null);
    try {
      const list = await fetchCandidateOffers(candidateId);
      setCandidateOffers(list);
    } catch (e: any) {
      setOffersError(e?.message || "Could not load offers.");
    } finally {
      setOffersBusy(false);
    }
  }

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
  }, [candidateId]);

  function toggleSection(key: keyof typeof collapsedSections) {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setAllSections(collapsed: boolean) {
    setCollapsedSections({
      overview: false,
      timeline: collapsed,
      screening: collapsed,
      documents: collapsed,
      interviews: collapsed,
      sprint: collapsed,
      offer: collapsed,
    });
  }

  function focusSection(key: keyof typeof collapsedSections, ref: React.RefObject<HTMLDivElement>) {
    setCollapsedSections((prev) => ({ ...prev, [key]: false }));
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function openAssignSprint() {
    setAssignOpen(true);
    setSprintsError(null);
    setSelectedTemplateId("");
    setDueAt("");
    if (sprintTemplates.length === 0) {
      try {
        const templates = await fetchSprintTemplates();
        setSprintTemplates(templates);
      } catch (e: any) {
        setSprintsError(e?.message || "Could not load templates.");
      }
    }
  }

  function handleTemplateSelect(value: string) {
    setSelectedTemplateId(value);
    const chosen = sprintTemplates.find((t) => String(t.sprint_template_id) === value);
    if (chosen?.expected_duration_days) {
      const target = new Date(Date.now() + chosen.expected_duration_days * 24 * 60 * 60 * 1000);
      const iso = new Date(target.getTime() - target.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setDueAt(iso);
    }
  }

  async function handleAssignSprint() {
    if (!selectedTemplateId) {
      setSprintsError("Select a sprint template.");
      return;
    }
    setSprintsBusy(true);
    setSprintsError(null);
    try {
      await assignSprint(candidateId, {
        sprint_template_id: Number(selectedTemplateId),
        due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      setAssignOpen(false);
      await refreshAll();
      await refreshSprints();
    } catch (e: any) {
      setSprintsError(e?.message || "Sprint assignment failed.");
    } finally {
      setSprintsBusy(false);
    }
  }

  async function handleCreateOffer() {
    setOffersError(null);
    if (!offerTemplateCode.trim()) {
      setOffersError("Select an offer template.");
      return;
    }
    setOffersBusy(true);
    try {
      const overrides = cleanLetterOverrides(offerLetterOverrides);
      await createOffer(candidateId, {
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
      await refreshOffers();
    } catch (e: any) {
      setOffersError(e?.message || "Offer creation failed.");
    } finally {
      setOffersBusy(false);
    }
  }

  async function handleOfferPreview(offerId: number, kind: "letter" | "email") {
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
  }

  async function handleSubmitOffer(offerId: number) {
    setOffersBusy(true);
    setOffersError(null);
    try {
      await updateOffer(offerId, { submit_for_approval: true });
      await refreshOffers();
    } catch (e: any) {
      setOffersError(e?.message || "Offer submission failed.");
    } finally {
      setOffersBusy(false);
    }
  }

  async function handleApproveOffer(offerId: number) {
    setOffersBusy(true);
    setOffersError(null);
    try {
      await approveOffer(offerId);
      await refreshOffers();
    } catch (e: any) {
      setOffersError(e?.message || "Offer approval failed.");
    } finally {
      setOffersBusy(false);
    }
  }

  async function handleRejectOffer(offerId: number) {
    setOffersBusy(true);
    setOffersError(null);
    try {
      await rejectOffer(offerId);
      await refreshOffers();
    } catch (e: any) {
      setOffersError(e?.message || "Offer rejection failed.");
    } finally {
      setOffersBusy(false);
    }
  }

  async function handleSendOffer(offerId: number) {
    setOffersBusy(true);
    setOffersError(null);
    try {
      await sendOffer(offerId);
      await refreshOffers();
    } catch (e: any) {
      setOffersError(e?.message || "Offer send failed.");
    } finally {
      setOffersBusy(false);
    }
  }

  async function handleSaveDraftOverrides(offerId: number) {
    setOffersBusy(true);
    setOffersError(null);
    try {
      const overrides = cleanLetterOverrides(draftLetterOverrides);
      await updateOffer(offerId, { letter_overrides: overrides });
      await refreshOffers();
    } catch (e: any) {
      setOffersError(e?.message || "Offer update failed.");
    } finally {
      setOffersBusy(false);
    }
  }

  async function handleDeleteOffer(offerId: number) {
    if (!confirm("Delete this draft offer? This cannot be undone.")) return;
    setOffersBusy(true);
    setOffersError(null);
    try {
      await deleteOffer(offerId);
      await refreshOffers();
    } catch (e: any) {
      setOffersError(e?.message || "Offer deletion failed.");
    } finally {
      setOffersBusy(false);
    }
  }

  async function handleConvertCandidate() {
    setOffersBusy(true);
    setOffersError(null);
    try {
      await convertCandidate(candidateId);
      await refreshAll();
    } catch (e: any) {
      setOffersError(e?.message || "Conversion failed.");
    } finally {
      setOffersBusy(false);
    }
  }

  function openSchedule(roundType: string) {
    setScheduleRound(roundType);
    setScheduleStartAt("");
    setScheduleEndAt("");
    setScheduleLocation("");
    setScheduleMeetLink("");
    setScheduleInterviewer(null);
    setPersonQuery("");
    setPersonResults([]);
    setSlotPreviewDate("");
    setSlotPreviewSlots([]);
    setSlotPreviewError(null);
    setSelectedSlot(null);
    setScheduleEmailPreviewError(null);
    setScheduleOpen(true);
    setInterviewsError(null);
    setInterviewsNotice(null);
  }

  async function handleScheduleSubmit() {
    setInterviewsError(null);
    setInterviewsNotice(null);
    if (!scheduleInterviewer) {
      setInterviewsError("Select an interviewer.");
      return;
    }
    const startIso = selectedSlot ? `${selectedSlot.slot_start_at}Z` : `${scheduleStartAt}:00+05:30`;
    const endIso = selectedSlot ? `${selectedSlot.slot_end_at}Z` : `${scheduleEndAt}:00+05:30`;
    if (!selectedSlot && (!scheduleStartAt || !scheduleEndAt)) {
      setInterviewsError("Provide a slot or both start and end time.");
      return;
    }
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
      setInterviewsError("End time must be after start time.");
      return;
    }
    setInterviewsBusy(true);
    try {
      await createInterview(candidateId, {
        round_type: scheduleRound,
        interviewer_person_id_platform: scheduleInterviewer.person_id,
        scheduled_start_at: startIso,
        scheduled_end_at: endIso,
        location: scheduleLocation || undefined,
        meeting_link: scheduleMeetLink || undefined,
      });
      setScheduleOpen(false);
      setSelectedSlot(null);
      await refreshInterviews();
    } catch (e: any) {
      setInterviewsError(e?.message || "Could not schedule interview.");
    } finally {
      setInterviewsBusy(false);
    }
  }

  async function handleScheduleEmailPreview() {
    setScheduleEmailPreviewError(null);
    const roundUpper = scheduleRound.toUpperCase();
    const isSlotInvite = roundUpper === "L1" || roundUpper === "L2";
    setScheduleEmailPreviewBusy(true);
    try {
      if (isSlotInvite) {
        if (!scheduleInterviewer?.email) {
          setScheduleEmailPreviewError("Select an interviewer to preview the slot email.");
          return;
        }
        const startDate =
          slotPreviewDate ||
          (scheduleStartAt ? scheduleStartAt.split("T")[0] : "");
        if (!startDate) {
          setScheduleEmailPreviewError("Select a first day to preview the slot email.");
          return;
        }
        const url = new URL(`${basePath}/api/rec/interview-slots/email-preview`, window.location.origin);
        url.searchParams.set("candidate_id", candidateId);
        url.searchParams.set("round_type", scheduleRound);
        url.searchParams.set("interviewer_email", scheduleInterviewer.email);
        url.searchParams.set("start_date", startDate);
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const html = await res.text();
        setScheduleEmailPreviewHtml(html);
        setScheduleEmailPreviewOpen(true);
        return;
      }

      const fallbackSlot = slotPreviewSlots[0] || null;
      const startIso = selectedSlot
        ? `${selectedSlot.slot_start_at}Z`
        : fallbackSlot
          ? `${fallbackSlot.slot_start_at}Z`
          : `${scheduleStartAt}:00+05:30`;
      if (!selectedSlot && !fallbackSlot && !scheduleStartAt) {
        setScheduleEmailPreviewError("Pick a slot or start time to preview the email.");
        return;
      }
      const url = new URL(`${basePath}/api/rec/interviews/email-preview`, window.location.origin);
      url.searchParams.set("candidate_id", candidateId);
      url.searchParams.set("round_type", scheduleRound);
      url.searchParams.set("scheduled_start_at", startIso);
      if (scheduleMeetLink) url.searchParams.set("meeting_link", scheduleMeetLink);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const html = await res.text();
      setScheduleEmailPreviewHtml(html);
      setScheduleEmailPreviewOpen(true);
    } catch (e: any) {
      setScheduleEmailPreviewError(e?.message || "Email preview failed.");
    } finally {
      setScheduleEmailPreviewBusy(false);
    }
  }

  async function handleSendSlotInvite() {
    setInterviewsError(null);
    setInterviewsNotice(null);
    if (!scheduleInterviewer) {
      setInterviewsError("Select an interviewer.");
      return;
    }
    if (!scheduleInterviewer.email) {
      setInterviewsError("Interviewer email is required for slot invites.");
      return;
    }
    const roundUpper = scheduleRound.toUpperCase();
    if (roundUpper !== "L1" && roundUpper !== "L2") {
      setInterviewsError("Slot invites are supported only for L1/L2 rounds.");
      return;
    }
    setSlotInviteBusy(true);
    try {
      const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/interview-slots/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          round_type: roundUpper,
          interviewer_email: scheduleInterviewer.email,
          interviewer_person_id_platform: scheduleInterviewer.person_id,
          start_date: slotPreviewDate || undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setInterviewsNotice("Slot invite email sent to the candidate.");
    } catch (e: any) {
      setInterviewsError(e?.message || "Could not send slot invite.");
    } finally {
      setSlotInviteBusy(false);
    }
  }

  useEffect(() => {
    if (interviews === null) {
      void refreshInterviews();
    }
  }, [interviews]);

  useEffect(() => {
    if (candidateSprints === null) {
      void refreshSprints();
    }
  }, [candidateSprints]);

  useEffect(() => {
    if (candidateOffers === null) {
      void refreshOffers();
    }
  }, [candidateOffers]);

  useEffect(() => {
    if (!scheduleOpen) return;
    const query = personQuery.trim();
    let ignore = false;
    const handle = window.setTimeout(() => {
      if (query.length < 2) {
        setPersonResults([]);
        setPersonBusy(false);
        return;
      }
      setPersonBusy(true);
      fetchPeople(query)
        .then((rows) => {
          if (!ignore) {
            setPersonResults(rows);
            setPersonHighlight(0);
          }
        })
        .catch(() => {
          if (!ignore) setPersonResults([]);
        })
        .finally(() => {
          if (!ignore) setPersonBusy(false);
        });
    }, 250);
    return () => {
      ignore = true;
      window.clearTimeout(handle);
    };
  }, [personQuery, scheduleOpen]);

  useEffect(() => {
    if (!scheduleOpen) return;
    const roundUpper = scheduleRound.toUpperCase();
    if (roundUpper !== "L1" && roundUpper !== "L2") return;
    if (!scheduleInterviewer || !slotPreviewDate) {
      setSlotPreviewSlots([]);
      setSelectedSlot(null);
      return;
    }
    let ignore = false;
    const handle = window.setTimeout(() => {
      setSlotPreviewBusy(true);
      setSlotPreviewError(null);
      if (!scheduleInterviewer.email) {
        setSlotPreviewError("Interviewer email is required for slot lookup.");
        setSlotPreviewBusy(false);
        return;
      }
      fetchSlotPreview(scheduleInterviewer.email, slotPreviewDate)
        .then((slots) => {
          if (!ignore) {
            setSlotPreviewSlots(slots);
            if (slots.length === 0) setSelectedSlot(null);
          }
        })
        .catch((e: any) => {
          if (!ignore) {
            setSlotPreviewSlots([]);
            setSlotPreviewError(e?.message || "Could not fetch slots.");
          }
        })
        .finally(() => {
          if (!ignore) setSlotPreviewBusy(false);
        });
    }, 250);
    return () => {
      ignore = true;
      window.clearTimeout(handle);
    };
  }, [scheduleInterviewer, scheduleOpen, scheduleRound, slotPreviewDate]);

  useEffect(() => {
    if (!scheduleOpen) return;
    const node = schedulePanelRef.current;
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scheduleOpen]);

  useEffect(() => {
    setSelectedSlot(null);
  }, [scheduleRound]);

  const stageButtons = useMemo(() => {
    const current = currentStageKey;
    if (current === "hr_screening") {
      return [
        {
          label: "Advance to L2 shortlist",
          tone: "bg-emerald-600 hover:bg-emerald-700",
          icon: <CheckCircle2 className="h-4 w-4" />,
          action: () => handleTransition("l2_shortlist", "advance"),
        },
        {
          label: "Reject after HR screening",
          tone: "bg-rose-600 hover:bg-rose-700",
          icon: <XCircle className="h-4 w-4" />,
          action: () => handleTransition("rejected", "reject"),
        },
        {
          label: "Review screening",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <Layers className="h-4 w-4" />,
          action: () => focusSection("screening", screeningRef),
        },
      ];
    }
    if (current === "enquiry") {
      return [
        {
          label: "Move to HR screening",
          tone: "bg-emerald-600 hover:bg-emerald-700",
          icon: <CheckCircle2 className="h-4 w-4" />,
          action: () => handleTransition("hr_screening", "advance"),
        },
        {
          label: "Reject",
          tone: "bg-rose-600 hover:bg-rose-700",
          icon: <XCircle className="h-4 w-4" />,
          action: () => handleTransition("rejected", "reject"),
        },
      ];
    }
    if (current === "l2_shortlist") {
      const actions = [];
      actions.push({
        label: "Advance to L2 interview",
        tone: "bg-emerald-600 hover:bg-emerald-700",
        icon: <CheckCircle2 className="h-4 w-4" />,
        action: () => handleTransition("l2_interview", "advance"),
      });
      if (canSchedule) {
        actions.push({
          label: "Schedule L2 interview",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <CheckCircle2 className="h-4 w-4" />,
          action: () => {
            void (async () => {
              await handleTransition("l2_interview", "advance");
              focusSection("interviews", interviewsRef);
              openSchedule("L2");
            })();
          },
        });
      }
      actions.push({
        label: "Go to interviews",
        tone: "bg-slate-900 hover:bg-slate-800",
        icon: <Layers className="h-4 w-4" />,
        action: () => focusSection("interviews", interviewsRef),
      });
      return actions;
    }
    if (current === "l2_interview") {
      const actions = [];
      if (canSchedule) {
        actions.push({
          label: "Schedule L2 interview",
          tone: "bg-emerald-600 hover:bg-emerald-700",
          icon: <CheckCircle2 className="h-4 w-4" />,
          action: () => {
            focusSection("interviews", interviewsRef);
            openSchedule("L2");
          },
        });
      }
      actions.push({
        label: "Go to interviews",
        tone: "bg-slate-900 hover:bg-slate-800",
        icon: <Layers className="h-4 w-4" />,
        action: () => focusSection("interviews", interviewsRef),
      });
      return actions;
    }
    if (current === "l2_feedback") {
      return [
        {
          label: "Advance to sprint",
          tone: "bg-emerald-600 hover:bg-emerald-700",
          icon: <CheckCircle2 className="h-4 w-4" />,
          action: () => handleTransition("sprint", "advance"),
        },
        {
          label: "Reject after L2 feedback",
          tone: "bg-rose-600 hover:bg-rose-700",
          icon: <XCircle className="h-4 w-4" />,
          action: () => handleTransition("rejected", "reject"),
        },
        {
          label: "Go to interviews",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <Layers className="h-4 w-4" />,
          action: () => focusSection("interviews", interviewsRef),
        },
      ];
    }
    if (current === "l1_interview") {
      const actions = [];
      if (canSchedule) {
        actions.push({
          label: "Schedule L1 interview",
          tone: "bg-emerald-600 hover:bg-emerald-700",
          icon: <CheckCircle2 className="h-4 w-4" />,
          action: () => {
            focusSection("interviews", interviewsRef);
            openSchedule("L1");
          },
        });
      }
      actions.push({
        label: "Go to interviews",
        tone: "bg-slate-900 hover:bg-slate-800",
        icon: <Layers className="h-4 w-4" />,
        action: () => focusSection("interviews", interviewsRef),
      });
      return actions;
    }
    if (current === "l1_shortlist") {
      const actions = [];
      actions.push({
        label: "Advance to L1 interview",
        tone: "bg-emerald-600 hover:bg-emerald-700",
        icon: <CheckCircle2 className="h-4 w-4" />,
        action: () => handleTransition("l1_interview", "advance"),
      });
      if (canSchedule) {
        actions.push({
          label: "Schedule L1 interview",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <CheckCircle2 className="h-4 w-4" />,
          action: () => {
            void (async () => {
              await handleTransition("l1_interview", "advance");
              focusSection("interviews", interviewsRef);
              openSchedule("L1");
            })();
          },
        });
      }
      actions.push({
        label: "Go to interviews",
        tone: "bg-slate-900 hover:bg-slate-800",
        icon: <Layers className="h-4 w-4" />,
        action: () => focusSection("interviews", interviewsRef),
      });
      return actions;
    }
    if (current === "l1_feedback") {
      return [
        {
          label: "Advance to offer",
          tone: "bg-emerald-600 hover:bg-emerald-700",
          icon: <CheckCircle2 className="h-4 w-4" />,
          action: () => handleTransition("offer", "advance"),
        },
        {
          label: "Reject after L1 feedback",
          tone: "bg-rose-600 hover:bg-rose-700",
          icon: <XCircle className="h-4 w-4" />,
          action: () => handleTransition("rejected", "reject"),
        },
        {
          label: "Go to interviews",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <Layers className="h-4 w-4" />,
          action: () => focusSection("interviews", interviewsRef),
        },
      ];
    }
    if (current === "sprint") {
      return [
        {
          label: "Assign sprint",
          tone: "bg-emerald-600 hover:bg-emerald-700",
          icon: <CheckCircle2 className="h-4 w-4" />,
          action: () => {
            focusSection("sprint", sprintRef);
            void openAssignSprint();
          },
        },
        {
          label: "Go to sprint",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <Layers className="h-4 w-4" />,
          action: () => focusSection("sprint", sprintRef),
        },
      ];
    }
    if (current === "offer") {
      return [
        {
          label: "Go to offer",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <Layers className="h-4 w-4" />,
          action: () => focusSection("offer", offerRef),
        },
      ];
    }
    return [];
  }, [currentStageKey, canSchedule, focusSection, openSchedule, openAssignSprint, screeningRef]);

  const screening = data.screening as Screening | null | undefined;
  const interviewUpcoming = useMemo(() => {
    if (!interviews) return [] as Interview[];
    const now = new Date();
    const getTs = (value?: string | null) => parseDateUtc(value)?.getTime() ?? 0;
    return [...interviews]
      .filter((item) => getTs(item.scheduled_start_at) >= now.getTime())
      .sort((a, b) => getTs(a.scheduled_start_at) - getTs(b.scheduled_start_at));
  }, [interviews]);

  const interviewPast = useMemo(() => {
    if (!interviews) return [] as Interview[];
    const now = new Date();
    const getTs = (value?: string | null) => parseDateUtc(value)?.getTime() ?? 0;
    return [...interviews]
      .filter((item) => isCancelled(item) || getTs(item.scheduled_start_at) < now.getTime())
      .sort((a, b) => getTs(b.scheduled_start_at) - getTs(a.scheduled_start_at));
  }, [interviews]);
  const latestOffer = candidateOffers && candidateOffers.length > 0 ? candidateOffers[0] : null;

  useEffect(() => {
    if (!latestOffer) {
      setDraftLetterOverrides({});
      setDraftOverridesOpen(false);
      return;
    }
    setDraftLetterOverrides(latestOffer.letter_overrides || {});
  }, [latestOffer?.candidate_offer_id]);

  return (
    <main className="content-pad space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-tight text-slate-500">Candidate 360</p>
          <h1 className="mt-1 text-2xl font-semibold">{candidate.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip className={statusTone(candidate.status)}>{candidate.status.split("_").join(" ")}</Chip>
            <Chip className={chipTone("blue")}>Stage: {stageLabel(candidate.current_stage)}</Chip>
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
          {candidate.drive_folder_url ? (
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
              {candidate.caf_submitted_at ? (
                <span className="text-xs text-slate-600">Submitted: {formatDateTime(candidate.caf_submitted_at)}</span>
              ) : candidate.caf_sent_at ? (
                <span className="text-xs text-slate-600">Sent: {formatDateTime(candidate.caf_sent_at)}</span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-white"
                onClick={() => void handleCopyCafLink()}
                onMouseEnter={() => void initCafLinkIfNeeded()}
                disabled={busy}
              >
                <Copy className="h-4 w-4" />
                Copy CAF link
              </button>
              <Link
                href={`/candidates/${encodeURIComponent(candidateId)}/caf`}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold",
                  "bg-teal-600 text-white hover:bg-teal-700"
                )}
              >
                <ExternalLink className="h-4 w-4" />
                View CAF
              </Link>
            </div>
          </div>

          {canDelete ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3">
              <p className="text-xs uppercase tracking-tight text-rose-700">Superadmin</p>
              <p className="mt-1 text-sm text-rose-700">Delete is available on this candidate.</p>
            </div>
          ) : null}
        </aside>

        <section className="space-y-4">
          <div ref={timelineRef} className="section-card">
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
                  onClick={() => setAllSections(false)}
                >
                  Expand all
                </button>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
                  onClick={() => setAllSections(true)}
                >
                  Collapse all
                </button>
              </div>
            </div>

            {collapsedSections.overview ? null : (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-tight text-slate-500">Stage progress</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-white/70 bg-white/40 px-4 py-3">
                    {stageOrder.map((step, idx) => {
                      const state = stageStateKey(data.stages, currentStageKey, step.key);
                      const stageRow = findStage(data.stages, step.key);
                      const tone =
                        state === "done"
                          ? "bg-emerald-500 text-white"
                          : state === "current"
                            ? "bg-violet-600 text-white"
                            : "bg-white text-slate-700 border border-slate-200";
                      return (
                        <div key={step.key} className="flex items-center gap-3">
                          <div className={clsx("flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm", tone)}>
                            <span>{step.label}</span>
                            <span className="text-[10px] opacity-80">
                              {stageRow?.started_at ? formatDate(stageRow.started_at) : ""}
                            </span>
                          </div>
                          {idx < stageOrder.length - 1 ? (
                            <div className="h-[1px] w-10 bg-gradient-to-r from-slate-200 via-slate-400 to-slate-200" />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/60 bg-white/30 p-4">
                    <p className="text-xs uppercase tracking-tight text-slate-500">Key screening values</p>
                    {screening ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <Metric label="Total exp (yrs)" value={screening.total_experience_years != null ? String(screening.total_experience_years) : "?"} />
                        <Metric label="Relevant exp (yrs)" value={screening.relevant_experience_years != null ? String(screening.relevant_experience_years) : "?"} />
                        <Metric label="Expected CTC" value={screening.expected_ctc_annual != null ? formatMoney(screening.expected_ctc_annual) : "?"} />
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
                            className={clsx("inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-card disabled:opacity-60", b.tone)}
                            onClick={() => void b.action()}
                            disabled={busy}
                          >
                            {b.icon}
                            {busy ? "Working..." : b.label}
                          </button>
                        ))}
                      </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">Use the action buttons above to jump into the next step.</p>
                )}

                    {canSkip ? (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
                        <p className="text-xs uppercase tracking-tight text-amber-700">Superadmin skip</p>
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
                            onClick={() => void handleSkip()}
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

          <div ref={screeningRef} className="section-card">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-tight text-slate-500">Event timeline</p>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
                onClick={() => toggleSection("timeline")}
              >
                {collapsedSections.timeline ? "Expand" : "Collapse"}
              </button>
            </div>

            {collapsedSections.timeline ? null : (
              <div className="mt-4 space-y-3">
                {data.events.map((ev) => {
                  const meta = ev.meta_json || {};
                  const fromStage = bestEffortFromMeta(meta, "from_stage") || bestEffortFromMeta(meta, "from_status");
                  const toStage = bestEffortFromMeta(meta, "to_stage") || bestEffortFromMeta(meta, "to_status");
                  const note = bestEffortFromMeta(meta, "note");
                  const decision = bestEffortFromMeta(meta, "decision") || bestEffortFromMeta(meta, "reason");
                  const title =
                    ev.action_type === "stage_change" && (fromStage || toStage)
                      ? `Stage: ${fromStage || "?"} ? ${toStage || "?"}`
                      : ev.action_type.split("_").join(" ");
                  return (
                    <div key={ev.event_id} className="rounded-2xl border border-white/60 bg-white/30 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{title}</p>
                          <p className="mt-1 text-xs text-slate-600">{formatDateTime(ev.created_at)}</p>
                        </div>
                        <Chip className={chipTone("neutral")}>{ev.action_type}</Chip>
                      </div>

                      {(decision || note) ? (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {decision ? <Metric label="Decision" value={decision} /> : null}
                          {note ? <Metric label="Note" value={note} /> : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {data.events.length === 0 ? <p className="text-sm text-slate-600">No events yet.</p> : null}
              </div>
            )}
          </div>

          <div ref={documentsRef} className="section-card">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-tight text-slate-500">Screening</p>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
                onClick={() => toggleSection("screening")}
              >
                {collapsedSections.screening ? "Expand" : "Collapse"}
              </button>
            </div>
            {collapsedSections.screening ? null : (
              <>
                {!screening ? (
                  <div className="mt-3 rounded-2xl border border-white/60 bg-white/30 p-6">
                    <p className="text-sm font-semibold">No screening yet</p>
                    <p className="mt-1 text-sm text-slate-600">This candidate has not submitted CAF/screening data.</p>
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-white/60 bg-white/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">CAF screening</p>
                      <Chip className={screeningTone(screening.screening_result)}>
                        {screeningLabel(screening.screening_result) || screening.screening_result || "?"}
                      </Chip>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <Metric label="Current city" value={screening.current_city ? String(screening.current_city) : "-"} />
                      <Metric label="Employer" value={screening.current_employer ? String(screening.current_employer) : "-"} />
                      <Metric label="Total exp" value={screening.total_experience_years != null ? String(screening.total_experience_years) : "-"} />
                      <Metric label="Relevant exp" value={screening.relevant_experience_years != null ? String(screening.relevant_experience_years) : "-"} />
                      <Metric label="Notice (days)" value={screening.notice_period_days != null ? String(screening.notice_period_days) : "-"} />
                      <Metric label="Current CTC" value={screening.current_ctc_annual != null ? formatMoney(screening.current_ctc_annual) : "-"} />
                      <Metric label="Expected CTC" value={screening.expected_ctc_annual != null ? formatMoney(screening.expected_ctc_annual) : "-"} />
                      <Metric label="Joining date" value={screening.expected_joining_date ? formatDate(screening.expected_joining_date) : "-"} />
                    </div>

                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                        <p className="text-xs uppercase tracking-tight text-slate-500">Relocation</p>
                        <p className="mt-1 text-sm font-semibold">
                          {screening.willing_to_relocate == null ? "?" : screening.willing_to_relocate ? "Yes" : "No"}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">{screening.relocation_notes || "?"}</p>
                      </div>
                      <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                        <p className="text-xs uppercase tracking-tight text-slate-500">Notes / questions</p>
                        {screening.reason_for_job_change ? (
                          <div className="mt-1">
                            <p className="text-xs font-semibold text-slate-700">Reason for job change</p>
                            <p className="mt-1 text-sm text-slate-700">{screening.reason_for_job_change}</p>
                          </div>
                        ) : null}
                        <p className="mt-1 text-sm text-slate-700">{screening.questions_from_candidate || "-"}</p>
                        <p className="mt-2 text-xs text-slate-600">{screening.screening_notes || ""}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div ref={interviewsRef} className="section-card">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-tight text-slate-500">Documents</p>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
                onClick={() => toggleSection("documents")}
              >
                {collapsedSections.documents ? "Expand" : "Collapse"}
              </button>
            </div>
            {collapsedSections.documents ? null : (
              <div className="mt-3 rounded-2xl border border-white/60 bg-white/30 p-4">
                <p className="text-sm font-semibold">Document status</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip className={docTone(candidate.application_docs_status)}>
                    <FileText className="h-3.5 w-3.5" /> Application: {candidate.application_docs_status}
                  </Chip>
                  <Chip className={docTone(candidate.joining_docs_status)}>
                    <FileText className="h-3.5 w-3.5" /> Joining: {candidate.joining_docs_status}
                  </Chip>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {candidate.cv_url ? (
                    <Link
                      href={candidate.cv_url}
                      target="_blank"
                      className="inline-flex items-center gap-2 rounded-xl bg-white/70 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open CV
                    </Link>
                  ) : null}
                  {candidate.portfolio_url ? (
                    <Link
                      href={candidate.portfolio_url}
                      target="_blank"
                      className="inline-flex items-center gap-2 rounded-xl bg-white/70 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Portfolio
                    </Link>
                  ) : candidate.portfolio_not_uploaded_reason ? (
                    <span className="inline-flex items-center rounded-xl border border-white/60 bg-white/30 px-4 py-2 text-sm text-slate-700">
                      Portfolio not uploaded: {candidate.portfolio_not_uploaded_reason}
                    </span>
                  ) : null}
                  {candidate.drive_folder_url ? (
                    <Link
                      href={candidate.drive_folder_url}
                      target="_blank"
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open folder in Drive
                    </Link>
                  ) : (
                    <span className="text-sm text-slate-600">No Drive folder linked yet.</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div ref={sprintRef} className="section-card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-tight text-slate-500">Interviews</p>
              </div>
              <div className="ml-auto flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
                  onClick={() => toggleSection("interviews")}
                >
                  {collapsedSections.interviews ? "Expand" : "Collapse"}
                </button>
              </div>
            </div>

            {collapsedSections.interviews ? null : (
              <>
                <p className="mt-2 text-sm text-slate-600">Scheduling, feedback, and outcomes in one view.</p>
                {scheduleAllowed ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      onClick={() => {
                        if (currentStageKey === "l2_shortlist") {
                          void (async () => {
                            await handleTransition("l2_interview", "advance");
                            openSchedule("L2");
                          })();
                          return;
                        }
                        openSchedule("L2");
                      }}
                    >
                      Schedule L2 interview
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                      onClick={() => {
                        if (currentStageKey === "l1_shortlist") {
                          void (async () => {
                            await handleTransition("l1_interview", "advance");
                            openSchedule("L1");
                          })();
                          return;
                        }
                        openSchedule("L1");
                      }}
                    >
                      Schedule L1 interview
                    </button>
                  </div>
                ) : null}
                {!canSkip && canSchedule && interviews && interviews.length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-2 text-xs text-amber-700">
                    Only Superadmin can schedule another interview after the first one.
                  </div>
                ) : null}
                {interviewsError ? (
                  <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
                    {interviewsError}
                  </div>
                ) : null}
                {interviewsNotice ? (
                  <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
                    {interviewsNotice}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/60 bg-white/30 p-4">
                    <p className="text-sm font-semibold">Upcoming</p>
                    <div className="mt-3 space-y-2">
                      {interviewsBusy && !interviews ? (
                        <p className="text-sm text-slate-600">Loading interviews...</p>
                      ) : interviewUpcoming.length === 0 ? (
                        <p className="text-sm text-slate-600">No upcoming interviews.</p>
                      ) : (
                        interviewUpcoming.map((item) => (
                          <div key={item.candidate_interview_id} className="rounded-2xl border border-white/60 bg-white/50 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold">{item.round_type}</p>
                                <p className="text-xs text-slate-600">{item.interviewer_name || item.interviewer_person_id_platform || "Interviewer"}</p>
                              </div>
                              <Chip className={chipTone("blue")}>{formatDateTime(item.scheduled_start_at)}</Chip>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                              <span>{item.location || "Location TBD"}</span>
                              {item.meeting_link ? (
                                <a
                                  className="text-slate-800 underline decoration-dotted underline-offset-2"
                                  href={item.meeting_link}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Meeting link
                                </a>
                              ) : null}
                              {isCancelled(item) ? <Chip className={chipTone("red")}>Cancelled</Chip> : null}
                            </div>
                            {canCancelInterview && !isCancelled(item) ? (
                              <div className="mt-3">
                                <button
                                  type="button"
                                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                                  onClick={() => {
                                    if (!window.confirm("Cancel this interview? This will remove it from the interviewer calendar.")) return;
                                    void (async () => {
                                      setBusy(true);
                                      setInterviewsError(null);
                                      setInterviewsNotice(null);
                                      try {
                                        await cancelInterview(item.candidate_interview_id);
                                        const next = await fetchInterviews(candidateId);
                                        setInterviews(next);
                                        setInterviewsNotice("Interview cancelled.");
                                      } catch (e: any) {
                                        setInterviewsError(e?.message || "Could not cancel interview.");
                                      } finally {
                                        setBusy(false);
                                      }
                                    })();
                                  }}
                                  disabled={busy}
                                >
                                  Cancel interview
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/60 bg-white/30 p-4">
                    <p className="text-sm font-semibold">Past</p>
                    <div className="mt-3 space-y-2">
                      {interviewsBusy && !interviews ? (
                        <p className="text-sm text-slate-600">Loading interviews...</p>
                      ) : interviewPast.length === 0 ? (
                        <p className="text-sm text-slate-600">No completed interviews yet.</p>
                      ) : (
                        interviewPast.map((item) => (
                          <div key={item.candidate_interview_id} className="rounded-2xl border border-white/60 bg-white/50 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold">{item.round_type}</p>
                                <p className="text-xs text-slate-600">{formatDateTime(item.scheduled_start_at)}</p>
                              </div>
                              <Chip className={decisionTone(item.decision)}>
                                {item.decision === "cancelled" ? "Cancelled" : item.decision || "No decision"}
                              </Chip>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                              {item.rating_overall ? <Chip className={chipTone("neutral")}>Overall {item.rating_overall}/5</Chip> : null}
                              {item.feedback_submitted ? <Chip className={chipTone("green")}>Feedback submitted</Chip> : <Chip className={chipTone("amber")}>Feedback pending</Chip>}
                            </div>
                            <button
                              type="button"
                              className="mt-3 text-xs font-semibold text-slate-700 underline decoration-dotted underline-offset-2"
                              onClick={() => setExpandedInterviewId((prev) => (prev === item.candidate_interview_id ? null : item.candidate_interview_id))}
                            >
                              {expandedInterviewId === item.candidate_interview_id ? "Hide details" : "View details"}
                            </button>
                            {expandedInterviewId === item.candidate_interview_id ? (
                              <div className="mt-3 space-y-2 text-xs text-slate-700">
                                {item.notes_internal ? (
                                  <div className="rounded-xl border border-white/60 bg-white/70 p-3">
                                    <p className="text-[10px] uppercase tracking-tight text-slate-500">Internal notes</p>
                                    <pre className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{item.notes_internal}</pre>
                                  </div>
                                ) : null}
                                {item.notes_for_candidate ? (
                                  <div className="rounded-xl border border-white/60 bg-white/70 p-3">
                                    <p className="text-[10px] uppercase tracking-tight text-slate-500">Notes for candidate</p>
                                    <p className="mt-1 text-xs text-slate-700">{item.notes_for_candidate}</p>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {scheduleOpen ? (
            <div ref={schedulePanelRef} className="rounded-2xl border border-white/60 bg-white/40 p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-tight text-slate-500">Schedule interview</p>
                  <h3 className="text-lg font-semibold">Round: {scheduleRound}</h3>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                  onClick={() => setScheduleOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                <label className="space-y-1 text-xs text-slate-600">
                  Round type
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    value={scheduleRound}
                    onChange={(e) => setScheduleRound(e.target.value)}
                  >
                    <option value="L2">L2</option>
                    <option value="L1">L1</option>
                    <option value="HR">HR</option>
                  </select>
                </label>

                  <label className="space-y-1 text-xs text-slate-600">
                    Interviewer
                    <div className="relative">
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={personQuery}
                        placeholder={scheduleInterviewer ? scheduleInterviewer.full_name : "Search by name or email"}
                        onChange={(e) => {
                          setPersonQuery(e.target.value);
                          setPersonOpen(true);
                        }}
                        onFocus={() => setPersonOpen(true)}
                        onBlur={() => {
                          window.setTimeout(() => setPersonOpen(false), 120);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowDown" && personResults.length > 0) {
                            e.preventDefault();
                            setPersonHighlight((prev) => Math.min(prev + 1, personResults.length - 1));
                          }
                          if (e.key === "ArrowUp" && personResults.length > 0) {
                            e.preventDefault();
                            setPersonHighlight((prev) => Math.max(prev - 1, 0));
                          }
                          if (e.key === "Enter" && personResults.length > 0) {
                            e.preventDefault();
                            const pick = personResults[personHighlight] || personResults[0];
                            setScheduleInterviewer(pick);
                            setPersonQuery(pick.full_name);
                            setPersonResults([]);
                            setPersonOpen(false);
                          }
                        }}
                      />
                      {personOpen ? (
                        <div className="absolute left-0 right-0 top-full z-10 mt-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-card">
                          {personQuery.trim().length < 2 ? (
                            <p className="px-3 py-2 text-xs text-slate-500">Type at least 2 characters to search.</p>
                          ) : personBusy ? (
                            <p className="px-3 py-2 text-xs text-slate-500">Searching...</p>
                          ) : personResults.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-slate-500">No matches found.</p>
                          ) : (
                            <div className="max-h-48 overflow-auto">
                              {personResults.map((person, index) => {
                                const active = index === personHighlight;
                                return (
                            <button
                              key={person.person_id}
                              type="button"
                              className={`flex w-full items-start justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                                active ? "bg-slate-900 text-white" : "text-slate-800 hover:bg-slate-50"
                              }`}
                              onClick={() => {
                                setScheduleInterviewer(person);
                                setPersonQuery(person.full_name);
                                setPersonResults([]);
                                setPersonOpen(false);
                              }}
                            >
                              <span className="truncate">
                                <span className="font-medium">{person.full_name}</span>{" "}
                                <span className={active ? "text-slate-200" : "text-slate-500"}>({person.email})</span>
                              </span>
                              <span className={active ? "shrink-0 text-xs text-slate-200" : "shrink-0 text-xs text-slate-500"}>
                                {person.role_name || person.role_code}
                              </span>
                            </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </label>

                  {["L1", "L2"].includes(scheduleRound.toUpperCase()) ? (
                    <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Slot planner</p>
                      <p className="text-[11px] text-slate-500">6 slots • 30 mins • 3 business days</p>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr]">
                        <label className="space-y-1 text-xs text-slate-600">
                          First day
                          <input
                            type="date"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                            value={slotPreviewDate}
                            onChange={(e) => {
                              setSlotPreviewDate(e.target.value);
                              setSelectedSlot(null);
                            }}
                          />
                        </label>
                        <div className="rounded-xl border border-slate-200/70 bg-white/80 p-3">
                          {slotPreviewBusy ? (
                            <p className="text-xs text-slate-500">Fetching slots...</p>
                          ) : slotPreviewError ? (
                            <p className="text-xs text-rose-600">{slotPreviewError}</p>
                          ) : slotPreviewSlots.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              {!scheduleInterviewer
                                ? "Select an interviewer to view available slots."
                                : !slotPreviewDate
                                  ? "Select a first day to view available slots."
                                  : "No available slots in the selected window."}
                            </p>
                          ) : (
                            <div className="grid gap-2 md:grid-cols-2">
                              {slotPreviewSlots.map((slot) => {
                                const active = selectedSlot?.slot_start_at === slot.slot_start_at;
                                return (
                                  <button
                                    key={slot.slot_start_at}
                                    type="button"
                                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-semibold ${
                                      active
                                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700"
                                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                    }`}
                                    onClick={() => {
                                      setSelectedSlot(slot);
                                      setScheduleStartAt("");
                                      setScheduleEndAt("");
                                    }}
                                  >
                                    <span>{slot.label}</span>
                                    <span>{active ? "Selected" : "Use"}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <p className="text-[11px] text-slate-500">Manual scheduling (optional)</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-xs text-slate-600">
                      Start time
                      <input
                        type="datetime-local"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={scheduleStartAt}
                        onChange={(e) => setScheduleStartAt(e.target.value)}
                        disabled={!!selectedSlot}
                      />
                    </label>
                    <label className="space-y-1 text-xs text-slate-600">
                      End time
                      <input
                        type="datetime-local"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        value={scheduleEndAt}
                        onChange={(e) => setScheduleEndAt(e.target.value)}
                        disabled={!!selectedSlot}
                      />
                    </label>
                  </div>
                <p className="text-[11px] text-slate-500">All times are stored as IST.</p>

                <label className="space-y-1 text-xs text-slate-600">
                  Location
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    value={scheduleLocation}
                    onChange={(e) => setScheduleLocation(e.target.value)}
                    placeholder="Online / Office / Room"
                  />
                </label>

                <label className="space-y-1 text-xs text-slate-600">
                  Meeting link
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    value={scheduleMeetLink}
                    onChange={(e) => setScheduleMeetLink(e.target.value)}
                    placeholder="https://meet.google.com/..."
                  />
                </label>
              </div>

              {scheduleEmailPreviewError ? (
                <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-700">
                  {scheduleEmailPreviewError}
                </div>
              ) : null}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                  onClick={() => setScheduleOpen(false)}
                >
                  Cancel
                </button>
                  <button
                    type="button"
                    className="rounded-xl border border-slate-900/20 bg-white px-4 py-2 text-xs font-semibold text-slate-900"
                    onClick={() => void handleSendSlotInvite()}
                    disabled={slotInviteBusy || interviewsBusy}
                  >
                    {slotInviteBusy ? "Sending..." : "Send slot options"}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-slate-900/20 bg-white px-4 py-2 text-xs font-semibold text-slate-900"
                    onClick={() => void handleScheduleEmailPreview()}
                    disabled={scheduleEmailPreviewBusy}
                  >
                    {scheduleEmailPreviewBusy ? "Loading..." : "Preview email"}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                    onClick={() => void handleScheduleSubmit()}
                    disabled={interviewsBusy}
                >
                  {interviewsBusy ? "Saving..." : "Schedule interview"}
                </button>
              </div>
            </div>
          ) : null}

          {assignOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
              <div className="w-full max-w-xl rounded-3xl border border-white/20 bg-white/95 p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-tight text-slate-500">Assign sprint</p>
                    <h3 className="text-lg font-semibold">Select a template</h3>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                    onClick={() => setAssignOpen(false)}
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="space-y-1 text-xs text-slate-600">
                    Sprint template
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                      value={selectedTemplateId}
                      onChange={(e) => handleTemplateSelect(e.target.value)}
                    >
                      <option value="">Select template</option>
                      {sprintTemplates.map((template) => (
                        <option key={template.sprint_template_id} value={String(template.sprint_template_id)}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-xs text-slate-600">
                    Due date
                    <input
                      type="datetime-local"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                      value={dueAt}
                      onChange={(e) => setDueAt(e.target.value)}
                    />
                  </label>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                    onClick={() => setAssignOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                    onClick={() => void handleAssignSprint()}
                    disabled={sprintsBusy}
                  >
                    {sprintsBusy ? "Assigning..." : "Assign sprint"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div ref={sprintRef} className="section-card">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-tight text-slate-500">Sprint</p>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
                onClick={() => toggleSection("sprint")}
              >
                {collapsedSections.sprint ? "Expand" : "Collapse"}
              </button>
            </div>
            {collapsedSections.sprint ? null : (
              <>
                {sprintsError ? (
                  <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
                    {sprintsError}
                  </div>
                ) : null}
                <div className="mt-3 space-y-3">
                  {sprintsBusy && !candidateSprints ? (
                    <div className="rounded-2xl border border-white/60 bg-white/30 p-4 text-sm text-slate-600">Loading sprint data...</div>
                  ) : candidateSprints && candidateSprints.length > 0 ? (
                    candidateSprints.map((sprint) => (
                      <div key={sprint.candidate_sprint_id} className="rounded-2xl border border-white/60 bg-white/30 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{sprint.template_name || "Sprint assignment"}</p>
                            <p className="text-xs text-slate-600">{sprint.template_description || "No description provided."}</p>
                          </div>
                          <Chip className={chipTone(sprint.status === "submitted" ? "amber" : sprint.status === "completed" ? "green" : "neutral")}>
                            {sprint.status.replace("_", " ")}
                          </Chip>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                          <Metric label="Assigned" value={formatDateTime(sprint.assigned_at)} />
                          <Metric label="Due" value={sprint.due_at ? formatDateTime(sprint.due_at) : "-"} />
                          <Metric label="Status" value={formatRelativeDue(sprint.due_at)} />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          {sprint.instructions_url ? (
                            <a
                              className="inline-flex items-center gap-1 text-slate-800 underline decoration-dotted underline-offset-2"
                              href={sprint.instructions_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="h-3.5 w-3.5" /> Sprint brief
                            </a>
                          ) : null}
                          {sprint.submission_url ? (
                            <a
                              className="inline-flex items-center gap-1 text-slate-800 underline decoration-dotted underline-offset-2"
                              href={sprint.submission_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="h-3.5 w-3.5" /> Submission
                            </a>
                          ) : (
                            <span>No submission yet.</span>
                          )}
                          {sprint.score_overall != null ? <Chip className={chipTone("blue")}>Score {sprint.score_overall}</Chip> : null}
                          {sprint.decision ? <Chip className={decisionTone(sprint.decision)}>{sprint.decision.replace("_", " ")}</Chip> : null}
                        </div>
                      </div>
                    ))
                  ) : currentStageKey === "sprint" ? (
                    <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-500/5 p-4">
                      <p className="text-sm font-semibold text-amber-700">Sprint stage active</p>
                      <p className="mt-1 text-sm text-amber-700">Assign a sprint template to share the brief with the candidate.</p>
                      <button
                        type="button"
                        className="mt-3 rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600"
                        onClick={() => void openAssignSprint()}
                      >
                        Assign sprint
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/60 bg-white/30 p-4 text-sm text-slate-600">
                      No sprint assigned yet.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div ref={offerRef} className="section-card">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-tight text-slate-500">Offer</p>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
                onClick={() => toggleSection("offer")}
              >
                {collapsedSections.offer ? "Expand" : "Collapse"}
              </button>
            </div>
            {collapsedSections.offer ? null : (
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
                        <p className="text-xs text-slate-600">{latestOffer.designation_title || candidate.opening_title || "Offer role"}</p>
                      </div>
                      <Chip className={chipTone(latestOffer.offer_status === "accepted" ? "green" : latestOffer.offer_status === "declined" ? "red" : "neutral")}>
                        {latestOffer.offer_status.replace("_", " ")}
                      </Chip>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <Metric label="Gross CTC" value={latestOffer.gross_ctc_annual != null ? formatMoney(latestOffer.gross_ctc_annual) : "-"} />
                      <Metric label="Joining date" value={latestOffer.joining_date ? formatDate(latestOffer.joining_date) : "-"} />
                      <Metric label="Probation" value={latestOffer.probation_months != null ? `${latestOffer.probation_months} months` : "-"} />
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
                        onClick={() => void handleOfferPreview(latestOffer.candidate_offer_id, "letter")}
                        disabled={offerPreviewBusy}
                      >
                        Preview letter
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                        onClick={() => void handleOfferPreview(latestOffer.candidate_offer_id, "email")}
                        disabled={offerPreviewBusy}
                      >
                        Preview email
                      </button>
                      {latestOffer.offer_status === "draft" ? (
                        <>
                          <button
                            type="button"
                            className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                            onClick={() => void handleSubmitOffer(latestOffer.candidate_offer_id)}
                            disabled={offersBusy}
                          >
                            Submit for approval
                          </button>
                          {canDelete ? (
                            <button
                              type="button"
                              className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                              onClick={() => void handleDeleteOffer(latestOffer.candidate_offer_id)}
                              disabled={offersBusy}
                            >
                              Delete draft
                            </button>
                          ) : null}
                        </>
                      ) : null}
                      {latestOffer.offer_status === "pending_approval" ? (
                        <>
                          <button
                            type="button"
                            className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                            onClick={() => void handleApproveOffer(latestOffer.candidate_offer_id)}
                            disabled={offersBusy}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                            onClick={() => void handleRejectOffer(latestOffer.candidate_offer_id)}
                            disabled={offersBusy}
                          >
                            Request changes
                          </button>
                        </>
                      ) : null}
                      {latestOffer.offer_status === "approved" ? (
                        <button
                          type="button"
                          className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                          onClick={() => void handleSendOffer(latestOffer.candidate_offer_id)}
                          disabled={offersBusy}
                        >
                          Send to candidate
                        </button>
                      ) : null}
                      {latestOffer.offer_status === "accepted" ? (
                        <button
                          type="button"
                          className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                          onClick={() => void handleConvertCandidate()}
                          disabled={offersBusy}
                        >
                          Mark as joined
                        </button>
                      ) : null}
                    </div>
                    {latestOffer.offer_status === "draft" ? (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 p-3">
                        <div className="flex items-center justify-between gap-2">
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
                                onClick={() => void handleSaveDraftOverrides(latestOffer.candidate_offer_id)}
                                disabled={offersBusy}
                              >
                                Save letter fields
                              </button>
                            </div>
                          </>
                        ) : null}
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
                          value={offerTemplateCode}
                          onChange={(e) => setOfferTemplateCode(e.target.value)}
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
                          value={offerDesignation}
                          onChange={(e) => setOfferDesignation(e.target.value)}
                          placeholder="Architect - Level 2"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600">
                        Gross CTC (annual)
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          value={offerGross}
                          onChange={(e) => setOfferGross(e.target.value)}
                          placeholder="1200000"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600">
                        Fixed CTC (annual)
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          value={offerFixed}
                          onChange={(e) => setOfferFixed(e.target.value)}
                          placeholder="1000000"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600">
                        Variable CTC (annual)
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          value={offerVariable}
                          onChange={(e) => setOfferVariable(e.target.value)}
                          placeholder="200000"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600">
                        Currency
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          value={offerCurrency}
                          onChange={(e) => setOfferCurrency(e.target.value)}
                          placeholder="INR"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600">
                        Joining date
                        <input
                          type="date"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          value={offerJoiningDate}
                          onChange={(e) => setOfferJoiningDate(e.target.value)}
                        />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600">
                        Probation (months)
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          value={offerProbationMonths}
                          onChange={(e) => setOfferProbationMonths(e.target.value)}
                        />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600">
                        Grade ID
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          value={offerGradeId}
                          onChange={(e) => setOfferGradeId(e.target.value)}
                          placeholder="3"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600 md:col-span-2">
                        Notes (internal)
                        <textarea
                          className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          value={offerNotes}
                          onChange={(e) => setOfferNotes(e.target.value)}
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
                                value={offerLetterOverrides[field.key] || ""}
                                onChange={(e) =>
                                  setOfferLetterOverrides((prev) => ({
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
                        onClick={() => void handleCreateOffer()}
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
        </section>
      </div>
      {scheduleEmailPreviewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/30 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">Interview email preview</p>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                onClick={() => setScheduleEmailPreviewOpen(false)}
              >
                Close
              </button>
            </div>
            <iframe
              title="Interview email preview"
              className="h-[70vh] w-full bg-white"
              srcDoc={scheduleEmailPreviewHtml}
            />
          </div>
        </div>
      ) : null}
      {offerPreviewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/30 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">{offerPreviewTitle}</p>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                onClick={() => setOfferPreviewOpen(false)}
              >
                Close
              </button>
            </div>
            <iframe
              title={offerPreviewTitle}
              className="h-[70vh] w-full bg-white"
              srcDoc={offerPreviewHtml}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
