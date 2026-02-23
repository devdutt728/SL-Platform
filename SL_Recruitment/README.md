# Studio Lotus Recruitment OS

Full-stack recruitment workflow for Studio Lotus, with a FastAPI backend and a Next.js (App Router) frontend.

## Current status
- Backend is live for openings, candidates, CAF screening, public apply, dashboard metrics, event logging, interviews, sprints, offers, joining docs, and reports.
- Google auth and platform user lookup are wired (dev headers also supported), including superadmin role management.
- Drive integration creates candidate folders and uploads application documents, sprint assets, offer PDFs, and joining docs.
- Gmail and Calendar integrations are available (service account + delegation) with a scheduler for reminders and follow-ups.
- Frontend has a working recruitment workspace plus public apply, CAF, sprint, offer, and joining flows.

## Backend (FastAPI)
- Entry: `backend/app/main.py`
- Auth + roles: `backend/app/core/auth.py`, `backend/app/core/roles.py`
- API routes:
  - Auth context: `backend/app/api/routes/auth.py`
  - Openings CRUD + opening request flow: `backend/app/api/routes/openings.py` (creation/editing is superadmin-only; HR can activate/deactivate)
  - Candidate CRUD, stages, events, screening, drive cleanup, Google Sheet ingest: `backend/app/api/routes/candidates.py`
  - CAF prefill + submission: `backend/app/api/routes/caf.py`
  - Public apply with idempotency + rate limiting: `backend/app/api/routes/public_apply.py`
  - Dashboard metrics + recent events + stream: `backend/app/api/routes/dashboard.py`
  - Interviews + slots + public slot selection: `backend/app/api/routes/interviews.py`
  - Interview assessments (L1/L2 + PDF export): `backend/app/api/routes/interview_assessments.py`
  - Sprint templates + candidate sprints + public sprint submission: `backend/app/api/routes/sprints.py`
  - Offers + approvals + public offer response: `backend/app/api/routes/offers.py`
  - Joining docs (internal upload + public upload): `backend/app/api/routes/joining_docs.py`
  - Reports (preview + download): `backend/app/api/routes/reports.py`
  - Platform people search + CRUD: `backend/app/api/routes/platform_people.py`
  - Platform roles + assignment: `backend/app/api/routes/platform_roles.py`

Run (after installing deps):
```bash
cd backend
uvicorn app.main:app --reload
```

### Backend config
See `backend/.env.example`. Required highlights:
- `SL_DATABASE_URL` (MySQL)
- `SL_PLATFORM_DATABASE_URL` (sl_platform for role/person lookup)
- `SL_AUTH_MODE=dev|google`
- Drive config and service account (see below)
- Gmail/Calendar toggles: `SL_ENABLE_GMAIL`, `SL_ENABLE_CALENDAR`
- Public links: `SL_PUBLIC_APP_ORIGIN`, `SL_PUBLIC_APP_BASE_PATH`, `SL_PUBLIC_LINK_TTL_HOURS`, `SL_PUBLIC_LINK_SIGNING_KEY`
- Google Sheet ingest: `SL_SHEET_INGEST_TOKEN`, `SL_SHEET_INGEST_MAX_ROWS` (`0` or negative = unlimited)

### Offer PDF generation
Offer PDFs are generated with WeasyPrint and require system libraries.
- Windows: install GTK3 runtime (GTK3-Runtime Win64) and add `C:\Program Files\GTK3-Runtime Win64\bin` to `PATH`.
- Linux (Debian/Ubuntu): `apt-get install -y libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 libffi-dev`

### Migrations
Apply in order to `sl_recruitment`:
- `backend/migrations/0002_caf_screening.sql`
- `backend/migrations/0003_opening_requested_by_string.sql`
- `backend/migrations/0004_screening_add_ctc_columns.sql`
- `backend/migrations/0005_screening_add_profile_fields.sql`
- `backend/migrations/0006_candidate_portfolio_reason.sql`
- `backend/migrations/0007_candidate_email_normalized_unique.sql`
- `backend/migrations/0008_apply_idempotency.sql`
- `backend/migrations/0009_candidate_interviews.sql`
- `backend/migrations/0010_sprint_templates_and_candidate_sprints.sql`
- `backend/migrations/0011_candidate_offers.sql`
- `backend/migrations/0012_sprint_attachments.sql`
- `backend/migrations/0013_sprint_template_code.sql`
- `backend/migrations/0014_interview_slots.sql`
- `backend/migrations/0014_offer_letter_overrides.sql`
- `backend/migrations/0015_interview_slot_person_id_string.sql`
- `backend/migrations/0016_joining_docs.sql`
- `backend/migrations/0017_screening_add_two_year_commitment.sql`
- `backend/migrations/0018_l2_assessment.sql`
- `backend/migrations/0019_candidate_assessment_form.sql`
- `backend/migrations/0020_candidate_l2_owner.sql`
- `backend/migrations/0021_interview_created_by_platform_id_varchar.sql`
- `backend/migrations/0022_candidate_sprint_platform_id_varchar.sql`
- `backend/migrations/0023_candidate_sprint_deleted_at.sql`
- `backend/migrations/0024_remove_application_fields.sql`
- `backend/migrations/0025_move_screening_fields_to_assessment.sql`
- `backend/migrations/0026_remove_screening_two_year_commitment.sql`
- `backend/migrations/0027_remove_screening_expected_joining_date.sql`
- `backend/migrations/0028_move_questions_to_candidate.sql`
- `backend/migrations/0029_operation_retry_queue.sql`
- `backend/migrations/0030_candidate_source_bifurcation.sql`
- `backend/migrations/0031_candidate_intake_fields.sql`
- `backend/migrations/0032_seed_designation_openings_devdutt.sql`

### Drive setup
Required for candidate creation and public apply uploads:
- Set `SL_DRIVE_ROOT_FOLDER_ID` (or `ROOT_FOLDER_ID`).
- Provide a Google service account JSON:
  - `SL_GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json` (recommended), or
  - `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`.
- Share the Drive root folder with the service account email (Editor).
- Optional for sprint template assets: set `SL_DRIVE_SPRINT_ASSETS_FOLDER_ID` to an existing folder.

### Auth setup
Google auth (recommended for production):
- Set `SL_AUTH_MODE=google`.
- Provide OAuth secrets at `SL_GOOGLE_OAUTH_SECRETS_PATH` (defaults to `secrets/Oauth SL_Platform.json`).
- Backend validates Google ID tokens and checks `sl_platform.dim_person`.

Dev auth (local testing):
- Keep `SL_AUTH_MODE=dev` and send headers:
  - `X-User-Email: user@company.com`
  - `X-User-Roles: hr_admin,interviewer`

## Frontend (Next.js App Router + Tailwind)
- Workspace pages: dashboard, openings, candidates list/360, sprint templates, interviewer portal, GL portal (assessments), offers, reports, superadmin roles/people.
- Public pages: apply, CAF, sprint submission, offer response, joining docs upload.
- API routes proxy to the backend (`frontend/app/api/**`) and manage auth cookies.

Run (after installing deps):
```bash
cd frontend
npm install
npm run dev
```

Frontend env:
- Copy `frontend/.env.local.example` to `frontend/.env.local`
- Set `BACKEND_URL=http://localhost:8002` (or your backend port)
- Set `NEXT_PUBLIC_AUTH_MODE=google` when backend uses Google auth
- Set `NEXT_PUBLIC_BASE_PATH=/recruitment` to match `next.config.mjs`

### Google login (local + production)
- Local dev: keep `PUBLIC_APP_ORIGIN=http://localhost:3000`.
- Production: set `PUBLIC_APP_ORIGIN=https://studiolotushub.in`.
- Add both redirect URIs to your Google OAuth client:
  - `http://localhost:3000/recruitment/api/auth/callback/google`
  - `https://studiolotushub.in/recruitment/api/auth/callback/google`

## Known gaps (not yet built)
- The `/schedule/[token]` page is a placeholder; candidate slot selection currently uses the public `/interview/slots/{token}` flow.

## Google Sheet candidate automation
- Endpoint: `POST /recruitment/api/rec/candidates/import/google-sheet`
- Header: `x-sheet-ingest-token: <SL_SHEET_INGEST_TOKEN>`
- Row validation (required): `job_id/opening_code`, `first_name`, `last_name`, `email`, `portfolio`, `terms=true`
- Optional columns: `date`, `applying_for`, `contact_number`, `educational_qualification`, `years_of_experience`, `city`, `willing_to_relocate`, `cv`, `resume`, `source_channel`, `external_source_ref`
- Behavior:
  - Opening code must exist and be active.
  - If `applying_for` is sent along with `job_id`, title mismatch is rejected.
  - Duplicate check uses `opening + email` and returns `status=duplicate` without creating a new candidate.
  - External document links (portfolio/cv/resume) are downloaded and uploaded into candidate Drive folder.
  - Created candidates follow the same backend automation path: `SLR-####` code generation, CAF + assessment link generation, drive folder creation, stage initialization.
  - Source bifurcation is stored in candidate row (`source_origin`: `ui` / `public_apply` / `google_sheet`).

Example payload:
```json
{
  "batch_id": "2026-02-10-09:30",
  "sheet_id": "1abc...",
  "sheet_name": "Portal Intake",
  "rows": [
    {
      "row_key": "42",
      "job_id": "ARCH-A12F",
      "applying_for": "Sr. Architect",
      "first_name": "Jane",
      "last_name": "Doe",
      "email": "jane@example.com",
      "contact_number": "+91-9999999999",
      "educational_qualification": "B.Arch",
      "years_of_experience": 5,
      "city": "Delhi",
      "willing_to_relocate": "Yes",
      "terms": "Yes",
      "portfolio": "https://files.example.com/jane-portfolio.pdf",
      "cv": "https://files.example.com/jane-cv.pdf",
      "resume": "https://files.example.com/jane-resume.pdf"
    }
  ]
}
```

Detailed runbook + Apps Script sample: `GOOGLE_SHEET_AUTOMATION.md`.
