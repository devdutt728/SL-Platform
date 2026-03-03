"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { BriefcaseBusiness, CalendarCheck2, ClipboardCheck, FileDown, Loader2, UserRound } from "lucide-react";
import type { CandidateDetail, CandidateSprint, Interview, L2Assessment, OpeningListItem, Screening } from "@/lib/types";
import { parseDateUtc } from "@/lib/datetime";
import { OpeningRequestsWorkspace } from "./OpeningRequestsWorkspace";

type Props = {
  initialInterviews: Interview[];
  useMeFilter: boolean;
  initialOpenings: OpeningListItem[];
  currentUser?: {
    email?: string | null;
    person_id_platform?: string | null;
    full_name?: string | null;
  } | null;
  canRaiseOpeningRequests: boolean;
  canRaiseNewOpeningRequests: boolean;
  canApproveOpeningRequests: boolean;
  canManageOpeningRequests: boolean;
};

type AssessmentMode = "l1" | "l2";
type PortalTab = "assessments" | "opening_requests" | "sprint_reviews";
type L1Data = Record<string, any>;
type L2Data = Record<string, any>;
type SprintReviewForm = {
  score_overall: string;
  decision: string;
  comments_internal: string;
  comments_for_candidate: string;
};

const yesNoOptions = ["", "YES", "NO"];
const ratingOptions = ["", "1", "2", "3", "4", "5"];

const DEFAULT_L2_DATA: L2Data = {
  pre_interview: {
    candidate_name: "",
    team_lead: "",
    preferred_joining_date: "",
    two_year_commitment: "",
    on_site_timings: "",
    family_support: "",
    other_questions: "",
  },
  section1: {
    notes: "",
    assess_authenticity: "",
    assess_serious: "",
    assess_researched: "",
    assess_criteria: "",
    assess_aspirations: "",
    assess_expectations: "",
    manager_notes: "",
  },
  section2: {
    notes: "",
    assess_role_clear: "",
    assess_strengths: "",
    assess_expectations: "",
    assess_fit: "",
    manager_notes: "",
  },
  section3: {
    notes: "",
    assess_flexibility: "",
    interest_area: "",
    assess_expectations: "",
    manager_notes: "",
  },
  section4: {
    notes: "",
    ratings: {
      execution_action: "",
      execution_discipline: "",
      execution_decision: "",
      process_time: "",
      process_follow: "",
      process_create: "",
      strategic_futuristic: "",
      strategic_ideation: "",
      strategic_risk: "",
      people_collaboration: "",
      people_coaching: "",
      people_feedback: "",
      people_conflict: "",
    },
    manager_notes: "",
  },
  section5: {
    notes: "",
    ratings: {
      self_awareness: "",
      openness: "",
      mastery: "",
    },
    manager_notes: "",
  },
  section6: {
    notes: "",
    key_strengths: "",
    key_learning_needs: "",
    manager_notes: "",
  },
  section7: {
    assess_open_feedback: "",
    assess_coachable: "",
    assess_good_to_hire: "",
    l1_focus_notes: "",
  },
};

type FieldConfig = {
  label: string;
  path: string[];
  type: "text" | "textarea" | "yesno" | "rating";
};

const L2_SECTION_FIELDS: { title: string; fields: FieldConfig[] }[] = [
  {
    title: "HR Screening (Pre L2)",
    fields: [
      { label: "Candidate Name", path: ["pre_interview", "candidate_name"], type: "text" },
      { label: "Team Lead", path: ["pre_interview", "team_lead"], type: "text" },
      { label: "Preferred Date of Joining", path: ["pre_interview", "preferred_joining_date"], type: "text" },
      { label: "Min 2-year commitment response", path: ["pre_interview", "two_year_commitment"], type: "text" },
      { label: "On-site / Studio Timings / L-Connect", path: ["pre_interview", "on_site_timings"], type: "text" },
      { label: "Family supportive of relocation?", path: ["pre_interview", "family_support"], type: "text" },
      { label: "Other questions or doubts", path: ["pre_interview", "other_questions"], type: "textarea" },
    ],
  },
  {
    title: "Section 1: Why Studio Lotus? & Longevity",
    fields: [
      { label: "Interview notes", path: ["section1", "notes"], type: "textarea" },
      { label: "Authentic reasons for job change", path: ["section1", "assess_authenticity"], type: "yesno" },
      { label: "Serious about taking up the job", path: ["section1", "assess_serious"], type: "yesno" },
      { label: "Researched Studio Lotus", path: ["section1", "assess_researched"], type: "yesno" },
      { label: "Thoughtful criteria for choosing Studio Lotus", path: ["section1", "assess_criteria"], type: "yesno" },
      { label: "Clear future career aspirations", path: ["section1", "assess_aspirations"], type: "yesno" },
      { label: "Studio Lotus meets expectations", path: ["section1", "assess_expectations"], type: "yesno" },
      { label: "Hiring manager notes", path: ["section1", "manager_notes"], type: "textarea" },
    ],
  },
  {
    title: "Section 2: Functional Role Fitment",
    fields: [
      { label: "Interview notes", path: ["section2", "notes"], type: "textarea" },
      { label: "Clear on role being offered", path: ["section2", "assess_role_clear"], type: "yesno" },
      { label: "Shares strengths and learning needs", path: ["section2", "assess_strengths"], type: "yesno" },
      { label: "Set clear role expectations", path: ["section2", "assess_expectations"], type: "yesno" },
      { label: "Fit for the role being offered", path: ["section2", "assess_fit"], type: "yesno" },
      { label: "Hiring manager notes", path: ["section2", "manager_notes"], type: "textarea" },
    ],
  },
  {
    title: "Section 3: Expectations & Preferences",
    fields: [
      { label: "Interview notes", path: ["section3", "notes"], type: "textarea" },
      { label: "Flexible for multiple kinds of work", path: ["section3", "assess_flexibility"], type: "yesno" },
      { label: "Specific area of interest (if any)", path: ["section3", "interest_area"], type: "text" },
      { label: "Studio Lotus meets expectations", path: ["section3", "assess_expectations"], type: "yesno" },
      { label: "Hiring manager notes", path: ["section3", "manager_notes"], type: "textarea" },
    ],
  },
  {
    title: "Section 4: Leadership Competencies (1-5)",
    fields: [
      { label: "Execution - Action orientation", path: ["section4", "ratings", "execution_action"], type: "rating" },
      { label: "Execution - Self discipline", path: ["section4", "ratings", "execution_discipline"], type: "rating" },
      { label: "Execution - Independent decision", path: ["section4", "ratings", "execution_decision"], type: "rating" },
      { label: "Process - Time management", path: ["section4", "ratings", "process_time"], type: "rating" },
      { label: "Process - Following processes", path: ["section4", "ratings", "process_follow"], type: "rating" },
      { label: "Process - Creating processes", path: ["section4", "ratings", "process_create"], type: "rating" },
      { label: "Strategic - Futuristic thinking", path: ["section4", "ratings", "strategic_futuristic"], type: "rating" },
      { label: "Strategic - Ideation & creativity", path: ["section4", "ratings", "strategic_ideation"], type: "rating" },
      { label: "Strategic - Risk taking", path: ["section4", "ratings", "strategic_risk"], type: "rating" },
      { label: "People - Collaboration", path: ["section4", "ratings", "people_collaboration"], type: "rating" },
      { label: "People - Coaching", path: ["section4", "ratings", "people_coaching"], type: "rating" },
      { label: "People - Feedback", path: ["section4", "ratings", "people_feedback"], type: "rating" },
      { label: "People - Conflict resolution", path: ["section4", "ratings", "people_conflict"], type: "rating" },
      { label: "Interview notes", path: ["section4", "notes"], type: "textarea" },
      { label: "Hiring manager notes", path: ["section4", "manager_notes"], type: "textarea" },
    ],
  },
  {
    title: "Section 5: Self-awareness & Culture Fit (1-5)",
    fields: [
      { label: "Self-awareness", path: ["section5", "ratings", "self_awareness"], type: "rating" },
      { label: "Openness to feedback", path: ["section5", "ratings", "openness"], type: "rating" },
      { label: "Personal mastery & learning", path: ["section5", "ratings", "mastery"], type: "rating" },
      { label: "Interview notes", path: ["section5", "notes"], type: "textarea" },
      { label: "Hiring manager notes", path: ["section5", "manager_notes"], type: "textarea" },
    ],
  },
  {
    title: "Section 6: Strengths & Learning Needs",
    fields: [
      { label: "Key strengths", path: ["section6", "key_strengths"], type: "textarea" },
      { label: "Key learning needs", path: ["section6", "key_learning_needs"], type: "textarea" },
      { label: "Interview notes", path: ["section6", "notes"], type: "textarea" },
      { label: "Hiring manager notes", path: ["section6", "manager_notes"], type: "textarea" },
    ],
  },
  {
    title: "Section 7: Coachability & Decision",
    fields: [
      { label: "Open to feedback from previous managers", path: ["section7", "assess_open_feedback"], type: "yesno" },
      { label: "Candidate is coachable", path: ["section7", "assess_coachable"], type: "yesno" },
      { label: "Good to hire", path: ["section7", "assess_good_to_hire"], type: "yesno" },
      { label: "Anything specific for L1 to assess", path: ["section7", "l1_focus_notes"], type: "textarea" },
    ],
  },
];

const DEFAULT_L1_DATA: L1Data = {
  section1: {
    role_clarity: "",
    six_month_priorities: "",
    notes: "",
  },
  section2: {
    big_picture: "",
    notes: "",
  },
  section3: {
    authentic: "",
    manager_expectations: "",
    lotus_meet_expectations: "",
    notes: "",
  },
  section4: {
    high_potential: "",
    manager_notes: "",
  },
  section5: {
    good_to_hire: "",
    decision_comments: "",
  },
  section6: {
    closing_comments: "",
  },
};

const L1_SECTION_FIELDS: { title: string; fields: FieldConfig[] }[] = [
  {
    title: "Section 1: Role Clarity",
    fields: [
      { label: "Is the candidate clear on the role being offered'", path: ["section1", "role_clarity"], type: "yesno" },
      { label: "Is the candidate clear on the first 6 months' role priorities'", path: ["section1", "six_month_priorities"], type: "yesno" },
      { label: "Any other observations / notes?", path: ["section1", "notes"], type: "textarea" },
    ],
  },
  {
    title: "Section 2: Assess Big Picture Thinking",
    fields: [
      { label: "Does the candidate have big-picture thinking? Can the candidate answer 'Why' and think clearly?", path: ["section2", "big_picture"], type: "yesno" },
      { label: "Any other observations / notes?", path: ["section2", "notes"], type: "textarea" },
    ],
  },
  {
    title: "Section 3: Check Candidate's Culture Expectations",
    fields: [
      { label: "Does the candidate sound Authentic?", path: ["section3", "authentic"], type: "yesno" },
      { label: "Is the candidate able to share specific expectations of the to-be reporting manager?", path: ["section3", "manager_expectations"], type: "yesno" },
      { label: "Can Studio Lotus meet the candidate's expectations?", path: ["section3", "lotus_meet_expectations"], type: "yesno" },
      { label: "Any other observations / notes?", path: ["section3", "notes"], type: "textarea" },
    ],
  },
  {
    title: "High Potential Check",
    fields: [
      { label: "Does the candidate have a high potential?", path: ["section4", "high_potential"], type: "yesno" },
      { label: "Hiring manager notes", path: ["section4", "manager_notes"], type: "textarea" },
    ],
  },
  {
    title: "Hiring Manager's Decision",
    fields: [
      { label: "Is the candidate good to Hire?", path: ["section5", "good_to_hire"], type: "yesno" },
      { label: "Comments", path: ["section5", "decision_comments"], type: "textarea" },
    ],
  },
  {
    title: "Section 4: Before Closing out the interview",
    fields: [
      { label: "Feedback / Comments on Section 4", path: ["section6", "closing_comments"], type: "textarea" },
    ],
  },
];

const L1_AREAS = [
  "Check for Clarity of the Role being offered.",
  "Getting to know the candidate's key strengths & big picture thinking.",
  "Checking 'Why' or big picture thinking.",
  "Check for Culture Expectations and whether Studio Lotus can meet them?",
];

const HIGH_POTENTIAL_REFERENCE = [
  "Such candidates are comfortable in being themselves. They interact and express themselves freely.",
  "They are able to share their strengths, learning needs clearly i.e., they know themselves well.",
  "They are able to share their reasons for job change openly, be it because of their manager, the kind of work they wish to do or organisation level challenges they are experiencing.",
  "They seem to have a thoughtful criterion on what kind of organisation will be right for them to join next, and wait for it.",
  "They also evaluate the hiring organisation by asking questions for clarity on their role, culture preferences and future aspirations fitment.",
  "Mostly they are clear, upfront and specific in answering.",
  "They tend to seek feedback towards the end of the interview to gauge their positives and areas for improvement.",
  "They appreciate a detailed interaction to check the fitment. As they see, the hiring organisation is trying to understand them as a person.",
];

function cloneDefault(mode: AssessmentMode) {
  const base = mode === "l1" ? DEFAULT_L1_DATA : DEFAULT_L2_DATA;
  return typeof structuredClone === "function" ? structuredClone(base) : JSON.parse(JSON.stringify(base));
}

function formatDateTime(raw?: string | null) {
  if (!raw) return "";
  const d = parseDateUtc(raw);
  if (!d || Number.isNaN(d.getTime())) return raw || "";
  return d.toLocaleString("en-IN", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function interviewLabel(interview: Interview) {
  return `${interview.round_type} - ${formatDateTime(interview.scheduled_start_at)}`;
}

function assessmentModeForInterview(interview: Interview | null): AssessmentMode {
  if (!interview) return "l2";
  return interview.round_type.toLowerCase().includes("l1") ? "l1" : "l2";
}

function interviewReason(interview: Interview) {
  const reason = (interview.interview_status_reason || interview.notes_internal || "").trim();
  return reason || "";
}

const INTERVIEW_READ_STORAGE_KEY = "sl_assessment_hub_interview_read_v1";
const SPRINT_READ_STORAGE_KEY = "sl_assessment_hub_sprint_read_v1";

function hasPendingFeedback(interview: Interview) {
  return !interview.feedback_submitted && (interview.decision || "").trim().toLowerCase() !== "cancelled";
}

function interviewNotificationKey(interview: Interview) {
  return [
    interview.candidate_interview_id,
    interview.feedback_submitted ? "submitted" : "pending",
    (interview.interview_status || "").toLowerCase(),
    interview.updated_at || "",
  ].join(":");
}

function isPendingSprintReview(sprint: CandidateSprint) {
  return (sprint.status || "").toLowerCase() === "submitted";
}

function sprintNotificationKey(sprint: CandidateSprint) {
  return [
    sprint.candidate_sprint_id,
    (sprint.status || "").toLowerCase(),
    sprint.updated_at || "",
    sprint.submitted_at || "",
  ].join(":");
}

async function fetchInterviews(params: Record<string, string>) {
  const url = new URL("/api/rec/interviews", window.location.origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Interview[];
}

async function fetchSprints(params: Record<string, string>) {
  const url = new URL("/api/rec/sprints", window.location.origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateSprint[];
}

async function fetchOpenings() {
  const res = await fetch("/api/rec/openings", { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as OpeningListItem[];
}

async function fetchCandidate(candidateId: number) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(String(candidateId))}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateDetail;
}

async function fetchAssessment(interviewId: number, mode: AssessmentMode) {
  const slug = mode === "l1" ? "l1-assessment" : "l2-assessment";
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/${slug}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as L2Assessment;
}

async function fetchScreening(candidateId: number) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(String(candidateId))}/screening`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Screening;
}

function yesNo(value?: boolean | null) {
  if (value === true) return "YES";
  if (value === false) return "NO";
  return "";
}

function dateValue(value?: string | null) {
  if (!value) return "";
  return value;
}

function applyCafPrefill(base: L2Data, candidate: CandidateDetail | null, interview: Interview | null, screening: Screening | null) {
  const next = typeof structuredClone === "function" ? structuredClone(base) : JSON.parse(JSON.stringify(base));
  if (!next.pre_interview || typeof next.pre_interview !== "object") {
    next.pre_interview = {};
  }
  const pre = next.pre_interview as Record<string, string>;
  const setIfEmpty = (key: string, value: string | null | undefined) => {
    const current = (pre[key] || "").trim();
    if (!current && value) pre[key] = value;
  };

  setIfEmpty("candidate_name", candidate?.name || "");
  setIfEmpty("team_lead", interview?.interviewer_name || "");
  if (screening) {
    setIfEmpty("family_support", yesNo(screening.willing_to_relocate));
    setIfEmpty("other_questions", "");
  }
  return next;
}

async function saveAssessment(interviewId: number, data: Record<string, any>, mode: AssessmentMode) {
  const slug = mode === "l1" ? "l1-assessment" : "l2-assessment";
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/${slug}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as L2Assessment;
}

async function submitAssessment(interviewId: number, data: Record<string, any>, mode: AssessmentMode) {
  const slug = mode === "l1" ? "l1-assessment" : "l2-assessment";
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/${slug}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as L2Assessment;
}

async function markInterview(interviewId: number, status: "taken" | "not_taken", reason?: string) {
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, reason }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

async function submitSprintReview(sprintId: number, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/sprints/${encodeURIComponent(String(sprintId))}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateSprint;
}

function updateNested<T extends Record<string, any>>(obj: T, path: string[], value: string) {
  const next = typeof structuredClone === "function" ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
  let cursor: any = next;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
  return next;
}

function FieldLabel({ children }: { children: string }) {
  return <p className="text-xs font-semibold text-slate-600">{children}</p>;
}

export function GLPortalClient({
  initialInterviews,
  useMeFilter,
  initialOpenings,
  currentUser,
  canRaiseOpeningRequests,
  canRaiseNewOpeningRequests,
  canApproveOpeningRequests,
  canManageOpeningRequests,
}: Props) {
  const [interviews, setInterviews] = useState<Interview[]>(initialInterviews);
  const [openings, setOpenings] = useState<OpeningListItem[]>(initialOpenings);
  const [active, setActive] = useState<Interview | null>(null);
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [assessment, setAssessment] = useState<L2Assessment | null>(null);
  const [data, setData] = useState<Record<string, any>>(() => cloneDefault("l2"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const searchParams = useSearchParams();
  const [portalTab, setPortalTab] = useState<PortalTab>("assessments");
  const [sprints, setSprints] = useState<CandidateSprint[]>([]);
  const [sprintsBusy, setSprintsBusy] = useState(false);
  const [sprintsError, setSprintsError] = useState<string | null>(null);
  const [activeSprint, setActiveSprint] = useState<CandidateSprint | null>(null);
  const [sprintForm, setSprintForm] = useState<SprintReviewForm>({
    score_overall: "",
    decision: "",
    comments_internal: "",
    comments_for_candidate: "",
  });
  const [readInterviewNotifications, setReadInterviewNotifications] = useState<Record<string, boolean>>({});
  const [readSprintNotifications, setReadSprintNotifications] = useState<Record<string, boolean>>({});

  const l2Interviews = useMemo(() => interviews.filter((item) => item.round_type.toLowerCase().includes("l2")), [interviews]);
  const l1Interviews = useMemo(() => interviews.filter((item) => item.round_type.toLowerCase().includes("l1")), [interviews]);
  const [activeTab, setActiveTab] = useState<AssessmentMode>("l2");
  const [queueSearch, setQueueSearch] = useState("");
  const [queueStatus, setQueueStatus] = useState<"all" | "pending_feedback" | "taken" | "not_taken" | "other">("all");
  const [queuePage, setQueuePage] = useState(1);
  const visibleInterviews = activeTab === "l1" ? l1Interviews : l2Interviews;
  const l1PendingCount = useMemo(() => l1Interviews.filter(hasPendingFeedback).length, [l1Interviews]);
  const l2PendingCount = useMemo(() => l2Interviews.filter(hasPendingFeedback).length, [l2Interviews]);
  const l1UnreadCount = useMemo(
    () =>
      l1Interviews.filter((item) => hasPendingFeedback(item) && !readInterviewNotifications[interviewNotificationKey(item)]).length,
    [l1Interviews, readInterviewNotifications]
  );
  const l2UnreadCount = useMemo(
    () =>
      l2Interviews.filter((item) => hasPendingFeedback(item) && !readInterviewNotifications[interviewNotificationKey(item)]).length,
    [l2Interviews, readInterviewNotifications]
  );
  const interviewUnreadCount = l1UnreadCount + l2UnreadCount;
  const unreadSprintCount = useMemo(
    () => sprints.filter((sprint) => isPendingSprintReview(sprint) && !readSprintNotifications[sprintNotificationKey(sprint)]).length,
    [sprints, readSprintNotifications]
  );
  const queuePageSize = 20;
  const queueFilteredInterviews = useMemo(() => {
    const query = queueSearch.trim().toLowerCase();
    return visibleInterviews
      .filter((item) => {
        const status = (item.interview_status || "").toLowerCase();
        if (queueStatus === "pending_feedback" && !hasPendingFeedback(item)) return false;
        if (queueStatus === "taken" && status !== "taken") return false;
        if (queueStatus === "not_taken" && status !== "not_taken") return false;
        if (queueStatus === "other" && ["taken", "not_taken"].includes(status)) return false;
        if (!query) return true;
        const haystack = [
          item.candidate_name || "",
          item.opening_title || "",
          item.round_type || "",
          item.interviewer_name || "",
          item.location || "",
          interviewLabel(item),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => {
        const aStart = parseDateUtc(a.scheduled_start_at)?.getTime() || 0;
        const bStart = parseDateUtc(b.scheduled_start_at)?.getTime() || 0;
        return bStart - aStart;
      });
  }, [visibleInterviews, queueSearch, queueStatus]);
  const queueTotalPages = Math.max(1, Math.ceil(queueFilteredInterviews.length / queuePageSize));
  const queuePageItems = useMemo(() => {
    const start = (queuePage - 1) * queuePageSize;
    return queueFilteredInterviews.slice(start, start + queuePageSize);
  }, [queueFilteredInterviews, queuePage]);
  const queueStartIndex = queueFilteredInterviews.length === 0 ? 0 : (queuePage - 1) * queuePageSize + 1;
  const queueEndIndex = Math.min(queueFilteredInterviews.length, queuePage * queuePageSize);
  const currentStage = candidate?.current_stage ? candidate.current_stage.replace(/_/g, " ") : "";

  async function refreshList() {
    setBusy(true);
    setError(null);
    try {
      const next = await fetchInterviews({ ...(useMeFilter ? { interviewer: "me" } : {}) });
      setInterviews(next);
    } catch (e: any) {
      setError(e?.message || "Could not refresh interviews.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshOpeningsList() {
    try {
      const next = await fetchOpenings();
      setOpenings(next);
    } catch {
      // Ignore opening refresh errors in assessment workflow.
    }
  }

  async function refreshSprints() {
    setSprintsBusy(true);
    setSprintsError(null);
    try {
      const next = await fetchSprints({ ...(useMeFilter ? { reviewer: "me" } : {}), status_filter: "submitted" });
      setSprints(next);
    } catch (e: any) {
      setSprintsError(e?.message || "Could not load sprint reviews.");
    } finally {
      setSprintsBusy(false);
    }
  }

  function markInterviewNotificationRead(interview: Interview) {
    if (!hasPendingFeedback(interview)) return;
    const key = interviewNotificationKey(interview);
    setReadInterviewNotifications((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: true };
    });
  }

  function markVisibleNotificationsRead() {
    setReadInterviewNotifications((prev) => {
      const next = { ...prev };
      queueFilteredInterviews.forEach((item) => {
        if (hasPendingFeedback(item)) {
          next[interviewNotificationKey(item)] = true;
        }
      });
      return next;
    });
  }

  function markSprintNotificationRead(sprint: CandidateSprint) {
    if (!isPendingSprintReview(sprint)) return;
    const key = sprintNotificationKey(sprint);
    setReadSprintNotifications((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: true };
    });
  }

  async function selectInterview(interview: Interview) {
    setActive(interview);
    markInterviewNotificationRead(interview);
    setPreviewOpen(false);
    setError(null);
    setCandidate(null);
    setAssessment(null);
    const mode = assessmentModeForInterview(interview);
    setData(cloneDefault(mode));
    try {
      const [candidateDetail, assessmentResp] = await Promise.all([
        fetchCandidate(interview.candidate_id),
        fetchAssessment(interview.candidate_interview_id, mode),
      ]);
      let screening: Screening | null = null;
      try {
        screening = await fetchScreening(interview.candidate_id);
      } catch {
        screening = null;
      }
      setCandidate(candidateDetail);
      const merged = { ...cloneDefault(mode), ...(assessmentResp.data || {}) } as Record<string, any>;
      const hydrated = mode === "l2" ? applyCafPrefill(merged as L2Data, candidateDetail, interview, screening) : merged;
      setAssessment(assessmentResp);
      setData(hydrated);
    } catch (e: any) {
      setError(e?.message || "Could not load assessment.");
    }
  }

  async function handleSave() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const mode = assessmentModeForInterview(active);
      const updated = await saveAssessment(active.candidate_interview_id, data, mode);
      setAssessment(updated);
      setPreviewOpen(false);
      await refreshList();
    } catch (e: any) {
      setError(e?.message || "Could not save assessment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const mode = assessmentModeForInterview(active);
      const updated = await submitAssessment(active.candidate_interview_id, data, mode);
      setAssessment(updated);
      setPreviewOpen(false);
      await refreshList();
    } catch (e: any) {
      setError(e?.message || "Could not submit assessment.");
    } finally {
      setBusy(false);
    }
  }

  function openSprintReview(sprint: CandidateSprint) {
    markSprintNotificationRead(sprint);
    setActiveSprint(sprint);
    setSprintForm({
      score_overall: sprint.score_overall == null ? "" : String(sprint.score_overall),
      decision: sprint.decision || "",
      comments_internal: sprint.comments_internal || "",
      comments_for_candidate: sprint.comments_for_candidate || "",
    });
  }

  async function handleSubmitSprintReview() {
    if (!activeSprint) return;
    setSprintsBusy(true);
    setSprintsError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (sprintForm.score_overall.trim()) payload.score_overall = Number(sprintForm.score_overall);
      if (sprintForm.decision.trim()) payload.decision = sprintForm.decision.trim();
      payload.comments_internal = sprintForm.comments_internal.trim() || null;
      payload.comments_for_candidate = sprintForm.comments_for_candidate.trim() || null;
      await submitSprintReview(activeSprint.candidate_sprint_id, payload);
      setNotice("Sprint review saved.");
      window.setTimeout(() => setNotice(null), 2500);
      setActiveSprint(null);
      await Promise.all([refreshSprints(), refreshList()]);
    } catch (e: any) {
      setSprintsError(e?.message || "Could not submit sprint review.");
    } finally {
      setSprintsBusy(false);
    }
  }

  useEffect(() => {
    const targetId = searchParams?.get("interview");
    if (!targetId) return;
    if (active && String(active.candidate_interview_id) === targetId) return;
    const match = interviews.find((item) => String(item.candidate_interview_id) === targetId);
    if (match) {
      setActiveTab(match.round_type.toLowerCase().includes("l1") ? "l1" : "l2");
      void selectInterview(match);
    }
  }, [interviews, searchParams, active]);

  useEffect(() => {
    setQueuePage(1);
  }, [activeTab, queueSearch, queueStatus]);

  useEffect(() => {
    if (queuePage <= queueTotalPages) return;
    setQueuePage(queueTotalPages);
  }, [queuePage, queueTotalPages]);

  useEffect(() => {
    if (!active) return;
    if (assessmentModeForInterview(active) !== activeTab) {
      setActive(null);
      setCandidate(null);
      setAssessment(null);
      setPreviewOpen(false);
    }
  }, [activeTab, active]);

  useEffect(() => {
    if (!active) return;
    const stillAssigned = interviews.some((item) => item.candidate_interview_id === active.candidate_interview_id);
    if (stillAssigned) return;
    setActive(null);
    setCandidate(null);
    setAssessment(null);
    setPreviewOpen(false);
  }, [interviews, active]);

  useEffect(() => {
    void refreshSprints();
  }, [useMeFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(INTERVIEW_READ_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setReadInterviewNotifications(parsed as Record<string, boolean>);
        }
      }
    } catch {
      // Ignore local cache parse issues.
    }
    try {
      const raw = window.localStorage.getItem(SPRINT_READ_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setReadSprintNotifications(parsed as Record<string, boolean>);
        }
      }
    } catch {
      // Ignore local cache parse issues.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(INTERVIEW_READ_STORAGE_KEY, JSON.stringify(readInterviewNotifications));
  }, [readInterviewNotifications]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SPRINT_READ_STORAGE_KEY, JSON.stringify(readSprintNotifications));
  }, [readSprintNotifications]);

  useEffect(() => {
    const requestedTab = searchParams?.get("tab");
    if (!requestedTab) return;
    const normalized = requestedTab.trim().toLowerCase();
    if (["opening_requests", "requests", "openings"].includes(normalized)) {
      setPortalTab("opening_requests");
      return;
    }
    if (["sprints", "sprint_reviews", "sprint_review"].includes(normalized)) {
      setPortalTab("sprint_reviews");
      return;
    }
    if (["assessments", "assessment"].includes(normalized)) {
      setPortalTab("assessments");
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    let busyRefreshing = false;
    let refreshQueued = false;
    const source = new EventSource("/api/rec/events/stream");

    async function refreshAll() {
      if (busyRefreshing) {
        refreshQueued = true;
        return;
      }
      busyRefreshing = true;
      try {
        await Promise.all([refreshList(), refreshSprints()]);
      } finally {
        busyRefreshing = false;
        if (refreshQueued && !cancelled) {
          refreshQueued = false;
          void refreshAll();
        }
      }
    }

    source.onmessage = () => {
      void refreshAll();
    };
    return () => {
      cancelled = true;
      source.close();
    };
  }, [useMeFilter]);

  const locked = assessment?.locked ?? false;
  const isSubmitted = assessment?.status === "submitted";
  const activeMode = active ? assessmentModeForInterview(active) : activeTab;
  const pdfSlug = activeMode === "l1" ? "l1-assessment" : "l2-assessment";
  const sections = activeMode === "l1" ? L1_SECTION_FIELDS : L2_SECTION_FIELDS;
  const activeInterviewStatus = (active?.interview_status || "").toLowerCase();
  const isInterviewNotTaken = activeInterviewStatus === "not_taken";
  const isInterviewTaken = activeInterviewStatus === "taken";
  const scheduledStart = active?.scheduled_start_at ? parseDateUtc(active.scheduled_start_at) : null;
  const hasMeetingStarted = !!scheduledStart && !Number.isNaN(scheduledStart.getTime()) && scheduledStart.getTime() <= Date.now();
  const canUpdateInterviewStatus = !!active && hasMeetingStarted;
  const canSeeOpeningRequests = canRaiseOpeningRequests || canApproveOpeningRequests;

  async function markInterviewStatus(status: "taken" | "not_taken") {
    if (!active || !candidate) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let reason: string | undefined;
      if (status === "not_taken") {
        const response = window.prompt("Reason for marking as not taken? (optional)") || "";
        reason = response.trim() || undefined;
      }
      await markInterview(active.candidate_interview_id, status, reason);
      await refreshList();
      const candidateDetail = await fetchCandidate(active.candidate_id);
      setCandidate(candidateDetail);
      setNotice(
        status === "taken"
          ? "Interview marked as taken. Stage updated."
          : "Interview marked as not taken. Stage unchanged."
      );
      window.setTimeout(() => setNotice(null), 2500);
    } catch (e: any) {
      const message = e?.message || "Could not update interview status.";
      if (message.toLowerCase().includes("already")) {
        setNotice("Interview status already set.");
        window.setTimeout(() => setNotice(null), 2500);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  function isInterviewNotificationUnread(interview: Interview) {
    return hasPendingFeedback(interview) && !readInterviewNotifications[interviewNotificationKey(interview)];
  }

  function renderInterviewCard(item: Interview) {
    const status = (item.interview_status || "pending").replace(/_/g, " ");
    const unread = isInterviewNotificationUnread(item);
    return (
      <button
        key={item.candidate_interview_id}
        type="button"
        className={clsx(
          "group flex w-full flex-col gap-0.5 rounded-lg border border-white/60 bg-gradient-to-br from-white/70 via-white/60 to-slate-50/70 p-2 text-left transition hover:border-slate-200 hover:bg-white",
          active?.candidate_interview_id === item.candidate_interview_id && "border-slate-300 bg-white ring-2 ring-slate-200/70"
        )}
        onClick={() => void selectInterview(item)}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-semibold text-slate-900">{item.candidate_name || `Candidate ${item.candidate_id}`}</p>
          <span className="rounded-full border border-slate-200 bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            {status}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
          <span className="truncate">{item.opening_title || "Opening"}</span>
          <span>·</span>
          <span>{item.round_type}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-600">
          <CalendarCheck2 className="h-3.5 w-3.5" />
          {interviewLabel(item)}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          {hasPendingFeedback(item) ? (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700 ring-1 ring-amber-500/20">
              Feedback pending
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-500/20">
              Feedback submitted
            </span>
          )}
          {unread ? (
            <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 font-semibold text-rose-700 ring-1 ring-rose-500/20">
              Unread
            </span>
          ) : (
            <span className="rounded-full bg-slate-500/10 px-1.5 py-0.5 font-semibold text-slate-600 ring-1 ring-slate-500/20">
              Read
            </span>
          )}
          {item.meeting_link ? (
            <a
              className="ml-auto text-slate-700 underline decoration-dotted underline-offset-2"
              href={item.meeting_link}
              target="_blank"
              rel="noreferrer"
            >
              Link
            </a>
          ) : null}
        </div>
        {interviewReason(item) ? (
          <p className="truncate text-[11px] text-slate-500">Reason: {interviewReason(item)}</p>
        ) : null}
      </button>
    );
  }

  function renderField(field: FieldConfig) {
    const rawValue = field.path.reduce(
      (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, any>)[key] : ""),
      data
    );
    const value = typeof rawValue === "string" ? rawValue : "";
    const commonProps = {
      className:
        "w-full rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-1.5 text-sm text-slate-800 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)] focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:bg-slate-100",
      disabled: locked || !isInterviewTaken,
    };
    if (field.type === "yesno") {
      return (
        <select
          {...commonProps}
          value={value || ""}
          onChange={(e) => setData((prev) => updateNested(prev, field.path, e.target.value))}
        >
          {yesNoOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt || "Select"}
            </option>
          ))}
        </select>
      );
    }
    if (field.type === "rating") {
      return (
        <select
          {...commonProps}
          value={value || ""}
          onChange={(e) => setData((prev) => updateNested(prev, field.path, e.target.value))}
        >
          {ratingOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt || "Select"}
            </option>
          ))}
        </select>
      );
    }
    if (field.type === "textarea") {
      return (
        <textarea
          {...commonProps}
          className={`${commonProps.className} h-16`}
          value={value || ""}
          onChange={(e) => setData((prev) => updateNested(prev, field.path, e.target.value))}
        />
      );
    }
    return (
      <input
        {...commonProps}
        value={value || ""}
        onChange={(e) => setData((prev) => updateNested(prev, field.path, e.target.value))}
      />
    );
  }

  return (
    <main className="content-pad space-y-2">
      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Assessment Hub</p>
            <h1 className="mt-0.5 text-lg font-semibold text-slate-900">Interviews, feedback, and sprint reviews</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 text-xs font-semibold text-slate-700">
              <button
                type="button"
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1",
                  portalTab === "assessments" ? "bg-slate-200 text-slate-800" : "text-slate-700"
                )}
                onClick={() => setPortalTab("assessments")}
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                Assessments
                <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", portalTab === "assessments" ? "bg-white text-slate-700" : "bg-slate-200 text-slate-700")}>
                  {interviewUnreadCount}
                </span>
              </button>
              <button
                type="button"
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1",
                  portalTab === "sprint_reviews" ? "bg-slate-200 text-slate-800" : "text-slate-700"
                )}
                onClick={() => setPortalTab("sprint_reviews")}
              >
                Sprint Reviews
                <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", portalTab === "sprint_reviews" ? "bg-white text-slate-700" : "bg-slate-200 text-slate-700")}>
                  {unreadSprintCount}
                </span>
              </button>
              {canSeeOpeningRequests ? (
                <button
                  type="button"
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1",
                    portalTab === "opening_requests" ? "bg-slate-200 text-slate-800" : "text-slate-700"
                  )}
                  onClick={() => setPortalTab("opening_requests")}
                >
                  <BriefcaseBusiness className="h-3.5 w-3.5" />
                  Opening Requests
                </button>
              ) : null}
            </div>
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : null}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">L1 unread: {l1UnreadCount}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">L2 unread: {l2UnreadCount}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">Sprint unread: {unreadSprintCount}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">Pending feedback: {l1PendingCount + l2PendingCount}</span>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      {portalTab === "opening_requests" ? (
        canSeeOpeningRequests ? (
          <OpeningRequestsWorkspace
            openings={openings}
            canRaise={canRaiseOpeningRequests}
            canRaiseNew={canRaiseNewOpeningRequests}
            canApprove={canApproveOpeningRequests}
            canManage={canManageOpeningRequests}
            currentUserEmail={currentUser?.email || null}
            currentUserPersonId={currentUser?.person_id_platform || null}
            onOpeningsChanged={refreshOpeningsList}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-4 text-sm text-slate-600">
            Opening requests are not available in this view.
          </div>
        )
      ) : null}

      {portalTab === "sprint_reviews" ? (
        <section className="section-card" style={{ padding: "0.85rem" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Sprint review queue</p>
              <p className="text-xs text-slate-600">Submitted sprints awaiting L2 decision.</p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
              onClick={() => void refreshSprints()}
              disabled={sprintsBusy}
            >
              Refresh
            </button>
          </div>
          {sprintsError ? (
            <div className="mt-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
              {sprintsError}
            </div>
          ) : null}
          <div className="mt-3 space-y-2">
            {sprintsBusy && sprints.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/40 p-4 text-sm text-slate-600">
                Loading sprint reviews...
              </div>
            ) : sprints.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/40 p-4 text-sm text-slate-600">
                No sprint submissions waiting for review.
              </div>
            ) : (
              sprints.map((sprint) => (
                <button
                  key={sprint.candidate_sprint_id}
                  type="button"
                  className="w-full rounded-xl border border-white/70 bg-gradient-to-br from-white/70 via-white/60 to-slate-50/70 px-3 py-2.5 text-left hover:from-white hover:to-slate-50"
                  onClick={() => void openSprintReview(sprint)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold text-slate-900">{sprint.candidate_name || `Candidate ${sprint.candidate_id}`}</p>
                      <p className="text-xs text-slate-600">{sprint.opening_title || "Opening"} · {sprint.template_name || "Sprint"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-500/20">
                        {(sprint.status || "submitted").replace(/_/g, " ")}
                      </span>
                      {isPendingSprintReview(sprint) && !readSprintNotifications[sprintNotificationKey(sprint)] ? (
                        <span className="rounded-full bg-rose-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-rose-500/20">
                          Unread
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-500/20">
                          Read
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Submitted: {formatDateTime(sprint.submitted_at)} · Due: {formatDateTime(sprint.due_at)}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>
      ) : null}

      {portalTab === "assessments" ? <section className="space-y-2">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          Queue: {queueFilteredInterviews.length} items · unread {interviewUnreadCount} · pending {l1PendingCount + l2PendingCount}
        </div>
        <div className="grid gap-2 lg:grid-cols-[300px_1fr]">
        <div className="section-card border-slate-200/80 bg-gradient-to-b from-white/95 via-white/90 to-slate-50/70" style={{ padding: "0.7rem" }}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">Interview Queue</p>
              <p className="text-[11px] text-slate-600">Click row to open details.</p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700"
              onClick={() => void refreshList()}
              disabled={busy}
            >
              Refresh
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
            <div className="inline-flex rounded-full border border-slate-200 bg-white/80 p-0.5 text-xs font-semibold text-slate-700">
              <button
                type="button"
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                  activeTab === "l1" ? "bg-slate-200 text-slate-800" : "text-slate-600"
                )}
                onClick={() => setActiveTab("l1")}
              >
                L1
                <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", activeTab === "l1" ? "bg-white text-slate-700" : "bg-slate-200 text-slate-700")}>
                  {l1UnreadCount}
                </span>
              </button>
              <button
                type="button"
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                  activeTab === "l2" ? "bg-slate-200 text-slate-800" : "text-slate-600"
                )}
                onClick={() => setActiveTab("l2")}
              >
                L2
                <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", activeTab === "l2" ? "bg-white text-slate-700" : "bg-slate-200 text-slate-700")}>
                  {l2UnreadCount}
                </span>
              </button>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 disabled:opacity-60"
              onClick={markVisibleNotificationsRead}
              disabled={queueFilteredInterviews.length === 0}
            >
              Mark filtered as read
            </button>
          </div>

          <div className="mt-1.5 grid gap-1.5 md:grid-cols-[1fr_130px]">
            <input
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800"
              placeholder="Search candidate, opening, interviewer, round"
              value={queueSearch}
              onChange={(e) => setQueueSearch(e.target.value)}
            />
            <select
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800"
              value={queueStatus}
              onChange={(e) => setQueueStatus(e.target.value as "all" | "pending_feedback" | "taken" | "not_taken" | "other")}
            >
              <option value="all">All statuses</option>
              <option value="pending_feedback">Pending feedback</option>
              <option value="taken">Interview taken</option>
              <option value="not_taken">Interview not taken</option>
              <option value="other">Other statuses</option>
            </select>
          </div>

          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              Showing {queueStartIndex}-{queueEndIndex} of {queueFilteredInterviews.length}
            </span>
            <span>Page {queuePage} / {queueTotalPages}</span>
          </div>

          <div className="mt-1.5 space-y-1.5">
            {queueFilteredInterviews.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white/30 p-2.5 text-sm text-slate-600">
                No interviews found for this filter.
              </div>
            ) : (
              queuePageItems.map((item) => renderInterviewCard(item))
            )}
          </div>

          <div className="mt-1.5 flex items-center justify-between">
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 disabled:opacity-60"
              onClick={() => setQueuePage((prev) => Math.max(1, prev - 1))}
              disabled={queuePage <= 1}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 disabled:opacity-60"
              onClick={() => setQueuePage((prev) => Math.min(queueTotalPages, prev + 1))}
              disabled={queuePage >= queueTotalPages}
            >
              Next
            </button>
          </div>
        </div>

        <div className="section-card space-y-3 border-slate-200/80 bg-gradient-to-b from-white/95 via-white/90 to-slate-50 shadow-[0_14px_30px_rgba(15,23,42,0.10)]" style={{ padding: "0.9rem" }}>
          {active ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-tight text-slate-500">Candidate</p>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {active.candidate_name || `Candidate ${active.candidate_id}`}
                  </h2>
                  <p className="text-xs text-slate-600">
                    {active.opening_title || "Opening"} - {currentStage || "Stage not set"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Interview: {interviewLabel(active)} - {active.interviewer_name || "Interviewer"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700"
                    onClick={() => setPreviewOpen((prev) => !prev)}
                  >
                    {previewOpen ? "Hide preview" : "Preview"}
                  </button>
                  {assessment ? (
                    <a
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700"
                      href={`/api/rec/interviews/${encodeURIComponent(String(active.candidate_interview_id))}/${pdfSlug}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileDown className="h-3.5 w-3.5" /> PDF
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700"
                    onClick={() => void markInterviewStatus("taken")}
                    disabled={busy || !canUpdateInterviewStatus}
                  >
                    Mark interview taken
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700"
                    onClick={() => void markInterviewStatus("not_taken")}
                    disabled={busy || !canUpdateInterviewStatus}
                  >
                    Mark not taken
                  </button>
                </div>
              </div>
              {!hasMeetingStarted ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-1.5 text-xs text-amber-700">
                  Interview status can be updated once the scheduled start time begins.
                </div>
              ) : null}

              {locked ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-1.5 text-xs text-amber-700">
                  This assessment is locked after submission.
                </div>
              ) : null}
              {!isInterviewTaken && !isInterviewNotTaken ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs text-slate-600">
                  Mark the interview as taken to unlock feedback.
                </div>
              ) : null}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-tight text-slate-700">Workflow</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-700">
                  <li>Select interview from queue.</li>
                  <li>Mark status as taken or not taken after scheduled start.</li>
                  <li>Fill fields and save draft as needed.</li>
                  <li>Submit only after final review (submission locks the form).</li>
                </ol>
              </div>

              {previewOpen && !isInterviewNotTaken ? (
                <div className="rounded-xl border border-slate-200/70 bg-white/80 p-3 text-sm text-slate-700">
                  <p className="text-xs uppercase tracking-tight text-slate-500">Preview</p>
                  {activeMode === "l1" ? (
                    <>
                      <p className="mt-2"><span className="font-semibold">Candidate:</span> {active.candidate_name}</p>
                      <p><span className="font-semibold">Role clarity:</span> {data.section1?.role_clarity || "-"}</p>
                      <p><span className="font-semibold">Big picture thinking:</span> {data.section2?.big_picture || "-"}</p>
                      <p><span className="font-semibold">High potential:</span> {data.section4?.high_potential || "-"}</p>
                      <p><span className="font-semibold">Good to hire:</span> {data.section5?.good_to_hire || "-"}</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-2"><span className="font-semibold">Candidate:</span> {data.pre_interview?.candidate_name || active.candidate_name}</p>
                      <p><span className="font-semibold">Team Lead:</span> {data.pre_interview?.team_lead || "-"}</p>
                      <p><span className="font-semibold">Preferred DOJ:</span> {data.pre_interview?.preferred_joining_date || "-"}</p>
                      <p><span className="font-semibold">Good to hire:</span> {data.section7?.assess_good_to_hire || "-"}</p>
                    </>
                  )}
                </div>
              ) : null}

              <div className="space-y-3">
                {isInterviewNotTaken ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-700">
                    Interview marked as not taken. Assessment is unavailable.
                  </div>
                ) : null}
                {activeMode === "l1" ? (
                  <section className="rounded-xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm">
                    <p className="text-xs uppercase tracking-tight text-slate-500">Areas to assess on</p>
                    <ul className="mt-2 space-y-1 text-sm text-slate-700">
                      {L1_AREAS.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-600/70" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {!isInterviewNotTaken ? sections.map((section) => (
                  <section
                    key={section.title}
                    className={clsx(
                      "rounded-xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm",
                      !isInterviewTaken && "opacity-60"
                    )}
                  >
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-tight text-slate-500">Section</p>
                        <h3 className="text-base font-semibold text-slate-900">{section.title}</h3>
                      </div>
                    </div>
                    {activeMode === "l1" && section.title === "Section 4: Before Closing out the interview" ? (
                      <ol className="mt-3 space-y-1 text-sm text-slate-700">
                        <li>Ask the candidate to rate their experience of this interaction/interview. Engage with the candidate to ensure that they feel heard and valued.</li>
                        <li>Closure of interview: Ask the candidate if they have any questions/doubts that remain unanswered or anything that they would like you to address.</li>
                        <li>Ask the candidate for Feedback on the interview process and their experience of interviewing with Studio Lotus.</li>
                      </ol>
                    ) : null}
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {section.fields.map((field) => (
                        <label
                          key={field.label}
                          className={clsx("space-y-2", field.type === "textarea" ? "md:col-span-2" : "")}
                        >
                          <FieldLabel>{field.label}</FieldLabel>
                          {renderField(field)}
                        </label>
                      ))}
                    </div>
                    {activeMode === "l1" && section.title === "High Potential Check" ? (
                      <div className="mt-3 rounded-xl border border-slate-200/70 bg-white/70 p-2.5 text-sm text-slate-700">
                        <p className="text-xs uppercase tracking-tight text-slate-500">Characteristics of a High Potential Candidate (Reference)</p>
                        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-slate-600">
                          {HIGH_POTENTIAL_REFERENCE.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                  </section>
                )) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <UserRound className="h-3.5 w-3.5" />
                  {active.interviewer_name || "Assigned interviewer"}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    onClick={() => void handleSave()}
                    disabled={busy || locked || isInterviewNotTaken || !isInterviewTaken}
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-300 disabled:opacity-60"
                    onClick={() => void handleSubmit()}
                    disabled={busy || locked || isInterviewNotTaken || !isInterviewTaken}
                  >
                    {isSubmitted ? "Submitted" : "Submit"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/30 p-4 text-sm text-slate-600">
              Select an interview to view the assessment.
            </div>
          )}
        </div>
        </div>
      </section> : null}
      {activeSprint ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/20 bg-white/95 p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-tight text-slate-500">Sprint review</p>
                <h2 className="text-lg font-semibold">{activeSprint.candidate_name || `Candidate ${activeSprint.candidate_id}`}</h2>
                <p className="text-xs text-slate-600">{activeSprint.template_name || "Sprint"} · {activeSprint.opening_title || "Opening"}</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                onClick={() => setActiveSprint(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              <label className="space-y-1 text-xs text-slate-600">
                Score (0-10)
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={sprintForm.score_overall}
                  onChange={(e) => setSprintForm((prev) => ({ ...prev, score_overall: e.target.value }))}
                  placeholder="e.g. 7.5"
                />
              </label>
              <label className="space-y-1 text-xs text-slate-600">
                Decision
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={sprintForm.decision}
                  onChange={(e) => setSprintForm((prev) => ({ ...prev, decision: e.target.value }))}
                >
                  <option value="">Select decision</option>
                  <option value="advance">Advance</option>
                  <option value="reject">Reject</option>
                  <option value="keep_warm">Keep warm</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-600">
                Internal comments
                <textarea
                  className="h-16 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={sprintForm.comments_internal}
                  onChange={(e) => setSprintForm((prev) => ({ ...prev, comments_internal: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-xs text-slate-600">
                Candidate comments
                <textarea
                  className="h-16 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={sprintForm.comments_for_candidate}
                  onChange={(e) => setSprintForm((prev) => ({ ...prev, comments_for_candidate: e.target.value }))}
                />
              </label>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                onClick={() => setActiveSprint(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-300"
                onClick={() => void handleSubmitSprintReview()}
                disabled={sprintsBusy}
              >
                {sprintsBusy ? "Saving..." : "Save review"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
