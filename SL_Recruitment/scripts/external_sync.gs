/**********************
 * External Sheet Sync (corrected source mapping + Job ID formula)
 *
 * SOURCE: "Website Candidate External Updated"
 * Actual source columns from your screenshots:
 *   A  Applying for
 *   B  First name*
 *   C  Last name*
 *   D  Your email address*
 *   E  Contact number
 *   F  Educational Qualification
 *   G  Years of experience
 *   H  City
 *   I  Relocation
 *   J  Upload Covering Letter   -> target CV
 *   K  Upload Resume            -> target Resume
 *   L  Upload Portfolio         -> target Portfolio
 *   M  Terms / consent          -> target Terms
 *   N  Date                     -> target Date
 *   O  CV                       -> ignored for ingest mapping
 *   P  Resume                   -> ignored for ingest mapping
 *
 * TARGET: "Website - Candidates"
 *   A  Date
 *   B  Job ID   (ARRAYFORMULA driven, do NOT write values here)
 *   C  Applying for
 *   D  First name
 *   E  Last name
 *   F  Email
 *   G  Contact number
 *   H  Educational Qualification
 *   I  Years of experience
 *   J  City
 *   K  Willing to Relocate?
 *   L  Terms
 *   M  Portfolio
 *   N  CV
 *   O  Resume
 *
 * Extra operational columns preserved:
 *   Source Channel
 *   External Source Ref
 **********************/
const EXTERNAL_SYNC = {
  SOURCE_SPREADSHEET_ID: "1UjAOeuOGXMW_1NrB2it9Vuu_jfX4GIWdJZwCLVC6mYQ",
  SOURCE_TAB_NAME: "Sheet1", // change only if your actual source tab name is different
  SOURCE_COLS_A_TO_P: 16, // read A:P
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
    const tgtSheet = _resolveTargetSheet(tgtSS); // uses your existing logic
    if (!tgtSheet) throw new Error("Target ingest sheet not found (check SHEET_TAB_NAME).");

    const srcSS = SpreadsheetApp.openById(EXTERNAL_SYNC.SOURCE_SPREADSHEET_ID);
    const srcSheet = srcSS.getSheetByName(EXTERNAL_SYNC.SOURCE_TAB_NAME);
    if (!srcSheet) throw new Error(`Source tab not found: ${EXTERNAL_SYNC.SOURCE_TAB_NAME}`);

    const srcLastRow = srcSheet.getLastRow();
    if (srcLastRow < 2) {
      Logger.log("No rows in external source.");
      _sync_applyJobIdArrayFormula(tgtSheet, _sync_ensureTargetHeaders(tgtSheet));
      return;
    }

    const targetHeaderIndex = _sync_ensureTargetHeaders(tgtSheet);
    const targetColumnCount = _sync_headerCount(targetHeaderIndex);

    // Ensure Job ID formula exists and owns the Job ID column.
    _sync_applyJobIdArrayFormula(tgtSheet, targetHeaderIndex);

    // Read A:P from source.
    const srcRange = srcSheet.getRange(2, 1, srcLastRow - 1, EXTERNAL_SYNC.SOURCE_COLS_A_TO_P);
    const srcValues = srcRange.getValues();
    const srcRich = srcRange.getRichTextValues();

    // Build existing row lookup from target and dedupe keys from archive.
    const targetRowLookup = _sync_buildRowLookup(tgtSheet);
    const archivedKeys = new Set();

    if (EXTERNAL_SYNC.CHECK_ARCHIVE_TOO) {
      const archive = tgtSS.getSheetByName(INGEST_CONFIG.archiveSheetName);
      if (archive) _sync_addKeysFromSheet(archivedKeys, archive);
    }

    const toAppendValues = [];
    const richWriteQueue = [];
    let refreshedCount = 0;

    const jobIdCol1Based = (targetHeaderIndex["Job ID"] != null ? targetHeaderIndex["Job ID"] : 1) + 1;

    srcValues.forEach((row, i) => {
      const mapped = _sync_mapSourceRow(row);
      const richRow = srcRich[i] || [];

      const normalizedCv = _sync_pickDocumentValue(mapped.cv, richRow[9]);
      const normalizedResume = _sync_pickDocumentValue(mapped.resume, richRow[10]);
      const normalizedPortfolio = _sync_pickDocumentValue(mapped.portfolio, richRow[11]);

      // External sheet has no native Job ID column for ingest purposes.
      // Use email + applyingFor + date presence as the row-validity gate.
      if (!mapped.email || !mapped.applyingFor) return;

      const externalRef = _sync_computeExternalSourceRef(row, {
        sourceSpreadsheetId: EXTERNAL_SYNC.SOURCE_SPREADSHEET_ID,
        sourceSheetName: EXTERNAL_SYNC.SOURCE_TAB_NAME,
        sourceRowNumber: i + 2
      });

      const derivedJobId = _sync_computeJobIdFromApplyingFor(mapped.applyingFor);
      const legacyKey = _sync_legacyKey(derivedJobId, mapped.email, mapped.date);
      const dedupeKey = externalRef || legacyKey;

      const targetRow = new Array(targetColumnCount).fill("");

      _sync_set(targetRow, targetHeaderIndex, "Date", mapped.date);

      // IMPORTANT:
      // Do not write Job ID here. Column B is controlled by ARRAYFORMULA.
      // _sync_set(targetRow, targetHeaderIndex, "Job ID", "");

      _sync_set(targetRow, targetHeaderIndex, "Applying for", mapped.applyingFor);
      _sync_set(targetRow, targetHeaderIndex, "First name", mapped.firstName);
      _sync_set(targetRow, targetHeaderIndex, "Last name", mapped.lastName);
      _sync_set(targetRow, targetHeaderIndex, "Email", mapped.emailRaw);
      _sync_set(targetRow, targetHeaderIndex, "Contact number", mapped.contactNumber);
      _sync_set(targetRow, targetHeaderIndex, "Educational Qualification", mapped.educationalQualification);
      _sync_set(targetRow, targetHeaderIndex, "Years of experience", mapped.yearsOfExperience);
      _sync_set(targetRow, targetHeaderIndex, "City", mapped.city);
      _sync_set(targetRow, targetHeaderIndex, "Willing to Relocate?", mapped.willingToRelocate);
      _sync_set(targetRow, targetHeaderIndex, "Terms", mapped.terms);
      _sync_set(targetRow, targetHeaderIndex, "Portfolio", normalizedPortfolio);
      _sync_set(targetRow, targetHeaderIndex, "CV", normalizedCv);
      _sync_set(targetRow, targetHeaderIndex, "Resume", normalizedResume);
      _sync_set(
        targetRow,
        targetHeaderIndex,
        "Source Channel",
        EXTERNAL_SYNC.SOURCE_CHANNEL_LABEL || INGEST_CONFIG.defaultSourceChannel || "google_sheet"
      );
      _sync_set(targetRow, targetHeaderIndex, "External Source Ref", externalRef);

      const existingTarget = _sync_findRowLookupEntry(targetRowLookup, externalRef, legacyKey);
      if (existingTarget) {
        const refreshed = _sync_refreshExistingTargetRow(
          tgtSheet,
          existingTarget,
          targetHeaderIndex,
          targetRow,
          targetColumnCount,
          jobIdCol1Based,
          {
            cv: richRow[9],
            resume: richRow[10],
            portfolio: richRow[11]
          }
        );
        if (refreshed) refreshedCount += 1;
        return;
      }

      if (archivedKeys.has(dedupeKey)) return;

      toAppendValues.push(targetRow);

      // Correct rich text mapping from source:
      // J -> CV, K -> Resume, L -> Portfolio
      _sync_queueRichText(richWriteQueue, toAppendValues.length - 1, targetHeaderIndex, "CV", richRow[9]);
      _sync_queueRichText(richWriteQueue, toAppendValues.length - 1, targetHeaderIndex, "Resume", richRow[10]);
      _sync_queueRichText(richWriteQueue, toAppendValues.length - 1, targetHeaderIndex, "Portfolio", richRow[11]);

    });

    if (!toAppendValues.length && !refreshedCount) {
      Logger.log("No new or updated rows to sync.");
      _sync_applyJobIdArrayFormula(tgtSheet, targetHeaderIndex);
      return;
    }

    if (toAppendValues.length) {
      const startRow = tgtSheet.getLastRow() + 1;
      _sync_writeRowsSkippingColumns(tgtSheet, startRow, toAppendValues, targetColumnCount, [jobIdCol1Based]);
      _sync_applyQueuedRichText(tgtSheet, startRow, richWriteQueue);
    }

    // Re-apply formula so old wrong/manual Job IDs also get corrected.
    _sync_applyJobIdArrayFormula(tgtSheet, targetHeaderIndex);

    Logger.log(
      `Synced ${toAppendValues.length} new row(s) and refreshed ${refreshedCount} existing row(s) in "${tgtSheet.getName()}".`
    );
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
  const applyingForIdx = idx["Applying for"] != null ? idx["Applying for"] : idx["applying_for"];
  const emailIdx = idx["Email"] != null ? idx["Email"] : idx["email"];
  const dateIdx = idx["Date"] != null ? idx["Date"] : idx["date"];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    const ext = _sync_normalizeRef(externalRefIdx == null ? "" : row[externalRefIdx]);
    if (ext) {
      keySet.add(ext);
      continue;
    }

    const applyingFor = applyingForIdx == null ? "" : String(row[applyingForIdx] || "").trim();
    const computedJobId = _sync_computeJobIdFromApplyingFor(applyingFor);
    const existingJobId = jobIdx == null ? "" : String(row[jobIdx] || "").trim();
    const jobId = computedJobId || existingJobId;

    const email = emailIdx == null ? "" : String(row[emailIdx] || "").trim().toLowerCase();
    const date = dateIdx == null ? "" : _sync_normalizeDateForKey(row[dateIdx]);

    if (!jobId || !email) continue;
    keySet.add(_sync_legacyKey(jobId, email, date));
  }
}

function _sync_buildRowLookup(sheet) {
  const lookup = {
    byExternalRef: {},
    byLegacyKey: {}
  };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return lookup;

  const width = Math.max(1, sheet.getLastColumn());
  const data = sheet.getRange(1, 1, lastRow, width).getValues();
  if (!data || data.length < 2) return lookup;

  const headers = data[0].map((h) => String(h || "").trim());
  const idx = _sync_buildHeaderIndex(headers);

  const externalRefIdx =
    idx["External Source Ref"] != null ? idx["External Source Ref"] : idx["external_source_ref"];
  const jobIdx = idx["Job ID"] != null ? idx["Job ID"] : idx["job_id"];
  const applyingForIdx = idx["Applying for"] != null ? idx["Applying for"] : idx["applying_for"];
  const emailIdx = idx["Email"] != null ? idx["Email"] : idx["email"];
  const dateIdx = idx["Date"] != null ? idx["Date"] : idx["date"];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const entry = { rowNumber: i + 1, row };

    const ext = _sync_normalizeRef(externalRefIdx == null ? "" : row[externalRefIdx]);
    if (ext && lookup.byExternalRef[ext] == null) {
      lookup.byExternalRef[ext] = entry;
    }

    const applyingFor = applyingForIdx == null ? "" : String(row[applyingForIdx] || "").trim();
    const computedJobId = _sync_computeJobIdFromApplyingFor(applyingFor);
    const existingJobId = jobIdx == null ? "" : String(row[jobIdx] || "").trim();
    const jobId = computedJobId || existingJobId;
    const email = emailIdx == null ? "" : String(row[emailIdx] || "").trim().toLowerCase();
    const date = dateIdx == null ? "" : _sync_normalizeDateForKey(row[dateIdx]);

    if (!jobId || !email) continue;
    const legacyKey = _sync_legacyKey(jobId, email, date);
    if (legacyKey && lookup.byLegacyKey[legacyKey] == null) {
      lookup.byLegacyKey[legacyKey] = entry;
    }
  }

  return lookup;
}

function _sync_findRowLookupEntry(lookup, externalRef, legacyKey) {
  if (!lookup) return null;
  const normalizedRef = _sync_normalizeRef(externalRef);
  if (normalizedRef && lookup.byExternalRef[normalizedRef]) {
    return lookup.byExternalRef[normalizedRef];
  }
  if (legacyKey && lookup.byLegacyKey[legacyKey]) {
    return lookup.byLegacyKey[legacyKey];
  }
  return null;
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
    // Correct source mapping from screenshots
    applyingFor: String(row[0] || "").trim(),                 // A
    firstName: String(row[1] || "").trim(),                   // B
    lastName: String(row[2] || "").trim(),                    // C
    emailRaw: String(row[3] || "").trim(),                    // D
    email: String(row[3] || "").trim().toLowerCase(),         // D
    contactNumber: String(row[4] || "").trim(),               // E
    educationalQualification: String(row[5] || "").trim(),    // F
    yearsOfExperience: row[6],                                // G
    city: String(row[7] || "").trim(),                        // H
    willingToRelocate: String(row[8] || "").trim(),           // I
    cv: String(row[9] || "").trim(),                          // J Upload Covering Letter -> target CV
    resume: String(row[10] || "").trim(),                     // K Upload Resume -> target Resume
    portfolio: String(row[11] || "").trim(),                  // L Upload Portfolio -> target Portfolio
    terms: String(row[12] || "").trim(),                      // M
    date: row[13]                                             // N
    // O, P intentionally ignored for ingest mapping
  };
}

function _sync_computeExternalSourceRef(row, context) {
  const ctx = context || {};
  const mapped = _sync_mapSourceRow(row);
  const appliedAt = _sync_normalizeDateForKey(mapped.date);

  const pieces = [
    "google_sheet",
    String(ctx.sourceSpreadsheetId || "").trim(),
    String(ctx.sourceSheetName || "").trim(),
    appliedAt,
    mapped.applyingFor,
    mapped.email,
    mapped.firstName,
    mapped.lastName,
    mapped.contactNumber,
    mapped.educationalQualification,
    String(mapped.yearsOfExperience || "").trim(),
    mapped.city,
    mapped.willingToRelocate,
    mapped.cv,
    mapped.resume,
    mapped.portfolio,
    mapped.terms
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

function _sync_computeJobIdFromApplyingFor(applyingFor) {
  const role = _sync_normalizeRole(applyingFor);

  switch (role) {
    case "OTHERS":
      return "OTHR-8299BF";
    case "INTERN":
      return "INTR-8299B8";
    case "COMMUNICATIONS INTERN":
      return "CMIN-8299B0";
    case "INTERIOR DESIGNER":
      return "INDS-8299A4";
    case "ARCHITECT":
      return "ARCH-82999A";
    case "SR. DESIGNER":
      return "SRDS-829990";
    case "SR. ARCHITECT":
      return "SRAR-829986";
    case "PROJECT DESIGNER":
      return "PRDS-82997A";
    case "ASSOCIATE":
      return "ASSO-82996A";
    case "GROUP LEADER":
      return "GRPL-829955";
    default:
      return "";
  }
}

function _sync_normalizeRole(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function _sync_applyJobIdArrayFormula(sheet, headerIndex) {
  const jobIdIdx = headerIndex["Job ID"];
  const applyingForIdx = headerIndex["Applying for"];

  if (jobIdIdx == null || applyingForIdx == null) return;

  const jobIdCol = jobIdIdx + 1; // 1-based
  const applyingForColLetter = _sync_colToLetter(applyingForIdx + 1);

  const formula =
    `=ARRAYFORMULA(` +
    `IF(${applyingForColLetter}2:${applyingForColLetter}="","",` +
    `SWITCH(UPPER(TRIM(${applyingForColLetter}2:${applyingForColLetter})),` +
    `"OTHERS","OTHR-8299BF",` +
    `"INTERN","INTR-8299B8",` +
    `"COMMUNICATIONS INTERN","CMIN-8299B0",` +
    `"INTERIOR DESIGNER","INDS-8299A4",` +
    `"ARCHITECT","ARCH-82999A",` +
    `"SR. DESIGNER","SRDS-829990",` +
    `"SR. ARCHITECT","SRAR-829986",` +
    `"PROJECT DESIGNER","PRDS-82997A",` +
    `"ASSOCIATE","ASSO-82996A",` +
    `"GROUP LEADER","GRPL-829955",` +
    `""` +
    `)))`;

  const maxRowsToClear = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, jobIdCol, maxRowsToClear, 1).clearContent();
  sheet.getRange(2, jobIdCol).setFormula(formula);
}

function _sync_writeRowsSkippingColumns(sheet, startRow, rows, totalCols, skipCols1Based) {
  if (!rows || !rows.length || !totalCols) return;

  const skipSet = {};
  (skipCols1Based || []).forEach((col) => {
    if (col >= 1 && col <= totalCols) skipSet[col] = true;
  });

  let blockStart = null;

  for (let col = 1; col <= totalCols + 1; col++) {
    const isEnd = col === totalCols + 1;
    const isSkipped = !isEnd && !!skipSet[col];

    if (!isEnd && !isSkipped && blockStart == null) {
      blockStart = col;
    }

    if (blockStart != null && (isEnd || isSkipped)) {
      const width = col - blockStart;
      if (width > 0) {
        const blockValues = rows.map((row) =>
          row.slice(blockStart - 1, blockStart - 1 + width)
        );
        sheet.getRange(startRow, blockStart, rows.length, width).setValues(blockValues);
      }
      blockStart = null;
    }
  }
}

function _sync_refreshExistingTargetRow(
  sheet,
  entry,
  headerIndex,
  targetRow,
  totalCols,
  jobIdCol1Based,
  richFields
) {
  if (!entry || !entry.rowNumber || !targetRow) return false;
  const rowNumber = entry.rowNumber;
  const skipCols = [jobIdCol1Based];
  const needsValueRefresh = _sync_rowNeedsRefresh(entry.row, targetRow, skipCols);
  const needsRichRefresh = _sync_richRefreshRequested(richFields);

  if (!needsValueRefresh && !needsRichRefresh) {
    return false;
  }

  if (needsValueRefresh) {
    _sync_writeRowsSkippingColumns(sheet, rowNumber, [targetRow], totalCols, skipCols);
    entry.row = targetRow.slice();
  }

  _sync_applyRichFieldIfPresent(sheet, rowNumber, headerIndex, "CV", richFields && richFields.cv);
  _sync_applyRichFieldIfPresent(sheet, rowNumber, headerIndex, "Resume", richFields && richFields.resume);
  _sync_applyRichFieldIfPresent(
    sheet,
    rowNumber,
    headerIndex,
    "Portfolio",
    richFields && richFields.portfolio
  );
  return true;
}

function _sync_legacyKey(jobId, email, date) {
  return [
    String(jobId || "").trim().toLowerCase(),
    String(email || "").trim().toLowerCase(),
    String(date || "").trim().toLowerCase()
  ].join("|");
}

function _sync_normalizeDateForKey(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value || "").trim();
}

function _sync_normalizeRef(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, 191);
}

function _sync_rowNeedsRefresh(existingRow, targetRow, skipCols1Based) {
  if (!existingRow || !targetRow) return true;

  const skipSet = {};
  (skipCols1Based || []).forEach((col) => {
    if (col >= 1) skipSet[col] = true;
  });

  const width = Math.max(existingRow.length, targetRow.length);
  for (let i = 0; i < width; i++) {
    if (skipSet[i + 1]) continue;
    if (_sync_compareCellValues(existingRow[i], targetRow[i])) continue;
    return true;
  }
  return false;
}

function _sync_compareCellValues(left, right) {
  const leftNormalized = _sync_normalizeComparableValue(left);
  const rightNormalized = _sync_normalizeComparableValue(right);
  return leftNormalized === rightNormalized;
}

function _sync_normalizeComparableValue(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  }
  if (value == null) return "";
  return String(value).trim();
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

function _sync_richRefreshRequested(richFields) {
  if (!richFields) return false;
  return Boolean(richFields.cv || richFields.resume || richFields.portfolio);
}

function _sync_applyRichFieldIfPresent(sheet, rowNumber, headerIndex, headerName, richText) {
  const idx = headerIndex[headerName];
  if (idx == null || idx < 0 || !richText) return;
  try {
    sheet.getRange(rowNumber, idx + 1, 1, 1).setRichTextValue(richText);
  } catch (err) {
    Logger.log(`Could not set rich text for ${headerName} at row ${rowNumber}: ${err}`);
  }
}

function _sync_pickDocumentValue(value, richText) {
  if (_sync_looksLikeUrl(value)) return String(value || "").trim();
  const link = _sync_extractLinkFromRichText(richText);
  return link || String(value || "").trim();
}

function _sync_extractLinkFromRichText(richText) {
  try {
    if (!richText) return "";
    const direct = richText.getLinkUrl ? richText.getLinkUrl() : "";
    if (direct) return String(direct).trim();

    const runs = richText.getRuns ? richText.getRuns() : [];
    for (let i = 0; i < runs.length; i++) {
      const runLink = runs[i].getLinkUrl ? runs[i].getLinkUrl() : "";
      if (runLink) return String(runLink).trim();
    }
  } catch (err) {
    Logger.log(`Could not parse source hyperlink: ${err}`);
  }
  return "";
}

function _sync_looksLikeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  try {
    const parsed = new URL(text);
    return /^https?:$/i.test(parsed.protocol) && !!parsed.hostname;
  } catch (err) {
    return false;
  }
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

function _sync_colToLetter(col) {
  let letter = "";
  let temp = col;

  while (temp > 0) {
    const remainder = (temp - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    temp = Math.floor((temp - 1) / 26);
  }

  return letter;
}
