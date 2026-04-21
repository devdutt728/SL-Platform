# Graph Report - D:\SL Platform\SL_Project_Planner  (2026-04-21)

## Corpus Check
- Corpus is ~38,429 words - fits in a single context window. You may not need a graph.

## Summary
- 371 nodes · 827 edges · 23 communities detected
- Extraction: 76% EXTRACTED · 24% INFERRED · 0% AMBIGUOUS · INFERRED: 200 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Extractdetail Appendtaskafterrow Appendtaskfromrowprompt|Extractdetail Appendtaskafterrow Appendtaskfromrowprompt]]
- [[_COMMUNITY_Planner Table Role|Planner Table Role]]
- [[_COMMUNITY_Route Session Feature|Route Session Feature]]
- [[_COMMUNITY_Planner Basemodel Groupleaderassignin|Planner Basemodel Groupleaderassignin]]
- [[_COMMUNITY_Serialize List Audit|Serialize List Audit]]
- [[_COMMUNITY_Planner Row Person|Planner Row Person]]
- [[_COMMUNITY_Base Role Identity|Base Role Identity]]
- [[_COMMUNITY_Group Member Person|Group Member Person]]
- [[_COMMUNITY_Role Planner Assignments|Role Planner Assignments]]
- [[_COMMUNITY_Planner Access Role|Planner Access Role]]
- [[_COMMUNITY_Repo Root Path|Repo Root Path]]
- [[_COMMUNITY_Auth Logout Getplannerauthme|Auth Logout Getplannerauthme]]
- [[_COMMUNITY_Session Get User|Session Get User]]
- [[_COMMUNITY_Ordinal Duration Days|Ordinal Duration Days]]
- [[_COMMUNITY_Proxy Cookieoptions Employeeurl|Proxy Cookieoptions Employeeurl]]
- [[_COMMUNITY_Health Check Shutdown|Health Check Shutdown]]
- [[_COMMUNITY_Rootlayout Layout Tsx|Rootlayout Layout Tsx]]
- [[_COMMUNITY_Init|Init]]
- [[_COMMUNITY_Router|Router]]
- [[_COMMUNITY_Eslint Config Mjs|Eslint Config Mjs]]
- [[_COMMUNITY_Next Env|Next Env]]
- [[_COMMUNITY_Next Config Mjs|Next Config Mjs]]
- [[_COMMUNITY_Error Tsx|Error Tsx]]

## God Nodes (most connected - your core abstractions)
1. `GET()` - 46 edges
2. `_resolve_actor()` - 29 edges
3. `loadBoard()` - 19 edges
4. `Base` - 15 edges
5. `group_workspace()` - 14 edges
6. `create_planner_row()` - 14 edges
7. `update_planner_row()` - 14 edges
8. `extractDetail()` - 14 edges
9. `Planner Table Dictionary` - 14 edges
10. `Planner V2 Blueprint` - 13 edges

## Surprising Connections (you probably didn't know these)
- `_group_summary()` --calls--> `GroupSummaryOut`  [INFERRED]
  SL_Project_Planner\backend\app\api\routes\group_management.py → SL_Project_Planner\backend\app\schemas\group_management.py
- `_log_membership_change()` --calls--> `GroupMemberChangeLog`  [INFERRED]
  SL_Project_Planner\backend\app\api\routes\group_management.py → SL_Project_Planner\backend\app\models\platform_group.py
- `_cleanup_inactive_members()` --calls--> `GET()`  [INFERRED]
  SL_Project_Planner\backend\app\api\routes\group_management.py → SL_Project_Planner\frontend\app\api\rows\[plannerRowId]\documents\route.ts
- `_person_out()` --calls--> `GroupPersonOut`  [INFERRED]
  SL_Project_Planner\backend\app\api\routes\group_management.py → SL_Project_Planner\backend\app\schemas\group_management.py
- `_actor_scope()` --calls--> `_resolve_actor()`  [INFERRED]
  SL_Project_Planner\backend\app\api\routes\group_management.py → SL_Project_Planner\backend\app\api\routes\planner.py

## Hyperedges (group relationships)
- **Planner Core Data Schema** — planner_activity_table, planner_dependency_table, planner_change_request_table, planner_audit_log_table, planner_document_table, planner_document_version_table, planner_project_baseline_table [EXTRACTED 1.00]
- **Approval and Governance Flow** — planner_change_request_table, planner_approval_workflow, planner_audit_log_table, planner_soft_delete_policy, planner_hard_delete_policy [EXTRACTED 1.00]
- **Prototype to Product Transition** — projecttracker_v3_prototype, legacy_browser_localstorage_model, planner_mysql_backed_system, planner_backend_service, planner_frontend_workspace [INFERRED 0.84]

## Communities

### Community 0 - "Extractdetail Appendtaskafterrow Appendtaskfromrowprompt"
Cohesion: 0.08
Nodes (46): extractDetail(), appendTaskAfterRow(), appendTaskFromRowPrompt(), backendStatusFromUiValue(), beginStageInlineEdit(), buildAutoProjectCode(), buildStageBuckets(), cancelStageInlineEdit() (+38 more)

### Community 1 - "Planner Table Role"
Cohesion: 0.08
Nodes (50): Planner Backend README, Backend Requirements, Frontend BACKEND_URL Integration, Planner Frontend README, Browser LocalStorage Persistence Model, sl_project_planner Table, Planner API Service, Request-Based Approval Workflow (+42 more)

### Community 2 - "Route Session Feature"
Cohesion: 0.08
Nodes (16): _derive_name_from_email(), _enforce_single_session(), _ensure_session_table(), get_current_user(), _load_oauth_client_id(), _read_bearer_token(), _read_session_id(), _verify_google_id_token() (+8 more)

### Community 3 - "Planner Basemodel Groupleaderassignin"
Cohesion: 0.1
Nodes (34): BaseModel, GroupLeaderAssignIn, GroupLeaderAssignOut, GroupLeaderCandidateOut, GroupMemberAddIn, GroupMemberLogOut, GroupPersonOut, GroupSummaryOut (+26 more)

### Community 4 - "Serialize List Audit"
Cohesion: 0.17
Nodes (26): dumps_json(), log_audit_event(), _can_edit_row(), _load_visible_row(), _assert_project_visible(), create_dependency(), create_project_baseline(), delete_dependency() (+18 more)

### Community 5 - "Planner Row Person"
Cohesion: 0.16
Nodes (27): _actor_has_any_role(), _actor_out(), _allowed_update_fields(), approve_planner_row(), planner_row_snapshot(), _auto_activity_code(), _can_delete_row(), create_planner_row() (+19 more)

### Community 6 - "Base Role Identity"
Cohesion: 0.16
Nodes (20): Base, Base, DeclarativeBase, PlannerActivityDependency, PlannerAuditLog, PlannerChangeRequest, PlannerDocument, PlannerDocumentVersion (+12 more)

### Community 7 - "Group Member Person"
Cohesion: 0.32
Nodes (19): _actor_scope(), add_group_member(), assign_group_leader(), _cleanup_inactive_members(), _ensure_group_log_table(), _group_summary(), group_workspace(), GroupMemberMutationOut (+11 more)

### Community 8 - "Role Planner Assignments"
Cohesion: 0.27
Nodes (14): _assert_manageable_role(), _can_manage_assignments(), ensure_planner_role_catalog(), _group_leader_scoped_person_ids(), list_explicit_planner_roles(), list_planner_role_assignments(), manageable_roles_for_actor(), _migrate_legacy_assignments_if_present() (+6 more)

### Community 9 - "Planner Access Role"
Cohesion: 0.26
Nodes (11): has_planner_app_access(), can_approve_requester(), is_superadmin_user(), normalize_role_token(), _ordered_roles(), PlannerActorPolicy, policy_for_role(), policy_for_roles() (+3 more)

### Community 10 - "Repo Root Path"
Cohesion: 0.24
Nodes (7): BaseSettings, _env_files(), Settings, repo_root(), resolve_repo_path(), storage_root_path(), store_document_file()

### Community 11 - "Auth Logout Getplannerauthme"
Cohesion: 0.22
Nodes (5): me(), getPlannerAuthMe(), PlannerPage(), employeeRedirectTarget(), requirePlannerAccess()

### Community 12 - "Session Get User"
Cohesion: 0.25
Nodes (4): get_db_session(), get_platform_db_session(), get_platform_session(), get_session()

### Community 13 - "Ordinal Duration Days"
Cohesion: 0.52
Nodes (6): _duration_days(), _from_ordinal(), _ordinal(), recalculate_project_schedule(), ScheduleResult, _start_anchor()

### Community 14 - "Proxy Cookieoptions Employeeurl"
Cohesion: 0.83
Nodes (3): cookieOptions(), employeeUrl(), proxy()

### Community 15 - "Health Check Shutdown"
Cohesion: 0.67
Nodes (0): 

### Community 16 - "Rootlayout Layout Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Init"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Router"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Eslint Config Mjs"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Next Env"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Next Config Mjs"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Error Tsx"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **2 isolated node(s):** `Rationale: Reuse platform identity instead of planner user table`, `Principal Role`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Rootlayout Layout Tsx`** (2 nodes): `RootLayout()`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Router`** (1 nodes): `router.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Eslint Config Mjs`** (1 nodes): `eslint.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next Env`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next Config Mjs`** (1 nodes): `next.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Error Tsx`** (1 nodes): `error.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GET()` connect `Route Session Feature` to `Extractdetail Appendtaskafterrow Appendtaskfromrowprompt`, `Serialize List Audit`, `Planner Row Person`, `Group Member Person`, `Role Planner Assignments`, `Auth Logout Getplannerauthme`, `Proxy Cookieoptions Employeeurl`?**
  _High betweenness centrality (0.402) - this node is a cross-community bridge._
- **Why does `_resolve_actor()` connect `Serialize List Audit` to `Route Session Feature`, `Planner Row Person`, `Group Member Person`, `Role Planner Assignments`, `Planner Access Role`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `saveProjectDates()` connect `Extractdetail Appendtaskafterrow Appendtaskfromrowprompt` to `Route Session Feature`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Are the 36 inferred relationships involving `GET()` (e.g. with `_cleanup_inactive_members()` and `group_workspace()`) actually correct?**
  _`GET()` has 36 INFERRED edges - model-reasoned connections that need verification._
- **Are the 22 inferred relationships involving `_resolve_actor()` (e.g. with `_actor_scope()` and `assign_group_leader()`) actually correct?**
  _`_resolve_actor()` has 22 INFERRED edges - model-reasoned connections that need verification._
- **Are the 13 inferred relationships involving `Base` (e.g. with `SLProjectPlannerRow` and `PlannerActivityDependency`) actually correct?**
  _`Base` has 13 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Rationale: Reuse platform identity instead of planner user table`, `Principal Role` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._