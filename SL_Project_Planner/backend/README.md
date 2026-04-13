# SL Project Planner Backend

This backend is isolated from `SL_Recruitment`.

It uses:

- `sl_project_planner` as the planner database
- `sl_platform` as the shared identity source
- Google auth for active Studio Lotus employees

## Run

1. Copy `.env.example` to `.env.local`
2. Set `SPP_DATABASE_URL` to the planner schema
3. Set `SPP_PLATFORM_DATABASE_URL` to the platform schema
4. Install dependencies from `requirements.txt`
5. Start the API:

```bash
uvicorn app.main:app --reload
```

## Current scope

The backend currently provides:

- employee authentication
- planner role resolution
- scoped planner visibility
- row CRUD
- approval and rejection workflow
- soft delete for Group Leaders
- hard delete for Super Admin

Default local launcher port:

- `8003`
