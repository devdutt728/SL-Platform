# Studio Lotus Recruitment OS

Full-stack recruitment workflow for Studio Lotus, with a FastAPI backend and a Next.js (App Router) frontend.

## Current status
- Backend is live for openings, candidates, CAF screening, public apply, dashboard metrics, and event logging.
- Google auth and platform user lookup are wired (dev headers also supported).
- Drive integration creates candidate folders and uploads application documents.
- Frontend has a working recruitment workspace plus public apply and CAF flows.
- Schedule, sprint, and offer pages exist as UI shells; backend APIs are not implemented yet.

## Backend (FastAPI)
- Entry: `backend/app/main.py`
- Auth + roles: `backend/app/core/auth.py`, `backend/app/core/roles.py`
- API routes:
  - Openings CRUD + opening request flow: `backend/app/api/routes/openings.py`
  - Candidate CRUD, stages, events, screening, drive cleanup: `backend/app/api/routes/candidates.py`
  - CAF prefill + submission: `backend/app/api/routes/caf.py`
  - Public apply with idempotency + rate limiting: `backend/app/api/routes/public_apply.py`
  - Dashboard metrics + recent events: `backend/app/api/routes/dashboard.py`
  - Platform people search: `backend/app/api/routes/platform_people.py`

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

### Drive setup
Required for candidate creation and public apply uploads:
- Set `SL_DRIVE_ROOT_FOLDER_ID` (or `ROOT_FOLDER_ID`).
- Provide a Google service account JSON:
  - `SL_GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json` (recommended), or
  - `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`.
- Share the Drive root folder with the service account email (Editor).

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
- Workspace pages: dashboard, openings, candidates list/360, interviewer, offers.
- Public pages: apply, CAF, schedule, sprint, offer.
- API routes proxy to the backend (`frontend/app/api/**`) and manage auth cookies.

Run (after installing deps):
```bash
cd frontend
npm install
npm run dev
```

Frontend env:
- Copy `frontend/.env.local.example` to `frontend/.env.local`
- Set `BACKEND_URL=http://localhost:8000`
- Set `NEXT_PUBLIC_AUTH_MODE=google` when backend uses Google auth

### Google login with tunnels
- Set `PUBLIC_APP_ORIGIN` to the external origin (e.g. `https://xxxx-3000.inc1.devtunnels.ms`).
- Add both redirect URIs to your Google OAuth client:
  - `http://localhost:3000/api/auth/callback/google`
  - `${PUBLIC_APP_ORIGIN}/api/auth/callback/google`

## Known gaps (not yet built)
- Backend APIs for interviews, sprints, and offers.
- Calendar/Gmail integrations and job runner services.
