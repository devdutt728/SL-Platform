# Graph Report - D:\SL Platform\SL_IT  (2026-04-21)

## Corpus Check
- Corpus is ~30,263 words - fits in a single context window. You may not need a graph.

## Summary
- 471 nodes · 806 edges · 69 communities detected
- Extraction: 67% EXTRACTED · 33% INFERRED · 0% AMBIGUOUS · INFERRED: 265 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Route Proxy Originsmatch|Route Proxy Originsmatch]]
- [[_COMMUNITY_List Create Update|List Create Update]]
- [[_COMMUNITY_Workspace Python Modular|Workspace Python Modular]]
- [[_COMMUNITY_Validate Asset Status|Validate Asset Status]]
- [[_COMMUNITY_Tsx Downloadtext Validatecsvfile|Tsx Downloadtext Validatecsvfile]]
- [[_COMMUNITY_Role Superadmin User|Role Superadmin User]]
- [[_COMMUNITY_Roles Test Session|Roles Test Session]]
- [[_COMMUNITY_Base Import Csv|Base Import Csv]]
- [[_COMMUNITY_Dispatch Init Basehttpmiddleware|Dispatch Init Basehttpmiddleware]]
- [[_COMMUNITY_Addassignment Addlicense Addvendor|Addassignment Addlicense Addvendor]]
- [[_COMMUNITY_Test Sla Ticket|Test Sla Ticket]]
- [[_COMMUNITY_Require Roles Get|Require Roles Get]]
- [[_COMMUNITY_Downloadsample Downloadtext Load|Downloadsample Downloadtext Load]]
- [[_COMMUNITY_Palette Word Neutral|Palette Word Neutral]]
- [[_COMMUNITY_Firstheadervalue Getrequestorigin Isgooglehost|Firstheadervalue Getrequestorigin Isgooglehost]]
- [[_COMMUNITY_Role Map Basesettings|Role Map Basesettings]]
- [[_COMMUNITY_Superadmin Infer Role|Superadmin Infer Role]]
- [[_COMMUNITY_Brand Name Gray|Brand Name Gray]]
- [[_COMMUNITY_Role Dim Bootstrap|Role Dim Bootstrap]]
- [[_COMMUNITY_Logout Auth|Logout Auth]]
- [[_COMMUNITY_Async Engine Session|Async Engine Session]]
- [[_COMMUNITY_Googlemark Loginpage Page|Googlemark Loginpage Page]]
- [[_COMMUNITY_Topbar Tsx Firstname|Topbar Tsx Firstname]]
- [[_COMMUNITY_Create Main|Create Main]]
- [[_COMMUNITY_Session Get|Session Get]]
- [[_COMMUNITY_Session Get|Session Get]]
- [[_COMMUNITY_Rootlayout Layout Tsx|Rootlayout Layout Tsx]]
- [[_COMMUNITY_Providers Tsx|Providers Tsx]]
- [[_COMMUNITY_Portallayout Layout Tsx|Portallayout Layout Tsx]]
- [[_COMMUNITY_Homepage Page Tsx|Homepage Page Tsx]]
- [[_COMMUNITY_Myticketspage Page Tsx|Myticketspage Page Tsx]]
- [[_COMMUNITY_Newticketpage Page Tsx|Newticketpage Page Tsx]]
- [[_COMMUNITY_Queuepage Page Tsx|Queuepage Page Tsx]]
- [[_COMMUNITY_Ticketdetailpage Page Tsx|Ticketdetailpage Page Tsx]]
- [[_COMMUNITY_Adminindexpage Page Tsx|Adminindexpage Page Tsx]]
- [[_COMMUNITY_Adminitpage Page Tsx|Adminitpage Page Tsx]]
- [[_COMMUNITY_Adminitassetspage Page Tsx|Adminitassetspage Page Tsx]]
- [[_COMMUNITY_Adminitlicensespage Page Tsx|Adminitlicensespage Page Tsx]]
- [[_COMMUNITY_Adminuserspage Page Tsx|Adminuserspage Page Tsx]]
- [[_COMMUNITY_Moduletabs Module Tabs|Moduletabs Module Tabs]]
- [[_COMMUNITY_Portalshell Portal Shell|Portalshell Portal Shell]]
- [[_COMMUNITY_Queuetabs Queue Tabs|Queuetabs Queue Tabs]]
- [[_COMMUNITY_Quickstats Quick Stats|Quickstats Quick Stats]]
- [[_COMMUNITY_Roleguard Role Guard|Roleguard Role Guard]]
- [[_COMMUNITY_Status Chip Tsx|Status Chip Tsx]]
- [[_COMMUNITY_Ticket Detail Tsx|Ticket Detail Tsx]]
- [[_COMMUNITY_Ticket List Tsx|Ticket List Tsx]]
- [[_COMMUNITY_User Context Tsx|User Context Tsx]]
- [[_COMMUNITY_Utils|Utils]]
- [[_COMMUNITY_Constants|Constants]]
- [[_COMMUNITY_Init|Init]]
- [[_COMMUNITY_Init|Init]]
- [[_COMMUNITY_Init|Init]]
- [[_COMMUNITY_Init|Init]]
- [[_COMMUNITY_Base|Base]]
- [[_COMMUNITY_Init|Init]]
- [[_COMMUNITY_Init|Init]]
- [[_COMMUNITY_Auth|Auth]]
- [[_COMMUNITY_Init|Init]]
- [[_COMMUNITY_Init|Init]]
- [[_COMMUNITY_Next Env|Next Env]]
- [[_COMMUNITY_Next Config|Next Config]]
- [[_COMMUNITY_Postcss Config|Postcss Config]]
- [[_COMMUNITY_Tailwind Config|Tailwind Config]]
- [[_COMMUNITY_Confirm Dialog Tsx|Confirm Dialog Tsx]]
- [[_COMMUNITY_Sidebar Tsx|Sidebar Tsx]]
- [[_COMMUNITY_Button Tsx|Button Tsx]]
- [[_COMMUNITY_Require Auth|Require Auth]]
- [[_COMMUNITY_Types|Types]]

## God Nodes (most connected - your core abstractions)
1. `GET()` - 44 edges
2. `get_request_context()` - 33 edges
3. `write_audit_log()` - 32 edges
4. `Base` - 21 edges
5. `apiFetch()` - 19 edges
6. `loadData()` - 15 edges
7. `Backend Python Requirements` - 14 edges
8. `get_current_user()` - 13 edges
9. `Role` - 11 edges
10. `update_user()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `require_admin()` --calls--> `require_roles()`  [INFERRED]
  SL_IT\backend\app\rbac.py → SL_IT\backend\app\core\auth.py
- `require_superadmin()` --calls--> `require_roles()`  [INFERRED]
  SL_IT\backend\app\rbac.py → SL_IT\backend\app\core\auth.py
- `require_it_agent()` --calls--> `require_roles()`  [INFERRED]
  SL_IT\backend\app\rbac.py → SL_IT\backend\app\core\auth.py
- `require_it_lead()` --calls--> `require_roles()`  [INFERRED]
  SL_IT\backend\app\rbac.py → SL_IT\backend\app\core\auth.py
- `require_employee()` --calls--> `require_roles()`  [INFERRED]
  SL_IT\backend\app\rbac.py → SL_IT\backend\app\core\auth.py

## Hyperedges (group relationships)
- **Studio Lotus Brand Identity System** — studio_lotus_logo_tm_wordmark, studio_lotus_logo_tm_brand_name, studio_lotus_logo_tm_duotone_palette, studio_lotus_logo_tm_trademark_symbol [INFERRED 0.80]
- **Studio Lotus Brand Lockup** — studio_lotus_logo_wordmark, studio_lotus_logo_text_studio, studio_lotus_logo_text_lotus, studio_lotus_logo_lotus_icon [EXTRACTED 1.00]
- **Local Environment Bootstrap Flow** — setup_local_run_no_docker, setup_mysql_sl_it_schema, setup_sql_bootstrap, setup_api_start_uvicorn, setup_frontend_start_next_dev [EXTRACTED 1.00]
- **Google Identity and Delegation Stack** — readme_google_workspace_sso, setup_google_oauth_oidc, setup_workspace_domain_restriction, setup_domain_wide_delegation [INFERRED 0.82]
- **Application and Deployment Database Stack** — readme_mysql, req_sqlalchemy, req_aiomysql, req_pymysql, setup_managed_mysql_8 [INFERRED 0.80]

## Communities

### Community 0 - "Route Proxy Originsmatch"
Cohesion: 0.08
Nodes (29): authHeaderFromCookie(), backendUrl(), create_event(), send_email(), readGoogleClientId(), readGoogleOAuthSecrets(), internalUrl(), update_routing_rule() (+21 more)

### Community 1 - "List Create Update"
Cohesion: 0.12
Nodes (31): write_audit_log(), add_comment(), assign_ticket(), create_asset(), create_category(), create_license(), create_license_assignment(), create_routing_rule() (+23 more)

### Community 2 - "Workspace Python Modular"
Cohesion: 0.05
Nodes (44): Audit Trails, DB-driven RBAC, FastAPI, Google Workspace SSO, Modular Workbook UX, MySQL, Next.js, UX is modular to support future apps (+36 more)

### Community 3 - "Validate Asset Status"
Cohesion: 0.08
Nodes (34): BaseModel, AssetBase, AssetCreate, AssetOut, AssetUpdate, CategoryBase, CategoryCreate, CategoryOut (+26 more)

### Community 4 - "Tsx Downloadtext Validatecsvfile"
Cohesion: 0.12
Nodes (28): apiFetch(), createCategory(), createRoutingRule(), createSla(), createSubcategory(), deactivateCategory(), deactivateRouting(), deactivateSla() (+20 more)

### Community 5 - "Role Superadmin User"
Cohesion: 0.17
Nodes (23): create_user(), _format_full_name(), import_users_csv(), list_users(), _primary_role_id(), _role_map_for_people(), update_user(), DimPerson (+15 more)

### Community 6 - "Roles Test Session"
Cohesion: 0.12
Nodes (22): list_roles(), _derive_name_from_email(), _enforce_single_session(), _ensure_session_table(), get_current_user(), _load_oauth_client_id(), _map_platform_roles_to_app_roles(), _read_bearer_token() (+14 more)

### Community 7 - "Base Import Csv"
Cohesion: 0.21
Nodes (22): Base, Base, DeclarativeBase, import_licenses_csv(), import_policy_csv(), ITAsset, ITAuditLog, ITCategory (+14 more)

### Community 8 - "Dispatch Init Basehttpmiddleware"
Cohesion: 0.13
Nodes (6): BaseHTTPMiddleware, InternalGuardMiddleware, RequestLoggingMiddleware, _client_ip(), RateLimitMiddleware, RequestContextMiddleware

### Community 9 - "Addassignment Addlicense Addvendor"
Cohesion: 0.23
Nodes (14): addAssignment(), addLicense(), addVendor(), downloadAssignmentSample(), downloadLicenseSample(), downloadText(), loadAll(), loadAssignments() (+6 more)

### Community 10 - "Test Sla Ticket"
Cohesion: 0.21
Nodes (12): _can_override_priority(), create_ticket(), test_sla_due_times(), make_ticket(), test_invalid_transition_raises(), test_reopen_outside_window(), test_reopen_within_window(), compute_sla_due() (+4 more)

### Community 11 - "Require Roles Get"
Cohesion: 0.39
Nodes (6): require_roles(), require_admin(), require_employee(), require_it_agent(), require_it_lead(), require_superadmin()

### Community 12 - "Downloadsample Downloadtext Load"
Cohesion: 0.43
Nodes (7): downloadSample(), downloadText(), load(), submit(), toIsoOrNull(), uploadCsv(), validateCsvFile()

### Community 13 - "Palette Word Neutral"
Cohesion: 0.32
Nodes (8): Studio Lotus, Neutral gray palette, Vibrant orange palette, Lotus blossom icon, Word "lotus", Word "studio", TM mark, studio lotus wordmark

### Community 14 - "Firstheadervalue Getrequestorigin Isgooglehost"
Cohesion: 0.57
Nodes (6): firstHeaderValue(), getRequestOrigin(), isGoogleHost(), isLocalHost(), normalizeTunnelHost(), parseForwarded()

### Community 15 - "Role Map Basesettings"
Cohesion: 0.4
Nodes (4): BaseSettings, _parse_role_map(), role_map(), Settings

### Community 16 - "Superadmin Infer Role"
Cohesion: 0.83
Nodes (3): _infer_superadmin_role_id(), main(), _run()

### Community 17 - "Brand Name Gray"
Cohesion: 0.83
Nodes (4): Studio Lotus Brand Name, Gray and Orange Duotone Palette, TM Trademark Symbol, Studio Lotus Wordmark Logo

### Community 18 - "Role Dim Bootstrap"
Cohesion: 0.5
Nodes (4): Bootstrap Superadmin, Role Mapping JSON, sl_platform.dim_person, sl_platform.dim_role

### Community 19 - "Logout Auth"
Cohesion: 0.67
Nodes (0): 

### Community 20 - "Async Engine Session"
Cohesion: 0.67
Nodes (0): 

### Community 21 - "Googlemark Loginpage Page"
Cohesion: 0.67
Nodes (0): 

### Community 22 - "Topbar Tsx Firstname"
Cohesion: 0.67
Nodes (0): 

### Community 23 - "Create Main"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Session Get"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Session Get"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Rootlayout Layout Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Providers Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Portallayout Layout Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Homepage Page Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Myticketspage Page Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Newticketpage Page Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Queuepage Page Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Ticketdetailpage Page Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Adminindexpage Page Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Adminitpage Page Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Adminitassetspage Page Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Adminitlicensespage Page Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Adminuserspage Page Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Moduletabs Module Tabs"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Portalshell Portal Shell"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Queuetabs Queue Tabs"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Quickstats Quick Stats"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Roleguard Role Guard"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Status Chip Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Ticket Detail Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Ticket List Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "User Context Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Utils"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Constants"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Init"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Init"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Init"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Init"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Base"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Init"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Init"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Auth"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Init"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Init"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Next Env"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Next Config"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Postcss Config"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Tailwind Config"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Confirm Dialog Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Sidebar Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Button Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 67 - "Require Auth"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "Types"
Cohesion: 1.0
Nodes (0): 

## Ambiguous Edges - Review These
- `Studio Lotus` → `TM mark`  [AMBIGUOUS]
  SL_IT/frontend/public/studio-lotus-logo.png · relation: references

## Knowledge Gaps
- **20 isolated node(s):** `Config`, `Neutral gray palette`, `Vibrant orange palette`, `TM mark`, `DB-driven RBAC` (+15 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Create Main`** (2 nodes): `create_app()`, `main.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Get`** (2 nodes): `get_platform_session()`, `platform_session.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Get`** (2 nodes): `get_session()`, `session.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rootlayout Layout Tsx`** (2 nodes): `RootLayout()`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Providers Tsx`** (2 nodes): `Providers()`, `providers.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Portallayout Layout Tsx`** (2 nodes): `PortalLayout()`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Homepage Page Tsx`** (2 nodes): `HomePage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Myticketspage Page Tsx`** (2 nodes): `MyTicketsPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Newticketpage Page Tsx`** (2 nodes): `NewTicketPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Queuepage Page Tsx`** (2 nodes): `QueuePage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Ticketdetailpage Page Tsx`** (2 nodes): `TicketDetailPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Adminindexpage Page Tsx`** (2 nodes): `AdminIndexPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Adminitpage Page Tsx`** (2 nodes): `AdminItPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Adminitassetspage Page Tsx`** (2 nodes): `AdminItAssetsPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Adminitlicensespage Page Tsx`** (2 nodes): `AdminItLicensesPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Adminuserspage Page Tsx`** (2 nodes): `AdminUsersPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Moduletabs Module Tabs`** (2 nodes): `ModuleTabs()`, `module-tabs.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Portalshell Portal Shell`** (2 nodes): `PortalShell()`, `portal-shell.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Queuetabs Queue Tabs`** (2 nodes): `QueueTabs()`, `queue-tabs.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Quickstats Quick Stats`** (2 nodes): `QuickStats()`, `quick-stats.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Roleguard Role Guard`** (2 nodes): `RoleGuard()`, `role-guard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Status Chip Tsx`** (2 nodes): `status-chip.tsx`, `StatusChip()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Ticket Detail Tsx`** (2 nodes): `ticket-detail.tsx`, `TicketDetailView()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Ticket List Tsx`** (2 nodes): `ticket-list.tsx`, `TicketList()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `User Context Tsx`** (2 nodes): `user-context.tsx`, `UserProvider()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utils`** (2 nodes): `utils.ts`, `cn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Constants`** (1 nodes): `constants.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Base`** (1 nodes): `base.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth`** (1 nodes): `auth.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next Env`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next Config`** (1 nodes): `next.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Postcss Config`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tailwind Config`** (1 nodes): `tailwind.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Confirm Dialog Tsx`** (1 nodes): `confirm-dialog.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Sidebar Tsx`** (1 nodes): `sidebar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Button Tsx`** (1 nodes): `button.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Require Auth`** (1 nodes): `require-auth.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Types`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Studio Lotus` and `TM mark`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `GET()` connect `Route Proxy Originsmatch` to `List Create Update`, `Role Superadmin User`, `Roles Test Session`, `Base Import Csv`, `Dispatch Init Basehttpmiddleware`, `Test Sla Ticket`, `Firstheadervalue Getrequestorigin Isgooglehost`?**
  _High betweenness centrality (0.146) - this node is a cross-community bridge._
- **Why does `get_current_user()` connect `Roles Test Session` to `Route Proxy Originsmatch`, `List Create Update`, `Role Superadmin User`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `PlatformUserListItem` connect `Role Superadmin User` to `Validate Asset Status`, `Roles Test Session`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Are the 33 inferred relationships involving `GET()` (e.g. with `get_request_context()` and `get_current_user()`) actually correct?**
  _`GET()` has 33 INFERRED edges - model-reasoned connections that need verification._
- **Are the 31 inferred relationships involving `get_request_context()` (e.g. with `GET()` and `update_user()`) actually correct?**
  _`get_request_context()` has 31 INFERRED edges - model-reasoned connections that need verification._
- **Are the 32 inferred relationships involving `str` (e.g. with `get_current_user()` and `_parse_role_map()`) actually correct?**
  _`str` has 32 INFERRED edges - model-reasoned connections that need verification._