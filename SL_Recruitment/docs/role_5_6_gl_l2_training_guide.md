# Role 5 and Role 6 Training Guide

## Recruitment System Training Document

**Audience:** Group Leaders / L2 Owners mapped to platform role IDs 5 and 6  
**System:** Studio Lotus Recruitment OS  
**Prepared for:** Internal training, walkthrough, and communication mail  
**Document objective:** Provide a current, code-verified guide for role 5 and role 6 users, including scope, features, sprint ownership, opening requests, and mail/notification behavior.

## 1. Current Role Definition

Role 5 and Role 6 are still handled the same way in the current implementation. The system treats both roles as assignment-scoped `GL / L2` users.

In practical terms, this means:

- both roles operate in the same business flow
- both roles work on candidates assigned to them
- both roles use the `GL Portal` as the main day-to-day workspace
- both roles are involved in interview feedback, sprint review, and opening requests
- both roles do not run the full HR workflow

## 2. What Role 5 / Role 6 Are Expected To Do

Their main responsibility is evaluation ownership on assigned candidates.

Their operational work includes:

- reviewing assigned L1 or L2 interview items
- marking interview status as `taken` or `not_taken`
- saving draft interview feedback
- submitting final interview feedback
- reviewing submitted sprint work
- recording sprint score, comments, and final decision
- raising opening requests against existing openings
- monitoring stage handoff and internal mails relevant to L2-owned candidates

## 3. What They Can Access

### A. GL Portal

This remains the primary workspace for role 5 and role 6 users.

Main tabs visible in the portal:

- `Assessments`
- `Sprint Reviews`
- `Opening Requests`

### B. Candidate Access

They can view candidate records and assigned activity relevant to their work.

Important system note:

- Candidate 360 is visible to role 5 and role 6 users
- Candidate 360 is currently `view-only` for non-HR users
- they can review data there, but lifecycle actions remain restricted in that screen

### C. Interviews

They can access interviews assigned to them in their interviewer/L2 scope and act through the GL Portal assessment flow.

### D. Sprints

They can review sprint submissions assigned to them.

### E. Opening Requests

They can raise requests for existing openings and track their own requests.

## 4. What They Cannot Do

Role 5 and role 6 users are not full HR operators.

They cannot:

- create brand-new openings from their normal flow
- approve or reject opening requests
- manage full Candidate 360 lifecycle actions like HR
- control offer processing
- control joining document workflow
- assign or change sprint reviewer through the HR-only reviewer assignment endpoint
- manage opening request admin overrides
- perform superadmin-only actions

## 5. GL Portal Feature Guide

## 5.1 Assessments Tab

This tab is used for interview ownership and interview feedback.

Features currently visible in the assessment workspace include:

- unread counters for L1 and L2 queues
- pending feedback counts
- search on candidate/opening/interviewer/round
- interview status filter
- queue cards for assigned interviews
- interview detail panel
- `Mark interview taken`
- `Mark not taken`
- `Save draft`
- `Submit`
- PDF download for submitted assessment record
- preview summary for active form data

Operational rules:

- interview status can be marked after the scheduled start time begins
- feedback unlocks only after interview is marked `taken`
- if interview is marked `not_taken`, assessment is not available
- submitted feedback becomes locked

## 5.2 Sprint Reviews Tab

This tab is used for decision-making on submitted sprint tasks.

Features currently visible in sprint review flow include:

- queue of submitted sprints waiting for L2 review
- candidate name, opening, sprint template name, and template code
- due date and submitted date
- sprint brief HTML preview
- instructions link if present
- submitted file link
- template and sprint attachments
- review modal with status details
- score field
- internal comments
- candidate comments
- final decision

Allowed review outcomes:

- `advance`
- `reject`

Important effect:

- sprint review can move the candidate forward or to rejected flow depending on decision and current stage

## 5.3 Opening Requests Tab

This tab is used for headcount requests against existing openings.

Role 5 / Role 6 permissions here are:

- can raise requests
- cannot raise brand-new opening creation requests in their normal role flow
- cannot approve requests
- cannot reject requests
- cannot manage all requests globally
- can view only their own requests unless they are in an HR approval role

Common request details supported by the backend:

- opening code
- opening title
- description
- location city
- location country
- hiring manager person ID
- hiring manager email
- GL details
- L2 details
- headcount delta
- request reason

Important request behavior:

- for role 5 and role 6 users, opening must already exist
- if `headcount_delta > 0`, the request behaves like `increase_headcount`
- if `headcount_delta = 0` and hiring manager is being changed, the request behaves like `change_hiring_manager`
- request status starts as `pending_hr_approval`
- later status can become `applied` or `rejected`

Important communication note:

- current opening request flow logs workflow events
- based on the current route scan, opening request creation/approval/rejection does not currently send dedicated email notifications

## 6. Sprint Assignment Clarification

This is one of the important changes in the current implementation.

### What the backend now allows

Sprint assignment is now allowed for:

- superadmin
- HR admin
- HR exec
- hiring manager
- group lead
- role 5 / role 6 users

But for role 5 / role 6 style usage, all of the following must be true:

- the candidate must exist
- the user must be the assigned `l2_owner_email`
- the logged-in email must match the candidate `l2_owner_email`
- there must not already be another active sprint for that candidate

If an active sprint already exists, the system blocks duplicate assignment.

### Important limitation

Reviewer assignment is still separate from sprint assignment.

Role 5 / Role 6 users:

- can be the reviewing owner
- can review a sprint submitted to them
- cannot use the HR-only reviewer assignment endpoint to reassign reviewer ownership

### Current UI note

Backend support for sprint assignment is present.

However:

- Candidate 360 page is still gated as `view-only` for non-HR users
- so sprint assignment visibility in your live build should be validated before presenting it as a guaranteed self-service UI action for role 5 / role 6

Safe professional wording for your mail or session:

"Sprint assignment ownership is L2-owner scoped. Where the action is enabled in the current UI, the assigned L2 owner can assign the sprint, subject to the one-active-sprint rule. Reviewer reassignment remains with HR."

## 7. Detailed Step-by-Step SOP

## 7.1 Daily Start Routine

1. Log in to the recruitment system.
2. Open the `GL Portal`.
3. Review unread counts and pending counts.
4. Open the `Assessments` tab first.
5. Check pending interviews and feedback backlog.
6. Open the `Sprint Reviews` tab next.
7. Review any submitted sprints waiting for decision.
8. Check `Opening Requests` for requests already raised by you.

## 7.2 Interview Workflow

1. Open `GL Portal`.
2. Go to `Assessments`.
3. Select the relevant interview from the queue.
4. Verify candidate name, opening, interviewer, round, and scheduled time.
5. Once the interview start time has begun, mark status.
6. Choose `taken` if the interview happened.
7. Choose `not_taken` if the interview did not happen.
8. If marked `taken`, fill the assessment form.
9. Use `Save draft` if feedback is still in progress.
10. Review all fields carefully.
11. Click `Submit` only when the feedback is final.
12. Download PDF if a formatted copy is needed.

## 7.3 Sprint Review Workflow

1. Open `GL Portal`.
2. Go to `Sprint Reviews`.
3. Open the sprint item from the queue.
4. Review sprint name, sprint code, due date, and submitted timestamp.
5. Review sprint brief and instructions.
6. Open candidate submission file.
7. Review attachments if any were included in the sprint.
8. Enter score.
9. Add internal comments.
10. Add candidate comments if required.
11. Choose final decision as `advance` or `reject`.
12. Save the sprint review.
13. Confirm the candidate has moved correctly in the workflow.

## 7.4 Sprint Assignment Workflow

Use this section only if sprint assignment is enabled for the assigned L2 owner in your current deployed UI.

1. Confirm you are the mapped `L2 owner` for the candidate.
2. Confirm no other active sprint is already assigned.
3. Open the sprint assignment flow.
4. Select sprint template.
5. Review template code, name, expected duration, and due date.
6. Review sprint brief preview.
7. Review template attachments.
8. Review candidate email preview.
9. Set due date.
10. Click `Assign sprint`.
11. Confirm the sprint assignment mail is sent to the candidate.

If sprint assignment action is not visible in your UI:

- coordinate with HR or Superadmin
- do not assume reviewer reassignment rights

## 7.5 Opening Request Workflow

1. Open `GL Portal`.
2. Go to `Opening Requests`.
3. Select an existing opening.
4. Confirm the opening code is valid.
5. Enter or verify opening description and location.
6. Add hiring manager details if needed.
7. Add `GL details`.
8. Add `L2 details`.
9. Enter `headcount_delta`.
10. Add clear business reason.
11. Submit the request.
12. Track status as `pending_hr_approval`, `applied`, or `rejected`.

## 8. Mail and Notification Guide

This section separates mails into two types:

- candidate-facing mails
- internal mails relevant to role 5 / role 6 users

## 8.1 Candidate-Facing Mails in the Overall Workflow

These are useful for role 5 / role 6 users to understand, even if HR triggers some of them.

### Application and form mails

- `application_links`
  Sent when the candidate receives Studio Lotus application links.

- `application_received`
  Fallback receipt mail when the application is received.

- `basic_details_link`
  CAF / basic details form mail sent to the candidate.

- `caf_reminder`
  Reminder to complete the candidate application form.

- `assessment_link`
  Candidate assessment form link mail.

### Interview mails

- `interview_slot_options`
  Candidate receives selectable interview slot options.

- `interview_scheduled`
  Candidate receives final scheduled interview details.

- `interview_rescheduled`
  Candidate receives revised interview details.

- `interview_cancelled`
  Candidate receives cancellation notice.

### Sprint mails

- `sprint_assigned`
  Candidate receives sprint assignment mail with sprint link, due date, and attachment summary.

- `sprint_reminder`
  Candidate receives reminder before due date.

- `sprint_overdue`
  Candidate receives overdue follow-up mail.

### Offer / post-offer mails

- `offer_sent`
  Candidate receives offer letter mail.

- `offer_followup`
  Candidate receives offer follow-up if no response is recorded.

- `joining_documents_request`
  Candidate receives joining document request after offer acceptance workflow.

## 8.2 Internal Mails Relevant To Role 5 / Role 6

These are the key internal mails role 5 / role 6 users may receive or should know about.

### Ownership and stage mails

- `l2_owner_assigned`
  Subject: `Candidate assigned to you for L2 review`
  Sent to the new L2 owner, with HR in CC.

- `stage_handoff_l2_shortlist`
  Sent when a candidate moves into `l2_shortlist`.
  Recipients include HR and the candidate L2 owner.

- `stage_handoff_sprint`
  Sent when a candidate moves into `sprint`.
  Recipients include HR and the candidate L2 owner.

- `stage_stale_internal`
  Sent when a candidate remains too long in an SLA-sensitive stage.
  For L2-related stages such as `l2_shortlist`, `l2_interview`, `l2_feedback`, and `sprint`, recipients include L2 owner and HR.

### Interview mails

- `interview_slot_options_internal_copy`
  Subject pattern: `L2 slot options sent - Candidate Name (Candidate Code)`
  Sent only for `L2` round internal visibility.
  Goes to the `l2_owner_email` when it differs from the candidate email.
  Important rule: this mail is for visibility only and does not include booking links.

- `interview_feedback_internal`
  Subject: `Interview feedback submitted`
  Sent when interview feedback is submitted.
  Recipients include HR and the candidate L2 owner.

- `interview_feedback_reminder`
  Sent to the assigned interviewer if feedback is pending beyond configured reminder time.

- `interview_status_elapsed`
  Sent to the interviewer if interview status is not marked after the configured time window.

### Sprint mails

- `sprint_submission_internal`
  Subject: `Sprint submission received`
  Sent when candidate uploads the sprint submission.
  Recipients include sprint reviewer, L2 owner, and HR.

- `sprint_review_internal`
  Subject: `Sprint review completed`
  Sent after sprint review is recorded.
  Recipients include HR and the candidate L2 owner.

### Offer response internal mails

- `offer_response_accept`
  Sent internally when the candidate accepts the offer.
  Recipients include HR and the candidate L2 owner.

- `offer_response_decline`
  Sent internally when the candidate declines the offer.
  Recipients include HR and the candidate L2 owner.

## 9. What To Say During Training About Mails

Use the following professional explanation:

"Please note that the system sends both candidate-facing mails and internal visibility mails. As Role 5 / Role 6 users, the most relevant mails for you are L2 owner assignment, L2 shortlist or sprint handoff, L2 slot visibility mail, sprint submission mail, sprint review completion mail, and internal interview feedback mail. Opening requests currently create workflow records, but they do not have dedicated mail notifications in the current route flow."

## 10. Best Practices

### Interview feedback best practices

- mark interview status correctly and only after the scheduled interview begins
- use draft while feedback is being discussed
- submit only final, complete feedback
- keep comments factual, role-related, and decision-oriented

### Sprint review best practices

- review the actual submission file, not only the status
- read the sprint brief and instructions before scoring
- use `advance` only if output meets expected quality
- record clear internal comments for future decision traceability

### Opening request best practices

- use the exact existing opening code
- write clear business justification
- include GL and L2 details completely
- do not promise request approval because approval remains with HR / Superadmin

## 11. Escalation Matrix

Escalate to HR when:

- sprint assignment action is not visible in your current UI
- reviewer ownership needs to be changed
- interview scheduling or rescheduling is needed
- opening request needs approval
- a submitted assessment needs correction
- candidate must be moved across stages outside your scope

Escalate to Superadmin when:

- a system override is required
- Candidate 360 permissions appear wrong
- sprint reassignment is blocked by active sprint rules and needs privileged intervention
- request status requires admin override

## 12. Short Mail Summary For Leadership / Team Communication

If you need a short explanation inside a mail, you can use this:

"Role 5 and Role 6 users in the recruitment system work as GL / L2 owners. Their primary workspace is the GL Portal, where they manage interview feedback, sprint review, and opening requests for existing openings. Candidate 360 remains view-only in the current non-HR access model. Sprint review and internal L2 mails are active; sprint assignment is L2-owner scoped in backend rules and should be used where enabled in the current UI. Opening request approval remains with HR / Superadmin."

## 13. Final Closing Line For Session

"For role 5 and role 6 users, the system is designed to keep the focus on evaluation quality, timely feedback, sprint decision-making, and structured ownership visibility. If interview feedback, sprint review, and opening requests are handled on time and with complete information, the recruitment process remains faster, cleaner, and easier to track." 
