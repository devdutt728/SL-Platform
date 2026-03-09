export type RecruitmentStageKey =
  | "enquiry"
  | "hr_screening"
  | "l2_shortlist"
  | "l2_interview"
  | "l2_feedback"
  | "sprint"
  | "l1_shortlist"
  | "l1_interview"
  | "l1_feedback"
  | "offer"
  | "joining_documents"
  | "hired"
  | "declined"
  | "rejected";

export type RecruitmentStageGroup = "pipeline" | "post_offer" | "outcome";

export type RecruitmentStageMeta = {
  key: RecruitmentStageKey;
  label: string;
  group: RecruitmentStageGroup;
  isTerminal?: boolean;
  isNegative?: boolean;
};

export const recruitmentStageOrder: RecruitmentStageMeta[] = [
  { key: "enquiry", label: "Enquiry", group: "pipeline" },
  { key: "hr_screening", label: "HR screening", group: "pipeline" },
  { key: "l2_shortlist", label: "L2 shortlist", group: "pipeline" },
  { key: "l2_interview", label: "L2 interview", group: "pipeline" },
  { key: "l2_feedback", label: "L2 feedback", group: "pipeline" },
  { key: "sprint", label: "Sprint", group: "pipeline" },
  { key: "l1_shortlist", label: "L1 shortlist", group: "pipeline" },
  { key: "l1_interview", label: "L1 interview", group: "pipeline" },
  { key: "l1_feedback", label: "L1 feedback", group: "pipeline" },
  { key: "offer", label: "Offer", group: "pipeline" },
  { key: "joining_documents", label: "Joining documents", group: "post_offer" },
  { key: "hired", label: "Hired", group: "outcome", isTerminal: true },
  { key: "declined", label: "Declined", group: "outcome", isTerminal: true, isNegative: true },
  { key: "rejected", label: "Rejected", group: "outcome", isTerminal: true, isNegative: true },
];

const stageMap = new Map(recruitmentStageOrder.map((item) => [item.key, item]));

export const recruitmentPipelineStageKeys = recruitmentStageOrder.filter((item) => item.group === "pipeline").map((item) => item.key);
export const recruitmentPostOfferStageKeys = recruitmentStageOrder
  .filter((item) => item.group === "post_offer")
  .map((item) => item.key);
export const recruitmentOutcomeStageKeys = recruitmentStageOrder.filter((item) => item.group === "outcome").map((item) => item.key);

export function normalizeRecruitmentStage(raw?: string | null): RecruitmentStageKey | null {
  const value = (raw || "").trim().toLowerCase();
  if (!value) return null;
  const normalized = value.replace(/\s+/g, "_");
  if (normalized === "caf") return "hr_screening";
  if (normalized === "l2") return "l2_interview";
  if (normalized === "l1") return "l1_interview";
  if (stageMap.has(normalized as RecruitmentStageKey)) return normalized as RecruitmentStageKey;
  return null;
}

export function recruitmentStageLabel(raw?: string | null) {
  const key = normalizeRecruitmentStage(raw);
  if (!key) return raw || "";
  return stageMap.get(key)?.label || key.replace(/_/g, " ");
}

export function recruitmentStageMeta(raw?: string | null) {
  const key = normalizeRecruitmentStage(raw);
  if (!key) return null;
  return stageMap.get(key) || null;
}

export function defaultTransitionDecision(toStage: RecruitmentStageKey) {
  if (toStage === "rejected") return "reject";
  if (toStage === "declined") return "decline";
  if (toStage === "hired") return "hire";
  return "advance";
}

export function recruitmentSkipStageOptions() {
  return recruitmentStageOrder.map((item) => ({ value: item.key, label: item.label }));
}
