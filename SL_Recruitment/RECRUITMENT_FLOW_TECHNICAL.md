# Recruitment App Flow - Technical Guide

## 1. Purpose and scope

This document explains the full runtime flow of the `SL_Recruitment` app as implemented in code today.  
It is intended for engineers, QA, DevOps, and technical analysts.

This guide is based on:
- backend FastAPI routes and services in `SL_Recruitment/backend/app`
- frontend Next.js routes and proxy handlers in `SL_Recruitment/frontend`
- runtime routing in root `Caddyfile`

---

## 2. Monorepo and runtime context

Repository root contains multiple apps:
- `SL_Recruitment` (this app)
- `SL_IT`
- `SL_Workbook`

At runtime (default local/prod reverse-proxy shape):
- Browser traffic enters Caddy on `:3000`.
- Recruitment UI resolves under `/recruitment*` -> Next.js frontend (`127.0.0.1:3002`).
- Recruitment internal APIs `/api/rec*` are rewritten to `/recruitment/api/rec*` and handled by Next API routes (proxy layer).
- Public APIs `/api/apply*`, `/api/caf*`, `/api/assessment*`, `/api/offer*`, `/api/sprint*`, `/api/joining*` are rewritten to `/recruitment/api/*` and proxied by frontend.
- Public interview slot page `/recruitment/interview/slots*` is sent directly to backend (`127.0.0.1:8002`) for HTML slot-selection responses.

Primary flow:
- Next.js frontend handles UI + cookie session
- FastAPI backend handles business logic, DB writes, events, scheduling
- MySQL DB stores recruitment records
- `sl_platform` DB stores identity/roles (`dim_person`, `dim_role`, `dim_person_role`)
- Google Drive stores candidate files
- Gmail API sends transactional emails
- Google Calendar API supports interview scheduling/freebusy

---

## 3. Backend architecture

Entry point:
- `backend/app/main.py`

Key middleware:
- Request logging middleware
- Internal guard (`x-internal-api-key`) for protected prefixes (`/rec`, `/platform`, `/admin`) when configured
- Auth path rate limiter (`/auth*`, in-memory)

Router composition (`backend/app/api/router.py`):
- auth
- candidates
- candidate_assessment
- caf
- openings
- offers (internal + public)
- platform_people
- platform_roles
- public_apply
- dashboard/events/stream
- interviews (internal + public)
- interview_assessments
- joining_docs (internal + public)
- reports
- sprints (internal + public)

Scheduler:
- started on app startup (`backend/app/jobs/scheduler.py`)
- periodic tasks in `backend/app/jobs/tasks.py`

---

## 4. Frontend architecture

Framework:
- Next.js App Router with `basePath: /recruitment`

Key behavior:
- Protected recruitment workspace pages under `frontend/app/(recruitment)/*`
- Candidate/public pages under `/apply`, `/caf/[token]`, `/assessment/[token]`, `/sprint/[token]`, `/offer/[token]`, `/joining/[token]`
- `frontend/proxy.ts` enforces login/session idle behavior in Google-auth mode
- Next API routes (`frontend/app/api/**`) proxy to backend, forwarding auth headers/cookies where required

Notable gap:
- `frontend/app/schedule/[token]/page.tsx` is still a placeholder UI and not used for production scheduling flow.

---

## 5. Authentication and authorization model

## 5.1 Auth modes

Configured by `SL_AUTH_MODE`:
- `google` (production path)
- `dev` (header-based local fallback)

Google flow:
- frontend OAuth routes exchange Google code and receive ID token
- token stored as `slp_token` cookie
- session ID stored as `slp_sid`
- backend `/auth/me` validates Google token, checks `sl_platform` identity, maps roles

Dev flow:
- backend accepts `X-User-Email` + `X-User-Roles` headers when not using Google mode

## 5.2 Single-session enforcement

Backend checks session ID from:
- `x-slp-session` header (preferred)
- `slp_sid` cookie fallback

Session state is enforced in platform DB table `slp_user_session`:
- user can be blocked if another active session is present
- controlled by idle timeout (`SL_SESSION_IDLE_MINUTES`)
- session init override flag supported (`x-slp-session-init`)

## 5.3 Role model

App roles (`backend/app/core/roles.py`):
- `hr_admin`
- `hr_exec`
- `interviewer`
- `gl`
- `hiring_manager`
- `approver`
- `viewer`

Superadmin behavior:
- determined from platform role id/code (`2`, `superadmin`, `s_admin`, etc.)
- certain actions require superadmin explicitly (stage skip, role/person admin, conversion, etc.)

---

## 6. Core data entities

Primary domain tables:
- `rec_opening`
- `rec_candidate`
- `rec_candidate_stage`
- `rec_candidate_screening`
- `rec_candidate_assessment`
- `rec_candidate_interview`
- `rec_candidate_interview_slot`
- `rec_candidate_interview_assessment`
- `rec_sprint_template`
- `rec_sprint_attachment`
- `rec_sprint_template_attachment`
- `rec_candidate_sprint`
- `rec_candidate_sprint_attachment`
- `rec_candidate_offer`
- `rec_candidate_joining_doc`
- `rec_candidate_event`
- `rec_apply_idempotency`

Cross-app identity tables:
- `dim_person`
- `dim_role`
- `dim_person_role`

---

## 7. Stage machine and candidate lifecycle

UI/route-visible stage keys:
- `enquiry`
- `hr_screening` (UI normalizes `caf` to this)
- `l2_shortlist`
- `l2_interview`
- `l2_feedback`
- `sprint`
- `l1_shortlist`
- `l1_interview`
- `l1_feedback`
- `offer`
- `joining_documents`
- `hired`
- `declined`
- `rejected`

General transition mechanics:
- previous pending stage is marked `completed`
- new stage inserted as `pending`
- `rec_candidate_event` logs `stage_change`

Key guard rails:
- advancing beyond `enquiry/hr_screening/caf` requires CAF submission, unless superadmin
- moving to `hr_screening` through the standard transition endpoint requires `l2_owner_email`
- superadmin-only skip behavior via `decision=skip` or `note=superadmin_skip`

---

## 8. End-to-end process flows

## 8.1 Opening management

Internal APIs:
- `GET /rec/openings`
- `POST /rec/openings`
- `POST /rec/openings/requests`
- `PATCH /rec/openings/{id}`
- `DELETE /rec/openings/{id}`
- `GET /rec/openings/by-code/{opening_code}`

Behavior:
- opening code auto-generated from title
- request flow creates inactive opening (`is_active=0`)
- non-superadmin HR is restricted for some update actions (not full edit/activation)
- delete opening attempts dependent candidate cleanup and best-effort Drive cleanup

Public listing:
- `GET /apply` returns only active openings

## 8.2 Candidate entry flow

Two entry points:
- Public apply: `POST /apply/{opening_code}`
- Internal create: `POST /rec/candidates`

Common side effects:
- create candidate row
- assign `candidate_code` like `SLR-0001`
- create initial `enquiry` stage
- generate CAF token + assessment token
- send application links email
- attempt Drive folder creation
- write event log records

## 8.3 Public apply specifics

Validation and safety:
- requires `Idempotency-Key`
- request hash tracked in `rec_apply_idempotency`
- rate limits by IP and email (window 1 minute, max 5 attempts)
- dedupes by `opening_id + normalized_email`

File handling:
- CV and portfolio uploads accepted as multipart
- Drive folder creation is required; if Drive folder creation fails, request fails with 503

Screening on apply:
- optional screening fields can be captured
- screening decision computed by `evaluate_screening()`
- current implementation:
  - no opening config -> `amber`
  - relocation required + candidate unwilling -> `red`
  - else -> `green`
- this updates `screening_result` and `candidate.needs_hr_review`
- does not auto-advance stage during public apply

## 8.4 CAF flow

Public APIs:
- `GET /caf/{token}` prefill
- `GET /caf/{token}/screening`
- `POST /caf/{token}` submit

Behavior:
- token can expire by `SL_CAF_EXPIRY_DAYS` (unless already submitted)
- on submit:
  - writes/updates screening row
  - computes decision (green/amber/red)
  - sets `candidate.caf_submitted_at`
  - sets `candidate.needs_hr_review`
  - sets `candidate.status = in_process`
  - attempts stage move to `hr_screening` if `l2_owner_email` exists
  - otherwise logs `stage_blocked` event

## 8.5 Candidate Assessment flow

Public APIs:
- `GET /assessment/{token}` prefill
- `POST /assessment/{token}` submit

Behavior:
- one-time submission lock (`assessment_submitted_at`)
- validates rating fields (1..10)
- writes extensive structured assessment dataset
- backfills `candidate.caf_submitted_at` if empty
- if needed, transitions stage to `hr_screening`
- logs event and sends "assessment completed" email

## 8.6 Candidate 360 and internal lifecycle actions

Core APIs:
- candidate list/detail/full/events/stages/screening/offers subresources
- `POST /rec/candidates/{id}/transition`
- `POST /rec/candidates/{id}/convert`

Access rules:
- interviewer/GL/hiring manager views are scoped to:
  - interviews assigned to their person ID, or
  - candidates where `l2_owner_email` matches user email

Conversion:
- requires accepted offer
- requires joining docs status `complete`
- creates/links platform person record
- marks candidate `hired`
- stage -> `hired`
- best-effort Drive move to `Appointed`

## 8.7 Interview flow

Direct scheduling:
- `POST /rec/candidates/{id}/interviews`
- validates time range
- blocks duplicate active interview for same round (unless superadmin behavior)
- optionally creates Google Calendar event
- sends candidate + interviewer emails

Slot invitation scheduling:
- `POST /rec/candidates/{id}/interview-slots/propose`
- computes free slots (calendar-based) for next business days
- stores proposed slots with TTL
- sends candidate email containing signed selection links

Public slot selection:
- `GET /interview/slots/{token}` and `/recruitment/interview/slots/{token}`
- verifies signed token (strict in production)
- reserves slot, checks conflicts, creates interview, confirms selected slot, expires sibling slots
- calendar + email notifications triggered

Interview modifications:
- cancel: deletes calendar event best-effort, expires slot invites, sends cancel emails
- reschedule: checks freebusy, updates/creates calendar event, sends reschedule emails

Interview status:
- `POST /rec/interviews/{id}/status` with `taken` or `not_taken`
- one-time status mark
- `taken` -> transition to round feedback stage (`l1_feedback` or `l2_feedback`)
- `not_taken` -> remove draft interview assessment

## 8.8 Interview assessment flow

APIs:
- L1/L2 read/save/submit/delete/pdf endpoints

Rules:
- HR admin/exec are read-only for assessments unless superadmin
- interviewer/GL can edit their own assessment context
- submitted assessment is locked (except superadmin)
- submit sets interview `feedback_submitted=true`
- PDF export uses WeasyPrint

## 8.9 Sprint flow

Template management:
- superadmin CRUD for templates and template attachments

Assignment:
- `POST /rec/candidates/{id}/sprints`
- creates candidate sprint with public token and due date
- copies template attachments into candidate sprint storage when possible
- sends sprint assignment email
- transitions candidate stage to `sprint` if not already

Candidate submission:
- `POST /sprint/{token}`
- public token gating + due/status expiry checks
- file upload required (URL submissions blocked)
- submission stored in Drive and sprint marked `submitted`

Review:
- internal patch on sprint supports scoring/comments/decision
- decision:
  - `advance` -> stage `l1_shortlist`
  - `reject` -> stage `rejected`

## 8.10 Offer flow

Internal lifecycle:
- draft create/update
- submit for approval
- approve/reject (approval stage)
- send offer to candidate

Public candidate lifecycle:
- `GET /offer/{token}`
- `GET /offer/{token}/pdf` (signed URL with exp+sig)
- `POST /offer/{token}/decision` (accept/decline)

Core transitions in service layer:
- accept -> offer status `accepted`, candidate stage `joining_documents`
- decline -> offer status `declined`, candidate stage `declined`

Additional public decline handling:
- public decision route also marks candidate `rejected` and creates `rejected` stage, then attempts Drive move to `Not Appointed`
- this is an implementation-level divergence to be aware of in reporting/analytics

## 8.11 Joining documents and hire conversion

Internal and public uploads:
- internal HR upload by candidate ID
- public candidate upload by accepted offer token only

Required types tracked:
- `pan`
- `aadhaar`
- `marksheets`
- `experience_letters`
- `salary_slips`

Status logic:
- no docs -> `none`
- all required docs present -> `complete`
- otherwise -> `partial`

Final hire:
- superadmin conversion endpoint checks accepted offer + complete docs, then transitions to `hired`

---

## 9. Eventing and observability

Every major action logs to `rec_candidate_event` with:
- `action_type`
- related entity type/id
- optional meta payload

SSE stream:
- `GET /rec/events/stream`
- event bus uses Redis pub/sub when `REDIS_URL` is set, otherwise in-memory queue broadcast

Dashboard activity feed:
- `GET /rec/events`
- scoped by role and candidate ownership/interviewer assignments

---

## 10. Scheduler and automated reminders

Configured jobs:
- CAF reminders every 30 min
- interview feedback reminders every 30 min
- interview status elapsed reminders every 30 min
- sprint reminders every 60 min
- offer follow-ups every 6 hours
- stale stage sweep every 6 hours

Key reminder predicates:
- CAF pending in `hr_screening/caf` beyond `SL_CAF_REMINDER_DAYS`
- feedback pending beyond `SL_FEEDBACK_REMINDER_HOURS`
- interview status not marked beyond `SL_INTERVIEW_STATUS_REMINDER_MINUTES`
- sprint assigned and near/overdue based on configured windows
- offer in `sent` state beyond `SL_OFFER_FOLLOWUP_DAYS`

Idempotency for reminders:
- dedupe via prior `email_sent`/event checks before sending duplicates

---

## 11. Reporting and analytics

Dashboard (`/rec/dashboard`) returns:
- total applications
- active candidates
- new today/new 7 days
- CAF submitted today
- active openings count
- amber review count
- stuck stage count
- CAF overdue
- feedback pending
- sprint overdue
- offers awaiting response
- stage distribution

Reports API (`/rec/reports`):
- available report groups: `candidates`, `openings`, `offers`, `interviews`, `sprints`
- supports preview and CSV download
- filter options: date range, opening, status, active flag (report dependent)
- access restricted to `hr_admin`

---

## 12. Integrations and file layout behavior

Drive folder topology per candidate:
- Candidate root (under Ongoing/Appointed/Not Appointed bucket)
- subfolders: `Application`, `Sprint`, `Offer`, `Joining`

Drive moves:
- hired conversion -> move to `Appointed`
- public offer decline path -> attempt move to `Not Appointed`

Email:
- templated HTML files in `backend/app/templates/email`
- sends are logged as events even when skipped/failing

Calendar:
- create/update/delete events via service account delegation
- freebusy used for slot computation and collision checks

---

## 13. Public token and security model

Public tokenized features:
- apply opening by code
- CAF token
- assessment token
- sprint token
- offer token
- joining token
- interview selection token (signed)

Security controls:
- signed public selection/PDF links with HMAC + expiry
- configurable public origin/base path
- internal API key middleware for sensitive route prefixes
- auth route rate limiting
- apply endpoint idempotency + anti-abuse throttling
- strict cookie/session checks in frontend middleware during Google auth mode

---

## 14. Important operational caveats

1. Screening automation is minimal by design right now.
Current rule set does not auto-shortlist/reject stages directly.

2. Stage transition consistency around offer decline has dual paths.
Service layer sets `declined`, while public route additionally writes `rejected` behavior.

3. `schedule/[token]` frontend page is placeholder.
Actual production slot flow is the backend-rendered `/interview/slots/{token}` route.

4. Some operations are best-effort for external services.
Calendar and Drive failures are often logged but do not always hard-fail the full workflow.

5. Superadmin logic combines multiple signals.
Role id/code checks and dev-mode HR admin fallback may affect behavior in non-production.

---

## 15. Quick API map by function

Auth:
- `/auth/me`
- `/auth/logout`

Candidate/public intake:
- `/apply`
- `/caf/{token}`
- `/assessment/{token}`

Internal pipeline:
- `/rec/openings*`
- `/rec/candidates*`
- `/rec/interviews*`
- `/rec/sprint-templates*`
- `/rec/sprints*`
- `/rec/offers*`
- `/rec/reports*`
- `/rec/dashboard`
- `/rec/events*`

Public continuation:
- `/interview/slots/{token}`
- `/sprint/{token}`
- `/offer/{token}`
- `/joining/{token}`

Admin platform management:
- `/platform/people*`
- `/platform/roles*`

---

## 16. Recommended engineering follow-ups

1. Normalize decline terminal state (`declined` vs `rejected`) in one place.
2. Centralize stage transition policy so all flows use one guard path.
3. Add integration tests around public apply idempotency + slot reservation race cases.
4. Add explicit state diagram validation for stage progression in backend tests.
5. Consider persisting calendar/drive operation outcomes with retry queues for stronger reliability.

---

## 17. Current Backend Capacity (Measured)

Measurement date:
- February 9, 2026

Runtime tested:
- Recruitment backend at `127.0.0.1:8002`
- Process command: `python -m uvicorn app.main:app --host 127.0.0.1 --port 8002 --workers 1 --proxy-headers --forwarded-allow-ips=127.0.0.1`
- Direct backend access (not through frontend proxy)
- Read-only `GET` endpoints
- 5-second sustained runs, concurrency `5`, `10`, `15`

Observed zero-error throughput (`status=200`):

| Endpoint | Concurrency 5 | Concurrency 10 | Concurrency 15 | Error rate |
|---|---:|---:|---:|---:|
| `GET /health` | 1333.6 req/s | 854.6 req/s | 704.6 req/s | 0.0% |
| `GET /apply` | 543.4 req/s | 557.0 req/s | 493.0 req/s | 0.0% |
| `GET /apply/SRAR-7B6B` | 565.8 req/s | 570.0 req/s | 505.2 req/s | 0.0% |

Latency snapshot at concurrency `10`:

| Endpoint | p95 | p99 |
|---|---:|---:|
| `GET /health` | 27.42 ms | 107.41 ms |
| `GET /apply` | 19.43 ms | 24.74 ms |
| `GET /apply/SRAR-7B6B` | 18.95 ms | 23.92 ms |

Interpretation for current setup:
- For lightweight public read APIs on this machine and this single-worker setup, current practical capacity is about `500-570 req/s` at low error.
- Health endpoint can exceed this because it bypasses DB and business logic.

Important limits not represented by these numbers:
- Write-heavy endpoints (`POST /apply/{opening_code}`, interview scheduling, offer actions, document uploads) will be lower due to DB writes and external services (Drive/Calendar/Gmail).
- `/auth*` has explicit in-memory rate limiting (`SL_AUTH_RATE_LIMIT_PER_MIN`, default `60`/minute/path/IP).
- Public apply has anti-abuse throttling (`5` attempts per minute per IP/email).
