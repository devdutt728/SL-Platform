# SL Project Planner

This folder is the dedicated home for the Studio Lotus planner.

## Structure

- `backend/`: isolated FastAPI backend for planner auth, RBAC, approvals, and CRUD
- `frontend/`: dedicated planner UI with project filtering, approval actions, scoped control board, and sidecar audit/document visibility
- `db/`: MySQL DDL and follow-up migration scripts
- `projecttracker_v3.html`: legacy single-file prototype kept as a reference while the new app replaces it
- `PLANNER_V2_BLUEPRINT.md`: product and architecture blueprint
- `PLANNER_TABLE_DICTIONARY.md`: column-level explanation for the MVP table

## Separation rule

Planner code lives here.

`SL_Recruitment` can still remain a reference for shared company patterns, but planner-specific API, models, schemas, and services should not be implemented there.

## Startup

The root launchers now support the planner without affecting the existing apps unless explicitly enabled.

- `start-all.cmd`
- `start-prod.cmd`

Use:

```cmd
set ENABLE_PROJECT_PLANNER=1
start-all.cmd
```

Planner ports:

- frontend: `3004`
- backend: `8003`

With Caddy running, the planner frontend is available at `/planner`.

## Implemented long-range foundations

- Group Leader and Project Anchor parity
- dependency-driven schedule recalculation
- change request inbox
- immutable audit trail
- document register with stored file versions
- project baseline snapshots
