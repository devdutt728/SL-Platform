# Google Sheet Candidate Automation

## Objective
Ingest candidates from external portals (without using the Studio Lotus UI) while preserving the same backend automation:
- Candidate code generation: `SLR-####`
- CAF + Assessment link generation
- Candidate Drive folder creation
- Initial stage setup (`enquiry`)
- Source bifurcation (`source_origin=google_sheet`)
- External file links downloaded and re-uploaded to candidate Drive folder

## Opening governance (enforced)
- Opening creation: Superadmin only
- Opening detail edits: Superadmin only
- Opening enable/disable (`is_active`): HR Admin / HR Exec
- Opening code is system-generated and non-editable

## Ingestion endpoint
- URL (recommended through frontend proxy): `POST /recruitment/api/rec/candidates/import/google-sheet`
- Header: `x-sheet-ingest-token: <SL_SHEET_INGEST_TOKEN>`
- Content-Type: `application/json`

## Google Sheet columns
Use this exact sheet structure (case-insensitive aliases are supported):

1. `Date`
2. `Job ID`
3. `Applying for`
4. `First name`
5. `Last name`
6. `Email`
7. `Contact number`
8. `Educational Qualification`
9. `Years of experience`
10. `City`
11. `Willing to Relocate?`
12. `Terms`
13. `Portfolio`
14. `CV`
15. `Resume`

## Field rules
- Required:
  - `Job ID` (or `Applying for`, but `Job ID` is strongly recommended)
  - `First name`
  - `Last name`
  - `Email`
  - `Portfolio` (mandatory)
  - `Terms` must be accepted (`Yes/True/1`)
- Optional:
  - `Date` (if present, used as candidate creation timestamp)
  - `Contact number`
  - `Educational Qualification`
  - `Years of experience`
  - `City`
  - `Willing to Relocate?`
  - `CV`
  - `Resume`

## File handling (external links -> Drive)
- `Portfolio`, `CV`, and `Resume` can be public file URLs.
- Backend downloads each URL, validates type/size, and uploads into candidate Drive folder.
- Max size:
  - Portfolio: `10MB`
  - CV/Resume: `2MB`
- Allowed types:
  - CV/Resume: documents (`pdf/doc/docx/...`)
  - Portfolio: document/presentation/archive (`pdf/ppt/pptx/zip/...`)

## Matching and dedupe rules
- Opening resolution:
  - Primary: `Job ID` -> `opening_code`
  - Optional cross-check: if `Applying for` is present, it must match opening title
- Duplicate detection: `opening + email`
  - duplicate rows are returned as `status=duplicate`
  - no new candidate is created

## Source bifurcation
`rec_candidate` tracks:
- `source_origin`: `ui` / `public_apply` / `google_sheet`
- `source_channel`: portal/vendor label (if provided)
- `external_source_ref`: external reference (auto-built from sheet metadata when absent)

## Sample payload
```json
{
  "batch_id": "2026-02-10T12:00:00Z",
  "sheet_id": "1abc...",
  "sheet_name": "Website - Candidates",
  "rows": [
    {
      "row_key": "2",
      "date": "2025-05-01 22:21:31",
      "job_id": "ARCH-A12F",
      "applying_for": "Sr. Architect",
      "first_name": "Dev",
      "last_name": "Kumar",
      "email": "kr.dev@test.com",
      "contact_number": "1231231234",
      "educational_qualification": "B.TECH",
      "years_of_experience": 5,
      "city": "Delhi",
      "willing_to_relocate": "Yes",
      "terms": "Yes",
      "portfolio": "https://files.example.com/portfolio.pdf",
      "cv": "https://files.example.com/cv.pdf",
      "resume": "https://files.example.com/resume.pdf",
      "source_channel": "external_portal"
    }
  ]
}
```

## Recommended Apps Script flow
1. Read sheet rows.
2. Validate mandatory fields locally.
3. Skip rows already marked processed (`ingest_status=created|duplicate`).
4. POST batch to ingest endpoint.
5. Write back result columns (`ingest_status`, `candidate_code`, `message`, `ingested_at`).

### Suggested status columns to add in sheet
- `ingest_status`
- `candidate_code`
- `ingest_message`
- `ingested_at`

## Minimal Apps Script skeleton
```javascript
function pushCandidatesToRecruitment() {
  const endpoint = "https://studiolotushub.in/recruitment/api/rec/candidates/import/google-sheet";
  const token = PropertiesService.getScriptProperties().getProperty("SHEET_INGEST_TOKEN");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Website - Candidates");
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map((h) => String(h || "").trim());

  const rows = values
    .slice(1)
    .map((row, idx) => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      return {
        row_key: String(idx + 2),
        date: obj["Date"] ? String(obj["Date"]).trim() : null,
        job_id: obj["Job ID"] ? String(obj["Job ID"]).trim() : null,
        applying_for: obj["Applying for"] ? String(obj["Applying for"]).trim() : null,
        first_name: obj["First name"] ? String(obj["First name"]).trim() : null,
        last_name: obj["Last name"] ? String(obj["Last name"]).trim() : null,
        email: obj["Email"] ? String(obj["Email"]).trim().toLowerCase() : null,
        contact_number: obj["Contact number"] ? String(obj["Contact number"]).trim() : null,
        educational_qualification: obj["Educational Qualification"] ? String(obj["Educational Qualification"]).trim() : null,
        years_of_experience: obj["Years of experience"] ? Number(obj["Years of experience"]) : null,
        city: obj["City"] ? String(obj["City"]).trim() : null,
        willing_to_relocate: obj["Willing to Relocate?"] ? String(obj["Willing to Relocate?"]).trim() : null,
        terms: obj["Terms"] ? String(obj["Terms"]).trim() : null,
        portfolio: obj["Portfolio"] ? String(obj["Portfolio"]).trim() : null,
        cv: obj["CV"] ? String(obj["CV"]).trim() : null,
        resume: obj["Resume"] ? String(obj["Resume"]).trim() : null
      };
    })
    .filter((r) => r.job_id && r.first_name && r.last_name && r.email && r.portfolio && /^yes|true|1$/i.test(r.terms || ""));

  if (!rows.length) return;

  const payload = {
    batch_id: new Date().toISOString(),
    sheet_id: SpreadsheetApp.getActiveSpreadsheet().getId(),
    sheet_name: sheet.getName(),
    rows
  };

  const res = UrlFetchApp.fetch(endpoint, {
    method: "post",
    contentType: "application/json",
    headers: { "x-sheet-ingest-token": token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log(res.getResponseCode());
  Logger.log(res.getContentText());
}
```

## Trigger recommendation
- Time-driven trigger every `5` to `10` minutes.
- Keep portal-wise tabs if needed; set `source_channel` accordingly.

## Production script (recommended)
- A robust Apps Script is available at:
  - `SL_Recruitment/scripts/google_sheet_ingest.gs`
- It adds:
  - script lock (no overlapping runs)
  - row status management (`processing` / `created` / `duplicate` / `error`)
  - automatic ops columns creation
  - batch push in chunks
  - per-row result writeback

### Required Script Properties
- `SHEET_INGEST_TOKEN`
- `RECRUITMENT_INGEST_ENDPOINT`
  - Example: `https://studiolotushub.in/recruitment/api/rec/candidates/import/google-sheet`

### Backend env
- Set `SL_SHEET_INGEST_MAX_ROWS=0` to remove per-request row cap (ingest all pending new rows).

### Trigger setup (edit + row addition)
1. Open Apps Script for the target sheet.
2. Paste `SL_Recruitment/scripts/google_sheet_ingest.gs`.
3. Set Script Properties:
   - `SHEET_INGEST_TOKEN`
   - `RECRUITMENT_INGEST_ENDPOINT`
4. Run `setupIngestTriggers()` once manually.

This installs two **installable triggers**:
- `onEdit` -> runs ingest when any data row is edited in the target tab.
- `onChange (INSERT_ROW)` -> runs ingest when a new row is inserted.
