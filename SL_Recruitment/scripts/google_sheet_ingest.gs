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
 * 1) Paste values below once.
 * 2) Run `bootstrapIngest()`.
 */
const INGEST_ONE_TIME_SETUP = {
  SHEET_TAB_NAME: "Master Data",
  RECRUITMENT_INGEST_ENDPOINT:
    "https://studiolotushub.in/recruitment/api/rec/candidates/import/google-sheet",
  // IMPORTANT: Must match backend env SL_SHEET_INGEST_TOKEN exactly.
  // Example format: sl_ingest_2026_9f6b4e23f2a14b6999a0cf95a12d7c31
  SHEET_INGEST_TOKEN: "sl_ingest_2026_7f3f9b1c8a2d4e56b7c91a2d8f4e6b3a"
};

const INGEST_CONFIG = {
  sheetName: "Master Data",
  fallbackSheetNames: ["Website - Candidates", "Sheet 1", "Sheet1"],
  requiredHeaderHints: ["Job ID", "First name", "Last name", "Email", "Terms"],
  statusColumn: "ingest_status",
  codeColumn: "candidate_code",
  messageColumn: "ingest_message",
  emailStatusColumn: "email_status",
  emailErrorColumn: "email_error",
  ingestedAtColumn: "ingested_at",
  batchSize: 50,
  requestTimeoutMs: 120000,
  skipStatuses: ["created", "duplicate", "processing"],
  duplicateCooldownHours: 24,
  editTriggerHandler: "handleIngestSheetEdit",
  changeTriggerHandler: "handleIngestSheetChange"
};

/**
 * Run once manually to create/refresh installable triggers.
 * Creates:
 * - onEdit trigger (any edit in target sheet)
 * - onChange trigger (row insert in workbook)
 */
function setupIngestTriggers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allTriggers = ScriptApp.getProjectTriggers();

  allTriggers.forEach((trigger) => {
    const handler = trigger.getHandlerFunction();
    if (
      handler === INGEST_CONFIG.editTriggerHandler ||
      handler === INGEST_CONFIG.changeTriggerHandler
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(INGEST_CONFIG.editTriggerHandler)
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  ScriptApp.newTrigger(INGEST_CONFIG.changeTriggerHandler)
    .forSpreadsheet(ss)
    .onChange()
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
 * Run this once after pasting token in INGEST_ONE_TIME_SETUP.
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
 * Installable onEdit trigger handler.
 */
function handleIngestSheetEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    const ss = e.source || SpreadsheetApp.getActiveSpreadsheet();
    const targetSheet = _resolveTargetSheet(ss);
    if (!targetSheet || !sheet || sheet.getSheetId() !== targetSheet.getSheetId()) return;
    if (e.range.getRow() <= 1) return; // Ignore header edits.
    pushCandidatesToRecruitment();
  } catch (err) {
    Logger.log(`handleIngestSheetEdit failed: ${err}`);
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

function pushCandidatesToRecruitment() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log("Skipping run: could not acquire lock.");
    return;
  }

  try {
    const endpoint = _requiredProp("RECRUITMENT_INGEST_ENDPOINT");
    const token = _requiredProp("SHEET_INGEST_TOKEN");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = _resolveTargetSheet(ss);
    if (!sheet) {
      throw new Error(
        "Target sheet not found. Set SHEET_TAB_NAME script property or use one of: " +
          [INGEST_CONFIG.sheetName].concat(INGEST_CONFIG.fallbackSheetNames).join(", ")
      );
    }
    Logger.log(`Using target sheet: ${sheet.getName()}`);

    const range = sheet.getDataRange();
    const values = range.getValues();
    const richValues = range.getRichTextValues();
    if (!values.length || values.length === 1) {
      Logger.log("No data rows found.");
      return;
    }

    const headers = values[0].map((h) => String(h || "").trim());
    const headerIndex = _buildHeaderIndex(headers);
    _ensureOpsColumns(sheet, headers, headerIndex);

    const rows = values.slice(1);
    const richRows = richValues.slice(1);
    const pending = _collectPendingRows(rows, richRows, headerIndex);
    if (!pending.length) {
      Logger.log("No pending rows to ingest.");
      return;
    }

    Logger.log(`Pending rows: ${pending.length}`);
    for (let i = 0; i < pending.length; i += INGEST_CONFIG.batchSize) {
      const batch = pending.slice(i, i + INGEST_CONFIG.batchSize);
      _markBatchProcessing(sheet, batch, headerIndex);

      const payloadRows = batch.map((item) => item.payload);
      const payload = {
        batch_id: new Date().toISOString(),
        sheet_id: ss.getId(),
        sheet_name: sheet.getName(),
        rows: payloadRows
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
      const bodyText = response.getContentText();
      if (statusCode < 200 || statusCode >= 300) {
        const message = `Batch failed (${statusCode}): ${bodyText || "no response body"}`;
        _markBatchError(sheet, batch, headerIndex, message);
        Logger.log(message);
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(bodyText);
      } catch (err) {
        const message = `Batch parse failure: ${err}`;
        _markBatchError(sheet, batch, headerIndex, message);
        Logger.log(message);
        continue;
      }

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
            ""
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
          emailError
        );
      });
    }
  } finally {
    lock.releaseLock();
  }
}

function _collectPendingRows(rows, richRows, headerIndex) {
  const out = [];
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
      resume: resumeValue
    };

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

function _shouldSkipRowForStatus(status, row, headerIndex) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return false;

  if (normalized !== "duplicate") {
    return INGEST_CONFIG.skipStatuses.includes(normalized);
  }

  const cooldownHours = Number(INGEST_CONFIG.duplicateCooldownHours || 0);
  if (!Number.isFinite(cooldownHours) || cooldownHours <= 0) return false;

  const ingestedAtRaw = _readCell(row, headerIndex, INGEST_CONFIG.ingestedAtColumn);
  if (!ingestedAtRaw) return false;

  const parsedMillis = Date.parse(String(ingestedAtRaw));
  if (!Number.isFinite(parsedMillis)) return false;

  return Date.now() - parsedMillis < cooldownHours * 60 * 60 * 1000;
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

function _markBatchProcessing(sheet, batch, headerIndex) {
  const nowIso = new Date().toISOString();
  batch.forEach((item) => {
    if (item.localError) {
      _writeRowStatus(sheet, item.rowNumber, headerIndex, "error", "", item.localError, nowIso, "", "");
      return;
    }
    _writeRowStatus(sheet, item.rowNumber, headerIndex, "processing", "", "", nowIso, "", "");
  });
}

function _markBatchError(sheet, batch, headerIndex, message) {
  const nowIso = new Date().toISOString();
  batch.forEach((item) => {
    if (item.localError) return;
    _writeRowStatus(sheet, item.rowNumber, headerIndex, "error", "", message, nowIso, "", "");
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
  emailError
) {
  sheet.getRange(rowNumber, headerIndex[INGEST_CONFIG.statusColumn] + 1).setValue(status || "");
  sheet.getRange(rowNumber, headerIndex[INGEST_CONFIG.codeColumn] + 1).setValue(code || "");
  sheet.getRange(rowNumber, headerIndex[INGEST_CONFIG.messageColumn] + 1).setValue(message || "");
  sheet.getRange(rowNumber, headerIndex[INGEST_CONFIG.emailStatusColumn] + 1).setValue(
    emailStatus || ""
  );
  sheet.getRange(rowNumber, headerIndex[INGEST_CONFIG.emailErrorColumn] + 1).setValue(
    emailError || ""
  );
  sheet.getRange(rowNumber, headerIndex[INGEST_CONFIG.ingestedAtColumn] + 1).setValue(ingestedAt || "");
}

function _ensureOpsColumns(sheet, headers, headerIndex) {
  const required = [
    INGEST_CONFIG.statusColumn,
    INGEST_CONFIG.codeColumn,
    INGEST_CONFIG.messageColumn,
    INGEST_CONFIG.emailStatusColumn,
    INGEST_CONFIG.emailErrorColumn,
    INGEST_CONFIG.ingestedAtColumn
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

function _requiredProp(name) {
  const value =
    PropertiesService.getScriptProperties().getProperty(name) || _getInlineSetupValue(name);
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
      `SHEET_INGEST_TOKEN=${tokenState}`
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
  const inlineToken = _normalizeName(_getInlineSetupValue("SHEET_INGEST_TOKEN"));
  if (!inlineToken) {
    throw new Error(
      "INGEST_ONE_TIME_SETUP.SHEET_INGEST_TOKEN is empty. Paste token in code, then run bootstrapIngest()."
    );
  }

  PropertiesService.getScriptProperties().setProperties(
    {
      SHEET_TAB_NAME:
        _normalizeName(_getInlineSetupValue("SHEET_TAB_NAME")) || INGEST_CONFIG.sheetName,
      RECRUITMENT_INGEST_ENDPOINT:
        _normalizeName(_getInlineSetupValue("RECRUITMENT_INGEST_ENDPOINT")) ||
        "https://studiolotushub.in/recruitment/api/rec/candidates/import/google-sheet",
      SHEET_INGEST_TOKEN: inlineToken
    },
    false
  );
}

function _getInlineSetupValue(name) {
  return INGEST_ONE_TIME_SETUP && Object.prototype.hasOwnProperty.call(INGEST_ONE_TIME_SETUP, name)
    ? INGEST_ONE_TIME_SETUP[name]
    : "";
}
