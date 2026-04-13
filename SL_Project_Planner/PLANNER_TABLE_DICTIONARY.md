# SL Project Planner Table Dictionary

## Current Database Shape

The planner is no longer only a single-table MVP.

It now has:

- one main activity table
- one dependency table
- one formal change-request table
- one immutable audit-log table
- one document register table
- one document-version table
- one baseline snapshot table

The backend that reads and writes these tables now lives inside:

- [backend/app/models/planner.py](</d:/SL Platform/SL_Project_Planner/backend/app/models/planner.py:1>)
- [backend/app/api/routes/planner.py](</d:/SL Platform/SL_Project_Planner/backend/app/api/routes/planner.py:1>)
- [backend/app/api/routes/planner_ops.py](</d:/SL Platform/SL_Project_Planner/backend/app/api/routes/planner_ops.py:1>)

This is the right short-term choice because:

- it is faster to launch than a fully normalized planner schema
- it still captures contract vs live planning
- it supports Group Leader, Senior Architect, and Architect ownership
- it is ready for approvals and audit-friendly soft deletion
- it keeps future normalization open once the planner workflow settles

## Table

### `sl_project_planner`

One row represents one project activity, deliverable, package item, or scope line.

| Column | Type | Why it exists |
| --- | --- | --- |
| `planner_row_id` | `BIGINT` | Surrogate primary key so every row can be updated safely even if project or activity codes change later. |
| `project_code` | `VARCHAR(64)` | Stable short identifier used in filters, imports, joins, and reporting. This is better for operations than relying only on names. |
| `project_name` | `VARCHAR(255)` | Human-readable project label for screens, exports, and quick review. |
| `contract_reference` | `VARCHAR(128)` | Keeps the row connected to the contract/work-order context, which is necessary for baseline vs live visibility. |
| `discipline_code` | `VARCHAR(64)` | Allows the table to work for Architecture, Interior Design, and future disciplines without adding new tables. |
| `stage_code` | `VARCHAR(64)` | Lets the system group rows into project stages such as concept, schematic, DD, tender, or GFC. |
| `package_code` | `VARCHAR(128)` | Supports package-level planning inside a project, for example facade package, interiors package, or sanction package. |
| `activity_code` | `VARCHAR(64)` | Stable activity identifier inside a project, useful for dependencies and change tracking. |
| `activity_title` | `VARCHAR(255)` | Short task/deliverable text that users see first in the planner UI. |
| `activity_description` | `TEXT` | Longer operational context so a task is understandable without needing external notes. |
| `plan_layer` | `ENUM` | Separates `contract_baseline`, `live_plan`, and `approved_change`, which is the core requirement for visibility. |
| `source_type` | `ENUM` | Explains where the row came from: original contract scope, approved change, or internal delivery work. |
| `change_type` | `ENUM` | Shows whether a row was added, modified, removed, or untouched compared to the original scope. This helps explain why charts move. |
| `change_reason` | `TEXT` | Stores the reason behind the change so the row does not become an unexplained edit. |
| `activity_status` | `ENUM` | Core execution status for day-to-day delivery management. |
| `approval_status` | `ENUM` | Needed because some changes should not become effective until they are approved by the correct role. |
| `approval_note` | `TEXT` | Captures approval or rejection comments from the reviewer. |
| `approval_requested_at` | `DATETIME` | Marks when the row entered approval flow so pending items can be tracked. |
| `approval_action_at` | `DATETIME` | Marks when the row was approved or rejected. |
| `priority` | `ENUM` | Gives an immediate urgency signal for teams without overcomplicating the MVP. |
| `baseline_start_date` | `DATE` | Stores the promised or approved start date, needed for baseline comparison. |
| `baseline_end_date` | `DATE` | Stores the promised or approved finish date, needed for slippage reporting. |
| `live_start_date` | `DATE` | Stores the current execution start date after manager or team adjustments. |
| `live_end_date` | `DATE` | Stores the current execution finish date after manager or team adjustments. |
| `actual_start_date` | `DATE` | Captures when work truly started so reports are not based only on plans. |
| `actual_end_date` | `DATE` | Captures when work truly finished for delay and closure reporting. |
| `duration_days` | `DECIMAL(8,2)` | Keeps duration available for timelines, basic Gantt views, and effort review. Decimal allows half-day or partial-day planning if needed later. |
| `percent_complete` | `DECIMAL(5,2)` | Drives dashboards and gives a smoother progress measure than only status values. |
| `dependency_codes` | `VARCHAR(255)` | MVP dependency field using activity codes. This is simpler than a dependency table for the first step while still allowing schedule logic later. |
| `schedule_mode` | `ENUM` | Controls whether the row should keep manually entered live dates or let the schedule engine drive them automatically. |
| `scheduled_start_date` | `DATE` | Stores the engine-calculated start date after evaluating dependencies and lag. |
| `scheduled_end_date` | `DATE` | Stores the engine-calculated finish date after evaluating dependencies and lag. |
| `float_days` | `DECIMAL(8,2)` | Stores computed slack so critical and near-critical work can be surfaced in the UI. |
| `is_critical` | `TINYINT(1)` | Marks whether the row currently sits on the critical path of the dependency graph. |
| `last_schedule_run_at` | `DATETIME` | Indicates when the schedule engine last recalculated this row. |
| `group_leader_person_id` | `VARCHAR(64)` | Identifies the Group Leader who owns that scope line, which supports approval routing and scoped visibility. |
| `project_anchor_person_id` | `VARCHAR(64)` | Identifies the Project Anchor, who now carries Group Leader-equivalent planner permissions for that project. |
| `senior_architect_person_id` | `VARCHAR(64)` | Identifies the Senior Architect who leads coordination or approval at package level. |
| `assigned_to_person_id` | `VARCHAR(64)` | Identifies the actual working owner, usually Architect or another assigned member. |
| `requested_by_person_id` | `VARCHAR(64)` | Needed when a row or change is raised as a request and later needs tracking or approval. |
| `approved_by_person_id` | `VARCHAR(64)` | Stores who approved the row or change so the planner can show governance and accountability. |
| `is_deleted` | `TINYINT(1)` | Soft-delete flag preserves history and supports the rule that lower roles should not permanently erase data. |
| `deleted_at` | `DATETIME` | Timestamp for archive/delete actions so the team can track when a row was hidden. |
| `created_by_person_id` | `VARCHAR(64)` | Gives accountability for who first added the row. |
| `updated_by_person_id` | `VARCHAR(64)` | Gives accountability for the last edit. |
| `created_at` | `DATETIME` | Required for auditing, sorting, and record lifecycle tracking. |
| `updated_at` | `DATETIME` | Required for freshness, recent-change views, and synchronization logic. |

## Supporting Tables

### `planner_activity_dependency`

One row represents one dependency edge between two planner rows inside the same project.

| Column | Type | Why it exists |
| --- | --- | --- |
| `dependency_id` | `BIGINT` | Stable key for editing or deleting a dependency edge safely. |
| `project_code` | `VARCHAR(64)` | Keeps dependency queries scoped to one project and makes recalculation faster. |
| `planner_row_id` | `BIGINT` | The successor row that depends on another row. |
| `predecessor_row_id` | `BIGINT` | The predecessor row that drives the successor. |
| `dependency_type` | `ENUM` | Supports finish-to-start and other planning relationships instead of only a simple predecessor list. |
| `lag_days` | `DECIMAL(8,2)` | Stores delay or lead between predecessor and successor. |
| `created_by_person_id` | `VARCHAR(64)` | Tracks who created the relationship. |
| `updated_by_person_id` | `VARCHAR(64)` | Tracks who last edited the relationship. |
| `created_at` | `DATETIME` | Records when the dependency was added. |
| `updated_at` | `DATETIME` | Records when the dependency was last changed. |

### `planner_change_request`

One row represents one formal approval-routed request.

| Column | Type | Why it exists |
| --- | --- | --- |
| `request_id` | `BIGINT` | Stable primary key for one request lifecycle. |
| `planner_row_id` | `BIGINT` | Connects the request to the affected activity where applicable. |
| `project_code` | `VARCHAR(64)` | Keeps the request visible in project-level inboxes and reports. |
| `request_type` | `ENUM` | Separates scope, schedule, assignment, document, and delete-style requests. |
| `request_status` | `ENUM` | Tracks whether the request is pending, approved, rejected, or cancelled. |
| `requested_by_person_id` | `VARCHAR(64)` | Stores who raised the request. |
| `requester_role` | `VARCHAR(64)` | Stores the requester role at the moment the request was raised. |
| `approver_person_id` | `VARCHAR(64)` | Stores who took the final decision. |
| `approver_role` | `VARCHAR(64)` | Stores the approver role for governance clarity. |
| `request_reason` | `TEXT` | Captures the business reason behind the request. |
| `approval_note` | `TEXT` | Captures the reviewer note or rejection note. |
| `before_json` | `LONGTEXT` | Stores the row state before the request so approval impact stays auditable. |
| `proposed_json` | `LONGTEXT` | Stores the proposed update payload that may later be applied. |
| `decided_at` | `DATETIME` | Records when the final approval decision happened. |
| `created_at` | `DATETIME` | Records when the request entered the system. |
| `updated_at` | `DATETIME` | Records the last status change on the request. |

### `planner_audit_log`

One row represents one immutable system event.

| Column | Type | Why it exists |
| --- | --- | --- |
| `audit_log_id` | `BIGINT` | Stable immutable event identifier. |
| `planner_row_id` | `BIGINT` | Links the event back to one planner activity when relevant. |
| `project_code` | `VARCHAR(64)` | Enables project-level history review and export. |
| `entity_type` | `ENUM` | Tells the UI whether the event came from a row, dependency, request, document, baseline, or schedule run. |
| `entity_id` | `VARCHAR(64)` | Stores the concrete entity key so the event can be traced to one record. |
| `action_type` | `VARCHAR(64)` | Stores what happened, such as created, updated, approved, rejected, archived, uploaded, or recalculated. |
| `change_summary` | `VARCHAR(255)` | Gives a short readable explanation for timeline views. |
| `before_json` | `LONGTEXT` | Stores the previous state for forensic review. |
| `after_json` | `LONGTEXT` | Stores the resulting state for forensic review. |
| `request_id` | `BIGINT` | Links the audit event to a specific change request where applicable. |
| `actor_person_id` | `VARCHAR(64)` | Stores who performed the action. |
| `actor_role` | `VARCHAR(64)` | Stores the acting role for that event. |
| `created_at` | `DATETIME` | Stores when the event happened. |

### `planner_document`

One row represents one registered document in the planner.

| Column | Type | Why it exists |
| --- | --- | --- |
| `document_id` | `BIGINT` | Stable primary key for the document register entry. |
| `planner_row_id` | `BIGINT` | Links the document to one planner line when it is activity-specific. |
| `project_code` | `VARCHAR(64)` | Allows project-level document filtering and reporting. |
| `document_code` | `VARCHAR(64)` | Provides a stable human-facing code or register number. |
| `title` | `VARCHAR(255)` | Gives the document a readable title in the UI. |
| `discipline_code` | `VARCHAR(64)` | Supports discipline-wise filtering for architecture, interiors, and future teams. |
| `category` | `ENUM` | Classifies the document as contract, drawing, minutes, submission, reference, or general. |
| `current_version_no` | `INT` | Tracks the latest version number without opening the version table. |
| `status` | `ENUM` | Tracks whether the document is draft, active, superseded, or archived. |
| `created_by_person_id` | `VARCHAR(64)` | Stores who created the document register entry. |
| `updated_by_person_id` | `VARCHAR(64)` | Stores who last changed the document metadata. |
| `created_at` | `DATETIME` | Records when the document register entry was created. |
| `updated_at` | `DATETIME` | Records the latest metadata change. |

### `planner_document_version`

One row represents one stored file version.

| Column | Type | Why it exists |
| --- | --- | --- |
| `document_version_id` | `BIGINT` | Stable version identifier for audit and download routes. |
| `document_id` | `BIGINT` | Connects the version back to the parent document. |
| `version_no` | `INT` | Gives the version a simple visible sequence number. |
| `original_filename` | `VARCHAR(255)` | Preserves the uploaded file name users recognize. |
| `stored_filename` | `VARCHAR(255)` | Stores the internal filename used on disk. |
| `mime_type` | `VARCHAR(128)` | Helps downloads and previews behave correctly. |
| `file_size_bytes` | `BIGINT` | Helps the UI and storage review show file size. |
| `storage_path` | `VARCHAR(512)` | Points to the stored file path in planner storage. |
| `checksum_sha256` | `VARCHAR(64)` | Supports integrity validation and duplicate review. |
| `version_note` | `TEXT` | Stores what changed in that version. |
| `uploaded_by_person_id` | `VARCHAR(64)` | Stores who uploaded that version. |
| `uploaded_at` | `DATETIME` | Stores when that version was uploaded. |

### `planner_project_baseline`

One row represents one saved baseline snapshot for an entire project.

| Column | Type | Why it exists |
| --- | --- | --- |
| `baseline_id` | `BIGINT` | Stable key for a baseline snapshot. |
| `project_code` | `VARCHAR(64)` | Keeps the snapshot tied to one project. |
| `baseline_name` | `VARCHAR(128)` | Gives the snapshot a usable label such as Contract Rev A or Recovery Plan Week 12. |
| `baseline_type` | `ENUM` | Separates contract baselines, approved-change baselines, and working snapshots. |
| `snapshot_json` | `LONGTEXT` | Stores the saved planner state at the moment of capture. |
| `created_by_person_id` | `VARCHAR(64)` | Records who created the snapshot. |
| `created_at` | `DATETIME` | Records when the snapshot was captured. |

## Why the planner is now more than an MVP

The planner started as one table, but day-to-day project control needs more than row storage:

- dependencies for schedule logic
- formal requests for governed change
- immutable audit history
- document storage and versioning
- baseline snapshots for contract vs live visibility

That is why the schema now has multiple tables instead of staying as only one activity list.

## Role fit in the current table

- `Super Admin`
  - can create, edit, approve, and delete any row
- `Group Leader`
  - can own rows through `group_leader_person_id`
  - can approve rows raised below them
  - can soft-delete rows in their scope
- `Project Anchor`
  - can own rows through `project_anchor_person_id`
  - has the same planner authority as Group Leader
  - can approve rows raised below them
  - can soft-delete rows in their scope
- `Senior Architect`
  - can own rows through `senior_architect_person_id`
  - can approve Architect-raised changes
- `Architect`
  - can be assigned through `assigned_to_person_id`
  - can update progress on scoped rows

## Next normalization path

What still remains for later phases is not the basic planner core anymore. The remaining future work is around:

- explicit team and project membership tables
- richer portfolio reporting tables
- consultant/client portal access tables
- risk forecasting and earned-value style reporting
