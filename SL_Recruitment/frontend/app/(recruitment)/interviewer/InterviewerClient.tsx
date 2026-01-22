"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { CalendarCheck2, ExternalLink, Loader2, UserRound } from "lucide-react";
import Link from "next/link";
import { CandidateSprint, Interview, L2Assessment } from "@/lib/types";
import { parseDateUtc } from "@/lib/datetime";

type Props = {
  initialUpcoming: Interview[];
  initialPast: Interview[];
  useMeFilter: boolean;
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

async function fetchInterviews(params: Record<string, string>) {
  const url = new URL("/api/rec/interviews", window.location.origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Interview[];
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

async function submitSprintReview(sprintId: number, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/sprints/${encodeURIComponent(String(sprintId))}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateSprint;
}

function InterviewCard({ interview, onSelect }: { interview: Interview; onSelect: (item: Interview) => void }) {
  const label = interview.round_type || "Interview";
  const candidate = interview.candidate_name || `Candidate ${interview.candidate_id}`;
  const role = interview.opening_title || "Opening";
  const feedbackStage = stageLabel(interview.stage_name);
  return (
    <button
      type="button"
      className="flex w-full flex-col gap-2 rounded-2xl border border-white/60 bg-white/40 p-3 text-left transition hover:bg-white/70"
      onClick={() => onSelect(interview)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{candidate}</p>
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
    </button>
  );
}

export function InterviewerClient({ initialUpcoming, initialPast, useMeFilter }: Props) {
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
  const pastView = useMemo(() => past.filter((item) => !isCancelled(item)), [past]);

  async function refreshSprints() {
    setSprintsBusy(true);
    setSprintsError(null);
    try {
      const pendingSprints = await fetchSprints({ reviewer: "me", status: "submitted" });
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
              upcomingView.map((slot) => <InterviewCard key={slot.candidate_interview_id} interview={slot} onSelect={openAssessment} />)
            )}
          </div>
        </div>

        <div className="section-card border-slate-200">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Past interviews</p>
            <span className="text-xs text-slate-600">Last interviews</span>
          </div>
          <div className="mt-3 space-y-2">
            {pastView.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/30 p-4 text-sm text-slate-600">
                No past interviews yet.
              </div>
            ) : (
              pastView.map((item) => (
                <button
                  key={item.candidate_interview_id}
                  type="button"
                  className="w-full rounded-2xl border border-white/60 bg-white/40 px-3 py-2 text-left hover:bg-white/70"
                  onClick={() => void openAssessment(item)}
                >
                  <div className="flex items-center gap-2">
                    <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", chipTone("blue"))}>{item.round_type}</span>
                    <p className="text-sm font-medium text-slate-900">{item.candidate_name || `Candidate ${item.candidate_id}`}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{item.opening_title || "Opening"} - {formatDateTime(item.scheduled_start_at)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Pending sprint reviews</p>
            <p className="text-xs text-slate-600">Submitted sprints awaiting decision.</p>
          </div>
          {sprintsBusy ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : null}
        </div>

        {sprintsError ? <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">{sprintsError}</div> : null}

        <div className="mt-3 space-y-2">
          {sprints.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/30 p-4 text-sm text-slate-600">
              No sprint submissions waiting for review.
            </div>
          ) : (
            sprints.map((sprint) => (
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
                  </div>
                  <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", chipTone("amber"))}>
                    {sprint.status.replace("_", " ")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  {sprint.submitted_at ? <span>Submitted {formatDateTime(sprint.submitted_at)}</span> : null}
                  {sprint.due_at ? <span>Due {formatDateTime(sprint.due_at)}</span> : null}
                </div>
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
    </main>
  );
}
