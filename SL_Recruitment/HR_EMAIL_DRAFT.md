Subject: Recruitment App - Full HR Workflow, Stages, and Step-by-Step Guide

Hi [HR Team Name],

As requested, I have reviewed the recruitment app end-to-end and documented the full workflow in detail. This email summarizes the same, in plain language, so it can be shared internally without technical context.

A. What the system is
- The recruitment app is the central workflow for job openings, candidate intake, screening, interviews, offers, and joining documents.
- It has an internal HR workspace and a public candidate-facing flow (apply, CAF, sprint, interview slots, offer, joining docs).
- Every action is logged in a timeline for audit and reporting.

B. Who does what (roles)
- Superadmin: role management and stage overrides.
- HR Admin: full control (openings, candidates, interviews, offers, approvals, joining docs, reporting).
- HR Exec: day-to-day HR actions (candidate handling, interviews, offers) with some restrictions.
- Hiring Manager: view and participate in interviews/sprints.
- Interviewer / Group Lead: see their interview list and submit feedback.
- Approver: offer approval actions.
- Viewer: read-only.

C. End-to-end HR process (step-by-step)
1) Openings
   - HR creates a new opening OR a Hiring Manager requests one.
   - Requested openings are created inactive; HR/Superadmin activates them.
   - Only active openings appear to candidates on the apply page.

2) Candidate enters the system
   Option 1: Public apply (external)
   - Candidate applies on /apply/[opening_code].
   - System creates candidate record and a Drive folder.
   - System emails a CAF link to the candidate.
   - If screening fields were filled in the apply form, the system auto-evaluates screening.

   Option 2: HR manual entry (internal)
   - HR adds the candidate in the HR workspace.
   - System creates the candidate, Drive folder, and sends the CAF link.

3) CAF (Candidate Application Form) and Screening
   - Candidate opens the CAF link and submits the form.
   - System runs screening rules and marks the result:
     - Green: auto-advance to shortlist stage.
     - Red: auto-reject.
     - Amber: mark "needs HR review" and stay in screening.
   - HR can review and override if needed (Superadmin for direct override).

4) HR review and stage movement
   - HR reviews CV, portfolio, and CAF data in Candidate 360.
   - HR can manually move a candidate to the next stage.
   - Every stage change is logged in the timeline.

5) Sprint (optional take-home task)
   - HR assigns a sprint to the candidate.
   - Candidate receives email with a sprint link and attachments.
   - Candidate submits a file or URL (stored in Drive).
   - HR reviews and chooses:
     - Advance -> stage moves to l1_shortlist.
     - Reject -> stage moves to rejected.
   - Reminder and overdue emails are sent automatically.

6) Interviews (L1/L2)
   - HR schedules interviews from Candidate 360 OR sends a slot-selection link.
   - Candidate selects a slot from available options.
   - Calendar invites and emails are sent if enabled.
   - Interviewer submits feedback using the L1/L2 assessment forms.
   - System sets feedback stage (l1_feedback or l2_feedback) and logs events.
   - HR moves the candidate forward or rejects based on feedback.

7) Offer process
   - HR creates a draft offer.
   - Offer is submitted for approval and approved.
   - Offer is sent to candidate with a public link + PDF.
   - Candidate accepts or declines:
     - Accept -> stage moves to joining_documents.
     - Decline -> stage moves to declined.
   - Follow-up emails are sent if the candidate does not respond.

8) Joining documents
   - After offer acceptance, candidate uploads documents via public link.
   - HR can upload documents on the candidate's behalf.
   - Required types include PAN, Aadhaar, marksheets, experience letters, and salary slips.
   - Status becomes "complete" once all required docs are present.

9) Conversion to employee
   - Once joining docs are complete, HR converts candidate to employee.
   - System creates a platform person record, marks candidate as hired, and moves their Drive folder to "Appointed."

D. Stage flow (what HR will see in the app)
The system uses stage names with a pending/completed status. Common stages in use:
- enquiry (auto)
- hr_screening
- l2_shortlist (CAF green outcome)
- l2 (public apply auto-screening outcome)
- sprint
- l1_shortlist
- l1_feedback
- l2_feedback
- joining_documents
- hired / rejected / declined

Typical happy path:
enquiry -> hr_screening -> l2_shortlist -> sprint -> l1_shortlist -> l1_feedback -> l2_feedback -> joining_documents -> hired

E. Automated emails
- CAF link + CAF reminders
- Sprint assignment + reminders + overdue
- Interview slot options + interview scheduled/rescheduled/cancelled
- Interview feedback reminders
- Offer sent + offer follow-up

F. File storage (Drive)
- Each candidate has a Drive folder.
- CV, sprint submissions, offer PDF, and joining docs are stored there.
- Sprint templates and assets live in a shared sprint assets folder.
- Folder moves to "Appointed" or "Not Appointed" based on final outcome.

G. Reporting and audit
- All actions are logged in a candidate timeline and the activity page.
- Reports page provides downloadable summaries.

If you want this converted into a one-page HR training sheet or slides, I can prepare that too.

Regards,
[Your Name]
