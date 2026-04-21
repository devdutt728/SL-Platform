# Graph Report - D:\SL Platform\SL_Workbook  (2026-04-21)

## Corpus Check
- Corpus is ~7,521 words - fits in a single context window. You may not need a graph.

## Summary
- 84 nodes · 108 edges · 16 communities detected
- Extraction: 77% EXTRACTED · 23% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Route Cleanup Deleteoauthstate|Route Cleanup Deleteoauthstate]]
- [[_COMMUNITY_Page Tsx Authheaderfromcookie|Page Tsx Authheaderfromcookie]]
- [[_COMMUNITY_Next Page Font|Next Page Font]]
- [[_COMMUNITY_Firstheadervalue Getrequestorigin Isgooglehost|Firstheadervalue Getrequestorigin Isgooglehost]]
- [[_COMMUNITY_Colorway Brand Identity|Colorway Brand Identity]]
- [[_COMMUNITY_Proxy Cookieoptions Normalizeorigin|Proxy Cookieoptions Normalizeorigin]]
- [[_COMMUNITY_Readgoogleclientid Readgoogleoauthsecrets Loginpage|Readgoogleclientid Readgoogleoauthsecrets Loginpage]]
- [[_COMMUNITY_Vertical Bar Workbook|Vertical Bar Workbook]]
- [[_COMMUNITY_Rootlayout Layout Tsx|Rootlayout Layout Tsx]]
- [[_COMMUNITY_Plannerlaunchclient Tsx|Plannerlaunchclient Tsx]]
- [[_COMMUNITY_Next Env|Next Env]]
- [[_COMMUNITY_Next Config Mjs|Next Config Mjs]]
- [[_COMMUNITY_Postcss Config Mjs|Postcss Config Mjs]]
- [[_COMMUNITY_Tailwind Config|Tailwind Config]]
- [[_COMMUNITY_Page Tsx|Page Tsx]]
- [[_COMMUNITY_Tsx|Tsx]]

## God Nodes (most connected - your core abstractions)
1. `GET()` - 21 edges
2. `getRequestOrigin()` - 7 edges
3. `Next.js Project` - 6 edges
4. `proxy()` - 5 edges
5. `cleanup()` - 5 edges
6. `Studio Lotus Brand Identity` - 5 edges
7. `Vercel Platform` - 5 edges
8. `fetchCurrentUser()` - 4 edges
9. `plannerBackendUrl()` - 4 edges
10. `checkPlannerAccess()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `proxy()` --calls--> `GET()`  [INFERRED]
  SL_Workbook\frontend\proxy.ts → SL_Workbook\frontend\app\api\auth\me\route.ts
- `getRequestOrigin()` --calls--> `GET()`  [INFERRED]
  SL_Workbook\frontend\lib\request-origin.ts → SL_Workbook\frontend\app\api\auth\me\route.ts
- `GET()` --calls--> `readGoogleOAuthSecrets()`  [INFERRED]
  SL_Workbook\frontend\app\api\auth\me\route.ts → SL_Workbook\frontend\lib\google-oauth.ts
- `GET()` --calls--> `backendUrl()`  [INFERRED]
  SL_Workbook\frontend\app\api\auth\me\route.ts → SL_Workbook\frontend\lib\backend.ts
- `GET()` --calls--> `deleteOAuthState()`  [INFERRED]
  SL_Workbook\frontend\app\api\auth\me\route.ts → SL_Workbook\frontend\lib\oauth-memory.ts

## Hyperedges (group relationships)
- **Dual-Bar Favicon Mark** — favicon_left_gray_bar, favicon_right_orange_bar, favicon_two_column_composition [EXTRACTED 1.00]
- **Studio Lotus Logo Composition** — studio_lotus_logo_asset, studio_lotus_wordmark, studio_lotus_lotus_symbol, studio_lotus_tm_marker, studio_lotus_gray_colorway, studio_lotus_orange_colorway [EXTRACTED 1.00]
- **Next.js Local Iteration Loop** — local_dev_server, localhost_preview, app_page_tsx, auto_update_on_edit [EXTRACTED 1.00]
- **Vercel Ecosystem Choices** — create_next_app, next_font_module, geist_font_family, vercel_platform [INFERRED 0.76]

## Communities

### Community 0 - "Route Cleanup Deleteoauthstate"
Cohesion: 0.21
Nodes (11): cleanup(), deleteOAuthState(), getOAuthState(), popFinalizeToken(), putFinalizeToken(), putOAuthState(), GET(), isGoogleHost() (+3 more)

### Community 1 - "Page Tsx Authheaderfromcookie"
Cohesion: 0.17
Nodes (8): authHeaderFromCookie(), backendUrl(), asString(), checkPlannerAccess(), fetchCurrentUser(), plannerBackendUrl(), PlannerLaunchPage(), probePlannerAccess()

### Community 2 - "Next Page Font"
Cohesion: 0.19
Nodes (13): app/page.tsx Entry Page, Automatic Page Update on Edit, create-next-app Bootstrap, Next.js Deployment Workflow, Easiest Deployment Path Rationale, Automatic Font Optimization Rationale, Frontend README, Geist Font Family (+5 more)

### Community 3 - "Firstheadervalue Getrequestorigin Isgooglehost"
Cohesion: 0.57
Nodes (6): firstHeaderValue(), getRequestOrigin(), isGoogleHost(), isLocalHost(), normalizeTunnelHost(), parseForwarded()

### Community 4 - "Colorway Brand Identity"
Cohesion: 0.38
Nodes (7): Studio Lotus Brand Identity, Gray Colorway, Studio Lotus Logo, Lotus Blossom Icon, Orange Colorway, Trademark Marker (TM), Studio Lotus Wordmark

### Community 5 - "Proxy Cookieoptions Normalizeorigin"
Cohesion: 0.7
Nodes (4): cookieOptions(), normalizeOrigin(), originsMatch(), proxy()

### Community 6 - "Readgoogleclientid Readgoogleoauthsecrets Loginpage"
Cohesion: 0.5
Nodes (3): readGoogleClientId(), readGoogleOAuthSecrets(), LoginPage()

### Community 7 - "Vertical Bar Workbook"
Cohesion: 0.6
Nodes (5): SL Workbook Favicon, Left Gray Vertical Bar, Minimalist Logo Style, Right Orange Vertical Bar, Two-Column Geometric Composition

### Community 8 - "Rootlayout Layout Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 9 - "Plannerlaunchclient Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 10 - "Next Env"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Next Config Mjs"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Postcss Config Mjs"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Tailwind Config"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Page Tsx"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Tsx"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **9 isolated node(s):** `Minimalist Logo Style`, `Gray Colorway`, `Orange Colorway`, `Frontend README`, `Localhost Preview (http://localhost:3000)` (+4 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Rootlayout Layout Tsx`** (2 nodes): `RootLayout()`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Plannerlaunchclient Tsx`** (2 nodes): `PlannerLaunchClient()`, `PlannerLaunchClient.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next Env`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next Config Mjs`** (1 nodes): `next.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Postcss Config Mjs`** (1 nodes): `postcss.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tailwind Config`** (1 nodes): `tailwind.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Page Tsx`** (1 nodes): `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tsx`** (1 nodes): `ui.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GET()` connect `Route Cleanup Deleteoauthstate` to `Page Tsx Authheaderfromcookie`, `Firstheadervalue Getrequestorigin Isgooglehost`, `Proxy Cookieoptions Normalizeorigin`, `Readgoogleclientid Readgoogleoauthsecrets Loginpage`?**
  _High betweenness centrality (0.289) - this node is a cross-community bridge._
- **Why does `getRequestOrigin()` connect `Firstheadervalue Getrequestorigin Isgooglehost` to `Route Cleanup Deleteoauthstate`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `proxy()` connect `Proxy Cookieoptions Normalizeorigin` to `Route Cleanup Deleteoauthstate`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `GET()` (e.g. with `proxy()` and `getRequestOrigin()`) actually correct?**
  _`GET()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Minimalist Logo Style`, `Gray Colorway`, `Orange Colorway` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._