# SL IMS — IT Inventory Management System

Studio Lotus IT Inventory Management System (Next.js + FastAPI + MySQL).
Shares platform SSO (Google Workspace) and identity/roles from `sl_platform`
(`dim_person` / `dim_role`); IMS data lives in its own `sl_ims` schema.

- Backend: FastAPI on port `8001` (`app.main:app`), schema `sl_ims`.
- Frontend: Next.js on port `3001`, served under base path `/it`.
- Roles: `ims_admin`, `ims_manager`, `ims_operator`, `ims_viewer` (+ platform
  `superadmin`/`admin` and employee self-service).

See `../SL_IMS_PLAN.md` for the full build plan and phase breakdown.
