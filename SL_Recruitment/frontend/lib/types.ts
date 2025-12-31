export type CandidateListItem = {
  candidate_id: number;
  candidate_code: string;
  name: string;
  opening_id?: number | null;
  opening_title?: string | null;
  current_stage?: string | null;
  status: string;
  ageing_days: number;
  caf_sent_at?: string | null;
  caf_submitted_at?: string | null;
  needs_hr_review?: boolean;
  screening_result?: string | null;
};

export type CandidateDetail = {
  candidate_id: number;
  candidate_code: string;
  name: string;
  email: string;
  phone?: string | null;
  opening_id?: number | null;
  opening_title?: string | null;
  status: string;
  current_stage?: string | null;
  final_decision?: string | null;
  hired_person_id_platform?: number | null;
  cv_url?: string | null;
  drive_folder_url?: string | null;
  caf_sent_at?: string | null;
  caf_submitted_at?: string | null;
  needs_hr_review?: boolean;
  application_docs_status: string;
  joining_docs_status: string;
  created_at: string;
  updated_at: string;
};

export type CandidateEvent = {
  event_id: number;
  candidate_id: number;
  candidate_name?: string | null;
  candidate_code?: string | null;
  action_type: string;
  performed_by_person_id_platform?: number | null;
  performed_by_name?: string | null;
  performed_by_email?: string | null;
  meta_json: Record<string, unknown>;
  created_at: string;
};

export type Interview = {
  candidate_interview_id: number;
  candidate_id: number;
  round_type: string;
  interviewer_person_id_platform?: string | null;
  interviewer_name?: string | null;
  interviewer_email?: string | null;
  scheduled_start_at: string;
  scheduled_end_at: string;
  location?: string | null;
  meeting_link?: string | null;
  calendar_event_id?: string | null;
  feedback_submitted: boolean;
  rating_overall?: number | null;
  rating_technical?: number | null;
  rating_culture_fit?: number | null;
  rating_communication?: number | null;
  decision?: string | null;
  notes_internal?: string | null;
  notes_for_candidate?: string | null;
  created_by_person_id_platform?: string | null;
  created_at: string;
  updated_at: string;
  candidate_name?: string | null;
  candidate_code?: string | null;
  opening_id?: number | null;
  opening_title?: string | null;
};

export type CafPrefill = {
  candidate_id: number;
  candidate_code: string;
  name: string;
  email: string;
  phone?: string | null;
  cv_url?: string | null;
  caf_sent_at?: string | null;
  caf_submitted_at?: string | null;
  opening_id?: number | null;
  opening_title?: string | null;
  opening_description?: string | null;
};

export type OpeningApplyPrefill = {
  opening_id: number;
  opening_code: string;
  opening_title?: string | null;
  opening_description?: string | null;
  is_active?: boolean | null;
};

export type OpeningPublicListItem = {
  opening_code: string;
  opening_title?: string | null;
  location_city?: string | null;
  location_country?: string | null;
  is_active?: boolean | null;
  headcount_required?: number | null;
};

export type OpeningListItem = {
  opening_id: number;
  opening_code?: string | null;
  title?: string | null;
  location_city?: string | null;
  is_active?: boolean | null;
  requested_by_person_id_platform?: string | null;
  requested_by_name?: string | null;
  requested_by_role_name?: string | null;
  requested_by_role_code?: string | null;
  requested_by_person_code?: string | null;
  requested_by_email?: string | null;
  requested_by_phone?: string | null;
  headcount_required?: number | null;
  headcount_filled?: number | null;
};

export type OpeningDetail = OpeningListItem & {
  description?: string | null;
  location_country?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PlatformPersonSuggestion = {
  person_id: string;
  person_code: string;
  full_name: string;
  email: string;
  role_name?: string | null;
  role_code?: string | null;
};

export type Screening = {
  candidate_id: number;
  current_city?: string | null;
  current_employer?: string | null;
  total_experience_years?: number | null;
  relevant_experience_years?: number | null;
  current_ctc_annual?: number | null;
  expected_ctc_annual?: number | null;
  salary_band_fit?: string | null;
  willing_to_relocate?: boolean | null;
  notice_period_days?: number | null;
  expected_joining_date?: string | null;
  gender_identity?: string | null;
  gender_self_describe?: string | null;
  reason_for_job_change?: string | null;
  relocation_notes?: string | null;
  questions_from_candidate?: string | null;
  screening_result?: string | null;
  screening_notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type CandidateStage = {
  stage_id: number;
  candidate_id: number;
  stage_name: string;
  stage_status: string;
  started_at: string;
  ended_at?: string | null;
  created_at: string;
};

export type CandidateFull = {
  candidate: CandidateDetail;
  stages: CandidateStage[];
  events: CandidateEvent[];
  screening?: Screening | null;
};

export type DashboardStageCount = { stage: string; count: number };

export type DashboardMetrics = {
  total_applications_received: number;
  total_active_candidates: number;
  new_candidates_last_7_days: number;
  new_applications_today: number;
  caf_submitted_today: number;
  openings_count: number;
  needs_review_amber: number;
  stuck_in_stage_over_days: number;
  caf_pending_overdue: number;
  feedback_pending: number;
  sprints_overdue: number;
  offers_awaiting_response: number;
  candidates_per_stage: DashboardStageCount[];
};

export type SprintTemplate = {
  sprint_template_id: number;
  sprint_template_code?: string | null;
  name: string;
  description?: string | null;
  opening_id?: number | null;
  role_id_platform?: number | null;
  instructions_url?: string | null;
  expected_duration_days?: number | null;
  is_active: boolean;
};

export type SprintTemplateAttachment = {
  sprint_template_attachment_id: number;
  sprint_attachment_id: number;
  file_name: string;
  content_type?: string | null;
  file_size?: number | null;
  created_at: string;
  is_active: boolean;
};

export type CandidateSprint = {
  candidate_sprint_id: number;
  candidate_id: number;
  sprint_template_id: number;
  assigned_by_person_id_platform?: string | null;
  assigned_at: string;
  due_at?: string | null;
  status: string;
  submission_url?: string | null;
  submitted_at?: string | null;
  reviewed_by_person_id_platform?: string | null;
  reviewed_at?: string | null;
  score_overall?: number | null;
  comments_internal?: string | null;
  comments_for_candidate?: string | null;
  decision?: string | null;
  public_token: string;
  created_at: string;
  updated_at: string;
  template_name?: string | null;
  template_description?: string | null;
  instructions_url?: string | null;
  expected_duration_days?: number | null;
  candidate_name?: string | null;
  candidate_code?: string | null;
  opening_title?: string | null;
};

export type CandidateOffer = {
  candidate_offer_id: number;
  candidate_id: number;
  opening_id?: number | null;
  offer_template_code: string;
  offer_version: number;
  gross_ctc_annual?: number | null;
  fixed_ctc_annual?: number | null;
  variable_ctc_annual?: number | null;
  currency?: string | null;
  designation_title?: string | null;
  grade_id_platform?: number | null;
  joining_date?: string | null;
  probation_months?: number | null;
  offer_valid_until?: string | null;
  offer_status: string;
  public_token: string;
  generated_by_person_id_platform?: number | null;
  generated_at?: string | null;
  approved_by_person_id_platform?: number | null;
  approved_at?: string | null;
  sent_at?: string | null;
  viewed_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  pdf_url?: string | null;
  notes_internal?: string | null;
  created_at: string;
  updated_at: string;
  candidate_name?: string | null;
  candidate_code?: string | null;
  opening_title?: string | null;
};

export type OfferPublic = {
  candidate_name?: string | null;
  candidate_code?: string | null;
  opening_title?: string | null;
  designation_title?: string | null;
  gross_ctc_annual?: number | null;
  fixed_ctc_annual?: number | null;
  variable_ctc_annual?: number | null;
  currency?: string | null;
  joining_date?: string | null;
  probation_months?: number | null;
  offer_valid_until?: string | null;
  offer_status: string;
  pdf_url?: string | null;
};
