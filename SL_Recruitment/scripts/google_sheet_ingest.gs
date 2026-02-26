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
  auditMaxRows: 50000,
  archiveStatuses: ["created", "duplicate"],
  archiveMinAgeHours: 24,
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
  batchSize: 50,
  requestTimeoutMs: 120000,
  maxRetries: 5,
  retryBaseDelaySeconds: 300,
  retryMaxDelaySeconds: 14400,
  retryJitterSeconds: 90,
  transientBatchStatusCodes: [408, 425, 429, 500, 502, 503, 504],
  permanentRowErrorPatterns: [
    "missing required columns",
    "terms must be accepted",
    "opening not found",
    "opening title mismatch",
    "multiple active openings found",
    "is inactive",
    "invalid row payload",
    "must be a valid public url",
    "payload too large"
  ],
  skipStatuses: ["created", "duplicate", "processing", "failed_permanent"],
  duplicateCooldownHours: 24,
  changeTriggerHandler: "handleIngestSheetChange",
  scheduledTriggerHandler: "runScheduledIngest",
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
      handler === INGEST_CONFIG.scheduledTriggerHandler ||
      handler === "handleIngestSheetEdit"
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(INGEST_CONFIG.changeTriggerHandler)
    .forSpreadsheet(ss)
    .onChange()
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
function runScheduledIngest() {
  try {
    syncExternalUpdatedToIngestQueue(); // pulls correct columns
    pushCandidatesToRecruitment();      // your existing ingest flow
  } catch (err) {
    Logger.log(`runScheduledIngest failed: ${err}`);
  }
}

function pushCandidatesToRecruitment() {
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
    if (!values.length || values.length === 1) {
      _pushAuditEntry(auditEntries, auditContext, "INFO", "run_no_data", {
        message: "No data rows found."
      });
      Logger.log("No data rows found.");
      return;
    }

    const headers = values[0].map((h) => String(h || "").trim());
    const headerIndex = _buildHeaderIndex(headers);
    _ensureOpsColumns(sheet, headers, headerIndex);

    const rows = values.slice(1);
    const richRows = richValues.slice(1);
    const pending = _collectPendingRows(rows, richRows, headerIndex, {
      sheetId: ss.getId(),
      sheetName: sheet.getName()
    });
    if (!pending.length) {
      _pushAuditEntry(auditEntries, auditContext, "INFO", "run_no_pending", {
        details: { total_rows: rows.length }
      });
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
      const batchId = _newBatchId(i / INGEST_CONFIG.batchSize + 1);

      const payloadRows = batch.map((item) => item.payload);
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
          details: { row_count: batch.length }
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
          details: { transient: transient, row_count: batch.length }
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
          details: { row_count: batch.length }
        });
        Logger.log(`${message} [transient]`);
        continue;
      }
      _pushAuditEntry(auditEntries, auditContext, "INFO", "batch_response_ok", {
        batchId: batchId,
        httpStatus: statusCode,
        details: {
          requested_rows: batch.length,
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
      batch.forEach((item) => {
        const result = resultByRowKey[item.rowKey];
        const rowNumber = item.rowNumber;
        if (!result) {
          _writeRowStatus(
            sheet,
            rowNumber,
            headerIndex,
            "error",
            "",
            "No result returned for row.",
            nowIso,
            "",
            "",
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
          return;
        }

        const statusValue = String(result.status || "error").trim().toLowerCase();
        const candidateCode = result.candidate_code ? String(result.candidate_code) : "";
        const message = result.message ? String(result.message) : "";
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

function _collectPendingRows(rows, richRows, headerIndex, context) {
  const out = [];
  const ctx = context || {};
  const requiredHeaders = [
    "Job ID",
    "First name",
    "Last name",
    "Email",
    "Portfolio",
    "Terms"
  ];

  rows.forEach((row, idx) => {
    const richRow = richRows && richRows[idx] ? richRows[idx] : null;
    const rowNumber = idx + 2;
    const status = _readCell(row, headerIndex, INGEST_CONFIG.statusColumn).toLowerCase();
    if (_shouldSkipRowForStatus(status, row, headerIndex)) return;

    const portfolioValue = _readFileField(row, richRow, headerIndex, "Portfolio");
    const cvValue = _readFileField(row, richRow, headerIndex, "CV");
    const resumeValue = _readFileField(row, richRow, headerIndex, "Resume");

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
      portfolio: portfolioValue,
      cv: cvValue,
      resume: resumeValue,
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
        rowKey: String(rowNumber)
      });
    }

    const missing = requiredHeaders.filter((h) => !_readCell(row, headerIndex, h));
    if (missing.length) {
      out.push({
        rowNumber,
        rowKey: String(rowNumber),
        payload,
        localError: `Missing required columns: ${missing.join(", ")}`
      });
      return;
    }

    const termsAccepted = /^(yes|true|1|on|y)$/i.test(payload.terms || "");
    if (!termsAccepted) {
      out.push({
        rowNumber,
        rowKey: String(rowNumber),
        payload,
        localError: "Terms must be accepted (Yes/True/1)."
      });
      return;
    }

    if (!_looksLikeUrl(payload.portfolio)) {
      out.push({
        rowNumber,
        rowKey: String(rowNumber),
        payload,
        localError:
          "Portfolio must be a valid public URL (or a hyperlink in the Portfolio cell)."
      });
      return;
    }

    if (payload.cv && !_looksLikeUrl(payload.cv)) {
      out.push({
        rowNumber,
        rowKey: String(rowNumber),
        payload,
        localError: "CV must be a valid public URL (or a hyperlink in the CV cell)."
      });
      return;
    }

    if (payload.resume && !_looksLikeUrl(payload.resume)) {
      out.push({
        rowNumber,
        rowKey: String(rowNumber),
        payload,
        localError:
          "Resume must be a valid public URL (or a hyperlink in the Resume cell)."
      });
      return;
    }

    out.push({
      rowNumber,
      rowKey: String(rowNumber),
      payload,
      localError: ""
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

function _shouldSkipRowForStatus(status, row, headerIndex) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return false;
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
    if (_isTransientBatchFailureMessage(message)) return false;
  }

  if (normalized !== "duplicate") {
    return INGEST_CONFIG.skipStatuses.includes(normalized);
  }
  return true;
}

function _readFileField(row, richRow, headerIndex, headerName) {
  const text = _readCell(row, headerIndex, headerName);
  if (_looksLikeUrl(text)) return text;

  const idx = headerIndex[headerName];
  if (idx == null || idx < 0 || !richRow || idx >= richRow.length) return text;

  const richText = richRow[idx];
  const link = _extractLinkFromRichText(richText);
  return link || text;
}

function _extractLinkFromRichText(richText) {
  try {
    if (!richText) return "";
    const direct = richText.getLinkUrl();
    if (direct) return String(direct).trim();

    const runs = richText.getRuns ? richText.getRuns() : [];
    for (let i = 0; i < runs.length; i++) {
      const runLink = runs[i].getLinkUrl ? runs[i].getLinkUrl() : "";
      if (runLink) return String(runLink).trim();
    }
  } catch (err) {
    Logger.log(`Could not parse hyperlink from rich text: ${err}`);
  }
  return "";
}

function _looksLikeUrl(value) {
  const text = String(value || "").trim();
  return /^https?:\/\/.+/i.test(text);
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
        "error",
        "",
        item.localError,
        nowIso,
        "",
        "",
        rowOptions
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
    finalStatus === "duplicate" ||
    finalStatus === "failed_permanent" ||
    finalStatus === "processing"
  ) {
    nextRetryAt = "";
  }

  sheet.getRange(rowNumber, headerIndex[INGEST_CONFIG.statusColumn] + 1).setValue(finalStatus);
  sheet.getRange(rowNumber, headerIndex[INGEST_CONFIG.codeColumn] + 1).setValue(code || "");
  sheet.getRange(rowNumber, headerIndex[INGEST_CONFIG.messageColumn] + 1).setValue(finalMessage);
  sheet.getRange(rowNumber, headerIndex[INGEST_CONFIG.emailStatusColumn] + 1).setValue(
    emailStatus || ""
  );
  sheet.getRange(rowNumber, headerIndex[INGEST_CONFIG.emailErrorColumn] + 1).setValue(
    emailError || ""
  );
  sheet.getRange(rowNumber, headerIndex[INGEST_CONFIG.ingestedAtColumn] + 1).setValue(ingestedAt || "");
  const nextRetryAtIdx = headerIndex[INGEST_CONFIG.nextRetryAtColumn];
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
    INGEST_CONFIG.nextRetryAtColumn
  ];

  let changed = false;
  required.forEach((col) => {
    if (headerIndex[col] != null) return;
    headers.push(col);
    headerIndex[col] = headers.length - 1;
    changed = true;
  });

  if (changed) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function _archiveSuccessfulRows(ss, sourceSheet, sourceHeaders) {
  const statusColumnName = INGEST_CONFIG.statusColumn;
  const data = sourceSheet.getDataRange().getValues();
  if (!data || data.length <= 1) return;

  const headers = data[0].map((h) => String(h || "").trim());
  const headerIndex = _buildHeaderIndex(headers);
  const statusIdx = headerIndex[statusColumnName];
  if (statusIdx == null || statusIdx < 0) return;

  const sourceRowsToArchive = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = String(row[statusIdx] || "").trim().toLowerCase();
    if (!INGEST_CONFIG.archiveStatuses.includes(status)) continue;
    if (!_shouldArchiveRowByAge(row, status, headerIndex)) continue;
    sourceRowsToArchive.push({ rowNumber: i + 1, row, status });
  }

  if (!sourceRowsToArchive.length) return;

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
}

function _shouldArchiveRowByAge(row, status, headerIndex) {
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
    map[String(h || "").trim()] = idx;
  });
  return map;
}

function _readCell(row, headerIndex, headerName) {
  const idx = headerIndex[headerName];
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
  const idx = headerIndex[headerName];
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

function _pushAuditEntry(entries, context, level, eventType, fields) {
  if (!entries || !context) return;
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
