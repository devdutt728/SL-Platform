/**
 * Production-safe Google Sheet -> Recruitment ingestion script.
 *
 * Required script properties:
 * - SHEET_INGEST_TOKEN: shared secret matching SL_SHEET_INGEST_TOKEN
 * - RECRUITMENT_INGEST_ENDPOINT: e.g. https://studiolotushub.in/recruitment/api/rec/candidates/import/google-sheet
 * Optional script properties:
 * - SHEET_TAB_NAME: exact tab name to ingest from (overrides defaults)
 */

/**
 * Quick setup (no Script Properties UI needed):
 * 1) Paste non-secret values below once.
 * 2) Run `setIngestTokenFromPrompt()` or set `SHEET_INGEST_TOKEN` in Script Properties.
 * 3) Run `bootstrapIngest()`.
 */
const INGEST_ONE_TIME_SETUP = {
  SHEET_TAB_NAME: "Master Data",
  RECRUITMENT_INGEST_ENDPOINT:
    "https://studiolotushub.in/recruitment/api/rec/candidates/import/google-sheet",
  // Keep empty in source code. Set via Script Properties or setIngestTokenFromPrompt().
  // Never commit secrets to source.
  SHEET_INGEST_TOKEN: ""
};

const INGEST_CONFIG = {
  sheetName: "Master Data",
  fallbackSheetNames: ["Website - Candidates", "Sheet 1", "Sheet1"],
  archiveSheetName: "Ingest Archive",
  auditSheetName: "Ingest Audit Log",
  auditMaxRows: 2000,
  archiveStatuses: ["created"],
  archiveMinAgeHours: 0,
  defaultSourceChannel: "google_sheet",
  requiredHeaderHints: ["Job ID", "First name", "Last name", "Email", "Terms"],
  statusColumn: "ingest_status",
  codeColumn: "candidate_code",
  messageColumn: "ingest_message",
  emailStatusColumn: "email_status",
  emailErrorColumn: "email_error",
  ingestedAtColumn: "ingested_at",
  retryCountColumn: "retry_count",
  lastAttemptAtColumn: "last_attempt_at",
  nextRetryAtColumn: "next_retry_at",
  documentRepairStatusColumn: "doc_repair_status",
  documentRepairMessageColumn: "doc_repair_message",
  documentRepairedAtColumn: "doc_repaired_at",
  rowUidColumn: "ingest_row_uid",
  processingStaleMinutes: 15,
  batchSize: 10,
  repairBatchSize: 25,
  requestTimeoutMs: 120000,
  maxRetries: 5,
  retryBaseDelaySeconds: 300,
  retryMaxDelaySeconds: 14400,
  retryJitterSeconds: 90,
  transientBatchStatusCodes: [408, 425, 429, 500, 502, 503, 504, 524],
  permanentRowErrorPatterns: [
    "missing required columns",
    "terms must be accepted",
    "opening not found",
    "opening title mismatch",
    "multiple active openings found",
    "is inactive",
    "invalid row payload",
    "must be a valid public url",
    "payload too large",
    "exceeds max allowed size",
    "max allowed is"
  ],
  skipStatuses: [
    "created",
    "reapplied",
    "duplicate",
    "duplicate_recent",
    "duplicate_idempotent",
    "processing",
    "failed_permanent"
  ],
  duplicateCooldownHours: 24,
  changeTriggerHandler: "handleIngestSheetChange",
  syncTriggerHandler: "runScheduledExternalSync",
  scheduledTriggerHandler: "runScheduledIngestRetry",
  legacyScheduledTriggerHandler: "runScheduledIngest",
  syncEveryMinutes: 5,
  scheduledEveryMinutes: 5
};

const INGEST_AUDIT_HEADERS = [
  "audit_at",
  "run_id",
  "level",
  "event_type",
  "sheet_id",
  "sheet_name",
  "batch_id",
  "row_number",
  "row_key",
  "status",
  "http_status",
  "retry_count",
  "next_retry_at",
  "message",
  "details_json"
];

/**
 * Run once manually to create/refresh installable triggers.
 * Creates:
 * - onChange trigger (row insert in workbook)
 * - time-driven trigger (retry safety net)
 */
function setupIngestTriggers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allTriggers = ScriptApp.getProjectTriggers();

  allTriggers.forEach((trigger) => {
    const handler = trigger.getHandlerFunction();
    if (
      handler === INGEST_CONFIG.changeTriggerHandler ||
      handler === INGEST_CONFIG.syncTriggerHandler ||
      handler === INGEST_CONFIG.scheduledTriggerHandler ||
      handler === INGEST_CONFIG.legacyScheduledTriggerHandler ||
      handler === "handleIngestSheetEdit"
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(INGEST_CONFIG.changeTriggerHandler)
    .forSpreadsheet(ss)
    .onChange()
    .create();

  ScriptApp.newTrigger(INGEST_CONFIG.syncTriggerHandler)
    .timeBased()
    .everyMinutes(INGEST_CONFIG.syncEveryMinutes)
    .create();

  ScriptApp.newTrigger(INGEST_CONFIG.scheduledTriggerHandler)
    .timeBased()
    .everyMinutes(INGEST_CONFIG.scheduledEveryMinutes)
    .create();

  Logger.log("Ingest triggers installed/refreshed.");
}

/**
 * One-click bootstrap:
 * - Writes config to Script Properties
 * - Installs triggers
 * - Prints effective config
 * - Verifies endpoint/token wiring
 *
 * Run this once after token is set in Script Properties.
 */
function bootstrapIngest() {
  _applyInlineSetupToScriptProperties();
  setupIngestTriggers();
  showIngestConfig();
  const verifyCode = verifyIngestEndpoint();
  if (verifyCode === 400) {
    Logger.log("Endpoint check passed. Running first ingest now...");
    pushCandidatesToRecruitment();
  } else {
    Logger.log("Skipped first ingest because endpoint/token verification did not pass.");
  }
}

/**
 * Installable onChange trigger handler.
 * Runs ingest when rows are inserted.
 */
function handleIngestSheetChange(e) {
  try {
    const changeType = String((e && e.changeType) || "").toUpperCase();
    if (changeType !== "INSERT_ROW") return;
    pushCandidatesToRecruitment();
  } catch (err) {
    Logger.log(`handleIngestSheetChange failed: ${err}`);
  }
}

/**
 * Installable time-driven trigger handler.
 * Retries rows missed by onChange or failed due transient errors.
 */
function runScheduledExternalSync() {
  try {
    syncExternalUpdatedToIngestQueue(); // pulls correct columns
  } catch (err) {
    Logger.log(`runScheduledExternalSync failed: ${err}`);
  }
}

function runScheduledIngestRetry() {
  try {
    pushCandidatesToRecruitment({ suppressIdleAudit: true }); // your existing ingest flow
  } catch (err) {
    Logger.log(`runScheduledIngestRetry failed: ${err}`);
  }
}

// Legacy combined handler kept only so old triggers do not hard-fail before cleanup.
function runScheduledIngest() {
  runScheduledExternalSync();
  runScheduledIngestRetry();
}

function deleteExternalSyncTrigger() {
  let deleted = 0;
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === INGEST_CONFIG.syncTriggerHandler) {
      ScriptApp.deleteTrigger(trigger);
      deleted += 1;
    }
  });
  Logger.log(`Deleted ${deleted} external sync trigger(s).`);
  return deleted;
}

function showInstalledIngestTriggers() {
  const output = ScriptApp.getProjectTriggers().map((trigger) => ({
    handler: trigger.getHandlerFunction(),
    event_type: String(trigger.getEventType ? trigger.getEventType() : ""),
    trigger_source: String(trigger.getTriggerSource ? trigger.getTriggerSource() : "")
  }));
  Logger.log(JSON.stringify(output));
  return output;
}

/**
 * One-time repair helper for rows that already exist in backend but are stale in the sheet.
 * Edit the row numbers if you need a different set, then run this manually.
 */
function repairKnownCreatedRows() {
  _resetIngestOpsForRows([5, 6, 7], { rerunIngest: true });
}

function repairMissingCandidateDocuments(options) {
  const opts = options || {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log("Document repair skipped: could not acquire lock.");
    return;
  }

  try {
    const endpoint = _getDocumentRepairEndpoint();
    const token = _requiredProp("SHEET_INGEST_TOKEN");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const requestedSheetName = String(opts.sheetName || "").trim();
    const sheet = requestedSheetName ? ss.getSheetByName(requestedSheetName) : _resolveTargetSheet(ss);
    if (!sheet) {
      throw new Error("Target ingest sheet not found (check SHEET_TAB_NAME).");
    }
    Logger.log(`Document repair scanning sheet: ${sheet.getName()}`);

    const range = sheet.getDataRange();
    const values = range.getValues();
    const richValues = range.getRichTextValues();
    const formulaValues = range.getFormulas();
    if (!values.length || values.length === 1) {
      Logger.log("Document repair skipped: no data rows found.");
      return {
        requested_rows: 0,
        repaired_count: 0,
        skipped_count: 0,
        failed_count: 0
      };
    }

    const headers = values[0].map((h) => String(h || "").trim());
    const headerIndex = _buildHeaderIndex(headers);
    _ensureOpsColumns(sheet, headers, headerIndex);

    const pending = [];
    let localValidationFailed = 0;
    let skippedNoLookup = 0;
    let skippedNoUrls = 0;
    const validationSamples = [];

    const dataRows = values.slice(1);
    _ensureRowUidsForLoadedRows(sheet, dataRows, headerIndex);

    dataRows.forEach((row, idx) => {
      const richRow = richValues[idx + 1] || null;
      const formulaRow = formulaValues[idx + 1] || null;
      const rowNumber = idx + 2;
      const rowKey = String(rowNumber);
      const rowUid = _readCell(row, headerIndex, INGEST_CONFIG.rowUidColumn);
      const candidateCode = _readCell(row, headerIndex, INGEST_CONFIG.codeColumn).toUpperCase();
      const externalSourceRef =
        _readCell(row, headerIndex, "External Source Ref") ||
        _readCell(row, headerIndex, "external_source_ref");
      const email = _readCell(row, headerIndex, "Email").toLowerCase();
      const jobId = _readCell(row, headerIndex, "Job ID").toUpperCase();
      const applyingFor = _readCell(row, headerIndex, "Applying for");

      if (!candidateCode && !externalSourceRef && !(email && (jobId || applyingFor))) {
        skippedNoLookup += 1;
        return;
      }

      const portfolioField = _readOptionalDocumentField(row, richRow, formulaRow, headerIndex, "Portfolio");
      const cvField = _readOptionalDocumentField(row, richRow, formulaRow, headerIndex, "CV");
      const resumeField = _readOptionalDocumentField(row, richRow, formulaRow, headerIndex, "Resume");
      const validationErrors = [];
      const validDocumentCount =
        (portfolioField.value ? 1 : 0) + (cvField.value ? 1 : 0) + (resumeField.value ? 1 : 0);

      if (portfolioField.error) validationErrors.push(portfolioField.error);
      if (cvField.error) validationErrors.push(cvField.error);
      if (resumeField.error) validationErrors.push(resumeField.error);

      if (validationErrors.length && !validDocumentCount) {
        localValidationFailed += 1;
        if (validationSamples.length < 5) {
          validationSamples.push({
            row: rowNumber,
            candidate_code: candidateCode || "",
            errors: validationErrors,
            portfolio: _debugDocumentFieldSnapshot(row, richRow, formulaRow, headerIndex, "Portfolio"),
            cv: _debugDocumentFieldSnapshot(row, richRow, formulaRow, headerIndex, "CV"),
            resume: _debugDocumentFieldSnapshot(row, richRow, formulaRow, headerIndex, "Resume")
          });
        }
        _writeDocumentRepairStatus(
          sheet,
          rowNumber,
          headerIndex,
          "error",
          validationErrors.join(" "),
          new Date().toISOString()
        );
        return;
      }

      if (!validDocumentCount) {
        skippedNoUrls += 1;
        return;
      }

      pending.push({
        rowNumber,
        warningMessage: validationErrors.length
          ? _prefixMessage(validationErrors.join(" "), "Ignored invalid document fields")
          : "",
        payload: {
          row_key: rowKey,
          candidate_code: candidateCode || "",
          external_source_ref:
            externalSourceRef ||
            _deriveExternalSourceRef(
              {
                date: _readCell(row, headerIndex, "Date"),
                job_id: jobId || "",
                applying_for: applyingFor || "",
                email: email || "",
                first_name: _readCell(row, headerIndex, "First name"),
                last_name: _readCell(row, headerIndex, "Last name"),
                portfolio: portfolioField.value || "",
                cv: cvField.value || "",
                resume: resumeField.value || ""
              },
              {
                sheetId: ss.getId(),
                sheetName: sheet.getName(),
                rowKey: rowKey,
                rowUid: rowUid
              }
            ),
          opening_code: jobId || "",
          applying_for: applyingFor || "",
          email: email || "",
          portfolio_url: portfolioField.value || "",
          cv_url: cvField.value || "",
          resume_url: resumeField.value || ""
        }
      });
    });

    if (!pending.length) {
      Logger.log(
        `No document repair rows were eligible. scanned_rows=${Math.max(values.length - 1, 0)}, skipped_no_lookup=${skippedNoLookup}, skipped_no_urls=${skippedNoUrls}, validation_failed=${localValidationFailed}`
      );
      if (validationSamples.length) {
        Logger.log(`Document repair validation samples: ${JSON.stringify(validationSamples)}`);
      }
      return {
        requested_rows: 0,
        repaired_count: 0,
        skipped_count: 0,
        failed_count: localValidationFailed
      };
    }

    const summary = {
      requested_rows: pending.length,
      repaired_count: 0,
      skipped_count: 0,
      failed_count: localValidationFailed
    };

    if (opts.dryRun) {
      Logger.log(
        `Document repair dry run. requested_rows=${summary.requested_rows}, skipped_no_lookup=${skippedNoLookup}, skipped_no_urls=${skippedNoUrls}, validation_failed=${localValidationFailed}`
      );
      return summary;
    }

    for (let i = 0; i < pending.length; i += INGEST_CONFIG.repairBatchSize) {
      const batch = pending.slice(i, i + INGEST_CONFIG.repairBatchSize);
      const processedAt = new Date().toISOString();
      _markDocumentRepairBatchProcessing(sheet, batch, headerIndex, processedAt);

      let response;
      try {
        response = UrlFetchApp.fetch(endpoint, {
          method: "post",
          contentType: "application/json",
          headers: { "x-sheet-ingest-token": token },
          payload: JSON.stringify({
            batch_id: _newBatchId(i / INGEST_CONFIG.repairBatchSize + 1),
            sheet_id: ss.getId(),
            sheet_name: sheet.getName(),
            replace_existing: !!opts.replaceExisting,
            rows: batch.map((entry) => entry.payload)
          }),
          muteHttpExceptions: true,
          followRedirects: true
        });
      } catch (err) {
        const message = `Document repair transport failure: ${_toErrorMessage(err)}`;
        batch.forEach((entry) => {
          summary.failed_count += 1;
          _writeDocumentRepairStatus(sheet, entry.rowNumber, headerIndex, "error", message, processedAt);
        });
        continue;
      }

      const statusCode = response.getResponseCode();
      const bodyText = response.getContentText();
      if (statusCode < 200 || statusCode >= 300) {
        const message = `Document repair failed (${statusCode}): ${bodyText || "no response body"}`;
        batch.forEach((entry) => {
          summary.failed_count += 1;
          _writeDocumentRepairStatus(sheet, entry.rowNumber, headerIndex, "error", message, processedAt);
        });
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(bodyText);
      } catch (err) {
        const message = `Document repair parse failure: ${_toErrorMessage(err)}`;
        batch.forEach((entry) => {
          summary.failed_count += 1;
          _writeDocumentRepairStatus(sheet, entry.rowNumber, headerIndex, "error", message, processedAt);
        });
        continue;
      }

      const resultByRowKey = {};
      (parsed.results || []).forEach((result) => {
        if (!result || result.row_key == null) return;
        resultByRowKey[String(result.row_key)] = result;
      });

      batch.forEach((entry) => {
        const result = resultByRowKey[String(entry.payload.row_key)];
        if (!result) {
          summary.failed_count += 1;
          _writeDocumentRepairStatus(
            sheet,
            entry.rowNumber,
            headerIndex,
            "error",
            "No document repair result returned for row.",
            processedAt
          );
          return;
        }

        const statusValue = String(result.status || "error").trim().toLowerCase();
        const message = _appendMessages(
          String(result.message || "").trim(),
          entry.warningMessage || ""
        );
        _writeDocumentRepairStatus(sheet, entry.rowNumber, headerIndex, statusValue, message, processedAt);

        const returnedCode = String(result.candidate_code || "").trim();
        if (returnedCode && headerIndex[INGEST_CONFIG.codeColumn] != null) {
          sheet.getRange(entry.rowNumber, headerIndex[INGEST_CONFIG.codeColumn] + 1).setValue(returnedCode);
        }

        if (statusValue === "repaired") {
          summary.repaired_count += 1;
        } else if (statusValue === "skipped") {
          summary.skipped_count += 1;
        } else {
          summary.failed_count += 1;
        }
      });
    }

    Logger.log(
      `Document repair completed. requested_rows=${summary.requested_rows}, repaired_count=${summary.repaired_count}, skipped_count=${summary.skipped_count}, failed_count=${summary.failed_count}, skipped_no_lookup=${skippedNoLookup}, skipped_no_urls=${skippedNoUrls}`
    );
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function repairAllCandidateDocumentsFromSheet() {
  return repairMissingCandidateDocuments({ replaceExisting: false });
}

function debugDocumentRepairEligibility(sheetName) {
  return repairMissingCandidateDocuments({
    replaceExisting: false,
    sheetName: sheetName || "",
    dryRun: true
  });
}

function inspectDocumentFieldShapes(sheetName, rowNumbers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requestedSheetName = String(sheetName || "").trim();
  const sheet = requestedSheetName ? ss.getSheetByName(requestedSheetName) : _resolveTargetSheet(ss);
  if (!sheet) {
    throw new Error("Target ingest sheet not found (check SHEET_TAB_NAME).");
  }

  const range = sheet.getDataRange();
  const values = range.getValues();
  const richValues = range.getRichTextValues();
  const formulaValues = range.getFormulas();
  if (!values.length) {
    throw new Error("Target sheet has no headers.");
  }

  const headers = values[0].map((h) => String(h || "").trim());
  const headerIndex = _buildHeaderIndex(headers);
  const sampleRows = (rowNumbers || []).length ? rowNumbers : [2, 3, 4, 5, 6];
  const output = [];

  sampleRows.forEach((rowNumberRaw) => {
    const rowNumber = Math.floor(Number(rowNumberRaw || 0));
    if (!Number.isFinite(rowNumber) || rowNumber < 2 || rowNumber > values.length) return;
    const row = values[rowNumber - 1] || [];
    const richRow = richValues[rowNumber - 1] || null;
    const formulaRow = formulaValues[rowNumber - 1] || null;
    output.push({
      row: rowNumber,
      candidate_code: _readCell(row, headerIndex, INGEST_CONFIG.codeColumn),
      email: _readCell(row, headerIndex, "Email"),
      portfolio: _debugDocumentFieldSnapshot(row, richRow, formulaRow, headerIndex, "Portfolio"),
      cv: _debugDocumentFieldSnapshot(row, richRow, formulaRow, headerIndex, "CV"),
      resume: _debugDocumentFieldSnapshot(row, richRow, formulaRow, headerIndex, "Resume")
    });
  });

  Logger.log(`Document field shapes for ${sheet.getName()}: ${JSON.stringify(output)}`);
  return output;
}

function _markDocumentRepairBatchProcessing(sheet, batch, headerIndex, processedAt) {
  (batch || []).forEach((entry) => {
    _writeDocumentRepairStatus(
      sheet,
      entry.rowNumber,
      headerIndex,
      "processing",
      "Repairing missing application documents...",
      processedAt
    );
  });
}

function _writeDocumentRepairStatus(sheet, rowNumber, headerIndex, status, message, processedAt) {
  const statusIdx = _headerIndexOf(headerIndex, INGEST_CONFIG.documentRepairStatusColumn);
  const messageIdx = _headerIndexOf(headerIndex, INGEST_CONFIG.documentRepairMessageColumn);
  const processedIdx = _headerIndexOf(headerIndex, INGEST_CONFIG.documentRepairedAtColumn);
  if (statusIdx == null || messageIdx == null || processedIdx == null) return;

  sheet.getRange(rowNumber, statusIdx + 1).setValue(String(status || "").trim().toLowerCase());
  sheet.getRange(rowNumber, messageIdx + 1).setValue(message || "");
  sheet.getRange(rowNumber, processedIdx + 1).setValue(processedAt || "");
}

function countCurrentSheetRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = _resolveTargetSheet(ss);
  const tabNames = [];
  const seen = {};

  if (targetSheet) {
    const targetName = String(targetSheet.getName() || "").trim();
    if (targetName) {
      tabNames.push(targetName);
      seen[targetName] = true;
    }
  }

  const archiveName = String(INGEST_CONFIG.archiveSheetName || "").trim();
  if (archiveName && !seen[archiveName]) {
    tabNames.push(archiveName);
    seen[archiveName] = true;
  }

  const summaries = [];
  let combinedCandidateLikeRows = 0;

  tabNames.forEach((tabName) => {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      const missingSummary = {
        sheet_name: tabName,
        found: false,
        total_data_rows: 0,
        candidate_like_rows: 0,
        status_counts: {}
      };
      summaries.push(missingSummary);
      Logger.log(`${tabName}: not found`);
      return;
    }

    const values = sheet.getDataRange().getValues();
    if (!values.length || values.length === 1) {
      const emptySummary = {
        sheet_name: tabName,
        found: true,
        total_data_rows: 0,
        candidate_like_rows: 0,
        status_counts: {}
      };
      summaries.push(emptySummary);
      Logger.log(`${tabName}: total_data_rows=0, candidate_like_rows=0`);
      return;
    }

    const headers = values[0].map((h) => String(h || "").trim());
    const headerIndex = _buildHeaderIndex(headers);
    const rows = values.slice(1);
    const statusCounts = {};
    let candidateLikeRows = 0;

    rows.forEach((row) => {
      const email = _readCell(row, headerIndex, "Email");
      const externalRef =
        _readCell(row, headerIndex, "External Source Ref") ||
        _readCell(row, headerIndex, "external_source_ref");
      if (!email && !externalRef) return;

      candidateLikeRows += 1;
      const status = _readCell(row, headerIndex, INGEST_CONFIG.statusColumn).toLowerCase() || "(blank)";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    combinedCandidateLikeRows += candidateLikeRows;

    const summary = {
      sheet_name: tabName,
      found: true,
      total_data_rows: rows.length,
      candidate_like_rows: candidateLikeRows,
      status_counts: statusCounts
    };
    summaries.push(summary);
    Logger.log(
      `${tabName}: total_data_rows=${rows.length}, candidate_like_rows=${candidateLikeRows}, status_counts=${JSON.stringify(statusCounts)}`
    );
  });

  const output = {
    sheets: summaries,
    combined_candidate_like_rows: combinedCandidateLikeRows
  };
  Logger.log(`Combined candidate_like_rows=${combinedCandidateLikeRows}`);
  Logger.log(JSON.stringify(output));
  return output;
}

function archiveResolvedRowsNow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _resolveTargetSheet(ss);
  if (!sheet) {
    throw new Error("Target ingest sheet not found (check SHEET_TAB_NAME).");
  }

  const headers = sheet
    .getRange(1, 1, 1, Math.max(1, sheet.getLastColumn()))
    .getValues()[0]
    .map((h) => String(h || "").trim());

  const archivedCount = _archiveSuccessfulRows(ss, sheet, headers, { ignoreAge: true });
  const output = {
    archived_count: archivedCount,
    archive_sheet: INGEST_CONFIG.archiveSheetName,
    source_sheet: sheet.getName()
  };
  Logger.log(JSON.stringify(output));
  return output;
}

function trimIngestAuditLog(maxDataRows) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const auditSheet = _getOrCreateAuditSheet(ss);
  const keepRows = Math.max(0, Math.floor(Number(maxDataRows == null ? 1000 : maxDataRows)));
  const totalRows = auditSheet.getLastRow();
  const dataRows = Math.max(0, totalRows - 1);
  const overflow = dataRows - keepRows;

  if (overflow > 0) {
    auditSheet.deleteRows(2, overflow);
  }

  const output = {
    audit_sheet: auditSheet.getName(),
    kept_data_rows: keepRows,
    deleted_data_rows: Math.max(0, overflow),
    remaining_data_rows: Math.max(0, auditSheet.getLastRow() - 1)
  };
  Logger.log(JSON.stringify(output));
  return output;
}

function clearIngestAuditLog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const auditSheet = _getOrCreateAuditSheet(ss);
  const headers = _ensureAuditHeaders(auditSheet);
  const lastRow = auditSheet.getLastRow();
  if (lastRow > 1) {
    auditSheet.deleteRows(2, lastRow - 1);
  }
  const output = {
    audit_sheet: auditSheet.getName(),
    cleared: true,
    remaining_data_rows: 0,
    header_count: headers.length
  };
  Logger.log(JSON.stringify(output));
  return output;
}

function runIngestMaintenance() {
  const archived = archiveResolvedRowsNow();
  const audit = trimIngestAuditLog(1000);
  const output = {
    archived_count: archived.archived_count || 0,
    audit_remaining_rows: audit.remaining_data_rows || 0
  };
  Logger.log(JSON.stringify(output));
  return output;
}

function _resetIngestOpsForRows(rowNumbers, options) {
  const opts = options || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _resolveTargetSheet(ss);
  if (!sheet) {
    throw new Error("Target ingest sheet not found (check SHEET_TAB_NAME).");
  }

  const range = sheet.getDataRange();
  const values = range.getValues();
  if (!values.length) {
    throw new Error("Target sheet has no headers.");
  }

  const headers = values[0].map((h) => String(h || "").trim());
  const headerIndex = _buildHeaderIndex(headers);
  _ensureOpsColumns(sheet, headers, headerIndex);

  const columnsToClear = [
    INGEST_CONFIG.statusColumn,
    INGEST_CONFIG.codeColumn,
    INGEST_CONFIG.messageColumn,
    INGEST_CONFIG.emailStatusColumn,
    INGEST_CONFIG.emailErrorColumn,
    INGEST_CONFIG.ingestedAtColumn,
    INGEST_CONFIG.retryCountColumn,
    INGEST_CONFIG.lastAttemptAtColumn,
    INGEST_CONFIG.nextRetryAtColumn
  ];

  (rowNumbers || []).forEach((rowNumberRaw) => {
    const rowNumber = Math.floor(Number(rowNumberRaw || 0));
    if (!Number.isFinite(rowNumber) || rowNumber < 2) return;
    columnsToClear.forEach((columnName) => {
      const idx = headerIndex[columnName];
      if (idx == null || idx < 0) return;
      sheet.getRange(rowNumber, idx + 1).clearContent();
    });
  });

  Logger.log(`Cleared ingest ops columns for rows: ${(rowNumbers || []).join(", ")}`);
  if (opts.rerunIngest !== false) {
    pushCandidatesToRecruitment();
  }
}

function pushCandidatesToRecruitment(options) {
  const opts = options || {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log("Skipping run: could not acquire lock.");
    return;
  }

  let auditSpreadsheet = null;
  let auditContext = null;
  const auditEntries = [];
  try {
    const endpoint = _requiredProp("RECRUITMENT_INGEST_ENDPOINT");
    _assertEndpointIsHttps(endpoint);
    const token = _requiredProp("SHEET_INGEST_TOKEN");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    auditSpreadsheet = ss;
    const sheet = _resolveTargetSheet(ss);
    if (!sheet) {
      throw new Error(
        "Target sheet not found. Set SHEET_TAB_NAME script property or use one of: " +
          [INGEST_CONFIG.sheetName].concat(INGEST_CONFIG.fallbackSheetNames).join(", ")
      );
    }
    auditContext = {
      runId: _newRunId(),
      sheetId: ss.getId(),
      sheetName: sheet.getName()
    };
    _pushAuditEntry(auditEntries, auditContext, "INFO", "run_started", {
      details: {
        endpoint,
        batch_size: INGEST_CONFIG.batchSize,
        max_retries: INGEST_CONFIG.maxRetries
      }
    });
    Logger.log(`Using target sheet: ${sheet.getName()}`);

    const range = sheet.getDataRange();
    const values = range.getValues();
    const richValues = range.getRichTextValues();
    const formulaValues = range.getFormulas();
    if (!values.length || values.length === 1) {
      if (opts.suppressIdleAudit) {
        auditEntries.length = 0;
      } else {
        _pushAuditEntry(auditEntries, auditContext, "INFO", "run_no_data", {
          message: "No data rows found."
        });
      }
      Logger.log("No data rows found.");
      return;
    }

    const headers = values[0].map((h) => String(h || "").trim());
    const headerIndex = _buildHeaderIndex(headers);
    _ensureOpsColumns(sheet, headers, headerIndex);

    const rows = values.slice(1);
    _ensureRowUidsForLoadedRows(sheet, rows, headerIndex);
    const richRows = richValues.slice(1);
    const formulaRows = formulaValues.slice(1);
    const pending = _collectPendingRows(rows, richRows, formulaRows, headerIndex, {
      sheetId: ss.getId(),
      sheetName: sheet.getName()
    });
    if (!pending.length) {
      if (opts.suppressIdleAudit) {
        auditEntries.length = 0;
      } else {
        _pushAuditEntry(auditEntries, auditContext, "INFO", "run_no_pending", {
          details: { total_rows: rows.length }
        });
      }
      Logger.log("No pending rows to ingest.");
      _archiveSuccessfulRows(ss, sheet, headers);
      return;
    }

    _pushAuditEntry(auditEntries, auditContext, "INFO", "run_pending", {
      details: { pending_rows: pending.length, total_rows: rows.length }
    });
    Logger.log(`Pending rows: ${pending.length}`);
    for (let i = 0; i < pending.length; i += INGEST_CONFIG.batchSize) {
      const batch = pending.slice(i, i + INGEST_CONFIG.batchSize);
      const actionableBatch = batch.filter((item) => !item.localError);
      const batchId = _newBatchId(i / INGEST_CONFIG.batchSize + 1);

      const payloadRows = actionableBatch.map((item) => item.payload);
      const payload = {
        batch_id: batchId,
        sheet_id: ss.getId(),
        sheet_name: sheet.getName(),
        rows: payloadRows
      };
      _markBatchProcessing(sheet, batch, headerIndex, {
        audit: {
          entries: auditEntries,
          context: auditContext,
          batchId: batchId
        }
      });

      if (!actionableBatch.length) {
        _pushAuditEntry(auditEntries, auditContext, "INFO", "batch_local_validation_only", {
          batchId: batchId,
          details: { row_count: batch.length }
        });
        continue;
      }

      _pushAuditEntry(auditEntries, auditContext, "INFO", "batch_dispatched", {
        batchId: batchId,
        details: { row_count: payloadRows.length }
      });

      let response;
      try {
        response = UrlFetchApp.fetch(endpoint, {
          method: "post",
          contentType: "application/json",
          headers: { "x-sheet-ingest-token": token },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
          followRedirects: true
        });
      } catch (err) {
        const message = `Batch transport failure: ${_toErrorMessage(err)}`;
        _markBatchError(sheet, batch, headerIndex, message, {
          countRetry: false,
          allowPermanentFailure: false,
          audit: {
            entries: auditEntries,
            context: auditContext,
            batchId: batchId
          }
        });
        _pushAuditEntry(auditEntries, auditContext, "WARN", "batch_transport_failure", {
          batchId: batchId,
          message: message,
          details: { row_count: actionableBatch.length }
        });
        Logger.log(`${message} [transient]`);
        continue;
      }

      const statusCode = response.getResponseCode();
      const bodyText = response.getContentText();
      if (statusCode < 200 || statusCode >= 300) {
        const message = `Batch failed (${statusCode}): ${bodyText || "no response body"}`;
        const transient = _isTransientBatchHttpStatus(statusCode);
        _markBatchError(sheet, batch, headerIndex, message, {
          countRetry: !transient,
          allowPermanentFailure: !transient,
          audit: {
            entries: auditEntries,
            context: auditContext,
            batchId: batchId,
            httpStatus: statusCode
          }
        });
        _pushAuditEntry(auditEntries, auditContext, transient ? "WARN" : "ERROR", "batch_http_failure", {
          batchId: batchId,
          httpStatus: statusCode,
          message: message,
          details: { transient: transient, row_count: actionableBatch.length }
        });
        Logger.log(transient ? `${message} [transient]` : message);
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(bodyText);
      } catch (err) {
        const message = `Batch parse failure: ${err}`;
        _markBatchError(sheet, batch, headerIndex, message, {
          countRetry: false,
          allowPermanentFailure: false,
          audit: {
            entries: auditEntries,
            context: auditContext,
            batchId: batchId,
            httpStatus: statusCode
          }
        });
        _pushAuditEntry(auditEntries, auditContext, "WARN", "batch_parse_failure", {
          batchId: batchId,
          httpStatus: statusCode,
          message: message,
          details: { row_count: actionableBatch.length }
        });
        Logger.log(`${message} [transient]`);
        continue;
      }
      _pushAuditEntry(auditEntries, auditContext, "INFO", "batch_response_ok", {
        batchId: batchId,
        httpStatus: statusCode,
        details: {
          requested_rows: payloadRows.length,
          created_count: Number(parsed.created_count || 0),
          duplicate_count: Number(parsed.duplicate_count || 0),
          failed_count: Number(parsed.failed_count || 0)
        }
      });

      const resultByRowKey = {};
      (parsed.results || []).forEach((result) => {
        if (!result || result.row_key == null) return;
        resultByRowKey[String(result.row_key)] = result;
      });

      const nowIso = new Date().toISOString();
      actionableBatch.forEach((item) => {
        const result = resultByRowKey[item.rowKey];
        const rowNumber = item.rowNumber;
        if (!result) {
          _writeRowStatus(
            sheet,
            rowNumber,
            headerIndex,
            "error",
            "",
            "No result returned for row; backend response was incomplete.",
            nowIso,
            "",
            "",
            {
              countRetry: false,
              allowPermanentFailure: false,
              audit: {
                entries: auditEntries,
                context: auditContext,
                batchId: batchId,
                rowKey: item.rowKey,
                httpStatus: statusCode
              }
            }
          );
          return;
        }

        const statusValue = String(result.status || "error").trim().toLowerCase();
        const candidateCode = result.candidate_code ? String(result.candidate_code) : "";
        const message = _appendMessages(
          result.message ? String(result.message) : "",
          item.localWarning || ""
        );
        const emailStatus = result.email_status ? String(result.email_status).trim().toLowerCase() : "";
        const emailError = result.email_error ? String(result.email_error) : "";
        _writeRowStatus(
          sheet,
          rowNumber,
          headerIndex,
          statusValue,
          candidateCode,
          message,
          nowIso,
          emailStatus,
          emailError,
          {
            audit: {
              entries: auditEntries,
              context: auditContext,
              batchId: batchId,
              rowKey: item.rowKey,
              httpStatus: statusCode
            }
          }
        );
      });
    }

    _archiveSuccessfulRows(ss, sheet, headers);
    _pushAuditEntry(auditEntries, auditContext, "INFO", "run_completed", {
      details: { archived_statuses: INGEST_CONFIG.archiveStatuses }
    });
  } catch (err) {
    if (auditContext) {
      _pushAuditEntry(auditEntries, auditContext, "ERROR", "run_failed", {
        message: _toErrorMessage(err)
      });
    }
    throw err;
  } finally {
    try {
      if (auditSpreadsheet && auditEntries.length) {
        _flushAuditEntries(auditSpreadsheet, auditEntries);
      }
    } catch (auditErr) {
      Logger.log(`Failed to write audit entries: ${auditErr}`);
    }
    lock.releaseLock();
  }
}

function _collectPendingRows(rows, richRows, formulaRows, headerIndex, context) {
  const out = [];
  const ctx = context || {};
  const requiredHeaders = [
    "Job ID",
    "First name",
    "Last name",
    "Email",
    "Terms"
  ];

  rows.forEach((row, idx) => {
    const richRow = richRows && richRows[idx] ? richRows[idx] : null;
    const formulaRow = formulaRows && formulaRows[idx] ? formulaRows[idx] : null;
    const rowNumber = idx + 2;
    const status = _readCell(row, headerIndex, INGEST_CONFIG.statusColumn).toLowerCase();
    if (_shouldSkipRowForStatus(status, row, headerIndex)) return;

    const portfolioField = _readOptionalDocumentField(row, richRow, formulaRow, headerIndex, "Portfolio");
    const cvField = _readOptionalDocumentField(row, richRow, formulaRow, headerIndex, "CV");
    const resumeField = _readOptionalDocumentField(row, richRow, formulaRow, headerIndex, "Resume");

    const payload = {
      row_key: String(rowNumber),
      date: _readCell(row, headerIndex, "Date"),
      job_id: _readCell(row, headerIndex, "Job ID"),
      applying_for: _readCell(row, headerIndex, "Applying for"),
      first_name: _readCell(row, headerIndex, "First name"),
      last_name: _readCell(row, headerIndex, "Last name"),
      email: _readCell(row, headerIndex, "Email").toLowerCase(),
      contact_number: _readCell(row, headerIndex, "Contact number"),
      educational_qualification: _readCell(row, headerIndex, "Educational Qualification"),
      years_of_experience: _readNumber(row, headerIndex, "Years of experience"),
      city: _readCell(row, headerIndex, "City"),
      willing_to_relocate: _readCell(row, headerIndex, "Willing to Relocate?"),
      terms: _readCell(row, headerIndex, "Terms"),
      portfolio: portfolioField.value,
      cv: cvField.value,
      resume: resumeField.value,
      source_channel:
        _readCell(row, headerIndex, "Source Channel") ||
        _readCell(row, headerIndex, "source_channel") ||
        INGEST_CONFIG.defaultSourceChannel,
      external_source_ref: _normalizeExternalSourceRef(
        _readCell(row, headerIndex, "External Source Ref") ||
          _readCell(row, headerIndex, "external_source_ref")
      )
    };
    if (!payload.external_source_ref) {
      payload.external_source_ref = _deriveExternalSourceRef(payload, {
        sheetId: ctx.sheetId || "",
        sheetName: ctx.sheetName || "",
        rowKey: String(rowNumber),
        rowUid: _readCell(row, headerIndex, INGEST_CONFIG.rowUidColumn)
      });
    }

    const validationErrors = [];
    const documentWarnings = [];
    const missing = requiredHeaders.filter((h) => !_readCell(row, headerIndex, h));
    if (missing.length) {
      validationErrors.push(`Missing required columns: ${missing.join(", ")}`);
    }

    if (portfolioField.error) documentWarnings.push(portfolioField.error);
    if (cvField.error) documentWarnings.push(cvField.error);
    if (resumeField.error) documentWarnings.push(resumeField.error);

    const termsAccepted = /^(yes|true|1|on|y)$/i.test(payload.terms || "");
    if (!termsAccepted) {
      validationErrors.push("Terms must be accepted (Yes/True/1).");
    }

    const validDocumentCount =
      (portfolioField.value ? 1 : 0) + (cvField.value ? 1 : 0) + (resumeField.value ? 1 : 0);
    if (documentWarnings.length && !validDocumentCount) {
      validationErrors.push(documentWarnings.join(" "));
    }

    if (validationErrors.length) {
      out.push({
        rowNumber,
        rowKey: String(rowNumber),
        payload,
        localError: validationErrors.join(" "),
        localWarning: ""
      });
      return;
    }

    out.push({
      rowNumber,
      rowKey: String(rowNumber),
      payload,
      localError: "",
      localWarning: documentWarnings.length
        ? _prefixMessage(documentWarnings.join(" "), "Ignored invalid document fields")
        : ""
    });
  });

  return out;
}

function _normalizeExternalSourceRef(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, 191);
}

function _deriveExternalSourceRef(payload, context) {
  const ctx = context || {};
  const rowUid = String(ctx.rowUid || "").trim();
  if (rowUid) {
    const stableFingerprint = [
      "google_sheet",
      String(ctx.sheetId || "").trim(),
      String(ctx.sheetName || "").trim(),
      rowUid
    ]
      .join("|")
      .toLowerCase();
    const stableDigest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      stableFingerprint,
      Utilities.Charset.UTF_8
    );
    const stableHex = stableDigest
      .map((b) => {
        const n = b < 0 ? b + 256 : b;
        const h = n.toString(16);
        return h.length === 1 ? `0${h}` : h;
      })
      .join("");
    return _normalizeExternalSourceRef(`gs:${stableHex.slice(0, 40)}`);
  }

  const appliedAt = String(payload && payload.date ? payload.date : "").trim();
  const pieces = [
    "google_sheet",
    String(ctx.sheetId || "").trim(),
    String(ctx.sheetName || "").trim(),
    appliedAt,
    String(payload && payload.job_id ? payload.job_id : "").trim(),
    String(payload && payload.applying_for ? payload.applying_for : "").trim(),
    String(payload && payload.email ? payload.email : "").trim().toLowerCase(),
    String(payload && payload.first_name ? payload.first_name : "").trim(),
    String(payload && payload.last_name ? payload.last_name : "").trim(),
    String(payload && payload.portfolio ? payload.portfolio : "").trim(),
    String(payload && payload.cv ? payload.cv : "").trim(),
    String(payload && payload.resume ? payload.resume : "").trim()
  ];
  if (!appliedAt) {
    pieces.push(String(ctx.rowKey || "").trim());
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
  return _normalizeExternalSourceRef(`gs:${hex.slice(0, 40)}`);
}

function _isDuplicateLikeStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return (
    normalized === "duplicate" ||
    normalized === "duplicate_recent" ||
    normalized === "duplicate_idempotent"
  );
}

function _rowHasResolvedIngestEvidence(row, headerIndex) {
  const candidateCode = _readCell(row, headerIndex, INGEST_CONFIG.codeColumn);
  if (String(candidateCode || "").trim()) return true;

  const emailStatus = _readCell(row, headerIndex, INGEST_CONFIG.emailStatusColumn).toLowerCase();
  const ingestedAt = _readCell(row, headerIndex, INGEST_CONFIG.ingestedAtColumn);
  return emailStatus === "sent" && Boolean(String(ingestedAt || "").trim());
}

function _shouldSkipRowForStatus(status, row, headerIndex) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return _rowHasResolvedIngestEvidence(row, headerIndex);
  if (normalized === "processing" && _isStaleProcessingRow(row, headerIndex)) return false;
  const retryWindowStatus =
    normalized === "error" || normalized === "failed_permanent" || normalized === "processing";
  if (retryWindowStatus && _isRowDeferredForRetry(row, headerIndex)) return true;

  if (normalized === "error") {
    const retries = _readInt(row, headerIndex, INGEST_CONFIG.retryCountColumn);
    const maxRetries = Number(INGEST_CONFIG.maxRetries || 0);
    if (Number.isFinite(maxRetries) && maxRetries > 0 && retries >= maxRetries) return true;
  }

  if (normalized === "failed_permanent") {
    const message = _readCell(row, headerIndex, INGEST_CONFIG.messageColumn);
    if (_isTransientBatchFailureMessage(message) || _shouldReevaluateFailedPermanentRow(message)) {
      return false;
    }
  }

  if (_isDuplicateLikeStatus(normalized)) {
    return true;
  }

  if (_rowHasResolvedIngestEvidence(row, headerIndex)) {
    return true;
  }

  return INGEST_CONFIG.skipStatuses.includes(normalized);
}

function _isStaleProcessingRow(row, headerIndex) {
  const lastAttemptRaw =
    _readCell(row, headerIndex, INGEST_CONFIG.lastAttemptAtColumn) ||
    _readCell(row, headerIndex, INGEST_CONFIG.ingestedAtColumn);
  if (!lastAttemptRaw) return true;

  const parsed = Date.parse(String(lastAttemptRaw));
  if (!Number.isFinite(parsed)) return true;

  const staleMinutes = Math.max(
    1,
    Math.floor(Number(INGEST_CONFIG.processingStaleMinutes || 15))
  );
  return Date.now() - parsed >= staleMinutes * 60 * 1000;
}

function _readOptionalDocumentField(row, richRow, formulaRow, headerIndex, headerName) {
  const text = _readCell(row, headerIndex, headerName);
  const idx = headerIndex[headerName];
  const richText = idx == null || idx < 0 || !richRow || idx >= richRow.length ? null : richRow[idx];
  const formula = idx == null || idx < 0 || !formulaRow || idx >= formulaRow.length ? "" : formulaRow[idx];
  const urls = _collectDocumentUrls(text, richText, formula);
  if (urls.length > 1) {
    return {
      value: "",
      error: `${headerName} contains multiple URLs. Keep exactly one file per field.`
    };
  }
  if (urls.length === 1) {
    return { value: urls[0], error: "" };
  }

  const rawText = String(text || "").trim();
  if (rawText) {
    return {
      value: "",
      error: `${headerName} must contain one valid public URL.`
    };
  }

  return { value: "", error: "" };
}

function _debugDocumentFieldSnapshot(row, richRow, formulaRow, headerIndex, headerName) {
  const text = _readCell(row, headerIndex, headerName);
  const idx = headerIndex[headerName];
  const richText = idx == null || idx < 0 || !richRow || idx >= richRow.length ? null : richRow[idx];
  const formula = idx == null || idx < 0 || !formulaRow || idx >= formulaRow.length ? "" : formulaRow[idx];
  const directLink = _safeRichTextDirectLink(richText);
  const runLinks = _safeRichTextRunLinks(richText);
  const urls = _collectDocumentUrls(text, richText, formula);
  return {
    text: _truncateDebugValue(text),
    formula: _truncateDebugValue(formula),
    direct_link: _truncateDebugValue(directLink),
    run_links: runLinks.map((item) => _truncateDebugValue(item)),
    extracted_urls: urls.map((item) => _truncateDebugValue(item))
  };
}

function _collectDocumentUrls(text, richText, formula) {
  const out = [];
  const seen = {};

  _extractUrlsFromText(text).forEach((url) => {
    if (seen[url]) return;
    seen[url] = true;
    out.push(url);
  });

  _extractUrlsFromRichText(richText).forEach((url) => {
    if (seen[url]) return;
    seen[url] = true;
    out.push(url);
  });

  _extractUrlsFromFormula(formula).forEach((url) => {
    if (seen[url]) return;
    seen[url] = true;
    out.push(url);
  });

  return out;
}

function _extractUrlsFromText(value) {
  const text = String(value || "").trim();
  if (!text) return [];

  const matches = text.match(/https?:\/\/[^\s<>"']+/gi) || [];
  const out = [];
  const seen = {};

  matches.forEach((match) => {
    const normalized = _normalizeDetectedUrl(match);
    if (!normalized || seen[normalized]) return;
    seen[normalized] = true;
    out.push(normalized);
  });

  if (!out.length) {
    const normalized = _normalizeDetectedUrl(text);
    if (normalized) out.push(normalized);
  }

  return out;
}

function _extractUrlsFromRichText(richText) {
  const out = [];
  const seen = {};
  try {
    if (!richText) return out;
    const direct = _normalizeDetectedUrl(richText.getLinkUrl ? richText.getLinkUrl() : "");
    if (direct) {
      seen[direct] = true;
      out.push(direct);
    }

    const runs = richText.getRuns ? richText.getRuns() : [];
    for (let i = 0; i < runs.length; i++) {
      const runLink = _normalizeDetectedUrl(runs[i].getLinkUrl ? runs[i].getLinkUrl() : "");
      if (!runLink || seen[runLink]) continue;
      seen[runLink] = true;
      out.push(runLink);
    }
  } catch (err) {
    Logger.log(`Could not parse hyperlink from rich text: ${err}`);
  }
  return out;
}

function _safeRichTextDirectLink(richText) {
  try {
    if (!richText || !richText.getLinkUrl) return "";
    return String(richText.getLinkUrl() || "").trim();
  } catch (err) {
    return "";
  }
}

function _safeRichTextRunLinks(richText) {
  const out = [];
  const seen = {};
  try {
    if (!richText || !richText.getRuns) return out;
    const runs = richText.getRuns() || [];
    for (let i = 0; i < runs.length; i++) {
      const link = runs[i] && runs[i].getLinkUrl ? String(runs[i].getLinkUrl() || "").trim() : "";
      if (!link || seen[link]) continue;
      seen[link] = true;
      out.push(link);
    }
  } catch (err) {
    return out;
  }
  return out;
}

function _normalizeDetectedUrl(value) {
  const text = String(value || "").trim().replace(/[),.;]+$/, "");
  if (!_looksLikeUrl(text)) return "";
  return text;
}

function _extractUrlsFromFormula(formula) {
  const text = String(formula || "").trim();
  if (!text) return [];

  const out = [];
  const seen = {};
  const hyperlinkMatch = text.match(/=?\s*HYPERLINK\s*\(\s*"([^"]+)"/i);
  if (hyperlinkMatch && hyperlinkMatch[1]) {
    const normalized = _normalizeDetectedUrl(hyperlinkMatch[1]);
    if (normalized) {
      seen[normalized] = true;
      out.push(normalized);
    }
  }

  const genericMatches = text.match(/https?:\/\/[^"\s,)]+/gi) || [];
  genericMatches.forEach((match) => {
    const normalized = _normalizeDetectedUrl(match);
    if (!normalized || seen[normalized]) return;
    seen[normalized] = true;
    out.push(normalized);
  });

  return out;
}

function _looksLikeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (!/^https?:\/\//i.test(text)) return false;
  if (/\s/.test(text)) return false;
  const withoutProtocol = text.replace(/^https?:\/\//i, "");
  const host = withoutProtocol.split(/[\/?#]/, 1)[0] || "";
  if (!host) return false;
  if (host.indexOf(".") < 0) return false;
  if (!/^[a-z0-9.-]+$/i.test(host)) return false;
  return true;
}

function _truncateDebugValue(value) {
  const text = String(value || "").trim();
  if (text.length <= 200) return text;
  return `${text.slice(0, 197)}...`;
}

function _shouldReevaluateFailedPermanentRow(message) {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  return (
    text.indexOf("portfolio must be a valid public url") >= 0 ||
    text.indexOf("cv must be a valid public url") >= 0 ||
    text.indexOf("resume must be a valid public url") >= 0 ||
    text.indexOf("contains multiple urls") >= 0 ||
    text.indexOf("missing required columns: portfolio") >= 0
  );
}

function _markBatchProcessing(sheet, batch, headerIndex, options) {
  const nowIso = new Date().toISOString();
  batch.forEach((item) => {
    const rowOptions = _withRowAuditOptions(options, item);
    if (item.localError) {
      _writeRowStatus(
        sheet,
        item.rowNumber,
        headerIndex,
        "failed_permanent",
        "",
        _prefixMessage(item.localError, "Local validation error"),
        nowIso,
        "",
        "",
        Object.assign({}, rowOptions, {
          countRetry: false,
          allowPermanentFailure: false
        })
      );
      return;
    }
    _writeRowStatus(
      sheet,
      item.rowNumber,
      headerIndex,
      "processing",
      "",
      "",
      nowIso,
      "",
      "",
      rowOptions
    );
  });
}

function _markBatchError(sheet, batch, headerIndex, message, options) {
  const nowIso = new Date().toISOString();
  batch.forEach((item) => {
    if (item.localError) return;
    const rowOptions = _withRowAuditOptions(options, item);
    _writeRowStatus(
      sheet,
      item.rowNumber,
      headerIndex,
      "error",
      "",
      message,
      nowIso,
      "",
      "",
      rowOptions
    );
  });
}

function _writeRowStatus(
  sheet,
  rowNumber,
  headerIndex,
  status,
  code,
  message,
  ingestedAt,
  emailStatus,
  emailError,
  options
) {
  const opts = options || {};
  const countRetry = opts.countRetry !== false;
  const allowPermanentFailure = opts.allowPermanentFailure !== false;
  const audit = opts.audit || null;
  const statusRaw = String(status || "").trim().toLowerCase();
  let finalStatus = statusRaw;
  let finalMessage = message || "";
  let retryCount = _readIntFromSheetCell(sheet, rowNumber, headerIndex, INGEST_CONFIG.retryCountColumn);
  let nextRetryAt = "";

  if (statusRaw === "error") {
    retryCount = _recordAttempt(sheet, rowNumber, headerIndex, ingestedAt, countRetry);
    if (allowPermanentFailure && _isPermanentRowErrorMessage(finalMessage)) {
      finalStatus = "failed_permanent";
      finalMessage = _prefixMessage(finalMessage, "Permanent validation error");
    }
    const maxRetries = Number(INGEST_CONFIG.maxRetries || 0);
    if (
      finalStatus === "error" &&
      countRetry &&
      allowPermanentFailure &&
      Number.isFinite(maxRetries) &&
      maxRetries > 0 &&
      retryCount >= maxRetries
    ) {
      finalStatus = "failed_permanent";
      finalMessage = _prefixMessage(finalMessage, "Max retries reached");
    }
    if (finalStatus === "error") {
      nextRetryAt = _computeNextRetryAtIso(retryCount);
    }
  }

  if (statusRaw === "processing") {
    retryCount = _recordAttempt(sheet, rowNumber, headerIndex, ingestedAt, false);
    nextRetryAt = "";
  }

  if (
    finalStatus === "created" ||
    finalStatus === "reapplied" ||
    finalStatus === "duplicate" ||
    finalStatus === "duplicate_recent" ||
    finalStatus === "duplicate_idempotent" ||
    finalStatus === "failed_permanent" ||
    finalStatus === "processing"
  ) {
    nextRetryAt = "";
  }

  const statusIdx = _headerIndexOf(headerIndex, INGEST_CONFIG.statusColumn);
  const codeIdx = _headerIndexOf(headerIndex, INGEST_CONFIG.codeColumn);
  const messageIdx = _headerIndexOf(headerIndex, INGEST_CONFIG.messageColumn);
  const emailStatusIdx = _headerIndexOf(headerIndex, INGEST_CONFIG.emailStatusColumn);
  const emailErrorIdx = _headerIndexOf(headerIndex, INGEST_CONFIG.emailErrorColumn);
  const ingestedAtIdx = _headerIndexOf(headerIndex, INGEST_CONFIG.ingestedAtColumn);
  const nextRetryAtIdx = _headerIndexOf(headerIndex, INGEST_CONFIG.nextRetryAtColumn);
  if (
    statusIdx == null ||
    codeIdx == null ||
    messageIdx == null ||
    emailStatusIdx == null ||
    emailErrorIdx == null ||
    ingestedAtIdx == null
  ) {
    return;
  }

  sheet.getRange(rowNumber, statusIdx + 1).setValue(finalStatus);
  sheet.getRange(rowNumber, codeIdx + 1).setValue(code || "");
  sheet.getRange(rowNumber, messageIdx + 1).setValue(finalMessage);
  sheet.getRange(rowNumber, emailStatusIdx + 1).setValue(
    emailStatus || ""
  );
  sheet.getRange(rowNumber, emailErrorIdx + 1).setValue(
    emailError || ""
  );
  sheet.getRange(rowNumber, ingestedAtIdx + 1).setValue(ingestedAt || "");
  if (nextRetryAtIdx != null && nextRetryAtIdx >= 0) {
    sheet.getRange(rowNumber, nextRetryAtIdx + 1).setValue(nextRetryAt || "");
  }
  _auditRowStatusTransition(audit, {
    rowNumber,
    finalStatus,
    message: finalMessage,
    retryCount,
    nextRetryAt
  });
}

function _ensureOpsColumns(sheet, headers, headerIndex) {
  const required = [
    INGEST_CONFIG.statusColumn,
    INGEST_CONFIG.codeColumn,
    INGEST_CONFIG.messageColumn,
    INGEST_CONFIG.emailStatusColumn,
    INGEST_CONFIG.emailErrorColumn,
    INGEST_CONFIG.ingestedAtColumn,
    INGEST_CONFIG.retryCountColumn,
    INGEST_CONFIG.lastAttemptAtColumn,
    INGEST_CONFIG.nextRetryAtColumn,
    INGEST_CONFIG.documentRepairStatusColumn,
    INGEST_CONFIG.documentRepairMessageColumn,
    INGEST_CONFIG.documentRepairedAtColumn,
    INGEST_CONFIG.rowUidColumn
  ];

  let changed = false;
  required.forEach((col) => {
    if (_headerIndexOf(headerIndex, col) != null) return;
    headers.push(col);
    headerIndex[col] = headers.length - 1;
    headerIndex[_normalizedHeaderLookupKey(col)] = headers.length - 1;
    changed = true;
  });

  if (changed) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function _ensureRowUidsForLoadedRows(sheet, rows, headerIndex) {
  const idx = headerIndex[INGEST_CONFIG.rowUidColumn];
  if (idx == null || idx < 0 || !rows || !rows.length) return;

  const pendingWrites = [];
  rows.forEach((row, rowOffset) => {
    if (!row) return;
    const existing = idx < row.length ? String(row[idx] || "").trim() : "";
    if (existing) return;

    while (row.length <= idx) row.push("");
    const uid = Utilities.getUuid().replace(/-/g, "");
    row[idx] = uid;
    pendingWrites.push({ rowNumber: rowOffset + 2, value: uid });
  });

  pendingWrites.forEach((entry) => {
    sheet.getRange(entry.rowNumber, idx + 1).setValue(entry.value);
  });
}

function _archiveSuccessfulRows(ss, sourceSheet, sourceHeaders, options) {
  const opts = options || {};
  const statusColumnName = INGEST_CONFIG.statusColumn;
  const data = sourceSheet.getDataRange().getValues();
  if (!data || data.length <= 1) return 0;

  const headers = data[0].map((h) => String(h || "").trim());
  const headerIndex = _buildHeaderIndex(headers);
  const statusIdx = headerIndex[statusColumnName];
  if (statusIdx == null || statusIdx < 0) return 0;

  const sourceRowsToArchive = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = String(row[statusIdx] || "").trim().toLowerCase();
    if (!_shouldArchiveStatus(status)) continue;
    if (!_shouldArchiveRowByAge(row, status, headerIndex, opts)) continue;
    sourceRowsToArchive.push({ rowNumber: i + 1, row, status });
  }

  if (!sourceRowsToArchive.length) return 0;

  const archiveSheet = _getOrCreateArchiveSheet(ss);
  const archiveHeaders = _ensureArchiveHeaders(archiveSheet, sourceHeaders || headers);
  const nowIso = new Date().toISOString();
  const sourceHeaderIndex = _buildHeaderIndex(headers);

  const archiveRows = sourceRowsToArchive.map((entry) => {
    const output = [];
    for (let i = 0; i < archiveHeaders.length; i++) {
      const col = archiveHeaders[i];
      if (col === "archived_at") {
        output.push(nowIso);
        continue;
      }
      if (col === "archive_status") {
        output.push(entry.status);
        continue;
      }
      const srcIdx = sourceHeaderIndex[col];
      output.push(srcIdx == null ? "" : entry.row[srcIdx]);
    }
    return output;
  });

  const startRow = archiveSheet.getLastRow() + 1;
  archiveSheet
    .getRange(startRow, 1, archiveRows.length, archiveHeaders.length)
    .setValues(archiveRows);

  const rowNumbers = sourceRowsToArchive.map((item) => item.rowNumber);
  _deleteRowsInDescendingBatches(sourceSheet, rowNumbers);
  Logger.log(
    `Archived ${sourceRowsToArchive.length} row(s) to "${archiveSheet.getName()}".`
  );
  return sourceRowsToArchive.length;
}

function _shouldArchiveStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return false;
  return (INGEST_CONFIG.archiveStatuses || []).indexOf(normalized) >= 0;
}

function _shouldArchiveRowByAge(row, status, headerIndex, options) {
  const opts = options || {};
  if (opts.ignoreAge) return true;
  const minAgeHours = Number(INGEST_CONFIG.archiveMinAgeHours || 0);
  if (!Number.isFinite(minAgeHours) || minAgeHours <= 0) return true;

  const ingestedAt = _readCell(row, headerIndex, INGEST_CONFIG.ingestedAtColumn);
  if (!ingestedAt) return true;
  const parsed = Date.parse(String(ingestedAt));
  if (!Number.isFinite(parsed)) return true;

  return Date.now() - parsed >= minAgeHours * 60 * 60 * 1000;
}

function _getOrCreateArchiveSheet(ss) {
  const name = _normalizeName(INGEST_CONFIG.archiveSheetName) || "Ingest Archive";
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function _ensureArchiveHeaders(archiveSheet, sourceHeaders) {
  const baseHeaders = (sourceHeaders || []).map((h) => String(h || "").trim());
  const metaHeaders = ["archived_at", "archive_status"];
  const desired = baseHeaders.slice();
  metaHeaders.forEach((h) => {
    if (!desired.includes(h)) desired.push(h);
  });

  const lastCol = archiveSheet.getLastColumn();
  if (lastCol <= 0 || archiveSheet.getLastRow() === 0) {
    archiveSheet.getRange(1, 1, 1, desired.length).setValues([desired]);
    return desired;
  }

  const current = archiveSheet
    .getRange(1, 1, 1, lastCol)
    .getValues()[0]
    .map((h) => String(h || "").trim());

  let changed = false;
  desired.forEach((header) => {
    if (current.includes(header)) return;
    current.push(header);
    changed = true;
  });

  if (changed) {
    archiveSheet.getRange(1, 1, 1, current.length).setValues([current]);
  }

  return current;
}

function _deleteRowsInDescendingBatches(sheet, rowNumbers) {
  if (!rowNumbers || !rowNumbers.length) return;
  const desc = rowNumbers
    .filter((n) => Number.isFinite(n) && n > 1)
    .map((n) => Math.floor(n))
    .sort((a, b) => b - a);
  if (!desc.length) return;

  let groupTop = desc[0];
  let groupCount = 1;

  for (let i = 1; i < desc.length; i++) {
    const current = desc[i];
    const previous = desc[i - 1];
    if (current === previous - 1) {
      groupCount += 1;
      continue;
    }
    sheet.deleteRows(groupTop - groupCount + 1, groupCount);
    groupTop = current;
    groupCount = 1;
  }

  sheet.deleteRows(groupTop - groupCount + 1, groupCount);
}

function _buildHeaderIndex(headers) {
  const map = {};
  headers.forEach((h, idx) => {
    const exact = String(h || "").trim();
    const normalized = _normalizedHeaderLookupKey(exact);
    if (exact && map[exact] == null) map[exact] = idx;
    if (normalized && map[normalized] == null) map[normalized] = idx;
  });
  return map;
}

function _readCell(row, headerIndex, headerName) {
  const idx = _headerIndexOf(headerIndex, headerName);
  if (idx == null || idx < 0 || idx >= row.length) return "";
  const raw = row[idx];
  if (raw == null) return "";
  if (Object.prototype.toString.call(raw) === "[object Date]") {
    return new Date(raw).toISOString();
  }
  return String(raw).trim();
}

function _readNumber(row, headerIndex, headerName) {
  const raw = _readCell(row, headerIndex, headerName);
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function _readInt(row, headerIndex, headerName) {
  const num = _readNumber(row, headerIndex, headerName);
  if (!Number.isFinite(num)) return 0;
  if (num < 0) return 0;
  return Math.floor(num);
}

function _readIntFromSheetCell(sheet, rowNumber, headerIndex, headerName) {
  const idx = _headerIndexOf(headerIndex, headerName);
  if (idx == null || idx < 0) return 0;
  const raw = sheet.getRange(rowNumber, idx + 1).getValue();
  const num = Number(raw);
  if (!Number.isFinite(num)) return 0;
  if (num < 0) return 0;
  return Math.floor(num);
}

function _recordAttempt(sheet, rowNumber, headerIndex, nowIso, incrementRetry) {
  const shouldIncrement = incrementRetry !== false;
  let nextRetryCount = _readIntFromSheetCell(sheet, rowNumber, headerIndex, INGEST_CONFIG.retryCountColumn);
  const retryIdx = headerIndex[INGEST_CONFIG.retryCountColumn];
  if (shouldIncrement && retryIdx != null && retryIdx >= 0) {
    const retryCell = sheet.getRange(rowNumber, retryIdx + 1);
    nextRetryCount = nextRetryCount + 1;
    retryCell.setValue(nextRetryCount);
  }

  const lastAttemptIdx = headerIndex[INGEST_CONFIG.lastAttemptAtColumn];
  if (lastAttemptIdx != null && lastAttemptIdx >= 0) {
    sheet.getRange(rowNumber, lastAttemptIdx + 1).setValue(nowIso || new Date().toISOString());
  }

  return nextRetryCount;
}

function _isRowDeferredForRetry(row, headerIndex) {
  const deferredAtRaw = _readCell(row, headerIndex, INGEST_CONFIG.nextRetryAtColumn);
  if (!deferredAtRaw) return false;
  const deferredMillis = Date.parse(String(deferredAtRaw));
  if (!Number.isFinite(deferredMillis)) return false;
  return deferredMillis > Date.now();
}

function _computeNextRetryAtIso(retryCount) {
  const baseSeconds = Math.max(1, Math.floor(Number(INGEST_CONFIG.retryBaseDelaySeconds || 300)));
  const maxSeconds = Math.max(baseSeconds, Math.floor(Number(INGEST_CONFIG.retryMaxDelaySeconds || 14400)));
  const jitterMax = Math.max(0, Math.floor(Number(INGEST_CONFIG.retryJitterSeconds || 0)));
  const attempt = Math.max(1, Math.floor(Number(retryCount || 1)));
  const backoffSeconds = Math.min(maxSeconds, baseSeconds * Math.pow(2, Math.max(0, attempt - 1)));
  const jitterSeconds = jitterMax > 0 ? Math.floor(Math.random() * (jitterMax + 1)) : 0;
  const next = new Date(Date.now() + (backoffSeconds + jitterSeconds) * 1000);
  return next.toISOString();
}

function _isTransientBatchHttpStatus(statusCode) {
  const code = Number(statusCode);
  if (!Number.isFinite(code)) return true;
  const transientCodes = INGEST_CONFIG.transientBatchStatusCodes || [];
  return transientCodes.indexOf(code) >= 0;
}

function _isPermanentRowErrorMessage(message) {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  if (text.indexOf("batch failed (") >= 0) return false;
  if (text.indexOf("batch transport failure") >= 0) return false;
  if (text.indexOf("batch parse failure") >= 0) return false;

  const patterns = INGEST_CONFIG.permanentRowErrorPatterns || [];
  for (let i = 0; i < patterns.length; i++) {
    const pattern = String(patterns[i] || "").toLowerCase();
    if (pattern && text.indexOf(pattern) >= 0) return true;
  }
  return false;
}

function _isTransientBatchFailureMessage(message) {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  if (text.indexOf("batch transport failure") >= 0) return true;
  if (text.indexOf("batch parse failure") >= 0) return true;

  const match = text.match(/batch failed\s*\((\d{3})\)/i);
  if (!match) return false;
  return _isTransientBatchHttpStatus(Number(match[1]));
}

function _prefixMessage(message, prefix) {
  const cleanPrefix = String(prefix || "").trim();
  const cleanMessage = String(message || "").trim();
  if (!cleanPrefix) return cleanMessage;
  const marker = `[${cleanPrefix}]`;
  if (!cleanMessage) return marker;
  if (cleanMessage.indexOf(marker) === 0) return cleanMessage;
  return `${marker} ${cleanMessage}`;
}

function _appendMessages(first, second) {
  const primary = String(first || "").trim();
  const secondary = String(second || "").trim();
  if (!primary) return secondary;
  if (!secondary) return primary;
  if (primary.indexOf(secondary) >= 0) return primary;
  return `${primary} ${secondary}`;
}

function _headerIndexOf(headerIndex, headerName) {
  if (!headerIndex) return null;
  const exact = String(headerName || "").trim();
  if (exact && headerIndex[exact] != null) return headerIndex[exact];
  const normalized = _normalizedHeaderLookupKey(exact);
  return normalized && headerIndex[normalized] != null ? headerIndex[normalized] : null;
}

function _normalizedHeaderLookupKey(headerName) {
  const text = String(headerName || "").trim().toLowerCase();
  if (!text) return "";
  return `__norm__${text.replace(/[^a-z0-9]+/g, "")}`;
}

function _toErrorMessage(err) {
  if (!err) return "Unknown error.";
  if (typeof err === "string") return err;
  if (err && err.message) return String(err.message);
  return String(err);
}

function _newRunId() {
  const randomPart = Math.floor(Math.random() * 1e9).toString(36);
  return `ingest_run_${Date.now()}_${randomPart}`;
}

function _newBatchId(batchNumber) {
  const suffix = Math.floor(Math.random() * 1e6).toString(36);
  return `${new Date().toISOString()}_b${Math.max(1, Math.floor(Number(batchNumber || 1)))}_${suffix}`;
}

function _withRowAuditOptions(options, item) {
  if (!options) return {};
  const out = {};
  Object.keys(options).forEach((key) => {
    out[key] = options[key];
  });

  if (!options.audit) return out;
  out.audit = {
    entries: options.audit.entries,
    context: options.audit.context,
    batchId: options.audit.batchId,
    rowKey: item && item.rowKey != null ? String(item.rowKey) : options.audit.rowKey || "",
    httpStatus: options.audit.httpStatus
  };
  return out;
}

function _auditRowStatusTransition(audit, fields) {
  if (!audit || !audit.entries || !audit.context) return;
  const status = String((fields && fields.finalStatus) || "").toLowerCase();
  const level = status === "failed_permanent" ? "ERROR" : status === "error" ? "WARN" : "INFO";
  _pushAuditEntry(audit.entries, audit.context, level, "row_status_written", {
    batchId: audit.batchId || "",
    rowNumber: fields && fields.rowNumber ? fields.rowNumber : "",
    rowKey: audit.rowKey || "",
    status: status,
    httpStatus: audit.httpStatus,
    retryCount: fields && fields.retryCount,
    nextRetryAt: fields && fields.nextRetryAt ? fields.nextRetryAt : "",
    message: fields && fields.message ? fields.message : ""
  });
}

function _shouldWriteAuditEntry(level, eventType) {
  const normalizedLevel = String(level || "INFO").toUpperCase();
  const normalizedEvent = String(eventType || "").trim().toLowerCase();
  if (normalizedLevel === "ERROR" || normalizedLevel === "WARN") return true;
  return normalizedEvent === "run_completed";
}

function _pushAuditEntry(entries, context, level, eventType, fields) {
  if (!entries || !context) return;
  if (!_shouldWriteAuditEntry(level, eventType)) return;
  const data = fields || {};
  const detailObject = data.details && typeof data.details === "object" ? data.details : {};
  entries.push([
    new Date().toISOString(),
    context.runId || "",
    String(level || "INFO").toUpperCase(),
    String(eventType || "event"),
    context.sheetId || "",
    context.sheetName || "",
    data.batchId || "",
    data.rowNumber || "",
    data.rowKey || "",
    data.status || "",
    data.httpStatus == null ? "" : String(data.httpStatus),
    data.retryCount == null || !Number.isFinite(Number(data.retryCount))
      ? ""
      : Math.max(0, Math.floor(Number(data.retryCount))),
    data.nextRetryAt || "",
    _truncateAuditMessage(data.message),
    _safeJsonStringify(detailObject)
  ]);
}

function _truncateAuditMessage(message) {
  const text = String(message || "");
  if (text.length <= 1000) return text;
  return `${text.slice(0, 997)}...`;
}

function _safeJsonStringify(value) {
  try {
    return JSON.stringify(value || {});
  } catch (err) {
    return JSON.stringify({ stringify_error: _toErrorMessage(err) });
  }
}

function _flushAuditEntries(ss, entries) {
  if (!ss || !entries || !entries.length) return;
  const auditSheet = _getOrCreateAuditSheet(ss);
  const headers = _ensureAuditHeaders(auditSheet);
  const normalizedRows = entries.map((row) => {
    const out = row.slice(0, headers.length);
    while (out.length < headers.length) out.push("");
    return out;
  });
  const startRow = auditSheet.getLastRow() + 1;
  auditSheet
    .getRange(startRow, 1, normalizedRows.length, headers.length)
    .setValues(normalizedRows);
  _trimAuditSheet(auditSheet);
}

function _getOrCreateAuditSheet(ss) {
  const name = _normalizeName(INGEST_CONFIG.auditSheetName) || "Ingest Audit Log";
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function _ensureAuditHeaders(auditSheet) {
  const desired = INGEST_AUDIT_HEADERS.slice();
  const lastCol = auditSheet.getLastColumn();
  if (lastCol <= 0 || auditSheet.getLastRow() === 0) {
    auditSheet.getRange(1, 1, 1, desired.length).setValues([desired]);
    return desired;
  }

  const current = auditSheet
    .getRange(1, 1, 1, lastCol)
    .getValues()[0]
    .map((h) => String(h || "").trim());

  let changed = false;
  desired.forEach((header) => {
    if (current.includes(header)) return;
    current.push(header);
    changed = true;
  });

  if (changed) {
    auditSheet.getRange(1, 1, 1, current.length).setValues([current]);
  }
  return current;
}

function _trimAuditSheet(auditSheet) {
  const maxRows = Math.floor(Number(INGEST_CONFIG.auditMaxRows || 0));
  if (!Number.isFinite(maxRows) || maxRows <= 0) return;
  const totalRows = auditSheet.getLastRow();
  if (totalRows <= 1) return;
  const dataRows = totalRows - 1;
  const overflow = dataRows - maxRows;
  if (overflow <= 0) return;
  auditSheet.deleteRows(2, overflow);
}

function _assertEndpointIsHttps(endpoint) {
  const url = String(endpoint || "").trim();
  if (!/^https:\/\//i.test(url)) {
    throw new Error("RECRUITMENT_INGEST_ENDPOINT must start with https://");
  }
}

function _getDocumentRepairEndpoint() {
  const endpoint = _requiredProp("RECRUITMENT_INGEST_ENDPOINT");
  _assertEndpointIsHttps(endpoint);
  if (/\/import\/google-sheet\/?$/i.test(endpoint)) {
    return endpoint.replace(/\/import\/google-sheet\/?$/i, "/import/google-sheet/repair-documents");
  }
  return `${endpoint.replace(/\/+$/, "")}/repair-documents`;
}

function _requiredProp(name) {
  const scriptValue = PropertiesService.getScriptProperties().getProperty(name);
  const value =
    name === "SHEET_INGEST_TOKEN" ? scriptValue : scriptValue || _getInlineSetupValue(name);
  if (!value || !String(value).trim()) {
    throw new Error(`Missing script property: ${name}`);
  }
  return String(value).trim();
}

function _resolveTargetSheet(ss) {
  const configuredName = _normalizeName(
    PropertiesService.getScriptProperties().getProperty("SHEET_TAB_NAME") ||
      _getInlineSetupValue("SHEET_TAB_NAME")
  );
  const candidates = [];
  if (configuredName) candidates.push(configuredName);
  candidates.push(INGEST_CONFIG.sheetName);
  (INGEST_CONFIG.fallbackSheetNames || []).forEach((name) => candidates.push(name));

  const seen = {};
  for (let i = 0; i < candidates.length; i++) {
    const name = _normalizeName(candidates[i]);
    if (!name || seen[name]) continue;
    seen[name] = true;
    const sheet = ss.getSheetByName(name);
    if (sheet) return sheet;
  }

  // Last fallback: find a tab that contains the expected headers.
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const lastCol = Math.max(1, sheet.getLastColumn());
    const headers = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map((h) => String(h || "").trim());
    const headerIndex = _buildHeaderIndex(headers);
    const matches = (INGEST_CONFIG.requiredHeaderHints || []).every(
      (header) => headerIndex[String(header || "").trim()] != null
    );
    if (matches) return sheet;
  }

  return null;
}

function _normalizeName(raw) {
  return String(raw || "").trim();
}

/**
 * One-time helper if you cannot find Script Properties in UI.
 * Run this function from Apps Script editor, then set token via setIngestTokenFromPrompt().
 */
function configureIngestDefaults() {
  PropertiesService.getScriptProperties().setProperties(
    {
      SHEET_TAB_NAME:
        _getInlineSetupValue("SHEET_TAB_NAME") || INGEST_CONFIG.sheetName,
      RECRUITMENT_INGEST_ENDPOINT:
        _getInlineSetupValue("RECRUITMENT_INGEST_ENDPOINT") ||
        "https://studiolotushub.in/recruitment/api/rec/candidates/import/google-sheet"
    },
    false
  );
  Logger.log("Defaults saved. Now run setIngestTokenFromPrompt() and then setupIngestTriggers().");
}

/**
 * Prompts and stores SHEET_INGEST_TOKEN securely in Script Properties.
 */
function setIngestTokenFromPrompt() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    "Set SHEET_INGEST_TOKEN",
    "Paste the same token configured in backend env as SL_SHEET_INGEST_TOKEN",
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) {
    Logger.log("Token setup cancelled.");
    return;
  }

  const token = String(response.getResponseText() || "").trim();
  if (!token) {
    throw new Error("Token cannot be empty.");
  }

  PropertiesService.getScriptProperties().setProperty("SHEET_INGEST_TOKEN", token);
  Logger.log("SHEET_INGEST_TOKEN saved.");
}

/**
 * Prints current config without exposing token value.
 */
function showIngestConfig() {
  const props = PropertiesService.getScriptProperties();
  const endpoint = props.getProperty("RECRUITMENT_INGEST_ENDPOINT") || "(missing)";
  const sheetName = props.getProperty("SHEET_TAB_NAME") || INGEST_CONFIG.sheetName;
  const tokenState = props.getProperty("SHEET_INGEST_TOKEN") ? "(set)" : "(missing)";

  Logger.log(
    [
      `SHEET_TAB_NAME=${sheetName}`,
      `RECRUITMENT_INGEST_ENDPOINT=${endpoint}`,
      `SHEET_INGEST_TOKEN=${tokenState}`,
      `AUDIT_SHEET=${INGEST_CONFIG.auditSheetName}`,
      `AUDIT_MAX_ROWS=${INGEST_CONFIG.auditMaxRows}`
    ].join("\n")
  );
}

/**
 * Sends a no-rows request to validate endpoint + token wiring.
 * Expected response:
 * - 400 "No rows provided." when token is valid
 * - 401 when token is wrong
 * - 503 when backend token is not configured
 */
function verifyIngestEndpoint() {
  const endpoint = _requiredProp("RECRUITMENT_INGEST_ENDPOINT");
  _assertEndpointIsHttps(endpoint);
  const token = _requiredProp("SHEET_INGEST_TOKEN");
  const payload = {
    batch_id: new Date().toISOString(),
    sheet_id: SpreadsheetApp.getActiveSpreadsheet().getId(),
    sheet_name: "config-check",
    rows: []
  };

  const response = UrlFetchApp.fetch(endpoint, {
    method: "post",
    contentType: "application/json",
    headers: { "x-sheet-ingest-token": token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    followRedirects: true
  });

  const statusCode = response.getResponseCode();
  const body = response.getContentText();
  Logger.log(`verifyIngestEndpoint status=${statusCode}`);
  Logger.log(body);

  if (statusCode === 400) {
    Logger.log("Verification OK: token + endpoint are valid (400/No rows provided is expected).");
  } else if (statusCode === 401) {
    Logger.log("Verification failed: token mismatch. Sync Apps Script token with backend SL_SHEET_INGEST_TOKEN.");
  } else if (statusCode === 503) {
    Logger.log("Verification failed: backend sheet ingest is not configured.");
  } else {
    Logger.log("Verification returned an unexpected status. Check backend logs/body above.");
  }

  return statusCode;
}

function _applyInlineSetupToScriptProperties() {
  const existingToken = _normalizeName(
    PropertiesService.getScriptProperties().getProperty("SHEET_INGEST_TOKEN")
  );
  if (!existingToken) {
    throw new Error(
      "SHEET_INGEST_TOKEN is missing. Set it in Script Properties or run setIngestTokenFromPrompt()."
    );
  }

  PropertiesService.getScriptProperties().setProperties(
    {
      SHEET_TAB_NAME:
        _normalizeName(_getInlineSetupValue("SHEET_TAB_NAME")) || INGEST_CONFIG.sheetName,
      RECRUITMENT_INGEST_ENDPOINT:
        _normalizeName(_getInlineSetupValue("RECRUITMENT_INGEST_ENDPOINT")) ||
        "https://studiolotushub.in/recruitment/api/rec/candidates/import/google-sheet",
      SHEET_INGEST_TOKEN: existingToken
    },
    false
  );
}

function _getInlineSetupValue(name) {
  return INGEST_ONE_TIME_SETUP && Object.prototype.hasOwnProperty.call(INGEST_ONE_TIME_SETUP, name)
    ? INGEST_ONE_TIME_SETUP[name]
    : "";
}
