export type CandidateListItem = {
  candidate_id: number;
  candidate_code: string;
  name: string;
  opening_id?: number | null;
  opening_title?: string | null;
  current_stage?: string | null;
  status: string;
  ageing_days: number;
  applied_ageing_days: number;
  created_at?: string | null;
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
  portfolio_url?: string | null;
  portfolio_not_uploaded_reason?: string | null;
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
  stage_name?: string | null;
  round_type: string;
  interview_status?: string | null;
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

export type L2Assessment = {
  candidate_interview_assessment_id?: number | null;
  candidate_interview_id: number;
  candidate_id: number;
  interviewer_person_id_platform?: string | null;
  status: string;
  data: Record<string, unknown>;
  submitted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  locked: boolean;
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

export type CandidateAssessmentPrefill = {
  candidate_id: number;
  candidate_code: string;
  name: string;
  email: string;
  phone?: string | null;
  assessment_sent_at?: string | null;
  assessment_submitted_at?: string | null;
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
  status?: string | null;
  is_deleted?: number | null;
  role_name?: string | null;
  role_code?: string | null;
  role_ids?: number[] | null;
  role_codes?: string[] | null;
  role_names?: string[] | null;
};

export type PlatformPerson = {
  person_id: string;
  person_code: string;
  personal_id?: string | null;
  first_name: string;
  last_name?: string | null;
  email: string;
  mobile_number?: string | null;
  role_id?: number | null;
  grade_id?: number | null;
  department_id?: number | null;
  manager_id?: string | null;
  employment_type?: string | null;
  join_date?: string | null;
  exit_date?: string | null;
  status?: string | null;
  is_deleted?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  source_system?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  role_name?: string | null;
  role_code?: string | null;
};

export type PlatformRole = {
  role_id: number;
  role_code: string;
  role_name?: string | null;
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
  two_year_commitment?: boolean | null;
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
  assessment?: CandidateAssessment | null;
};

export type CandidateAssessment = {
  candidate_id: number;
  assessment_token?: string | null;
  assessment_sent_at?: string | null;
  assessment_submitted_at?: string | null;
  position_applied_for?: string | null;
  total_experience_years?: number | null;
  architecture_interior_experience_years?: number | null;
  personal_email?: string | null;
  contact_number?: string | null;
  current_employment_status?: string | null;
  interviewer_name?: string | null;
  notice_period_or_joining_time?: string | null;
  current_location?: string | null;
  current_job_duration_months?: number | null;
  current_job_org_name?: string | null;
  current_job_role_responsibilities?: string | null;
  previous_job_duration_months?: number | null;
  previous_job_org_name?: string | null;
  previous_job_role_responsibilities?: string | null;
  education_10th_specialization?: string | null;
  education_10th_year?: string | null;
  education_10th_institution?: string | null;
  education_10th_marks?: string | null;
  education_12th_specialization?: string | null;
  education_12th_year?: string | null;
  education_12th_institution?: string | null;
  education_12th_marks?: string | null;
  education_graduation_specialization?: string | null;
  education_graduation_year?: string | null;
  education_graduation_institution?: string | null;
  education_graduation_marks?: string | null;
  education_post_graduation_specialization?: string | null;
  education_post_graduation_year?: string | null;
  education_post_graduation_institution?: string | null;
  education_post_graduation_marks?: string | null;
  training1_name?: string | null;
  training1_year?: string | null;
  training1_institute?: string | null;
  training2_name?: string | null;
  training2_year?: string | null;
  training2_institute?: string | null;
  skill_auto_cad?: number | null;
  skill_sketch_up?: number | null;
  skill_revit?: number | null;
  skill_photoshop?: number | null;
  skill_illustrator?: number | null;
  skill_ms_office?: number | null;
  skill_3d_max?: number | null;
  skill_indesign?: number | null;
  skill_presentation?: number | null;
  skill_rhino?: number | null;
  skill_boqs?: number | null;
  skill_analytical_writing?: number | null;
  skill_graphics?: number | null;
  skill_drafting?: number | null;
  skill_hand_sketching?: number | null;
  skill_estimation?: number | null;
  skill_specifications?: number | null;
  skill_enscape?: number | null;
  proficiency_execution_action_orientation?: number | null;
  proficiency_execution_self_discipline?: number | null;
  proficiency_execution_independent_decision?: number | null;
  proficiency_process_time_management?: number | null;
  proficiency_process_following_processes?: number | null;
  proficiency_process_new_processes?: number | null;
  proficiency_strategic_long_term_thinking?: number | null;
  proficiency_strategic_ideation_creativity?: number | null;
  proficiency_strategic_risk_taking?: number | null;
  proficiency_people_collaboration?: number | null;
  proficiency_people_coaching?: number | null;
  proficiency_people_feedback?: number | null;
  proficiency_people_conflict_resolution?: number | null;
  proficiency_reason_execution?: string | null;
  proficiency_reason_process?: string | null;
  proficiency_reason_strategic?: string | null;
  proficiency_reason_people?: string | null;
  self_strengths?: string | null;
  self_improvement_areas?: string | null;
  self_learning_needs?: string | null;
  q1_why_studio_lotus?: string | null;
  q2_project_scale?: string | null;
  q3_role_site_experience?: string | null;
  q4_inspired_project?: string | null;
  q5_two_year_plan?: string | null;
  reference1_name?: string | null;
  reference1_contact?: string | null;
  reference1_relationship?: string | null;
  reference2_name?: string | null;
  reference2_contact?: string | null;
  reference2_relationship?: string | null;
  declaration_name?: string | null;
  declaration_signature?: string | null;
  declaration_date?: string | null;
  declaration_accepted?: boolean | null;
  created_at: string;
  updated_at: string;
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
  reviewed_by_name?: string | null;
  reviewed_by_email?: string | null;
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
  pdf_download_url?: string | null;
  notes_internal?: string | null;
  letter_overrides?: Record<string, string> | null;
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
  pdf_download_url?: string | null;
};

export type JoiningDoc = {
  joining_doc_id: number;
  candidate_id: number;
  doc_type: string;
  file_name: string;
  content_type?: string | null;
  uploaded_by: string;
  uploaded_by_person_id_platform?: number | null;
  created_at: string;
  file_url: string;
};

export type JoiningDocPublic = {
  joining_doc_id: number;
  doc_type: string;
  file_name: string;
  uploaded_by: string;
  created_at: string;
};

export type JoiningDocsPublicContext = {
  candidate_id: number;
  candidate_name: string;
  opening_title?: string | null;
  joining_docs_status: string;
  required_doc_types: string[];
  docs: JoiningDocPublic[];
};

export type ReportColumn = {
  key: string;
  label: string;
};

export type ReportMeta = {
  report_id: string;
  label: string;
  description: string;
  columns: ReportColumn[];
  default_columns: string[];
  filters: {
    date_field?: string | null;
    opening_id?: boolean;
    status?: boolean;
    is_active?: boolean;
  };
};

export type ReportPreview = {
  report_id: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
};
