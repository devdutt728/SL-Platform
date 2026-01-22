"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { CalendarCheck2, ExternalLink, Loader2, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CandidateSprint, Interview, L2Assessment, PlatformPersonSuggestion } from "@/lib/types";
import { parseDateUtc } from "@/lib/datetime";

type Props = {
  initialUpcoming: Interview[];
  initialPast: Interview[];
  useMeFilter: boolean;
  canAssignReviewer: boolean;
};

type SprintReviewForm = {
  score_overall: string;
  decision: string;
  comments_internal: string;
  comments_for_candidate: string;
};

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

function isCancelled(interview: Interview) {
  if ((interview.decision || "").toLowerCase() === "cancelled") return true;
  const note = (interview.notes_internal || "").toLowerCase();
  return note.includes("cancelled by superadmin");
}

function chipTone(kind: "neutral" | "green" | "amber" | "red" | "blue") {
  if (kind === "green") return "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/20";
  if (kind === "amber") return "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/20";
  if (kind === "red") return "bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/20";
  if (kind === "blue") return "bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/20";
  return "bg-slate-500/10 text-slate-700 ring-1 ring-slate-500/15";
}

function normalizeStage(raw?: string | null) {
  const value = (raw || "").trim().toLowerCase();
  if (!value) return "";
  if (value === "caf") return "hr_screening";
  if (value === "l2") return "l2_interview";
  if (value === "l1") return "l1_interview";
  return value.replace(/\s+/g, "_");
}

function stageLabel(raw?: string | null) {
  const key = normalizeStage(raw);
  if (!key) return "";
  if (key === "l2_feedback") return "L2 feedback";
  if (key === "l1_feedback") return "L1 feedback";
  return key.replace(/_/g, " ");
}

function assessmentModeForInterview(interview: Interview | null) {
  if (!interview) return "l2";
  return interview.round_type.toLowerCase().includes("l1") ? "l1" : "l2";
}

function interviewStatusLabel(raw?: string | null) {
  const value = (raw || "").toLowerCase();
  if (value === "taken") return "Interview taken";
  if (value === "not_taken") return "Interview not taken";
  return "";
}

async function fetchInterviews(params: Record<string, string>) {
  const url = new URL("/api/rec/interviews", window.location.origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const res = await fetch(url.toString(), { cache: "no-store" });
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

async function fetchAssessment(interviewId: number, mode: "l1" | "l2") {
  const slug = mode === "l1" ? "l1-assessment" : "l2-assessment";
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/${slug}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as L2Assessment;
}

async function fetchSprints(params: Record<string, string>) {
  const url = new URL("/api/rec/sprints", window.location.origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateSprint[];
}

async function fetchPeople(query: string) {
  const url = new URL("/api/platform/people", window.location.origin);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "8");
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as PlatformPersonSuggestion[];
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

async function assignSprintReviewer(sprintId: number, reviewerPersonId: string | null) {
  const res = await fetch(`/api/rec/sprints/${encodeURIComponent(String(sprintId))}/assign-reviewer`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reviewer_person_id_platform: reviewerPersonId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateSprint;
}

function InterviewCard({
  interview,
  onSelect,
  onCancel,
  onReschedule,
}: {
  interview: Interview;
  onSelect: (item: Interview) => void;
  onCancel?: (item: Interview) => void;
  onReschedule?: (item: Interview) => void;
}) {
  const label = interview.round_type || "Interview";
  const candidate = interview.candidate_name || `Candidate ${interview.candidate_id}`;
  const role = interview.opening_title || "Opening";
  const feedbackStage = stageLabel(interview.stage_name);
  const interviewer = interview.interviewer_name || "Interviewer";
  return (
    <div
      role="button"
      tabIndex={0}
      className="flex w-full flex-col gap-2 rounded-2xl border border-white/60 bg-white/40 p-3 text-left transition hover:bg-white/70"
      onClick={() => onSelect(interview)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect(interview);
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{candidate}</p>
          <p className="text-xs text-slate-600">Interviewer: {interviewer}</p>
          <p className="text-xs text-slate-600">{role}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {feedbackStage ? (
            <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", chipTone("amber"))}>{feedbackStage}</span>
          ) : null}
          <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", chipTone("blue"))}>{label}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1"><CalendarCheck2 className="h-3.5 w-3.5" />{formatDateTime(interview.scheduled_start_at)}</span>
        {interview.location ? <span>{interview.location}</span> : null}
        {interview.meeting_link ? (
          <span className="inline-flex items-center gap-1 text-slate-800">
            <ExternalLink className="h-3.5 w-3.5" /> Meet link
          </span>
        ) : null}
      </div>
      {onCancel || onReschedule ? (
        <div className="flex flex-wrap gap-2">
          {onReschedule ? (
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
              onClick={(event) => {
                event.stopPropagation();
                onReschedule(interview);
              }}
            >
              Reschedule
            </button>
          ) : null}
          {onCancel ? (
            <button
              type="button"
              className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700"
              onClick={(event) => {
                event.stopPropagation();
                onCancel(interview);
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function InterviewerClient({ initialUpcoming, initialPast, useMeFilter, canAssignReviewer }: Props) {
  const router = useRouter();
  const [upcoming, setUpcoming] = useState<Interview[]>(initialUpcoming);
  const [past, setPast] = useState<Interview[]>(initialPast);
  const [active, setActive] = useState<Interview | null>(null);
  const [assessment, setAssessment] = useState<L2Assessment | null>(null);
  const [assessmentBusy, setAssessmentBusy] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [assignSprint, setAssignSprint] = useState<CandidateSprint | null>(null);
  const [assignQuery, setAssignQuery] = useState("");
  const [assignResults, setAssignResults] = useState<PlatformPersonSuggestion[]>([]);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [sprintStatusFilter, setSprintStatusFilter] = useState("all");
  const [sprintReviewerFilter, setSprintReviewerFilter] = useState("all");
  const [sprintOverdueOnly, setSprintOverdueOnly] = useState(false);
  const [pastShowAll, setPastShowAll] = useState(false);
  const [pastRoundFilter, setPastRoundFilter] = useState("all");
  const [pastStatusFilter, setPastStatusFilter] = useState("all");

  async function handleCancel(interview: Interview) {
    const confirmResult = window.confirm("Cancel this interview?");
    if (!confirmResult) return;
    const reason = window.prompt("Reason for cancellation (optional):", "") || undefined;
    setBusy(true);
    setError(null);
    try {
      await cancelInterview(interview.candidate_interview_id, reason);
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Could not cancel interview.");
    } finally {
      setBusy(false);
    }
  }

  function handleReschedule(interview: Interview) {
    const round = interview.round_type || "L2";
    router.push(`/candidates/${encodeURIComponent(String(interview.candidate_id))}?reschedule_interview_id=${encodeURIComponent(String(interview.candidate_interview_id))}&round=${encodeURIComponent(round)}`);
  }


  const activeCandidateLabel = useMemo(() => {
    if (!active) return "";
    return active.candidate_name || `Candidate ${active.candidate_id}`;
  }, [active]);

  async function openAssessment(interview: Interview) {
    setActive(interview);
    setAssessment(null);
    setAssessmentError(null);
    setAssessmentBusy(true);
    try {
      const mode = assessmentModeForInterview(interview);
      const data = await fetchAssessment(interview.candidate_interview_id, mode);
      setAssessment(data);
    } catch (e: any) {
      setAssessmentError(e?.message || "Could not load GL assessment.");
    } finally {
      setAssessmentBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const [nextUpcoming, nextPending] = await Promise.all([
        fetchInterviews({ ...(useMeFilter ? { interviewer: "me" } : {}), upcoming: "true" }),
        fetchInterviews({ ...(useMeFilter ? { interviewer: "me" } : {}), upcoming: "false" }),
      ]);
      setUpcoming(nextUpcoming);
      setPast(nextPending);
    } catch (e: any) {
      setError(e?.message || "Could not refresh interviews.");
    } finally {
      setBusy(false);
    }
  }

  const upcomingView = useMemo(() => upcoming.filter((item) => !isCancelled(item)), [upcoming]);
  const pastView = useMemo(() => {
    const items = past.filter((item) => !isCancelled(item));
    return items.sort((a, b) => {
      const aDate = parseDateUtc(a.scheduled_start_at);
      const bDate = parseDateUtc(b.scheduled_start_at);
      const aTime = aDate ? aDate.getTime() : 0;
      const bTime = bDate ? bDate.getTime() : 0;
      return bTime - aTime;
    });
  }, [past]);
  const pendingSprintCount = sprints.length;
  const reviewerOptions = useMemo(() => {
    const map = new Map<string, string>();
    sprints.forEach((sprint) => {
      if (sprint.reviewed_by_person_id_platform) {
        const label = sprint.reviewed_by_name || sprint.reviewed_by_email || sprint.reviewed_by_person_id_platform;
        map.set(sprint.reviewed_by_person_id_platform, label);
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [sprints]);
  const filteredSprints = useMemo(() => {
    return sprints.filter((sprint) => {
      if (sprintStatusFilter !== "all" && sprint.status !== sprintStatusFilter) return false;
      if (sprintReviewerFilter === "unassigned") {
        if (sprint.reviewed_by_person_id_platform) return false;
      } else if (sprintReviewerFilter !== "all") {
        if (sprint.reviewed_by_person_id_platform !== sprintReviewerFilter) return false;
      }
      if (sprintOverdueOnly) {
        if (!sprint.due_at) return false;
        const due = parseDateUtc(sprint.due_at);
        if (!due || Number.isNaN(due.getTime())) return false;
        if (due.getTime() > Date.now()) return false;
      }
      return true;
    });
  }, [sprints, sprintStatusFilter, sprintReviewerFilter, sprintOverdueOnly]);

  const filteredPast = useMemo(() => {
    return pastView.filter((item) => {
      if (pastRoundFilter !== "all") {
        const round = item.round_type.toLowerCase();
        if (!round.includes(pastRoundFilter)) return false;
      }
      if (pastStatusFilter !== "all") {
        const status = (item.interview_status || "").toLowerCase();
        if (status !== pastStatusFilter) return false;
      }
      return true;
    });
  }, [pastView, pastRoundFilter, pastStatusFilter]);

  const visiblePast = useMemo(() => {
    if (pastShowAll) return filteredPast;
    return filteredPast.slice(0, 3);
  }, [filteredPast, pastShowAll]);
  const pastTaken = useMemo(() => visiblePast.filter((item) => (item.interview_status || "").toLowerCase() === "taken"), [visiblePast]);
  const pastNotTaken = useMemo(() => visiblePast.filter((item) => (item.interview_status || "").toLowerCase() === "not_taken"), [visiblePast]);
  const pastOther = useMemo(
    () => visiblePast.filter((item) => !["taken", "not_taken"].includes((item.interview_status || "").toLowerCase())),
    [visiblePast]
  );

  async function refreshSprints() {
    setSprintsBusy(true);
    setSprintsError(null);
    try {
      const pendingSprints = await fetchSprints({ ...(useMeFilter ? { reviewer: "me" } : {}), status: "submitted" });
      setSprints(pendingSprints);
    } catch (e: any) {
      setSprintsError(e?.message || "Could not load sprint reviews.");
    } finally {
      setSprintsBusy(false);
    }
  }

  function openSprintReview(sprint: CandidateSprint) {
    setActiveSprint(sprint);
    setSprintForm({
      score_overall: sprint.score_overall != null ? String(sprint.score_overall) : "",
      decision: sprint.decision || "",
      comments_internal: sprint.comments_internal || "",
      comments_for_candidate: sprint.comments_for_candidate || "",
    });
    setSprintsError(null);
  }

  async function handleSprintSubmit() {
    if (!activeSprint) return;
    setSprintsBusy(true);
    setSprintsError(null);
    try {
      await submitSprintReview(activeSprint.candidate_sprint_id, {
        status: "completed",
        score_overall: sprintForm.score_overall ? Number(sprintForm.score_overall) : undefined,
        comments_internal: sprintForm.comments_internal || undefined,
        comments_for_candidate: sprintForm.comments_for_candidate || undefined,
        decision: sprintForm.decision || undefined,
      });
      await refreshSprints();
      setActiveSprint(null);
    } catch (e: any) {
      setSprintsError(e?.message || "Sprint review failed.");
    } finally {
      setSprintsBusy(false);
    }
  }

  async function handleAssignReviewer(sprint: CandidateSprint, person: PlatformPersonSuggestion | null) {
    setAssignBusy(true);
    setAssignError(null);
    try {
      const updated = await assignSprintReviewer(sprint.candidate_sprint_id, person ? person.person_id : null);
      setSprints((prev) => prev.map((item) => (item.candidate_sprint_id === updated.candidate_sprint_id ? updated : item)));
      setAssignSprint(null);
      setAssignQuery("");
      setAssignResults([]);
    } catch (e: any) {
      setAssignError(e?.message || "Could not assign reviewer.");
    } finally {
      setAssignBusy(false);
    }
  }

  useEffect(() => {
    void refreshSprints();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let pending = false;
    const source = new EventSource("/api/rec/events/stream");

    async function refreshAll() {
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      try {
        await refresh();
        await refreshSprints();
      } finally {
        inFlight = false;
        if (pending && !cancelled) {
          pending = false;
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
  }, []);

  useEffect(() => {
    if (!assignSprint) return;
    if (!assignQuery.trim()) {
      setAssignResults([]);
      return;
    }
    let active = true;
    const handle = window.setTimeout(async () => {
      try {
        const results = await fetchPeople(assignQuery.trim());
        if (active) setAssignResults(results);
      } catch {
        if (active) setAssignResults([]);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [assignQuery, assignSprint]);

  function assessmentValue(path: string[]) {
    if (!assessment?.data || typeof assessment.data !== "object") return "";
    let cursor: any = assessment.data;
    for (const key of path) {
      if (!cursor || typeof cursor !== "object") return "";
      cursor = cursor[key];
    }
    return cursor ? String(cursor) : "";
  }

  return (
    <main className="content-pad space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-tight text-slate-600">Focus mode</p>
          <h1 className="text-2xl font-semibold">Interviewer cockpit</h1>
        </div>
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : null}
      </div>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="section-card">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Upcoming interviews</p>
            <span className="text-xs text-slate-600">Next 7 days</span>
          </div>
          <div className="mt-3 space-y-2">
            {upcomingView.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/30 p-4 text-sm text-slate-600">
                No interviews scheduled yet.
              </div>
            ) : (
              upcomingView.map((slot) => (
                <InterviewCard
                  key={slot.candidate_interview_id}
                  interview={slot}
                  onSelect={openAssessment}
                  onCancel={handleCancel}
                  onReschedule={handleReschedule}
                />
              ))
            )}
          </div>
        </div>

        <div className="section-card border-slate-200">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Past interviews</p>
            <span className="text-xs text-slate-600">Last interviews</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 rounded-2xl border border-white/60 bg-white/40 p-3">
            <label className="text-xs font-semibold text-slate-600">
              Round
              <select
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                value={pastRoundFilter}
                onChange={(event) => setPastRoundFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="l1">L1</option>
                <option value="l2">L2</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Status
              <select
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                value={pastStatusFilter}
                onChange={(event) => setPastStatusFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="taken">Taken</option>
                <option value="not_taken">Not taken</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={pastShowAll}
                onChange={(event) => setPastShowAll(event.target.checked)}
              />
              Show all
            </label>
          </div>
          <div className="mt-3 space-y-2">
            {visiblePast.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/30 p-4 text-sm text-slate-600">
                No past interviews yet.
              </div>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Interview taken</p>
                  <div className="mt-2 space-y-2">
                    {pastTaken.length === 0 ? (
                      <p className="text-sm text-slate-600">No interviews marked as taken.</p>
                    ) : (
                      pastTaken.map((item) => (
                        <button
                          key={item.candidate_interview_id}
                          type="button"
                          className="w-full rounded-2xl border border-white/60 bg-white/40 px-3 py-2 text-left hover:bg-white/70"
                          onClick={() => void openAssessment(item)}
                        >
                          <div className="flex items-center gap-2">
                            <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", chipTone("blue"))}>{item.round_type}</span>
                            <p className="text-sm font-medium text-slate-900">{item.candidate_name || `Candidate ${item.candidate_id}`}</p>
                            <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", chipTone("green"))}>Interview taken</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">
                            {item.opening_title || "Opening"} - {formatDateTime(item.scheduled_start_at)}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
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
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Interview not taken</p>
                  <div className="mt-2 space-y-2">
                    {pastNotTaken.length === 0 ? (
                      <p className="text-sm text-slate-600">No interviews marked as not taken.</p>
                    ) : (
                      pastNotTaken.map((item) => (
                        <button
                          key={item.candidate_interview_id}
                          type="button"
                          className="w-full rounded-2xl border border-white/60 bg-white/40 px-3 py-2 text-left hover:bg-white/70"
                          onClick={() => void openAssessment(item)}
                        >
                          <div className="flex items-center gap-2">
                            <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", chipTone("blue"))}>{item.round_type}</span>
                            <p className="text-sm font-medium text-slate-900">{item.candidate_name || `Candidate ${item.candidate_id}`}</p>
                            <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", chipTone("amber"))}>Interview not taken</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">
                            {item.opening_title || "Opening"} - {formatDateTime(item.scheduled_start_at)}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
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
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {pastOther.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-tight text-slate-500">Other past interviews</p>
                    <div className="mt-2 space-y-2">
                      {pastOther.map((item) => (
                        <button
                          key={item.candidate_interview_id}
                          type="button"
                          className="w-full rounded-2xl border border-white/60 bg-white/40 px-3 py-2 text-left hover:bg-white/70"
                          onClick={() => void openAssessment(item)}
                        >
                          <div className="flex items-center gap-2">
                            <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", chipTone("blue"))}>{item.round_type}</span>
                            <p className="text-sm font-medium text-slate-900">{item.candidate_name || `Candidate ${item.candidate_id}`}</p>
                            {interviewStatusLabel(item.interview_status) ? (
                              <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", chipTone("neutral"))}>
                                {interviewStatusLabel(item.interview_status)}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-slate-600">
                            {item.opening_title || "Opening"} - {formatDateTime(item.scheduled_start_at)}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
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
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
            {!pastShowAll && filteredPast.length > 3 ? (
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                onClick={() => setPastShowAll(true)}
              >
                View all ({filteredPast.length})
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Pending sprint reviews</p>
            <p className="text-xs text-slate-600">Submitted sprints awaiting decision. {pendingSprintCount} pending.</p>
          </div>
          {sprintsBusy ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : null}
        </div>

        {sprintsError ? <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">{sprintsError}</div> : null}

        <div className="mt-3 flex flex-wrap gap-3 rounded-2xl border border-white/60 bg-white/40 p-3">
          <label className="text-xs font-semibold text-slate-600">
            Status
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              value={sprintStatusFilter}
              onChange={(event) => setSprintStatusFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under review</option>
              <option value="completed">Completed</option>
              <option value="assigned">Assigned</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Reviewer
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              value={sprintReviewerFilter}
              onChange={(event) => setSprintReviewerFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="unassigned">Unassigned</option>
              {reviewerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={sprintOverdueOnly}
              onChange={(event) => setSprintOverdueOnly(event.target.checked)}
            />
            Overdue only
          </label>
        </div>

        <div className="mt-3 space-y-2">
          {filteredSprints.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/30 p-4 text-sm text-slate-600">
              No sprint submissions waiting for review.
            </div>
          ) : (
            filteredSprints.map((sprint) => (
              <button
                key={sprint.candidate_sprint_id}
                type="button"
                className="flex w-full flex-col gap-2 rounded-2xl border border-white/60 bg-white/40 p-3 text-left transition hover:bg-white/70"
                onClick={() => openSprintReview(sprint)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{sprint.candidate_name || `Candidate ${sprint.candidate_id}`}</p>
                    <p className="text-xs text-slate-600">{sprint.opening_title || "Opening"} - {sprint.template_name || "Sprint"}</p>
                    <p className="text-xs text-slate-600">
                      Reviewer: {sprint.reviewed_by_name || sprint.reviewed_by_email || "Unassigned"}
                    </p>
                  </div>
                  <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", chipTone("amber"))}>
                    {sprint.status.replace("_", " ")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  {sprint.submitted_at ? <span>Submitted {formatDateTime(sprint.submitted_at)}</span> : null}
                  {sprint.due_at ? <span>Due {formatDateTime(sprint.due_at)}</span> : null}
                </div>
                {canAssignReviewer ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                      onClick={(event) => {
                        event.stopPropagation();
                        setAssignSprint(sprint);
                        setAssignQuery("");
                        setAssignResults([]);
                        setAssignError(null);
                      }}
                    >
                      {sprint.reviewed_by_person_id_platform ? "Change reviewer" : "Assign reviewer"}
                    </button>
                    {sprint.reviewed_by_person_id_platform ? (
                      <button
                        type="button"
                        className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleAssignReviewer(sprint, null);
                        }}
                      >
                        Unassign
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </button>
            ))
          )}
        </div>
      </section>

      {active ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-white/20 bg-white/95 p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-tight text-slate-500">Assessment summary</p>
                <h2 className="text-xl font-semibold">{activeCandidateLabel}</h2>
                <p className="text-xs text-slate-600">
                  {active.round_type} - {formatDateTime(active.scheduled_start_at)} - {active.location || "Location TBD"}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                onClick={() => setActive(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                Assessment status: {assessment?.status || "Not started"}
              </div>
              {(() => {
                const activeMode = assessmentModeForInterview(active);
                const pdfSlug = activeMode === "l1" ? "l1-assessment" : "l2-assessment";
                return assessment ? (
                  <a
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                    href={`/api/rec/interviews/${encodeURIComponent(String(active.candidate_interview_id))}/${pdfSlug}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download PDF
                  </a>
                ) : null;
              })()}
            </div>

            {assessmentBusy ? (
              <div className="mt-4 text-sm text-slate-600">Loading assessment...</div>
            ) : assessmentError ? (
              <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
                {assessmentError}
              </div>
            ) : !assessment ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                No assessment has been submitted yet.
              </div>
            ) : (
              <div className="mt-4 space-y-4 text-sm text-slate-700">
                {assessmentModeForInterview(active) === "l1" ? (
                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                    <p className="text-xs uppercase tracking-tight text-slate-500">L1 assessment summary</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <div><span className="text-xs text-slate-500">Role clarity</span><p className="font-semibold">{assessmentValue(["section1", "role_clarity"]) || "-"}</p></div>
                      <div><span className="text-xs text-slate-500">6-month priorities</span><p className="font-semibold">{assessmentValue(["section1", "six_month_priorities"]) || "-"}</p></div>
                      <div><span className="text-xs text-slate-500">Big picture thinking</span><p className="font-semibold">{assessmentValue(["section2", "big_picture"]) || "-"}</p></div>
                      <div><span className="text-xs text-slate-500">Authentic</span><p className="font-semibold">{assessmentValue(["section3", "authentic"]) || "-"}</p></div>
                      <div><span className="text-xs text-slate-500">Manager expectations</span><p className="font-semibold">{assessmentValue(["section3", "manager_expectations"]) || "-"}</p></div>
                      <div><span className="text-xs text-slate-500">Lotus meets expectations</span><p className="font-semibold">{assessmentValue(["section3", "lotus_meet_expectations"]) || "-"}</p></div>
                      <div><span className="text-xs text-slate-500">High potential</span><p className="font-semibold">{assessmentValue(["section4", "high_potential"]) || "-"}</p></div>
                      <div><span className="text-xs text-slate-500">High potential notes</span><p className="font-semibold">{assessmentValue(["section4", "manager_notes"]) || "-"}</p></div>
                      <div><span className="text-xs text-slate-500">Good to hire</span><p className="font-semibold">{assessmentValue(["section5", "good_to_hire"]) || "-"}</p></div>
                      <div><span className="text-xs text-slate-500">Decision comments</span><p className="font-semibold">{assessmentValue(["section5", "decision_comments"]) || "-"}</p></div>
                      <div className="md:col-span-2"><span className="text-xs text-slate-500">Closing comments</span><p className="font-semibold">{assessmentValue(["section6", "closing_comments"]) || "-"}</p></div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                      <p className="text-xs uppercase tracking-tight text-slate-500">HR screening (Pre L2)</p>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <div><span className="text-xs text-slate-500">Candidate Name</span><p className="font-semibold">{assessmentValue(["pre_interview", "candidate_name"]) || "-"}</p></div>
                        <div><span className="text-xs text-slate-500">Team Lead</span><p className="font-semibold">{assessmentValue(["pre_interview", "team_lead"]) || "-"}</p></div>
                        <div><span className="text-xs text-slate-500">Preferred DOJ</span><p className="font-semibold">{assessmentValue(["pre_interview", "preferred_joining_date"]) || "-"}</p></div>
                        <div><span className="text-xs text-slate-500">2-year commitment</span><p className="font-semibold">{assessmentValue(["pre_interview", "two_year_commitment"]) || "-"}</p></div>
                        <div><span className="text-xs text-slate-500">On-site / Timings</span><p className="font-semibold">{assessmentValue(["pre_interview", "on_site_timings"]) || "-"}</p></div>
                        <div><span className="text-xs text-slate-500">Relocation support</span><p className="font-semibold">{assessmentValue(["pre_interview", "family_support"]) || "-"}</p></div>
                        <div className="md:col-span-2"><span className="text-xs text-slate-500">Other questions</span><p className="font-semibold">{assessmentValue(["pre_interview", "other_questions"]) || "-"}</p></div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                      <p className="text-xs uppercase tracking-tight text-slate-500">Section 7 summary</p>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <div><span className="text-xs text-slate-500">Open to feedback</span><p className="font-semibold">{assessmentValue(["section7", "assess_open_feedback"]) || "-"}</p></div>
                        <div><span className="text-xs text-slate-500">Coachable</span><p className="font-semibold">{assessmentValue(["section7", "assess_coachable"]) || "-"}</p></div>
                        <div><span className="text-xs text-slate-500">Good to hire</span><p className="font-semibold">{assessmentValue(["section7", "assess_good_to_hire"]) || "-"}</p></div>
                        <div className="md:col-span-2"><span className="text-xs text-slate-500">L1 focus notes</span><p className="font-semibold">{assessmentValue(["section7", "l1_focus_notes"]) || "-"}</p></div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <UserRound className="h-3.5 w-3.5" />
                {active.interviewer_name || "You"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/gl-portal?interview=${encodeURIComponent(String(active.candidate_interview_id))}`}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Open assessment portal
                </Link>
                <Link
                  href={`/candidates/${encodeURIComponent(String(active.candidate_id))}`}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  View candidate
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeSprint ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-white/20 bg-white/95 p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-tight text-slate-500">Sprint review</p>
                <h2 className="text-xl font-semibold">{activeSprint.candidate_name || `Candidate ${activeSprint.candidate_id}`}</h2>
                <p className="text-xs text-slate-600">{activeSprint.template_name || "Sprint"} - {activeSprint.opening_title || "Opening"}</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                onClick={() => setActiveSprint(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-2 text-sm text-slate-700">
              {activeSprint.instructions_url ? (
                <a className="inline-flex items-center gap-2 underline decoration-dotted underline-offset-2" href={activeSprint.instructions_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" /> Sprint brief
                </a>
              ) : null}
              {activeSprint.submission_url ? (
                <a className="inline-flex items-center gap-2 underline decoration-dotted underline-offset-2" href={activeSprint.submission_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" /> Submission link
                </a>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3">
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
                  <option value="">Select</option>
                  <option value="advance">Advance</option>
                  <option value="reject">Reject</option>
                  <option value="keep_warm">Keep warm</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-600">
                Internal comments
                <textarea
                  className="h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={sprintForm.comments_internal}
                  onChange={(e) => setSprintForm((prev) => ({ ...prev, comments_internal: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-xs text-slate-600">
                Comments for candidate
                <textarea
                  className="h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={sprintForm.comments_for_candidate}
                  onChange={(e) => setSprintForm((prev) => ({ ...prev, comments_for_candidate: e.target.value }))}
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                onClick={() => setActiveSprint(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                onClick={() => void handleSprintSubmit()}
                disabled={sprintsBusy}
              >
                {sprintsBusy ? "Saving..." : "Submit review"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {assignSprint ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/20 bg-white/95 p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-tight text-slate-500">Assign reviewer</p>
                <h2 className="text-lg font-semibold">{assignSprint.candidate_name || `Candidate ${assignSprint.candidate_id}`}</h2>
                <p className="text-xs text-slate-600">{assignSprint.template_name || "Sprint"}</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                onClick={() => setAssignSprint(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Search reviewer</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                  value={assignQuery}
                  onChange={(event) => setAssignQuery(event.target.value)}
                  placeholder="Type name or email"
                  disabled={assignBusy}
                />
              </label>

              {assignError ? (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
                  {assignError}
                </div>
              ) : null}

              <div className="space-y-2">
                {assignResults.length === 0 && assignQuery.trim() ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                    No matches found.
                  </div>
                ) : null}
                {assignResults.map((person) => (
                  <button
                    key={person.person_id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    onClick={() => void handleAssignReviewer(assignSprint, person)}
                    disabled={assignBusy}
                  >
                    <span className="font-semibold text-slate-900">{person.full_name || person.email}</span>
                    <span className="text-xs text-slate-500">{person.email}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
