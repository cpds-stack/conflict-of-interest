/**
 * Walton County FY2027 Conflict of Interest Disclosure — Google Sheets backend.
 *
 * Deploy this as a Google Apps Script Web App bound to a Google Sheet. The
 * sheet is the durable store; duplicate-submission prevention is enforced
 * here (server-side) by checking for an existing 'submitted' row for the
 * same employee ID + fiscal year before appending a new one.
 *
 * Setup:
 *   1. Create a new Google Sheet.
 *   2. Extensions > Apps Script, paste this file in as Code.gs.
 *   3. Deploy > New deployment > type "Web app".
 *        Execute as: Me
 *        Who has access: Anyone (or "Anyone within [your domain]")
 *   4. Copy the deployment URL into prototype/app.js CONFIG.APPS_SCRIPT_URL.
 */

const SHEET_NAME = 'Responses';
const PRINT_LOG_SHEET_NAME = 'PrintLog';

const HEADERS = [
  'submittedAt', 'fiscalYear', 'employeeName', 'employeeEmail', 'employeeId',
  'hasConflict', 'vendorOrganization', 'relationshipNature', 'relationshipNatureOther',
  'description', 'financialInterest', 'personalRelationship', 'businessRelationship',
  'conflictBeganDate', 'additionalComments', 'certificationSignature', 'certificationDate',
  'status',
];

const PRINT_LOG_HEADERS = ['printedAt', 'fiscalYear', 'firstName', 'lastName', 'employeeId'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.eventType === 'print') {
      return handlePrintLog(data);
    }

    if (!data.employeeId || !data.fiscalYear) {
      return jsonResponse({ status: 'error', message: 'employeeId and fiscalYear are required.' });
    }

    const sheet = getResponseSheet();
    const existing = findExistingSubmission(sheet, data.employeeId, data.fiscalYear);

    if (existing) {
      return jsonResponse({
        status: 'duplicate',
        message: 'A disclosure has already been submitted for this fiscal year.',
        submittedAt: existing.submittedAt,
      });
    }

    appendSubmission(sheet, data);
    return jsonResponse({ status: 'ok' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  } finally {
    lock.releaseLock();
  }
}

// Logs that an employee printed a copy of the form (name + employee ID +
// timestamp), so there's a record of paper vs. online submissions. This does
// not affect duplicate-submission prevention — printing can happen any
// number of times.
function handlePrintLog(data) {
  if (!data.firstName || !data.lastName || !data.employeeId) {
    return jsonResponse({ status: 'error', message: 'firstName, lastName, and employeeId are required.' });
  }

  const sheet = getPrintLogSheet();
  sheet.appendRow([
    data.printedAt || new Date().toISOString(),
    data.fiscalYear || '',
    data.firstName,
    data.lastName,
    data.employeeId,
  ]);

  return jsonResponse({ status: 'ok' });
}

function doGet(e) {
  const employeeId = e.parameter.employeeId;
  const fiscalYear = Number(e.parameter.fiscalYear);

  if (!employeeId || !fiscalYear) {
    return jsonResponse({ status: 'error', message: 'employeeId and fiscalYear query params are required.' });
  }

  const sheet = getResponseSheet();
  const existing = findExistingSubmission(sheet, employeeId, fiscalYear);

  return jsonResponse({
    status: 'ok',
    alreadySubmitted: !!existing,
    submittedAt: existing ? existing.submittedAt : null,
  });
}

function getResponseSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function getPrintLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PRINT_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PRINT_LOG_SHEET_NAME);
    sheet.appendRow(PRINT_LOG_HEADERS);
  }
  return sheet;
}

// Finds a row with a matching employee ID + fiscal year whose status is
// still 'submitted' (i.e. not superseded by an admin reopen). This is the
// duplicate-prevention check.
function findExistingSubmission(sheet, employeeId, fiscalYear) {
  const values = sheet.getDataRange().getValues();
  const header = values[0];
  const employeeIdCol = header.indexOf('employeeId');
  const yearCol = header.indexOf('fiscalYear');
  const statusCol = header.indexOf('status');
  const submittedAtCol = header.indexOf('submittedAt');

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (
      String(row[employeeIdCol]) === String(employeeId) &&
      Number(row[yearCol]) === Number(fiscalYear) &&
      row[statusCol] === 'submitted'
    ) {
      return { rowIndex: i + 1, submittedAt: row[submittedAtCol] };
    }
  }
  return null;
}

function appendSubmission(sheet, data) {
  const cd = data.conflictDetails || {};
  sheet.appendRow([
    new Date().toISOString(),
    data.fiscalYear,
    data.employeeName || '',
    data.employeeEmail,
    data.employeeId || '',
    !!data.hasConflict,
    cd.vendorOrganization || '',
    cd.relationshipNature || '',
    cd.relationshipNatureOther || '',
    cd.description || '',
    cd.financialInterest === undefined ? '' : cd.financialInterest,
    cd.personalRelationship === undefined ? '' : cd.personalRelationship,
    cd.businessRelationship === undefined ? '' : cd.businessRelationship,
    cd.conflictBeganDate || '',
    cd.additionalComments || '',
    data.certificationSignature || '',
    data.certificationDate || '',
    'submitted',
  ]);
}

// Marks an employee's prior submission as 'superseded' so they can submit
// again. Run this manually from the Apps Script editor (select the function,
// click Run) — it is intentionally NOT exposed via doGet/doPost, since a
// public "reopen" endpoint would defeat the duplicate-submission control.
function adminReopen(employeeId, fiscalYear) {
  const sheet = getResponseSheet();
  const existing = findExistingSubmission(sheet, employeeId, fiscalYear);
  if (!existing) {
    throw new Error('No submitted disclosure found for that employee/fiscal year.');
  }
  const header = sheet.getDataRange().getValues()[0];
  const statusCol = header.indexOf('status') + 1;
  sheet.getRange(existing.rowIndex, statusCol).setValue('reopened');
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
