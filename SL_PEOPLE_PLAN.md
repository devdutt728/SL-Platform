# SL_People — Complete Implementation Plan
### *The Operating Console — People · Org · Licenses · Systems · Groups*

> **Module**: SL_People (Operating Console)  
> **Status**: Pre-development · Planning locked  
> **Last updated**: 2026-06-02  
> **Source data**: `Emp Master.xlsx` (524 employees, 72 cols) · `Org Data.xlsx` (Master_Employees, Groups, Licenses, License_Inventory, Systems, Peripherals) · `Console.html` + `Code.gs` (reference UI and logic)

---

## Table of Contents

1. [Brutal Truths — Read First](#1-brutal-truths--read-first)
2. [Source Files Analysed](#2-source-files-analysed)
3. [Full Module Scope](#3-full-module-scope)
4. [Architecture Overview](#4-architecture-overview)
5. [Org Structure — How It Actually Works](#5-org-structure--how-it-actually-works)
6. [Database Schema — `sl_people`](#6-database-schema--sl_people)
7. [Backend API Routes — Port 8004](#7-backend-api-routes--port-8004)
8. [Frontend Pages](#8-frontend-pages)
9. [Key UI Components](#9-key-ui-components)
10. [RBAC Access Matrix](#10-rbac-access-matrix)
11. [Build Order — Phased Plan](#11-build-order--phased-plan)
12. [Data Seed Challenges & Fixes](#12-data-seed-challenges--fixes)
13. [Performance Guarantees](#13-performance-guarantees)
14. [Tech Stack](#14-tech-stack)
15. [Open Questions Before Build Starts](#15-open-questions-before-build-starts)

---

## 1. Brutal Truths — Read First

These are facts from analysis of all 3 reference files. Ignoring them will cause rework.

| Finding | Impact |
|---------|--------|
| **The org chart is NOT a simple manager → employee tree** | It is a 4-Principal → N-Groups → Members structure. The move operation changes a person's `Group Key`, not their `manager_id`. The entire org chart plan must change |
| **4 Principals** (Harsh Vardhan, Ambrish Arora, Ankur Choksi, Asha Sairam) each with a brand color | These are fixed at the top level. They do not move. The `org_principal` table seeds them once |
| **Groups are the planning unit** — `moveEmployee(empNo, newGroupKey)` in Code.gs writes `Group Key`, `Principal`, `Group / Team`, `Team Lead` in one atomic call | A "move" = group reassignment, not manager reassignment. The draft stores a proposed set of group key changes |
| **`Manager Override Emp No`** exists separately from HR `Source Manager Emp No` | The org chart uses an override manager that differs from the HR system manager. Both must be tracked independently |
| **`Include in Org`** boolean controls chart visibility | Admins can exclude an employee from the org chart without firing them. This must be a first-class editable flag |
| **Designation Level is derived from Job Title** — DESIGNATION_MAP has 9 levels with specific hex colors | Stored as computed columns in `org_employee`. Never manually entered. Re-computed on title change |
| **Experience is computed**: `SL Exp` = tenure since DOJ, `O Exp` = SL + Prior Exp | Computed at read time (like Code.gs does), stored in DB as floats for sort/filter |
| **This is a full Operating Console, not just an org module** | 5 tabs: People/Org · Licenses · Systems · Groups · Peripherals. ALL must be built |
| **417 of 524 employees are exited** — 4× more history than current headcount | 107 active is what the org chart uses. History is for HR master only |
| **Band (0.8%), Pay Grade (0%), Cost Center (0%), PF/UAN (0%)** are empty | Need manual fill-in after import. Not import errors |
| **PAN/Aadhaar = Indian PII** — encryption legally required | Fernet AES-256 at rest |
| **Employee #2 is a dummy** (`Dummy Employee`, `join@studiolotus.in`) | Filter during seed |

---

## 2. What Is Actually in the Excel

**Sheet**: `All Employees Master Data`  
**Rows**: 528 (3 header rows + 525 data rows, 1 dummy = **524 real records**)  
**Columns**: 72

### Employee Breakdown

| Status | Count |
|--------|-------|
| Currently Working | 107 |
| Relieved / Exited | 417 |
| **Total** | **524** |

| Worker Type (Active) | Count |
|----------------------|-------|
| Permanent | 100 |
| Intern | 7 |

### All 72 Columns with Fill Rates

| # | Column Name | Fill Rate | Notes |
|---|-------------|-----------|-------|
| 1 | Employee Number | 100% | Mixed format: SL0XXX (354) + integer (170) |
| 2 | First Name | 99.8% | |
| 3 | Middle Name | 14.3% | Sparse — optional field |
| 4 | Last Name | 99.8% | |
| 5 | Display Name | 99.8% | |
| 6 | Full Name | 99.8% | |
| 7 | Work Email | 99.8% | |
| 8 | Date Of Birth | 99.8% | |
| 9 | Gender | 99.8% | |
| 10 | Marital Status | 54.0% | |
| 11 | Marriage Date | 2.1% | Very sparse |
| 12 | Blood Group | 48.5% | |
| 13 | Physically Handicapped | 99.8% | Almost all "No" |
| 14 | Nationality | 25.6% | |
| 15 | Mobile Phone | 98.1% | |
| 16 | Work Phone | 18.9% | |
| 17 | Home Phone | 17.2% | |
| 18 | Personal Email | 42.2% | |
| 19 | Current Address Line 1 | 32.1% | |
| 20 | Current Address Line 2 | 20.4% | |
| 21 | Current Address City | 30.9% | |
| 22 | Current Address State | 30.7% | |
| 23 | Current Address Zip | 28.1% | |
| 24 | Current Address Country | 30.9% | |
| 25 | Permanent Address Line 1 | 32.6% | |
| 26 | Permanent Address Line 2 | 20.6% | |
| 27 | Permanent Address City | 31.7% | |
| 28 | Permanent Address State | 31.7% | |
| 29 | Permanent Address Zip | 30.0% | |
| 30 | Permanent Address Country | 31.5% | |
| 31 | Father Name | 2.5% | |
| 32 | Mother Name | 1.5% | |
| 33 | Spouse Name | 1.0% | |
| 34 | Children Names | 0.4% | |
| 35 | Attendance Number | 85.9% | |
| 36 | Location | 99.8% | All: Studio Lotus Office - Delhi |
| 37 | Location Country | 99.8% | All: India |
| 38 | Legal Entity | 99.8% | All: Tac Design Private Limited |
| 39 | Business Unit | 99.6% | Studio Lotus, Unit 1–4 |
| 40 | Department | 99.6% | 6 departments |
| 41 | Sub Department | 13.2% | 5 sub-departments |
| 42 | Job Title | 99.6% | 30 unique titles (active) |
| 43 | Secondary Job Title | 0.2% | Essentially empty |
| 44 | Reporting To | 99.6% | Manager name (display only) |
| 45 | Reporting Manager Employee Number | 99.6% | **The actual FK to use** — SL0XXX format |
| 46 | Dotted Line Manager | 0.0% | Empty — skip for v1 |
| 47 | Date Joined | 99.6% | |
| 48 | Leave Plan | 99.8% | |
| 49 | Band | 0.8% | Only 1 record has value ('L3') |
| 50 | Pay Grade | 0.0% | **Completely empty** |
| 51 | Time Type | 99.8% | All: FullTime |
| 52 | Worker Type | 99.8% | Permanent / Intern / Contract |
| 53 | Shift Policy Name | 99.6% | |
| 54 | Weekly Off Policy Name | 99.8% | |
| 55 | Attendance Time Tracking Policy | 99.6% | |
| 56 | Attendance Capture Scheme | 99.8% | |
| 57 | Holiday List Name | 99.8% | |
| 58 | Expense Policy Name | 19.5% | |
| 59 | Notice Period | 99.6% | |
| 60 | PAN Number | 17.9% | **PII — must encrypt** |
| 61 | Aadhaar Number | 1.5% | **PII — must encrypt** |
| 62 | PF Number | 0.0% | Empty |
| 63 | UAN Number | 0.0% | Empty |
| 64 | Employment Status | 99.8% | Working / Relieved |
| 65 | Exit Date | 79.4% | Filled only for exited employees |
| 66 | Comments | 70.2% | |
| 67 | Exit Status | 79.4% | Completed / In Progress |
| 68 | Termination Type | 79.4% | Employee Resignation, etc. |
| 69 | Termination Reason | 79.4% | Resignation / Other |
| 70 | Resignation Note | 0.0% | Empty |
| 71 | Cost Center | 0.0% | **Completely empty** |
| 72 | Pan Card Number | 57.1% | Duplicate of col 60 — deduplicate on import |

### Org Hierarchy (Active Employees)
- **Single root**: Ambrish Arora — Principal
- **107 active nodes** — React Flow handles this with no performance concern
- **Manager links**: 521 of 523 are SL0XXX format, 1 is "Not Available" (only unresolvable)
- **Depth**: Architecture firm hierarchy — typically 4–6 levels deep

### Reference Data (Active Employees)

**Departments**: Architecture Unit 1 · Interior Design Unit 3 · Interior Design Unit 4 · Project Management Unit 1 · Residential & Commercial ID & Arch - Unit 2 · Unit Support

**Sub-Departments** (active): Business Development & Marketing · Finance and Accounts · Human Resource and Administration · Information Technology · Management

**Business Units**: Studio Lotus · Unit 1 · Unit 2 · Unit 3 · Unit 4

**Job Titles (active)**: 3D Artist · Accounts Executive · Administrator Human Resources · Architect · Assistant Manager - Accounts · Associate Principal · Communications Executive · Cook · Designer · Group Leader · Head - Human Resources · Head Finance and Accounts · Intern · Manager (Information Technology) · Manager Administration · Office Manager · Office Support · Principal · Project Architect · Project Designer · Project Lead · Senior Manager - IT · Senior Manager - Business Development · Senior Manager - Human Resources · Senior Software Engineer (Data Platform) · Sr. Architect · Sr. Designer · Team Lead · Trainee

---

## 3. Full Module Scope

The Console.html + Code.gs reference files reveal this is a **full Operating Console** — 5 modules in one app:

| Tab | What it manages | Source data |
|-----|-----------------|-------------|
| **People / Org** | Group-based org chart, drag-drop moves, employee profiles | `Master_Employees` + `Groups` sheets |
| **Licenses** | Software license assignments per person, renewal tracking | `Licenses` + `License_Inventory` sheets |
| **Systems** | PC inventory, auto-graded by CPU/GPU/RAM score, upgrade suggestions | `Systems` sheet |
| **Peripherals** | Projectors, printers, peripherals — condition + assignment | `Peripherals` sheet |
| **Groups** | Group overview: headcount, tool counts, system tier breakdown per team | Aggregated from all the above |

All 5 tabs are part of SL_People. Not optional. The Console.html already has all of them working in Google Sheets — we are porting + extending into the platform.

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Caddy Proxy — port 3000                    │
│  /api/ppl*  → localhost:8004  (new SL_People backend)       │
│  /people*   → localhost:3003  (existing Workbook frontend)  │
│  /api/auth  → existing auth backends                        │
└─────────────────────────────────────────────────────────────┘
             │                          │
             ▼                          ▼
  ┌──────────────────┐      ┌───────────────────────┐
  │  SL_People       │      │  SL_Workbook frontend │
  │  FastAPI         │      │  Next.js 14           │
  │  port 8004       │      │  port 3003            │
  │  schema:         │      │  NEW routes:          │
  │  sl_people       │      │  /people/*            │
  └──────────────────┘      └───────────────────────┘
             │
             ▼
  ┌──────────────────────────────────────────────────────┐
  │  PostgreSQL                                          │
  │  sl_platform.dim_person  ← IDENTITY ANCHOR (RO)     │
  │    person_id, person_code (= SL0XXX), email,        │
  │    first_name, last_name, full_name, display_name,  │
  │    mobile_number, role_id, status, is_deleted       │
  │                                                      │
  │  sl_people schema (12 tables, new)                  │
  │    employee_ext  → links via person_code = SL0XXX  │
  │    + address, policy, compliance, exit, audit_log   │
  │    + org_node, org_draft, org_change_log            │
  │    + sheet_import_job, people_access_grant          │
  └──────────────────────────────────────────────────────┘
```

### Key architectural decision — dim_person IS the identity layer

`sl_platform.dim_person.person_code` = the SL0XXX employee number from the Excel. This is confirmed by the existing `admin.py` bulk-upload code which requires `person_code` on every create.

**What `dim_person` already stores (do NOT duplicate):**
`person_id` · `person_code` (SL0XXX) · `email` · `first_name` · `last_name` · `full_name` · `display_name` · `mobile_number` · `status` · `role_id` · `is_deleted`

**What `dim_person` intentionally does NOT store** (HR data, not identity data):
DOB · gender · marital status · blood group · addresses · departments · job title · manager · joining date · PAN/Aadhaar · exit info · HR policies · band · cost centre

The extension tables in `sl_people` carry only the HR-specific fields. The join key is always `dim_person.person_code = sl_people.employee_ext.employee_number`.

**Rule**: Never add columns to `dim_person`. It is shared read-only infrastructure used by IT, Recruitment, and Workbook. Any mutation to it goes through the existing admin endpoint.

**Employees NOT in dim_person** (exited staff, interns with no platform account):
These rows exist only in `sl_people.employee_ext` with `person_id = NULL`. They are imported from Excel but cannot log in. This is correct — they are historical records, not platform users.

**No new Next.js app.** The SL_Workbook frontend (already on port 3003) gains new `/people/*` routes. This avoids a 4th frontend process, shares the existing auth cookie (`slp_token`), and keeps the workbook as the hub.

**New Caddy entries** to add to `Caddyfile`:
```
/api/ppl* → localhost:8004
```
(The `/people*` path already falls through to 3003 via the catch-all.)

**New start-all.cmd entries**:
- Spawn `SL_People/backend` as Uvicorn on port 8004
- Add to ports killed on restart (8004)

### Google Sheets Live Sync (Code.gs pattern)

The same automation pattern used for recruitment candidate ingestion can be applied to the employee master. A Google Sheet maintained by HR can push updates to the People module automatically:

```
HR edits Employee Master Google Sheet
         ↓  (onChange trigger or scheduled every 5 min)
Code.gs reads changed rows → POST /api/ppl/import/sheet-sync
         ↓
Backend upserts employee_ext rows + logs to sheet_import_job
         ↓
Sheet rows get status column written back: synced | error | duplicate
```

This is identical in structure to `google_sheet_ingest.gs` in SL_Recruitment. The same `SHEET_INGEST_TOKEN` pattern applies. This means HR does not need to use the app's import wizard at all — they just update the sheet they already know, and it flows in automatically.

---

## 5. Org Structure — How It Actually Works

> This section is critical. The org chart is **not a reporting tree**. Getting this wrong means rebuilding the whole feature.

### The 3-tier hierarchy

```
Principal (4 fixed)
  └── Group / Team  (N groups per principal, each has a Team Lead)
        └── Member  (employees, draggable between groups)
```

**Example** (from `Org Data.xlsx`):

```
Harsh Vardhan (Principal, #244C66)
  ├── Finance & Accounts  [HARSH-FINANCE]  Lead: Rajendra Kumar Mohanty
  │     ├── Aman Jha · Accounts Executive
  │     └── Nirmal Singh · Assistant Manager Accounts
  ├── People & Culture  [HARSH-PEOPLE]   Lead: Isha Singh
  ├── BD & Comms  [HARSH-BD]             Lead: Amita Goel
  ├── IT & Tech  [HARSH-IT]              Lead: Devdutt Kumar
  └── Admin & Infra  [HARSH-ADMIN]       Lead: Kavita Chatola

Ambrish Arora (Principal, #B75C35)
  ├── Direct Reports  [AMB-DIRECT]       Lead: Ambrish Arora
  ├── Prajwal Yashwant Amin Team  [AMB-PRAJWAL]
  ├── Varun Srivastava Team  [AMB-VARUN]
  └── Yatin Tokas Team  [AMB-YATIN]

Ankur Choksi (Principal, #3F7D62)
  ├── Direct Reports  [ANKUR-DIRECT]
  ├── Prashant Bharadwaj Team  [ANKUR-PRASHANT]
  └── Swati Seshadri Team  [ANKUR-SWATI]

Asha Sairam (Principal, #6B5598)
  ├── Direct Reports  [ASHA-DIRECT]
  ├── Insiya Pithawala Team  [ASHA-INSIYA]
  ├── Neelam Das Team  [ASHA-NEELAM]
  └── Randhir Kumar Team  [ASHA-RANDHIR]
```

### What a "move" actually is

From `Code.gs → moveEmployee(employeeNo, newGroupKey)`:
```javascript
// Writes 4 fields to Master_Employees:
sheet.getRange(row, idx['Group Key'] + 1).setValue(newGroupKey);      // ← the key field
sheet.getRange(row, idx['Principal'] + 1).setValue(g.principal);      // derived from group
sheet.getRange(row, idx['Group / Team'] + 1).setValue(g.name);        // derived from group
sheet.getRange(row, idx['Team Lead'] + 1).setValue(g.teamLead);       // derived from group
```

A move = **change a person's Group Key**. Everything else is derived from the Group definition. No tree traversal. No recursive CTE. Just a group key update.

### The Draft System (new — does not exist in the GSheet version)

The current Google Sheet commits moves immediately. We add:
```
Edit mode ON → user drags person to new group
              → local state updated immediately (optimistic, same as Console.html)
              → changes queued as {empNo → newGroupKey} diff
              → "Save to Draft [1/2/3]" → stored as JSONB diff in org_draft
              → "Preview vs Live" → show who moved where
              → "Publish" → write to org_assignment table + org_change_log
              → "Revert" → reload any past org_change_log snapshot
```

### Designation Level System (from DESIGNATION_MAP in Code.gs)

| Job Title Match | Level Label | Color | Order |
|-----------------|-------------|-------|-------|
| Principal | Principal | `#1A2332` | 1 |
| Associate Principal | Associate Principal | `#2E4057` | 2 |
| Sr. Associate / Senior Associate | Senior Associate | `#3F5260` | 3 |
| Group Leader / Project Lead | Group Leader | `#475E4A` | 4 |
| Associate | Associate | `#5D7A52` | 5 |
| Project Architect / Project Designer | Project Architect/Designer | `#8A4A35` | 6 |
| Sr. Architect / Senior Architect / Sr. Designer / Senior Designer | Senior Architect/Designer | `#A4853D` | 7 |
| Architect / Designer | Architect/Designer | `#5D4156` | 8 |
| Intern | Intern | `#97A0AB` | 9 |
| (anything else) | Support | `#707A87` | 99 |

Designation level and color are **always computed from Job Title** — never entered manually. Stored as `designation_level` and `designation_color` in `org_employee`, refreshed when job title changes.

### Experience Computation (from Code.gs `computeExperience_`)

```
SL Exp (years) = (today - DOJ) / 365.25    ← displayed as "3.2 yrs"
O Exp (years)  = SL Exp + Prior Exp (yrs)  ← total career experience
```

Both computed at read time, returned in API, displayed on person cards. Stored in DB as floats for sort/filter.

### `Include in Org` Flag

A boolean per employee. When false, the person is excluded from the org chart entirely (does not appear in any group) but remains in the employee master. Admins can toggle this.

### Manager Override vs Source Manager

| Field | Source | Purpose |
|-------|--------|---------|
| `Source Reports To` / `Source Manager Emp No` | HR master (Emp Master.xlsx) | HR reporting line for payroll/leave |
| `Manager Override Emp No` | Org chart (manually set) | Who they actually report to in the org chart (may differ from HR) |

The org chart only uses `Manager Override` (when set) or derives from the Group's Team Lead. HR manager is stored separately, never shown in the org chart unless no override exists.

---

## 6. Database Schema — `sl_people`

> All tables are in the `sl_people` schema.  
> Cross-schema join to `sl_platform.dim_person` is **read-only** and keyed on `person_code = employee_number`.  
> `dim_person` is never mutated by SL_People — it is owned by the platform/admin module.

---

### Table 1 — `employee_ext`
*HR extension of `dim_person`. One row per employee, ever. The join key to dim_person is `employee_number = dim_person.person_code`.*

```sql
CREATE TABLE sl_people.employee_ext (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_number         VARCHAR(20) UNIQUE NOT NULL,
    -- canonical key: SL0XXX for modern employees, LEGACY-NNN for integer-format legacy records
    -- LINKS TO: sl_platform.dim_person.person_code
    person_id               VARCHAR(64) UNIQUE,
    -- FK sl_platform.dim_person.person_id — nullable for historical employees with no platform account
    legacy_number           VARCHAR(20),
    -- original integer employee number if record predates the SL0XXX format
    attendance_number       VARCHAR(20),
    employment_status       VARCHAR(20) NOT NULL DEFAULT 'working',
    -- ENUM: working | relieved | terminated
    worker_type             VARCHAR(20) NOT NULL DEFAULT 'permanent',
    -- ENUM: permanent | contract | intern | trainee
    time_type               VARCHAR(20) NOT NULL DEFAULT 'fulltime',
    -- ENUM: fulltime | parttime
    is_deleted              BOOLEAN     NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_person_id    VARCHAR(64),
    updated_by_person_id    VARCHAR(64)
);

CREATE INDEX ON sl_people.employee_ext (employment_status);
CREATE INDEX ON sl_people.employee_ext (person_id);
CREATE INDEX ON sl_people.employee_ext (employee_number);
```

**Why `person_id` is nullable**: 417 of 524 employees are exited. Most were never given platform accounts. They exist in the Excel (and must be importable) but do not exist in `dim_person`. `person_id = NULL` means "historical record, no login capability."

**The resolved join at query time**:
```sql
SELECT
    dp.person_id, dp.person_code, dp.first_name, dp.last_name,
    dp.email, dp.full_name, dp.display_name, dp.mobile_number,
    dp.status AS platform_status,
    ee.employment_status, ee.worker_type, ee.attendance_number
FROM sl_people.employee_ext ee
LEFT JOIN sl_platform.dim_person dp ON dp.person_code = ee.employee_number
WHERE ee.employment_status = 'working'
```

**No duplication** of name, email, phone — those come from `dim_person` at query time. `employee_ext` holds only what `dim_person` never tracks.

---

### Table 2 — `employee_hr`
*HR-specific personal fields not in dim_person. PII section.*

```sql
CREATE TABLE sl_people.employee_hr (
    employee_id             UUID        PRIMARY KEY
                            REFERENCES sl_people.employee_ext(id) ON DELETE CASCADE,
    -- dim_person already has: first_name, last_name, email, mobile_number, full_name, display_name
    -- We store ONLY what dim_person does NOT have:
    middle_name             VARCHAR(100),
    personal_email          VARCHAR(255),
    work_phone              VARCHAR(30),
    home_phone              VARCHAR(30),
    date_of_birth           DATE,
    gender                  VARCHAR(20),
    marital_status          VARCHAR(30),
    marriage_date           DATE,
    blood_group             VARCHAR(20),
    physically_handicapped  BOOLEAN DEFAULT false,
    nationality             VARCHAR(100),
    father_name             VARCHAR(255),
    mother_name             VARCHAR(255),
    spouse_name             VARCHAR(255),
    children_names          TEXT,
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Table 3 — `employee_address`
*Current and permanent addresses. Two rows per employee.*

```sql
CREATE TABLE sl_people.employee_address (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID        NOT NULL
                    REFERENCES sl_people.employee_ext(id) ON DELETE CASCADE,
    address_type    VARCHAR(20) NOT NULL,   -- 'current' | 'permanent'
    line1           VARCHAR(255),
    line2           VARCHAR(255),
    city            VARCHAR(100),
    state           VARCHAR(100),
    zip             VARCHAR(20),
    country         VARCHAR(100),
    UNIQUE(employee_id, address_type)
);
```

---

### Table 4 — `employee_work_info`
*Org positioning, reporting structure, job details. `reporting_manager_id` links to another `employee_ext` row.*

```sql
CREATE TABLE sl_people.employee_work_info (
    employee_id                 UUID        PRIMARY KEY
                                REFERENCES sl_people.employee_ext(id) ON DELETE CASCADE,
    location                    VARCHAR(255),
    location_country            VARCHAR(100),
    legal_entity                VARCHAR(255),
    business_unit               VARCHAR(100),
    department                  VARCHAR(100),
    sub_department              VARCHAR(100),
    job_title                   VARCHAR(255),
    secondary_job_title         VARCHAR(255),
    reporting_manager_id        UUID        REFERENCES sl_people.employee_ext(id) ON DELETE SET NULL,
    dotted_line_manager_id      UUID        REFERENCES sl_people.employee_ext(id) ON DELETE SET NULL,
    date_joined                 DATE,
    exit_date                   DATE,
    notice_period               VARCHAR(100),
    band                        VARCHAR(50),
    pay_grade                   VARCHAR(50),
    cost_center                 VARCHAR(100),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON sl_people.employee_work_info (department);
CREATE INDEX ON sl_people.employee_work_info (business_unit);
CREATE INDEX ON sl_people.employee_work_info (reporting_manager_id);
```

---

### Table 5 — `employee_policy`
*HR-assigned policies: leave, shift, attendance, holidays.*

```sql
CREATE TABLE sl_people.employee_policy (
    employee_id                     UUID PRIMARY KEY
                                    REFERENCES sl_people.employee_ext(id) ON DELETE CASCADE,
    leave_plan                      VARCHAR(255),
    shift_policy                    VARCHAR(255),
    weekly_off_policy               VARCHAR(255),
    attendance_tracking_policy      VARCHAR(255),
    attendance_capture_scheme       VARCHAR(255),
    holiday_list                    VARCHAR(255),
    expense_policy                  VARCHAR(255),
    updated_at                      TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Table 6 — `employee_compliance`
*Government IDs — all values encrypted at rest with Fernet AES-256.*

```sql
CREATE TABLE sl_people.employee_compliance (
    employee_id         UUID        PRIMARY KEY
                        REFERENCES sl_people.employee_ext(id) ON DELETE CASCADE,
    pan_enc             TEXT,       -- Fernet-encrypted PAN number
    aadhaar_enc         TEXT,       -- Fernet-encrypted Aadhaar number
    pf_number_enc       TEXT,       -- Fernet-encrypted PF number
    uan_number_enc      TEXT,       -- Fernet-encrypted UAN number
    updated_at          TIMESTAMPTZ,
    updated_by_person_id VARCHAR(64)
);
```

> **Encryption key**: `SL_PEOPLE_ENCRYPTION_KEY` in `.env`. Generated with `Fernet.generate_key()`.  
> Access to this table is restricted to **admin** role only. Every read is logged in `employee_audit_log` with action `compliance_viewed`.

---

### Table 7 — `employee_exit`
*Exit and termination data. Only populated for relieved/terminated employees.*

```sql
CREATE TABLE sl_people.employee_exit (
    employee_id         UUID        PRIMARY KEY
                        REFERENCES sl_people.employee_ext(id) ON DELETE CASCADE,
    exit_status         VARCHAR(100),       -- Completed | In Progress
    termination_type    VARCHAR(100),       -- Employee Resignation | etc.
    termination_reason  VARCHAR(100),
    resignation_note    TEXT,
    comments            TEXT,
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Table 8 — `employee_audit_log`
*Immutable. Every field change is a new row. Never updated, only inserted.*

```sql
CREATE TABLE sl_people.employee_audit_log (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id             UUID        NOT NULL
                            REFERENCES sl_people.employee_ext(id) ON DELETE CASCADE,
    performed_by_person_id  VARCHAR(64) NOT NULL,
    performed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    section                 VARCHAR(50) NOT NULL,
                            -- profile | work_info | address | compliance | exit | policy | status
    field_name              VARCHAR(100) NOT NULL,
    old_value               TEXT,
    new_value               TEXT,
    ip_address              VARCHAR(45)
);

CREATE INDEX ON sl_people.employee_audit_log (employee_id, performed_at DESC);
CREATE INDEX ON sl_people.employee_audit_log (performed_by_person_id, performed_at DESC);
```

---

### Table 9 — `org_principal`
*The 4 fixed principals. Seeded once from Code.gs ORG_CONFIG. Never changes via UI.*

```sql
CREATE TABLE sl_people.org_principal (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) UNIQUE NOT NULL,   -- 'Harsh Vardhan', 'Ambrish Arora', etc.
    color       VARCHAR(7) NOT NULL,            -- '#244C66', '#B75C35', '#3F7D62', '#6B5598'
    employee_no VARCHAR(20),                    -- their own SL0XXX
    sort_order  INT DEFAULT 0
);
```

---

### Table 10 — `org_group`
*The teams/groups. Each belongs to a Principal, has a Team Lead.*

```sql
CREATE TABLE sl_people.org_group (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_key       VARCHAR(50) UNIQUE NOT NULL,  -- 'HARSH-HOMES', 'AMB-PRAJWAL', etc.
    name            VARCHAR(100) NOT NULL,         -- 'Homes', 'Finance & Accounts', etc.
    principal_name  VARCHAR(100) NOT NULL,         -- FK by name to org_principal
    team_lead_emp   VARCHAR(20),                   -- employee_no of Team Lead
    parent_name     VARCHAR(100),                  -- principal name (parent)
    color_hex       VARCHAR(7),                    -- '#E3EEF4' (pastel per group)
    sort_order      INT DEFAULT 0,
    is_active       BOOLEAN DEFAULT true
);

CREATE INDEX ON sl_people.org_group (principal_name);
```

---

### Table 11 — `org_employee`
*Live org chart assignment. One row per included employee. This is what the org chart reads.*

```sql
CREATE TABLE sl_people.org_employee (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_no             VARCHAR(20) UNIQUE NOT NULL,
    -- LINKS TO: employee_ext.employee_number AND dim_person.person_code
    group_key               VARCHAR(50) NOT NULL
                            REFERENCES sl_people.org_group(group_key) ON DELETE RESTRICT,
    principal_name          VARCHAR(100) NOT NULL,       -- denormalised for fast reads
    org_level               VARCHAR(20) NOT NULL,        -- Principal | Team Lead | Member | Excluded
    include_in_org          BOOLEAN NOT NULL DEFAULT true,
    source_manager_emp      VARCHAR(20),                 -- from HR system (read-only display)
    manager_override_emp    VARCHAR(20),                 -- explicit org override (writable)
    designation_level       VARCHAR(50),                 -- computed from job title
    designation_color       VARCHAR(7),                  -- computed from job title
    designation_order       INT,                         -- sort within groups (1–99)
    prior_exp_years         NUMERIC(5,2),                -- years before joining SL
    image_url               TEXT,
    notes                   TEXT,
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_by_person_id    VARCHAR(64)
);

CREATE INDEX ON sl_people.org_employee (group_key);
CREATE INDEX ON sl_people.org_employee (principal_name);
CREATE INDEX ON sl_people.org_employee (include_in_org);
```

> `designation_level` and `designation_color` are computed from the job title using the `DESIGNATION_MAP` logic from Code.gs. Re-computed whenever job title changes. Never entered manually.

---

### Table 12 — `org_draft`
*Up to 3 named draft slots. Stores the proposed set of group key changes as a diff, not the full tree.*

```sql
CREATE TABLE sl_people.org_draft (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_number     SMALLINT    NOT NULL CHECK (slot_number BETWEEN 1 AND 3),
    draft_name      VARCHAR(100) NOT NULL,
    moves_json      JSONB       NOT NULL,
    -- [{empNo, name, fromGroupKey, fromPrincipal, toGroupKey, toPrincipal}]
    full_snapshot   JSONB       NOT NULL,
    -- complete org state at time of save (for preview/revert)
    base_log_id     UUID        REFERENCES sl_people.org_change_log(id) ON DELETE SET NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | archived
    created_by      VARCHAR(64),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_by      VARCHAR(64),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(slot_number)
);
```

---

### Table 13 — `org_change_log`
*Immutable. Every publish and revert creates a new row.*

```sql
CREATE TABLE sl_people.org_change_log (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    action                  VARCHAR(20) NOT NULL,       -- publish | revert
    performed_by_person_id  VARCHAR(64) NOT NULL,
    performed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    draft_name              VARCHAR(100),
    snapshot_before         JSONB,                      -- full org state before
    snapshot_after          JSONB NOT NULL,             -- full org state after
    diff_summary            JSONB,
    -- [{empNo, name, fromGroupKey, fromPrincipal, toGroupKey, toPrincipal}]
    reverted_from_log_id    UUID REFERENCES sl_people.org_change_log(id)
);

CREATE INDEX ON sl_people.org_change_log (performed_at DESC);
```

---

### Table 14 — `license_assignment`
*Who holds what software license. From `Licenses` sheet.*

```sql
CREATE TABLE sl_people.license_assignment (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    work_email      VARCHAR(255) NOT NULL,
    tool_name       VARCHAR(255) NOT NULL,
    tool_short_name VARCHAR(100),                  -- normalised via shortNameFor_ logic
    plan            VARCHAR(255),                  -- 'Autodesk single-user', etc.
    status          VARCHAR(50) DEFAULT 'Assigned', -- Assigned | Revoked
    assigned_on     DATE,
    renewal_date    DATE,
    cost_centre     VARCHAR(100),
    notes           TEXT,
    smart_key       VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON sl_people.license_assignment (work_email);
CREATE INDEX ON sl_people.license_assignment (tool_short_name);
```

---

### Table 15 — `license_contract`
*Software license inventory. From `License_Inventory` sheet.*

```sql
CREATE TABLE sl_people.license_contract (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_key    VARCHAR(50) UNIQUE NOT NULL,   -- 'INV-001', 'INV-002', etc.
    entity          VARCHAR(255),                  -- 'TAC Design (Studio Lotus)'
    software        VARCHAR(255) NOT NULL,
    short_name      VARCHAR(100),
    category        VARCHAR(100),
    contract_no     VARCHAR(100),
    contract_type   VARCHAR(50),                   -- Subscription | Perpetual
    serial_no       VARCHAR(100),
    seats           INT DEFAULT 0,
    vendor          VARCHAR(255),
    start_date      DATE,
    end_date        DATE,
    cost            NUMERIC(10,2),
    currency        VARCHAR(10) DEFAULT 'INR',
    status          VARCHAR(50),                   -- Active | Expired | Expiring Soon
    user_type       VARCHAR(50),
    notes           TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON sl_people.license_contract (software);
CREATE INDEX ON sl_people.license_contract (end_date);
```

---

### Table 16 — `system_inventory`
*PC/workstation inventory. From `Systems` sheet.*

```sql
CREATE TABLE sl_people.system_inventory (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id           VARCHAR(30) UNIQUE NOT NULL,  -- 'LDS-02', 'LDS-03', etc.
    system_type         VARCHAR(30),                  -- Desktop | Laptop
    assigned_email      VARCHAR(255),
    user_display        VARCHAR(100),
    team                VARCHAR(100),
    processor           VARCHAR(255),
    ram_gb              NUMERIC(6,1),
    ram_slots_free      VARCHAR(30),
    graphics_card       VARCHAR(255),
    cpu_cores           VARCHAR(50),
    storage             TEXT,
    motherboard         VARCHAR(255),
    os                  VARCHAR(100),
    autocad_version     VARCHAR(100),
    sketchup_version    VARCHAR(100),
    adobe_versions      TEXT,
    office_version      VARCHAR(100),
    composite_score     INT,                          -- computed 0–100 (CPU×0.32 + GPU×0.40 + RAM×0.28)
    capability_tier     VARCHAR(30),                  -- Workstation | Performance | Standard | Basic | Entry
    upgrade_suggestion  TEXT,
    status              VARCHAR(30) DEFAULT 'Active', -- Active | Retired | Faulty | In Repair
    notes               TEXT,
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON sl_people.system_inventory (assigned_email);
CREATE INDEX ON sl_people.system_inventory (capability_tier);
```

**Capability Tier thresholds** (from Code.gs `gradePc_`):

| Composite Score | Tier |
|-----------------|------|
| ≥ 80 | Workstation |
| ≥ 62 | Performance |
| ≥ 44 | Standard |
| ≥ 28 | Basic |
| < 28 | Entry |

Score = `CPU×0.32 + GPU×0.40 + RAM×0.28`. Stored in DB, re-computed on any spec change.

---

### Table 17 — `peripheral_inventory`
*Projectors, printers, peripherals. From `Peripherals` sheet.*

```sql
CREATE TABLE sl_people.peripheral_inventory (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id     VARCHAR(30) UNIQUE NOT NULL,   -- 'PROJ-01', 'PRINT-01', etc.
    category    VARCHAR(100),                  -- Projector | Printer | UPS | etc.
    item        TEXT NOT NULL,                 -- full item description
    model       VARCHAR(255),
    serial      VARCHAR(100),
    quantity    INT DEFAULT 1,
    condition   VARCHAR(50),                   -- Good | Faulty | In Repair
    location    VARCHAR(255),
    assigned_to VARCHAR(255),
    status      VARCHAR(50) DEFAULT 'Active',  -- Active | Faulty | Retired | Disposed
    notes       TEXT,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Table 18 — `sheet_import_job`
*Tracks every Excel/CSV import attempt.*

```sql
CREATE TABLE sl_people.sheet_import_job (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source          VARCHAR(50),            -- 'emp_master' | 'org_data' | 'licenses' | 'systems'
    filename        VARCHAR(255),
    total_rows      INT,
    success_rows    INT         DEFAULT 0,
    error_rows      INT         DEFAULT 0,
    column_mapping  JSONB,
    error_log       JSONB,
    performed_by    VARCHAR(64),
    performed_at    TIMESTAMPTZ DEFAULT NOW(),
    status          VARCHAR(20) DEFAULT 'pending'
);
```

---

### Table 19 — `people_access_grant`
*Fine-grained RBAC.*

```sql
CREATE TABLE sl_people.people_access_grant (
    person_id       VARCHAR(64) PRIMARY KEY,
    access_level    VARCHAR(20) NOT NULL,   -- view | edit | admin
    granted_by      VARCHAR(64),
    granted_at      TIMESTAMPTZ DEFAULT NOW(),
    notes           TEXT
);
```

---

### Migration File Order

```
migrations/
  0001_create_schema.sql
  0002_employee_ext.sql
  0003_employee_hr.sql
  0004_employee_address.sql
  0005_employee_work_info.sql
  0006_employee_policy.sql
  0007_employee_compliance.sql
  0008_employee_exit.sql
  0009_employee_audit_log.sql
  0010_org_principal.sql
  0011_org_group.sql
  0012_org_employee.sql
  0013_org_draft.sql
  0014_org_change_log.sql
  0015_license_assignment.sql
  0016_license_contract.sql
  0017_system_inventory.sql
  0018_peripheral_inventory.sql
  0019_sheet_import_job.sql
  0020_people_access_grant.sql
  0021_indexes.sql
  0022_seed_emp_master.py     ← seeds employee_ext + all HR sub-tables from Emp Master.xlsx
  0023_seed_org_data.py       ← seeds org_principal, org_group, org_employee, license_assignment,
                                 license_contract, system_inventory, peripheral_inventory from Org Data.xlsx
```

**`0022_seed_emp_master.py`** (Emp Master.xlsx → employee tables):
1. Skip rows 1–2, row 3 = headers
2. Skip `first_name = 'Dummy'`
3. Normalise employee number → `LEGACY-NNN` for integers
4. Link to `dim_person` via `person_code = employee_number` (LEFT JOIN — NULL ok)
5. Encrypt PAN (col 60 or 72, prefer 60) and Aadhaar via Fernet before insert
6. Upsert all 7 sub-tables in a single transaction per employee

**`0023_seed_org_data.py`** (Org Data.xlsx → org + license + systems tables):
1. Seed `org_principal` from Code.gs `ORG_CONFIG.principals` (4 rows)
2. Seed `org_group` from `Groups` sheet
3. Seed `org_employee` from `Master_Employees` — compute `designation_level`/`color` via DESIGNATION_MAP logic, compute experience floats from DOJ
4. Seed `license_assignment` from `Licenses` sheet
5. Seed `license_contract` from `License_Inventory` sheet — compute `renewal_status`
6. Seed `system_inventory` from `Systems` sheet — run `gradePc_` scoring to set `composite_score` + `capability_tier`
7. Seed `peripheral_inventory` from `Peripherals` sheet
8. Create first `org_change_log` entry: `action = 'initial_import'`, `snapshot_after = full org state`

---

## 7. Backend API Routes — Port 8004

All routes prefixed `/ppl/`. Auth via `slp_token` cookie (same as SL_Workbook).

### Auth
```
GET  /ppl/auth/me        → {person_id, email, name, access_level}
```

### Employees
```
GET    /ppl/employees
       ?status=working|relieved|all
       ?department=...
       ?business_unit=...
       ?worker_type=...
       ?search=...          (matches name, email, employee_number)
       ?page=1&limit=50

POST   /ppl/employees                        Create employee  [admin]

GET    /ppl/employees/{id}                   Full profile (all 7 sections)
GET    /ppl/employees/{id}/audit_log         Field-change history
       ?section=...&page=1&limit=50

PATCH  /ppl/employees/{id}/profile           Personal fields  [edit, admin]
PATCH  /ppl/employees/{id}/work_info         Job / org fields [edit, admin]
PATCH  /ppl/employees/{id}/address           Addresses        [edit, admin]
PATCH  /ppl/employees/{id}/policy            HR policies      [edit, admin]
PATCH  /ppl/employees/{id}/compliance        PAN/Aadhaar      [admin only]
PATCH  /ppl/employees/{id}/exit              Exit info        [admin only]
PATCH  /ppl/employees/{id}/status            working→relieved [admin only]

DELETE /ppl/employees/{id}                   Soft delete      [admin only]

GET    /ppl/employees/export                 Stream Excel download [edit, admin]
```

### Org Chart (Group-based)
```
GET    /ppl/org/live
       → Full org: {principals: [{name, color, groups: [{key, name, lead, members[]}]}]}
       O(1) — reads last org_change_log.snapshot_after JSONB

GET    /ppl/org/groups                       All groups with principal, lead, color, sort
GET    /ppl/org/principals                   All 4 principals

POST   /ppl/org/move                         Optimistic move (like Console.html handleOptimisticMove)
       body: {empNo, newGroupKey}            [edit, admin]
       → {ok, name, team}

GET    /ppl/org/drafts                       All 3 slot states
GET    /ppl/org/drafts/{slot}                Draft with moves_json + full_snapshot
PUT    /ppl/org/drafts/{slot}                Save draft {draft_name, moves_json, full_snapshot}  [edit, admin]
DELETE /ppl/org/drafts/{slot}                Clear slot  [edit, admin]

POST   /ppl/org/publish/{slot}               Writes org_employee rows + org_change_log  [admin only]
       body: {confirm: true}

GET    /ppl/org/changelog                    Paginated list
GET    /ppl/org/changelog/{log_id}           Full log with diff_summary
POST   /ppl/org/revert/{log_id}              Re-publish snapshot_after  [admin only]

PATCH  /ppl/org/employees/{empNo}/include    Toggle Include in Org  [edit, admin]
PATCH  /ppl/org/employees/{empNo}/override   Set manager_override_emp  [edit, admin]
```

### Licenses
```
GET    /ppl/licenses/assignments             All assignments  ?email=&tool=&status=
GET    /ppl/licenses/assignments/{id}
POST   /ppl/licenses/assign                 Assign tool to email  [edit, admin]
PATCH  /ppl/licenses/assignments/{id}       Update status/dates  [edit, admin]
DELETE /ppl/licenses/assignments/{id}       Revoke assignment  [edit, admin]

GET    /ppl/licenses/contracts              All contracts  ?status=Active|Expiring|Expired
GET    /ppl/licenses/contracts/{id}
POST   /ppl/licenses/contracts              Add contract  [admin]
PATCH  /ppl/licenses/contracts/{id}         Update  [admin]
DELETE /ppl/licenses/contracts/{id}         Delete  [admin]

GET    /ppl/licenses/summary
       → {totals:{purchased, assigned, shared}, by_software:[...], expiring_soon:[...]}

GET    /ppl/licenses/by-email/{email}       All licenses for one person
GET    /ppl/licenses/unassigned             Contracts with spare seats
```

### Systems (PC Inventory)
```
GET    /ppl/systems                         All PCs  ?tier=&email=&team=
GET    /ppl/systems/{system_id}
POST   /ppl/systems                         Add system  [admin]
PATCH  /ppl/systems/{system_id}             Update specs — auto-recomputes score+tier  [edit, admin]
DELETE /ppl/systems/{system_id}             Retire  [admin]

POST   /ppl/systems/{system_id}/regrade     Force re-run gradePc_ scoring  [edit, admin]
GET    /ppl/systems/by-email/{email}        System assigned to one person
GET    /ppl/systems/summary
       → {by_tier:{...}, average_score, needs_upgrade_count}
```

### Peripherals
```
GET    /ppl/peripherals                     All peripherals  ?category=&status=
GET    /ppl/peripherals/{item_id}
POST   /ppl/peripherals                     Add  [admin]
PATCH  /ppl/peripherals/{item_id}           Update  [edit, admin]
DELETE /ppl/peripherals/{item_id}           [admin]
```

### Groups Overview
```
GET    /ppl/groups/overview
       → Aggregated per group: headcount, license counts per tool, system tier counts
       Matches Code.gs getGroupOverviewData() output exactly

GET    /ppl/groups/{group_key}              Single group with members, tools, systems
GET    /ppl/groups/{group_key}/members      Members list with designation + exp
```

### Import (manual — app wizard)
```
POST   /ppl/import/analyze
       body: multipart (file: Excel/CSV)
       → {headers: [...], suggestions: [{excel_col, db_field, confidence}]}
       NO DB write at this step

POST   /ppl/import/apply
       body: {job_id, column_mapping: {...}, dry_run?: bool}
       → streams SSE: {row: N, status: ok|error, message}

GET    /ppl/import/history           List import jobs [edit, admin]
GET    /ppl/import/{job_id}          Job details + full error_log
```

### Import (automated — Google Sheets live sync, same pattern as Code.gs in SL_Recruitment)
```
POST   /ppl/import/sheet-sync
       headers: x-sheet-ingest-token: <SL_PPL_SHEET_INGEST_TOKEN>
       body: {batch_id, sheet_id, sheet_name, rows: [{row_key, ...all columns}]}
       → {results: [{row_key, status: synced|error|duplicate, message}]}

GET    /ppl/import/sheet-sync/verify
       headers: x-sheet-ingest-token
       → HTTP 400 (signals "alive" to bootstrapIngest in Code.gs)
```
> HR keeps the Employee Master in Google Sheets. Code.gs runs on row insert (onChange) and on a 5-min schedule, pushing rows to `/ppl/import/sheet-sync`. Status is written back to a `sync_status` column in the sheet. No manual wizard needed for routine HR updates — the sheet IS the UI for data entry, the app is for viewing and org chart planning.

### Access Management
```
GET    /ppl/access                   List all grants              [admin]
POST   /ppl/access                   Grant access                 [admin]
PATCH  /ppl/access/{person_id}       Change access level          [admin]
DELETE /ppl/access/{person_id}       Revoke                       [admin]
```

### Dashboard
```
GET    /ppl/dashboard
       → {
           total_active: int,
           total_all_time: int,
           by_department: [{dept, count}],
           by_unit: [{unit, count}],
           by_worker_type: [{type, count}],
           recent_joins: [{employee_id, name, date_joined}],  -- last 5
           recent_exits: [{employee_id, name, exit_date}],    -- last 5
           last_org_change: {performed_by, performed_at, changes_count}
         }
```

---

## 8. Frontend Pages

All routes live inside `SL_Workbook/frontend/app/people/`. The UI structure mirrors Console.html: sidebar nav, topbar with search, main content area. Theme: Corporate (dark blue brand, white surfaces) or Warm (from Console.html themes).

| Route | Tab | Access |
|-------|-----|--------|
| `/people` | Hub — stat cards, quick actions, recent activity | All |
| `/people/org` | **Org / People** — Principal cards → Groups → Members, drag-drop | All (edit/admin to move) |
| `/people/org/changelog` | Org Change Log — timeline + revert | All |
| `/people/employees` | Employee Directory — virtual table, search, filters | All |
| `/people/employees/[id]` | Employee Profile — 6 tabs, inline edit | All (admin-gated tabs) |
| `/people/employees/new` | Add Employee | Admin |
| `/people/licenses` | **Licenses** — assignments + contracts, renewal alerts | All |
| `/people/licenses/contracts` | License Contracts / Inventory | Edit + Admin |
| `/people/systems` | **Systems** — PC inventory, tier cards, grading | All |
| `/people/peripherals` | **Peripherals** — item list, condition, assignment | All |
| `/people/groups` | **Groups Overview** — per-team headcount + tools + systems | All |
| `/people/import` | Import Wizard | Edit + Admin |
| `/people/access` | Access Management | Admin only |

---

## 9. Key UI Components

### 9.1 — People Hub (`/people`)

- Stat cards: Total Active · Licenses Assigned · PCs Tracked · Expiring Licenses (30 days)
- Quick actions: Edit Org · Run Import · Add System
- Last org change strip: who published, when, how many moves
- Animated: Framer Motion card stagger on load

---

### 7.2 — Employee Directory (`/people/employees`)

**Table engine**: TanStack Table v8 + react-virtual  
**Renders only visible rows** — handles 524 records at 60 fps with no lag.

- **Columns**: Avatar · Employee # · Full Name · Department · Job Title · Business Unit · Worker Type · Status badge · Date Joined · Actions
- **Sticky columns**: Avatar + Name
- **Filter bar**: Status pill · Department pill · Business Unit pill · Worker Type pill · Search input
- **Row click**: Opens a right-side **profile drawer** (slide-in panel, no page nav needed for quick edits)
- **Export button**: Triggers `/ppl/employees/export` → streams Excel
- **Column visibility toggle**: Show/hide columns (persisted to localStorage)

---

### 7.3 — Employee Profile (`/people/employees/[id]`)

**6 tabbed sections**. All fields are inline-editable (click text to edit, press Esc to cancel, Tab to next field).

| Tab | Fields | Who Can Edit |
|-----|--------|-------------|
| **Personal** | Name, DOB, Gender, Marital Status, Blood Group, Phones, Emails, Emergency contacts | Edit + Admin |
| **Work** | Department, Unit, Job Title, Location, Date Joined, Manager (searchable picker), Notice Period, Band, Pay Grade, Cost Center | Edit + Admin |
| **Address** | Current + Permanent address blocks | Edit + Admin |
| **Policy** | Leave plan, Shift, Weekly Off, Attendance, Holiday List, Expense Policy | Edit + Admin |
| **Compliance** | PAN, Aadhaar, PF, UAN | **Admin only** — fields blurred by default, click to reveal, every reveal is audit-logged |
| **Exit** | Exit Status, Termination Type, Reason, Resignation Note, Comments | **Admin only** |

**Dirty state**: Save button appears (Framer Motion slide-up) only when the section has unsaved changes.  
**Audit log sidebar**: Right panel toggleable — shows per-field history for this employee. "Who changed what, when."  
**Status badge**: `Working` (green) / `Relieved` (grey) / `Terminated` (red) — click to initiate status change (admin confirmation modal).

---

### 9.4 — Org / People (`/people/org`)

**Layout**: Matches Console.html exactly. NOT React Flow tree — it's a **card grid grouped by Principal**.

```
┌─────────────────────────────────────────────────────────────────┐
│  [Harsh Vardhan #244C66]  14 people · 6 groups    [Edit mode]   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Finance &       │  │ BD & Comms      │  │ IT & Tech       │ │
│  │ Accounts        │  │ [Amita Goel]    │  │ [Devdutt Kumar] │ │
│  │ [Rajendra]      │  │                 │  │                 │ │
│  │ • Aman Jha      │  │ • Atharv        │  │ • Nitayee Das   │ │
│  │ • Nirmal Singh  │  │ • Bharati       │  │                 │ │
│  │   ⠿ drag handle │  │   ⠿ drag handle │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Person card shows** (mirrors Console.html person rows):
- Avatar (initials circle, designation color background)
- Full Name · Job Title
- SL Exp · O Exp (e.g., "3.2 · 5.7")
- License count badge
- Drag handle (⠿) — visible only in edit mode

**Edit mode flow** (identical to Console.html `handleOptimisticMove`):
1. Click "Edit Org" → edit mode enabled
2. Person rows become `draggable=true`
3. Drag person to another group card → `handleOptimisticMove(empNo, newGroupKey)`:
   - **Immediate**: local state updated, UI re-renders (zero server call yet)
   - **Debounced 250ms**: POST `/ppl/org/move` → server validates + writes
   - **On server fail**: toast error + reload from `/ppl/org/live`
4. Changes queue as `pendingMoves: {empNo → {from, to}}`
5. "Save Draft [1/2/3]" → PUT `/ppl/org/drafts/{slot}` with full `moves_json` + `full_snapshot`
6. "Preview vs Live" → diff overlay: moved = blue pulse, new group = green border
7. "Publish" (admin only) → confirm modal with diff table → POST `/ppl/org/publish/{slot}`
8. After publish: `org_change_log` entry written, draft slot cleared, UI reloads

**Draft panel** (right sidebar when in edit mode):
- Slot 1 / 2 / 3: name, last edited, pending moves count
- Overflow: "Choose slot to overwrite" modal → archived old draft silently

**Person click** (view mode): slide-in drawer with full profile — matches Console.html `openPersonDrawer`

---

### 9.5 — Org Change Log (`/people/org/changelog`)

- Vertical timeline: Date · Who · Action (publish/revert) · N employees moved
- Expand: full diff table (`Name | From Group | To Group | From Principal | To Principal`)
- **Revert** button (admin only) → confirm modal → new log entry + re-publishes

---

### 9.6 — Licenses (`/people/licenses`)

Matches Console.html Licenses tab:
- **Summary bar**: Total Purchased · Assigned · Shared/Rooms · Utilisation %
- **Software grid**: one card per tool — bar chart (purchased vs assigned), expiry status badge
- **Expiring Soon** alert strip: contracts expiring within 30 days (red) or 90 days (amber)
- **Unknown email banner**: license assignments to emails not in Master_Employees — same warning as Console.html
- **Assignment table**: searchable by person/tool, sortable, inline revoke/assign buttons
- **Contracts page** (`/people/licenses/contracts`): full inventory table with renewal dates, costs

---

### 9.7 — Systems (`/people/systems`)

Matches Console.html Systems tab:
- **Tier strip**: count of Workstation / Performance / Standard / Basic / Entry systems
- **PC cards**: one per system — `System ID`, assigned person, tier badge, composite score bar
  - Shows: CPU · RAM · GPU · storage
  - Software versions: AutoCAD · SketchUp · Adobe · Office
  - Auto-generated upgrade suggestion (from `gradePc_` logic)
- **Edit**: update specs → composite score + tier auto-recomputed on save
- **Filter**: by tier, by team, by email

---

### 9.8 — Peripherals (`/people/peripherals`)

- Table: Item ID · Category · Item · Model · Condition · Status · Assigned To · Location
- Inline edit: condition, status, assigned_to, notes
- Filter: by category, by condition, by status

---

### 9.9 — Groups Overview (`/people/groups`)

Matches Console.html Groups tab:
- One card per group (matching `getGroupOverviewData()`)
- Shows: Group name · Principal · Team Lead · Headcount
- **Tool breakdown**: AutoCAD · SketchUp · Adobe suite etc. — count of assigned licenses
- **System tier breakdown**: Workstation / Performance / Standard counts
- **Member list** (expandable): name · title · designation level · license count · system

---

### 9.10 — Import Wizard (`/people/import`)

**4-step flow** (same for Emp Master, Org Data, License, or Systems sheet):

**Step 1 — Select source + upload**: dropdown to select what you're importing (Employees / Org / Licenses / Systems / Peripherals), then drag-drop file. SheetJS parses client-side.

**Step 2 — Map Columns**: confidence bars, all editable. Auto-suggested mappings based on known column names from all 3 source files.

**Step 3 — Preview**: first 20 rows, errors highlighted.

**Step 4 — Apply**: SSE progress stream, error log download.

---

## 10. RBAC Access Matrix

| Feature | View | Edit | Admin |
|---------|:----:|:----:|:-----:|
| See org chart (all groups) | ✓ | ✓ | ✓ |
| See employee profiles | ✓ | ✓ | ✓ |
| Edit employee personal / work / address / policy | — | ✓ | ✓ |
| View Compliance tab (PAN/Aadhaar) | — | — | ✓ |
| Edit Compliance / Exit tabs | — | — | ✓ |
| Move person between groups (edit mode) | — | ✓ | ✓ |
| Save org draft | — | ✓ | ✓ |
| Publish org chart | — | — | ✓ |
| Revert org chart | — | — | ✓ |
| View org change log | ✓ | ✓ | ✓ |
| View licenses / systems / peripherals | ✓ | ✓ | ✓ |
| Assign / revoke licenses | — | ✓ | ✓ |
| Add / edit systems + peripherals | — | ✓ | ✓ |
| Add / delete license contracts | — | — | ✓ |
| Run import (any source) | — | ✓ | ✓ |
| Export to Excel | — | ✓ | ✓ |
| Manage access grants | — | — | ✓ |

**Default role mapping** (from `sl_platform.dim_person` role):
- Platform `superadmin` / `hr_admin` / `it_lead` → People **admin**
- Platform `hr_exec` / `it_agent` / `hiring_manager` → People **edit**
- All others → People **view**

Overridden per-person via `people_access_grant` table.

---

## 11. Build Order — Phased Plan

### Phase 0 — Infrastructure (2–3 days)
> Everything needs this before anything else can exist.

- [ ] Create `SL_People/backend/` directory with FastAPI skeleton
- [ ] `app/main.py`, `app/core/config.py`, `app/db/`, `app/models/`, `app/api/`
- [ ] Write all 14 SQL migration files (0001 → 0015)
- [ ] Write `migrations/0016_seed_from_excel.py` — Python seed script that:
  - Reads `Emp Master.xlsx`
  - Filters out dummy employee (#2)
  - Normalises employee numbers (assigns `LEGACY-NNN` to integer-format ones)
  - Resolves manager FK links via employee_number lookup
  - Encrypts PAN/Aadhaar with Fernet before insert
  - Seeds all 7 per-employee tables in one transaction
  - Seeds `org_node` from manager hierarchy in the Excel
  - Creates the first `org_change_log` entry (action = `initial_import`)
- [ ] Auth middleware: verify `slp_token` → lookup `sl_platform.dim_person` → resolve `people_access_grant`
- [ ] Update `Caddyfile`: add `/api/ppl*` → `localhost:8004`
- [ ] Update `start-all.cmd`: add port 8004 spawn + kill
- [ ] Update `start-prod.cmd` similarly
- [ ] Add "People & Org" app card to Workbook hub page (`SL_Workbook/frontend/app/employee/page.tsx`)
- [ ] Create `SL_Workbook/frontend/app/people/` route directory
- [ ] Add `PLANNER_BACKEND_URL`-style env var: `PEOPLE_BACKEND_URL=http://127.0.0.1:8004`

**Deliverable**: Seeded DB, backend running, workbook shows new card but pages are stubs.

---

### Phase 1 — Employee Master Read + Edit (1.5 weeks)

- [ ] `/ppl/employees` list endpoint — search, filter, pagination, joins across 7 tables
- [ ] `/ppl/employees/{id}` full profile endpoint
- [ ] All 6 PATCH endpoints with `employee_audit_log` writes on every change
- [ ] `/ppl/employees/export` Excel export (openpyxl stream)
- [ ] Frontend: `app/people/employees/page.tsx` — virtual table (TanStack + react-virtual)
- [ ] Frontend: `app/people/employees/[id]/page.tsx` — 6-tab profile, inline edit
- [ ] Frontend: Audit log sidebar component
- [ ] Frontend: Compliance tab blur + reveal + access log
- [ ] `app/api/ppl/employees/*` proxy routes (Next.js → FastAPI)

**Deliverable**: Full read + edit of all 524 employee records. Every change is logged.

---

### Phase 2 — Import System (1 week)

- [ ] `/ppl/import/analyze` — multipart upload, SheetJS-style server parse (openpyxl), return column suggestions with Levenshtein fuzzy match
- [ ] `/ppl/import/apply` — upsert engine with `ON CONFLICT (employee_number) DO UPDATE`, SSE progress stream, per-row error capture
- [ ] Import history endpoints
- [ ] Frontend: `app/people/import/page.tsx` — 4-step wizard
- [ ] Frontend: Column mapping table with confidence bars
- [ ] Frontend: SSE progress component
- [ ] Frontend: Error log download (client-side CSV generation from response JSON)

**Deliverable**: Anyone with Edit role can upload a new Excel and import/update records without touching the DB directly.

---

### Phase 3 — Org Chart (Group-based) + Draft System (1.5 weeks)

- [ ] Port DESIGNATION_MAP from Code.gs as Python dict — used in seed + upsertPerson equivalent
- [ ] Port `computeExperience_` logic as Python util (DOJ + prior exp → SL exp + O exp floats)
- [ ] Port `gradePc_` scoring as Python util (CPU + GPU + RAM → composite score + tier)
- [ ] `/ppl/org/live` — returns full org JSONB from `org_change_log.snapshot_after`
- [ ] `/ppl/org/move` — optimistic move endpoint (writes `org_employee.group_key` atomically)
- [ ] `/ppl/org/drafts` CRUD
- [ ] `/ppl/org/publish/{slot}` — diff compute + `org_employee` batch write + `org_change_log`
- [ ] Frontend: `app/people/org/page.tsx` — Principal cards → Group cards → Person rows
- [ ] Frontend: Drag-and-drop (HTML5 dragstart/dragover/drop, mirrors Console.html exactly)
- [ ] Frontend: `handleOptimisticMove` — immediate local state update, debounced server write, revert on fail
- [ ] Frontend: Draft panel (right sidebar) with 3 slots
- [ ] Frontend: Preview diff overlay (blue pulse for moved)
- [ ] Frontend: Publish confirmation modal with diff table

**Deliverable**: Org chart works exactly like Console.html, plus draft system layered on top.

---

### Phase 4 — Licenses Module (1 week)

- [ ] License assignment CRUD endpoints
- [ ] License contract CRUD endpoints
- [ ] `/ppl/licenses/summary` aggregation (mirrors `getLicencesData_()` in Code.gs)
- [ ] `shortNameFor_` normalisation logic ported to Python
- [ ] License classification: person / shared / unassigned (mirrors Code.gs `classifyLicenseHolder_`)
- [ ] Frontend: `app/people/licenses/page.tsx` — summary bar + software grid + expiring soon
- [ ] Frontend: Unknown email warning banner (emails in licenses but not in org)
- [ ] Frontend: Assignment table with inline revoke/assign

**Deliverable**: Full license management, same logic as Console.html Licenses tab.

---

### Phase 5 — Systems + Peripherals + Groups Overview (1 week)

- [ ] System inventory CRUD + regrade endpoint (re-runs gradePc_ scoring)
- [ ] Peripheral inventory CRUD
- [ ] `/ppl/groups/overview` aggregation (mirrors `getGroupOverviewData()`)
- [ ] Frontend: `app/people/systems/page.tsx` — tier strip + PC cards
- [ ] Frontend: `app/people/peripherals/page.tsx` — table with inline edit
- [ ] Frontend: `app/people/groups/page.tsx` — group cards with tool/system breakdown

**Deliverable**: Systems, peripherals, and groups overview fully operational.

---

### Phase 6 — Changelog + Revert + Access + Polish (1 week)

- [ ] `/ppl/org/changelog` list + detail + `/ppl/org/revert/{log_id}`
- [ ] `/ppl/access` CRUD
- [ ] Frontend: changelog timeline + diff expand + revert button
- [ ] Frontend: access management table
- [ ] Framer Motion: card stagger, panel slides, tab transitions
- [ ] Employee create form — 3-step wizard
- [ ] Loading skeletons (not spinners) everywhere
- [ ] Error boundaries on all pages
- [ ] Mobile-responsive review
- [ ] Confirm port 8004 in `start-prod.cmd` + Caddy

**Deliverable**: Complete Operating Console. Production-ready.

---

**Total realistic estimate: 7–8 weeks full-time (one developer).**  
Org + Employee = 4 weeks. Licenses + Systems = 2 weeks. Polish + changelog = 1–2 weeks.  
Parallel work (backend + frontend simultaneously) could compress to 5–6 weeks with two developers.

---

## 12. Data Seed Challenges & Fixes

| Issue | Root Cause | Fix |
|-------|------------|-----|
| **dim_person only has 107 active employees** but Excel has 524 | Exited employees never got platform accounts | `employee_ext.person_id = NULL` for the 417 exited ones. JOIN to `dim_person` is always LEFT JOIN |
| **Dual employee number format in Excel** | 170 legacy integer IDs pre-date SL0XXX system | Seed as `LEGACY-NNN`, store original in `legacy_number`. These 170 will have `person_id = NULL` |
| **Manager refs use SL0XXX, 2 are "Not Available"** | Mixed-era data | Resolve via `employee_ext.employee_number` lookup. "Not Available" → `reporting_manager_id = NULL` |
| **Employee #2 is dummy** | System placeholder in source HRMS | Filter: skip where `first_name = 'Dummy'` |
| **Band 0.8%, Pay Grade 0%** | Never populated in source HRMS | Import as empty. Display as editable "Not set" in UI |
| **Cost Center 0% filled** | Not tracked in source | Import empty. Editable in Work tab |
| **PAN/Aadhaar must be encrypted** | Indian PII legal requirement | Fernet AES-256 before insert. Every read is audit-logged |
| **Col 72 duplicates Col 60** (both = PAN) | Source data issue | On import: prefer Col 60; fall back to Col 72 if Col 60 is empty |
| **dim_person name/email may differ from Excel** | dim_person may have been updated after the Excel was exported | `employee_ext` does NOT store name/email for platform users — those come from `dim_person` at query time |
| **dim_person.status vs employee_ext.employment_status** | Two different concepts in two systems | `dim_person.status` = login/platform access. `employee_ext.employment_status` = HR employment state. Both tracked independently, never merged |
| **Org Data `Master_Employees` has 299 rows but Emp Master has 524** | Org Data only tracks current + recent staff; Emp Master has full history | Seed org tables from Org Data. Seed HR master from Emp Master. The two sets overlap by employee_number — no conflict |
| **Designation Level in Org Data is a stored column** but must be computed | Source sheet has `Designation Level` + `Designation Color` pre-computed | Re-compute on seed and on every job title update using Python DESIGNATION_MAP. Do not trust stored values — recompute is authoritative |
| **Experience displayed as floats** (e.g., 3.2 yrs) | Computed from DOJ + Prior Exp at read time in Code.gs | Compute and store in `org_employee.sl_exp_years` and `o_exp_years` at seed + update time |
| **Manager Override Emp No** has only 1 entry in current data (SL0364 → SL0150) | Rarely used in the sheet | Store in `org_employee.manager_override_emp`. Frontend shows override marker when set |
| **License `Renewal / End Date` is per-row** but contracts can span multiple rows | Licenses sheet has one row per person-tool assignment, not per contract | `license_assignment` = assignment rows. `license_contract` = inventory rows. They are separate tables, not the same data |
| **System IDs** (`LDS-02` etc.) are manually assigned in the sheet | No auto-increment | Keep as-is. New systems get next LDS-NNN manually chosen by admin |

---

## 13. Performance Guarantees

| Operation | Target | Method |
|-----------|--------|--------|
| Employee list — 107 active | < 50ms | Indexed status filter + single JOIN |
| Employee list — 524 all | < 150ms | Same, full table scan acceptable at this scale |
| Employee list render | 60 fps | react-virtual renders only visible rows (~20 at a time) |
| Employee profile load | < 80ms | 7-table JOIN on indexed UUID PKs |
| Org chart live read | < 30ms | Single JSONB read from `org_change_log.snapshot_after` |
| Org chart draft save | < 20ms | Single JSONB upsert |
| Org chart node drag | Instant | Local React state only — zero server calls during drag |
| Import analyze | < 2s | SheetJS runs in the browser. Server receives only metadata |
| Import apply (500 rows) | < 15s | Bulk `INSERT ... ON CONFLICT DO UPDATE` — ~30ms per row |
| Audit log per employee | < 50ms | Composite index `(employee_id, performed_at DESC)` |
| Access check per request | < 5ms | In-memory after JWT decode + single row lookup |
| Org chart live read | < 30ms | Single JSONB read from `org_change_log.snapshot_after` — O(1) |
| Org move (optimistic) | Instant (local) + < 50ms (server) | Local state update = synchronous. Server write is debounced 250ms |
| Org draft save | < 20ms | Single JSONB upsert on `org_draft` |
| Groups overview | < 200ms | Aggregated join: `org_employee` × `license_assignment` × `system_inventory` |
| License summary | < 100ms | Indexed group-by on `license_assignment.tool_short_name` |
| Systems list (all) | < 80ms | Simple table scan on ~100 rows |

---

## 14. Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Backend | FastAPI (Python 3.11) | Consistent with SL_IT and SL_Recruitment |
| ORM | SQLAlchemy 2.x | Consistent with platform |
| DB | PostgreSQL — `sl_people` schema | Shared server, new schema |
| Encryption | `cryptography.fernet` (AES-256) | PAN/Aadhaar at-rest encryption |
| Fuzzy match | `python-Levenshtein` | Import column auto-matching |
| Excel parse (backend) | `openpyxl` | Import apply + export |
| Excel parse (frontend) | `SheetJS (xlsx)` | Client-side import analyze — no upload until mapping is confirmed |
| GSheet automation | Google Apps Script (Code.gs) | Same pattern as `SL_Recruitment/scripts/google_sheet_ingest.gs` — onChange + scheduled triggers push rows to `/ppl/import/sheet-sync` |
| Reference UI logic ported | Python (from Code.gs JS) | `DESIGNATION_MAP`, `computeExperience_`, `gradePc_`, `shortNameFor_`, `classifyLicenseHolder_` all ported from Code.gs to Python utils |
| Frontend framework | Next.js 14 App Router | Consistent with platform |
| Styling | Tailwind CSS | Consistent with platform |
| Org chart | **React Flow** | Drag-drop, custom nodes, zoom/pan, minimap, virtualized |
| Table | TanStack Table v8 + react-virtual | Virtual scrolling, column pinning, inline edit |
| Animations | Framer Motion | Page transitions, panel slides, card reveals |
| Charts | Recharts | Headcount / dept breakdown charts on hub |
| SSE (import progress) | FastAPI `StreamingResponse` + `EventSourceMessage` | Real-time import progress without websockets |

---

## 15. Open Questions Before Build Starts

| # | Question | Impact |
|---|----------|--------|
| 1 | **3 VS Code reference files** — not yet shared. Paths or content? | Finalises UI design decisions |
| 2 | **Include 417 exited employees in the app?** Option A: All 524 with status filter (recommended). Option B: Active 107 only. Option C: All imported, exited hidden by default + toggle | Affects seed and UI filter complexity |
| 3 | **Encryption key** — generate new `SL_PEOPLE_ENCRYPTION_KEY` Fernet key and add to `.env`? | Must be decided before compliance seed |
| 4 | **Who gets Admin access initially?** Which `person_id` values are seeded into `people_access_grant` with `admin`? | Needed for seed script |
| 5 | **Port 8004 confirmed free?** | Infrastructure phase 0 |
| 6 | **`ENABLE_PEOPLE_MODULE` flag in `start-all.cmd`?** Same pattern as `ENABLE_IT_MODULE`? | Startup script |
| 7 | **Google Sheets live sync** — do you want to wire up the Code.gs automation (same as Recruitment) so HR can keep updating from a sheet without using the import wizard? | If yes, a `SL_PPL_SHEET_INGEST_TOKEN` goes in `.env` and a new `.gs` file goes in `SL_People/scripts/` |

---

*This document is the single source of truth for the SL_People module. Update it when decisions change. Do not begin implementation of any phase without all Phase 0 items complete.*
