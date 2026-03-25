"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReadonlyURLSearchParams } from "next/navigation";
import { Interview, PlatformPersonSuggestion } from "@/lib/types";
import { parseDateUtc } from "@/lib/datetime";
import * as candidate360Api from "./candidate360.api";
import { interviewStatusValue, isCancelledInterview } from "./candidate360.client-utils";

type DialogConfig = {
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "neutral" | "danger" | "success";
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (value?: string) => void | Promise<void>;
};

type ToastPayload = {
  title: string;
  description?: string;
  tone?: "success" | "error" | "warning" | "info";
};

type Args = {
  candidateId: string;
  canSchedule: boolean;
  canSkip: boolean;
  allowL1Scheduling: boolean;
  currentStageKey: string | null;
  refreshAll: () => Promise<void>;
  candidateL2OwnerEmail?: string | null;
  candidateL2OwnerName?: string | null;
  searchParams: ReadonlyURLSearchParams | null;
  handleTransition: (toStage: string, decision: string, reasonOverride?: string) => Promise<void>;
  openDialog: (next: DialogConfig) => void;
  closeDialog: () => void;
  setDialogError: (error: string) => void;
  setBusy: (busy: boolean) => void;
  pushToast: (toast: ToastPayload) => void;
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function useCandidate360Interviews({
  candidateId,
  canSchedule,
  canSkip,
  allowL1Scheduling,
  currentStageKey,
  refreshAll,
  candidateL2OwnerEmail,
  candidateL2OwnerName,
  searchParams,
  handleTransition,
  openDialog,
  closeDialog,
  setDialogError,
  setBusy,
  pushToast,
}: Args) {
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
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleRound, setScheduleRound] = useState("L2");
  const [scheduleStartAt, setScheduleStartAt] = useState("");
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
  const [slotPreviewDate, setSlotPreviewDate] = useState("");
  const [slotPreviewSlots, setSlotPreviewSlots] = useState<candidate360Api.SlotPreview[]>([]);
  const [slotPreviewBusy, setSlotPreviewBusy] = useState(false);
  const [slotPreviewError, setSlotPreviewError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<candidate360Api.SlotPreview | null>(null);
  const [autoRescheduleOpened, setAutoRescheduleOpened] = useState(false);
  const schedulePanelRef = useRef<HTMLDivElement | null>(null);

  const scheduleAllowed = useMemo(() => {
    if (!canSchedule) return false;
    if (canSkip) return true;
    if (rescheduleInterviewId) return true;
    if (!interviews) return false;
    return interviews.length === 0;
  }, [canSchedule, canSkip, interviews, rescheduleInterviewId]);

  const refreshInterviews = useCallback(async () => {
    setInterviewsBusy(true);
    setInterviewsError(null);
    try {
      const list = await candidate360Api.fetchInterviews(candidateId);
      setInterviews(list);
    } catch (e: any) {
      setInterviewsError(e?.message || "Could not load interviews.");
    } finally {
      setInterviewsBusy(false);
    }
  }, [candidateId]);

  const prefillL2Owner = useCallback(
    async (roundType: string) => {
      const roundUpper = roundType.toUpperCase();
      if (roundUpper !== "L2") return;
      const ownerEmail = (candidateL2OwnerEmail || "").trim().toLowerCase();
      if (!ownerEmail) return;
      try {
        const matches = await candidate360Api.fetchPeople(ownerEmail);
        const match = matches.find((item) => (item.email || "").toLowerCase() === ownerEmail) || matches[0];
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
        full_name: candidateL2OwnerName || ownerEmail,
        email: ownerEmail,
      });
      setPersonQuery(candidateL2OwnerName || ownerEmail);
    },
    [candidateL2OwnerEmail, candidateL2OwnerName]
  );

  const openSchedule = useCallback(
    (roundType: string, rescheduleId: number | null = null) => {
      const normalizedRound = roundType.toUpperCase();
      if (!allowL1Scheduling && normalizedRound === "L1") {
        setInterviewsNotice("L1 interviews are disabled for this opening.");
        return;
      }
      const existing = rescheduleId ? interviews?.find((item) => item.candidate_interview_id === rescheduleId) : null;
      setScheduleRound(existing?.round_type || roundType);
      setScheduleStartAt("");
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
    },
    [allowL1Scheduling, interviews, prefillL2Owner]
  );

  useEffect(() => {
    if (!canSchedule) return;
    if (!searchParams || autoRescheduleOpened) return;
    const rescheduleId = searchParams.get("reschedule_interview_id");
    if (!rescheduleId) return;
    const parsedId = Number(rescheduleId);
    if (!Number.isFinite(parsedId)) return;
    const round = searchParams.get("round") || "L2";
    setAutoRescheduleOpened(true);
    openSchedule(round, parsedId);
  }, [searchParams, autoRescheduleOpened, canSchedule, openSchedule]);

  const handleScheduleSubmit = useCallback(async () => {
    setInterviewsError(null);
    setInterviewsNotice(null);
    if (!scheduleInterviewer) {
      setInterviewsError("Select an interviewer.");
      return;
    }
    let resolvedInterviewer = scheduleInterviewer;
    if (!resolvedInterviewer.person_id && resolvedInterviewer.email) {
      try {
        const matches = await candidate360Api.fetchPeople(resolvedInterviewer.email);
        const match =
          matches.find((item) => (item.email || "").toLowerCase() === resolvedInterviewer.email?.toLowerCase()) || matches[0];
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
    const start = parseDateUtc(selectedSlot.slot_start_at);
    const end = parseDateUtc(selectedSlot.slot_end_at);
    const startIso = start?.toISOString() || "";
    const endIso = end?.toISOString() || "";
    if (!startIso || !endIso) {
      setInterviewsError("Selected slot has an invalid time.");
      return;
    }
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setInterviewsError("Selected slot has an invalid time.");
      return;
    }
    if (end <= start) {
      setInterviewsError("End time must be after start time.");
      return;
    }
    setInterviewsBusy(true);
    try {
      if (rescheduleInterviewId) {
        await candidate360Api.rescheduleInterview(rescheduleInterviewId, {
          scheduled_start_at: startIso,
          scheduled_end_at: endIso,
          reason: scheduleReason || undefined,
        });
        setScheduleOpen(false);
        setSelectedSlot(null);
        setRescheduleInterviewId(null);
        await refreshInterviews();
        await refreshAll();
        return;
      }
      await candidate360Api.createInterview(candidateId, {
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
      await refreshAll();
    } catch (e: any) {
      setInterviewsError(e?.message || "Could not schedule interview.");
    } finally {
      setInterviewsBusy(false);
    }
  }, [
    candidateId,
    refreshInterviews,
    rescheduleInterviewId,
    scheduleInterviewer,
    scheduleLocation,
    scheduleMeetLink,
    scheduleReason,
    scheduleRound,
    selectedSlot,
    refreshAll,
  ]);

  const handleScheduleEmailPreview = useCallback(async () => {
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
        const startDate = slotPreviewDate || (scheduleStartAt ? scheduleStartAt.split("T")[0] : "");
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
  }, [candidateId, scheduleInterviewer?.email, scheduleRound, scheduleStartAt, slotPreviewDate]);

  const refreshActiveSlotInvites = useCallback(async () => {
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
  }, [candidateId]);

  const handleSendSlotInvite = useCallback(async () => {
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
      await refreshAll();
    } catch (e: any) {
      setInterviewsError(e?.message || "Could not send slot invite.");
    } finally {
      setSlotInviteBusy(false);
    }
  }, [candidateId, refreshActiveSlotInvites, scheduleInterviewer, scheduleRound, slotPreviewDate, refreshAll]);

  const handleCancelSlotInvite = useCallback(
    async (roundOverride?: string) => {
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
        await refreshAll();
      } catch (e: any) {
        setInterviewsError(e?.message || "Could not cancel slot invite.");
      } finally {
        setSlotInviteCancelBusy(false);
      }
    },
    [candidateId, refreshActiveSlotInvites, slotInviteRound, refreshAll]
  );

  useEffect(() => {
    if (interviews === null) {
      void refreshInterviews();
    }
  }, [interviews, refreshInterviews]);

  useEffect(() => {
    void refreshActiveSlotInvites();
  }, [refreshActiveSlotInvites]);

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
      candidate360Api
        .fetchPeople(query)
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
      candidate360Api
        .fetchSlotPreview(scheduleInterviewer, slotPreviewDate)
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
    if (!scheduleOpen) return;
    const node = schedulePanelRef.current;
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scheduleOpen]);

  useEffect(() => {
    setSelectedSlot(null);
  }, [scheduleRound]);

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
      .filter((item) => isCancelledInterview(item) || getTs(item.scheduled_start_at) < now.getTime())
      .sort((a, b) => getTs(b.scheduled_start_at) - getTs(a.scheduled_start_at));
  }, [interviews]);

  const interviewTaken = useMemo(() => interviewPast.filter((item) => interviewStatusValue(item) === "taken"), [interviewPast]);
  const interviewNotTaken = useMemo(
    () => interviewPast.filter((item) => interviewStatusValue(item) === "not_taken"),
    [interviewPast]
  );
  const interviewPastOther = useMemo(
    () => interviewPast.filter((item) => !["taken", "not_taken"].includes(interviewStatusValue(item))),
    [interviewPast]
  );

  const handleScheduleL2FromInterviews = useCallback(() => {
    if (currentStageKey === "l2_shortlist") {
      void (async () => {
        await handleTransition("l2_interview", "advance");
        openSchedule("L2");
      })();
      return;
    }
    openSchedule("L2");
  }, [currentStageKey, handleTransition, openSchedule]);

  const handleScheduleL1FromInterviews = useCallback(() => {
    if (currentStageKey === "l1_shortlist") {
      void (async () => {
        await handleTransition("l1_interview", "advance");
        openSchedule("L1");
      })();
      return;
    }
    openSchedule("L1");
  }, [currentStageKey, handleTransition, openSchedule]);

  const handleRescheduleFromInterviews = useCallback(
    (item: Interview) => {
      setInterviewsError(null);
      openSchedule(item.round_type || "L2", item.candidate_interview_id);
      setInterviewsNotice("Rescheduling interview: pick a new slot to replace the existing one.");
    },
    [openSchedule]
  );

  const handleCancelInterviewFromInterviews = useCallback(
    (item: Interview) => {
      openDialog({
        title: "Cancel interview",
        description: "This removes the interview from the interviewer calendar.",
        confirmLabel: "Cancel interview",
        tone: "danger",
        requireReason: true,
        reasonLabel: "Cancellation reason",
        reasonPlaceholder: "Reason for cancelling this interview",
        onConfirm: async (value) => {
          if (!value || !value.trim()) {
            setDialogError("Cancellation reason is required.");
            return;
          }
          setBusy(true);
          setInterviewsError(null);
          setInterviewsNotice(null);
          try {
            await candidate360Api.cancelInterview(item.candidate_interview_id, value.trim());
            const next = await candidate360Api.fetchInterviews(candidateId);
            setInterviews(next);
            await refreshAll();
            setInterviewsNotice("Interview cancelled.");
            pushToast({ tone: "success", title: "Interview cancelled" });
            closeDialog();
          } catch (e: any) {
            setInterviewsError(e?.message || "Could not cancel interview.");
            setDialogError(e?.message || "Could not cancel interview.");
          } finally {
            setBusy(false);
          }
        },
      });
    },
    [candidateId, closeDialog, openDialog, pushToast, setBusy, setDialogError, refreshAll]
  );

  const handleToggleExpandedInterview = useCallback((candidateInterviewId: number) => {
    setExpandedInterviewId((prev) => (prev === candidateInterviewId ? null : candidateInterviewId));
  }, []);

  const closeSchedulePanel = useCallback(() => {
    setScheduleOpen(false);
    setRescheduleInterviewId(null);
  }, []);

  const handlePickScheduleInterviewer = useCallback((person: PlatformPersonSuggestion) => {
    setScheduleInterviewer(person);
    setPersonQuery(person.full_name);
    setPersonResults([]);
    setPersonOpen(false);
  }, []);

  const handleSelectScheduleSlot = useCallback((slot: candidate360Api.SlotPreview) => {
    setSelectedSlot(slot);
    setScheduleStartAt("");
  }, []);

  return {
    schedulePanelRef,
    interviews,
    setInterviews,
    interviewsBusy,
    interviewsError,
    setInterviewsError,
    interviewsNotice,
    setInterviewsNotice,
    slotInviteRound,
    slotInviteCancelBusy,
    activeSlotInvites,
    expandedInterviewId,
    rescheduleInterviewId,
    scheduleEmailPreviewOpen,
    setScheduleEmailPreviewOpen,
    scheduleEmailPreviewHtml,
    scheduleEmailPreviewBusy,
    scheduleEmailPreviewError,
    scheduleOpen,
    scheduleRound,
    setScheduleRound,
    scheduleLocation,
    setScheduleLocation,
    scheduleMeetLink,
    setScheduleMeetLink,
    scheduleInterviewer,
    scheduleReason,
    setScheduleReason,
    slotInviteBusy,
    personQuery,
    setPersonQuery,
    personResults,
    personBusy,
    personOpen,
    setPersonOpen,
    personHighlight,
    setPersonHighlight,
    slotPreviewDate,
    setSlotPreviewDate,
    slotPreviewSlots,
    slotPreviewBusy,
    slotPreviewError,
    selectedSlot,
    setSelectedSlot,
    scheduleAllowed,
    refreshInterviews,
    refreshActiveSlotInvites,
    handleScheduleSubmit,
    handleScheduleEmailPreview,
    handleSendSlotInvite,
    handleCancelSlotInvite,
    openSchedule,
    interviewUpcoming,
    interviewPast,
    interviewTaken,
    interviewNotTaken,
    interviewPastOther,
    handleScheduleL2FromInterviews,
    handleScheduleL1FromInterviews,
    handleRescheduleFromInterviews,
    handleCancelInterviewFromInterviews,
    handleToggleExpandedInterview,
    closeSchedulePanel,
    handlePickScheduleInterviewer,
    handleSelectScheduleSlot,
  };
}
