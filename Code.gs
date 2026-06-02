/**
 * Studio Lotus — Master Operating Workbook v2
 * Google Apps Script — Code.gs
 *
 * INSTALL
 *   1. Import Org_Data.xlsx into a fresh Google Sheet (File → Import → Replace).
 *   2. Extensions → Apps Script. Paste this file as Code.gs.
 *   3. Add HTML files:  Console.html  (and optionally OrgTree.html / LicenseDashboard.html for backward compat).
 *   4. Run setupStudioLotusAutomation() once and authorise.
 *   5. ONE-TIME: run "Studio Lotus → Seed Secrets from JSON" and paste contents of secrets_seed.json.
 *      Then DELETE secrets_seed.json (it's the only place values live in cleartext).
 *
 * WHAT THIS FILE DOES
 *   • Reads Master_Employees, Groups, Licenses, License_Inventory, Systems, Peripherals
 *   • Computes SLExp / OExp from DOJ + Prior Exp on every employee
 *   • Maps Job Title → Designation Level + Color (same level = same color)
 *   • Exposes ONE endpoint (getConsoleData) for Console.html — single round-trip
 *   • Handles optimistic drag-drop moves (UI moves first, server validates + writes)
 *   • Encrypts secrets via PropertiesService (Set / Get / List / Seed / Rotate)
 *   • Keeps v1 endpoints (getOrgData, getLicenseData) so the old OrgTree/LicenseDashboard still work
 */

// ═════════════════════════════════════════════════════════════════════════
// CONFIG
// ═════════════════════════════════════════════════════════════════════════
const ORG_CONFIG = {
  masterSheet: 'Master_Employees',
  groupsSheet: 'Groups',
  licensesSheet: 'Licenses',
  inventorySheet: 'License_Inventory',
  systemsSheet: 'Systems',
  peripheralsSheet: 'Peripherals',
  systemHealthSheet: 'System_Health',
  secretsRegistrySheet: 'Secrets_Registry',
  sharedAccountsSheet:  'Shared_Accounts',   // single source of truth for non-person emails
  liveSheet: 'Live_Org_Chart',
  groupLicenseSheet: 'Group_License_View',
  userMatrixSheet: 'User_License_Matrix',
  monthlySheet: 'Monthly_Utilisation',
  toolSheet: 'Tool_Catalogue',
  healthSheet: 'Data_Health',
  auditSheet: 'Audit_Log',
  principals: [
    { name: 'Harsh Vardhan', color: '#244C66' },
    { name: 'Ambrish Arora', color: '#B75C35' },
    { name: 'Ankur Choksi', color: '#3F7D62' },
    { name: 'Asha Sairam', color: '#6B5598' }
  ],
  menuName: 'Studio Lotus',
  renewalRecipient: 'itsupport@studiolotus.in',
  renewalWindowDays: 30
};

// Designation Level mapping (mirrors the workbook builder exactly)
const DESIGNATION_MAP = {
  'Principal':           { order: 1, label: 'Principal',                    color: '#1A2332' },
  'Associate Principal': { order: 2, label: 'Associate Principal',          color: '#2E4057' },
  'Senior Associate':    { order: 3, label: 'Senior Associate',             color: '#3F5260' },
  'Sr. Associate':       { order: 3, label: 'Senior Associate',             color: '#3F5260' },
  'Group Leader':        { order: 4, label: 'Group Leader',                 color: '#475E4A' },
  'Project Lead':        { order: 4, label: 'Group Leader',                 color: '#475E4A' },
  'Associate':           { order: 5, label: 'Associate',                    color: '#5D7A52' },
  'Project Architect':   { order: 6, label: 'Project Architect/Designer',   color: '#8A4A35' },
  'Project Designer':    { order: 6, label: 'Project Architect/Designer',   color: '#8A4A35' },
  'Senior Architect':    { order: 7, label: 'Senior Architect/Designer',    color: '#A4853D' },
  'Sr. Architect':       { order: 7, label: 'Senior Architect/Designer',    color: '#A4853D' },
  'Senior Designer':     { order: 7, label: 'Senior Architect/Designer',    color: '#A4853D' },
  'Sr. Designer':        { order: 7, label: 'Senior Architect/Designer',    color: '#A4853D' },
  'Architect':           { order: 8, label: 'Architect/Designer',           color: '#5D4156' },
  'Designer':            { order: 8, label: 'Architect/Designer',           color: '#5D4156' },
  'Intern':              { order: 9, label: 'Intern',                       color: '#97A0AB' }
};

function levelFor_(title) {
  if (!title) return { order: 99, label: 'Support', color: '#707A87' };
  const t = String(title).trim();
  if (DESIGNATION_MAP[t]) return DESIGNATION_MAP[t];
  const tl = t.toLowerCase();
  if (tl.indexOf('principal') !== -1 && tl.indexOf('associate') !== -1) return DESIGNATION_MAP['Associate Principal'];
  if (tl.indexOf('principal') !== -1) return DESIGNATION_MAP['Principal'];
  if ((tl.indexOf('sr.') !== -1 || tl.indexOf('senior') !== -1) &&
      (tl.indexOf('architect') !== -1 || tl.indexOf('designer') !== -1)) return DESIGNATION_MAP['Senior Architect'];
  if (tl.indexOf('project') !== -1 && (tl.indexOf('architect') !== -1 || tl.indexOf('designer') !== -1)) return DESIGNATION_MAP['Project Architect'];
  if (tl.indexOf('architect') !== -1 || tl.indexOf('designer') !== -1) return DESIGNATION_MAP['Architect'];
  if (tl.indexOf('intern') !== -1) return DESIGNATION_MAP['Intern'];
  if (tl.indexOf('lead') !== -1) return DESIGNATION_MAP['Project Lead'];
  return { order: 99, label: 'Support', color: '#707A87' };
}

// ═════════════════════════════════════════════════════════════════════════
// EXPERIENCE FROM DOJ
// ═════════════════════════════════════════════════════════════════════════
function computeExperience_(doj, priorExpYears) {
  const out = {
    doj: null, dojDisplay: '',
    slExpYears: null, slExpDisplay: '—',
    oExpYears: null, oExpDisplay: '—'
  };
  let dojDate = null;
  if (doj instanceof Date) dojDate = doj;
  else if (doj && String(doj).trim()) {
    const parsed = new Date(String(doj));
    if (!isNaN(parsed.getTime())) dojDate = parsed;
  }
  if (dojDate) {
    out.doj = Utilities.formatDate(dojDate, Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd');
    out.dojDisplay = Utilities.formatDate(dojDate, Session.getScriptTimeZone() || 'Asia/Kolkata', 'd MMM yyyy');
    const yrs = (Date.now() - dojDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (yrs >= 0) {
      out.slExpYears = yrs;
      out.slExpDisplay = yrs.toFixed(1) + ' yrs';
    }
  }
  const prior = (priorExpYears !== '' && priorExpYears != null && !isNaN(Number(priorExpYears)))
    ? Number(priorExpYears) : null;
  if (out.slExpYears != null && prior != null) {
    out.oExpYears = out.slExpYears + prior;
    out.oExpDisplay = out.oExpYears.toFixed(1) + ' yrs';
  } else if (out.slExpYears != null) {
    out.oExpYears = out.slExpYears;
    out.oExpDisplay = out.slExpYears.toFixed(1) + ' yrs';
  } else if (prior != null) {
    out.oExpYears = prior;
    out.oExpDisplay = prior.toFixed(1) + ' yrs';
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════
// MENU & LIFECYCLE
// ═════════════════════════════════════════════════════════════════════════
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(ORG_CONFIG.menuName)
    .addItem('Open Operating Console', 'openConsole')
    .addSeparator()
    .addItem('Open Org Viewer (legacy)', 'openInteractiveOrgViewer')
    .addItem('Open Licence Dashboard (legacy)', 'openLicenseDashboardViewer')
    .addSeparator()
    .addItem('Rebuild Everything Now', 'rebuildEverything')
    .addItem('Run Data Health Check', 'runDataHealthCheck')
    .addItem('Run System Health Check', 'runSystemHealthCheck')
    .addItem('Re-grade All PCs', 'menuRegradeAll')
    .addItem('Refresh Designation Colours', 'refreshDesignationColumns_')
    .addSeparator()
    .addItem('🔐 Seed Secrets from JSON (small)', 'menuSeedSecrets')
    .addItem('🔐 Seed Secrets from Sheet (recommended)', 'menuSeedSecretsFromSheet')
    .addItem('🔐 Set Secret', 'menuSetSecret')
    .addItem('🔐 Get Secret', 'menuGetSecret')
    .addItem('🔐 List Secret Keys', 'menuListSecrets')
    .addSeparator()
    .addItem('Setup Auto-Refresh', 'setupStudioLotusAutomation')
    .addItem('Setup Shared Accounts Sheet', 'setupSharedAccountsSheet')
    .addItem('Show Web App URL', 'showWebAppUrl')
    .addToUi();
}

function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'console';
  let file = 'Console';
  if (page === 'org') file = 'OrgTree';
  else if (page === 'licenses') file = 'LicenseDashboard';
  return HtmlService.createHtmlOutputFromFile(file)
    .setTitle('Studio Lotus — Operating Console')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setupStudioLotusAutomation() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'autoRefreshAll_' ||
        t.getHandlerFunction() === 'logAudit_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoRefreshAll_').forSpreadsheet(ss).onEdit().create();
  refreshDesignationColumns_();
  rebuildEverything();
  SpreadsheetApp.getUi().alert(
    'Studio Lotus automation ready.\n\n' +
    '• Edit any sheet and everything rebuilds automatically.\n' +
    '• Studio Lotus menu → Open Operating Console.'
  );
}

/**
 * Creates (or re-creates) the Shared_Accounts sheet with headers and
 * the one known permanent shared account. Run once from the menu.
 * After that, the sheet is the single place to add/remove shared emails.
 */
function setupSharedAccountsSheet() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ORG_CONFIG.sharedAccountsSheet);
  if (sh) {
    const ui = SpreadsheetApp.getUi();
    const resp = ui.alert(
      'Sheet already exists',
      'Shared_Accounts sheet already exists. Re-create it (you will lose any manual entries)?',
      ui.ButtonSet.YES_NO
    );
    if (resp !== ui.Button.YES) return;
    ss.deleteSheet(sh);
  }
  sh = ss.insertSheet(ORG_CONFIG.sharedAccountsSheet);

  // Header row
  sh.getRange('A1:D1').setValues([['Email', 'Display Name', 'Type', 'Notes']]);
  sh.getRange('A1:D1')
    .setFontWeight('bold')
    .setBackground('#1A2332')
    .setFontColor('#FFFFFF');

  // Seed with the one known permanent shared account
  const seed = [
    ['sm@studiolotus.in', 'Studio Lotus (shared)', 'Shared Account', 'Common Adobe account — no individual owner'],
  ];
  sh.getRange(2, 1, seed.length, 4).setValues(seed);

  // Column widths
  sh.setColumnWidth(1, 280);
  sh.setColumnWidth(2, 200);
  sh.setColumnWidth(3, 160);
  sh.setColumnWidth(4, 360);
  sh.setFrozenRows(1);

  // Data validation on Type column
  const typeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Shared Account', 'Meeting Room', 'Service Account', 'Unassigned Seat', 'Other'], true)
    .setAllowInvalid(false).build();
  sh.getRange('C2:C200').setDataValidation(typeRule);

  SpreadsheetApp.getUi().alert('Shared_Accounts sheet created.\n\nAdd any email that should never appear as a person in headcount or licence counts.\nThe system reads this sheet live — no code changes needed to add or remove entries.');
}

function autoRefreshAll_(e) {
  if (!e || !e.range) return;
  try {
    const sheetName = e.range.getSheet().getName();
    if ([ORG_CONFIG.masterSheet, ORG_CONFIG.groupsSheet, ORG_CONFIG.sharedAccountsSheet].indexOf(sheetName) !== -1) {
      refreshDesignationColumns_();
      rebuildUserLicenseMatrix_();
      rebuildGroupLicenseView_();
    }
    if (sheetName === ORG_CONFIG.licensesSheet || sheetName === ORG_CONFIG.inventorySheet) {
      rebuildUserLicenseMatrix_();
      rebuildGroupLicenseView_();
    }
    if (sheetName === ORG_CONFIG.systemsSheet) {
      regradeAllSystems();
      runSystemHealthCheck();
    }
  } catch (err) { /* never block an edit because rebuild failed */ }
}

function rebuildEverything() {
  refreshDesignationColumns_();
  regradeAllSystems();
  rebuildUserLicenseMatrix_();
  rebuildGroupLicenseView_();
  runSystemHealthCheck();
  runDataHealthCheck();
  SpreadsheetApp.flush();
}

function openConsole() {
  const html = HtmlService.createHtmlOutputFromFile('Console').setWidth(1500).setHeight(960);
  SpreadsheetApp.getUi().showModalDialog(html, 'Studio Lotus — Operating Console');
}
function openInteractiveOrgViewer() {
  const html = HtmlService.createHtmlOutputFromFile('OrgTree').setWidth(1400).setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, 'Studio Lotus — Organisation Chart');
}
function openLicenseDashboardViewer() {
  const html = HtmlService.createHtmlOutputFromFile('LicenseDashboard').setWidth(1400).setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, 'Studio Lotus — License Dashboard');
}
function showWebAppUrl() {
  const url = ScriptApp.getService().getUrl();
  const ui = SpreadsheetApp.getUi();
  if (!url) { ui.alert('Deploy as Web App first: Deploy → New deployment → Web app.'); return; }
  ui.alert('Web App URL', url + '\n\n' + url + '?page=org\n' + url + '?page=licenses', ui.ButtonSet.OK);
}

// ═════════════════════════════════════════════════════════════════════════
// INTEGRATED CONSOLE ENDPOINT — single call returns People + Licences + Systems
// ═════════════════════════════════════════════════════════════════════════
// ─── GROUP OVERVIEW — tracked tools & tiers ──────────────────────────────
const TRACKED_TOOLS = [
  'AutoCAD LT', 'SketchUp Pro', 'Adobe Photoshop', 'Adobe Illustrator',
  'Adobe InDesign', 'Adobe Acrobat', 'MS Office 365 Business Standard',
  'MS Office 365 Apps', '3ds Max', 'Enscape', 'Corona Renderer',
  'Lumion Pro', 'D5 Render'
];
const SYSTEM_TIERS = ['Workstation', 'Performance', 'Standard', 'Basic', 'Entry'];

function getConsoleData() {
  return {
    generatedAt:   new Date().toLocaleString(),
    people:        getPeopleData_(),
    licences:      getLicencesData_(),
    systems:       getSystemsData_(),
    peripherals:   getPeripheralsData_(),
    groupOverview: getGroupOverviewData(),
    readiness:     getReadinessData()
  };
}

// ─── GROUP OVERVIEW ──────────────────────────────────────────────────────
/**
 * Returns the full Group Overview payload used by the Groups tab in Console.
 * Each group gets: headcount, systemCount, toolCounts (per TRACKED_TOOLS),
 * tierCounts (per SYSTEM_TIERS), and a memberDetails array.
 *
 * Tool matching uses exact shortNameFor_() normalisation to prevent
 * "Adobe" hitting Photoshop, Illustrator, InDesign and Acrobat at once.
 */
function getGroupOverviewData() {
  const master  = readTable_(ORG_CONFIG.masterSheet);
  const grpMap  = getGroupsMap_();
  const licData = getLicensesByEmail_();
  const sysData = getSystemsData_();

  const rows = [];
  const sortedGroups = Object.values(grpMap).sort((a, b) =>
    a.principal.localeCompare(b.principal) ||
    Number(a.sort || 999) - Number(b.sort || 999));

  sortedGroups.forEach(g => {
    const members = master.rows.filter(r => {
      const gk   = String(r[master.idx['Group Key']] || '').trim();
      return gk === g.key && normalizeBoolean_(r[master.idx['Include in Org']]);
    });

    // Zero-initialise counters
    const toolCounts = {};
    TRACKED_TOOLS.forEach(t => { toolCounts[t] = 0; });
    const tierCounts = {};
    SYSTEM_TIERS.forEach(t => { tierCounts[t] = 0; });

    let systemCount = 0;
    const systemIds    = [];
    const memberDetails = [];

    members.forEach(m => {
      const email = String(m[master.idx['Work Email']] || '').trim().toLowerCase();
      const name  = String(m[master.idx['Employee Name']] || '').trim();
      const title = String(m[master.idx['Job Title']] || '').trim();
      const lvl   = levelFor_(title);

      // Licences — use shortNameFor_ so Adobe tools don't bleed into each other
      const lics = licData[email] || [];
      lics.forEach(l => {
        const normalised = shortNameFor_(l.tool || '');
        if (toolCounts.hasOwnProperty(normalised)) toolCounts[normalised] += 1;
      });

      // Systems
      const sys = sysData.byEmail[email];
      if (sys) {
        systemCount++;
        systemIds.push(sys.systemId);
        const tier = sys.tier || '';
        if (tierCounts.hasOwnProperty(tier)) tierCounts[tier] += 1;
      }

      memberDetails.push({
        name:              name,
        email:             email,
        title:             title,
        designationLevel:  lvl.label,
        designationColor:  lvl.color,
        licenceCount:      lics.length,
        licences:          lics.map(l => l.tool),
        system: sys ? {
          systemId:          sys.systemId,
          tier:              sys.tier,
          gradeScore:        sys.gradeScore,
          processor:         sys.processor,
          ramGB:             sys.ramGB,
          gpu:               sys.gpu,
          upgradeSuggestion: sys.upgradeSuggestion,
          status:            sys.status,
          autocadVersion:    sys.autocadVersion,
          sketchupVersion:   sys.sketchupVersion,
          adobeVersions:     sys.adobeVersions,
          officeVersion:     sys.officeVersion
        } : null
      });
    });

    // Exclude the principal/lead themselves from the displayed headcount.
    // When they're the only row (Direct Reports placeholder with no actual reports),
    // nonLeadCount = 0, which causes the card to be hidden in the Groups UI.
    const nonLeadCount = memberDetails.filter(m =>
      m.name !== g.principal && m.name !== g.teamLead
    ).length;

    rows.push({
      key:           g.key,
      name:          g.name,
      principal:     g.principal,
      teamLead:      g.teamLead,
      headcount:     nonLeadCount,
      systemCount:   systemCount,
      systemIds:     systemIds,
      toolCounts:    toolCounts,
      tierCounts:    tierCounts,
      totalLicences: Object.values(toolCounts).reduce((a, b) => a + b, 0),
      members:       memberDetails,
      color:         g.color
    });
  });

  return {
    generatedAt: new Date().toLocaleString(),
    groups:      rows,
    tools:       TRACKED_TOOLS,
    tiers:       SYSTEM_TIERS
  };
}

// ─── PEOPLE ──────────────────────────────────────────────────────────────
function getPeopleData_() {
  const master = readTable_(ORG_CONFIG.masterSheet);
  const idx = master.idx;
  const groups = getGroupsMap_();
  const licensesByEmail = getLicensesByEmail_();

  const byPrincipal = {};
  ORG_CONFIG.principals.forEach(p => {
    byPrincipal[p.name] = {
      name: p.name, color: p.color, employeeNo: '', email: '',
      designationColor: '#1A2332', designationLevel: 'Principal',
      imageURL: '', licenseCount: 0, groups: [],
      employeeCount: 0, groupCount: 0
    };
  });

  const grouped = {};
  master.rows.forEach(row => {
    if (!normalizeBoolean_(row[idx['Include in Org']])) return;
    const name = String(row[idx['Employee Name']] || '').trim();
    const email = String(row[idx['Work Email']] || '').trim();
    const groupKey = String(row[idx['Group Key']] || '').trim();
    const group = groups[groupKey];
    if (!name || !group || !byPrincipal[group.principal]) return;

    const title = String(row[idx['Job Title']] || '').trim();
    const lvl = levelFor_(title);

    const doj = idx['DOJ'] !== undefined ? row[idx['DOJ']] : null;
    const priorExp = idx['Prior Exp (yrs)'] !== undefined ? row[idx['Prior Exp (yrs)']] : null;
    const imageURL = idx['Image URL'] !== undefined ? String(row[idx['Image URL']] || '').trim() : '';
    const exp = computeExperience_(doj, priorExp);
    const lics = licensesByEmail[email.toLowerCase()] || [];

    const person = {
      employeeNo: String(row[idx['Employee No']] || '').trim(),
      name: name, email: email,
      principal: group.principal,
      groupKey: groupKey, groupName: group.name,
      teamLead: group.teamLead,
      title: title,
      designationLevel: lvl.label,
      designationColor: lvl.color,
      designationOrder: lvl.order,
      imageURL: imageURL,
      doj: exp.doj, dojDisplay: exp.dojDisplay,
      slExpYears: exp.slExpYears, slExpDisplay: exp.slExpDisplay,
      oExpYears: exp.oExpYears, oExpDisplay: exp.oExpDisplay,
      department: String(row[idx['Department']] || '').trim(),
      businessUnit: String(row[idx['Business Unit']] || '').trim(),
      workerType: String(row[idx['Worker Type']] || '').trim(),
      orgLevel: String(row[idx['Org Level']] || '').trim(),
      sourceReportsTo: String(row[idx['Source Reports To']] || '').trim(),
      licenseCount: lics.length,
      licenses: lics,
      notes: String(row[idx['Notes']] || '').trim()
    };

    if (name === group.principal) {
      const p = byPrincipal[group.principal];
      Object.assign(p, {
        employeeNo: person.employeeNo, email: person.email, imageURL: person.imageURL,
        title: person.title,
        designationLevel: person.designationLevel, designationColor: person.designationColor,
        slExpDisplay: person.slExpDisplay, oExpDisplay: person.oExpDisplay, dojDisplay: person.dojDisplay,
        slExpYears: person.slExpYears, oExpYears: person.oExpYears,
        licenseCount: person.licenseCount, licenses: person.licenses,
        notes: person.notes, department: person.department,
        businessUnit: person.businessUnit, workerType: person.workerType
      });
      return;
    }
    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        key: groupKey, name: group.name, principal: group.principal,
        leadName: group.teamLead, leadDetails: null,
        color: group.color, sort: group.sort, notes: group.notes, members: []
      };
    }
    if (name === group.teamLead && group.teamLead !== group.principal) {
      grouped[groupKey].leadDetails = person;
    } else {
      grouped[groupKey].members.push(person);
    }
  });

  Object.keys(grouped).forEach(k => {
    const g = grouped[k];
    g.members.sort((a, b) =>
      (a.designationOrder || 99) - (b.designationOrder || 99) ||
      a.name.localeCompare(b.name));
    byPrincipal[g.principal].groups.push(g);
  });

  ORG_CONFIG.principals.forEach(p => {
    const prin = byPrincipal[p.name];
    prin.groups.sort((a, b) => {
      const da = a.name === 'Direct Reports' ? 0 : 1;
      const db = b.name === 'Direct Reports' ? 0 : 1;
      return da - db || Number(a.sort || 999) - Number(b.sort || 999) || a.name.localeCompare(b.name);
    });
    prin.groupCount = prin.groups.length;
    prin.employeeCount = prin.groups.reduce((sum, g) => {
      const leadCount = (g.leadDetails && g.leadName !== prin.name) ? 1 : 0;
      return sum + leadCount + g.members.length;
    }, prin.employeeNo ? 1 : 0);
  });

  return { principals: ORG_CONFIG.principals.map(p => byPrincipal[p.name]) };
}

// ─── LICENCES ────────────────────────────────────────────────────────────
function getLicencesData_() {
  const inv = readTable_(ORG_CONFIG.inventorySheet);
  const assignments = readTable_(ORG_CONFIG.licensesSheet);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const inventory = inv.rows.map(row => {
    if (!row[inv.idx['Contract Key']]) return null;
    const endDate = row[inv.idx['End Date']];
    let daysToExpiry = '';
    let renewalStatus = 'No End Date';
    if (endDate instanceof Date) {
      const diff = Math.floor((endDate.getTime() - today.getTime()) / 86400000);
      daysToExpiry = diff;
      if (diff < 0) renewalStatus = 'Expired';
      else if (diff <= 30) renewalStatus = 'Expiring Soon';
      else if (diff <= 90) renewalStatus = 'Watch';
      else renewalStatus = 'Active';
    }
    const sw = String(row[inv.idx['Software']] || '');
    if (!sw) return null;
    return {
      contractKey: String(row[inv.idx['Contract Key']] || ''),
      software: sw,
      shortName: shortNameFor_(sw),
      category: String(row[inv.idx['Category']] || ''),
      entity: String(row[inv.idx['Entity']] || ''),
      seats: Number(row[colIdx_(inv.idx, ['People','Seats'])] || 0),
      vendor: String(row[inv.idx['Vendor']] || ''),
      startDate: safeDateString_(row[inv.idx['Start Date']]),
      endDate: safeDateString_(endDate),
      cost: Number(row[inv.idx['Cost']] || 0),
      status: String(row[inv.idx['Status']] || ''),
      notes: String(row[inv.idx['Notes']] || ''),
      daysToExpiry: daysToExpiry,
      renewalStatus: renewalStatus
    };
  }).filter(x => x);

  const masterForLic  = readTable_(ORG_CONFIG.masterSheet);
  const masterLicSet  = new Set(
    masterForLic.rows
      .map(r => String(r[masterForLic.idx['Work Email']] || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const sharedLicSet = getSharedAccountEmails_();

  // ── 3-way classification ──────────────────────────────────────────────────
  // person    : email is in Master_Employees            → PEOPLE count
  // shared    : email is in Shared_Accounts (and NOT an
  //             unassigned placeholder)                 → ROOMS / SHARED count
  // unassigned: email contains "unassigned" keyword     → spare-pool rows;
  //             these represent contracted seats not yet
  //             given to a named holder. They count
  //             toward Total Seats (from LI) but not
  //             toward any assigned bucket.
  // ─────────────────────────────────────────────────────────────────────────
  const assignList = assignments.rows.map(row => {
    const email  = String(row[assignments.idx['Work Email']] || '').trim().toLowerCase();
    const tool   = String(row[assignments.idx['License / Tool']] || '');
    const status = String(row[assignments.idx['Status']] || '').trim();
    if (!email || !tool) return null;
    const kind = classifyLicenseHolder_(email, masterLicSet, sharedLicSet);
    return { email, tool, status, kind };
  }).filter(x => x);

  // Only rows that are actively assigned to a real holder count toward utilisation.
  // 'unassigned' rows (status=Available placeholders) are excluded from all
  // assignment counts — they are spare seats already accounted for by the
  // License_Inventory People column.
  const personList     = assignList.filter(a => a.kind === 'person');
  const sharedList     = assignList.filter(a => a.kind === 'shared');
  const unassignedList = assignList.filter(a => a.kind === 'unassigned');

  const summaries = {};
  inventory.forEach(c => {
    const key = c.shortName;
    if (!summaries[key]) summaries[key] = {
      software: c.software, shortName: key, category: c.category,
      purchased: 0, assigned: 0, sharedAssigned: 0, contracts: 0
    };
    summaries[key].purchased += c.seats;
    summaries[key].contracts += 1;
  });
  const assignCounts = {}, sharedCounts = {};
  // Both people AND shared/consultant seats are "assigned" for utilisation purposes
  personList.forEach(a => { const sn = shortNameFor_(a.tool); assignCounts[sn] = (assignCounts[sn] || 0) + 1; });
  sharedList.forEach(a => { const sn = shortNameFor_(a.tool); sharedCounts[sn]  = (sharedCounts[sn]  || 0) + 1; });
  Object.keys(summaries).forEach(k => {
    summaries[k].assigned       = assignCounts[k] || 0;
    summaries[k].sharedAssigned = sharedCounts[k] || 0;
    // totalAssigned used by utilisation bar = people + shared (unassigned placeholders excluded)
    summaries[k].totalAssigned  = (assignCounts[k] || 0) + (sharedCounts[k] || 0);
  });

  const totalPurchased = inventory.reduce((s, c) => s + c.seats, 0);
  const totals = {
    purchased:      totalPurchased,
    assigned:       personList.length,          // seats held by real people (Master_Employees)
    sharedAssigned: sharedList.length,          // seats held by shared / consultant accounts
    totalAssigned:  personList.length + sharedList.length, // all actively used seats
    softwareTitles: Object.keys(summaries).length
  };

  const expiredList = inventory.filter(c => c.daysToExpiry !== '' && c.daysToExpiry < 0)
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  const expiringSoonList = inventory.filter(c => c.daysToExpiry !== '' && c.daysToExpiry >= 0 && c.daysToExpiry <= 60)
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry);

  // Build two separate lists from sharedList:
  //
  //   sharedEmailList  — emails that are REGISTERED in Shared_Accounts.
  //                      These are known and deliberate; the Console banner
  //                      does NOT fire for them. They still count as assigned
  //                      seats in all utilisation calculations.
  //
  //   unknownEmailList — emails classified as 'shared' only because they are
  //                      absent from both Master_Employees and Shared_Accounts
  //                      (the catch-all branch in classifyLicenseHolder_).
  //                      These are genuinely unresolved and DO trigger the
  //                      warning banner so you can decide what to do with them.
  const sharedByEmail  = {};   // known → registered in Shared_Accounts
  const unknownByEmail = {};   // unknown → not registered anywhere

  sharedList.forEach(a => {
    if (sharedLicSet.has(a.email)) {
      // Explicitly listed in Shared_Accounts — known and intentional
      if (!sharedByEmail[a.email]) sharedByEmail[a.email] = [];
      sharedByEmail[a.email].push(a.tool);
    } else {
      // Not registered anywhere — surface in the warning banner
      if (!unknownByEmail[a.email]) unknownByEmail[a.email] = [];
      unknownByEmail[a.email].push(a.tool);
    }
  });

  const sharedEmailList  = Object.keys(sharedByEmail).sort().map(e => ({
    email: e, tools: sharedByEmail[e], known: true
  }));
  const unknownEmailList = Object.keys(unknownByEmail).sort().map(e => ({
    email: e, tools: unknownByEmail[e], known: false
  }));

  return {
    totals:            totals,
    softwareSummaries: Object.values(summaries).sort((a, b) => a.software.localeCompare(b.software)),
    expiringSoonList:  expiredList.concat(expiringSoonList),
    allContracts:      inventory.sort((a, b) => (a.software || '').localeCompare(b.software || '')),
    totalAssignments:  personList.length + sharedList.length, // all actively assigned seats
    sharedEmailList:   sharedEmailList,    // known shared/consultant accounts — no banner
    unknownEmailList:  unknownEmailList    // unresolved emails — shown in warning banner
  };
}

function shortNameFor_(raw) {
  const n = String(raw || '').toUpperCase();
  if (n.indexOf('AUTOCAD') !== -1) return 'AutoCAD LT';
  if (n.indexOf('3DS MAX') !== -1 || n.indexOf('3DSMAX') !== -1) return '3ds Max';
  if (n.indexOf('SKETCHUP') !== -1) return 'SketchUp Pro';
  if (n.indexOf('ENSCAPE') !== -1) return 'Enscape';
  if (n.indexOf('CORONA') !== -1) return 'Corona Renderer';
  if (n.indexOf('LUMION') !== -1) return 'Lumion Pro';
  if (n.indexOf('PHOTOSHOP') !== -1) return 'Adobe Photoshop';
  if (n.indexOf('ILLUSTRATOR') !== -1) return 'Adobe Illustrator';
  if (n.indexOf('INDESIGN') !== -1) return 'Adobe InDesign';
  if (n.indexOf('ACROBAT') !== -1) return 'Adobe Acrobat';
  if (n.indexOf('OFFICE 365') !== -1 && n.indexOf('STANDARD') !== -1) return 'MS Office 365 Standard';
  if (n.indexOf('OFFICE 365') !== -1 || n.indexOf('365APP') !== -1) return 'MS Office 365 Apps';
  return String(raw || '').trim();
}

// ─── SYSTEMS ─────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════
// PC GRADING ENGINE — fully automated, recomputes on every read.
// Scores CPU/GPU/RAM for architecture workloads, assigns a tier and an
// automated upgrade suggestion. Mirror of the workbook builder logic.
// ═════════════════════════════════════════════════════════════════════════
function scoreCpu_(proc) {
  if (!proc) return 30;
  const p = String(proc).toUpperCase();
  if (p.indexOf('ULTRA') !== -1) return 95;
  const m = p.match(/I([579])[\s-]*(\d{3,5})/);
  if (m) {
    const tier = parseInt(m[1], 10);
    const model = m[2];
    let gen = 0;
    if (model.length === 5) gen = parseInt(model.substring(0, 2), 10);
    else if (model.length === 4) gen = parseInt(model.substring(0, 1), 10);
    let score;
    if (gen >= 14) score = 92;
    else if (gen >= 13) score = 88;
    else if (gen >= 12) score = 82;
    else if (gen >= 11) score = 74;
    else if (gen >= 10) score = 68;
    else if (gen >= 9) score = 58;
    else if (gen >= 8) score = 52;
    else if (gen >= 6) score = 40;
    else if (gen >= 4) score = 28;
    else score = 22;
    if (tier === 5) score -= 8;
    else if (tier === 9) score += 5;
    return Math.max(0, Math.min(100, score));
  }
  if (p.indexOf('XEON') !== -1) return 35;
  return 30;
}

function scoreGpu_(gpu) {
  if (!gpu) return 10;
  const g = String(gpu).toUpperCase().replace(/\u00a0/g, '').trim();
  if (g.indexOf('NO GRAPHIC') !== -1 || g === '' || g.indexOf('NO GPU') !== -1) return 5;
  if (g.indexOf('RTX 5090') !== -1) return 100;
  if (g.indexOf('RTX 5080') !== -1) return 97;
  if (g.indexOf('RTX 5070') !== -1) return 90;
  if (g.indexOf('RTX 5060') !== -1) return 80;
  if (g.indexOf('RTX 4090') !== -1) return 98;
  if (g.indexOf('RTX 4080') !== -1) return 93;
  if (g.indexOf('RTX 4070') !== -1) return 85;
  if (g.indexOf('RTX 4060') !== -1) return 75;
  if (g.indexOf('RTX 3090') !== -1 || g.indexOf('RTX 3080') !== -1) return 88;
  if (g.indexOf('RTX 3070') !== -1) return 80;
  if (g.indexOf('RTX 3060') !== -1) return 70;
  if (g.indexOf('RTX 2080') !== -1) return 68;
  if (g.indexOf('RTX 2070') !== -1) return 62;
  if (g.indexOf('RTX 2060') !== -1) return 55;
  if (g.indexOf('1660') !== -1) return 48;
  if (g.indexOf('1650') !== -1) return 40;
  if (g.indexOf('1080') !== -1) return 50;
  if (g.indexOf('1070') !== -1) return 45;
  if (g.indexOf('1060') !== -1) return 38;
  if (g.indexOf('1050') !== -1) return 28;
  if (g.indexOf('GTX 980') !== -1) return 32;
  if (g.indexOf('GTX 970') !== -1) return 28;
  if (g.indexOf('GTX 750') !== -1) return 18;
  if (g.indexOf('QUADRO K') !== -1 || g.indexOf('QUARDO K') !== -1) return 20;
  if (g.indexOf('QUADRO') !== -1) return 45;
  return 25;
}

function parseRamGb_(ramStr) {
  if (!ramStr) return 0;
  const m = String(ramStr).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function scoreRam_(gb) {
  if (gb >= 64) return 100;
  if (gb >= 48) return 90;
  if (gb >= 32) return 80;
  if (gb >= 24) return 62;
  if (gb >= 16) return 50;
  if (gb >= 8) return 28;
  return 12;
}

function gradePc_(proc, gpu, ramStr) {
  const cpuS = scoreCpu_(proc);
  const gpuS = scoreGpu_(gpu);
  const ramGb = parseRamGb_(ramStr);
  const ramS = scoreRam_(ramGb);
  const composite = Math.round(cpuS * 0.32 + gpuS * 0.40 + ramS * 0.28);

  let tier, capability;
  if (composite >= 80) {
    tier = 'Workstation';
    capability = 'Heavy rendering & viz (V-Ray, Enscape, Corona, Lumion, 3ds Max)';
  } else if (composite >= 62) {
    tier = 'Performance';
    capability = '3D modelling + light rendering (Revit, Rhino, SketchUp, real-time viz)';
  } else if (composite >= 45) {
    tier = 'Standard';
    capability = '2D CAD + 3D modelling (AutoCAD, SketchUp; not for heavy rendering)';
  } else if (composite >= 30) {
    tier = 'Basic';
    capability = '2D drafting & docs (AutoCAD LT, Office). Struggles with 3D.';
  } else {
    tier = 'Entry';
    capability = 'Docs & admin only (Office, email, PDF). Not for design work.';
  }

  const suggestions = [];
  if (ramGb && ramGb < 16) suggestions.push('Upgrade RAM to at least 16GB (currently ' + ramGb + 'GB)');
  else if (ramGb && ramGb < 32 && gpuS >= 70) suggestions.push('GPU is capable but RAM (' + ramGb + 'GB) bottlenecks rendering — add to 32GB');
  if (gpuS < 30 && cpuS >= 60) suggestions.push('Strong CPU paired with weak GPU — add an RTX 4060+ for viz');
  if (gpuS < 20) suggestions.push('GPU cannot drive modern 3D — replace with RTX 4060 or better');
  if (cpuS < 40 && gpuS >= 60) suggestions.push('Modern GPU bottlenecked by old CPU — plan full refresh');
  let finalSuggestions = suggestions;
  if (cpuS < 30 && gpuS < 30 && ramS < 30) finalSuggestions = ['Fully obsolete for design — retire or reassign to docs-only role'];

  let suggestion;
  if (!finalSuggestions.length) {
    if (composite >= 80) suggestion = 'No upgrade needed — top tier';
    else if (composite >= 62) suggestion = 'Solid — no upgrade needed for current workload';
    else suggestion = 'Adequate for its tier — monitor';
  } else {
    suggestion = finalSuggestions.join(' · ');
  }

  return {
    cpuScore: cpuS, gpuScore: gpuS, ramScore: ramS, ramGb: ramGb,
    score: composite, tier: tier, capability: capability, suggestion: suggestion
  };
}


function getSystemsData_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(ORG_CONFIG.systemsSheet);
  if (!sheet) return { rows: [], byEmail: {} };
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { rows: [], byEmail: {} };
  const headers = values[0].map(h => String(h || '').trim());
  const idx = {}; headers.forEach((h, i) => idx[h] = i);

  const master = readTable_(ORG_CONFIG.masterSheet);
  const masterByEmail = {};
  master.rows.forEach(r => {
    const em = String(r[master.idx['Work Email']] || '').trim().toLowerCase();
    if (em) masterByEmail[em] = {
      name: String(r[master.idx['Employee Name']] || ''),
      team: String(r[master.idx['Group / Team']] || '')
    };
  });

  const rows = [];
  const byEmail = {};
  for (let r = 1; r < values.length; r++) {
    const sysId = String(values[r][idx['System ID']] || '').trim();
    if (!sysId || sysId.indexOf('👉') !== -1) continue;
    const email = String(values[r][idx['Assigned Email']] || '').trim().toLowerCase();
    const masterInfo = masterByEmail[email] || null;
    const userFromInv = String(values[r][idx['User Display']] || '').trim();
    const teamFromInv = String(values[r][idx['Team']] || '').trim();
    const row = {
      systemId: sysId,
      type: String(values[r][idx['Type']] || ''),
      assignedEmail: email,
      userDisplay: masterInfo ? masterInfo.name : (userFromInv || (email ? email.split('@')[0] : '—')),
      team: masterInfo ? (masterInfo.team || teamFromInv) : teamFromInv || '—',
      makeModel: String(values[r][idx['Make / Model']] || ''),
      processor: String(values[r][idx['Processor']] || ''),
      motherboard: String(values[r][idx['Motherboard']] || ''),
      ramGB: values[r][idx['RAM (GB)']] || '',
      ramSlotsFree: String(values[r][idx['RAM Slots Free']] || ''),
      storage: String(values[r][idx['Storage']] || ''),
      cpuCores: values[r][idx['CPU Cores']] || '',
      gpu: String(values[r][idx['Graphics Card']] || ''),
      os: String(values[r][idx['OS']] || ''),
      officeVersion: String(values[r][idx['Office Version']] || ''),
      autocadVersion: String(values[r][idx['AutoCAD Version']] || ''),
      adobeVersions: String(values[r][idx['Adobe Versions']] || ''),
      sketchupVersion: String(values[r][idx['SketchUp Version']] || ''),
      threedsmaxVersion: String(values[r][idx['3ds Max Version']] || ''),
      rhinoVersion: String(values[r][idx['Rhino Version']] || ''),
      enscape: String(values[r][idx['Enscape Version']] || ''),
      d5: String(values[r][idx['D5 Render']] || ''),
      antivirus: String(values[r][idx['Antivirus']] || ''),
      purchaseDate: safeDateString_(values[r][idx['Purchase Date']]),
      vendor: String(values[r][idx['Vendor']] || ''),
      serviceTag: String(values[r][idx['Service Tag']] || ''),
      serialNo: String(values[r][idx['Serial No']] || ''),
      status: String(values[r][idx['Status']] || ''),
      rdpPinStored: String(values[r][idx['RDP PIN Stored']] || ''),
      notes: String(values[r][idx['Notes']] || '')
    };
    // AUTO-GRADE: compute live on every read (architecture workload tiers)
    const grade = gradePc_(row.processor, row.gpu, row.ramGB);
    row.tier = grade.tier;
    row.capability = grade.capability;
    row.gradeScore = grade.score;
    row.upgradeSuggestion = grade.suggestion;
    row.cpuScore = grade.cpuScore;
    row.gpuScore = grade.gpuScore;
    row.ramScore = grade.ramScore;
    rows.push(row);
    if (email) byEmail[email] = row;
  }
  return { rows: rows, byEmail: byEmail };
}

// ─── PERIPHERALS ─────────────────────────────────────────────────────────
function getPeripheralsData_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(ORG_CONFIG.peripheralsSheet);
  if (!sheet) return { rows: [] };
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { rows: [] };
  const headers = values[0].map(h => String(h || '').trim());
  const idx = {}; headers.forEach((h, i) => idx[h] = i);
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const id = String(values[r][idx['Item ID']] || '').trim();
    if (!id || id.indexOf('👉') !== -1) continue;
    rows.push({
      itemId: id,
      category: String(values[r][idx['Category']] || ''),
      item: String(values[r][idx['Item']] || ''),
      model: String(values[r][idx['Model']] || ''),
      serial: String(values[r][idx['Serial']] || ''),
      quantity: values[r][idx['Quantity']] || '',
      condition: String(values[r][idx['Condition']] || ''),
      location: String(values[r][idx['Location']] || ''),
      assignedTo: String(values[r][idx['Assigned To']] || ''),
      status: String(values[r][idx['Status']] || ''),
      notes: String(values[r][idx['Notes']] || '')
    });
  }
  return { rows: rows };
}

// ═════════════════════════════════════════════════════════════════════════
// LEGACY ENDPOINTS — keep v1 OrgTree.html / LicenseDashboard.html working
// ═════════════════════════════════════════════════════════════════════════
function getOrgData() {
  const p = getPeopleData_();
  return { generatedAt: new Date().toLocaleString(), principals: p.principals };
}
function getLicenseData() {
  const lic = getLicencesData_();
  return Object.assign({ generatedAt: new Date().toLocaleString() }, lic, {
    inventory: lic.expiringSoonList,
    liveInventory: lic.expiringSoonList.filter(c => c.daysToExpiry >= 0),
    expiredContracts: lic.expiringSoonList.filter(c => c.daysToExpiry < 0),
    assignments: [],
    teamSummaries: []
  });
}
function getMonthlyUtilisation() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(ORG_CONFIG.monthlySheet);
  if (!sheet) return { months: [], rows: [] };
  const values = sheet.getDataRange().getValues();
  let hr = -1;
  for (let r = 0; r < values.length; r++) {
    if (String(values[r][0]).trim() === 'Software') { hr = r; break; }
  }
  if (hr < 0) return { months: [], rows: [] };
  const head = values[hr].map(h => String(h || '').trim());
  const months = head.slice(7).filter(Boolean);
  const rows = [];
  for (let r = hr + 1; r < values.length; r++) {
    const name = String(values[r][0] || '').trim();
    if (!name || name === 'TOTAL') continue;
    rows.push({
      software: name, total: Number(values[r][1] || 0),
      assigned: Number(values[r][2] || 0),
      annualCost: Number(values[r][5] || 0), wasted: Number(values[r][6] || 0)
    });
  }
  return { months: months, rows: rows };
}
function getWebAppUrl() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}
function getBrandLogo() { return ''; }

// ═════════════════════════════════════════════════════════════════════════
// MUTATIONS — moveEmployee, setLicence
// Both write to the sheet, both audit. Console wraps them in optimistic UI.
// ═════════════════════════════════════════════════════════════════════════
function moveEmployee(employeeNo, newGroupKey) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(ORG_CONFIG.masterSheet);
  if (!sheet) throw new Error('Master sheet not found');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const idx = {}; headers.forEach((h, i) => idx[h] = i);
  const groups = getGroupsMap_();
  const g = groups[newGroupKey];
  if (!g) throw new Error('Unknown group key: ' + newGroupKey);

  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idx['Employee No']] || '').trim() === String(employeeNo).trim()) {
      const row = r + 1;
      sheet.getRange(row, idx['Group Key'] + 1).setValue(newGroupKey);
      if (idx['Principal'] !== undefined) sheet.getRange(row, idx['Principal'] + 1).setValue(g.principal);
      if (idx['Group / Team'] !== undefined) sheet.getRange(row, idx['Group / Team'] + 1).setValue(g.name);
      if (idx['Team Lead'] !== undefined) sheet.getRange(row, idx['Team Lead'] + 1).setValue(g.teamLead);
      return { ok: true, name: String(values[r][idx['Employee Name']] || ''), team: g.name };
    }
  }
  throw new Error('Employee ' + employeeNo + ' not found');
}

function setLicence(email, tool, action) {
  email = String(email || '').trim().toLowerCase();
  tool = String(tool || '').trim();
  if (!email || !tool) throw new Error('Email and tool are required');
  if (email.indexOf('@') === -1) throw new Error('Not a valid email');

  const sheet = SpreadsheetApp.getActive().getSheetByName(ORG_CONFIG.licensesSheet);
  if (!sheet) throw new Error('Licenses sheet not found');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const idx = {}; headers.forEach((h, i) => idx[h] = i);
  const cEmail = idx['Work Email'], cTool = idx['License / Tool'];

  const matches = [];
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][cEmail] || '').trim().toLowerCase() === email &&
        String(values[r][cTool] || '').trim().toLowerCase() === tool.toLowerCase()) {
      matches.push(r + 1);
    }
  }
  if (action === 'revoke') {
    if (!matches.length) throw new Error(email + ' does not hold ' + tool);
    matches.sort((a, b) => b - a).forEach(rn => sheet.deleteRow(rn));
    return { ok: true, message: 'Revoked ' + tool + ' from ' + email };
  }
  if (matches.length) return { ok: true, message: email + ' already has ' + tool };

  const newRow = new Array(headers.length).fill('');
  newRow[cEmail] = email;
  newRow[cTool] = tool;
  if (idx['Status'] !== undefined) newRow[idx['Status']] = 'Assigned';
  if (idx['Assigned On'] !== undefined) newRow[idx['Assigned On']] = new Date();
  sheet.appendRow(newRow);
  return { ok: true, message: 'Assigned ' + tool + ' to ' + email };
}

// ═════════════════════════════════════════════════════════════════════════
// V2 INLINE EDITING MUTATIONS
// All write directly to the sheet, all validate, all return {ok, message}
// ═════════════════════════════════════════════════════════════════════════

/**
 * Create or update a person in Master_Employees.
 * payload = { employeeNo, name, email, title, groupKey, doj, priorExpYears,
 *             imageURL, workerType, department, notes, include }
 * If employeeNo exists → update. Otherwise → create.
 */
function upsertPerson(payload) {
  if (!payload) throw new Error('No payload');
  payload.name = String(payload.name || '').trim();
  payload.email = String(payload.email || '').trim().toLowerCase();
  payload.title = String(payload.title || '').trim();
  payload.groupKey = String(payload.groupKey || '').trim();
  if (!payload.name) throw new Error('Name is required');
  if (!payload.email || payload.email.indexOf('@') === -1) throw new Error('Valid email is required');
  if (!payload.title) throw new Error('Job title is required');
  if (!payload.groupKey) throw new Error('Team is required');

  const groups = getGroupsMap_();
  const g = groups[payload.groupKey];
  if (!g) throw new Error('Unknown team: ' + payload.groupKey);

  const sheet = SpreadsheetApp.getActive().getSheetByName(ORG_CONFIG.masterSheet);
  if (!sheet) throw new Error('Master_Employees sheet not found');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const idx = {}; headers.forEach((h, i) => idx[h] = i);

  // Validate column presence
  const required = ['Employee No', 'Employee Name', 'Work Email', 'Principal',
                    'Group Key', 'Group / Team', 'Team Lead', 'Org Level',
                    'Job Title', 'Include in Org'];
  required.forEach(h => { if (idx[h] === undefined) throw new Error('Master sheet is missing required column: ' + h); });

  // Auto-derive Designation Level + Color from title
  const lvl = levelFor_(payload.title);

  // Find existing row by Employee No (case-insensitive trim)
  let targetRow = -1;
  if (payload.employeeNo) {
    const en = String(payload.employeeNo).trim();
    for (let r = 1; r < values.length; r++) {
      if (String(values[r][idx['Employee No']] || '').trim() === en) { targetRow = r + 1; break; }
    }
  }

  // Duplicate email check (block if a DIFFERENT row already has this email)
  for (let r = 1; r < values.length; r++) {
    const rowEmail = String(values[r][idx['Work Email']] || '').trim().toLowerCase();
    if (rowEmail === payload.email && (r + 1) !== targetRow) {
      throw new Error('Email already in use by ' + String(values[r][idx['Employee Name']] || ''));
    }
  }

  const isNew = targetRow < 0;
  let writeRow;
  let empNo;

  if (isNew) {
    // Generate Employee No if not supplied: SL-NNNN incrementing
    empNo = String(payload.employeeNo || '').trim();
    if (!empNo) {
      const used = {};
      for (let r = 1; r < values.length; r++) {
        const v = String(values[r][idx['Employee No']] || '').trim();
        const m = v.match(/^SL-(\d+)$/);
        if (m) used[parseInt(m[1], 10)] = true;
      }
      let n = 1;
      while (used[n]) n++;
      empNo = 'SL-' + String(n).padStart(4, '0');
    } else {
      // Block if explicitly supplied & already taken
      for (let r = 1; r < values.length; r++) {
        if (String(values[r][idx['Employee No']] || '').trim() === empNo) {
          throw new Error('Employee No "' + empNo + '" is already taken');
        }
      }
    }
    writeRow = sheet.getLastRow() + 1;
  } else {
    empNo = String(values[targetRow - 1][idx['Employee No']] || '').trim();
    writeRow = targetRow;
  }

  // Compose the row write
  const orgLevel = (payload.name === g.principal) ? 'Principal'
                  : (payload.name === g.teamLead ? 'Team Lead' : 'Member');
  const writes = {
    'Employee No':       empNo,
    'Employee Name':     payload.name,
    'Work Email':        payload.email,
    'Principal':         g.principal,
    'Group Key':         payload.groupKey,
    'Group / Team':      g.name,
    'Team Lead':         g.teamLead,
    'Org Level':         orgLevel,
    'Job Title':         payload.title,
    'Include in Org':    payload.include !== false,
    'Department':        payload.department || '',
    'Worker Type':       payload.workerType || '',
    'Notes':             payload.notes || ''
  };
  if (idx['DOJ'] !== undefined) writes['DOJ'] = payload.doj ? new Date(payload.doj) : '';
  if (idx['Prior Exp (yrs)'] !== undefined) writes['Prior Exp (yrs)'] = payload.priorExpYears !== '' && payload.priorExpYears != null ? Number(payload.priorExpYears) : '';
  if (idx['Image URL'] !== undefined) writes['Image URL'] = payload.imageURL || '';
  if (idx['Designation Level'] !== undefined) writes['Designation Level'] = lvl.label;
  if (idx['Designation Color'] !== undefined) writes['Designation Color'] = lvl.color;

  // Build the full row array preserving existing untouched columns
  const rowValues = [];
  for (let c = 0; c < headers.length; c++) {
    const colName = headers[c];
    if (writes.hasOwnProperty(colName)) {
      rowValues.push(writes[colName]);
    } else if (!isNew) {
      rowValues.push(values[targetRow - 1][c]);
    } else {
      rowValues.push('');
    }
  }
  sheet.getRange(writeRow, 1, 1, headers.length).setValues([rowValues]);

  return { ok: true, employeeNo: empNo, isNew: isNew,
           message: isNew ? 'Created ' + payload.name : 'Updated ' + payload.name };
}

/**
 * Soft-delete or restore a person — flip the Include in Org checkbox.
 */
function setPersonInclude(employeeNo, include) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(ORG_CONFIG.masterSheet);
  if (!sheet) throw new Error('Master_Employees not found');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const idx = {}; headers.forEach((h, i) => idx[h] = i);
  if (idx['Employee No'] === undefined || idx['Include in Org'] === undefined)
    throw new Error('Missing required columns');
  const en = String(employeeNo).trim();
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idx['Employee No']] || '').trim() === en) {
      sheet.getRange(r + 1, idx['Include in Org'] + 1).setValue(!!include);
      return { ok: true,
               message: (include ? 'Restored ' : 'Hidden ') +
                        String(values[r][idx['Employee Name']] || '') };
    }
  }
  throw new Error('Employee ' + en + ' not found');
}

/**
 * Create or update a system in the Systems sheet.
 * payload = { systemId, type, assignedEmail, makeModel, processor, ramGB,
 *             storage, gpu, os, officeVersion, autocadVersion, sketchupVersion,
 *             adobeVersions, threedsmaxVersion, status, serialNo, notes }
 */
function upsertSystem(payload) {
  if (!payload) throw new Error('No payload');
  payload.systemId = String(payload.systemId || '').trim();
  payload.type = String(payload.type || '').trim();
  if (!payload.systemId) throw new Error('System ID is required');
  if (!payload.type) throw new Error('Type is required');
  if (['Desktop', 'Laptop'].indexOf(payload.type) === -1)
    throw new Error('Type must be Desktop or Laptop');

  if (payload.assignedEmail) {
    payload.assignedEmail = String(payload.assignedEmail).trim().toLowerCase();
    if (payload.assignedEmail && payload.assignedEmail.indexOf('@') === -1)
      throw new Error('Assigned email is not valid');
  }

  const sheet = SpreadsheetApp.getActive().getSheetByName(ORG_CONFIG.systemsSheet);
  if (!sheet) throw new Error('Systems sheet not found');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const idx = {}; headers.forEach((h, i) => idx[h] = i);
  if (idx['System ID'] === undefined) throw new Error('Systems sheet is missing System ID column');

  // Validate assigned email if present — must be in Master
  let userDisplay = '', team = '';
  if (payload.assignedEmail) {
    const master = readTable_(ORG_CONFIG.masterSheet);
    let found = false;
    master.rows.forEach(r => {
      const em = String(r[master.idx['Work Email']] || '').trim().toLowerCase();
      if (em === payload.assignedEmail) {
        found = true;
        userDisplay = String(r[master.idx['Employee Name']] || '');
        team = String(r[master.idx['Group / Team']] || '');
      }
    });
    if (!found) throw new Error('Assigned email "' + payload.assignedEmail +
                                '" is not in Master_Employees. Add the person first.');
  }

  // Find existing row by System ID
  let targetRow = -1;
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idx['System ID']] || '').trim() === payload.systemId) {
      targetRow = r + 1; break;
    }
  }
  const isNew = targetRow < 0;
  const writeRow = isNew ? sheet.getLastRow() + 1 : targetRow;

  const writes = {
    'System ID':         payload.systemId,
    'Type':              payload.type,
    'Assigned Email':    payload.assignedEmail || '',
    'User Display':      userDisplay,
    'Team':              team,
    'Make / Model':      payload.makeModel || '',
    'Processor':         payload.processor || '',
    'RAM (GB)':          payload.ramGB ? Number(payload.ramGB) : '',
    'Storage':           payload.storage || '',
    'Graphics Card':     payload.gpu || '',
    'OS':                payload.os || '',
    'Office Version':    payload.officeVersion || '',
    'AutoCAD Version':   payload.autocadVersion || '',
    'SketchUp Version':  payload.sketchupVersion || '',
    'Adobe Versions':    payload.adobeVersions || '',
    '3ds Max Version':   payload.threedsmaxVersion || '',
    'Status':            payload.status || 'Active',
    'Serial No':         payload.serialNo || '',
    'Notes':             payload.notes || ''
  };

  // AUTO-GRADE on save: recompute tier/capability/score/suggestion
  const grade = gradePc_(payload.processor || '', payload.gpu || '', payload.ramGB || '');
  writes['Tier'] = grade.tier;
  writes['Capability'] = grade.capability;
  writes['Grade Score'] = grade.score;
  writes['Upgrade Suggestion'] = grade.suggestion;

  const rowValues = [];
  for (let c = 0; c < headers.length; c++) {
    if (writes.hasOwnProperty(headers[c])) rowValues.push(writes[headers[c]]);
    else if (!isNew) rowValues.push(values[targetRow - 1][c]);
    else rowValues.push('');
  }
  sheet.getRange(writeRow, 1, 1, headers.length).setValues([rowValues]);

  return { ok: true, systemId: payload.systemId, isNew: isNew, grade: grade,
           message: (isNew ? 'Added machine ' : 'Updated ') + payload.systemId };
}

/**
 * Create or update a group/team.
 * payload = { key, name, principal, teamLead, color, sort, active, notes }
 */
function upsertGroup(payload) {
  if (!payload) throw new Error('No payload');
  payload.key = String(payload.key || '').trim();
  payload.name = String(payload.name || '').trim();
  payload.principal = String(payload.principal || '').trim();
  if (!payload.key) throw new Error('Group key is required');
  if (!payload.name) throw new Error('Group name is required');
  if (!payload.principal) throw new Error('Principal is required');

  const validPrincipals = ORG_CONFIG.principals.map(p => p.name);
  if (validPrincipals.indexOf(payload.principal) === -1)
    throw new Error('Principal must be one of: ' + validPrincipals.join(', '));

  const sheet = SpreadsheetApp.getActive().getSheetByName(ORG_CONFIG.groupsSheet);
  if (!sheet) throw new Error('Groups sheet not found');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const idx = {}; headers.forEach((h, i) => idx[h] = i);

  let targetRow = -1;
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idx['Group Key']] || '').trim() === payload.key) {
      targetRow = r + 1; break;
    }
  }
  const isNew = targetRow < 0;
  const writeRow = isNew ? sheet.getLastRow() + 1 : targetRow;

  const writes = {
    'Group Key':    payload.key,
    'Group / Team': payload.name,
    'Principal':    payload.principal,
    'Team Lead':    payload.teamLead || payload.principal,
    'Color Hex':    payload.color || '#475E4A',
    'Sort':         payload.sort != null ? Number(payload.sort) : 999,
    'Active':       payload.active !== false,
    'Notes':        payload.notes || ''
  };
  const rowValues = [];
  for (let c = 0; c < headers.length; c++) {
    if (writes.hasOwnProperty(headers[c])) rowValues.push(writes[headers[c]]);
    else if (!isNew) rowValues.push(values[targetRow - 1][c]);
    else rowValues.push('');
  }
  sheet.getRange(writeRow, 1, 1, headers.length).setValues([rowValues]);

  return { ok: true, key: payload.key, isNew: isNew,
           message: (isNew ? 'Created team ' : 'Updated ') + payload.name };
}

/**
 * Create or update a licence contract in License_Inventory.
 * payload = { contractKey, software, category, entity, vendor, seats,
 *             startDate, endDate, cost, status, notes }
 * If contractKey exists → update. Otherwise → create (auto-generates LIC-NNNN).
 */
function upsertContract(payload) {
  if (!payload) throw new Error('No payload');
  payload.software = String(payload.software || '').trim();
  payload.vendor = String(payload.vendor || '').trim();
  if (!payload.software) throw new Error('Software name is required');
  if (!payload.vendor) throw new Error('Vendor is required');
  payload.seats = Number(payload.seats || 0);
  if (payload.seats < 0) throw new Error('Seats cannot be negative');

  const sheet = SpreadsheetApp.getActive().getSheetByName(ORG_CONFIG.inventorySheet);
  if (!sheet) throw new Error('License_Inventory sheet not found');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const idx = {}; headers.forEach((h, i) => idx[h] = i);
  if (idx['Contract Key'] === undefined) throw new Error('License_Inventory missing Contract Key column');

  // Find existing
  let targetRow = -1;
  const ck = String(payload.contractKey || '').trim();
  if (ck) {
    for (let r = 1; r < values.length; r++) {
      if (String(values[r][idx['Contract Key']] || '').trim() === ck) { targetRow = r + 1; break; }
    }
  }
  const isNew = targetRow < 0;
  let contractKey = ck;
  if (isNew && !contractKey) {
    // Auto-generate LIC-NNNN
    const used = {};
    for (let r = 1; r < values.length; r++) {
      const v = String(values[r][idx['Contract Key']] || '').trim();
      const m = v.match(/^LIC-(\d+)$/);
      if (m) used[parseInt(m[1], 10)] = true;
    }
    let n = 1;
    while (used[n]) n++;
    contractKey = 'LIC-' + String(n).padStart(4, '0');
  }
  const writeRow = isNew ? sheet.getLastRow() + 1 : targetRow;

  const seatsCol = colIdx_(idx, ['People', 'Seats']);
  const writes = {
    'Contract Key': contractKey,
    'Software':     payload.software,
    'Category':     payload.category || '',
    'Entity':       payload.entity || '',
    'Vendor':       payload.vendor,
    'Start Date':   payload.startDate ? new Date(payload.startDate) : '',
    'End Date':     payload.endDate ? new Date(payload.endDate) : '',
    'Cost':         payload.cost != null && payload.cost !== '' ? Number(payload.cost) : '',
    'Status':       payload.status || 'Active',
    'Notes':        payload.notes || ''
  };
  // Handle Seats / People column name variation
  if (idx['Seats'] !== undefined) writes['Seats'] = payload.seats;
  if (idx['People'] !== undefined) writes['People'] = payload.seats;

  const rowValues = [];
  for (let c = 0; c < headers.length; c++) {
    if (writes.hasOwnProperty(headers[c])) rowValues.push(writes[headers[c]]);
    else if (!isNew) rowValues.push(values[targetRow - 1][c]);
    else rowValues.push('');
  }
  sheet.getRange(writeRow, 1, 1, headers.length).setValues([rowValues]);

  return { ok: true, contractKey: contractKey, isNew: isNew,
           message: (isNew ? 'Added contract ' : 'Updated ') + payload.software };
}

/**
 * Return the list of distinct software titles available for assignment.
 * Source: License_Inventory.Software, deduplicated and shortened.
 */
function getAvailableSoftwareTitles() {
  const inv = readTable_(ORG_CONFIG.inventorySheet);
  const idx = inv.idx;
  const titles = {};
  inv.rows.forEach(row => {
    const sw = String(row[idx['Software']] || '').trim();
    if (!sw) return;
    const short = shortNameFor_(sw);
    if (!titles[short]) {
      titles[short] = {
        shortName: short,
        software: sw,
        seats: 0,
        assigned: 0
      };
    }
    const seats = Number(row[colIdx_(idx, ['People', 'Seats'])] || 0);
    titles[short].seats += seats;
  });
  // Count assignments
  const lic = readTable_(ORG_CONFIG.licensesSheet);
  lic.rows.forEach(row => {
    const t = String(row[lic.idx['License / Tool']] || '').trim();
    const status = String(row[lic.idx['Status']] || '').trim();
    if (!t || status === 'Removed') return;
    const short = shortNameFor_(t);
    if (titles[short]) titles[short].assigned += 1;
  });
  return Object.values(titles).sort((a, b) => a.shortName.localeCompare(b.shortName));
}

/**
 * Return all licence holders for a given software (used by "who has this?").
 */
function getLicenceHolders(software) {
  if (!software) return [];
  const want = String(software).trim().toLowerCase();
  const lic = readTable_(ORG_CONFIG.licensesSheet);
  const master = readTable_(ORG_CONFIG.masterSheet);
  const masterByEmail = {};
  master.rows.forEach(r => {
    const em = String(r[master.idx['Work Email']] || '').trim().toLowerCase();
    if (em) masterByEmail[em] = {
      name: String(r[master.idx['Employee Name']] || ''),
      title: String(r[master.idx['Job Title']] || ''),
      team: String(r[master.idx['Group / Team']] || ''),
      designationColor: master.idx['Designation Color'] !== undefined
        ? String(r[master.idx['Designation Color']] || '#1A2332')
        : '#1A2332'
    };
  });
  const out = [];
  lic.rows.forEach(r => {
    const em = String(r[lic.idx['Work Email']] || '').trim().toLowerCase();
    const tool = String(r[lic.idx['License / Tool']] || '').trim();
    const status = String(r[lic.idx['Status']] || '').trim();
    if (!em || !tool || status === 'Removed') return;
    if (tool.toLowerCase() === want || String(want).indexOf(tool.toLowerCase()) !== -1 ||
        tool.toLowerCase().indexOf(want) !== -1) {
      const info = masterByEmail[em] || { name: em, title: '', team: '', designationColor: '#1A2332' };
      out.push({
        email: em,
        name: info.name,
        title: info.title,
        team: info.team,
        designationColor: info.designationColor,
        tool: tool,
        assignedOn: r[lic.idx['Assigned On']] instanceof Date
          ? Utilities.formatDate(r[lic.idx['Assigned On']], Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd')
          : ''
      });
    }
  });
  return out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}


// ═════════════════════════════════════════════════════════════════════════
// PROPERTIESSERVICE SECRETS — set / get / list / seed / rotate
// Values NEVER touch a cell. Registry sheet only carries metadata.
// ═════════════════════════════════════════════════════════════════════════
function setSecret(key, value, type, belongsTo, owner) {
  if (!key) throw new Error('Secret key required');
  if (!value) throw new Error('Secret value required');
  PropertiesService.getScriptProperties().setProperty('secret.' + key, String(value));
  upsertSecretRegistry_(key, belongsTo || '', type || 'Other', owner || '', new Date());
  return { ok: true };
}

function getSecret(key) {
  if (!key) throw new Error('Secret key required');
  const v = PropertiesService.getScriptProperties().getProperty('secret.' + key);
  if (v == null) throw new Error('No such secret: ' + key);
  return v;
}

function deleteSecret(key) {
  PropertiesService.getScriptProperties().deleteProperty('secret.' + key);
  removeSecretRegistry_(key);
  return { ok: true };
}

function listSecretKeys() {
  const all = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(all).filter(k => k.indexOf('secret.') === 0).map(k => k.substring(7)).sort();
}

function upsertSecretRegistry_(key, belongsTo, type, owner, rotatedAt) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ORG_CONFIG.secretsRegistrySheet);
  if (!sh) {
    sh = ss.insertSheet(ORG_CONFIG.secretsRegistrySheet);
    sh.appendRow(['Secret Key', 'Belongs To', 'Type', 'Stored In', 'Last Rotated', 'Owner', 'Notes']);
  }
  const values = sh.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][0]) === key) {
      sh.getRange(r + 1, 5).setValue(rotatedAt);
      if (belongsTo) sh.getRange(r + 1, 2).setValue(belongsTo);
      if (type) sh.getRange(r + 1, 3).setValue(type);
      if (owner) sh.getRange(r + 1, 6).setValue(owner);
      return;
    }
  }
  sh.appendRow([key, belongsTo, type, 'PropertiesService', rotatedAt, owner, '']);
}

function removeSecretRegistry_(key) {
  const sh = SpreadsheetApp.getActive().getSheetByName(ORG_CONFIG.secretsRegistrySheet);
  if (!sh) return;
  const values = sh.getDataRange().getValues();
  for (let r = values.length - 1; r >= 1; r--) {
    if (String(values[r][0]) === key) sh.deleteRow(r + 1);
  }
}

// ─── Menu wrappers for secrets ───────────────────────────────────────────
function menuSetSecret() {
  const ui = SpreadsheetApp.getUi();
  const k = ui.prompt('Set Secret', 'Secret key (e.g. system.LDS-02.windows_key):', ui.ButtonSet.OK_CANCEL);
  if (k.getSelectedButton() !== ui.Button.OK) return;
  const v = ui.prompt('Set Secret', 'Value for ' + k.getResponseText() + ':', ui.ButtonSet.OK_CANCEL);
  if (v.getSelectedButton() !== ui.Button.OK) return;
  const t = ui.prompt('Set Secret', 'Type (Windows Key / RDP PIN / etc):', ui.ButtonSet.OK_CANCEL);
  setSecret(k.getResponseText().trim(), v.getResponseText(), t.getResponseText() || 'Other', '',
    (Session.getActiveUser() && Session.getActiveUser().getEmail()) || '');
  ui.alert('Secret saved.\n\nValue is encrypted at rest in PropertiesService and registered in Secrets_Registry. No cell contains the value.');
}

function menuGetSecret() {
  const ui = SpreadsheetApp.getUi();
  const k = ui.prompt('Get Secret', 'Secret key:', ui.ButtonSet.OK_CANCEL);
  if (k.getSelectedButton() !== ui.Button.OK) return;
  try {
    const v = getSecret(k.getResponseText().trim());
    ui.alert('Secret: ' + k.getResponseText(),
      v + '\n\nWARNING: this value is shown only in this modal. It is not written to any cell. Close as soon as you have copied it.',
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Error', e.message, ui.ButtonSet.OK);
  }
}

function menuListSecrets() {
  const keys = listSecretKeys();
  SpreadsheetApp.getUi().alert(
    'Stored secrets (' + keys.length + ')',
    keys.length ? keys.join('\n') : 'None yet. Use "Seed Secrets from JSON" or "Set Secret".',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SECRETS SEEDING — fixed for 769-key bulk import
// Replaces the old menuSeedSecrets. Two-path approach:
//   1. menuSeedSecrets       — paste small batches via the standard prompt
//   2. menuSeedSecretsFromSheet — large dumps via a temporary sheet (recommended)
//
// Why the original failed: ui.prompt() truncates input around ~50 KB, and
// 769 individual setProperty() calls inside one execution sometimes trips
// the "Error resuming script execution" timeout when paired with the
// per-row registry upsert (which itself does a getDataRange().getValues()
// scan 769 times — O(n²)).
//
// Fixes here:
//   • setProperties() in ONE call instead of 769 individual setProperty()s
//   • Registry sheet is already populated by the workbook builder, so seeding
//     only updates the Last Rotated column in BULK (single setValues call)
//   • Falls back to reading the JSON from a temp sheet for large payloads
// ═════════════════════════════════════════════════════════════════════════

/**
 * SMALL BATCHES (< ~40 KB pasted JSON): use this.
 */
function menuSeedSecrets() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt(
    'Seed Secrets — small batch',
    'Paste a JSON object: {"key1":"value1","key2":"value2",...}\n\n' +
    'For the full 769-key seed file, use "Seed Secrets from Sheet" instead — ' +
    'the prompt box truncates large pastes.',
    ui.ButtonSet.OK_CANCEL
  );
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const txt = r.getResponseText();
  seedSecretsFromString_(txt);
}

/**
 * LARGE PAYLOADS (recommended for the full secrets_seed.json):
 *   1. Create a sheet called "_seed_tmp"
 *   2. Paste the ENTIRE contents of secrets_seed.json into cell A1
 *      (Google Sheets accepts cell strings up to 50,000 chars — but A1 alone
 *       can hold the full JSON because Sheets stores strings up to ~50K chars.
 *       If even that fails for you, split the JSON into multiple cells A1..An
 *       and the function will concatenate them.)
 *   3. Run "Studio Lotus → Seed Secrets from Sheet"
 *   4. Once it reports success, DELETE the _seed_tmp sheet and the local JSON file
 */
function menuSeedSecretsFromSheet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('_seed_tmp');
  if (!sh) {
    ui.alert(
      'Seed sheet not found',
      'Create a sheet called "_seed_tmp" and paste the contents of secrets_seed.json into cell A1.\n' +
      'If the JSON is too long for a single cell, split it across A1, A2, A3, ... — the function concatenates them in order.',
      ui.ButtonSet.OK
    );
    return;
  }
  // Read all non-empty cells from column A and concatenate
  const values = sh.getRange('A1:A' + sh.getLastRow()).getValues();
  const txt = values.map(r => String(r[0] || '')).join('').trim();
  if (!txt) {
    ui.alert('Cell A1 is empty. Paste the JSON contents and run again.');
    return;
  }
  seedSecretsFromString_(txt);

  // Offer to delete the temp sheet immediately
  const confirm = ui.alert('Delete _seed_tmp sheet now?',
    'The seed values have been moved to encrypted PropertiesService. The _seed_tmp sheet still contains them in cleartext — delete it now?',
    ui.ButtonSet.YES_NO);
  if (confirm === ui.Button.YES) {
    ss.deleteSheet(sh);
    ui.alert('Done. _seed_tmp deleted. Delete secrets_seed.json from your machine.');
  }
}

/**
 * Shared core. Accepts a JSON string in either form:
 *   (a) the full seed file: {"instructions":..., "count":..., "secrets": {...}}
 *   (b) just the secrets object: {"key1":"value1", ...}
 */
function seedSecretsFromString_(txt) {
  const ui = SpreadsheetApp.getUi();
  if (!txt || !txt.trim()) { ui.alert('No JSON received'); return; }

  let parsed;
  try { parsed = JSON.parse(txt); }
  catch (e) {
    ui.alert('Could not parse JSON', e.message + '\n\nFirst 200 chars received:\n' + txt.substring(0, 200), ui.ButtonSet.OK);
    return;
  }

  // Accept either the full seed object or just the inner secrets dict
  let obj;
  if (parsed && typeof parsed === 'object' && parsed.secrets && typeof parsed.secrets === 'object') {
    obj = parsed.secrets;
  } else if (parsed && typeof parsed === 'object') {
    obj = parsed;
  } else {
    ui.alert('Expected a JSON object'); return;
  }

  const keys = Object.keys(obj);
  if (!keys.length) { ui.alert('No keys found in the JSON'); return; }

  // BUILD the properties payload (key prefix + string-coerced value)
  const props = {};
  keys.forEach(k => { props['secret.' + k] = String(obj[k]); });

  // ONE call writes all 769 properties atomically — orders of magnitude faster
  PropertiesService.getScriptProperties().setProperties(props);

  // Bulk-update the Last Rotated column on Secrets_Registry in ONE setValues call
  try {
    const regSh = SpreadsheetApp.getActive().getSheetByName(ORG_CONFIG.secretsRegistrySheet);
    if (regSh) {
      const lastRow = regSh.getLastRow();
      if (lastRow >= 3) {
        const keysInSheet = regSh.getRange(3, 1, lastRow - 2, 1).getValues();
        const now = new Date();
        const updates = keysInSheet.map(row => {
          const k = String(row[0] || '');
          return obj.hasOwnProperty(k) ? [now] : [regSh.getRange(3, 5).getValue()]; // unchanged if not in seed
        });
        // Actually only stamp rows whose key is in the seed — preserve others
        const stamps = [];
        const existing = regSh.getRange(3, 5, lastRow - 2, 1).getValues();
        for (let i = 0; i < keysInSheet.length; i++) {
          const k = String(keysInSheet[i][0] || '');
          stamps.push([obj.hasOwnProperty(k) ? now : existing[i][0]]);
        }
        regSh.getRange(3, 5, stamps.length, 1).setValues(stamps);
      }
    }
  } catch (err) {
    // Registry update is cosmetic — don't fail the whole seed if it errors
    Logger.log('Registry rotation-stamp update failed (non-fatal): ' + err.message);
  }

  ui.alert(
    '✓ Seeded ' + keys.length + ' secrets.',
    'Values are now encrypted at rest in PropertiesService.\n\n' +
    '⚠ Delete secrets_seed.json from your machine NOW.\n' +
    '⚠ If you used "_seed_tmp" sheet, delete that too.\n\n' +
    'Verify with Studio Lotus → List Secret Keys.',
    ui.ButtonSet.OK
  );
}

// ═════════════════════════════════════════════════════════════════════════
// REFRESH HELPERS
// ═════════════════════════════════════════════════════════════════════════
function refreshDesignationColumns_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(ORG_CONFIG.masterSheet);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(h => String(h || '').trim());
  const idx = {}; headers.forEach((h, i) => idx[h] = i);
  if (idx['Job Title'] === undefined ||
      idx['Designation Level'] === undefined ||
      idx['Designation Color'] === undefined) return;
  const titleCol = idx['Job Title'] + 1;
  const lvlCol = idx['Designation Level'] + 1;
  const colCol = idx['Designation Color'] + 1;
  const titles = sheet.getRange(2, titleCol, lastRow - 1, 1).getValues();
  const lvls = [], cols = [];
  for (let i = 0; i < titles.length; i++) {
    const l = levelFor_(titles[i][0]);
    lvls.push([l.label]);
    cols.push([l.color]);
  }
  sheet.getRange(2, lvlCol, lvls.length, 1).setValues(lvls);
  sheet.getRange(2, colCol, cols.length, 1).setValues(cols);
}

function rebuildUserLicenseMatrix_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(ORG_CONFIG.userMatrixSheet);
  if (!sheet) return;
  const master = readTable_(ORG_CONFIG.masterSheet);
  const lic = readTable_(ORG_CONFIG.licensesSheet);
  const mi = master.idx, li = lic.idx;
  if (!master.rows.length) return;

  const toolUse = {};
  lic.rows.forEach(r => {
    const t = cleanCell_(r[li['License / Tool']]);
    if (t) toolUse[t] = (toolUse[t] || 0) + 1;
  });
  const tools = Object.keys(toolUse).sort((a, b) => toolUse[b] - toolUse[a] || a.localeCompare(b));

  const has = {};
  lic.rows.forEach(r => {
    const em = String(r[li['Work Email']] || '').trim().toLowerCase();
    const t = cleanCell_(r[li['License / Tool']]);
    if (em && t) has[em + '|' + t] = true;
  });

  const people = master.rows
    .filter(r => normalizeBoolean_(r[mi['Include in Org']]))
    .map(r => ({
      name: String(r[mi['Employee Name']] || '').trim(),
      email: String(r[mi['Work Email']] || '').trim().toLowerCase(),
      principal: String(r[mi['Principal']] || '').trim(),
      team: String(r[mi['Group / Team']] || '').trim(),
      title: String(r[mi['Job Title']] || '').trim()
    }))
    .filter(p => p.name)
    .sort((a, b) => (a.principal + a.team + a.name).localeCompare(b.principal + b.team + b.name));

  sheet.clear();
  sheet.getRange(1, 1).setValue('Who has what — User × License matrix')
    .setFontSize(14).setFontWeight('bold').setFontColor('#1A2332');
  sheet.getRange(2, 1).setValue('✓ marks every (user, tool) pair from the Licenses sheet. Auto-refreshes on every edit. Last: ' + new Date().toLocaleString())
    .setFontStyle('italic').setFontColor('#707A87');

  const headers = ['Employee', 'Email', 'Principal', 'Team', 'Job Title'].concat(tools).concat(['Total']);
  sheet.getRange(4, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1A2332').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center').setWrap(true);
  sheet.getRange(4, 1, 1, 5).setHorizontalAlignment('left');

  if (!people.length) return;
  const rows = people.map(p => {
    const r = [p.name, p.email, p.principal, p.team, p.title];
    let count = 0;
    tools.forEach(t => {
      const v = has[p.email + '|' + t] ? '✓' : '';
      if (v) count++;
      r.push(v);
    });
    r.push(count);
    return r;
  });
  sheet.getRange(5, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(4);
  sheet.setFrozenColumns(2);
}

function rebuildGroupLicenseView_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(ORG_CONFIG.groupLicenseSheet);
  if (!sheet) return;
  const master = readTable_(ORG_CONFIG.masterSheet);
  const lic = readTable_(ORG_CONFIG.licensesSheet);
  const mi = master.idx, li = lic.idx;

  const personTeam = {};
  master.rows.forEach(r => {
    const em = String(r[mi['Work Email']] || '').trim().toLowerCase();
    if (em && normalizeBoolean_(r[mi['Include in Org']])) {
      personTeam[em] = {
        principal: String(r[mi['Principal']] || '').trim(),
        team: String(r[mi['Group / Team']] || '').trim()
      };
    }
  });

  const toolUse = {};
  lic.rows.forEach(r => {
    const t = cleanCell_(r[li['License / Tool']]);
    if (t) toolUse[t] = (toolUse[t] || 0) + 1;
  });
  const tools = Object.keys(toolUse).sort((a, b) => toolUse[b] - toolUse[a] || a.localeCompare(b));

  const grid = {};
  lic.rows.forEach(r => {
    const em = String(r[li['Work Email']] || '').trim().toLowerCase();
    const t = cleanCell_(r[li['License / Tool']]);
    const pt = personTeam[em];
    if (!em || !t || !pt) return;
    const key = pt.principal + '||' + pt.team;
    if (!grid[key]) grid[key] = { principal: pt.principal, team: pt.team, counts: {} };
    grid[key].counts[t] = (grid[key].counts[t] || 0) + 1;
  });

  const rows = Object.values(grid)
    .sort((a, b) => (a.principal + a.team).localeCompare(b.principal + b.team));

  sheet.clear();
  sheet.getRange(1, 1).setValue('Group × License utilisation')
    .setFontSize(14).setFontWeight('bold').setFontColor('#1A2332');
  sheet.getRange(2, 1).setValue('Auto-refreshes on every edit. Last: ' + new Date().toLocaleString())
    .setFontStyle('italic').setFontColor('#707A87');
  const headers = ['Principal', 'Group / Team'].concat(tools).concat(['Total']);
  sheet.getRange(4, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1A2332').setFontColor('#FFFFFF');
  if (!rows.length) return;
  const out = rows.map(g => {
    const r = [g.principal, g.team];
    let tot = 0;
    tools.forEach(t => { const v = g.counts[t] || 0; tot += v; r.push(v || ''); });
    r.push(tot);
    return r;
  });
  sheet.getRange(5, 1, out.length, headers.length).setValues(out);
  sheet.setFrozenRows(4);
  sheet.setFrozenColumns(2);
}

// ═════════════════════════════════════════════════════════════════════════
// BULK RE-GRADE — recompute and write tier/capability/score/suggestion for
// every system row. Run from menu, or automatically after sheet edits.
// ═════════════════════════════════════════════════════════════════════════
function regradeAllSystems() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(ORG_CONFIG.systemsSheet);
  if (!sheet) return { ok: false, message: 'Systems sheet not found' };
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { ok: false, message: 'No systems' };
  const headers = values[0].map(h => String(h || '').trim());
  const idx = {}; headers.forEach((h, i) => idx[h] = i);
  if (idx['Tier'] === undefined || idx['Processor'] === undefined) {
    return { ok: false, message: 'Systems sheet missing Tier or Processor column' };
  }
  // Build column write batches
  const tierCol = idx['Tier'] + 1;
  const capCol = (idx['Capability'] !== undefined ? idx['Capability'] : idx['Tier']) + 1;
  const scoreCol = (idx['Grade Score'] !== undefined ? idx['Grade Score'] : idx['Tier']) + 1;
  const sugCol = (idx['Upgrade Suggestion'] !== undefined ? idx['Upgrade Suggestion'] : idx['Tier']) + 1;

  const tiers = [], caps = [], scores = [], sugs = [];
  let n = 0;
  for (let r = 1; r < values.length; r++) {
    const sysId = String(values[r][idx['System ID']] || '').trim();
    if (!sysId) { tiers.push(['']); caps.push(['']); scores.push(['']); sugs.push(['']); continue; }
    const g = gradePc_(
      String(values[r][idx['Processor']] || ''),
      String(values[r][idx['Graphics Card']] || ''),
      values[r][idx['RAM (GB)']] || ''
    );
    tiers.push([g.tier]); caps.push([g.capability]); scores.push([g.score]); sugs.push([g.suggestion]);
    n++;
  }
  const numRows = values.length - 1;
  if (idx['Tier'] !== undefined) sheet.getRange(2, tierCol, numRows, 1).setValues(tiers);
  if (idx['Capability'] !== undefined) sheet.getRange(2, capCol, numRows, 1).setValues(caps);
  if (idx['Grade Score'] !== undefined) sheet.getRange(2, scoreCol, numRows, 1).setValues(scores);
  if (idx['Upgrade Suggestion'] !== undefined) sheet.getRange(2, sugCol, numRows, 1).setValues(sugs);

  // Colour the tier cells
  const TIER_BG = {
    'Workstation': '#D6E4DC', 'Performance': '#E3EAD9', 'Standard': '#F3EEDD',
    'Basic': '#F6E8DC', 'Entry': '#F2DEDE'
  };
  for (let i = 0; i < tiers.length; i++) {
    const bg = TIER_BG[tiers[i][0]];
    if (bg) sheet.getRange(i + 2, tierCol).setBackground(bg);
  }
  return { ok: true, count: n, message: 'Re-graded ' + n + ' systems' };
}

function menuRegradeAll() {
  const res = regradeAllSystems();
  SpreadsheetApp.getUi().alert(res.ok ? 'Done' : 'Note', res.message, SpreadsheetApp.getUi().ButtonSet.OK);
}


// ═════════════════════════════════════════════════════════════════════════
// SYSTEM HEALTH CHECK
// ═════════════════════════════════════════════════════════════════════════
function runSystemHealthCheck() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ORG_CONFIG.systemHealthSheet);
  if (!sh) sh = ss.insertSheet(ORG_CONFIG.systemHealthSheet);
  const issues = computeSystemHealth_();

  sh.clear();
  sh.getRange(1, 1).setValue('System Health — auto-scan')
    .setFontSize(14).setFontWeight('bold').setFontColor('#1A2332');
  sh.getRange(2, 1).setValue('Last run: ' + new Date().toLocaleString() + '  ·  ' + issues.length + ' issue(s)')
    .setFontColor(issues.length ? '#8A1A1A' : '#1E7A3D');
  const head = ['Severity', 'Category', 'System / Person', 'Detail', 'Fix'];
  sh.getRange(4, 1, 1, 5).setValues([head]).setFontWeight('bold')
    .setBackground('#1A2332').setFontColor('#FFFFFF');
  if (issues.length) {
    sh.getRange(5, 1, issues.length, 5).setValues(
      issues.map(i => [i.sev, i.cat, i.rec, i.detail, i.fix]));
    for (let r = 0; r < issues.length; r++) {
      if (issues[r].sev === 'HIGH') sh.getRange(5 + r, 1, 1, 5).setBackground('#FCE0E0');
      else if (issues[r].sev === 'MED') sh.getRange(5 + r, 1, 1, 5).setBackground('#FFF2D9');
    }
  } else {
    sh.getRange(5, 1).setValue('✓ No system issues found.')
      .setFontColor('#1E7A3D').setFontWeight('bold');
  }
  [110, 150, 240, 360, 320].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.setFrozenRows(4);
}

function computeSystemHealth_() {
  const out = [];
  const sys = getSystemsData_();
  const master = readTable_(ORG_CONFIG.masterSheet);
  const lic = readTable_(ORG_CONFIG.licensesSheet);
  const masterEmails = {};
  master.rows.forEach(r => {
    const em = String(r[master.idx['Work Email']] || '').trim().toLowerCase();
    if (em) masterEmails[em] = String(r[master.idx['Employee Name']] || '');
  });

  // Active licence assignments by (email, tool)
  const licByEmail = {};
  lic.rows.forEach(r => {
    const em = String(r[lic.idx['Work Email']] || '').trim().toLowerCase();
    const t = String(r[lic.idx['License / Tool']] || '').trim();
    if (em && t) {
      if (!licByEmail[em]) licByEmail[em] = {};
      licByEmail[em][t] = true;
    }
  });

  const seenIds = {};
  sys.rows.forEach(s => {
    if (seenIds[s.systemId]) out.push({ sev: 'HIGH', cat: 'Duplicate System ID',
      rec: s.systemId, detail: 'System ID appears twice in Systems sheet',
      fix: 'Each machine needs a unique ID' });
    seenIds[s.systemId] = true;

    if (s.assignedEmail && !masterEmails[s.assignedEmail]) out.push({ sev: 'HIGH',
      cat: 'Ghost owner', rec: s.systemId,
      detail: 'Assigned to ' + s.assignedEmail + ' but that email is not in Master',
      fix: 'Add the person to Master or update Assigned Email' });

    if ((s.status || '').toLowerCase() === 'active' && !s.assignedEmail)
      out.push({ sev: 'MED', cat: 'Unassigned active',
        rec: s.systemId, detail: 'Active machine with no Assigned Email',
        fix: 'Set the owner email or mark as Spare' });

    if (s.ramGB && Number(s.ramGB) <= 16)
      out.push({ sev: 'LOW', cat: 'Upgrade candidate', rec: s.systemId,
        detail: 'RAM is ' + s.ramGB + ' GB — consider upgrading for heavy 3D work',
        fix: 'Plan a RAM upgrade or rotate to lighter workflow' });

    // Licence vs installed mismatch
    const em = s.assignedEmail;
    if (em && licByEmail[em]) {
      Object.keys(licByEmail[em]).forEach(tool => {
        const tl = tool.toLowerCase();
        if (tl.indexOf('autocad') !== -1 && !s.autocadVersion) {
          out.push({ sev: 'MED', cat: 'Licence without install', rec: s.systemId + ' · ' + em,
            detail: 'Holds AutoCAD licence but no AutoCAD version on this machine',
            fix: 'Install or revoke the licence to recover the seat' });
        }
        if (tl.indexOf('sketchup') !== -1 && !s.sketchupVersion) {
          out.push({ sev: 'MED', cat: 'Licence without install', rec: s.systemId + ' · ' + em,
            detail: 'Holds SketchUp licence but no SketchUp on this machine',
            fix: 'Install or revoke the licence' });
        }
      });
    }
  });

  const order = { HIGH: 0, MED: 1, LOW: 2 };
  out.sort((a, b) => order[a.sev] - order[b.sev]);
  return out;
}

// ═════════════════════════════════════════════════════════════════════════
// DATA HEALTH CHECK
// ═════════════════════════════════════════════════════════════════════════
function runDataHealthCheck() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ORG_CONFIG.healthSheet);
  if (!sh) sh = ss.insertSheet(ORG_CONFIG.healthSheet);
  const issues = computeDataHealth_();
  sh.clear();
  sh.getRange(1, 1).setValue('Data Health — auto-scan')
    .setFontSize(14).setFontWeight('bold').setFontColor('#1A2332');
  sh.getRange(2, 1).setValue('Last run: ' + new Date().toLocaleString() + '  ·  ' + issues.length + ' issue(s)')
    .setFontColor(issues.length ? '#8A1A1A' : '#1E7A3D');
  sh.getRange(4, 1, 1, 5).setValues([['Severity','Category','Record','Detail','Fix']])
    .setFontWeight('bold').setBackground('#1A2332').setFontColor('#FFFFFF');
  if (issues.length) {
    sh.getRange(5, 1, issues.length, 5).setValues(
      issues.map(i => [i.sev, i.cat, i.rec, i.detail, i.fix]));
    for (let r = 0; r < issues.length; r++) {
      if (issues[r].sev === 'HIGH') sh.getRange(5 + r, 1, 1, 5).setBackground('#FCE0E0');
      else if (issues[r].sev === 'MED') sh.getRange(5 + r, 1, 1, 5).setBackground('#FFF2D9');
    }
  }
  [110, 130, 230, 360, 320].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.setFrozenRows(4);
}

function computeDataHealth_() {
  const out = [];
  const master = readTable_(ORG_CONFIG.masterSheet);
  const groups = getGroupsMap_();
  const mi = master.idx;
  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const seenEmp = {};
  master.rows.forEach(row => {
    const name = String(row[mi['Employee Name']] || '').trim();
    const email = String(row[mi['Work Email']] || '').trim().toLowerCase();
    const gk = String(row[mi['Group Key']] || '').trim();
    const emp = String(row[mi['Employee No']] || '').trim();
    const incl = normalizeBoolean_(row[mi['Include in Org']]);
    if (!name && !email) return;
    if (emp) {
      if (seenEmp[emp]) out.push({ sev: 'HIGH', cat: 'Duplicate ID',
        rec: emp + ' / ' + name, detail: 'Employee No used twice',
        fix: 'Give every person a unique Employee No' });
      seenEmp[emp] = true;
    }
    if (incl && email && !emailRe.test(email)) out.push({ sev: 'MED', cat: 'Bad email',
      rec: name, detail: email + ' is not a valid email',
      fix: 'Correct the Work Email' });
    if (incl && gk && !groups[gk]) out.push({ sev: 'HIGH', cat: 'Orphan',
      rec: name, detail: 'Group Key "' + gk + '" does not exist',
      fix: 'Pick a valid Group Key' });
    if (incl && !gk) out.push({ sev: 'HIGH', cat: 'Unassigned',
      rec: name, detail: 'No Group Key set',
      fix: 'Assign to a team' });
    // DOJ sanity — flag missing for Include-in-Org people
    if (incl && mi['DOJ'] !== undefined && !row[mi['DOJ']]) {
      out.push({ sev: 'LOW', cat: 'Missing DOJ', rec: name,
        detail: 'No date of joining → SLExp will show as "—" on the card',
        fix: 'Fill DOJ column to enable experience calculation' });
    }
  });
  const order = { HIGH: 0, MED: 1, LOW: 2 };
  out.sort((a, b) => order[a.sev] - order[b.sev]);
  return out;
}

// ═════════════════════════════════════════════════════════════════════════
// READERS / HELPERS
// ═════════════════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════════════════
// READINESS  — Team software-entitlement & systems-capability gap analysis
// ═════════════════════════════════════════════════════════════════════════
//
// RULES (agreed with stakeholder, May 2026):
//   • Eligible = Members only. Excludes Principal, Team Lead, Group Leader,
//     anyone "Excluded", and ALL Interns. Include in Org must be TRUE.
//   • Teams analysed (8):  the six person-led project teams + Swati + Neelam,
//     plus "Harsh (Homes)" which is the HOMES group only (not Admin/BD/IT/
//     Finance/People who also report to Harsh).
//   • Entitlement ratios (per team, conservative = round DOWN / floor):
//        AutoCAD LT  -> 1 per eligible member (all)
//        SketchUp Pro-> floor(members * 2/3)
//        Enscape     -> floor(members * 1/4)
//        D5 Render   -> floor(members * 1/4)
//        3ds Max     -> EXCLUDED from ratios (fixed single user).
//   • Two parallel lags shown:
//        License lag    = target - licenses currently held (Licenses sheet)
//        Capability lag = target - machines that can actually run the tool
//   • Capability bands (GPU VRAM inferred from model + system RAM):
//        GREEN  (fully capable)   : VRAM >= 12 GB AND RAM >= 32 GB
//        AMBER  (minimum workable): VRAM >=  8 GB AND RAM >= 16 GB
//        FAIL   (cannot run heavy): below AMBER
//        REVIEW : GPU model unrecognised -> manual check, not counted capable
//     D5/Enscape capability counts GREEN only (12 GB recommended bar).
//     AutoCAD/SketchUp run on any active machine.
//   • Machines map to people by EMAIL only. A member with no email-matched
//     active machine is reported as an "untraceable machine" DATA-HEALTH flag,
//     kept SEPARATE from the true hardware gap (the Systems asset register has
//     blank Assigned Email on many rows).

const READINESS_LEADS = [
  'Varun Srivastava', 'Prajwal Yashwant Amin', 'Yatin Tokas',
  'Insiya Pithawala', 'Neelam Das', 'Swati Seshadri', 'Prashant Bharadwaj'
];
const READINESS_HOMES_LABEL = 'Harsh (Homes)';

// Ratio rules. 'all' = one per member. [num,den] = floor(members*num/den).
const READINESS_RATIOS = {
  'AutoCAD LT':   'all',
  'SketchUp Pro': [2, 3],
  'Enscape':      [1, 4],
  'D5 Render':    [1, 4]
};
// Heavy GPU-bound tools require a GREEN (>=12 GB) machine.
const READINESS_HEAVY = { 'Enscape': true, 'D5 Render': true };

/**
 * Infer dedicated-GPU VRAM (GB) from a messy Graphics Card string.
 * Returns a number, or null when the model can't be resolved (-> REVIEW).
 * Handles common mislabels in the sheet ("RTX 1050ti", "RTX 1660" are GTX;
 * "1660 GTX GALEX" = GTX 1660).
 */
function readinessVram_(gpuRaw) {
  let g = String(gpuRaw || '').toUpperCase();
  g = g.replace(/GEFORCE|NVIDIA|GALEX/g, ' ').replace(/\s+/g, ' ').trim();
  if (!g) return null;
  if (/NO GRAPHIC|QU[AR]+DRO K620/.test(g)) return 0;
  // RTX 50-series
  if (/5090/.test(g)) return 32;
  if (/5080/.test(g)) return 16;
  if (/5070\s*TI/.test(g)) return 16;
  if (/5070/.test(g)) return 12;
  if (/5060\s*TI/.test(g)) return 16;
  if (/5060/.test(g)) return 8;
  // RTX 40-series
  if (/4090/.test(g)) return 24;
  if (/4080/.test(g)) return 16;
  if (/4070\s*TI/.test(g)) return 12;
  if (/4070/.test(g)) return 12;
  if (/4060\s*TI/.test(g)) return 8;   // desktop 4060 Ti = 8 GB
  if (/4060/.test(g)) return 8;
  // RTX 30 / 20
  if (/3090/.test(g)) return 24;
  if (/3080/.test(g)) return 10;
  if (/3070/.test(g)) return 8;
  if (/3060\s*TI/.test(g)) return 8;
  if (/3060/.test(g)) return 12;
  if (/2080/.test(g)) return 8;
  if (/2070/.test(g)) return 8;
  if (/2060/.test(g)) return 6;
  // GTX (including mislabeled "RTX 1xxx")
  if (/1080\s*TI/.test(g)) return 11;
  if (/1080/.test(g)) return 8;
  if (/1070/.test(g)) return 8;
  if (/1660/.test(g)) return 6;
  if (/1650/.test(g)) return 4;
  if (/1060/.test(g)) return 6;
  if (/1050\s*TI/.test(g)) return 4;
  if (/1050/.test(g)) return 2;
  if (/\b980\b/.test(g)) return 4;
  if (/\b970\b/.test(g)) return 4;
  if (/750\s*TI/.test(g)) return 2;
  if (/\b750\b/.test(g)) return 1;
  return null; // unknown -> REVIEW
}

function readinessBand_(gpuRaw, ramRaw) {
  const v = readinessVram_(gpuRaw);
  const r = Number(ramRaw) || 0;
  if (v === null) return { band: 'REVIEW', vram: null };
  if (v >= 12 && r >= 32) return { band: 'GREEN', vram: v };
  if (v >= 8  && r >= 16) return { band: 'AMBER', vram: v };
  return { band: 'FAIL', vram: v };
}

function readinessTarget_(tool, n) {
  const rule = READINESS_RATIOS[tool];
  if (rule === 'all') return n;
  return Math.floor(n * rule[0] / rule[1]);
}

/** Short-name a license/tool string to the 4 ratio tools (+ 3ds Max). */
function readinessShortName_(raw) {
  const t = String(raw || '').toLowerCase();
  if (t.indexOf('autocad') !== -1) return 'AutoCAD LT';
  if (t.indexOf('sketchup') !== -1) return 'SketchUp Pro';
  if (t.indexOf('enscape') !== -1) return 'Enscape';
  if (t.indexOf('d5') !== -1) return 'D5 Render';
  if (t.indexOf('3ds') !== -1 || t.indexOf('3d max') !== -1) return '3ds Max';
  return null;
}

/**
 * MAIN ENDPOINT for the Readiness tab.
 * Returns per-team rows + org totals + data-health flags.
 */
function getReadinessData() {
  const master = readTable_(ORG_CONFIG.masterSheet);
  const mi = master.idx;
  const licData = getLicensesByEmail_();          // email -> [{tool,...}]
  const sysData = getSystemsData_();              // .byEmail[email] = system row
  const RATIO_TOOLS = ['AutoCAD LT', 'SketchUp Pro', 'Enscape', 'D5 Render'];

  // ---- assign each eligible member to one readiness team ----
  function teamOf(r) {
    const grp  = String(r[mi['Group / Team']] || '').trim();
    const lead = String(r[mi['Team Lead']] || '').trim();
    if (grp === 'Homes') return READINESS_HOMES_LABEL;
    if (READINESS_LEADS.indexOf(lead) !== -1) return lead;
    return null;
  }
  function isEligible(r) {
    const orgLvl = String(r[mi['Org Level']] || '').trim();
    if (orgLvl === 'Principal' || orgLvl === 'Team Lead' || orgLvl === 'Excluded') return false;
    const desig = String(r[mi['Designation Level']] || '').trim();
    if (desig === 'Group Leader' || desig === 'Intern') return false;
    if (String(r[mi['Job Title']] || '').trim() === 'Intern') return false;
    if (!normalizeBoolean_(r[mi['Include in Org']])) return false;
    return true;
  }

  const teams = {};
  // preserve a stable display order
  const order = [READINESS_HOMES_LABEL, 'Insiya Pithawala', 'Neelam Das',
    'Prajwal Yashwant Amin', 'Prashant Bharadwaj', 'Swati Seshadri',
    'Varun Srivastava', 'Yatin Tokas'];
  order.forEach(t => {
    teams[t] = {
      team: t, members: 0,
      held:    { 'AutoCAD LT': 0, 'SketchUp Pro': 0, 'Enscape': 0, 'D5 Render': 0 },
      idle:    { 'AutoCAD LT': 0, 'SketchUp Pro': 0, 'Enscape': 0, 'D5 Render': 0 },
      cap:     { green: 0, amber: 0, fail: 0, review: 0, untraceable: 0 },
      movablePCs: 0,           // capable (GREEN) machine whose user holds no heavy licence
      memberRows: [],
      mismatches: []           // reconciliation worklist: member with no email-matched machine
    };
  });

  master.rows.forEach(r => {
    if (!isEligible(r)) return;
    const t = teamOf(r);
    if (!t || !teams[t]) return;
    const T = teams[t];
    T.members++;
    const email = String(r[mi['Work Email']] || '').trim().toLowerCase();
    const name  = String(r[mi['Employee Name']] || '').trim();

    // licenses held (ratio tools only) — track which tools THIS member holds
    const myTools = {};
    (licData[email] || []).forEach(l => {
      const sn = readinessShortName_(l.tool);
      if (sn && T.held.hasOwnProperty(sn)) { T.held[sn]++; myTools[sn] = true; }
    });

    // capability of this member's machine
    const sys = sysData.byEmail[email];
    let band = 'UNTRACEABLE', vram = null, sysId = '';
    if (sys && String(sys.status).trim() === 'Active') {
      const b = readinessBand_(sys.gpu, sys.ramGB);
      band = b.band; vram = b.vram; sysId = sys.systemId;
      if (band === 'GREEN') T.cap.green++;
      else if (band === 'AMBER') T.cap.amber++;
      else if (band === 'FAIL') T.cap.fail++;
      else T.cap.review++;
      // MOVABLE: a fully-capable PC whose owner runs no heavy tool = reallocatable
      if (band === 'GREEN' && !myTools['Enscape'] && !myTools['D5 Render']) T.movablePCs++;
    } else {
      T.cap.untraceable++;
      // reconciliation worklist entry
      T.mismatches.push({ name: name, expectedEmail: email });
    }

    // TRULY-IDLE: holds a heavy licence but machine can't run it (vram<12 or no PC)
    ['Enscape', 'D5 Render'].forEach(tool => {
      if (myTools[tool] && (vram === null || vram < 12)) T.idle[tool]++;
    });

    T.memberRows.push({
      name: name, email: email, systemId: sysId,
      gpu: sys ? sys.gpu : '', ramGB: sys ? sys.ramGB : '',
      vram: vram, band: band,
      heldTools: Object.keys(myTools)
    });
  });

  // ---- build per-team tool rows + lags ----
  const rows = [];
  const totals = { members: 0,
    target: { 'AutoCAD LT': 0, 'SketchUp Pro': 0, 'Enscape': 0, 'D5 Render': 0 },
    held:   { 'AutoCAD LT': 0, 'SketchUp Pro': 0, 'Enscape': 0, 'D5 Render': 0 },
    licLag: { 'AutoCAD LT': 0, 'SketchUp Pro': 0, 'Enscape': 0, 'D5 Render': 0 },
    capLag: { 'AutoCAD LT': 0, 'SketchUp Pro': 0, 'Enscape': 0, 'D5 Render': 0 },
    surplus:{ 'AutoCAD LT': 0, 'SketchUp Pro': 0, 'Enscape': 0, 'D5 Render': 0 },
    idle:   { 'AutoCAD LT': 0, 'SketchUp Pro': 0, 'Enscape': 0, 'D5 Render': 0 },
    movablePCs: 0,
    cap: { green: 0, amber: 0, fail: 0, review: 0, untraceable: 0 } };

  order.forEach(t => {
    const T = teams[t];
    const n = T.members;
    if (n === 0) return;
    totals.members += n;
    totals.movablePCs += T.movablePCs;
    ['green', 'amber', 'fail', 'review', 'untraceable'].forEach(k => totals.cap[k] += T.cap[k]);

    const anyActive = T.cap.green + T.cap.amber + T.cap.fail + T.cap.review;
    const toolRows = RATIO_TOOLS.map(tool => {
      const target = readinessTarget_(tool, n);
      const held   = T.held[tool];
      const licLag = Math.max(0, target - held);
      const surplus = Math.max(0, held - target);          // net over target
      const idle    = T.idle[tool] || 0;                   // held but PC can't run it (heavy only)
      const capableMachines = READINESS_HEAVY[tool] ? T.cap.green : anyActive;
      const capLag = Math.max(0, target - capableMachines);
      totals.target[tool]  += target;
      totals.held[tool]    += held;
      totals.licLag[tool]  += licLag;
      totals.capLag[tool]  += capLag;
      totals.surplus[tool] += surplus;
      totals.idle[tool]    += idle;
      return { tool, target, held, licLag, surplus, idle,
               capable: capableMachines, capLag, movablePCs: T.movablePCs,
               heavy: !!READINESS_HEAVY[tool] };
    });

    rows.push({
      team: t, members: n,
      tools: toolRows,
      cap: T.cap,
      movablePCs: T.movablePCs,
      memberRows: T.memberRows,
      mismatches: T.mismatches,
      worstLicLag: Math.max.apply(null, toolRows.map(x => x.licLag)),
      worstCapLag: Math.max.apply(null, toolRows.map(x => x.capLag)),
      totalGap: toolRows.reduce((s, x) => s + x.licLag + x.capLag, 0)
    });
  });

  // SORT worst-first: biggest combined (licence + capability) gap floats to top.
  rows.sort((a, b) => b.totalGap - a.totalGap || a.team.localeCompare(b.team));

  // ---- reallocation suggestions: surplus in one team -> shortfall in another ----
  const realloc = [];
  RATIO_TOOLS.forEach(tool => {
    const donors = rows.filter(r => r.tools.find(x => x.tool === tool).surplus > 0)
      .map(r => ({ team: r.team, qty: r.tools.find(x => x.tool === tool).surplus }));
    const needers = rows.filter(r => r.tools.find(x => x.tool === tool).licLag > 0)
      .map(r => ({ team: r.team, qty: r.tools.find(x => x.tool === tool).licLag }));
    if (donors.length && needers.length) {
      realloc.push({ tool,
        surplusTotal: donors.reduce((s, d) => s + d.qty, 0),
        shortTotal:   needers.reduce((s, d) => s + d.qty, 0),
        donors, needers });
    }
  });

  return {
    generatedAt: new Date().toLocaleString(),
    rows: rows,
    totals: totals,
    realloc: realloc,
    ratioTools: RATIO_TOOLS,
    rules: {
      bands: 'GREEN >=12GB VRAM & >=32GB RAM · AMBER >=8GB & >=16GB · FAIL below',
      ratios: 'AutoCAD 1:1 · SketchUp 2:3 · Enscape 1:4 · D5 1:4 · floor() · members only · no interns/leads/GLs'
    }
  };
}

/**
 * Build the "Executive Summary" workbook and return a temporary download URL.
 * Creates a throwaway Spreadsheet, writes summary + per-team + per-tool tabs,
 * converts to .xlsx blob, drops it in Drive, returns {ok,url,name}.
 * Called by the "Download Executive Summary" button.
 */
function exportReadinessXlsx() {
  const d = getReadinessData();
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd_HHmm');
  const name = 'Studio_Lotus_Readiness_' + stamp;
  const ss = SpreadsheetApp.create(name);

  // --- Tab 1: Executive Summary (org totals) ---
  const s1 = ss.getActiveSheet().setName('Executive Summary');
  const t = d.totals;
  const head = [['Studio Lotus — Team Software & Systems Readiness'],
    ['Generated', d.generatedAt],
    ['Rules', d.rules.ratios],
    ['Capability', d.rules.bands], ['']];
  const orgTbl = [['ORG TOTALS (eligible members only)', '', '', '', '', '', ''],
    ['Tool', 'Target', 'Held', 'License lag', 'Surplus', 'Idle (wrong PC)', 'Capability lag']];
  d.ratioTools.forEach(tool => {
    orgTbl.push([tool, t.target[tool], t.held[tool], t.licLag[tool],
      t.surplus[tool], t.idle[tool], t.capLag[tool]]);
  });
  orgTbl.push(['']);
  orgTbl.push(['Eligible members', t.members]);
  orgTbl.push(['Machines — GREEN (>=12GB)', t.cap.green]);
  orgTbl.push(['Machines — AMBER (8GB)', t.cap.amber]);
  orgTbl.push(['Machines — FAIL (<8GB)', t.cap.fail]);
  orgTbl.push(['Machines — needs review', t.cap.review]);
  orgTbl.push(['Members w/o traceable machine', t.cap.untraceable]);
  orgTbl.push(['Movable capable PCs (owner runs no heavy tool)', t.movablePCs]);
  writeBlock_(s1, head.concat(orgTbl));
  s1.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  s1.setColumnWidth(1, 320);

  // --- Tab 2: Per-Team × Tool (sorted worst-first) ---
  const s2 = ss.insertSheet('By Team & Tool');
  const grid = [['Team', 'Members', 'Tool', 'Target', 'Held', 'License Lag',
    'Surplus', 'Idle', 'Capable PCs', 'Capability Lag']];
  d.rows.forEach(r => {
    r.tools.forEach(x => {
      grid.push([r.team, r.members, x.tool, x.target, x.held, x.licLag,
        x.surplus, x.idle, x.capable, x.capLag]);
    });
  });
  writeBlock_(s2, grid);
  s2.getRange(1, 1, 1, 10).setFontWeight('bold');
  s2.setFrozenRows(1);

  // --- Tab 3: Machine capability detail ---
  const s3 = ss.insertSheet('Machine Capability');
  const md = [['Team', 'Member', 'System ID', 'GPU', 'RAM (GB)', 'VRAM (GB)', 'Band', 'Heavy tools held']];
  d.rows.forEach(r => {
    r.memberRows.forEach(m => {
      const heavy = (m.heldTools || []).filter(x => x === 'Enscape' || x === 'D5 Render').join(', ');
      md.push([r.team, m.name, m.systemId || '—', m.gpu || '—',
        m.ramGB || '—', (m.vram === null ? 'review' : m.vram), m.band, heavy || '—']);
    });
  });
  writeBlock_(s3, md);
  s3.getRange(1, 1, 1, 8).setFontWeight('bold');
  s3.setFrozenRows(1);

  // --- Tab 4: Reallocation opportunities (surplus -> shortfall) ---
  const s4 = ss.insertSheet('Reallocation');
  const rg = [['Tool', 'Surplus teams (qty)', 'Short teams (qty)', 'Reallocatable', 'Still to buy']];
  (d.realloc || []).forEach(rc => {
    const move = Math.min(rc.surplusTotal, rc.shortTotal);
    rg.push([rc.tool,
      rc.donors.map(x => x.team + ' (+' + x.qty + ')').join('; '),
      rc.needers.map(x => x.team + ' (−' + x.qty + ')').join('; '),
      move, Math.max(0, rc.shortTotal - rc.surplusTotal)]);
  });
  if (rg.length === 1) rg.push(['— no surplus/shortfall overlaps —']);
  writeBlock_(s4, rg);
  s4.getRange(1, 1, 1, 5).setFontWeight('bold');
  s4.setColumnWidth(2, 260); s4.setColumnWidth(3, 260);

  // --- Tab 5: Data-health reconciliation worklist ---
  const s5 = ss.insertSheet('Data Health');
  const dh = [['Team', 'Member', 'Expected email', 'Issue — fix in Systems sheet']];
  d.rows.forEach(r => {
    (r.mismatches || []).forEach(m => {
      dh.push([r.team, m.name, m.expectedEmail,
        'No active machine matches this email. Find their PC in Systems and set Assigned Email = this address.']);
    });
  });
  if (dh.length === 1) dh.push(['— all members matched to a machine —']);
  writeBlock_(s5, dh);
  s5.getRange(1, 1, 1, 4).setFontWeight('bold');
  s5.setColumnWidth(3, 240); s5.setColumnWidth(4, 420);

  SpreadsheetApp.flush();
  const ssId = ss.getId();
  // SpreadsheetApp.getBlob() only yields PDF, and getAs() can't transcode
  // PDF->xlsx. Use the Drive export endpoint to get a genuine .xlsx blob.
  const url = 'https://www.googleapis.com/drive/v3/files/' + ssId +
    '/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    DriveApp.getFileById(ssId).setTrashed(true);
    return { ok: false, message: 'Export HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200) };
  }
  const blob = resp.getBlob().setName(name + '.xlsx');
  const file = DriveApp.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  // bin the throwaway editable Sheet; keep only the xlsx
  DriveApp.getFileById(ssId).setTrashed(true);
  return { ok: true, url: file.getDownloadUrl(), viewUrl: file.getUrl(), name: name + '.xlsx' };
}

function writeBlock_(sheet, rows) {
  const w = Math.max.apply(null, rows.map(r => r.length));
  const norm = rows.map(r => { const c = r.slice(); while (c.length < w) c.push(''); return c; });
  sheet.getRange(1, 1, norm.length, w).setValues(norm);
}

function readTable_(sheetName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) return { headers: [], rows: [], idx: {} };
  const values = sheet.getDataRange().getValues();
  if (!values.length) return { headers: [], rows: [], idx: {} };
  const headers = values[0].map(h => String(h || '').trim());
  const idx = {}; headers.forEach((h, i) => idx[h] = i);
  const rows = values.slice(1).filter(row => row.some(v => v !== '' && v !== null));
  return { headers, rows, idx };
}

function getGroupsMap_() {
  const table = readTable_(ORG_CONFIG.groupsSheet);
  const idx = table.idx;
  const map = {};
  table.rows.forEach(row => {
    const key = String(row[idx['Group Key']] || '').trim();
    if (!key) return;
    if (!normalizeBoolean_(row[idx['Active']])) return;
    map[key] = {
      key,
      name: String(row[idx['Group / Team']] || '').trim(),
      principal: String(row[idx['Principal']] || '').trim(),
      teamLead: String(row[idx['Team Lead']] || '').trim(),
      color: String(row[idx['Color Hex']] || '#E5E7EB').trim(),
      sort: Number(row[idx['Sort']] || 999),
      notes: String(row[idx['Notes']] || '').trim()
    };
  });
  return map;
}

/**
 * Returns the set of emails listed in the Shared_Accounts sheet.
 * This is the single source of truth for non-person email addresses.
 * If the sheet doesn't exist yet, returns an empty Set.
 */
function getSharedAccountEmails_() {
  const table = readTable_(ORG_CONFIG.sharedAccountsSheet);
  const out = new Set();
  if (!table.rows.length) return out;
  const emailCol = table.idx['Email'];
  if (emailCol === undefined) return out;
  table.rows.forEach(row => {
    const e = String(row[emailCol] || '').trim().toLowerCase();
    if (e) out.add(e);
  });
  return out;
}

/**
 * classifyLicenseHolder_  — 3-way classification for every Licenses row.
 *
 * Returns one of three string tags:
 *   'person'     — email is in Master_Employees.
 *                  Counts toward PEOPLE seat total.
 *   'shared'     — email is in Shared_Accounts (and is NOT an unassigned
 *                  placeholder). Covers consultants, shared Adobe accounts,
 *                  meeting-room Office licences, etc.
 *                  Counts toward ROOMS / SHARED seat total.
 *   'unassigned' — email contains the keyword "unassigned".
 *                  These are placeholder rows used to track contracted seats
 *                  that have not yet been given to any named holder.
 *                  They do NOT count toward any assigned bucket;
 *                  the spare count is derived from License_Inventory totals.
 *
 * Rule priority (first match wins):
 *   1. "unassigned" keyword in email → 'unassigned'
 *   2. Listed in Shared_Accounts     → 'shared'
 *   3. Present in Master_Employees   → 'person'
 *   4. Catch-all (unknown email)     → 'shared'  ← treated as non-person;
 *      shows in the warning banner so you can decide whether to add to
 *      Master_Employees or Shared_Accounts.
 */
function classifyLicenseHolder_(email, masterEmailSet, sharedEmailSet) {
  if (!email) return 'unassigned';
  const e = email.toLowerCase();
  // 1. Unassigned placeholder seats — must be checked BEFORE Shared_Accounts
  //    because an "unassigned-*" address is never a real account holder.
  if (e.indexOf('unassigned') !== -1) return 'unassigned';
  // 2. Explicitly listed in Shared_Accounts (consultants, rooms, shared accounts)
  if (sharedEmailSet && sharedEmailSet.has(e)) return 'shared';
  // 3. Real employee in Master_Employees
  if (masterEmailSet && masterEmailSet.has(e)) return 'person';
  // 4. Unknown — not in Master, not in Shared_Accounts, not a placeholder.
  //    Surface it in the warning banner; count it as shared (non-person)
  //    so headcount stays accurate.
  return 'shared';
}

/**
 * @deprecated  Use classifyLicenseHolder_() instead.
 * Kept for backward-compat with any direct callers in Console.html or
 * legacy endpoints that may still reference isSharedEmail_.
 * Returns true for any email that should NOT count as a person seat.
 */
function isSharedEmail_(email, masterEmailSet, sharedEmailSet) {
  if (!email) return false;
  return classifyLicenseHolder_(email, masterEmailSet, sharedEmailSet) !== 'person';
}

function getLicensesByEmail_() {
  const master = readTable_(ORG_CONFIG.masterSheet);
  const masterEmailSet = new Set(
    master.rows
      .map(r => String(r[master.idx['Work Email']] || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const sharedEmailSet = getSharedAccountEmails_();

  const table = readTable_(ORG_CONFIG.licensesSheet);
  const idx = table.idx;
  const out = {};
  table.rows.forEach(row => {
    const email  = String(row[idx['Work Email']] || '').trim().toLowerCase();
    const tool   = String(row[idx['License / Tool']] || '').trim();
    const status = String(row[idx['Status']] || '').trim();
    if (!email || !tool || status === 'Removed') return;
    // Skip unassigned placeholder rows entirely — they have no holder and
    // should not appear on any person or shared-account card.
    if (email.indexOf('unassigned') !== -1) return;
    if (!out[email]) out[email] = [];
    const kind = classifyLicenseHolder_(email, masterEmailSet, sharedEmailSet);
    out[email].push({
      tool:     tool,
      plan:     String(row[idx['Plan / Seat']] || '').trim(),
      status:   status,
      isShared: kind !== 'person'   // backward-compat flag kept for Console.html
    });
  });
  return out;
}

function colIdx_(idx, names) {
  for (let i = 0; i < names.length; i++) if (idx[names[i]] !== undefined) return idx[names[i]];
  return -1;
}

function cleanCell_(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  const errs = ['#REF!', '#N/A', '#VALUE!', '#DIV/0!', '#NAME?', 'COMPUTED_VALUE'];
  for (let i = 0; i < errs.length; i++) if (s === errs[i] || s.indexOf('__xludf') !== -1) return '';
  return s;
}

function normalizeBoolean_(v) {
  if (v === true) return true;
  const s = String(v || '').trim().toLowerCase();
  return ['true', 'yes', 'y', '1', 'active'].indexOf(s) !== -1;
}

function safeDateString_(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd');
  }
  return String(v);
}