import { CandidateStage, Interview } from "@/lib/types";
import { parseDateUtc } from "@/lib/datetime";

export const stageOrder = [
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

export const pipelineStages = [
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

export const postAcceptanceStages = ["joining_documents", "hired"];
export const postDeclineStages = ["declined"];
export const postRejectStages = ["rejected"];

export const skipStageOptions = [
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

export const joiningDocOptions = [
  { value: "pan", label: "PAN card" },
  { value: "aadhaar", label: "Aadhaar card" },
  { value: "marksheets", label: "Marksheets" },
  { value: "experience_letters", label: "Experience letters" },
  { value: "salary_slips", label: "Salary slips" },
  { value: "other", label: "Other documents" },
];

export const requiredJoiningDocTypes = ["pan", "aadhaar", "marksheets", "experience_letters", "salary_slips"] as const;

export function normalizeStage(raw?: string | null) {
  const s = (raw || "").trim().toLowerCase();
  if (!s) return null;
  const normalized = s.replace(/\s+/g, "_");
  if (normalized === "caf") return "hr_screening";
  if (normalized === "l2") return "l2_interview";
  if (normalized === "l1") return "l1_interview";
  return normalized;
}

export function normalizeOfferStatus(raw?: string | null) {
  return (raw || "").trim().toLowerCase();
}

export function stageLabel(raw?: string | null) {
  const key = normalizeStage(raw);
  if (!key) return "?";
  return stageOrder.find((s) => s.key === key)?.label || key.split("_").join(" ");
}

export function formatDateTime(raw?: string | null) {
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

export function formatInviteExpiry(raw?: string | null) {
  if (!raw) return "No expiry";
  return formatDateTime(raw) || raw;
}

export function formatDate(raw?: string | null) {
  if (!raw) return "";
  const d = parseDateUtc(raw);
  if (!d) return "";
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { month: "short", day: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function formatRelativeDue(raw?: string | null) {
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

export function stripHtml(raw?: string | null) {
  if (!raw) return "";
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function chipTone(kind: "neutral" | "green" | "amber" | "red" | "blue") {
  if (kind === "green") return "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/20";
  if (kind === "amber") return "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/20";
  if (kind === "red") return "bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/20";
  if (kind === "blue") return "bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/20";
  return "bg-slate-500/10 text-slate-700 ring-1 ring-slate-500/15";
}

export function screeningTone(result?: string | null) {
  const r = (result || "").trim().toLowerCase();
  if (r === "green" || r === "low") return chipTone("green");
  if (r === "amber" || r === "medium") return chipTone("amber");
  if (r === "red" || r === "high") return chipTone("red");
  return chipTone("neutral");
}

export function screeningLabel(result?: string | null) {
  const r = (result || "").trim().toLowerCase();
  if (r === "green" || r === "low") return "Low";
  if (r === "amber" || r === "medium") return "Medium";
  if (r === "red" || r === "high") return "High";
  return null;
}

export function docTone(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (s === "complete") return chipTone("green");
  if (s === "partial") return chipTone("amber");
  if (s === "none") return chipTone("neutral");
  return chipTone("neutral");
}

export function statusTone(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (s === "rejected" || s === "declined") return chipTone("red");
  if (s === "hired") return chipTone("green");
  if (s === "offer") return chipTone("blue");
  return chipTone("neutral");
}

export function decisionTone(decision?: string | null) {
  const d = (decision || "").toLowerCase();
  if (d === "advance") return chipTone("green");
  if (d === "reject") return chipTone("red");
  if (d === "keep_warm") return chipTone("amber");
  if (d === "cancelled") return chipTone("red");
  return chipTone("neutral");
}

export function findStage(stages: CandidateStage[], stageName: string) {
  const target = stageName.toLowerCase();
  return stages.find((s) => normalizeStage(s.stage_name) === target) || null;
}

export function stageStateKey(stages: CandidateStage[], currentKey: string | null, stepKey: string) {
  if (!currentKey) return "future";
  if (stepKey === currentKey) return "current";
  const currentIndex = stageOrder.findIndex((s) => s.key === currentKey);
  const stepIndex = stageOrder.findIndex((s) => s.key === stepKey);
  if (currentIndex === -1 || stepIndex === -1) return "future";
  return stepIndex < currentIndex ? "done" : "future";
}

export function bestEffortFromMeta(meta: Record<string, unknown>, key: string) {
  const value = meta[key];
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeJoiningDocType(raw?: string | null): string | null {
  const value = String(raw || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!value) return null;
  if (value === "aadhar") return "aadhaar";
  if (value === "mark_sheet" || value === "mark_sheets") return "marksheets";
  if (value === "experience_letter" || value === "experienceletters") return "experience_letters";
  if (value === "salary_slip" || value === "salaryslip") return "salary_slips";
  return value;
}

export function joiningDocLabel(value: string) {
  return joiningDocOptions.find((doc) => doc.value === value)?.label || value.replace(/_/g, " ");
}

export function documentPreviewPath(candidateId: string, kind: "cv" | "resume" | "portfolio") {
  return `/candidates/${encodeURIComponent(candidateId)}/documents/${encodeURIComponent(kind)}`;
}

export function formatMoney(raw?: number | null) {
  if (raw === null || raw === undefined) return "?";
  try {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(raw);
  } catch {
    return String(raw);
  }
}

export function formatBytes(raw?: number | null) {
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

export function valueOrDash(value?: string | number | null) {
  if (value === null || value === undefined) return "-";
  const text = String(value).trim();
  return text ? text : "-";
}

export function yesNo(value?: boolean | null) {
  if (value == null) return "-";
  return value ? "Yes" : "No";
}

export function suggestOfferTemplate(openingTitle?: string | null) {
  const title = (openingTitle || "").toLowerCase();
  if (!title) return "STD_OFFER";
  if (title.includes("architect")) return "ARCH_L2_STD";
  if (title.includes("interior") || title.includes("id ")) return "ID_JUNIOR_STD";
  return "STD_OFFER";
}

export function cleanLetterOverrides(raw: Record<string, string>) {
  const cleaned: Record<string, string> = {};
  Object.entries(raw).forEach(([key, value]) => {
    const trimmed = value.trim();
    if (trimmed) cleaned[key] = trimmed;
  });
  return cleaned;
}

export function isCancelledInterview(item: Interview) {
  if ((item.decision || "").toLowerCase() === "cancelled") return true;
  const note = (item.notes_internal || "").toLowerCase();
  return note.includes("cancelled by superadmin");
}

export function interviewStatusValue(item: Interview) {
  return (item.interview_status || "").toLowerCase();
}

export function isNotTakenInterview(item: Interview) {
  return interviewStatusValue(item) === "not_taken";
}
