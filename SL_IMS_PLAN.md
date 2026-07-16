# SL IMS — IT Inventory Management System
### Detailed Build Plan (v1)

> Replaces the current `SL_IT` helpdesk/ticketing module with a clean, simple, "idiot‑proof" **Inventory Management System** for the IT team — MNC‑grade UI/UX, maximum automation, barcode/QR scanner‑driven entry & allotment, and auto‑filed invoices/bills on a shared Google Drive.

---

## 0. Decisions locked (from kickoff)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Relationship to SL_People's existing inventory | **Standalone.** IMS is a fresh, self‑contained system. SL_People's `system_inventory` / `peripheral_inventory` / `license_*` stay untouched **for now**. Migration/merge into IMS happens **later**, once IMS is fully proven. |
| 2 | Invoice / bill storage | **Fully automated Google Drive** via a service account. IMS auto‑creates a category‑wise folder tree, uploads the file, and stores the shareable link. |
| 3 | Existing SL_IT ticketing code + `sl_it` schema | **Delete entirely** (app code + DB schema). Keep the *pattern* (SSO, RBAC, audit, portal shell) but rebuild around inventory. |
| 4 | Auth / SSO | **Reuse the existing shared SSO** — Google Workspace OAuth resolving identity from `sl_platform.dim_person`. No new login system. |
| 5 | IT roles | **Delete** `it_lead` / `it_agent` (and repurpose `it_admin`). Create **fresh IMS roles**. |
| 6 | Breakage | **Zero breakage** to People / Recruitment / Workbook / Planner. (Confirmed safe: SL_IT is already 404'd at Caddy, on its own port + own schema; other modules only use role IDs 1–8.) |

**Module identity:** keep the folder `SL_IT/` and its existing wiring (backend port `8001`, its frontend port, `start-dev.cmd` / `start-prod.cmd` entries) to avoid touching platform plumbing. Rebrand the app to **"Studio Lotus IMS"**. New DB schema: **`sl_ims`**. Caddy `/it*` flips from `404` → reverse‑proxy to the IMS frontend.

---

## 1. Design principles ("proper, simple, idiot‑proof")

1. **Catalog‑driven autofill.** You never re‑type specs. Choose a *Category → Product/Model* and every spec, default warranty, and depreciation rate autofills. Only the unique bits (serial, asset tag) are per‑unit.
2. **Scan, don't type.** A USB barcode/QR scanner (keyboard‑wedge) or a phone camera is the primary input for both **intake** and **allotment**. Serial in → record opens/creates.
3. **Automate every column that can be computed.** Asset tag, age, warranty status/days‑left, depreciation/current value, status, assignee details, location, audit metadata, and Drive links are all system‑generated — never hand‑entered.
4. **One obvious action per screen.** Big primary buttons, minimal required fields, inline validation, smart defaults. A new IT joinee should be productive in 10 minutes.
5. **Everything is logged.** Full immutable audit trail + per‑asset and per‑person history. Nothing is silently overwritten.
6. **Built to last 5+ years.** Category/product taxonomy, soft‑deletes, financial‑year partitioned Drive folders, and reporting designed for a growing estate.

---

## 2. Domain model (the mental model)

Three layers keep data clean and entry fast:

```
Category            → what kind of thing        (Laptop, Monitor, Router, Phone, License, Cable…)
  └─ Product/Model  → reusable spec sheet       (Dell Latitude 5440, Logitech MX Master 3S)
       └─ Asset     → one physical unit         (Tag SL‑LAP‑2026‑0007, Serial 9XKJ2…)
```

Plus supporting entities: **Vendor**, **Purchase/Invoice**, **Location**, **Assignment (handover history)**, **Repair/Maintenance job**, **License** & **License Seat**, **Consumable** & **Consumable Transaction**, **Attachment** (Drive files), **Alert**, **Audit Log**.

An asset's life is a timeline of events — *received → assigned → returned → sent for repair → came back → reassigned → retired* — and IMS keeps every one of those, so you can answer "where has this laptop been and what has it cost us?" at a glance.

### Item type split
- **Serialized assets** — unique, tracked individually (laptops, monitors, phones, servers, network gear, printers, UPS…). Live in `ims_asset`.
- **Consumables / bulk stock** — quantity‑tracked, no serial (cables, adapters, toner, RAM sticks, screws). Live in `ims_consumable` with receive/issue transactions and min‑level alerts.
- **Software licenses / subscriptions** — seats, renewals, billing cycle. Live in `ims_license` + `ims_license_seat`.

### Repair / maintenance lifecycle (send‑out → return)
A first‑class flow, not an afterthought. When a laptop (or any asset) goes for repair:

- One click **"Send for repair"** → asset status becomes **In Repair**, and a **repair job** opens capturing: reported fault, who reported it, vendor/service centre, sent‑out date, **expected return date**, whether it's **warranty‑covered** or chargeable, estimated cost, and any docs (job‑sheet, quotation) auto‑filed to Drive.
- While out, the asset shows as unavailable (can't be allotted), and the person who had it can optionally be given a **temporary loaner** (tracked as its own assignment).
- **"Mark returned"** → captures actual return date, final cost, parts replaced, condition, outcome (**Repaired / Replaced / Beyond‑economic‑repair → Retire**). Asset flips back to In Stock or straight back to its owner.
- Every repair is retained as history, so each asset carries a running **repair count + total repair spend**, and IMS can flag "chronic" units (repaired ≥ N times or repair cost approaching replacement cost → *recommend replacement*).
- Lives in `ims_repair`. Repair costs feed the financial layer (§10).

---

## 3. Automation matrix (what fills itself in)

| Field | How it's automated |
|-------|--------------------|
| **Asset Tag** | Auto‑generated: `SL‑<CAT>‑<FY>‑<seq>` e.g. `SL‑LAP‑2026‑0042` (per‑category, per‑year sequence table). |
| **QR / Barcode** | Generated from the asset tag on save; printable label (QR + Code128). |
| **Specs** (CPU, RAM, size…) | Copied from the chosen Product/Model catalog; editable per unit only if needed. |
| **Status** | Derived from assignment/lifecycle state (In Stock → Assigned → In Repair → Retired / Lost). |
| **Assigned to (name/email/dept/team)** | Autofilled from `dim_person` when you pick or **scan** the employee; kept in sync. |
| **Warranty status / days left** | Computed from purchase date + warranty months. |
| **Age / in‑service duration** | Computed from purchase / in‑service date. |
| **Depreciation & current book value** | Straight‑line from cost + per‑category rate + purchase date. |
| **Location** | Defaults from last assignment / default store; auto‑updates on transfer. |
| **Invoice / bill link** | Auto‑uploaded to Drive; link stamped onto the asset(s) from its purchase. |
| **Created/Updated by + timestamps** | From the logged‑in SSO identity + audit log. |
| **Exit handling** | When `dim_person` goes inactive/exited, their assets auto‑flag "Pending return" (smart auto‑sync, mirrors People's org auto‑sync pattern). |

---

## 4. Scanner & label support (end‑to‑end)

- **USB barcode/QR scanners** act as keyboard‑wedge devices — they "type" the code + Enter. A **global Scan bar** (press `/` or the Scan button) is always focusable:
  - *Lookup mode:* scan serial/tag → jump straight to that asset.
  - *Intake mode:* scan serials to rapidly add a batch from one invoice.
  - *Allotment mode:* scan an asset, then scan/pick the employee → checkout done.
- **Phone camera scanning** in‑browser (`BarcodeDetector` API, with a JS fallback lib) for mobile stock‑takes and floor audits — no native app needed.
- **Label generation & printing** — IMS renders printable labels (QR encoding the asset URL + Code128 encoding the tag/serial), as Avery‑style sheets or single labels for a Zebra/Brother label printer. Lifecycle: *receive → auto‑tag → print label → stick → scan forever after.*
- **Stock‑take / audit mode** — walk the floor, scan everything, IMS reconciles "seen vs expected" and flags missing/misplaced units.

---

## 5. Google Drive auto‑filing

- Uses the existing service account (`SL_IT/secrets/google-service-account.json`) with Drive scope, against a configurable **root Shared Drive folder**.
- **Folder tree (auto‑created on demand, IDs cached in `ims_drive_folder`):**
  ```
  IMS Root/
    Invoices/    <FY 2026-27>/  <Category>/     ← purchase bills
    Warranties/  <Category>/                     ← warranty cards / AMC docs
    Handovers/   <FY>/                            ← signed allotment receipts
    Asset Photos/ <Category>/                     ← condition photos
    Licenses/    <Vendor>/                        ← license certificates / renewals
  ```
- On attaching a file, IMS ensures the folder path exists, uploads, sets link‑sharing (domain‑restricted preferred), and stores `drive_file_id` + `webViewLink`. Deleting an attachment in IMS optionally trashes the Drive file.
- Category‑wise + FY‑wise structure means clean archives that scale for years.

---

## 6. Roles & permissions (fresh)

Replace IT roles in `sl_platform.dim_role` (reuse IDs 9–11, add 18 — **IDs 12–17 belong to Planner; never touch 1–8**). **Superadmin is the common platform role that sits above every module** — it is *not* IMS‑specific and is not re‑created here; IMS simply grants it unconditional god‑access:

| Role code | Name | Can do |
|-----------|------|--------|
| `s_admin` (existing, ID 2) | **Superadmin** | **Common platform‑wide role — full, unconditional access to all of IMS and every other module. Bypasses every permission check and can do anything.** Shared across the platform; nothing in IMS can restrict it. |
| `ims_admin` | IMS Admin | Everything *within IMS*: config (categories, products, vendors, locations, depreciation, Drive settings), manage IMS roles, delete/retire, all reports. |
| `ims_manager` | IT Manager | View all, approve disposals/purchases, full reports & exports; no destructive config. |
| `ims_operator` | IT Staff | Day‑to‑day: add assets, scan, allot/return/transfer, repairs, receive stock, upload invoices. No config/delete. |
| `ims_viewer` | Auditor / Viewer | Read‑only + reports/exports. (dim_role id 18) |
| `user` (existing) | Employee self‑service | See **"My Assets"**, acknowledge handovers, request return/support. Reuses existing employee role — no new grant needed. |

**Role hierarchy:** `s_admin` (Superadmin) → `ims_admin` → `ims_manager` → `ims_operator` → `ims_viewer` → `user`. Superadmin short‑circuits every RBAC check (exactly as `has_required_role` already does today), so it always wins. RBAC is enforced both backend (route dependencies) **and** frontend (nav/route guards).

---

## 7. Screens (UX map)

```
┌ Dashboard        KPIs, alerts, warranty/renewal/low‑stock widgets, quick scan
├ Assets           grid (filters, saved views, CSV) · detail · Add‑Asset wizard
├ Allotments       check‑out / check‑in / transfer · handover receipts · history
├ Repairs          send‑out / track / return · warranty vs paid · repair spend · loaners
├ Purchases        vendors · invoices (auto‑Drive) · link assets to a bill
├ Licenses         subscriptions · seats · renewals · costs
├ Consumables      bulk stock · receive/issue · min‑level alerts
├ Finance          yearly spend, budget vs actual, next‑year projection (HW + SW)
├ Reports          by category/status/location/value/age · exports
├ My Assets        (every employee) what I hold + acknowledge handover
└ Admin/Settings   categories · products · vendors · locations · depreciation · budgets · Drive · roles
```

- **Add‑Asset wizard (the idiot‑proof core):** `Category → Model (autofills specs) → Scan Serial → Purchase/Invoice (optional) → Save`. Asset tag + QR generated automatically. A "Save & add another" for batch intake.
- **Grid UX** mirrors the People module conventions the team already knows: Table ⟷ Grouped views, column filters, saved views, CSV export, reset.
- Modern stack already in place: **Next.js 16 + React 18 + Tailwind + Radix (shadcn‑style) + lucide‑react + react‑hook‑form + zod**. Fully responsive/mobile for scanning. Dark‑mode aware.

---

## 8. Data schema — `sl_ims` (new)

Core tables (final columns settled during Phase 1):

- `ims_category` — name, code (tag prefix), default_depreciation_rate, default_warranty_months, item_kind (SERIALIZED/CONSUMABLE/LICENSE), is_active
- `ims_manufacturer` — brand master
- `ims_product` — category_id, manufacturer_id, model_name, specs(JSON), default warranty/deprec overrides
- `ims_vendor` — name, contact, GSTIN, support info
- `ims_location` — office/floor/store hierarchy
- `ims_asset` — asset_tag (unique), serial_number, product_id, category_id, status, condition, location_id, assigned_person_id/email/name, purchase_id, cost, warranty_start/end, in_service_date, retirement_date, specs_override(JSON), drive_folder_id, qr_payload, notes, soft‑delete + audit cols
- `ims_asset_assignment` — asset_id, person_*, action (CHECKOUT/CHECKIN/TRANSFER), assigned_at, returned_at, condition_out/in, handover_doc_url, acknowledged_at, by
- `ims_purchase` — vendor_id, invoice_number, invoice_date, currency, subtotal, tax, total, drive_folder_id, invoice_file_url, notes
- `ims_purchase_line` — purchase_id ↔ assets / qty / unit_cost (a single bill can cover many assets)
- `ims_repair` — asset_id, reported_fault, reported_by, vendor_id, sent_at, expected_return_at, returned_at, status (SENT/IN_PROGRESS/RETURNED/CANCELLED), outcome (REPAIRED/REPLACED/BER), warranty_covered (bool), cost, parts_replaced, loaner_asset_id, notes, drive_folder_id, by
- `ims_license` — name, vendor_id, type, billing_cycle, total_seats, cost, currency, renewal_date, registered_email, drive_folder_id, is_active
- `ims_license_seat` — license_id, person/asset, assigned_at, released_at
- `ims_consumable` — name, category_id, unit, current_qty, min_qty, location_id
- `ims_consumable_txn` — consumable_id, direction (IN/OUT), qty, person/ref, by, at
- `ims_attachment` — entity_type, entity_id, kind (INVOICE/WARRANTY/PHOTO/HANDOVER/LICENSE), filename, drive_file_id, web_view_link, by
- `ims_drive_folder` — path → drive_folder_id cache
- `ims_asset_sequence` — (category_code, fy) → last_number (tag generation)
- `ims_alert` — type, entity, due_date, status (or computed on the fly + a daily job)
- `ims_budget` — fy, category_id (nullable=all), planned_amount, notes (optional manual budget to compare actuals against)
- `ims_cost_event` — the money ledger: fy, month, cost_type (PURCHASE/REPAIR/LICENSE_RENEWAL/DISPOSAL), category_id, asset/license/purchase ref, amount, vendor_id, source (actual vs forecast). Powers all spend reports & projections. *(Can be a materialized rollup or a live view over purchases + repairs + licenses.)*
- `ims_audit_log` — actor, action, entity, before/after JSON, ip, request_id (same shape as today)

Soft‑deletes + `created_at/by`, `updated_at/by` on every table.

---

## 9. Smart / automatic behaviours

- **Warranty & AMC expiry alerts** (30/60/90 days) — dashboard + optional email digest.
- **License renewal reminders** — before `renewal_date`.
- **Low‑stock alerts** — consumables under `min_qty`.
- **Employee‑exit auto‑flag** — daily sync with `dim_person`; exited employees' assets → "Pending return" queue for IT.
- **Idle/unassigned high‑value flags** — expensive assets sitting In Stock too long.
- **Auto asset‑tag & QR** — zero manual numbering.
- **Auto depreciation roll** — current book value always live.
- Scheduled work runs as a small daily job (reusing the platform's job pattern).

---

## 10. Financials & forecasting (IT ERP‑lite)

The part that makes IMS behave like a proper ERP — but **scoped strictly to IT spend**. Every rupee that flows through IMS (purchases, repairs, license renewals, disposals) lands in one **cost ledger** (`ims_cost_event`), so the system can total the past and project the future without anyone maintaining a spreadsheet.

### What it tracks (actuals — automatic)
- **Hardware capex** — from every purchase/invoice.
- **Repair / maintenance opex** — from every repair job (warranty‑covered shown separately from out‑of‑pocket).
- **Software / subscription opex** — from license costs, normalised to an annual run‑rate (monthly × 12, annual as‑is).
- **Disposals / write‑offs** — retirement events (with residual value).
- Sliced by **financial year, month, category, vendor, team/department, and cost type**.

### What it projects (forecast — the "smart" bit)
- **Software renewals** — sums every subscription's cost by its `renewal_date`, so next FY's software bill is known months ahead ("₹X due to renew in Q2, ₹Y in Q3").
- **Hardware refresh** — using each category's **useful‑life / refresh cycle** (e.g. laptops every 4 yrs) + purchase dates + current age, IMS forecasts **how many units fall due for replacement each of the next 5 years** and estimates the cost from the latest known unit price. This directly answers *"what will IT need to spend next year and the year after?"*
- **Warranty cliff** — assets whose warranty expires soon → likely rising repair cost → feeds the repair budget.
- **Repair trend** — projects maintenance spend from historical repair run‑rate, and flags assets where *cumulative repair cost is approaching replacement cost* → "replace, don't repair."
- **Consumables burn** — projects reorder spend from issue‑rate.

### How it's shown
- A **Finance dashboard**: this‑FY spend to date, run‑rate, **budget vs actual** (if a budget is set in `ims_budget`), spend by category/vendor/team, and a **5‑year projected‑expense chart** split HW vs SW.
- **Exports** for Finance (CSV / print), and forecast lines are clearly marked *projected* vs *actual*.
- Assumptions (refresh cycles, unit prices, inflation %) are **admin‑tunable settings**, so projections stay honest as prices change.

> Scope guard: this is IT budgeting & forecasting, **not** general accounting — no GL, no payroll, no AP/AR. It answers "what did IT spend and what will IT spend," nothing more.

---

## 11. Dashboards & analytics (ERP‑grade visibility)

Not one dashboard — a **suite of role‑aware dashboards** giving every angle of the IT estate, with global filters, drill‑downs, and live calculations. Every tile is clickable → filters through to the underlying records.

### Global controls (on every dashboard)
- **Filters:** Financial Year, date range, category, sub‑type/product, status, location/office/floor, department/team, vendor, assignee, cost type. Filters combine and persist as **saved dashboard views**.
- **Drill‑down:** click any chart segment or KPI → opens the filtered record list behind it.
- **Compare:** period‑over‑period and **YoY** toggles.
- **Export / print / schedule:** any view to CSV/PDF, plus optional **scheduled email digest** (daily/weekly/monthly).
- **Role‑aware scope:** Superadmin/`ims_admin` see everything; `ims_manager` sees full read; department managers see their team's slice; employees see only "My Assets."

### The dashboards
1. **Executive Overview** — total assets & total current value, assigned vs available vs in‑repair vs retired, assets‑per‑employee coverage, category mix, this‑FY spend & run‑rate, open alerts count, top attention items.
2. **Asset Analytics** — counts/value by category · location · status; **age distribution** & **warranty‑status** breakdown; depreciation curve; oldest/highest‑value assets; utilization (assigned %).
3. **Allotment Analytics** — assets by department/team, **top holders**, recently issued/returned, unassigned high‑value gear, pending‑return (exits) queue.
4. **Repair Analytics** — repair volume & spend over time, **warranty‑covered vs paid**, mean time between repairs, **chronic assets** (replace‑vs‑repair), vendor turnaround & cost performance.
5. **Finance Dashboard** (from §10) — spend by category/vendor/team/month, **budget vs actual**, and the **5‑year HW+SW projection** chart, actual vs forecast clearly marked.
6. **License Analytics** — seat utilization (used vs idle), **upcoming renewals** timeline, cost per seat, unused/over‑provisioned licenses, spend by vendor.
7. **Consumables** — stock levels vs min, **burn rate**, items to reorder, issue trends by team.
8. **Compliance / Health** — assets missing serial/invoice/warranty data, out‑of‑warranty in active use, data‑completeness score (nudges toward "idiot‑proof" clean data).

### Calculations the engine provides
Totals, averages, rates & ratios (utilization, coverage, warranty %), trends & moving averages, YoY deltas, depreciation & current book value, TCO per asset (purchase + repairs over life), forecast lines, and budget variance — all computed server‑side and cached for speed.

### Build approach
Charts via a lightweight, self‑contained charting approach (no external CDN — consistent with platform CSP), theme/dark‑mode aware, responsive. A dashboard **spans phases**: the Executive + Asset views land early (P6), Finance/Repair/License analytics fill in as those modules ship, so visibility grows with the data.

---

## 12. Phased delivery

| Phase | Goal | Key output |
|-------|------|-----------|
| **P0 — Teardown & foundation** | Delete SL_IT ticketing app + drop `sl_it` schema; keep/trim scaffold (SSO, RBAC, audit, shell); create `sl_ims` schema; seed fresh IMS roles; flip Caddy `/it` route. **Verify nothing else breaks.** | Clean, running empty IMS shell you can log into via existing SSO. |
| **P1 — Core inventory** | Categories, products, vendors, locations, assets; auto asset‑tag + QR; Add‑Asset wizard; grid + detail; statuses; audit log. | Add & browse real assets. |
| **P2 — Allotment & scanning** | Global scan bar (USB + camera); check‑out/in/transfer; employee link to `dim_person`; label/QR printing; per‑asset & per‑person history; handover receipt PDF. | Fully scanner‑driven allotment. |
| **P3 — Repairs & purchases & Drive invoices** | Repair send‑out/return lifecycle + loaners + repair history/spend; vendor/purchase records; Google Drive service (auto folders + upload); attach invoices/warranties/job‑sheets; link one bill → many assets. | Repairs tracked end‑to‑end; every asset traceable to its bill on Drive. |
| **P4 — Licenses & consumables** | License/subscription tracking + seats + renewals; consumable stock with receive/issue + min‑level. | Software & bulk stock covered. |
| **P5 — Finance & forecasting (ERP‑lite)** | Cost ledger from purchases/repairs/licenses/disposals; Finance dashboard; budget vs actual; **5‑year HW+SW projection**; tunable refresh‑cycle/price assumptions; exports. | Yearly spend + projected expenses on tap. |
| **P6 — Dashboards, alerts & self‑service** | ERP‑grade dashboard suite (§11) with global filters/drill‑down/saved views — Executive + Asset + Allotment first, others as data lands; warranty/renewal/low‑stock/repair/exit alerts + daily job; employee **"My Assets"** + acknowledge. | Full visibility + the "smart, handles itself" layer. |
| **P7 — Polish** | Remaining analytics (Repair/License/Finance/Compliance), scheduled digests, saved views, CSV, mobile stock‑take/audit mode, docs & IT onboarding guide. | Production‑ready, MNC‑grade. |

Each phase is independently shippable and verified before the next.

---

## 13. Things you might be missing (recommendations)

1. **Handover acknowledgement / e‑sign** — employee taps "I received this" (or signs the PDF), giving IT an accountability trail on expensive gear. *(built into P2/P5)*
2. **Condition & photos at check‑in/out** — capture screen cracks/damage with a quick phone photo → Drive. Prevents disputes.
3. **Repair / RMA tracking** — ✅ now a first‑class flow (§2 repair lifecycle, `ims_repair`, P3): send‑out → return, warranty vs paid, loaners, repair history & spend, replace‑vs‑repair flag.
4. **Depreciation & book value** — makes IMS useful to Finance, not just IT; supports audits and write‑offs. Feeds the finance layer (§10).
5. **Disposal / e‑waste workflow** — proper retirement with reason, approval, and disposal certificate on Drive (compliance for 5‑year horizon).
6. **Stock‑take / audit mode** — periodic scan‑everything reconciliation (physical vs system).
7. **Warranty/AMC & insurance tracking** — dates + docs, with proactive alerts.
8. **Bulk import once** — a one‑time guided importer to load your current asset list (from the existing sheets / SL_People data) so IMS starts populated, not empty.
9. **Barcode on employee ID** (optional future) — scan the person too, for zero‑typing allotment.
10. **Later merge with SL_People** — when IMS is proven, migrate `system_inventory`/`peripheral_inventory`/licenses in and point People's Console at IMS as the single source of truth (explicitly deferred per your decision).

---

## 14. Open questions to confirm before P0 build

1. **Drive root folder** — which Shared Drive / folder should be the IMS root, and should invoice links be *domain‑restricted* (studiolotus.in only) or *anyone‑with‑link*?
2. **Category list & tag prefixes** — I'll propose a starter taxonomy (Laptop, Desktop, Monitor, Keyboard, Mouse, Docking, Phone, SIM, Server, Switch/Router, Firewall, Printer/Scanner, UPS, Storage/HDD/SSD, Projector/AV, Software License, Cable/Adapter, Consumable). You trim/add.
3. **Label printer** — do you have a Zebra/Brother label printer, or should labels target A4 Avery sheets?
4. **Depreciation rates** — default % per category (or a single default to start, tunable later)?
5. **Folder rename** — keep code folder as `SL_IT/` (less rewiring) or rename to `SL_IMS/` for clarity? *(Recommend keep `SL_IT/` for now.)*
6. **Refresh cycles for forecasting** — default useful‑life per category to drive the 5‑year projection (e.g. Laptop 4 yrs, Desktop 5, Monitor 6, Phone 3, Server 5, Network gear 6)? I'll seed sensible defaults you can tune.
7. **Financial year** — confirm April–March (Indian FY) for all yearly rollups and Drive folder naming.

---

*Prepared as the master plan. On approval, I start with **Phase 0 (teardown + foundation)** and verify zero breakage across the other modules before building any IMS feature.*
