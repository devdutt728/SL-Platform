# SL Platform - Functional Overview (App-by-App)

This document is the definitive reference for **what each app in this monorepo does**, where its functionality lives, and how the pieces connect. It covers:

- The root-level utilities that orchestrate the dev stack (Caddy proxy, start/stop scripts, log viewer).
- Every module (`SL_IT`, `SL_Recruitment`, `SL_Workbook`) with backend routes, services, jobs, frontend flows, integrations, and env requirements.
- The scheduled jobs, Drive/email templates, storage touchpoints, and wiring that keep the platform operational.

If you need a stricter line-by-line breakdown for a specific folder/file, call that out and I’ll expand that section separately.

---

## Top level & shared infrastructure

### Root utilities

- `Caddyfile`: Reverse-proxy on port `3000`. Routes:
  - `/api/rec*` and `/api/auth` (with `slr_token` cookie) → recruits via `localhost:3002`.
  - `/api/auth` (with `slp_token` cookie) → IT portal on `localhost:3001`.
  - `/it*` → IT frontend (`localhost:3001`).
  - `/recruitment*` → Recruitment frontend (`localhost:3002`).
  - Everything else → Workbook page (`localhost:3003`).
  - Targets share a single entry-point so OAuth cookies can be scoped per workspace.

- `start-all.cmd`: Bootstraps on Windows:
  - Stops conflicting services on ports `3000-3003` and `8001-8002`.
  - Ensures GTK3 is on `PATH` (WeasyPrint requirement).
  - Downloads/updates `tools/caddy.exe` if missing.
  - Starts two Uvicorn backends (`SL_IT` on 8001, `SL_Recruitment` on 8002) and three Next.js dev servers (ports 3001, 3002, 3003).
  - Writes PIDs to `logs/pids.json` and opens `monitor.cmd`.

- `stop-all.cmd`: Kills every process tied to the workspace (port matches or command-line contains `D:\SL Platform`), deletes the PID file, and closes the monitor window.
- `monitor.cmd`: Displays each service log file (`it-backend.log`, `recruitment-frontend.log`, etc.) with colored labels and timestamps.
- `clear-logs.cmd`: Optionally forces a stop (`/force`) and zeroes every `.log` file under `logs/`.
- `tools/`: Contains bundled Caddy binaries and zipped releases used by `start-all.cmd`.
- `logs/`: Runtime log output for every service; consumed by `monitor.cmd`.
- `README.md`: Placeholder title. The real documentation lives under the module subfolders.

### Shared constraints

- All apps talk to the shared `sl_platform` schema for identity (`DimPerson`, `DimRole`, etc.).
- Google OAuth in each app uses service account credentials (`secrets/google-service-account.json`) plus workspace domain restrictions.
- Dev mode overrides exist (`SL_AUTH_MODE=dev`, header injection) but production is expected to use Google ID tokens.
- Each module ships with its own `.env.example` (backend and frontend) and expects `.env`/`.env.local` copies in that folder.

---

## Module: SL_IT (Studio Lotus IT Platform)

Paths: `SL_IT/backend/` + `SL_IT/frontend/`

Purpose: Internal IT portal with ticketing, assets, licenses, admin user management, and audit trails. Built with FastAPI + Next.js (App Router).

### Backend functionality

#### Entrypoints & config

- `backend/app/main.py`: FastAPI app factory:
  - Creates middleware: request context (for audit metadata) and logging.
  - Conditionally auto-creates tables from SQLAlchemy models in dev builds.
  - Attaches `CORSMiddleware` for `localhost:3000`.
  - Includes routers for `auth`, `admin`, and `it`.

- `backend/app/core/config.py`: Pydantic settings for database URLs, Google OAuth/service account, role mapping, Gmail/Calendar toggles, ticket rate limit, and superadmin email.
  - `SL_DATABASE_URL` points to the `sl_it` schema.
  - `SL_PLATFORM_DATABASE_URL` points to `sl_platform` for identity lookups.
  - `SL_ROLE_MAP_JSON` maps platform role IDs → SLP roles (`superadmin`, `admin`, `it_lead`, `it_agent`, `employee`).
  - `SL_SUPERADMIN_EMAIL` is seeded using `app/scripts/seed_superadmin.py`.

#### Auth + wrap-around helpers

- `backend/app/routers/auth.py`: `/auth/me` returns `UserContext` (email, roles, platform IDs). Depends on `core.auth.get_current_user`, which checks:
  - Google ID tokens (`SL_AUTH_MODE=google`).
  - Dev headers (`X-User-Email`, `X-User-Roles`) when `SL_AUTH_MODE=dev`.

- `backend/app/core/auth.py`: Verifies tokens via Google ID token validation, looks up `sl_platform.dim_person`, and maps roles via `role_map`.
- `backend/app/rbac.py`: Dependency helpers (e.g., `require_employee`, `require_it_agent`, `require_it_lead`, `require_superadmin`) that gate each endpoint.

#### IT APIs (`routers/it.py`)
All endpoints live under `/it`.

- **Categories & Subcategories**:
  - `GET /categories`, `/subcategories`: List active values (employee view).
  - `POST /admin/categories`, `/admin/subcategories`: Create and update metadata.
  - CSV import endpoints allow bulk policy loads.

- **Tickets**:
  - `POST /tickets`: New ticket creation with rate limit (`SL_RATE_LIMIT_TICKET_PER_MINUTE`) and SLA calculation. Sends email confirmation via Gmail service.
  - `GET /tickets`: Lists open tickets; IT roles see all, employees see only their own.
  - `GET /tickets/{id}`: Details with comments; non-IT roles only see public comments.
  - `PATCH /tickets/{id}`: Update subject/description (requester/IT roles).
  - `POST /tickets/{id}/comments`: Add comment (internal flag restricted to IT roles).
  - `POST /tickets/{id}/assign`: Assign/clear assignee, validates platform identity, enforces IT-role requirements.
  - `POST /tickets/{id}/transition`: Change status (triaged, in-progress, waiting on user, resolved, closed, reopened). Ensures SLA/resolution timestamps update and audit log is written.

- **Assets & licenses**:
  - CRUD plus imports for assets, vendors, licenses, license assignments.
  - CSV imports for assets/licenses/routing rules and license assignments allow population from spreadsheets.

- **Routing rules, SLAs, categories**:
  - Admin endpoints to import CSV rows for categories/subcategories/SLAs/routing via `upload_policies`.
  - `ITRoutingRule` drives default assignees.

- **Audit logging**:
  - `app/services/audit_service.write_audit_log` records each mutation (ticket create/update, asset/license changes, user changes) with contextual metadata from `RequestContextMiddleware`.

- **Gmail + calendar**:
  - `app/services/gmail_service.send_email` sends ticket notifications (create, assign, status change).
  - `app/services/calendar_service` exists but currently only referenced when Gmail/calendar features are enabled.

- **Supporting services**:
  - `app/services/platform_identity.resolve_identity_by_person_id` talks to `sl_platform`.
  - `app/services/ticketing_service` encapsulates SLA lookups, ticket numbering, priority suggestion, transition validation (`compute_sla_due`, `suggest_priority`, etc.).

#### Admin APIs (`routers/admin.py`)

- **Platform user management** (superadmin only):
  - `GET /admin/users`: Lists platform users (joins `DimRole` for role metadata).
  - `PATCH /admin/users/{person_id}`: Update role/status; prevents removing the last superadmin (`prevent_last_superadmin_change`).
  - `POST /admin/users`: Creates new platform user entries.
  - `POST /admin/users/import`: Bulk import from CSV with row limits/validation.
  - `GET /admin/roles`: Lists roles from `sl_platform.dim_role`.

- Audit logs are written into the `sl_it` schema for all admin actions (via the same audit service).

### Backend routers (SL_IT)

#### `backend/app/routers/auth.py`
› `GET /auth/me`: returns `UserContext` (email, roles, platform IDs) for the authenticated user by calling `core.auth.get_current_user`.

#### `backend/app/routers/it.py`
Endpoints under `/it`:
- Categories/subcategories: `GET /categories`, `/subcategories` for employees, and corresponding admin CRUD/CSV import under `/admin/categories`, `/admin/subcategories`, `/admin/policies/upload`.
- Ticket lifecycle: `POST /tickets`, `GET /tickets`, `GET /tickets/{ticket_id}`, `PATCH /tickets/{ticket_id}`, `POST /tickets/{ticket_id}/comments`, `/assign`, `/transition`.
- Assets/licenses administration: `GET POST PATCH /admin/assets`, `/admin/vendors`, `/admin/licenses`, `/admin/license-assignments`, plus CSV imports (`/admin/assets/import`, `/admin/licenses/import`, `/admin/license-assignments/import`).
- Routing/SLA imports: `/admin/policies/upload` bulk loads categories, subcategories, SLAs, and routing rules preventing duplicates.
- License assignments: `POST /admin/license-assignments`, `GET /admin/license-assignments` scoped by license_id, and `POST /admin/license-assignments/import`.

#### `backend/app/routers/admin.py`
Superadmin-only platform user CRUD:
- `GET /admin/users`: list users joined with their `DimRole`.
- `GET /admin/roles`: list roles from `sl_platform.dim_role`.
- `PATCH /admin/users/{person_id}`: update role/status, guarded by `prevent_last_superadmin_change`.
- `POST /admin/users`: create a `DimPerson` entry.
- `POST /admin/users/import`: CSV import with row limits, dedupe, and audit logging.

### Frontend functionality (`SL_IT/frontend/`)
### Frontend functionality (`SL_IT/frontend/`)

Framework: Next.js 14 App Router + Tailwind + Radix UI components.

- `package.json`: uses React 18.3, Tailwind 3.4, Clsx, `class-variance-authority`, Radix primitives, lucide icons, React Hook Form, Zod.
- `app/(auth)/login`: Handles Google OAuth login via `/api/auth/google/start`.
- `app/(portal)/page.tsx`: Shell that renders layout, top bar, side nav, and dynamic workspace content.

- `app/(portal)/admin/*`: Superadmin/admin dashboards:
  - `app/(portal)/admin/users/page.tsx`: Platform user table with role/status controls.
  - `admin/it/assets`, `it/licenses`, `it/licenses/page.tsx`, `it/licenses/*`: Asset and license grids.
  - `admin/it/licenses/` level, `analytics`.

- `app/(portal)/(it)/*`: Ticket workspace:
  - `/ticket/[id]`: Ticket detail view.
  - `/ticket`: Ticket list or queue.
  - `/queue/[id]/page.tsx`: Scheduling?
  - `/it/ticket` etc – provides IT agent experience (create, update, comment, transition).
  - `Portal shell`, `module-tabs`, `context panel`, topbar, sidebar components.
- Shared UI components: `user-context`, `role-guard`, `confirm-dialog`, `quick-stats`.
- `app/api/auth/*`: Proxy routes for Google OAuth and `me` endpoint; sets cookies (`slp_token`).
- `lib/*`: Helpers for auth (`google-oauth.ts`, `require-auth.ts`), API proxies (`backend.ts`), request origin detection, caching, and tenant context.

### Frontend routes (SL_IT)

- `app/(auth)/login/page.tsx`: Google OAuth login screen that redirects to `/api/auth/google/start` and handles callbacks.
- `app/(portal)/page.tsx`: Shared layout with sidebar/topbar; renders workspace via `ModuleTabs`.
- `app/(portal)/(it)/ticket/[id]/page.tsx`: Ticket detail view with comments, status transitions, and audit timeline.
- `app/(portal)/(it)/ticket/page.tsx`: Ticket list/queue view that calls `/api/it/tickets`.
- `app/(portal)/(admin)/users/page.tsx`: Platform user admin table wired to `/api/admin/users`.
- `app/(portal)/(admin)/(it)/assets/page.tsx`: Asset grid for create/update operations via `/api/it/assets`.
- `app/(portal)/(admin)/(it)/licenses/page.tsx`: License inventory UI plus license assignment modals.
- `app/api/it/*`, `app/api/admin/*`: Route handlers that proxy fetches to FastAPI backend, attach `slp_token`, and handle JSON responses.

### Setup & env

- `SL_IT/backend/.env.example`: Contains DB URLs, OAuth secrets path, domain restriction, Gmail/calendar toggles, role map, superadmin email, ticket rate limit.
- `SL_IT/frontend/.env.local.example`: `BACKEND_URL=http://localhost:8001`, `NEXT_PUBLIC_AUTH_MODE=google`, `NEXT_PUBLIC_BASE_PATH=/it`, `NEXT_PUBLIC_PORTAL_ORIGIN=http://localhost:3000`.
- `docs/SETUP.md`: Step-by-step local setup (virtualenv, DB creation, OAuth setup, Gmail/domain-wide delegation).
- Seed script: `app/scripts/seed_superadmin.py` bootstraps a superadmin in the database (requires email existing in `sl_platform.dim_person`).

---

## Module: SL_Recruitment (Recruitment OS)

Paths: `SL_Recruitment/backend/` + `SL_Recruitment/frontend/`

Purpose: End-to-end recruitment workflow (openings, candidates, CAF, interviews, offers, on-boarding docs) with Google auth, Drive integrations, and scheduled reminders.

### Backend functionality

#### Entry point & config

- `app/main.py`: FastAPI app with `/health`, middleware, router inclusion, and scheduler startup/shutdown hooks.
- `app/core/config.py`: Settings for DB URLs, Drive folder IDs, Gmail/Calendar toggles, public link generation, reminder windows, and Google OAuth/service account paths.
- `app/api/router.py`: Registers all sub-routers (auth, candidates, CAF, openings, offers, dashboard, interviews, joining docs, sprints, platform people, public apply).

#### Auth & identity

- `app/core/auth.py`: Supports Google ID tokens (default) or dev headers; validates against `sl_platform.dim_person`.
- `app/core/roles.py`: Role definitions (e.g., `HR_ADMIN`, `HIRING_MANAGER`, `INTERVIEWER`, `VIEWER`, etc.).
- `app/services/platform_identity`: Platform lookups used by candidate creation, interview scheduling, etc.

#### `app/api/routes` summary

- `auth`: `/rec/auth/me` returns the signed-in user context; uses the same guard as the recruitment UI.

- `openings` (`/rec/openings`):
  - List with optional `is_active`.
  - Create & request endpoints differentiate between immediate activation vs. request (requests default to inactive).
  - GET by ID/code, PATCH (superadmin only), DELETE (cascades candidates/candidate data + Drive cleanup using `app/services/drive.delete_drive_item`).
  - Automatically pulls requester metadata from `sl_platform.dim_person/DimRole`.
  - Generates unique opening code via `_generate_opening_code`.

- `candidates` (`/rec/candidates`):
  - Creation triggers CAF link email, candidate code (deterministic), stage entries (`enquiry`, `hr_screening`), Drive folder creation, event logs.
  - Listing includes filters (`opening_id`, `status`, `stage`), conversation stage, ageing days, screening result.
  - Detail endpoint, download CV/resume, and full candidate profile (joined with screening/stages/offers).
  - Screening endpoints (get & upsert) allow manual results.
  - CAF link retrieval, update (status changes), delete (plus Drive cleanup), Drive folder cleanup endpoint.
  - Event log listing, candidate offer listing, stage transitions, conversion utility.

- `caf` (`/rec/caf`):
  - `GET /prefill`: returns candidate/application data.
  - `GET /screening`: summarises screening inputs for candidate/stage.
  - `POST /submit`: Validates CAF payload, transitions stage via `_transition_from_caf`, updates candidate status, logs events, and optionally triggers Gmail/calendar actions.

- `offers` (`/rec/offers` + public endpoints):
  - CRUD (`list`, `get`, `update`, `delete`) for offers with metadata (status, salary, joining date).
  - `POST /send`: Sends offer via email/PDF, attaches files from Drive if provided.
  - Approval/rejection endpoints for HR admin flows.
  - Preview endpoints for HTML email/letter using WeasyPrint templates (`app/templates/offer_letter.html` + `offer_letter_logo.png`).
  - Public offer links support PDF download and decision (accept/reject) with signed tokens.
  - Helper `_offer_link` builds tenant-specific public URL.

- `public_apply` (`/rec/public_apply`):
  - `GET /openings`: public listing of active openings (mirrors `openings` route).
  - `GET /openings/{code}/prefill`: Pre-populates apply form with basic opening metadata.
  - `POST /apply`: Idempotent application creation (hash-based dedupe), attaches uploads to Drive, creates candidate stages/CV, sends CAF link email.
  - Helpers to parse inputs (`_split_name`, `_validate_currency`, `_date_or_none`) and to handle file uploads via signed Drive (via `app/services/drive.upload`).
  - Transitions CAF stage once application submitted.

- `dashboard` (`/rec/dashboard`):
  - `GET /dashboard`: Aggregates metrics (total apps, active candidates, new applications, CAF submissions, openings, needs review, stage distribution, stuck counts, SLA misses, offer responses) using SQL queries/statistics.
  - `GET /events`: Lists recent candidate events (filtered by performer, superadmin sees all).
  - `GET /events/stream`: SSE stream (`event_bus`) that frontends subscribe to for live activity feeds.

- `interviews` (`/rec/interviews`):
  - Slot creation/resolution APIs for interview scheduling (including conflict detection).
  - `POST /propose`: Adds interview slot proposals, handles email previews.
  - Public `GET /slots/preview`, `GET /slots/email-preview`, `POST /slots/select`.
  - `cancel`, `reschedule`, `list`, `get`, `update` operations with RBAC checks.
  - Utilises `platform_person_id` lookups, timezone normalization, and Google calendar busy checks (using domain-wide delegated service account).

- `joining_docs` (`/rec/joining_docs`):
  - Internal upload endpoint that stores files on Drive and marks joining doc status.
  - Public upload route to let candidates submit required documents via signed token.
  - GET endpoints to list docs (internal) or fetch public documents (tokenized).

- `sprints` (`/rec/sprints`):
  - Sprint template CRUD + attachments (with Drive storage).
  - Candidate sprint assignment, tracking (`list_candidate_sprints`, `get_sprint`, `update`).
  - Public sprint submission (candidates submit work via signed link, attachments, statuses).
  - Attachment download via public tokens.

- `platform_people`: Searches `sl_platform` and exposes person metadata for frontend auto-complete.

### Backend routers (SL_Recruitment)

#### `app/api/routes/auth.py`
- `GET /rec/auth/me`: returns the recruitment user context (email, platform person ID, roles, workspace flags).

#### `app/api/routes/openings.py`
- `GET /rec/openings`: list active/inactive openings with requester metadata (jump to `sl_platform.dim_person` via `PlatformSessionLocal`).
- `GET /rec/openings/{id}` and `/rec/openings/by-code/{code}`: detail view.
- `POST /rec/openings`: create with deduped code via `_generate_opening_code`; ensures `reporting_person_id_platform` fits schema (migration note on `0003_opening_requested_by_string`).
- `POST /rec/openings/requests`: HR-only opening request (created inactive by default).
- `PATCH /rec/openings/{id}`: superadmin only updates; HR can only deactivate (no reactivation).
- `DELETE /rec/openings/{id}`: removes opening plus all dependent rows (candidates, events, stages, interviews, offers, sprints) and optional Drive cleanup via `delete_drive_item`.

#### `app/api/routes/candidates.py`
- `POST /rec/candidates`: candidate creation triggers CAF link email, Drive folder creation (via `app/services/drive.create_candidate_folder`), stage setup (`enquiry`→`hr_screening`), and candidate events.
- `GET /rec/candidates`: list with filters (`opening_id`, `status`, `stage`), current stage/ageing days, screening result, plus `opening_title`.
- `GET /rec/candidates/{id}`: detail data (including `RecCandidateScreening`, events, offers).
- `GET /rec/candidates/{id}/full`: candidate 360 view (stages, screening, offers).
- Application documents: `GET /rec/candidates/{id}/application/{kind}` downloads CV/CAF forms, `GET /rec/candidates/{id}/screening` and `PUT /rec/candidates/{id}/screening` for HR screening entry.
- `GET /rec/candidates/{id}/caf-link`: exposes CAF public token + link.
- `PATCH /rec/candidates/{id}`: partial updates, includes stage/status adjustments.
- `DELETE /rec/candidates/{id}` and `/cleanup`: removes candidate plus Drive folder logs.
- `GET /rec/candidates/{id}/events`: events listing, `GET /rec/candidates/{id}/offers`: offers summary, `POST /rec/candidates/{id}/offers`: create offer tied to candidate.
- `GET /rec/candidates/{id}/stages`, `/transition`, `/convert`: stage history, manual transition, and conversion utilities.

#### `app/api/routes/caf.py`
- `GET /rec/caf/prefill`: returns candidate metadata for CAF form (name, email, attachments).
- `GET /rec/caf/screening`: summarises screening data and pending stage info.
- `POST /rec/caf/submit`: validates CAF payload, updates `RecCandidate` fields (CAF stage timestamps, statuses), transitions stage via `_transition_from_caf`, triggers events and Gmail/calendar hooks.

#### `app/api/routes/offers.py`
- `GET /rec/offers` and `/rec/offers/{id}`: offer list/detail with driver metadata.
- `POST /rec/offers`: create/upsert offer record.
- `PATCH /rec/offers/{id}`, `DELETE /rec/offers/{id}`: update & remove.
- Administrative workflows: `POST /rec/offers/{id}/approve`, `/reject`, `/send` for triggering email/PDF.
- `POST /rec/offers/admin/decision`: bulk decision by HR.
- Previews: `/rec/offers/{id}/preview-letter`, `/preview-email`.
- Candidate-specific: `GET /rec/candidates/{id}/offers`, `POST /rec/candidates/{id}/offers`.
- Public offer experience: `GET /rec/offers/public/{token}`, `GET /rec/offers/public/{token}/pdf`, `POST /rec/offers/public/{token}/decision`.

#### `app/api/routes/public_apply.py`
- `GET /rec/public_apply/openings`: public listing + filter.
- `GET /rec/public_apply/openings/{code}/prefill`: read opening metadata.
- `POST /rec/public_apply/apply`: idempotent submission (hash providing dedup), handles file uploads via `_upload` helper, populates `RecCandidate` and `RecCandidateStage`, stores Drive links, sends CAF link, and optionally transitions stage.

#### `app/api/routes/dashboard.py`
- `GET /rec/dashboard`: aggregated metrics (total apps, active candidate count, cycles, stage distribution, stuck/overdue counts).
- `GET /rec/dashboard/events`: recent candidate events filtered by user context.
- `GET /rec/dashboard/events/stream`: SSE powered by `event_bus`.

#### `app/api/routes/interviews.py`
- Slot scheduling: `POST /rec/interviews` (create), `POST /rec/interviews/propose`, `GET /rec/interviews/{id}`, `POST /rec/interviews/{id}/cancel`, `/reschedule`.
- Slot preview helpers: `/previews`, `/email-preview`.
- `POST /rec/interviews/{id}/select`: candidate chooses slot.
- Utility endpoints for debugging (`/debug/interview-slot-lookup`) and public token flows (`/slots/select`, `/slots/preview`).

#### `app/api/routes/joining_docs.py`
- Internal endpoints for listing (`GET /rec/joining_docs`), uploading (`POST /rec/joining_docs/upload`), and status updates.
- Public upload/download: `GET /rec/joining_docs/public/{token}`, `POST /rec/joining_docs/public/{token}` to accept candidate documents.

#### `app/api/routes/sprints.py`
- Sprint template CRUD (`GET`, `POST`, `PATCH` on `/rec/sprints/templates`).
- Attachment management (`GET /rec/sprints/templates/{id}/attachments`, `POST` + `DELETE`).
- Candidate sprint assignments (`POST /rec/sprints/assign`), listings (`GET /rec/sprints`), updates.
- Public sprint submission: `GET /rec/sprints/public/{token}`, `POST /rec/sprints/public/{token}`.
- File downloads tied to public tokens (`GET /rec/sprints/public/{token}/attachments/{attachmentId}`).

#### `app/api/routes/platform_people.py`
- `GET /rec/platform_people`: paginated search of `DimPerson` records for populating requester/interviewer pickers.

### Frontend routes (SL_Recruitment)

- `app/(auth)/login/page.tsx`: HR login with Google OAuth and guidance for dev mode tokens.
- `app/(recruitment)/dashboard/page.tsx`: Dashboard UI that consumes `/rec/dashboard` metrics and SSE feed.
- `app/(recruitment)/openings/page.tsx`: Opening list and modal forms; uses `/api/rec/openings`.
- `app/(recruitment)/candidates/page.tsx` and `/candidates/[id]/page.tsx`: Candidate list/candidate 360 pages with CAF links and stage controls.
- `app/(recruitment)/offers/page.tsx` plus `[id]`: Offer management (send, preview, decisions); uses `/api/rec/offers`.
- `app/(recruitment)/activity/page.tsx`: Event feed hooking into `/rec/dashboard/events/stream`.
- `app/(recruitment)/sprint-templates/page.tsx`: CRUD UI for sprint templates + attachment management hitting `/api/rec/sprints`.
- Public routes: `/apply/[opening_code]`, `/caf/[token]`, `/offer/[token]`, `/sprint/[token]`, `/schedule/[token]`, `/joining/[token]`. Each page interacts with corresponding `/rec/public_*` APIs, renders forms, uploads files, handles signed tokens from emails.
- `app/api/**`: collection of fetch helpers/proxies (`/api/rec/*`, `/api/auth/*`) that attach `slr_token`, parse JSON, and surface errors to UI components.

### Configuration files

- `SL_IT/backend/app/core/config.py`: Pydantic settings for DB URLs, Google OAuth credentials, role map JSON, Gmail/calendar toggles, rate limits, and superadmin bootstrap.
- `SL_IT/backend/.env.example` + `.env.local`: Document the required environment (DB URLs, OAuth secrets path, workspace domain, service account path, Gmail/calendar toggles, role map JSON, superadmin email, rate limit overrides).
- `SL_Recruitment/backend/app/core/config.py`: Settings for Drive folder IDs, public link tokens, reminder windows, Gmail/calendar toggles, Google OAuth & service account paths, and `public_link_signing_key`.
- `SL_Recruitment/backend/.env.example` + `.env`: Provide actual values for DB URLs, Drive IDs, Gmail/calendar toggles, OAuth secrets, `SL_PUBLIC_LINK_*`, and optional Redis `REDIS_URL` for event streaming.
- `SL_IT/frontend/.env.local.example` + `SL_Recruitment/frontend/.env.local.example`: Document `BACKEND_URL`, `NEXT_PUBLIC_AUTH_MODE`, `NEXT_PUBLIC_BASE_PATH`, `PUBLIC_APP_ORIGIN`, and `NEXT_PUBLIC_PORTAL_ORIGIN`.
#### Services & integrations

- `app/services/drive.py`: Wraps Google Drive operations; used for candidate folders, application uploads, offer attachments, sprint assets, joining docs.
- `app/services/email.py`: Sends templated emails (`caf_link`, `sprint_reminder`, `offer_followup`, `interview_feedback_reminder`, etc.), logs email events for deduping.
- `app/services/calendar.py`: Creates events (interview schedules) via Google Calendar domain-wide delegation.
- `app/services/events.py`: Logs generic candidate events (`candidate_created`, `stage_change`, etc.) for dashboards/SSE.
- `app/services/event_bus.py`: Async queue used by dashboards for SSE streaming.
- `app/services/platform_identity.py`: Resolves `DimPerson` metadata.
- `app/services/opening_config.py`: Stores optional screening rules (Phase 3A) for openings.
- `app/services/offer`: (as referenced) handles letter overrides, PDF generation with WeasyPrint and Drive attachments.

#### Scheduled jobs (`app/jobs`)

- `scheduler.py`: APScheduler with 5 jobs (CAF reminders, interview feedback reminders, sprint reminders, offer followups, stale-stage sweeps). Runs on startup and shuts down cleanly.
- `tasks.py`: Each job queries the DB, dedupes via `RecCandidateEvent`, and sends templated emails:
  - CAF reminder (candidates who haven’t submitted CAF after `caf_reminder_days`).
  - Interview feedback reminder (notifies interviewers, escalates to Gmail sender if overdue).
  - Sprint reminder/overdue (candidate emails with sprint link).
  - Offer follow-up (sent offers not responded to after `offer_followup_days`).
  - Stale stage sweep logs events for candidates stuck too long.

#### Templates

- `app/templates/email/*.html`: Email templates for reminders and notifications.
- `app/templates/offer_letter.html`: HTML used by WeasyPrint to generate offer PDFs.
- `app/templates/offer_letter_logo.png`: Logo used in the PDF.

#### Migrations

- `backend/migrations/*.sql`: SQL scripts (0002 → 0016) to evolve the `sl_recruitment` schema (CAF screening, sprints, offers, joining docs, etc.). Apply in order.

### Frontend functionality (`SL_Recruitment/frontend/`)

Framework: Next.js 14 App Router + Tailwind + Framer Motion for UI transitions.

- `package.json`: Next 14, Tailwind, Framer Motion, lucide icons. Depends on `react` 18.2.
- `app/layout.tsx`: Global layout with fonts, theme, and context providers.
- `app/(recruitment)` subfolder: Authenticated workspace pages under `/recruitment`.
  - `/recruitment/dashboard`: Metrics cards (openings, stages, reminders) that consume `/rec/dashboard`.
  - `/recruitment/openings`: CRUD UI for opening list and detail (maps to `/rec/openings`).
  - `/recruitment/candidates`: Candidate list, candidate 360 view, CAF access, stage transitions.
  - `/recruitment/offers`: Offer list/detail, send/reject flows, preview (PDF/email).
  - `/recruitment/activity`: Streams events via SSE `/rec/events/stream`.
  - `/recruitment/sprint-templates`: Manage sprint templates, attachments.
  - `/recruitment/intervals`: (UI skeleton for interviews/slots).

- `app/api/rec/*`: Proxy routes that talk to FastAPI (prefixed `/rec`).
- `app/api/auth/*`: Manage login, logout, Google OAuth callback, and cookie storage (`slr_token`).
- `app/(auth)/login`: Login page for HR users.
- `app/(portal)/` style components reused from IT (topbar, sidebar, context panel, navbar).
- `components/*`: Shared UI (topbar, sidebar, CAF link button, context panel, fonts).
- `lib/*`: `backend.ts` (API client), `auth-server.ts`, `google-oauth.ts`, `datetime.ts`, `oauth-memory`, `require-auth` etc.
- Public routes outside `/recruitment`:
  - `/apply/[opening_code]`: Public apply form that hits `/rec/public_apply`.
  - `/caf/[token]`: CAF form for candidates.
  - `/sprint/[token]`, `/offer/[token]`, `/schedule/[token]`: Public candidate experiences (sprint submission, offer decisions, scheduling links).
  - `/joining/[token]`: Joining doc upload portal.
  - `/api/offer/[token]/pdf`: PDF generation preview.

- Public pages use `app/api` endpoints to preview email templates, upload attachments, and fetch candidate metadata. Many rely on signed tokens/hmac (via `public_link_signing_key`) configured in `.env`.

### Storage & uploads

- `local_uploads/recruitment/candidates/*`: Sample candidate folders with `meta.json` and `cv.txt` for local testing; not part of production but used for demos.
- Drive configuration uses `SL_DRIVE_ROOT_FOLDER_ID`. Service account JSON is shared via `SL_GOOGLE_APPLICATION_CREDENTIALS`. Specific folders (ongoing, appointed, not appointed, sprint assets) can be pinned via optional env vars.

### Setup & env

- `SL_Recruitment/backend/.env.example`: Database URLs, Drive folder IDs, OAuth/service account secrets, Gmail/calendar toggles, public link TTL/signing key, caching (Redis), reminder windows (`caf_reminder_days`, `sprint_overdue_days`, etc.).
- `SL_Recruitment/frontend/.env.local.example`: `BACKEND_URL=http://localhost:8002`, `NEXT_PUBLIC_AUTH_MODE=google`, `NEXT_PUBLIC_BASE_PATH=/recruitment`, `PUBLIC_APP_ORIGIN` for tunnels, `NEXT_PUBLIC_PORTAL_ORIGIN`.
- `SL_Recruitment/backend/.env`: Actual runtime values (shared secret, DB, Drive). Keep service account JSON out of source control.

---

## Module: SL_Workbook (Workbook front-end stub)

Path: `SL_Workbook/frontend/`

Purpose: Placeholder Next.js app (created with `create-next-app`).

- `package.json`: Minimal Next.js 14 + Tailwind + TypeScript setup.
- `app/page.tsx`, `app/layout.tsx`, `app/globals.css`: Standard Next.js scaffold (no custom logic yet).
- `public/`: Contains logo assets repeated from other modules.
- README is stock Next.js template. No backend yet.

---

## Current working status (per module)

- **SL_Recruitment**:
  - Backend endpoints for openings, candidates, CAF, dashboard metrics, events, public apply, offers, and platform people are wired and live.
  - Drive integration creates candidate folders, uploads documents, and stores links.
  - Google auth/`sl_platform` user lookup are functional; dev headers supported.
  - Frontend recruitment workspace, public apply, CAF, and offer pages are implemented. Pages for schedule, sprint, and offer management exist but rely on backend features that are still in-progress.
  - Scheduler jobs run every 30–60 minutes to send CAF/interview reminders, sprint updates, offer followups, and stale stage events.

- **SL_IT**:
  - Backend ticketing (create/list/detail/update/assign/transition), asset/license management, routing, SLA enforcement, Gmail notification, and audit logging are all implemented.
  - Admin features allow category/license import, vendor/asset creation, and platform user CRUD via `sl_platform`.
  - Frontend portal contains login, IT workspace (tickets, admin grids), and admin management pages; UI components support authentication, RBAC filtering (via `role-guard`), logging, and quick stats.

- **SL_Workbook**:
  - Only a static Next.js shell exists. No backend/services yet.

---

## Not described line-by-line (sensitive or binary)

- `tools/caddy.exe`, `tools/caddy_*.zip`: Pre-built binaries (do not edit manually).
- PNG assets under `frontend/public/` are graphics (logo, icons) and need no code commentary.
- `SL_Recruitment/local_uploads/*`: Candidate data (CVs/meta). Avoid verbatim descriptions; treat as sample data.
- `Template-  Letter of Intent.docx`: Word doc; not part of runtime logic.

If you need a more granular, function-by-function breakdown for any backend router, frontend route, or configuration file, let me know which folder/file to expand next.
