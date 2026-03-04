"use client";

import { PlatformPersonSuggestion } from "@/lib/types";

type SlotPreview = {
  slot_start_at: string;
  slot_end_at: string;
  label: string;
};

type Props = {
  panelRef: React.RefObject<HTMLDivElement>;
  open: boolean;
  rescheduleInterviewId: number | null;
  scheduleRound: string;
  setScheduleRound: (value: string) => void;
  personQuery: string;
  setPersonQuery: (value: string) => void;
  scheduleInterviewer: PlatformPersonSuggestion | null;
  personOpen: boolean;
  setPersonOpen: (value: boolean) => void;
  personResults: PlatformPersonSuggestion[];
  personHighlight: number;
  setPersonHighlight: React.Dispatch<React.SetStateAction<number>>;
  personBusy: boolean;
  onPickInterviewer: (person: PlatformPersonSuggestion) => void;
  slotPreviewDate: string;
  setSlotPreviewDate: (value: string) => void;
  slotPreviewBusy: boolean;
  slotPreviewError: string | null;
  slotPreviewSlots: SlotPreview[];
  selectedSlot: SlotPreview | null;
  onSelectSlot: (slot: SlotPreview) => void;
  scheduleLocation: string;
  setScheduleLocation: (value: string) => void;
  scheduleMeetLink: string;
  setScheduleMeetLink: (value: string) => void;
  scheduleReason: string;
  setScheduleReason: (value: string) => void;
  scheduleEmailPreviewError: string | null;
  slotInviteBusy: boolean;
  interviewsBusy: boolean;
  scheduleEmailPreviewBusy: boolean;
  onClose: () => void;
  onSendSlotInvite: () => void;
  onPreviewEmail: () => void;
  onSubmit: () => void;
};

export function Candidate360SchedulePanel({
  panelRef,
  open,
  rescheduleInterviewId,
  scheduleRound,
  setScheduleRound,
  personQuery,
  setPersonQuery,
  scheduleInterviewer,
  personOpen,
  setPersonOpen,
  personResults,
  personHighlight,
  setPersonHighlight,
  personBusy,
  onPickInterviewer,
  slotPreviewDate,
  setSlotPreviewDate,
  slotPreviewBusy,
  slotPreviewError,
  slotPreviewSlots,
  selectedSlot,
  onSelectSlot,
  scheduleLocation,
  setScheduleLocation,
  scheduleMeetLink,
  setScheduleMeetLink,
  scheduleReason,
  setScheduleReason,
  scheduleEmailPreviewError,
  slotInviteBusy,
  interviewsBusy,
  scheduleEmailPreviewBusy,
  onClose,
  onSendSlotInvite,
  onPreviewEmail,
  onSubmit,
}: Props) {
  if (!open) return null;

  return (
    <div ref={panelRef} className="rounded-2xl border border-white/60 bg-white/40 p-4 shadow-card">
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
          onClick={onClose}
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
                    onPickInterviewer(pick);
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
                        onPickInterviewer(person);
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
                              onSelectSlot(slot);
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
          onClick={onClose}
        >
          Cancel
        </button>
          <button
            type="button"
            className="rounded-xl border border-slate-900/20 bg-white px-4 py-2 text-xs font-semibold text-slate-900"
            onClick={onSendSlotInvite}
            disabled={slotInviteBusy || interviewsBusy}
          >
            {slotInviteBusy ? "Sending..." : "Send slot options"}
          </button>
          <button
            type="button"
            className="rounded-xl border border-slate-900/20 bg-white px-4 py-2 text-xs font-semibold text-slate-900"
            onClick={onPreviewEmail}
            disabled={scheduleEmailPreviewBusy}
          >
            {scheduleEmailPreviewBusy ? "Loading..." : "Preview email"}
          </button>
          <button
            type="button"
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
            onClick={onSubmit}
            disabled={interviewsBusy}
        >
          {interviewsBusy ? "Saving..." : rescheduleInterviewId ? "Reschedule interview" : "Schedule interview"}
        </button>
      </div>
    </div>
  );
}
