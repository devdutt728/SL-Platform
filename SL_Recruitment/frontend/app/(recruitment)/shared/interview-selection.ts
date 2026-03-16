import type { Interview } from "@/lib/types";

// Keep the selected interview aligned with the freshest list payload.
export function reconcileSelectedInterview(interviews: readonly Interview[], selected: Interview | null): Interview | null {
  if (!selected) return null;
  const match = interviews.find((item) => item.candidate_interview_id === selected.candidate_interview_id);
  if (!match) return null;
  const hasChanged =
    match.updated_at !== selected.updated_at ||
    (match.interview_status || "") !== (selected.interview_status || "") ||
    Boolean(match.feedback_submitted) !== Boolean(selected.feedback_submitted) ||
    (match.decision || "") !== (selected.decision || "") ||
    (match.stage_name || "") !== (selected.stage_name || "");
  return hasChanged ? match : selected;
}
