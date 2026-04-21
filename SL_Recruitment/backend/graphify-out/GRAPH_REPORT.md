# Graph Report - D:\SL Platform\SL_Recruitment\backend  (2026-04-21)

## Corpus Check
- 161 files · ~95,467 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1308 nodes · 4148 edges · 34 communities detected
- Extraction: 63% EXTRACTED · 37% INFERRED · 0% AMBIGUOUS · INFERRED: 1520 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Assessment Get Form|Assessment Get Form]]
- [[_COMMUNITY_Config Sprint Event|Config Sprint Event]]
- [[_COMMUNITY_Person External Bulk|Person External Bulk]]
- [[_COMMUNITY_Slots Email Slot|Slots Email Slot]]
- [[_COMMUNITY_Public Joining Link|Public Joining Link]]
- [[_COMMUNITY_Feature Calendar Access|Feature Calendar Access]]
- [[_COMMUNITY_Sprint Template Attachment|Sprint Template Attachment]]
- [[_COMMUNITY_Stage Test Notify|Stage Test Notify]]
- [[_COMMUNITY_Opening Request List|Opening Request List]]
- [[_COMMUNITY_Email Template Rationale|Email Template Rationale]]
- [[_COMMUNITY_Assessment Workflow Get|Assessment Workflow Get]]
- [[_COMMUNITY_Access Test Superadmin|Access Test Superadmin]]
- [[_COMMUNITY_Joining Profile Public|Joining Profile Public]]
- [[_COMMUNITY_External Apply Public|External Apply Public]]
- [[_COMMUNITY_Folder Drive Sprint|Folder Drive Sprint]]
- [[_COMMUNITY_Actor Dashboard Events|Actor Dashboard Events]]
- [[_COMMUNITY_Join Report Context|Join Report Context]]
- [[_COMMUNITY_Seed Years Apply|Seed Years Apply]]
- [[_COMMUNITY_Test Assessment Compensation|Test Assessment Compensation]]
- [[_COMMUNITY_Dispatch Init Basehttpmiddleware|Dispatch Init Basehttpmiddleware]]
- [[_COMMUNITY_Test Training Year|Test Training Year]]
- [[_COMMUNITY_Clause Confidentiality Non|Clause Confidentiality Non]]
- [[_COMMUNITY_Jobs Scheduler Health|Jobs Scheduler Health]]
- [[_COMMUNITY_Get Session User|Get Session User]]
- [[_COMMUNITY_Email Template Application|Email Template Application]]
- [[_COMMUNITY_Logout Auth|Logout Auth]]
- [[_COMMUNITY_Letter Logo Image|Letter Logo Image]]
- [[_COMMUNITY_Email Template Internal|Email Template Internal]]
- [[_COMMUNITY_Session Get|Session Get]]
- [[_COMMUNITY_Init|Init]]
- [[_COMMUNITY_Router|Router]]
- [[_COMMUNITY_Init|Init]]
- [[_COMMUNITY_Init|Init]]
- [[_COMMUNITY_Init|Init]]

## God Nodes (most connected - your core abstractions)
1. `log_event()` - 56 edges
2. `now_ist_naive()` - 47 edges
3. `bulk_upload_people()` - 41 edges
4. `_strip_optional()` - 38 edges
5. `apply_for_opening()` - 38 edges
6. `import_candidates_from_google_sheet()` - 36 edges
7. `UserContext` - 36 edges
8. `GoogleSheetIngestIn` - 34 edges
9. `_normalize_text()` - 34 edges
10. `CandidateCommunicationItemOut` - 33 edges

## Surprising Connections (you probably didn't know these)
- `submit_public_sprint()` --calls--> `normalize_submission_url()`  [INFERRED]
  SL_Recruitment\backend\app\api\routes\sprints.py → SL_Recruitment\backend\app\core\uploads.py
- `run_operation_retries()` --calls--> `process_due_operations()`  [INFERRED]
  SL_Recruitment\backend\app\jobs\tasks.py → SL_Recruitment\backend\app\services\operation_queue.py
- `get_caf_prefill()` --calls--> `CafPrefillOut`  [INFERRED]
  SL_Recruitment\backend\app\api\routes\caf.py → SL_Recruitment\backend\app\schemas\screening.py
- `submit_caf()` --calls--> `RecCandidateScreening`  [INFERRED]
  SL_Recruitment\backend\app\api\routes\caf.py → SL_Recruitment\backend\app\models\screening.py
- `submit_caf()` --calls--> `apply_stage_transition()`  [INFERRED]
  SL_Recruitment\backend\app\api\routes\caf.py → SL_Recruitment\backend\app\services\stage_transitions.py

## Hyperedges (group relationships)
- **Brand Signature Composition** — offer_letter_logo_image_asset, offer_letter_logo_stratmontech_wordmark, offer_letter_logo_tm_symbol [INFERRED 0.86]
- **Public Apply Guardrails** — rep_validation_idempotency_key_required, rep_validation_portfolio_mandatory, rep_public_apply_api_route [EXTRACTED 1.00]
- **Candidate Email Funnel** — email_application_received_template, email_caf_link_template, email_assessment_link_template, workflow_candidate_assessment_form [INFERRED 0.84]
- **Interview Notification Coordination Flow** — interview_feedback_reminder_email_template, interview_scheduled_email_template, interview_scheduled_interviewer_email_template, interview_slot_options_email_template, interview_slot_options_internal_email_template, interview_status_elapsed_email_template, feedback_submission_concept, interview_status_update_concept, live_slot_reservation_concept, candidate_only_booking_policy_concept [INFERRED 0.88]
- **Offer Lifecycle and Governance Loop** — offer_approval_request_principal_email_template, offer_approval_decision_hr_email_template, offer_sent_email_template, offer_followup_email_template, offer_decline_revision_hr_email_template, principal_offer_approval_concept, offer_response_actions_concept, offer_revision_workflow_concept, offer_followup_nudge_concept [INFERRED 0.90]
- **Sprint Candidate Engagement Cycle** — sprint_assigned_email_template, sprint_reminder_email_template, sprint_overdue_email_template, sprint_assignment_concept, sprint_due_date_concept, sprint_submission_prompt_concept [INFERRED 0.89]

## Communities

### Community 0 - "Assessment Get Form"
Cohesion: 0.03
Nodes (174): _assert_caf_available(), _caf_expired(), _caf_expiry_window(), get_caf_prefill(), get_caf_screening(), submit_caf(), _assert_assessment_available(), _assessment_expired() (+166 more)

### Community 1 - "Config Sprint Event"
Cohesion: 0.07
Nodes (108): RecApplyIdempotency, Base, Base, BaseModel, CandidateAssessmentOut, RecCandidateAssessment, CandidateConvertIn, CandidateCreate (+100 more)

### Community 2 - "Person External Bulk"
Cohesion: 0.05
Nodes (100): dict, BulkUploadError, BulkUploadResult, BulkUploadWarning, PlatformIdentity, _apply_external_identity_defaults(), _apply_name_defaults(), _apply_row_updates() (+92 more)

### Community 3 - "Slots Email Slot"
Cohesion: 0.06
Nodes (83): _gmail_client(), render_template(), _resolve_candidate_subject_identifier(), _resolve_sender_email(), _SafeFormatDict, send_email(), _template_path(), log_event() (+75 more)

### Community 4 - "Public Joining Link"
Cohesion: 0.06
Nodes (88): convert_candidate(), get_candidate_convert_preview(), admin_offer_decision(), _apply_joining_profile_to_person(), approve_offer(), approve_offer_route(), _auto_recreate_offer_on_decline(), _candidate_has_required_joining_docs() (+80 more)

### Community 5 - "Feature Calendar Access"
Cohesion: 0.05
Nodes (68): BaseSettings, _calendar_client(), create_calendar_event(), delete_calendar_event(), _find_meeting_link(), list_calendar_events(), list_calendar_list_details(), list_visible_calendar_ids() (+60 more)

### Community 6 - "Sprint Template Attachment"
Cohesion: 0.08
Nodes (53): download_drive_file(), active_status_filter(), _pick_primary_role(), resolve_identity_by_email(), _role_row_value(), Config, SprintAttachmentOut, SprintAttachmentPublicOut (+45 more)

### Community 7 - "Stage Test Notify"
Cohesion: 0.08
Nodes (38): _current_stage_name(), _display_stage(), _email_event_exists(), _format_age_days(), _format_date_value(), _format_datetime(), _hr_recipients(), _normalize_email() (+30 more)

### Community 8 - "Opening Request List"
Cohesion: 0.12
Nodes (50): _compact(), _display_name(), get_jd_asset_by_file_name(), JdAsset, list_jd_assets(), resolve_opening_jd_asset(), _score_asset(), _tokenize() (+42 more)

### Community 9 - "Email Template Rationale"
Cohesion: 0.1
Nodes (51): Candidate Decline Reason, Candidate-only Slot Booking Policy, Confidentiality Footer Notice, Rationale: Update Status After Elapsed Interview Time, Rationale: Clear Files and Size Limits Speed Verification, Interview Feedback Submission, Rationale: Timely Feedback Keeps Hiring Flow Moving, Rationale: Follow-up Nudges Candidate Decision (+43 more)

### Community 10 - "Assessment Workflow Get"
Cohesion: 0.09
Nodes (32): L2AssessmentOut, L2AssessmentPayload, _actor_role_ids(), _assert_assessment_access(), _build_out(), _clean_platform_person_id(), download_l1_assessment_pdf(), download_l2_assessment_pdf() (+24 more)

### Community 11 - "Access Test Superadmin"
Cohesion: 0.08
Nodes (23): has_planner_app_access(), has_recruitment_app_access(), is_planner_profile_eligible(), is_recruitment_role_eligible(), is_superadmin_identity(), is_superadmin_user(), normalize_access_token(), normalized_tokens() (+15 more)

### Community 12 - "Joining Profile Public"
Cohesion: 0.13
Nodes (33): _apply_joining_profile_payload(), _can_view_joining_workspace(), _canonical_doc_type(), Config, _get_joining_profile(), get_joining_profile_internal(), _get_or_create_joining_profile(), get_public_joining_docs() (+25 more)

### Community 13 - "External Apply Public"
Cohesion: 0.11
Nodes (32): _build_too_large_detail(), download_external_document(), DownloadedExternalDocument, _format_megabytes(), _parse_content_length(), _request_metadata(), _application_doc_max_bytes(), _application_docs_status() (+24 more)

### Community 14 - "Folder Drive Sprint"
Cohesion: 0.16
Nodes (34): _bucket_folder_id(), _candidate_sprint_folder_id(), copy_sprint_attachment_to_candidate(), create_candidate_folder(), delete_all_candidate_folders(), delete_candidate_folder(), delete_drive_item(), _delete_drive_item_with_service() (+26 more)

### Community 15 - "Actor Dashboard Events"
Cohesion: 0.15
Nodes (17): _active_candidate_case(), _actor_role_ids(), AssignmentSummaryOut, AssignmentWorkloadOut, _build_assigned_candidate_subquery(), _can_view_dashboard(), DashboardMetricsOut, _fetch_platform_people() (+9 more)

### Community 16 - "Join Report Context"
Cohesion: 0.19
Nodes (14): _apply_filters(), _apply_joins(), _csv_safe(), download_report(), _expand_end_of_day(), _fetch_count(), _fetch_rows(), _get_report() (+6 more)

### Community 17 - "Seed Years Apply"
Cohesion: 0.13
Nodes (18): Conscious Design Principles, Architect Role (1 to 3 years), Associate Interior Design Role (9+ years), Communications Intern Role, Group Leader Architecture Role (12+ years), Migration 0032 Seed Designation Openings, Public Apply API Route, Avoid Drive Upload and Email Side Effects (+10 more)

### Community 18 - "Test Assessment Compensation"
Cohesion: 0.25
Nodes (7): _assessment_compensation_hidden_emails(), _assessment_compensation_hidden_role_ids(), _can_view_assessment_compensation(), _csv_items(), _is_interviewer_scope(), CandidateAccessScopeTests, _user()

### Community 19 - "Dispatch Init Basehttpmiddleware"
Cohesion: 0.16
Nodes (5): BaseHTTPMiddleware, InternalGuardMiddleware, RequestLoggingMiddleware, _client_ip(), RateLimitMiddleware

### Community 20 - "Test Training Year"
Cohesion: 0.22
Nodes (4): CandidateAssessmentPrefillOut, CandidateAssessmentUpsertIn, Config, CandidateAssessmentSchemaTests

### Community 21 - "Clause Confidentiality Non"
Cohesion: 0.22
Nodes (9): Confidentiality and Non-compete Clause, Minimum Employment Commitment Clause, Restrictions Protect Firm Bona Fide Interest, FastAPI Web Framework, Google API Client Integration, Backend Requirements Manifest, SQLAlchemy ORM, WeasyPrint PDF Rendering (+1 more)

### Community 22 - "Jobs Scheduler Health"
Cohesion: 0.33
Nodes (2): _startup_jobs(), start_scheduler()

### Community 23 - "Get Session User"
Cohesion: 0.4
Nodes (2): get_db_session(), get_session()

### Community 24 - "Email Template Application"
Cohesion: 0.5
Nodes (5): Application Received Email Template, Assessment Link Email Template, CAF Link Email Template, Candidate Application Form Workflow, Candidate Assessment Form Workflow

### Community 25 - "Logout Auth"
Cohesion: 0.67
Nodes (0): 

### Community 26 - "Letter Logo Image"
Cohesion: 1.0
Nodes (3): Offer Letter Logo Image, StratMontech Wordmark, TM Trademark Symbol

### Community 27 - "Email Template Internal"
Cohesion: 0.67
Nodes (3): Internal Notification Email Template, Interview Cancelled Candidate Email Template, Interview Cancellation Workflow

### Community 28 - "Session Get"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Init"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Router"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Init"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Init"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Init"
Cohesion: 1.0
Nodes (0): 

## Ambiguous Edges - Review These
- `Seed Opening ASSO-82996A` → `Associate Interior Design Role (9+ years)`  [AMBIGUOUS]
  SL_Recruitment/backend/test_report_0032_public_apply.md · relation: conceptually_related_to
- `Interview Feedback Reminder Email Template` → `Interview Taken/Not Taken Status Update`  [AMBIGUOUS]
  SL_Recruitment/backend/app/templates/email/interview_feedback_reminder.html · relation: conceptually_related_to
- `Offer Decline Revision Email Template (HR)` → `Principal Offer Approval`  [AMBIGUOUS]
  SL_Recruitment/backend/app/templates/email/offer_decline_revision_hr.html · relation: conceptually_related_to

## Knowledge Gaps
- **46 isolated node(s):** `Return current India time as naive datetime for DATETIME columns.`, `Normalize a datetime to India time and strip tzinfo for DATETIME columns.`, `Resolves a path that may be relative to the repo root.     - If absolute and exi`, `Config`, `Config` (+41 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Session Get`** (2 nodes): `get_platform_session()`, `platform_session.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Router`** (1 nodes): `router.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Seed Opening ASSO-82996A` and `Associate Interior Design Role (9+ years)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Interview Feedback Reminder Email Template` and `Interview Taken/Not Taken Status Update`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Offer Decline Revision Email Template (HR)` and `Principal Offer Approval`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `log_event()` connect `Slots Email Slot` to `Assessment Get Form`, `Config Sprint Event`, `Public Joining Link`, `Feature Calendar Access`, `Sprint Template Attachment`, `Stage Test Notify`, `Assessment Workflow Get`, `Joining Profile Public`, `External Apply Public`, `Actor Dashboard Events`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `apply_stage_transition()` connect `Stage Test Notify` to `Assessment Get Form`, `Config Sprint Event`, `Slots Email Slot`, `Public Joining Link`, `Sprint Template Attachment`, `Assessment Workflow Get`, `External Apply Public`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `Role` connect `Config Sprint Event` to `Test Assessment Compensation`, `Person External Bulk`, `Access Test Superadmin`, `Feature Calendar Access`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Are the 138 inferred relationships involving `str` (e.g. with `submit_caf()` and `_normalize_opening_filter_ids()`) actually correct?**
  _`str` has 138 INFERRED edges - model-reasoned connections that need verification._