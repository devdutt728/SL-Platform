export const BASIC_DETAILS_FORM_LABEL = "Basic Details Form";
export const SCREENING_DETAILS_LABEL = "Screening Details";
export const CANDIDATE_ASSESSMENT_FORM_LABEL = "Candidate Assessment Form";

export function basicDetailsStatusLabel(options: {
  required: boolean;
  sentAt?: string | null;
  submittedAt?: string | null;
  unsentLabel?: string;
}) {
  if (!options.required) return `${BASIC_DETAILS_FORM_LABEL} not required`;
  if (options.submittedAt) return `${BASIC_DETAILS_FORM_LABEL} submitted`;
  if (options.sentAt) return `${BASIC_DETAILS_FORM_LABEL} pending`;
  return options.unsentLabel || `${BASIC_DETAILS_FORM_LABEL} not shared`;
}

export function candidateAssessmentStatusLabel(options: {
  required: boolean;
  submittedAt?: string | null;
  shortLabel?: string;
}) {
  const label = options.shortLabel || CANDIDATE_ASSESSMENT_FORM_LABEL;
  if (!options.required) return `${label} not required`;
  if (options.submittedAt) return `${label} submitted`;
  return `${label} pending`;
}
