/**********************
 * External Sheet Sync (skips source column B)
 * Source columns:
 *   A Date
 *   B (ignore)
 *   C Job ID
 *   D Applying for
 *   E First name
 *   F Last name
 *   G Email
 *   H Contact number
 *   I Educational Qualification
 *   J Years of experience
 *   K City
 *   L Willing to Relocate?
 *   M Terms
 *   N Portfolio
 *   O CV
 *   P Resume
 *
 * Target columns (A:O):
 *   A Date
 *   B Job ID
 *   ...
 *   O Resume
 **********************/
const EXTERNAL_SYNC = {
  SOURCE_SPREADSHEET_ID: "1UjAOeuOGXMW_1NrB2it9Vuu_jfX4GIWdJZwCLVC6mYQ",
  SOURCE_TAB_NAME: "Sheet1", // <-- change if your external tab name differs
  SOURCE_COLS_A_TO_P: 16, // A:P
  SOURCE_CHANNEL_LABEL: "external_sheet_sync",
  CHECK_ARCHIVE_TOO: true
};

function syncExternalUpdatedToIngestQueue() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log("Sync skipped: could not acquire lock.");
    return;
  }

  try {
    const tgtSS = SpreadsheetApp.getActiveSpreadsheet();
    const tgtSheet = _resolveTargetSheet(tgtSS); // uses your existing logic (Master Data / fallbacks)
    if (!tgtSheet) throw new Error("Target ingest sheet not found (check SHEET_TAB_NAME).");

    const srcSS = SpreadsheetApp.openById(EXTERNAL_SYNC.SOURCE_SPREADSHEET_ID);
    const srcSheet = srcSS.getSheetByName(EXTERNAL_SYNC.SOURCE_TAB_NAME);
    if (!srcSheet) throw new Error(`Source tab not found: ${EXTERNAL_SYNC.SOURCE_TAB_NAME}`);

    const srcLastRow = srcSheet.getLastRow();
    if (srcLastRow < 2) {
      Logger.log("No rows in external source.");
      return;
    }

    // Read A:P (includes the unwanted B, which we will skip while mapping)
    const srcRange = srcSheet.getRange(2, 1, srcLastRow - 1, EXTERNAL_SYNC.SOURCE_COLS_A_TO_P);
    const srcValues = srcRange.getValues();
    const srcRich = srcRange.getRichTextValues();
    const targetHeaderIndex = _sync_ensureTargetHeaders(tgtSheet);
    const targetColumnCount = _sync_headerCount(targetHeaderIndex);

    // Build existing keys from target (+ archive optionally)
    const existingKeys = new Set();
    _sync_addKeysFromSheet(existingKeys, tgtSheet);

    if (EXTERNAL_SYNC.CHECK_ARCHIVE_TOO) {
      const archive = tgtSS.getSheetByName(INGEST_CONFIG.archiveSheetName);
      if (archive) _sync_addKeysFromSheet(existingKeys, archive);
    }

    const toAppendValues = [];
    const richWriteQueue = [];

    srcValues.forEach((row, i) => {
      const mapped = _sync_mapSourceRow(row);
      const jobId = mapped.jobId;
      const email = mapped.email;
      if (!jobId || !email) return;

      const externalRef = _sync_computeExternalSourceRef(row, {
        sourceSpreadsheetId: EXTERNAL_SYNC.SOURCE_SPREADSHEET_ID,
        sourceSheetName: EXTERNAL_SYNC.SOURCE_TAB_NAME,
        sourceRowNumber: i + 2
      });
      const key = externalRef || _sync_legacyKey(jobId, email, mapped.date);
      if (existingKeys.has(key)) return;

      const targetRow = new Array(targetColumnCount).fill("");
      _sync_set(targetRow, targetHeaderIndex, "Date", mapped.date);
      _sync_set(targetRow, targetHeaderIndex, "Job ID", mapped.jobId);
      _sync_set(targetRow, targetHeaderIndex, "Applying for", mapped.applyingFor);
      _sync_set(targetRow, targetHeaderIndex, "First name", mapped.firstName);
      _sync_set(targetRow, targetHeaderIndex, "Last name", mapped.lastName);
      _sync_set(targetRow, targetHeaderIndex, "Email", mapped.emailRaw);
      _sync_set(targetRow, targetHeaderIndex, "Contact number", mapped.contactNumber);
      _sync_set(
        targetRow,
        targetHeaderIndex,
        "Educational Qualification",
        mapped.educationalQualification
      );
      _sync_set(targetRow, targetHeaderIndex, "Years of experience", mapped.yearsOfExperience);
      _sync_set(targetRow, targetHeaderIndex, "City", mapped.city);
      _sync_set(targetRow, targetHeaderIndex, "Willing to Relocate?", mapped.willingToRelocate);
      _sync_set(targetRow, targetHeaderIndex, "Terms", mapped.terms);
      _sync_set(targetRow, targetHeaderIndex, "Portfolio", mapped.portfolio);
      _sync_set(targetRow, targetHeaderIndex, "CV", mapped.cv);
      _sync_set(targetRow, targetHeaderIndex, "Resume", mapped.resume);
      _sync_set(
        targetRow,
        targetHeaderIndex,
        "Source Channel",
        EXTERNAL_SYNC.SOURCE_CHANNEL_LABEL || INGEST_CONFIG.defaultSourceChannel || "google_sheet"
      );
      _sync_set(targetRow, targetHeaderIndex, "External Source Ref", externalRef);
      toAppendValues.push(targetRow);

      const richRow = srcRich[i] || [];
      _sync_queueRichText(richWriteQueue, toAppendValues.length - 1, targetHeaderIndex, "Portfolio", richRow[13]);
      _sync_queueRichText(richWriteQueue, toAppendValues.length - 1, targetHeaderIndex, "CV", richRow[14]);
      _sync_queueRichText(richWriteQueue, toAppendValues.length - 1, targetHeaderIndex, "Resume", richRow[15]);

      existingKeys.add(key);
    });

    if (!toAppendValues.length) {
      Logger.log("No new rows to sync.");
      return;
    }

    const startRow = tgtSheet.getLastRow() + 1;

    // Write mapped values into target row shape without touching ops columns.
    tgtSheet.getRange(startRow, 1, toAppendValues.length, targetColumnCount).setValues(toAppendValues);
    _sync_applyQueuedRichText(tgtSheet, startRow, richWriteQueue);

    Logger.log(`Synced ${toAppendValues.length} new row(s) into "${tgtSheet.getName()}".`);
  } finally {
    lock.releaseLock();
  }
}

function _sync_addKeysFromSheet(keySet, sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const width = Math.max(1, sheet.getLastColumn());
  const data = sheet.getRange(1, 1, lastRow, width).getValues();
  if (!data || data.length < 2) return;

  const headers = data[0].map((h) => String(h || "").trim());
  const idx = _sync_buildHeaderIndex(headers);
  const externalRefIdx =
    idx["External Source Ref"] != null ? idx["External Source Ref"] : idx["external_source_ref"];
  const jobIdx = idx["Job ID"] != null ? idx["Job ID"] : idx["job_id"];
  const emailIdx = idx["Email"] != null ? idx["Email"] : idx["email"];
  const dateIdx = idx["Date"] != null ? idx["Date"] : idx["date"];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const ext = _sync_normalizeRef(externalRefIdx == null ? "" : row[externalRefIdx]);
    if (ext) {
      keySet.add(ext);
      continue;
    }
    const jobId = jobIdx == null ? "" : String(row[jobIdx] || "").trim();
    const email = emailIdx == null ? "" : String(row[emailIdx] || "").trim().toLowerCase();
    const date = dateIdx == null ? "" : String(row[dateIdx] || "").trim();
    if (!jobId || !email) continue;
    keySet.add(_sync_legacyKey(jobId, email, date));
  }
}

function _sync_ensureTargetHeaders(sheet) {
  const required = [
    "Date",
    "Job ID",
    "Applying for",
    "First name",
    "Last name",
    "Email",
    "Contact number",
    "Educational Qualification",
    "Years of experience",
    "City",
    "Willing to Relocate?",
    "Terms",
    "Portfolio",
    "CV",
    "Resume",
    "Source Channel",
    "External Source Ref"
  ];

  const lastCol = Math.max(1, sheet.getLastColumn());
  const headers = sheet
    .getRange(1, 1, 1, lastCol)
    .getValues()[0]
    .map((h) => String(h || "").trim());
  const idx = _sync_buildHeaderIndex(headers);

  let changed = false;
  required.forEach((header) => {
    if (idx[header] != null) return;
    headers.push(header);
    idx[header] = headers.length - 1;
    changed = true;
  });

  if (changed) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return idx;
}

function _sync_mapSourceRow(row) {
  return {
    date: row[0],
    jobId: String(row[2] || "").trim(),
    applyingFor: String(row[3] || "").trim(),
    firstName: String(row[4] || "").trim(),
    lastName: String(row[5] || "").trim(),
    emailRaw: String(row[6] || "").trim(),
    email: String(row[6] || "").trim().toLowerCase(),
    contactNumber: String(row[7] || "").trim(),
    educationalQualification: String(row[8] || "").trim(),
    yearsOfExperience: row[9],
    city: String(row[10] || "").trim(),
    willingToRelocate: String(row[11] || "").trim(),
    terms: String(row[12] || "").trim(),
    portfolio: String(row[13] || "").trim(),
    cv: String(row[14] || "").trim(),
    resume: String(row[15] || "").trim()
  };
}

function _sync_computeExternalSourceRef(row, context) {
  const ctx = context || {};
  const mapped = _sync_mapSourceRow(row);
  const appliedAt = String(mapped.date || "").trim();
  const pieces = [
    "google_sheet",
    String(ctx.sourceSpreadsheetId || "").trim(),
    String(ctx.sourceSheetName || "").trim(),
    appliedAt,
    mapped.jobId,
    mapped.applyingFor,
    mapped.email,
    mapped.firstName,
    mapped.lastName,
    mapped.portfolio,
    mapped.cv,
    mapped.resume
  ];
  if (!appliedAt) {
    pieces.push(String(ctx.sourceRowNumber || "").trim());
  }
  const fingerprint = pieces.join("|").toLowerCase();
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    fingerprint,
    Utilities.Charset.UTF_8
  );
  const hex = digest
    .map((b) => {
      const n = b < 0 ? b + 256 : b;
      const h = n.toString(16);
      return h.length === 1 ? `0${h}` : h;
    })
    .join("");
  return _sync_normalizeRef(`gs:${hex.slice(0, 40)}`);
}

function _sync_legacyKey(jobId, email, date) {
  return [
    String(jobId || "").trim().toLowerCase(),
    String(email || "").trim().toLowerCase(),
    String(date || "").trim().toLowerCase()
  ].join("|");
}

function _sync_normalizeRef(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, 191);
}

function _sync_buildHeaderIndex(headers) {
  const idx = {};
  headers.forEach((h, i) => {
    idx[String(h || "").trim()] = i;
  });
  return idx;
}

function _sync_headerCount(headerIndex) {
  const values = Object.keys(headerIndex || {}).map((key) => Number(headerIndex[key]));
  if (!values.length) return 1;
  return Math.max.apply(null, values) + 1;
}

function _sync_set(outputRow, headerIndex, headerName, value) {
  const idx = headerIndex[headerName];
  if (idx == null || idx < 0) return;
  outputRow[idx] = value;
}

function _sync_queueRichText(queue, rowOffset, headerIndex, headerName, richText) {
  const idx = headerIndex[headerName];
  if (idx == null || idx < 0 || !richText) return;
  queue.push({ rowOffset, colIndex: idx, richText });
}

function _sync_applyQueuedRichText(sheet, startRow, queue) {
  if (!queue || !queue.length) return;
  queue.forEach((entry) => {
    try {
      sheet
        .getRange(startRow + entry.rowOffset, entry.colIndex + 1, 1, 1)
        .setRichTextValue(entry.richText);
    } catch (err) {
      Logger.log(`Could not set rich text at row offset ${entry.rowOffset}: ${err}`);
    }
  });
}
