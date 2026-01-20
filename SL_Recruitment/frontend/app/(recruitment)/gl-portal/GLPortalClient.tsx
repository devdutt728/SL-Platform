"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { CalendarCheck2, FileDown, Loader2, UserRound } from "lucide-react";
import type { CandidateDetail, Interview, L2Assessment, Screening } from "@/lib/types";
import { parseDateUtc } from "@/lib/datetime";

type Props = {
  initialInterviews: Interview[];
  useMeFilter: boolean;
};

type L2Data = Record<string, any>;

const yesNoOptions = ["", "YES", "NO"];
const ratingOptions = ["", "1", "2", "3", "4", "5"];

const DEFAULT_DATA: L2Data = {
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

const SECTION_FIELDS: { title: string; fields: FieldConfig[] }[] = [
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

function cloneDefault() {
  return typeof structuredClone === "function" ? structuredClone(DEFAULT_DATA) : JSON.parse(JSON.stringify(DEFAULT_DATA));
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

async function fetchInterviews(params: Record<string, string>) {
  const url = new URL("/api/rec/interviews", window.location.origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Interview[];
}

async function fetchCandidate(candidateId: number) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(String(candidateId))}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateDetail;
}

async function fetchAssessment(interviewId: number) {
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/l2-assessment`, { cache: "no-store" });
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
    setIfEmpty("preferred_joining_date", dateValue(screening.expected_joining_date));
    setIfEmpty("two_year_commitment", yesNo(screening.two_year_commitment));
    setIfEmpty("family_support", yesNo(screening.willing_to_relocate));
    setIfEmpty("other_questions", screening.questions_from_candidate || screening.relocation_notes || "");
  }
  return next;
}

async function saveAssessment(interviewId: number, data: L2Data) {
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/l2-assessment`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as L2Assessment;
}

async function submitAssessment(interviewId: number, data: L2Data) {
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/l2-assessment/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as L2Assessment;
}

async function markInterview(interviewId: number, status: "taken" | "not_taken") {
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
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

export function GLPortalClient({ initialInterviews, useMeFilter }: Props) {
  const [interviews, setInterviews] = useState<Interview[]>(initialInterviews);
  const [active, setActive] = useState<Interview | null>(null);
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [assessment, setAssessment] = useState<L2Assessment | null>(null);
  const [data, setData] = useState<L2Data>(() => cloneDefault());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const searchParams = useSearchParams();

  const l2Interviews = useMemo(() => interviews.filter((item) => item.round_type.toLowerCase().includes("l2")), [interviews]);
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

  async function selectInterview(interview: Interview) {
    setActive(interview);
    setError(null);
    setCandidate(null);
    setAssessment(null);
    setData(cloneDefault());
    try {
      const [candidateDetail, assessmentResp] = await Promise.all([
        fetchCandidate(interview.candidate_id),
        fetchAssessment(interview.candidate_interview_id),
      ]);
      let screening: Screening | null = null;
      try {
        screening = await fetchScreening(interview.candidate_id);
      } catch {
        screening = null;
      }
      setCandidate(candidateDetail);
      const merged = { ...cloneDefault(), ...(assessmentResp.data || {}) } as L2Data;
      const hydrated = applyCafPrefill(merged, candidateDetail, interview, screening);
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
      const updated = await saveAssessment(active.candidate_interview_id, data);
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
      const updated = await submitAssessment(active.candidate_interview_id, data);
      setAssessment(updated);
      setPreviewOpen(false);
      await refreshList();
    } catch (e: any) {
      setError(e?.message || "Could not submit assessment.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (active) return;
    const targetId = searchParams?.get("interview");
    if (targetId) {
      const match = l2Interviews.find((item) => String(item.candidate_interview_id) === targetId);
      if (match) {
        void selectInterview(match);
        return;
      }
    }
    if (l2Interviews.length > 0) {
      void selectInterview(l2Interviews[0]);
    }
  }, [l2Interviews, searchParams, active]);

  const locked = assessment?.locked ?? false;
  const isSubmitted = assessment?.status === "submitted";
  const currentStageKey = (candidate?.current_stage || "").trim().toLowerCase();

  async function markInterviewStatus(status: "taken" | "not_taken") {
    if (!active || !candidate) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await markInterview(active.candidate_interview_id, status);
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

  function renderField(field: FieldConfig) {
    const value = field.path.reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : ""), data) as string;
    const commonProps = {
      className: "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 disabled:bg-slate-100",
      disabled: locked,
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
          className={`${commonProps.className} h-20`}
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
    <main className="content-pad space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-tight text-slate-500">GL / Interviewer</p>
          <h1 className="text-2xl font-semibold text-slate-900">L2 Assessment Portal</h1>
        </div>
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="section-card">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Assigned L2 interviews</p>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
              onClick={() => void refreshList()}
              disabled={busy}
            >
              Refresh
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {l2Interviews.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/30 p-4 text-sm text-slate-600">
                No L2 interviews assigned yet.
              </div>
            ) : (
              l2Interviews.map((item) => (
                <button
                  key={item.candidate_interview_id}
                  type="button"
                  className={clsx(
                    "flex w-full flex-col gap-1 rounded-2xl border border-white/60 bg-white/40 p-3 text-left transition hover:bg-white/70",
                    active?.candidate_interview_id === item.candidate_interview_id && "bg-white/80 ring-1 ring-slate-200"
                  )}
                  onClick={() => void selectInterview(item)}
                >
                  <p className="text-sm font-semibold text-slate-900">{item.candidate_name || `Candidate ${item.candidate_id}`}</p>
                  <p className="text-xs text-slate-600">{item.opening_title || "Opening"}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                    <CalendarCheck2 className="h-3.5 w-3.5" />
                    {interviewLabel(item)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="section-card space-y-4">
          {active ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-tight text-slate-500">Candidate</p>
                  <h2 className="text-xl font-semibold text-slate-900">
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
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                    onClick={() => setPreviewOpen((prev) => !prev)}
                  >
                    {previewOpen ? "Hide preview" : "Preview"}
                  </button>
                  {assessment ? (
                    <a
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                      href={`/api/rec/interviews/${encodeURIComponent(String(active.candidate_interview_id))}/l2-assessment/pdf`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileDown className="h-3.5 w-3.5" /> PDF
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                    onClick={() => void markInterviewStatus("taken")}
                    disabled={busy}
                  >
                    Mark interview taken
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                    onClick={() => void markInterviewStatus("not_taken")}
                    disabled={busy}
                  >
                    Mark not taken
                  </button>
                </div>
              </div>

              {locked ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-2 text-xs text-amber-700">
                  This assessment is locked after submission.
                </div>
              ) : null}

              {previewOpen ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
                  <p className="text-xs uppercase tracking-tight text-slate-500">Preview</p>
                  <p className="mt-2"><span className="font-semibold">Candidate:</span> {data.pre_interview?.candidate_name || active.candidate_name}</p>
                  <p><span className="font-semibold">Team Lead:</span> {data.pre_interview?.team_lead || "-"}</p>
                  <p><span className="font-semibold">Preferred DOJ:</span> {data.pre_interview?.preferred_joining_date || "-"}</p>
                  <p><span className="font-semibold">Good to hire:</span> {data.section7?.assess_good_to_hire || "-"}</p>
                </div>
              ) : null}

              <div className="space-y-6">
                {SECTION_FIELDS.map((section) => (
                  <section key={section.title} className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-tight text-slate-500">Section</p>
                        <h3 className="text-lg font-semibold text-slate-900">{section.title}</h3>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
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
                  </section>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <UserRound className="h-3.5 w-3.5" />
                  {active.interviewer_name || "Assigned interviewer"}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                    onClick={() => void handleSave()}
                    disabled={busy || locked}
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    onClick={() => void handleSubmit()}
                    disabled={busy || locked}
                  >
                    {isSubmitted ? "Submitted" : "Submit"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/30 p-4 text-sm text-slate-600">
              Select an interview to view the L2 assessment.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
