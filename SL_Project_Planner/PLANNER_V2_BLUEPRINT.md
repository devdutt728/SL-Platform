# Studio Lotus Planner V2 Blueprint

## Goal

Turn the current browser-only tracker in [projecttracker_v3.html](</d:/SL Platform/SL_Project_Planner/projecttracker_v3.html:1>) into a proper MySQL-backed, MNC-style planning system for Studio Lotus.

The implementation now lives inside this planner project itself:

- [backend/README.md](</d:/SL Platform/SL_Project_Planner/backend/README.md:1>)
- [backend/app/api/routes/planner.py](</d:/SL Platform/SL_Project_Planner/backend/app/api/routes/planner.py:1>)
- [backend/app/services/planner_policy.py](</d:/SL Platform/SL_Project_Planner/backend/app/services/planner_policy.py:1>)

## Current database step

For the first executable database step, the implementation has been intentionally reduced to one MVP table:

- `sl_project_planner.sl_project_planner`

The exact column-by-column reason for that table is documented in:

- [PLANNER_TABLE_DICTIONARY.md](</d:/SL Platform/SL_Project_Planner/PLANNER_TABLE_DICTIONARY.md:1>)

This keeps the live database change simple while preserving the larger normalized direction described in this blueprint.

The target system should support:

- `Super Admin` platform control and full write/delete authority
- `Principal` portfolio-level read visibility
- `Group Leader` scoped project/team control
- `Project Anchor` scoped project control with Group Leader-equivalent authority
- `Senior Architect` package-level coordination and Architect approvals
- `Architect` assigned-work execution
- future roles such as Interior Design team roles without schema rewrites

## Reuse From Existing Platform Tables

Do not create a separate planner user table.

The planner should authenticate and resolve people from the shared `sl_platform` identity layer, but the planner implementation should stay inside this project:

- [backend/app/models/platform_person.py](</d:/SL Platform/SL_Project_Planner/backend/app/models/platform_person.py:1>)
- [backend/app/models/platform_role.py](</d:/SL Platform/SL_Project_Planner/backend/app/models/platform_role.py:1>)
- [backend/app/services/platform_identity.py](</d:/SL Platform/SL_Project_Planner/backend/app/services/platform_identity.py:1>)
- [backend/app/core/auth.py](</d:/SL Platform/SL_Project_Planner/backend/app/core/auth.py:1>)
- [SL_IT/backend/migrations/0002_platform_roles_seed.sql](</d:/SL Platform/SL_IT/backend/migrations/0002_platform_roles_seed.sql:1>)

### Fields worth reusing from `sl_platform.dim_person`

- `person_id`
- `person_code`
- `email`
- `full_name`
- `display_name`
- `department`
- `sub_department`
- `job_title`
- `manager_id`
- `employment_type`
- `status`
- `is_deleted`
- `location`
- `cost_center`

### Existing platform structures to reuse

- `sl_platform.dim_person` for employee identity
- `sl_platform.dim_person_role` for platform/global role membership
- `sl_platform.dim_role` for shared auth role metadata
- `sl_platform.dim_person_feature_access` for future planner feature flags

## Access Model

Use two layers of access:

1. `Platform access`
   - handled by existing Google auth + `sl_platform` tables
   - `Super Admin` should continue to come from platform role `s_admin`

2. `Planner access`
   - handled inside planner tables
   - project/team/package scoped memberships
   - capability-driven, not hardcoded UI branching

This allows future roles such as `Interior Design Lead`, `Senior Interior Designer`, `Interior Designer`, `Project Coordinator`, or `Consultant Coordinator` without changing the database design.

### Important control split

The clean implementation is:

- `Super Admin`
  - global setup changes
  - role and membership administration
  - hard delete
  - baseline publish override
  - cross-project corrections

- scoped roles
  - operational edits only inside allowed scope
  - no global admin changes
  - no hard delete
  - no unrestricted cross-project visibility

## Studio Lotus Role Rules

### Global roles

- `super_admin`
  - full visibility across all projects
  - can create/edit/archive/delete anything
  - can override approvals
  - only role allowed to hard-delete records

- `principal`
  - full visibility across all projects and reports
  - read-only by default
  - not active for phase 1 usage, but the model should support it

### Scoped project roles

- `group_leader`
  - visibility for managed projects/teams
  - can approve requests raised by `senior_architect` and `architect`
  - can edit scoped project plans
  - can soft-delete scoped records only

- `project_anchor`
  - same planner authority as `group_leader`
  - visibility for anchored projects
  - can approve requests raised by `senior_architect` and `architect`
  - can edit scoped project plans
  - can soft-delete scoped records only

- `senior_architect`
  - visibility for assigned projects/packages
  - can approve requests raised by `architect`
  - can edit scoped package plans
  - cannot delete records

- `architect`
  - visibility only for assigned projects/tasks/documents
  - can update own tasks, upload files, raise requests, comment
  - cannot approve peer or senior requests
  - cannot delete records

## Visibility Rules

- `Super Admin`: all projects, all teams, all records
- `Principal`: all projects, read-only
- `Group Leader`: only projects/teams they manage
- `Senior Architect`: only projects/packages they are assigned to
- `Architect`: only projects/tasks/documents they are assigned to

Important:

- a user must never see unrelated team projects just because they are active in the system
- project visibility must come from planner membership, not from generic login alone
- dashboard queries, documents, tasks, requests, and reports must all use the same visibility filter

## Approval Rules

Approval should be request-based, not direct-edit based, for structural changes.

### Current approval policy

- Request raised by `Architect`
  - approvable by `Senior Architect`, `Group Leader`, or `Super Admin`
  - preferred route: `Senior Architect` first, `Group Leader` escalation allowed

- Request raised by `Senior Architect`
  - approvable by `Group Leader` or `Super Admin`

- Request raised by `Group Leader`
  - approvable by `Super Admin` when the change affects baseline, scope, or portfolio controls

### Requests that must go through approval

- add/remove activity
- change baseline dates
- change contract deliverables
- change package ownership
- reassign across teams
- milestone shift
- dependency override
- document revision marked as superseding approved issue
- delete/archive requests outside normal working updates

### Direct edits allowed without approval

- Architect updating progress on assigned task
- Architect uploading work evidence
- Senior Architect updating package notes/check comments
- Group Leader updating operational planning inside live plan when baseline is unchanged

### Changes that should remain Super Admin controlled

- planner role catalog changes
- permission bundle changes
- cross-project membership corrections
- hard deletion
- platform-level overrides
- force-closing approval chains
- baseline publish override outside normal routing

## Delete Policy

To reconcile the current business rule conflict, implement deletion as two levels:

- `soft delete / archive / void`
  - allowed for `Group Leader` inside managed scope
  - not allowed for `Senior Architect` or `Architect`

- `hard delete`
  - `Super Admin` only

This keeps auditability intact while still allowing GLs to clean up their own scoped project records.

## Planning Model

The planner should be version-based, not overwrite-based.

### Plan versions

- `contract_baseline`
- `live_plan`
- `scenario`
- `approved_change_baseline`

### Why

This is the only reliable way to answer:

- what did the contract promise
- what is the team doing now
- what changed
- who changed it
- what did that do to milestones, workload, and deliverables

### Activity model requirements

Every activity should support:

- stable activity identity across versions
- WBS/stage/package hierarchy
- baseline dates and durations
- live planned dates and durations
- actual dates and percent complete
- dependencies
- assignees
- reviewer/approver
- source classification:
  - `contract`
  - `approved_change`
  - `internal`

## Recommended Modules

### Phase 1

- auth integration with platform identity
- planner role catalog and scoped membership
- project register
- team register
- plan versions
- activities and dependencies
- requests and approvals
- audit log
- document register with file versions

Current implementation now includes the practical foundation of these pieces:

- row CRUD with approvals
- Project Anchor support
- dependency table and schedule recalculation
- formal change request table
- audit log table
- document register and version storage
- baseline snapshot table

### Phase 2

- dependency-aware Gantt and recalculation engine
- baseline vs live variance dashboards
- resource capacity and allocation
- notifications and mentions
- comments and issue logs

### Phase 3

- portfolio dashboard for Principals
- consultant and client restricted views
- risk forecasting
- workload heatmaps
- earned variance reporting

## UI Direction

The current single-screen tracker should become role-based workspaces:

- `My Work`
- `Project Control`
- `Timeline`
- `Documents`
- `Requests & Approvals`
- `Resources`
- `Audit Trail`
- `Portfolio`

The interface should feel corporate and disciplined:

- dense but readable tables
- clear status and variance indicators
- approval inboxes
- file revision traceability
- baseline/live toggle on every schedule visual

## Build Recommendation

Use the existing platform identity stack for login and user resolution, but keep planner authorization in planner tables.

That gives the best long-term result:

- one company identity source
- one superadmin model
- planner-specific memberships and permissions
- future roles added by data, not by code rewrites

## Immediate Next Build Order

1. build planner backend and MySQL schema
2. connect auth to `sl_platform.dim_person`
3. implement role + membership checks
4. replace browser `localStorage` with API persistence
5. build request/approval workflow
6. build versioned activity model
7. build baseline/live/variance dashboards
