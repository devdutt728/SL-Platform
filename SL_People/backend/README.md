# SL_People backend (Operating Console)

FastAPI service for the People / Org / Licenses / Systems / Peripherals / Groups
console. Runs on **port 8004**. Owns its own MySQL database **`sl_people`** and
uses the shared **`sl_platform`** database for identity (`dim_person`).

This is **Phase 0 (infrastructure)**. Only `/health` and `/ppl/auth/me` are live;
feature routers land in later phases. See `../../SL_PEOPLE_PLAN.md`.

## Layout

```
app/
  main.py                  FastAPI app (module gate + /health)
  core/        config.py · auth.py · paths.py
  db/          base.py · session.py (sl_people) · platform_session.py (sl_platform)
  models/      people.py (19 tables) · platform_person.py (dim_person)
  services/    console_logic.py (Code.gs port) · encryption.py (Fernet)
               people_access.py · platform_identity.py
  api/         router.py · deps.py · routes/auth.py
migrations/    0001-0021 *.sql (MySQL DDL) · 0022/0023 *.py seeds · run_migrations.py
```

## Setup

```bash
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements.txt
copy .env.example .env.local                         # then fill DB URLs + key
```

`SPL_ENCRYPTION_KEY` (Fernet) is required before any PAN/Aadhaar data is written.
Generate one with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Migrate

```bash
python -m migrations.run_migrations        # creates sl_people + all 19 tables (idempotent)
python -m migrations.0023_seed_org_data    # seeds the 4 fixed principals
```

The Emp Master / Org Data spreadsheet ingestion (0022 / rest of 0023) is built in
the Import / Org phases.

## Run

```bash
python -m uvicorn app.main:app --reload --port 8004
# health: GET http://127.0.0.1:8004/health
# auth:   GET http://127.0.0.1:8004/ppl/auth/me   (dev mode trusts x-user-* headers)
```

Behind Caddy, the workbook proxies `/api/ppl/*` → `/ppl/*` on 8004. The module is
gated on `ENABLE_PEOPLE_MODULE=1` in `start-all.cmd` / `start-prod.cmd`.

## Access model

Default People access is derived from the platform role
(`superadmin`/`hr_admin`/`it_lead` → admin; `hr_exec`/`it_agent`/`hiring_manager`
→ edit; everyone else → view) and can be overridden per person via the
`people_access_grant` table.
