"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CandidateAssessment, CandidateDetail, CandidateFull, CandidateOffer, CandidateStage, CandidateSprint, Interview, JoiningDoc, PlatformPersonSuggestion, Screening, SprintTemplate, SprintTemplateAttachment } from "@/lib/types";
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
  canUploadJoiningDocs: boolean;
};

type SlotPreview = {
  slot_start_at: string;
  slot_end_at: string;
  label: string;
};

type StageButton = {
  label: string;
  tone: string;
  icon: JSX.Element;
  intent: string;
  action: () => void | Promise<void>;
  disabled?: boolean;
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
  { key: "joining_documents", label: "Joining documents" },
  { key: "hired", label: "Hired" },
  { key: "declined", label: "Declined" },
  { key: "rejected", label: "Rejected" },
];

const pipelineStages = [
  "enquiry",
  "hr_screening",
  "l2_shortlist",
  "l2_interview",
  "l2_feedback",
  "sprint",
  "l1_shortlist",
  "l1_interview",
  "l1_feedback",
  "offer",
];

const postAcceptanceStages = ["joining_documents", "hired"];
const postDeclineStages = ["declined"];
const postRejectStages = ["rejected"];

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

function formatInviteExpiry(raw?: string | null) {
  if (!raw) return "No expiry";
  return formatDateTime(raw) || raw;
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

function formatPreviewDueAt(raw?: string) {
  if (!raw) return "-";
  const due = new Date(raw);
  if (Number.isNaN(due.getTime())) return raw;
  return due.toLocaleString("en-IN", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(raw?: string | null) {
  if (!raw) return "";
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  if (s === "rejected" || s === "declined") return chipTone("red");
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
  { value: "joining_documents", label: "Joining documents" },
  { value: "hired", label: "Hired" },
  { value: "declined", label: "Declined" },
  { value: "rejected", label: "Rejected" },
];

const joiningDocOptions = [
  { value: "pan", label: "PAN card" },
  { value: "aadhaar", label: "Aadhaar card" },
  { value: "marksheets", label: "Marksheets" },
  { value: "experience_letters", label: "Experience letters" },
  { value: "salary_slips", label: "Salary slips" },
  { value: "other", label: "Other documents" },
];

function joiningDocLabel(value: string) {
  return joiningDocOptions.find((doc) => doc.value === value)?.label || value.replace(/_/g, " ");
}

async function readError(res: Response) {
  const raw = await res.text();
  if (!raw) return `Request failed (${res.status})`;
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown; message?: unknown };
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.detail === "string") return parsed.detail;
      if (typeof parsed.message === "string") return parsed.message;
    }
  } catch {
    // Fall back to raw text.
  }
  return raw;
}

async function updateCandidate(candidateId: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as CandidateDetail;
}

async function fetchInterviews(candidateId: string) {
  const res = await fetch(`/api/rec/interviews?candidate_id=${encodeURIComponent(candidateId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Interview[];
}

async function cancelInterview(interviewId: number, reason?: string) {
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function fetchCandidateSprints(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/sprints`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateSprint[];
}

async function deleteCandidateSprint(candidateSprintId: number) {
  const res = await fetch(`/api/rec/sprints/${encodeURIComponent(String(candidateSprintId))}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

async function fetchSprintTemplates() {
  const res = await fetch("/api/rec/sprint-templates", { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as SprintTemplate[];
}

async function fetchSprintTemplateAttachments(templateId: string) {
  const res = await fetch(`/api/rec/sprint-templates/${encodeURIComponent(templateId)}/attachments`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as SprintTemplateAttachment[];
}

async function fetchCandidateOffers(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/offers`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer[];
}

async function fetchJoiningDocs(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/joining-docs`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as JoiningDoc[];
}

async function uploadJoiningDoc(candidateId: string, payload: { doc_type: string; file: File }) {
  const form = new FormData();
  form.append("doc_type", payload.doc_type);
  form.append("file", payload.file);
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/joining-docs`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as JoiningDoc;
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

async function adminDecideOffer(offerId: number, decision: "accept" | "decline") {
  const res = await fetch(`/api/rec/offers/${offerId}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision }),
  });
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
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as CandidateSprint;
}

async function createInterview(candidateId: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/interviews`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as Interview;
}

async function rescheduleInterview(interviewId: number, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/reschedule`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as Interview;
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

async function fetchPeople(query: string) {
  const res = await fetch(`${basePath}/api/platform/people?q=${encodeURIComponent(query)}&limit=10`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as PlatformPersonSuggestion[];
}

  async function fetchSlotPreview(interviewer: PlatformPersonSuggestion, startDate: string) {
    const url = new URL(`${basePath}/api/rec/interview-slots/preview`, window.location.origin);
    if (interviewer.email) url.searchParams.set("interviewer_email", interviewer.email);
    if (interviewer.person_id) url.searchParams.set("interviewer_person_id_platform", interviewer.person_id);
    if (startDate) url.searchParams.set("start_date", startDate);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as SlotPreview[];
  }

async function transition(candidateId: string, payload: { to_stage: string; decision?: string; note?: string; reason?: string }) {
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

  function formatBytes(raw?: number | null) {
    if (raw === null || raw === undefined) return "-";
    if (raw < 1024) return `${raw} B`;
    const units = ["KB", "MB", "GB"];
    let size = raw / 1024;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  function valueOrDash(value?: string | number | null) {
    if (value === null || value === undefined) return "-";
    const text = String(value).trim();
    return text ? text : "-";
  }

  function yesNo(value?: boolean | null) {
    if (value == null) return "-";
    return value ? "Yes" : "No";
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

export function Candidate360Client({ candidateId, initial, canDelete, canSchedule, canSkip, canCancelInterview, canUploadJoiningDocs }: Props) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<CandidateFull>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cafLink, setCafLink] = useState<{ caf_token: string; caf_url: string } | null>(null);
  const [interviews, setInterviews] = useState<Interview[] | null>(null);
  const [interviewsBusy, setInterviewsBusy] = useState(false);
  const [interviewsError, setInterviewsError] = useState<string | null>(null);
  const [interviewsNotice, setInterviewsNotice] = useState<string | null>(null);
  const [slotInviteRound, setSlotInviteRound] = useState<string | null>(null);
  const [slotInviteCancelBusy, setSlotInviteCancelBusy] = useState(false);
  const [activeSlotInvites, setActiveSlotInvites] = useState<
    { round_type: string; expires_at: string | null; count: number }[]
  >([]);
  const [expandedInterviewId, setExpandedInterviewId] = useState<number | null>(null);
  const [rescheduleInterviewId, setRescheduleInterviewId] = useState<number | null>(null);
  const [scheduleEmailPreviewOpen, setScheduleEmailPreviewOpen] = useState(false);
  const [scheduleEmailPreviewHtml, setScheduleEmailPreviewHtml] = useState("");
  const [scheduleEmailPreviewBusy, setScheduleEmailPreviewBusy] = useState(false);
  const [scheduleEmailPreviewError, setScheduleEmailPreviewError] = useState<string | null>(null);
  const [candidateSprints, setCandidateSprints] = useState<CandidateSprint[] | null>(null);
  const [sprintsBusy, setSprintsBusy] = useState(false);
  const [sprintsError, setSprintsError] = useState<string | null>(null);
  const [lastSprintNotice, setLastSprintNotice] = useState<{
    template_name?: string | null;
    template_code?: string | null;
    assigned_at?: string | null;
    due_at?: string | null;
    status: string;
    deleted_at?: string | null;
  } | null>(null);
  const [templatePreview, setTemplatePreview] = useState<SprintTemplate | null>(null);
  const [templateAttachments, setTemplateAttachments] = useState<SprintTemplateAttachment[]>([]);
  const [templatePreviewBusy, setTemplatePreviewBusy] = useState(false);
  const [templatePreviewError, setTemplatePreviewError] = useState<string | null>(null);
  const [candidateOffers, setCandidateOffers] = useState<CandidateOffer[] | null>(null);
  const [offersBusy, setOffersBusy] = useState(false);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [joiningDocs, setJoiningDocs] = useState<JoiningDoc[] | null>(null);
  const [joiningDocsBusy, setJoiningDocsBusy] = useState(false);
  const [joiningDocsError, setJoiningDocsError] = useState<string | null>(null);
  const [joiningDocsNotice, setJoiningDocsNotice] = useState<string | null>(null);
  const [joiningDocType, setJoiningDocType] = useState(joiningDocOptions[0]?.value || "pan");
  const [joiningDocFile, setJoiningDocFile] = useState<File | null>(null);
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
  const activeSprints = useMemo(
    () => (candidateSprints || []).filter((sprint) => sprint.status !== "deleted"),
    [candidateSprints]
  );
  const hasSubmittedSprint = useMemo(
    () => activeSprints.some((sprint) => sprint.status === "submitted"),
    [activeSprints]
  );
  const sprintAssigned = activeSprints.length > 0;
  const sprintAssignDisabled = sprintAssigned && !canSkip;
  const [sprintDeleteBusy, setSprintDeleteBusy] = useState(false);
  function isCancelled(item: Interview) {
    if ((item.decision || "").toLowerCase() === "cancelled") return true;
    const note = (item.notes_internal || "").toLowerCase();
    return note.includes("cancelled by superadmin");
  }

  function interviewStatusValue(item: Interview) {
    return (item.interview_status || "").toLowerCase();
  }

  function isNotTaken(item: Interview) {
    return interviewStatusValue(item) === "not_taken";
  }

  const scheduleAllowed = useMemo(() => {
    if (!canSchedule) return false;
    if (canSkip) return true;
    if (rescheduleInterviewId) return true;
    if (!interviews) return false;
    return interviews.length === 0;
  }, [canSchedule, canSkip, interviews, rescheduleInterviewId]);
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
  const [scheduleReason, setScheduleReason] = useState("");
  const [slotInviteBusy, setSlotInviteBusy] = useState(false);
  const [personQuery, setPersonQuery] = useState("");
  const [personResults, setPersonResults] = useState<PlatformPersonSuggestion[]>([]);
  const [personBusy, setPersonBusy] = useState(false);
  const [personOpen, setPersonOpen] = useState(false);
  const [personHighlight, setPersonHighlight] = useState(0);
  const [l2OwnerQuery, setL2OwnerQuery] = useState("");
  const [l2OwnerOptions, setL2OwnerOptions] = useState<PlatformPersonSuggestion[]>([]);
  const [l2OwnerOpen, setL2OwnerOpen] = useState(false);
  const [l2OwnerLoading, setL2OwnerLoading] = useState(false);
  const [l2OwnerSelected, setL2OwnerSelected] = useState<PlatformPersonSuggestion | null>(null);
  const [l2OwnerSaving, setL2OwnerSaving] = useState(false);
  const [l2OwnerError, setL2OwnerError] = useState<string | null>(null);
  const [slotPreviewDate, setSlotPreviewDate] = useState("");
  const [slotPreviewSlots, setSlotPreviewSlots] = useState<SlotPreview[]>([]);
  const [slotPreviewBusy, setSlotPreviewBusy] = useState(false);
  const [slotPreviewError, setSlotPreviewError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotPreview | null>(null);
  const [autoRescheduleOpened, setAutoRescheduleOpened] = useState(false);
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
  const cafLocked = !candidate.caf_submitted_at;
  const cafExpiryDays = 3;
  const cafSentAt = candidate.caf_sent_at ? new Date(candidate.caf_sent_at) : null;
  const cafExpiresAt = cafSentAt ? new Date(cafSentAt.getTime() + cafExpiryDays * 24 * 60 * 60 * 1000) : null;
  const cafDaysLeft =
    cafExpiresAt && cafSentAt
      ? Math.max(0, Math.ceil((cafExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : null;

  useEffect(() => {
    if (candidate.opening_title && !offerDesignation) {
      setOfferDesignation(candidate.opening_title);
    }
    if (offerTemplateCode === "STD_OFFER") {
      const suggestion = suggestOfferTemplate(candidate.opening_title);
      setOfferTemplateCode(suggestion);
    }
  }, [candidate.opening_title]);

  useEffect(() => {
    if (candidate.l2_owner_email) {
      setL2OwnerSelected({
        person_id: candidate.l2_owner_email,
        person_code: "",
        full_name: candidate.l2_owner_name || candidate.l2_owner_email.split("@")[0] || candidate.l2_owner_email,
        email: candidate.l2_owner_email,
      });
      setL2OwnerQuery("");
    } else {
      setL2OwnerSelected(null);
      setL2OwnerQuery("");
    }
  }, [candidate.l2_owner_email, candidate.l2_owner_name]);

  useEffect(() => {
    if (!searchParams || autoRescheduleOpened) return;
    const rescheduleId = searchParams.get("reschedule_interview_id");
    if (!rescheduleId) return;
    const parsedId = Number(rescheduleId);
    if (!Number.isFinite(parsedId)) return;
    const round = searchParams.get("round") || "L2";
    setAutoRescheduleOpened(true);
    openSchedule(round, parsedId);
  }, [searchParams, autoRescheduleOpened]);

  const cafState = useMemo(() => {
    const generated = !!candidate.caf_sent_at || !!cafLink?.caf_token;
    const submitted = !!candidate.caf_submitted_at;
    if (submitted) return { label: "CAF submitted", tone: chipTone("green") };
    if (generated) return { label: "CAF pending", tone: chipTone("amber") };
    return { label: "CAF not sent", tone: chipTone("neutral") };
  }, [candidate.caf_sent_at, candidate.caf_submitted_at, cafLink?.caf_token]);
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
      return typeof roundType === "string" && roundType.toLowerCase().includes("l2");
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
      return typeof roundType === "string" && roundType.toLowerCase().includes("l1");
    });
    if (matches.length === 0) return null;
    return matches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  }, [data.events, interviews]);
  const sprintEmailPreviewHtml = useMemo(() => {
    if (!templatePreview) return "";
    const candidateName = escapeHtml(candidate.name || "Candidate");
    const sprintName = escapeHtml(templatePreview.name || "Sprint assignment");
    const openingTitle = escapeHtml(candidate.opening_title || "Role");
    const dueLabel = escapeHtml(formatPreviewDueAt(dueAt));
    const attachments = templateAttachments.length > 0
      ? templateAttachments.map((item) => `<li>${escapeHtml(item.file_name)}</li>`).join("")
      : "<li>No attachments</li>";
    return `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f8fafc;padding:12px 0;">
        <tr>
          <td align="center">
            <table width="640" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="padding:24px 28px 8px 28px;font-family:Arial,sans-serif;color:#0f172a;">
                  <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;">Sprint Assignment</div>
                  <h1 style="margin:10px 0 4px 0;font-size:22px;font-weight:700;">Hi ${candidateName},</h1>
                  <p style="margin:0;font-size:14px;color:#475569;">Your sprint assignment is ready.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px 16px 28px;font-family:Arial,sans-serif;color:#0f172a;">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
                    <tr>
                      <td style="padding:12px 16px;font-size:13px;color:#475569;">Sprint</td>
                      <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;">${sprintName}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">Role</td>
                      <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-top:1px solid #e2e8f0;">${openingTitle}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">Due by</td>
                      <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-top:1px solid #e2e8f0;">${dueLabel}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">Attachments</td>
                      <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-top:1px solid #e2e8f0;">
                        <ul style="margin:0;padding-left:18px;color:#0f172a;font-size:13px;font-weight:500;">
                          ${attachments}
                        </ul>
                      </td>
                    </tr>
                  </table>
                  <div style="margin:16px 0 18px;">
                    <a href="#" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0f172a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;">View sprint</a>
                  </div>
                  <p style="margin:16px 0 0 0;font-size:14px;line-height:1.6;color:#334155;font-family:Arial,sans-serif;">Regards,<br />Studio Lotus Recruitment Team</p>
                  <div style="margin-top:14px;">
                    <div style="font-family:arial,sans-serif;">
                      <div style="color:rgb(34,34,34);">
                        <span style="text-align:justify;font-family:georgia,palatino,serif;font-size:large;color:rgb(126,124,123);">studio</span>
                        <span style="text-align:justify;font-family:georgia,palatino,serif;font-size:large;color:rgb(241,92,55);">lotus</span>
                      </div>
                      <div style="text-align:justify;">
                        <span style="color:rgb(241,92,55);font-family:arial,sans-serif;font-size:x-small;">creating meaning </span>
                        <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;font-size:x-small;">| </span>
                        <span style="color:rgb(241,92,55);font-family:arial,sans-serif;font-size:x-small;">celebrating context</span>
                      </div>
                      <div style="color:rgb(34,34,34);font-size:x-small;font-family:arial,sans-serif;">
                        World's 100 Best Architecture Firms, Archello
                        <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;"> | </span>
                        WAF
                        <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;"> | </span>
                        TIME Magazine
                        <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;"> | </span>
                        Prix Versailles
                        <span style="color:rgb(241,92,55);font-family:georgia,palatino,serif;"> | </span>
                        Dezeen Awards
                      </div>
                      <div style="font-size:x-small;font-family:arial,sans-serif;">
                        <a href="https://studiolotus.in/" style="color:rgb(17,85,204);" target="_blank" rel="noopener">Website</a>
                        <span> | </span>
                        <a href="https://www.instagram.com/studio_lotus/" style="color:rgb(17,85,204);" target="_blank" rel="noopener">Instagram</a>
                        <span> | </span>
                        <a href="https://www.linkedin.com/company/studiolotus/" style="color:rgb(17,85,204);" target="_blank" rel="noopener">LinkedIn</a>
                        <span> | </span>
                        <a href="https://www.facebook.com/studiolotus.in/" style="color:rgb(17,85,204);" target="_blank" rel="noopener">Facebook</a>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0 0;font-size:11px;color:#94a3b8;font-family:Arial,sans-serif;">This email contains confidential information intended only for the recipient.</p>
          </td>
        </tr>
      </table>
    `;
  }, [templatePreview, templateAttachments, candidate.name, candidate.opening_title, dueAt]);

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

  async function handleSaveL2Owner() {
    const email = (l2OwnerSelected?.email || l2OwnerQuery || "").trim().toLowerCase();
    const name = (l2OwnerSelected?.full_name || "").trim() || undefined;
    if (!email || !email.includes("@")) {
      setL2OwnerError("Enter a valid email or select from suggestions.");
      return;
    }
    setL2OwnerError(null);
    setL2OwnerSaving(true);
    try {
      const updated = await updateCandidate(candidateId, {
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
  }

  async function handleTransition(toStage: string, decision: string, reasonOverride?: string) {
    setBusy(true);
    setError(null);
    try {
      if (toStage === "hr_screening" && !candidate.l2_owner_email) {
        setBusy(false);
        setError("Assign GL/L2 email before moving to HR screening.");
        return;
      }
      let reason = reasonOverride;
      if (decision === "reject" && !reason) {
        const input = window.prompt("Reason for rejection (required):");
        if (!input || !input.trim()) {
          setBusy(false);
          return;
        }
        reason = input.trim();
      }
      await transition(candidateId, { to_stage: toStage, decision, reason, note: `UI: ${decision}` });
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
      const active = list.filter((sprint) => sprint.status !== "deleted");
      if (active.length === 0) {
        const deleted = list
          .filter((sprint) => sprint.status === "deleted")
          .sort((a, b) => new Date(b.deleted_at || b.updated_at).getTime() - new Date(a.deleted_at || a.updated_at).getTime());
        if (deleted.length > 0) {
          const latest = deleted[0];
          setLastSprintNotice({
            template_name: latest.template_name,
            template_code: latest.template_code,
            assigned_at: latest.assigned_at,
            due_at: latest.due_at,
            status: "deleted",
            deleted_at: latest.deleted_at || latest.updated_at,
          });
        } else {
          setLastSprintNotice(null);
        }
      } else {
        setLastSprintNotice(null);
      }
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

  async function refreshJoiningDocs() {
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
  }

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
    if (sprintAssignDisabled) {
      setSprintsError("Sprint already assigned. Contact a superadmin to reassign.");
      return;
    }
    setAssignOpen(true);
    setSprintsError(null);
    setSelectedTemplateId("");
    setDueAt("");
    setTemplatePreview(null);
    setTemplateAttachments([]);
    setTemplatePreviewError(null);
    setTemplatePreviewBusy(false);
    if (sprintTemplates.length === 0) {
      try {
        const templates = await fetchSprintTemplates();
        setSprintTemplates(templates);
      } catch (e: any) {
        setSprintsError(e?.message || "Could not load templates.");
      }
    }
  }

  async function handleTemplateSelect(value: string) {
    setSelectedTemplateId(value);
    setTemplatePreviewError(null);
    setTemplatePreview(null);
    setTemplateAttachments([]);
    if (!value) {
      setDueAt("");
      return;
    }
    const chosen = sprintTemplates.find((t) => String(t.sprint_template_id) === value) || null;
    setTemplatePreview(chosen);
    if (chosen?.expected_duration_days) {
      const target = new Date(Date.now() + chosen.expected_duration_days * 24 * 60 * 60 * 1000);
      const iso = new Date(target.getTime() - target.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setDueAt(iso);
    } else {
      setDueAt("");
    }
    setTemplatePreviewBusy(true);
    try {
      const attachments = await fetchSprintTemplateAttachments(value);
      setTemplateAttachments(attachments);
    } catch (e: any) {
      setTemplatePreviewError(e?.message || "Could not load template attachments.");
    } finally {
      setTemplatePreviewBusy(false);
    }
  }

  async function handleAssignSprint() {
    if (!selectedTemplateId) {
      setSprintsError("Select a sprint template.");
      return;
    }
    if (!dueAt) {
      setSprintsError("Select a sprint due date.");
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

  async function handleDeleteSprint(candidateSprintId: number) {
    if (!canSkip) return;
    const confirmed = window.confirm("Delete this sprint assignment? This cannot be undone.");
    if (!confirmed) return;
    setSprintsError(null);
    setSprintDeleteBusy(true);
    try {
      const deleted = (candidateSprints || []).find((sprint) => sprint.candidate_sprint_id === candidateSprintId);
      await deleteCandidateSprint(candidateSprintId);
      const list = await fetchCandidateSprints(candidateId);
      setCandidateSprints(list);
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
    } catch (e: any) {
      setSprintsError(e?.message || "Could not delete sprint.");
    } finally {
      setSprintDeleteBusy(false);
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

  async function handleAdminDecision(offerId: number, decision: "accept" | "decline") {
    if (!confirm(`Mark offer as ${decision}? This will update candidate status and stage.`)) return;
    setOffersBusy(true);
    setOffersError(null);
    try {
      await adminDecideOffer(offerId, decision);
      await refreshOffers();
      await refreshAll();
    } catch (e: any) {
      setOffersError(e?.message || "Offer decision failed.");
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

  async function prefillL2Owner(roundType: string) {
    const roundUpper = roundType.toUpperCase();
    if (roundUpper !== "L2") return;
    const ownerEmail = (candidate.l2_owner_email || "").trim().toLowerCase();
    if (!ownerEmail) return;
    try {
      const matches = await fetchPeople(ownerEmail);
      const match =
        matches.find((item) => (item.email || "").toLowerCase() === ownerEmail) ||
        matches[0];
      if (match) {
        setScheduleInterviewer(match);
        setPersonQuery(match.full_name || match.email || ownerEmail);
        return;
      }
    } catch {
      // Ignore lookup failures and fall back to manual selection.
    }
    setScheduleInterviewer({
      person_id: "",
      person_code: "",
      full_name: candidate.l2_owner_name || ownerEmail,
      email: ownerEmail,
    });
    setPersonQuery(candidate.l2_owner_name || ownerEmail);
  }

  function openSchedule(roundType: string, rescheduleId: number | null = null) {
    const existing = rescheduleId ? interviews?.find((item) => item.candidate_interview_id === rescheduleId) : null;
    setScheduleRound(existing?.round_type || roundType);
    setScheduleStartAt("");
    setScheduleEndAt("");
    setScheduleLocation("");
    setScheduleMeetLink("");
    setScheduleInterviewer(null);
    setScheduleReason("");
    setRescheduleInterviewId(rescheduleId);
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

    if (existing) {
      const suggestion = {
        person_id: existing.interviewer_person_id_platform || "",
        person_code: "",
        full_name: existing.interviewer_name || existing.interviewer_person_id_platform || "Interviewer",
        email: existing.interviewer_email || "",
      };
      setScheduleInterviewer(suggestion);
      setPersonQuery(suggestion.full_name);
      const today = new Date().toISOString().slice(0, 10);
      setSlotPreviewDate(today);
      return;
    }
    void prefillL2Owner(roundType);
  }

  async function handleScheduleSubmit() {
    setInterviewsError(null);
    setInterviewsNotice(null);
    if (!scheduleInterviewer) {
      setInterviewsError("Select an interviewer.");
      return;
    }
    let resolvedInterviewer = scheduleInterviewer;
    if (!resolvedInterviewer.person_id && resolvedInterviewer.email) {
      try {
        const matches = await fetchPeople(resolvedInterviewer.email);
        const match = matches.find((item) => (item.email || "").toLowerCase() === resolvedInterviewer.email?.toLowerCase()) || matches[0];
        if (match?.person_id) {
          resolvedInterviewer = match;
          setScheduleInterviewer(match);
          setPersonQuery(match.full_name || match.email || resolvedInterviewer.email || "");
        }
      } catch {
        // Ignore lookup failure and surface validation below.
      }
    }
    if (!resolvedInterviewer.person_id) {
      setInterviewsError("Select a valid interviewer.");
      return;
    }
    const roundUpper = scheduleRound.toUpperCase();
    const isSlotRound = roundUpper === "L1" || roundUpper === "L2";
    if (!isSlotRound) {
      setInterviewsError("Manual scheduling has been removed. Use the slot planner for L1/L2.");
      return;
    }
    if (!selectedSlot) {
      setInterviewsError("Select a slot from the planner.");
      return;
    }
    const startIso = `${selectedSlot.slot_start_at}Z`;
    const endIso = `${selectedSlot.slot_end_at}Z`;
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
      setInterviewsError("End time must be after start time.");
      return;
    }
      setInterviewsBusy(true);
      try {
        if (rescheduleInterviewId) {
          await rescheduleInterview(rescheduleInterviewId, {
            scheduled_start_at: startIso,
            scheduled_end_at: endIso,
            reason: scheduleReason || undefined,
          });
          setScheduleOpen(false);
          setSelectedSlot(null);
          setRescheduleInterviewId(null);
          await refreshInterviews();
          return;
        }
        await createInterview(candidateId, {
          round_type: scheduleRound,
          interviewer_person_id_platform: resolvedInterviewer.person_id,
          scheduled_start_at: startIso,
          scheduled_end_at: endIso,
          location: scheduleLocation || undefined,
          meeting_link: scheduleMeetLink || undefined,
        });
        setScheduleOpen(false);
        setSelectedSlot(null);
        setRescheduleInterviewId(null);
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

      setScheduleEmailPreviewError("Slot scheduling is available only for L1/L2 rounds.");
    } catch (e: any) {
      setScheduleEmailPreviewError(e?.message || "Email preview failed.");
    } finally {
      setScheduleEmailPreviewBusy(false);
    }
  }

  async function handleSendSlotInvite() {
    setInterviewsError(null);
    setInterviewsNotice(null);
    setSlotInviteRound(null);
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
        const raw = (await res.text()).trim();
        let detail = raw;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && "detail" in parsed && typeof (parsed as any).detail === "string") {
            detail = (parsed as any).detail;
          }
        } catch {
          // ignore
        }
        if (res.status === 409) {
          setInterviewsNotice(detail || "Slot invite already sent. Please wait for it to expire.");
          setSlotInviteRound(roundUpper);
          return;
        }
        throw new Error(detail || "Could not send slot invite.");
      }
      setInterviewsNotice("Slot invite email sent to the candidate.");
      await refreshActiveSlotInvites();
    } catch (e: any) {
      setInterviewsError(e?.message || "Could not send slot invite.");
    } finally {
      setSlotInviteBusy(false);
    }
  }

  async function refreshActiveSlotInvites() {
    try {
      const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/interview-slots/active`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { active_invites?: { round_type: string; expires_at: string | null; count: number }[] };
      setActiveSlotInvites(data.active_invites || []);
    } catch {
      // ignore
    }
  }

  async function handleCancelSlotInvite(roundOverride?: string) {
    const round = roundOverride || slotInviteRound;
    if (!round) return;
    setSlotInviteCancelBusy(true);
    setInterviewsError(null);
    setInterviewsNotice(null);
    try {
      const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/interview-slots/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round_type: round }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setInterviewsNotice("Slot invite cancelled. You can send a new invite now.");
      setSlotInviteRound(null);
      await refreshActiveSlotInvites();
    } catch (e: any) {
      setInterviewsError(e?.message || "Could not cancel slot invite.");
    } finally {
      setSlotInviteCancelBusy(false);
    }
  }

  useEffect(() => {
    if (interviews === null) {
      void refreshInterviews();
    }
  }, [interviews]);

  useEffect(() => {
    void refreshActiveSlotInvites();
  }, [candidateId]);

  useEffect(() => {
    if (candidateSprints === null) {
      void refreshSprints();
    }
  }, [candidateSprints]);
  useEffect(() => {
    if (activeSprints.length > 0 && lastSprintNotice) {
      setLastSprintNotice(null);
    }
  }, [activeSprints, lastSprintNotice]);

  useEffect(() => {
    if (candidateOffers === null) {
      void refreshOffers();
    }
  }, [candidateOffers]);

  useEffect(() => {
    if (joiningDocs === null) {
      void refreshJoiningDocs();
    }
  }, [joiningDocs]);

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
      fetchSlotPreview(scheduleInterviewer, slotPreviewDate)
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
    if (!l2OwnerOpen) return;
    const q = l2OwnerQuery.trim();
    if (!q) {
      setL2OwnerOptions([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setL2OwnerLoading(true);
      fetchPeople(q)
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

  useEffect(() => {
    if (!scheduleOpen) return;
    const node = schedulePanelRef.current;
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scheduleOpen]);

  useEffect(() => {
    setSelectedSlot(null);
  }, [scheduleRound]);

  const stageButtons = useMemo<StageButton[]>(() => {
    const current = currentStageKey;
    if (cafLocked && current && current !== "rejected" && current !== "declined" && current !== "hired") {
      return [
        {
          label: "Reject (CAF pending)",
          tone: "bg-rose-600 hover:bg-rose-700",
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
          tone: "bg-emerald-600 hover:bg-emerald-700",
          icon: <CheckCircle2 className="h-4 w-4" />,
          intent: "advance",
          action: () => handleTransition("l2_shortlist", "advance"),
        },
        {
          label: "Reject after HR screening",
          tone: "bg-rose-600 hover:bg-rose-700",
          icon: <XCircle className="h-4 w-4" />,
          intent: "reject",
          action: () => handleTransition("rejected", "reject"),
        },
        {
          label: "Review screening",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <Layers className="h-4 w-4" />,
          intent: "review",
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
          intent: "advance",
          disabled: !candidate.l2_owner_email,
          action: () => handleTransition("hr_screening", "advance"),
        },
        {
          label: "Reject",
          tone: "bg-rose-600 hover:bg-rose-700",
          icon: <XCircle className="h-4 w-4" />,
          intent: "reject",
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
        intent: "advance",
        action: () => handleTransition("l2_interview", "advance"),
      });
      if (canSchedule) {
        actions.push({
          label: "Schedule L2 interview",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <CheckCircle2 className="h-4 w-4" />,
          intent: "review",
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
        intent: "review",
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
          intent: "advance",
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
        intent: "review",
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
          intent: "advance",
          action: () => handleTransition("sprint", "advance"),
        },
        {
          label: "Reject after L2 feedback",
          tone: "bg-rose-600 hover:bg-rose-700",
          icon: <XCircle className="h-4 w-4" />,
          intent: "reject",
          action: () => handleTransition("rejected", "reject"),
        },
        {
          label: "Go to interviews",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <Layers className="h-4 w-4" />,
          intent: "review",
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
          intent: "advance",
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
        intent: "review",
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
        intent: "advance",
        action: () => handleTransition("l1_interview", "advance"),
      });
      if (canSchedule) {
        actions.push({
          label: "Schedule L1 interview",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <CheckCircle2 className="h-4 w-4" />,
          intent: "review",
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
        intent: "review",
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
          intent: "advance",
          action: () => handleTransition("offer", "advance"),
        },
        {
          label: "Reject after L1 feedback",
          tone: "bg-rose-600 hover:bg-rose-700",
          icon: <XCircle className="h-4 w-4" />,
          intent: "reject",
          action: () => handleTransition("rejected", "reject"),
        },
        {
          label: "Go to interviews",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <Layers className="h-4 w-4" />,
          intent: "review",
          action: () => focusSection("interviews", interviewsRef),
        },
      ];
    }
    if (current === "sprint") {
      const actions: StageButton[] = [];
      if (hasSubmittedSprint) {
        actions.push({
          label: "Advance to L1 shortlist",
          tone: "bg-emerald-600 hover:bg-emerald-700",
          icon: <CheckCircle2 className="h-4 w-4" />,
          intent: "advance",
          action: () => handleTransition("l1_shortlist", "advance"),
        });
      }
      actions.push(
        {
          label: "Assign sprint",
          tone: "bg-emerald-600 hover:bg-emerald-700",
          icon: <CheckCircle2 className="h-4 w-4" />,
          intent: "advance",
          disabled: sprintAssignDisabled,
          action: () => {
            focusSection("sprint", sprintRef);
            void openAssignSprint();
          },
        },
        {
          label: "Go to sprint",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <Layers className="h-4 w-4" />,
          intent: "review",
          action: () => focusSection("sprint", sprintRef),
        }
      );
      return actions;
    }
    if (current === "offer") {
      return [
        {
          label: "Go to offer",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <Layers className="h-4 w-4" />,
          intent: "review",
          action: () => focusSection("offer", offerRef),
        },
      ];
    }
    if (current === "joining_documents") {
      return [
        {
          label: "Go to documents",
          tone: "bg-slate-900 hover:bg-slate-800",
          icon: <Layers className="h-4 w-4" />,
          intent: "review",
          action: () => focusSection("documents", documentsRef),
        },
      ];
    }
    return [];
  }, [currentStageKey, canSchedule, focusSection, openSchedule, openAssignSprint, screeningRef, documentsRef, cafLocked, candidate.l2_owner_email, sprintAssignDisabled, hasSubmittedSprint]);

  const screening = data.screening as Screening | null | undefined;
  const assessment = data.assessment as CandidateAssessment | null | undefined;
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
  const interviewTaken = useMemo(
    () => interviewPast.filter((item) => interviewStatusValue(item) === "taken"),
    [interviewPast]
  );
  const interviewNotTaken = useMemo(
    () => interviewPast.filter((item) => interviewStatusValue(item) === "not_taken"),
    [interviewPast]
  );
  const interviewPastOther = useMemo(
    () => interviewPast.filter((item) => !["taken", "not_taken"].includes(interviewStatusValue(item))),
    [interviewPast]
  );
  const latestOffer = candidateOffers && candidateOffers.length > 0 ? candidateOffers[0] : null;
  const stageProgressSteps = useMemo(() => {
    const hasStage = (key: string) => data.stages.some((stage) => normalizeStage(stage.stage_name) === key);
    const status = (candidate.status || "").toLowerCase();
    const offerStatus = (latestOffer?.offer_status || "").toLowerCase();
    const isDeclined = status === "declined" || offerStatus === "declined" || hasStage("declined");
    const isRejected = status === "rejected" || hasStage("rejected");
    const isAccepted = offerStatus === "accepted" || hasStage("joining_documents") || hasStage("hired") || status === "hired";

    let steps = [...pipelineStages];
    if (isRejected) {
      steps = [...steps, ...postRejectStages];
    } else if (isDeclined) {
      steps = [...steps, ...postDeclineStages];
    } else if (isAccepted) {
      steps = [...steps, ...postAcceptanceStages];
    }

    return steps
      .map((key) => stageOrder.find((stage) => stage.key === key))
      .filter((step): step is { key: string; label: string } => Boolean(step));
  }, [candidate.status, data.stages, latestOffer?.offer_status]);

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
                        {cafSentAt ? <p>Sent: {formatDateTime(candidate.caf_sent_at)}</p> : null}
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
                          setL2OwnerSelected(null);
                          setL2OwnerQuery(e.target.value);
                        }}
                        onFocus={() => setL2OwnerOpen(true)}
                        onBlur={() => window.setTimeout(() => setL2OwnerOpen(false), 150)}
                        className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                        placeholder="Type name or email"
                      />
                      {l2OwnerLoading ? (
                        <div className="absolute right-3 top-2 text-xs text-slate-500">Searching…</div>
                      ) : null}
                      {!l2OwnerSelected && l2OwnerOpen && l2OwnerOptions.length > 0 ? (
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
                      onClick={() => void handleSaveL2Owner()}
                      disabled={l2OwnerSaving}
                    >
                      {l2OwnerSaving ? "Saving..." : "Save"}
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
                </div>
                <div>
                  <p className="text-xs uppercase tracking-tight text-slate-500">Stage progress</p>
                  <div className="stage-rail mt-3 rounded-2xl border border-white/70 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      {stageProgressSteps.map((step, idx) => {
                        const state = stageStateKey(data.stages, currentStageKey, step.key);
                        const stageRow = findStage(data.stages, step.key);
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
                  <p className="mt-3 text-sm text-slate-600">Use the action buttons above to jump into the next step.</p>
                )}
                    {!candidate.l2_owner_email && currentStageKey === "enquiry" ? (
                      <p className="mt-2 text-xs text-amber-700">Assign GL/L2 email to unlock HR screening.</p>
                    ) : null}

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
                    </div>

                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                        <p className="text-xs uppercase tracking-tight text-slate-500">Relocation</p>
                        <p className="mt-1 text-sm font-semibold">
                          {screening.willing_to_relocate == null ? "?" : screening.willing_to_relocate ? "Yes" : "No"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                        <p className="text-xs uppercase tracking-tight text-slate-500">Notes / questions</p>
                        <p className="mt-1 text-sm text-slate-700">{candidate.questions_from_candidate || "-"}</p>
                        <p className="mt-2 text-xs text-slate-600">{screening.screening_notes || ""}</p>
                      </div>
                      </div>
                    </div>
                  )}

                  {!assessment ? (
                    <div className="mt-4 rounded-2xl border border-white/60 bg-white/30 p-6">
                      <p className="text-sm font-semibold">CAF assessment form</p>
                      <p className="mt-1 text-sm text-slate-600">No CAF assessment data submitted yet.</p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-white/60 bg-white/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">CAF assessment form</p>
                        <Chip className={assessment.assessment_submitted_at ? chipTone("green") : chipTone("amber")}>
                          {assessment.assessment_submitted_at ? "Submitted" : "Pending"}
                        </Chip>
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-3">
                        <Metric label="Position" value={valueOrDash(assessment.position_applied_for)} />
                        <Metric label="Employer" value={valueOrDash(assessment.current_employer)} />
                        <Metric label="Relevant exp" value={valueOrDash(assessment.relevant_experience_years)} />
                        <Metric label="Architecture exp" value={valueOrDash(assessment.architecture_interior_experience_years)} />
                        <Metric label="Personal email" value={valueOrDash(assessment.personal_email)} />
                        <Metric label="Contact" value={valueOrDash(assessment.contact_number)} />
                        <Metric label="Employment status" value={valueOrDash(assessment.current_employment_status)} />
                        <Metric
                          label="Notice period"
                          value={valueOrDash(assessment.notice_period_days ?? assessment.notice_period_or_joining_time)}
                        />
                        <Metric label="Current CTC" value={valueOrDash(assessment.current_ctc_annual)} />
                        <Metric label="Expected CTC" value={valueOrDash(assessment.expected_ctc_annual)} />
                        <Metric label="Current location" value={valueOrDash(assessment.current_location)} />
                        <Metric label="Interviewer" value={valueOrDash(assessment.interviewer_name)} />
                        <Metric label="Submitted" value={assessment.assessment_submitted_at ? formatDateTime(assessment.assessment_submitted_at) : "-"} />
                      </div>
                      {assessment.reason_for_job_change ? (
                        <div className="mt-3 rounded-2xl border border-white/60 bg-white/35 p-3">
                          <p className="text-xs uppercase tracking-tight text-slate-500">Reason for job change</p>
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{assessment.reason_for_job_change}</p>
                        </div>
                      ) : null}

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                          <p className="text-xs uppercase tracking-tight text-slate-500">Current job</p>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <Metric label="Duration (months)" value={valueOrDash(assessment.current_job_duration_months)} />
                            <Metric label="Organization" value={valueOrDash(assessment.current_job_org_name)} />
                          </div>
                          <p className="mt-2 text-xs text-slate-500">Role and responsibilities</p>
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.current_job_role_responsibilities)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                          <p className="text-xs uppercase tracking-tight text-slate-500">Previous job</p>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <Metric label="Duration (months)" value={valueOrDash(assessment.previous_job_duration_months)} />
                            <Metric label="Organization" value={valueOrDash(assessment.previous_job_org_name)} />
                          </div>
                          <p className="mt-2 text-xs text-slate-500">Role and responsibilities</p>
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.previous_job_role_responsibilities)}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                          <p className="text-xs uppercase tracking-tight text-slate-500">Education</p>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <Metric label="10th specialization" value={valueOrDash(assessment.education_10th_specialization)} />
                            <Metric label="10th year" value={valueOrDash(assessment.education_10th_year)} />
                            <Metric label="10th institution" value={valueOrDash(assessment.education_10th_institution)} />
                            <Metric label="10th marks" value={valueOrDash(assessment.education_10th_marks)} />
                            <Metric label="12th specialization" value={valueOrDash(assessment.education_12th_specialization)} />
                            <Metric label="12th year" value={valueOrDash(assessment.education_12th_year)} />
                            <Metric label="12th institution" value={valueOrDash(assessment.education_12th_institution)} />
                            <Metric label="12th marks" value={valueOrDash(assessment.education_12th_marks)} />
                            <Metric label="Graduation specialization" value={valueOrDash(assessment.education_graduation_specialization)} />
                            <Metric label="Graduation year" value={valueOrDash(assessment.education_graduation_year)} />
                            <Metric label="Graduation institution" value={valueOrDash(assessment.education_graduation_institution)} />
                            <Metric label="Graduation marks" value={valueOrDash(assessment.education_graduation_marks)} />
                            <Metric label="Post-grad specialization" value={valueOrDash(assessment.education_post_graduation_specialization)} />
                            <Metric label="Post-grad year" value={valueOrDash(assessment.education_post_graduation_year)} />
                            <Metric label="Post-grad institution" value={valueOrDash(assessment.education_post_graduation_institution)} />
                            <Metric label="Post-grad marks" value={valueOrDash(assessment.education_post_graduation_marks)} />
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                          <p className="text-xs uppercase tracking-tight text-slate-500">Training / certification</p>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <Metric label="Training 1" value={valueOrDash(assessment.training1_name)} />
                            <Metric label="Year" value={valueOrDash(assessment.training1_year)} />
                            <Metric label="Institute" value={valueOrDash(assessment.training1_institute)} />
                            <Metric label="Training 2" value={valueOrDash(assessment.training2_name)} />
                            <Metric label="Year" value={valueOrDash(assessment.training2_year)} />
                            <Metric label="Institute" value={valueOrDash(assessment.training2_institute)} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/60 bg-white/35 p-3">
                        <p className="text-xs uppercase tracking-tight text-slate-500">Technical proficiency (1 to 10)</p>
                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                          <Metric label="AutoCAD" value={valueOrDash(assessment.skill_auto_cad)} />
                          <Metric label="SketchUp" value={valueOrDash(assessment.skill_sketch_up)} />
                          <Metric label="Revit" value={valueOrDash(assessment.skill_revit)} />
                          <Metric label="Photoshop" value={valueOrDash(assessment.skill_photoshop)} />
                          <Metric label="Illustrator" value={valueOrDash(assessment.skill_illustrator)} />
                          <Metric label="MS Office" value={valueOrDash(assessment.skill_ms_office)} />
                          <Metric label="3D Max" value={valueOrDash(assessment.skill_3d_max)} />
                          <Metric label="InDesign" value={valueOrDash(assessment.skill_indesign)} />
                          <Metric label="Presentation" value={valueOrDash(assessment.skill_presentation)} />
                          <Metric label="Rhino" value={valueOrDash(assessment.skill_rhino)} />
                          <Metric label="BOQs" value={valueOrDash(assessment.skill_boqs)} />
                          <Metric label="Analytical writing" value={valueOrDash(assessment.skill_analytical_writing)} />
                          <Metric label="Graphics" value={valueOrDash(assessment.skill_graphics)} />
                          <Metric label="Drafting" value={valueOrDash(assessment.skill_drafting)} />
                          <Metric label="Hand sketching" value={valueOrDash(assessment.skill_hand_sketching)} />
                          <Metric label="Estimation" value={valueOrDash(assessment.skill_estimation)} />
                          <Metric label="Specifications" value={valueOrDash(assessment.skill_specifications)} />
                          <Metric label="Enscape" value={valueOrDash(assessment.skill_enscape)} />
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/60 bg-white/35 p-3">
                        <p className="text-xs uppercase tracking-tight text-slate-500">Generic work proficiency (1 to 10)</p>
                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                          <Metric label="Execution: action orientation" value={valueOrDash(assessment.proficiency_execution_action_orientation)} />
                          <Metric label="Execution: self discipline" value={valueOrDash(assessment.proficiency_execution_self_discipline)} />
                          <Metric label="Execution: independent decision" value={valueOrDash(assessment.proficiency_execution_independent_decision)} />
                          <Metric label="Process: time management" value={valueOrDash(assessment.proficiency_process_time_management)} />
                          <Metric label="Process: following processes" value={valueOrDash(assessment.proficiency_process_following_processes)} />
                          <Metric label="Process: new processes" value={valueOrDash(assessment.proficiency_process_new_processes)} />
                          <Metric label="Strategic: long term thinking" value={valueOrDash(assessment.proficiency_strategic_long_term_thinking)} />
                          <Metric label="Strategic: creativity" value={valueOrDash(assessment.proficiency_strategic_ideation_creativity)} />
                          <Metric label="Strategic: risk taking" value={valueOrDash(assessment.proficiency_strategic_risk_taking)} />
                          <Metric label="People: collaboration" value={valueOrDash(assessment.proficiency_people_collaboration)} />
                          <Metric label="People: coaching" value={valueOrDash(assessment.proficiency_people_coaching)} />
                          <Metric label="People: feedback" value={valueOrDash(assessment.proficiency_people_feedback)} />
                          <Metric label="People: conflict" value={valueOrDash(assessment.proficiency_people_conflict_resolution)} />
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                          <p className="text-xs uppercase tracking-tight text-slate-500">Reasons for ratings</p>
                          <p className="mt-2 text-xs font-semibold text-slate-600">Execution orientation</p>
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.proficiency_reason_execution)}</p>
                          <p className="mt-2 text-xs font-semibold text-slate-600">Process orientation</p>
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.proficiency_reason_process)}</p>
                          <p className="mt-2 text-xs font-semibold text-slate-600">Strategic orientation</p>
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.proficiency_reason_strategic)}</p>
                          <p className="mt-2 text-xs font-semibold text-slate-600">People orientation</p>
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.proficiency_reason_people)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                          <p className="text-xs uppercase tracking-tight text-slate-500">Self awareness</p>
                          <p className="mt-2 text-xs font-semibold text-slate-600">Strengths</p>
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.self_strengths)}</p>
                          <p className="mt-2 text-xs font-semibold text-slate-600">Improvement areas</p>
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.self_improvement_areas)}</p>
                          <p className="mt-2 text-xs font-semibold text-slate-600">Learning needs</p>
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.self_learning_needs)}</p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/60 bg-white/35 p-3">
                        <p className="text-xs uppercase tracking-tight text-slate-500">Questions</p>
                        <p className="mt-2 text-xs font-semibold text-slate-600">Why Studio Lotus?</p>
                        <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.q1_why_studio_lotus)}</p>
                        <p className="mt-2 text-xs font-semibold text-slate-600">Project scale</p>
                        <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.q2_project_scale)}</p>
                        <p className="mt-2 text-xs font-semibold text-slate-600">Role and site experience</p>
                        <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.q3_role_site_experience)}</p>
                        <p className="mt-2 text-xs font-semibold text-slate-600">Inspired project</p>
                        <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.q4_inspired_project)}</p>
                        <p className="mt-2 text-xs font-semibold text-slate-600">Two year plan</p>
                        <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{valueOrDash(assessment.q5_two_year_plan)}</p>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                          <p className="text-xs uppercase tracking-tight text-slate-500">Reference 1</p>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <Metric label="Name" value={valueOrDash(assessment.reference1_name)} />
                            <Metric label="Contact" value={valueOrDash(assessment.reference1_contact)} />
                            <Metric label="Relationship" value={valueOrDash(assessment.reference1_relationship)} />
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/60 bg-white/35 p-3">
                          <p className="text-xs uppercase tracking-tight text-slate-500">Reference 2</p>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <Metric label="Name" value={valueOrDash(assessment.reference2_name)} />
                            <Metric label="Contact" value={valueOrDash(assessment.reference2_contact)} />
                            <Metric label="Relationship" value={valueOrDash(assessment.reference2_relationship)} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/60 bg-white/35 p-3">
                        <p className="text-xs uppercase tracking-tight text-slate-500">Declaration</p>
                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                          <Metric label="Name" value={valueOrDash(assessment.declaration_name)} />
                          <Metric label="Signature" value={valueOrDash(assessment.declaration_signature)} />
                          <Metric label="Date" value={assessment.declaration_date ? formatDate(assessment.declaration_date) : "-"} />
                          <Metric label="Accepted" value={yesNo(assessment.declaration_accepted)} />
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
                  {candidate.resume_url ? (
                    <Link
                      href={candidate.resume_url}
                      target="_blank"
                      className="inline-flex items-center gap-2 rounded-xl bg-white/70 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Resume
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

                <div className="mt-4 border-t border-white/60 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Joining documents</p>
                    {joiningDocsNotice ? (
                      <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-500/20">
                        {joiningDocsNotice}
                      </span>
                    ) : null}
                  </div>
                  {joiningDocsError ? (
                    <div className="mt-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-700">
                      {joiningDocsError}
                    </div>
                  ) : null}
                  {joiningDocsBusy && !joiningDocs ? (
                    <div className="mt-3 text-sm text-slate-600">Loading joining documents...</div>
                  ) : null}
                  {joiningDocs && joiningDocs.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      {joiningDocs.map((doc) => (
                        <li key={doc.joining_doc_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/70 bg-white/60 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{joiningDocLabel(doc.doc_type)}</p>
                            <p className="truncate text-xs text-slate-500">{doc.file_name}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-500">{formatDateTime(doc.created_at)}</span>
                            <span className="rounded-full bg-white/80 px-2 py-1 text-xs text-slate-600">
                              {doc.uploaded_by === "candidate" ? "Candidate" : "HR"}
                            </span>
                            <Link
                              href={doc.file_url}
                              target="_blank"
                              className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Open
                            </Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : joiningDocs && !joiningDocs.length ? (
                    <p className="mt-3 text-sm text-slate-600">No joining documents uploaded yet.</p>
                  ) : null}

                  {canUploadJoiningDocs ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_1.7fr_auto]">
                      <select
                        className="w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-slate-800"
                        value={joiningDocType}
                        onChange={(event) => setJoiningDocType(event.target.value)}
                      >
                        {joiningDocOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <input
                        className="w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-slate-700"
                        type="file"
                        onChange={(event) => setJoiningDocFile(event.target.files?.[0] || null)}
                      />
                      <button
                        type="button"
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        onClick={() => void handleUploadJoiningDoc()}
                        disabled={!joiningDocFile || joiningDocsBusy}
                      >
                        {joiningDocsBusy ? "Uploading..." : "Upload"}
                      </button>
                    </div>
                  ) : null}
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
                {slotInviteRound ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <span>Slot invite already active for {slotInviteRound}. Cancel it to send a new one.</span>
                    <button
                      type="button"
                      onClick={() => {
                        void handleCancelSlotInvite();
                      }}
                      disabled={slotInviteCancelBusy}
                      className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                    >
                      {slotInviteCancelBusy ? "Cancelling..." : "Cancel invite"}
                    </button>
                  </div>
                ) : null}
                {activeSlotInvites.length ? (
                  <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Active slot invites</p>
                    {activeSlotInvites.map((invite) => (
                      <div key={invite.round_type} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {invite.round_type} slots active{invite.expires_at ? ` · Expires ${formatInviteExpiry(invite.expires_at)}` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            void handleCancelSlotInvite(invite.round_type);
                          }}
                          disabled={slotInviteCancelBusy}
                          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {slotInviteCancelBusy ? "Cancelling..." : "Cancel invite"}
                        </button>
                      </div>
                    ))}
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
                              {isNotTaken(item) ? <Chip className={chipTone("amber")}>Interview not taken</Chip> : null}
                              {isCancelled(item) ? <Chip className={chipTone("red")}>Cancelled</Chip> : null}
                            </div>
                            {(canSchedule || canCancelInterview) && !isCancelled(item) ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {canSchedule ? (
                                  <button
                                    type="button"
                                    className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
                                    onClick={() => {
                                      setInterviewsError(null);
                                      openSchedule(item.round_type || "L2", item.candidate_interview_id);
                                      setInterviewsNotice("Rescheduling interview: pick a new slot to replace the existing one.");
                                    }}
                                    disabled={busy}
                                  >
                                    Reschedule
                                  </button>
                                ) : null}
                                {canCancelInterview ? (
                                  <button
                                    type="button"
                                    className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                                      onClick={() => {
                                        if (!window.confirm("Cancel this interview? This will remove it from the interviewer calendar.")) return;
                                        const reason = window.prompt("Reason for cancelling this interview (required):", "");
                                        if (!reason || !reason.trim()) {
                                          setInterviewsError("Cancellation requires a reason.");
                                          return;
                                        }
                                        void (async () => {
                                          setBusy(true);
                                          setInterviewsError(null);
                                          setInterviewsNotice(null);
                                          try {
                                            await cancelInterview(item.candidate_interview_id, reason.trim());
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
                                ) : null}
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
                        <>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Interview taken</p>
                            <div className="mt-2 space-y-2">
                              {interviewTaken.length === 0 ? (
                                <p className="text-sm text-slate-600">No interviews marked as taken.</p>
                              ) : (
                                interviewTaken.map((item) => (
                                  <div key={item.candidate_interview_id} className="rounded-2xl border border-white/60 bg-white/50 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="text-sm font-semibold">{item.round_type}</p>
                                        <p className="text-xs text-slate-600">{item.interviewer_name || item.interviewer_person_id_platform || "Interviewer"}</p>
                                      </div>
                                      <Chip className={chipTone("green")}>Interview taken</Chip>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                      <span>{formatDateTime(item.scheduled_start_at)}</span>
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
                                      {item.rating_overall ? <Chip className={chipTone("neutral")}>Overall {item.rating_overall}/5</Chip> : null}
                                      {(() => {
                                        const roundLabel = item.round_type.toLowerCase().includes("l1")
                                          ? "L1"
                                          : item.round_type.toLowerCase().includes("l2")
                                            ? "L2"
                                            : "Interview";
                                        return item.feedback_submitted ? (
                                          <Chip className={chipTone("green")}>{roundLabel} feedback submitted</Chip>
                                        ) : (
                                          <Chip className={chipTone("amber")}>{roundLabel} feedback pending</Chip>
                                        );
                                      })()}
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
                                        {item.round_type.toLowerCase().includes("l1") || item.round_type.toLowerCase().includes("l2") ? (
                                          <a
                                            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 underline decoration-dotted underline-offset-2"
                                            href={`${process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment"}/interviews/${encodeURIComponent(
                                              String(item.candidate_interview_id),
                                            )}`}
                                          >
                                            {item.round_type.toLowerCase().includes("l1") ? "Open L1 assessment" : "Open L2 assessment"}
                                          </a>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          <div className="mt-4">
                            <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Interview not taken</p>
                            <div className="mt-2 space-y-2">
                              {interviewNotTaken.length === 0 ? (
                                <p className="text-sm text-slate-600">No interviews marked as not taken.</p>
                              ) : (
                                interviewNotTaken.map((item) => (
                                  <div key={item.candidate_interview_id} className="rounded-2xl border border-white/60 bg-white/50 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="text-sm font-semibold">{item.round_type}</p>
                                        <p className="text-xs text-slate-600">{item.interviewer_name || item.interviewer_person_id_platform || "Interviewer"}</p>
                                      </div>
                                      <Chip className={chipTone("amber")}>Interview not taken</Chip>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                      <span>{formatDateTime(item.scheduled_start_at)}</span>
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
                                    </div>
                                    {canSchedule ? (
                                      <button
                                        type="button"
                                        className="mt-3 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
                                        onClick={() => {
                                          setInterviewsError(null);
                                          openSchedule(item.round_type || "L2", item.candidate_interview_id);
                                          setInterviewsNotice("Rescheduling interview: pick a new slot to replace the existing one.");
                                        }}
                                        disabled={busy}
                                      >
                                        Reschedule interview
                                      </button>
                                    ) : null}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {interviewPastOther.length > 0 ? (
                            <div className="mt-4">
                              <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Other past interviews</p>
                              <div className="mt-2 space-y-2">
                                {interviewPastOther.map((item) => (
                                  <div key={item.candidate_interview_id} className="rounded-2xl border border-white/60 bg-white/50 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="text-sm font-semibold">{item.round_type}</p>
                                        <p className="text-xs text-slate-600">{item.interviewer_name || item.interviewer_person_id_platform || "Interviewer"}</p>
                                      </div>
                                      <Chip className={decisionTone(item.decision)}>{item.decision || "No decision"}</Chip>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                      <span>{formatDateTime(item.scheduled_start_at)}</span>
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
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </>
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
                  <p className="text-xs uppercase tracking-tight text-slate-500">
                    {rescheduleInterviewId ? "Reschedule interview" : "Schedule interview"}
                  </p>
                  <h3 className="text-lg font-semibold">Round: {scheduleRound}</h3>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                  onClick={() => {
                    setScheduleOpen(false);
                    setRescheduleInterviewId(null);
                  }}
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
                      disabled={!!rescheduleInterviewId}
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
                          disabled={!!rescheduleInterviewId}
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
                      <p className="text-[11px] text-slate-500">6 slots • 1 hour • 3 business days</p>
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

                <p className="text-[11px] text-slate-500">Select a slot from the planner to schedule the interview.</p>

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
                {rescheduleInterviewId ? (
                  <label className="space-y-1 text-xs text-slate-600">
                    Reschedule reason
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                      value={scheduleReason}
                      onChange={(e) => setScheduleReason(e.target.value)}
                      placeholder="Reason for reschedule"
                    />
                  </label>
                ) : null}
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
                  onClick={() => {
                    setScheduleOpen(false);
                    setRescheduleInterviewId(null);
                  }}
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
                  {interviewsBusy ? "Saving..." : rescheduleInterviewId ? "Reschedule interview" : "Schedule interview"}
                </button>
              </div>
            </div>
          ) : null}

          {assignOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
              <div className="w-full max-w-3xl rounded-3xl border border-white/20 bg-white/95 p-6 shadow-xl">
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
                      onChange={(e) => void handleTemplateSelect(e.target.value)}
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

                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-700">
                    <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Email preview</p>
                    {templatePreviewBusy ? (
                      <p className="mt-2 text-sm text-slate-600">Loading preview...</p>
                    ) : templatePreview ? (
                      <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div
                          className="max-h-[520px] overflow-auto p-4"
                          dangerouslySetInnerHTML={{ __html: sprintEmailPreviewHtml }}
                        />
                        <div className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500">
                          The sprint link activates after assignment.
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">Select a template to preview the brief and attachments.</p>
                    )}
                    {templatePreviewError ? (
                      <div className="mt-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-700">
                        {templatePreviewError}
                      </div>
                    ) : null}
                  </div>
                </div>

                {sprintsError ? (
                  <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-700">
                    {sprintsError}
                  </div>
                ) : null}

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
                    disabled={sprintsBusy || sprintAssignDisabled}
                  >
                    {sprintsBusy ? "Assigning..." : "Assign sprint"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div ref={sprintRef} className="section-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-tight text-slate-500">Sprint</p>
                {hasSubmittedSprint ? <Chip className={chipTone("amber")}>Submitted</Chip> : null}
              </div>
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
                  ) : activeSprints.length > 0 ? (
                    activeSprints.map((sprint) => {
                      const summary = stripHtml(sprint.template_description);
                      const attachments = sprint.attachments || [];
                      return (
                        <div key={sprint.candidate_sprint_id} className="rounded-2xl border border-white/60 bg-white/30 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold">{sprint.template_name || "Sprint assignment"}</p>
                                {sprint.template_code ? (
                                  <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                    {sprint.template_code}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs text-slate-600">{summary || "No brief text provided."}</p>
                            </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip className={chipTone(sprint.status === "submitted" ? "amber" : sprint.status === "completed" ? "green" : "neutral")}>
                              {sprint.status.replace("_", " ")}
                            </Chip>
                            {canSkip ? (
                              <button
                                type="button"
                                className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                onClick={() => void handleDeleteSprint(sprint.candidate_sprint_id)}
                                disabled={sprintDeleteBusy}
                              >
                                {sprintDeleteBusy ? "Deleting..." : "Delete sprint"}
                              </button>
                            ) : null}
                          </div>
                          </div>
                          <div className="mt-3 grid gap-2 md:grid-cols-4">
                            <Metric label="Assigned" value={formatDateTime(sprint.assigned_at)} />
                            <Metric label="Due" value={sprint.due_at ? formatDateTime(sprint.due_at) : "-"} />
                            <Metric label="Status" value={formatRelativeDue(sprint.due_at)} />
                            <Metric label="Submitted" value={sprint.submitted_at ? formatDateTime(sprint.submitted_at) : "-"} />
                          </div>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            <div className="rounded-xl border border-white/60 bg-white/60 p-3">
                              <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Links</p>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                                {sprint.public_token && sprint.status !== "submitted" ? (
                                  <a
                                    className="inline-flex items-center gap-1 text-slate-800 underline decoration-dotted underline-offset-2"
                                    href={`${basePath}/sprint/${encodeURIComponent(sprint.public_token)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" /> Open sprint page
                                  </a>
                                ) : sprint.status === "submitted" ? (
                                  <span className="text-xs text-slate-500">Public sprint link expired after submission.</span>
                                ) : null}
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
                                    <ExternalLink className="h-3.5 w-3.5" /> Submission file
                                  </a>
                                ) : (
                                  <span className="text-xs text-slate-500">No submission yet.</span>
                                )}
                              </div>
                            </div>
                            <div className="rounded-xl border border-white/60 bg-white/60 p-3">
                              <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Attachments</p>
                              {attachments.length > 0 ? (
                                <div className="mt-2 space-y-1 text-xs text-slate-700">
                                  {attachments.map((attachment) => (
                                    <a
                                      key={attachment.sprint_attachment_id}
                                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white/80 px-2 py-1 underline decoration-dotted underline-offset-2"
                                      href={`/api/rec/sprints/${encodeURIComponent(
                                        String(sprint.candidate_sprint_id)
                                      )}/attachments/${encodeURIComponent(String(attachment.sprint_attachment_id))}`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <span className="truncate">{attachment.file_name}</span>
                                      <span className="text-slate-500">{formatBytes(attachment.file_size)}</span>
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-2 text-xs text-slate-500">No attachments available.</p>
                              )}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            {sprint.score_overall != null ? <Chip className={chipTone("blue")}>Score {sprint.score_overall}</Chip> : null}
                            {sprint.decision ? <Chip className={decisionTone(sprint.decision)}>{sprint.decision.replace("_", " ")}</Chip> : null}
                          </div>
                        </div>
                      );
                    })
                  ) : lastSprintNotice ? (
                    <div className="rounded-2xl border border-white/60 bg-white/30 p-4 text-sm text-slate-600">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{lastSprintNotice.template_name || "Sprint assignment"}</p>
                          {lastSprintNotice.template_code ? (
                            <p className="mt-1 text-xs text-slate-500">Code: {lastSprintNotice.template_code}</p>
                          ) : null}
                        </div>
                        <Chip className={chipTone("neutral")}>Deleted</Chip>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-3">
                        <Metric label="Assigned" value={lastSprintNotice.assigned_at ? formatDateTime(lastSprintNotice.assigned_at) : "-"} />
                        <Metric label="Due" value={lastSprintNotice.due_at ? formatDateTime(lastSprintNotice.due_at) : "-"} />
                        <Metric
                          label="Deleted"
                          value={lastSprintNotice.deleted_at ? formatDateTime(lastSprintNotice.deleted_at) : "-"}
                        />
                      </div>
                    </div>
                  ) : currentStageKey === "sprint" ? (
                    <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-500/5 p-4">
                      <p className="text-sm font-semibold text-amber-700">Sprint stage active</p>
                      <p className="mt-1 text-sm text-amber-700">Assign a sprint template to share the brief with the candidate.</p>
                      <button
                        type="button"
                        className={clsx(
                          "mt-3 rounded-full px-4 py-2 text-xs font-semibold text-white",
                          sprintAssignDisabled ? "bg-slate-400 cursor-not-allowed" : "bg-amber-500 hover:bg-amber-600"
                        )}
                        onClick={() => void openAssignSprint()}
                        disabled={sprintAssignDisabled}
                      >
                        Assign sprint
                      </button>
                      {sprintAssignDisabled ? (
                        <p className="mt-2 text-xs text-slate-500">Sprint already assigned. Only superadmin can reassign.</p>
                      ) : null}
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
                      {canSkip && ["approved", "sent", "viewed"].includes(latestOffer.offer_status) ? (
                        <>
                          <button
                            type="button"
                            className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                            onClick={() => void handleAdminDecision(latestOffer.candidate_offer_id, "accept")}
                            disabled={offersBusy}
                          >
                            Mark accepted
                          </button>
                          <button
                            type="button"
                            className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                            onClick={() => void handleAdminDecision(latestOffer.candidate_offer_id, "decline")}
                            disabled={offersBusy}
                          >
                            Mark declined
                          </button>
                        </>
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
