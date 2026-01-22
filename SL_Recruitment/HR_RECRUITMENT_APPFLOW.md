Recruitment App Guide (Plain Language)

This guide explains the recruitment process in simple terms. It is written for non-technical readers.

----------------------------------------
1) What this app does
----------------------------------------
- It helps HR manage job openings and candidates from start to finish.
- Candidates apply online, HR reviews them, interviews are scheduled, offers are sent, and joining documents are collected.
- The system keeps a timeline of everything that happened.
- Candidates interact through secure public links (apply, CAF, sprint, interview slots, offer, joining docs).

----------------------------------------
2) Who uses it
----------------------------------------
- HR Admin: Full control.
- HR Exec: Day-to-day HR tasks.
- Hiring Manager: Reviews candidates and interviews.
- Interviewer / Group Lead: Gives interview feedback.
- Approver: Approves offers.
- Viewer: Read-only.
- Superadmin: Manages roles and can override stages.

----------------------------------------
3) The journey of a candidate (simple flow)
----------------------------------------
Think of each candidate moving through a set of steps. Only one step is "current" at a time.

Step 1: Opening is ready
- HR creates a job opening, or a manager requests one.
- Requested openings are inactive until HR/Superadmin activates them.
- Only active openings appear to candidates.

Step 2: Candidate enters
Two ways:
A) Candidate applies on the website.
B) HR manually adds a candidate.

What the system does automatically:
- Creates a record for the candidate.
- Creates a Drive folder for their files.
- Sends a CAF link (a form the candidate must fill).

Step 3: CAF form (Candidate Application Form)
- Candidate fills and submits the CAF.
- The system checks basic fit and gives a result:
  - Green = good fit, auto-advance to shortlist.
  - Red = not a fit, auto-reject.
  - Amber = needs HR review.

Step 4: HR review
- HR checks candidate details, CV, and CAF answers in Candidate 360.
- HR decides whether to move the candidate forward or reject.
- Every stage change is logged in the timeline.

Step 5: Sprint (optional take-home task)
- HR assigns a sprint template to the candidate.
- Candidate receives a sprint link with instructions and attachments.
- Candidate submits a file or a link (stored in Drive).
- HR reviews and decides:
  - Advance to interview.
  - Reject.
- Reminder and overdue emails are sent automatically.

Step 6: Interviews (L1 / L2)
- HR schedules interviews directly OR sends a slot-selection link.
- Candidate picks a slot from available options.
- Calendar invites and emails are sent if enabled.
- Interviewers submit feedback using the L1/L2 assessment forms.
- HR decides next step.

Step 7: Offer
- HR creates a draft offer and submits it for approval.
- Offer is approved and sent to the candidate with a public link + PDF.
- Candidate accepts or declines:
  - Accept -> stage moves to joining documents.
  - Decline -> stage moves to declined.
- Follow-up emails are sent if the candidate does not respond.

Step 8: Joining documents
- After acceptance, candidate uploads required documents via public link.
- HR can also upload documents on their behalf.
- Required types include PAN, Aadhaar, marksheets, experience letters, and salary slips.
- Status becomes complete once all required docs are present.

Step 9: Hired
- Once joining docs are complete, HR converts the candidate to an employee.
- Candidate is marked hired and their Drive folder moves to Appointed.

----------------------------------------
4) What HR sees as "stages"
----------------------------------------
Stages are labels for where the candidate is in the process.
Common stages you will see:
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

You do NOT need to remember these names. In the UI, you will simply see the current step for each candidate.

----------------------------------------
5) Automatic emails sent by the system
----------------------------------------
- CAF link (after candidate is created)
- CAF reminder (if candidate does not fill the form)
- Sprint assignment + reminders + overdue
- Interview slot options and interview scheduled/rescheduled/cancelled emails
- Interview feedback reminder to interviewer
- Offer sent + offer follow-up

----------------------------------------
6) Where files go
----------------------------------------
- Each candidate has a Drive folder.
- CV, sprint submissions, offer PDF, and joining documents are stored there.
- Sprint templates and assets are stored in a shared sprint assets folder.

----------------------------------------
7) Common HR questions (simple answers)
----------------------------------------
Q: Why is a candidate stuck in screening?
A: Their CAF was not submitted or the system marked it "needs review". HR must decide.

Q: What happens if a candidate does not pick a slot?
A: HR can schedule the interview manually.

Q: What happens after offer acceptance?
A: Candidate uploads joining documents, then HR completes hiring.

Q: Can HR skip steps?
A: Yes, but only Superadmin can override stages.

Q: Do public links expire?
A: Yes, links are time-limited and can be reissued by HR.

----------------------------------------
8) One-line summary for HR
----------------------------------------
Create opening -> Candidate applies -> CAF form -> HR review -> Sprint (optional) -> Interviews -> Offer -> Joining docs -> Hired
