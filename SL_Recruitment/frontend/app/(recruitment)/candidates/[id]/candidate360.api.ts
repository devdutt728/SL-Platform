import {
  CandidateConvertPayload,
  CandidateConvertPreview,
  CandidateConvertResult,
  CandidateDetail,
  CandidateFull,
  CandidateOffer,
  L2Assessment,
  OfferJoiningLinkResendResult,
  CandidateSprint,
  Interview,
  JoiningDoc,
  PlatformPersonSuggestion,
  SprintTemplate,
  SprintTemplateAttachment,
} from "@/lib/types";

export type SlotPreview = {
  slot_start_at: string;
  slot_end_at: string;
  label: string;
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

async function readError(res: Response) {
  const raw = await res.text();
  if (!raw) return `Request failed (${res.status})`;
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown; message?: unknown };
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.detail === "string") return parsed.detail;
      if (typeof parsed.message === "string") return parsed.message;
    }
  } catch {
    // Fall back to raw text.
  }
  return raw;
}

export async function fetchFull(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/full`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateFull;
}

export async function fetchCafLink(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/caf-link`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { caf_token: string; caf_url: string };
}

export async function fetchAssessmentLink(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/assessment-link`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { assessment_token: string; assessment_url: string };
}

export async function resendAssessmentLink(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/assessment-link/resend`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as {
    candidate_id: number;
    attempted: boolean;
    email_status: string;
    assessment_token?: string;
    assessment_url?: string;
    reason?: string;
    email_error?: string;
  };
}

export async function updateCandidate(candidateId: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as CandidateDetail;
}

export async function fetchInterviews(candidateId: string) {
  const res = await fetch(`/api/rec/interviews?candidate_id=${encodeURIComponent(candidateId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Interview[];
}

export async function fetchInterviewL2Assessment(interviewId: number) {
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/l2-assessment`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as L2Assessment;
}

export async function cancelInterview(interviewId: number, reason?: string) {
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function fetchCandidateSprints(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/sprints`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateSprint[];
}

export async function deleteCandidateSprint(candidateSprintId: number) {
  const res = await fetch(`/api/rec/sprints/${encodeURIComponent(String(candidateSprintId))}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function updateCandidateSprint(candidateSprintId: number, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/sprints/${encodeURIComponent(String(candidateSprintId))}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as CandidateSprint;
}

export async function fetchSprintTemplates() {
  const res = await fetch("/api/rec/sprint-templates", { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as SprintTemplate[];
}

export async function fetchSprintTemplateAttachments(templateId: string) {
  const res = await fetch(`/api/rec/sprint-templates/${encodeURIComponent(templateId)}/attachments`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as SprintTemplateAttachment[];
}

export async function fetchCandidateOffers(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/offers`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer[];
}

export async function fetchJoiningDocs(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/joining-docs`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as JoiningDoc[];
}

export async function uploadJoiningDoc(candidateId: string, payload: { doc_type: string; file: File }) {
  const form = new FormData();
  form.append("doc_type", payload.doc_type);
  form.append("file", payload.file);
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/joining-docs`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as JoiningDoc;
}

export async function createOffer(candidateId: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/offers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer;
}

export async function updateOffer(offerId: number, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/offers/${offerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer;
}

export async function approveOffer(offerId: number) {
  const res = await fetch(`/api/rec/offers/${offerId}/approve`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer;
}

export async function rejectOffer(offerId: number, reason?: string) {
  const res = await fetch(`/api/rec/offers/${offerId}/reject`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "reject", reason }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer;
}

export async function sendOffer(offerId: number) {
  const res = await fetch(`/api/rec/offers/${offerId}/send`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer;
}

export async function resendJoiningLink(offerId: number) {
  const res = await fetch(`/api/rec/offers/${offerId}/resend-joining-link`, { method: "POST" });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as OfferJoiningLinkResendResult;
}

export async function adminDecideOffer(offerId: number, decision: "accept" | "decline") {
  const res = await fetch(`/api/rec/offers/${offerId}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer;
}

export async function deleteOffer(offerId: number) {
  const res = await fetch(`/api/rec/offers/${encodeURIComponent(String(offerId))}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function reviseOffer(offerId: number, reason?: string) {
  const res = await fetch(`/api/rec/offers/${encodeURIComponent(String(offerId))}/revise`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: reason || null }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CandidateOffer;
}

export async function convertCandidate(candidateId: string, payload: CandidateConvertPayload) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/convert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as CandidateConvertResult;
}

export async function fetchConvertPreview(candidateId: string, employmentType?: string | null, email?: string | null) {
  const url = new URL(`/api/rec/candidates/${encodeURIComponent(candidateId)}/convert-preview`, window.location.origin);
  if ((employmentType || "").trim()) {
    url.searchParams.set("employment_type", (employmentType || "").trim());
  }
  if ((email || "").trim()) {
    url.searchParams.set("email", (email || "").trim());
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as CandidateConvertPreview;
}

export async function assignSprint(candidateId: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/sprints`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as CandidateSprint;
}

export async function createInterview(candidateId: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/interviews`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as Interview;
}

export async function rescheduleInterview(interviewId: number, payload: Record<string, unknown>) {
  const res = await fetch(`/api/rec/interviews/${encodeURIComponent(String(interviewId))}/reschedule`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as Interview;
}

export async function fetchPeople(query: string) {
  const res = await fetch(`${basePath}/api/platform/people?q=${encodeURIComponent(query)}&limit=10`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as PlatformPersonSuggestion[];
}

export async function fetchSlotPreview(interviewer: PlatformPersonSuggestion, startDate: string) {
  const url = new URL(`${basePath}/api/rec/interview-slots/preview`, window.location.origin);
  if (interviewer.email) url.searchParams.set("interviewer_email", interviewer.email);
  if (interviewer.person_id) url.searchParams.set("interviewer_person_id_platform", interviewer.person_id);
  if (startDate) url.searchParams.set("start_date", startDate);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as SlotPreview[];
}

export async function transition(candidateId: string, payload: { to_stage: string; decision?: string; note?: string; reason?: string }) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/transition`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function sendInternSelectionEmail(candidateId: string) {
  const res = await fetch(`/api/rec/candidates/${encodeURIComponent(candidateId)}/intern-selection-email`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { candidate_id: number; email_status: string; email_error?: string | null; workflow_variant: string };
}
