"use client";

import Link from "next/link";
import { Interview } from "@/lib/types";
import { Chip } from "./Candidate360Primitives";

type ActiveSlotInvite = { round_type: string; expires_at: string | null; count: number };

type Props = {
  sectionRef: React.RefObject<HTMLDivElement>;
  collapsed: boolean;
  onToggle: () => void;
  scheduleAllowed: boolean;
  onScheduleL2: () => void;
  onScheduleL1: () => void;
  interviewsError: string | null;
  interviewsNotice: string | null;
  slotInviteRound: string | null;
  slotInviteCancelBusy: boolean;
  activeSlotInvites: ActiveSlotInvite[];
  onCancelSlotInvite: (roundOverride?: string) => void;
  interviewsBusy: boolean;
  interviews: Interview[] | null;
  interviewUpcoming: Interview[];
  interviewPast: Interview[];
  interviewTaken: Interview[];
  interviewNotTaken: Interview[];
  interviewPastOther: Interview[];
  formatInviteExpiry: (raw?: string | null) => string;
  formatDateTime: (raw?: string | null) => string;
  chipTone: (kind: "neutral" | "green" | "amber" | "red" | "blue") => string;
  decisionTone: (decision?: string | null) => string;
  isNotTaken: (item: Interview) => boolean;
  isCancelled: (item: Interview) => boolean;
  canSchedule: boolean;
  canCancelInterview: boolean;
  busy: boolean;
  onRescheduleInterview: (item: Interview) => void;
  onCancelInterview: (item: Interview) => void;
  expandedInterviewId: number | null;
  onToggleExpandedInterview: (candidateInterviewId: number) => void;
};

export function Candidate360InterviewsSection({
  sectionRef,
  collapsed,
  onToggle,
  scheduleAllowed,
  onScheduleL2,
  onScheduleL1,
  interviewsError,
  interviewsNotice,
  slotInviteRound,
  slotInviteCancelBusy,
  activeSlotInvites,
  onCancelSlotInvite,
  interviewsBusy,
  interviews,
  interviewUpcoming,
  interviewPast,
  interviewTaken,
  interviewNotTaken,
  interviewPastOther,
  formatInviteExpiry,
  formatDateTime,
  chipTone,
  decisionTone,
  isNotTaken,
  isCancelled,
  canSchedule,
  canCancelInterview,
  busy,
  onRescheduleInterview,
  onCancelInterview,
  expandedInterviewId,
  onToggleExpandedInterview,
}: Props) {
  return (
    <div ref={sectionRef} className="section-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-tight text-slate-500">Interviews</p>
        </div>
        <div className="ml-auto flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
            onClick={onToggle}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>

      {collapsed ? null : (
        <>
          <p className="mt-2 text-sm text-slate-600">Scheduling, feedback, and outcomes in one view.</p>
          {scheduleAllowed ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                onClick={onScheduleL2}
              >
                Schedule L2 interview
              </button>
              <button
                type="button"
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                onClick={onScheduleL1}
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
                  onCancelSlotInvite();
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
                      onCancelSlotInvite(invite.round_type);
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
                              onClick={() => onRescheduleInterview(item)}
                              disabled={busy}
                            >
                              Reschedule
                            </button>
                          ) : null}
                          {canCancelInterview ? (
                            <button
                              type="button"
                              className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                              onClick={() => onCancelInterview(item)}
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
                                onClick={() => onToggleExpandedInterview(item.candidate_interview_id)}
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
                                    <Link
                                      className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 underline decoration-dotted underline-offset-2"
                                      href={`/interviews/${encodeURIComponent(String(item.candidate_interview_id))}`}
                                    >
                                      {item.round_type.toLowerCase().includes("l1") ? "Open L1 assessment" : "Open L2 assessment"}
                                    </Link>
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
                                  onClick={() => onRescheduleInterview(item)}
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
  );
}
