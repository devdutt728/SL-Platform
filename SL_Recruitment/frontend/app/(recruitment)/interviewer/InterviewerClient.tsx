"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { CalendarCheck2, ExternalLink, Loader2, UserRound } from "lucide-react";
import { CandidateSprint, Interview } from "@/lib/types";
import { parseDateUtc } from "@/lib/datetime";

type Props = {
  initialUpcoming: Interview[];
  initialPending: Interview[];
};

type FeedbackForm = {
  rating_overall: string;
  rating_technical: string;
  rating_culture_fit: string;
  rating_communication: string;
  decision: string;
  strengths: string;
  concerns: string;
  notes_internal: string;
};

type SprintReviewForm = {
  score_overall: string;
  decision: string;
  comments_internal: string;
  comments_for_candidate: string;
};

const ratingOptions = ["", "1", "2", "3", "4", "5"];

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

function chipTone(kind: "neutral" | "green" | "amber" | "red" | "blue") {
  if (kind === "green") return "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/20";
  if (kind === "amber") return "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/20";
  if (kind === "red") return "bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/20";
  if (kind === "blue") return "bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/20";
  return "bg-slate-500/10 text-slate-700 ring-1 ring-slate-500/15";
}

function parseInternalNotes(raw?: string | null) {
  const empty = { strengths: "", concerns: "" };
  if (!raw) return { ...empty, other: "" };
  const strengthMatch = raw.match(/Strengths:\\s*([\\s\\S]*?)(?:\\n\\nConcerns:|$)/i);
  const concernsMatch = raw.match(/Concerns:\\s*([\\s\\S]*?)(?:\\n\\nNotes:|$)/i);
  const notesMatch = raw.match(/Notes:\\s*([\\s\\S]*)/i);
  const strengths = strengthMatch?.[1]?.trim() || "";
  const concerns = concernsMatch?.[1]?.trim() || "";
  const other = notesMatch?.[1]?.trim() || (strengths || concerns ? "" : raw.trim());
  return { strengths, concerns, other };
}

function buildInternalNotes(form: FeedbackForm) {
  const chunks = [
    `Strengths:\\n${form.strengths || "-"}`,
    `Concerns:\\n${form.concerns || "-"}`,
  ];
  if (form.notes_internal) {
    chunks.push(`Notes:\\n${form.notes_internal}`);
  }
  return chunks.join("\\n\\n").trim();
}

async function fetchInterviews(params: Record<string, string>) {
  const url = new URL("/api/rec/interviews", window.location.origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Interview[];
}

async function submitFeedback(interviewId: number, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Interview;
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
        <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", chipTone("blue"))}>{label}</span>
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

export function InterviewerClient({ initialUpcoming, initialPending }: Props) {
  const [upcoming, setUpcoming] = useState<Interview[]>(initialUpcoming);
  const [pending, setPending] = useState<Interview[]>(initialPending);
  const [active, setActive] = useState<Interview | null>(null);
  const [form, setForm] = useState<FeedbackForm>({
    rating_overall: "",
    rating_technical: "",
    rating_culture_fit: "",
    rating_communication: "",
    decision: "",
    strengths: "",
    concerns: "",
    notes_internal: "",
  });
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

  const pendingCount = pending.length;

  const activeCandidateLabel = useMemo(() => {
    if (!active) return "";
    return active.candidate_name || `Candidate ${active.candidate_id}`;
  }, [active]);

  function openFeedback(interview: Interview) {
    const parsed = parseInternalNotes(interview.notes_internal);
    setActive(interview);
    setForm({
      rating_overall: interview.rating_overall ? String(interview.rating_overall) : "",
      rating_technical: interview.rating_technical ? String(interview.rating_technical) : "",
      rating_culture_fit: interview.rating_culture_fit ? String(interview.rating_culture_fit) : "",
      rating_communication: interview.rating_communication ? String(interview.rating_communication) : "",
      decision: interview.decision || "",
      strengths: parsed.strengths,
      concerns: parsed.concerns,
      notes_internal: parsed.other,
    });
    setError(null);
  }

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const [nextUpcoming, nextPending] = await Promise.all([
        fetchInterviews({ interviewer: "me", upcoming: "true" }),
        fetchInterviews({ interviewer: "me", pending_feedback: "true" }),
      ]);
      setUpcoming(nextUpcoming);
      setPending(nextPending);
    } catch (e: any) {
      setError(e?.message || "Could not refresh interviews.");
    } finally {
      setBusy(false);
    }
  }

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

  async function handleSubmit() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        feedback_submitted: true,
        decision: form.decision || undefined,
        rating_overall: form.rating_overall ? Number(form.rating_overall) : undefined,
        rating_technical: form.rating_technical ? Number(form.rating_technical) : undefined,
        rating_culture_fit: form.rating_culture_fit ? Number(form.rating_culture_fit) : undefined,
        rating_communication: form.rating_communication ? Number(form.rating_communication) : undefined,
        notes_internal: buildInternalNotes(form),
      };
      await submitFeedback(active.candidate_interview_id, payload);
      await refresh();
      setActive(null);
    } catch (e: any) {
      setError(e?.message || "Feedback submission failed.");
    } finally {
      setBusy(false);
    }
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
            {upcoming.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/30 p-4 text-sm text-slate-600">
                No interviews scheduled yet.
              </div>
            ) : (
              upcoming.map((slot) => <InterviewCard key={slot.candidate_interview_id} interview={slot} onSelect={openFeedback} />)
            )}
          </div>
        </div>

        <div className="section-card border-amber-400/50">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Pending feedback</p>
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-600">{pendingCount}</span>
          </div>
          <div className="mt-3 space-y-2">
            {pending.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-500/5 p-4 text-sm text-amber-700">
                All feedback is up to date.
              </div>
            ) : (
              pending.map((item) => (
                <button
                  key={item.candidate_interview_id}
                  type="button"
                  className="w-full rounded-2xl border border-white/60 bg-white/40 px-3 py-2 text-left hover:bg-white/70"
                  onClick={() => openFeedback(item)}
                >
                  <div className="flex items-center gap-2">
                    <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", chipTone("amber"))}>{item.round_type}</span>
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
                <p className="text-xs uppercase tracking-tight text-slate-500">Feedback</p>
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

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-600">
                Overall rating
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={form.rating_overall}
                  onChange={(e) => setForm((prev) => ({ ...prev, rating_overall: e.target.value }))}
                >
                  {ratingOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt || "Select"}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-600">
                Technical rating
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={form.rating_technical}
                  onChange={(e) => setForm((prev) => ({ ...prev, rating_technical: e.target.value }))}
                >
                  {ratingOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt || "Select"}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-600">
                Culture fit rating
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={form.rating_culture_fit}
                  onChange={(e) => setForm((prev) => ({ ...prev, rating_culture_fit: e.target.value }))}
                >
                  {ratingOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt || "Select"}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-600">
                Communication rating
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={form.rating_communication}
                  onChange={(e) => setForm((prev) => ({ ...prev, rating_communication: e.target.value }))}
                >
                  {ratingOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt || "Select"}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-tight text-slate-500">Decision</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { value: "advance", label: "Advance" },
                  { value: "reject", label: "Reject" },
                  { value: "keep_warm", label: "Keep warm" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={clsx(
                      "rounded-full px-4 py-2 text-xs font-semibold",
                      form.decision === option.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                    )}
                    onClick={() => setForm((prev) => ({ ...prev, decision: option.value }))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="space-y-1 text-xs text-slate-600">
                Strengths
                <textarea
                  className="h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={form.strengths}
                  onChange={(e) => setForm((prev) => ({ ...prev, strengths: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-xs text-slate-600">
                Concerns
                <textarea
                  className="h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={form.concerns}
                  onChange={(e) => setForm((prev) => ({ ...prev, concerns: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-xs text-slate-600">
                Notes
                <textarea
                  className="h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={form.notes_internal}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes_internal: e.target.value }))}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <UserRound className="h-3.5 w-3.5" />
                {active.interviewer_name || "You"}
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/candidates/${encodeURIComponent(String(active.candidate_id))}`}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  View candidate
                </Link>
                <button
                  type="button"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                  onClick={() => void handleSubmit()}
                  disabled={busy}
                >
                  {busy ? "Saving..." : "Submit feedback"}
                </button>
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
