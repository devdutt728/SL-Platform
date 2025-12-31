# Studio Lotus Platform (SLP) Setup

## Local run (no Docker)
1) Create the MySQL schemas:
   - `sl_it` for the IT module tables.
   - `sl_platform` already exists and stores users/roles.
2) Backend setup:
   ```bash
   cd backend
   python -m venv .venv
   .\.venv\Scripts\activate
   pip install -r requirements.txt
   copy .env.example .env
   ```
3) Run SQL bootstrap (MySQL):
   ```bash
   mysql -u root -p < db/0000_create_schema.sql
   mysql -u root -p sl_it < db/0001_sl_it_tables.sql
   ```
4) Start the API:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
5) Frontend setup:
   ```bash
   cd ..\frontend
   npm install
   copy .env.local.example .env.local
   npm run dev
   ```
6) Open:
   - API: http://localhost:8000
   - Web: http://localhost:3000

## Google OAuth (OIDC) setup
1) Create a Google OAuth client (Web) in Google Cloud Console.
2) Add the authorized redirect URI:
   - `http://localhost:3000/api/auth/callback/google`
3) Place the OAuth secrets JSON at `secrets/Oauth SL_Platform.json` (repo root) or set:
   - `SL_GOOGLE_OAUTH_SECRETS_PATH` (backend)
   - `GOOGLE_OAUTH_SECRETS_PATH` (frontend)
4) Restrict sign-in to Workspace domain:
   - `SL_GOOGLE_WORKSPACE_DOMAIN=studiolotus.in`

## Domain-Wide Delegation (DWD)
- Service account JSON file path: `SL_GOOGLE_APPLICATION_CREDENTIALS`
- Aliases accepted: `GOOGLE_SERVICE_ACCOUNT_JSON_PATH`, `GOOGLE_APPLICATION_CREDENTIALS`
- Delegated scopes required:
  - `https://www.googleapis.com/auth/gmail.send`
  - `https://www.googleapis.com/auth/calendar.events`
- Sender/impersonation user: `SL_GMAIL_SENDER_EMAIL` (default `helpdesk@studiolotus.in`)

## Role mapping (sl_platform -> SLP)
- Provide the role mapping JSON:
  - `SL_ROLE_MAP_JSON={"2":["superadmin"],"3":["admin"],"4":["it_lead"],"5":["it_agent"],"6":["employee"]}`
- `role_id` values come from `sl_platform.dim_role`.
- Users are read from `sl_platform.dim_person` (email as key).

## Bootstrap superadmin
- Set `SL_SUPERADMIN_EMAIL` (or `SUPERADMIN_EMAIL`).
- Ensure the email exists in `sl_platform.dim_person`.
- CLI seed script:
  ```bash
  python -m app.scripts.seed_superadmin --email someone@studiolotus.in
  ```
  Optional:
  ```bash
  python -m app.scripts.seed_superadmin --email someone@studiolotus.in --role-id 2
  ```

## DB Scripts
- SQL bootstrap files live in `db/`.
- Run them in order for new environments.

## Production deploy notes
- Use a managed MySQL 8 instance and set `SL_DATABASE_URL`/`SL_PLATFORM_DATABASE_URL`.
- Configure HTTPS and set `SL_ENVIRONMENT=production`.
- Store the service account JSON in a secure secrets manager.
- Ensure the OAuth redirect URI points to your production domain.
