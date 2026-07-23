// There is no real authentication here — employees type in their own Name,
// Email, and Employee ID. No email is ever sent to the CFO by this code;
// see spec/SPEC.md Section 6 for the production notification workflow.
//
// Persistence: if CONFIG.APPS_SCRIPT_URL is set, submissions are sent to a
// Google Sheets-backed Apps Script Web App (see /google-sheets-backend),
// which is also where the duplicate-submission check is enforced — an
// employee cannot submit twice for the same fiscal year. Leave it blank to
// fall back to a browser-only localStorage demo (not durable, not shared
// across devices — for trying out the form only).

const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzHuNoovJzosH6X1IjlNaVhESa1ud1evxV45KkCiAecwKoZrsAuw1ejoXmN3DlMbihJ/exec',
};

const FISCAL_YEAR = 2027;

// Bump this whenever print-form.html changes — GitHub Pages caches it for
// 10 minutes, so an un-versioned URL can serve a stale copy after a deploy.
const PRINT_FORM_VERSION = '20260723-margin-fix';

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

/* ---------- Duplicate-submission check ---------- */
// Duplicate submissions are rejected at submit time (server-side by the
// Google Sheets backend, or client-side against localStorage in the
// no-backend fallback) — see handleSubmit()/persistSubmission() below.

function storageKeyFor(employeeId) {
  return `coi-submission-${FISCAL_YEAR}-${employeeId}`;
}

function usingRemoteBackend() {
  return !!CONFIG.APPS_SCRIPT_URL;
}

function resetDemoSubmission() {
  if (usingRemoteBackend()) return; // admin-only in production, see Code.gs adminReopen()
  const employeeId = $('#employee-id').value.trim();
  localStorage.removeItem(storageKeyFor(employeeId));
  $('#coi-form').reset();
  onConflictStatusChange();
  $('#coi-form').hidden = false;
  $('#confirmation').hidden = true;
}

/* ---------- Conditional logic ---------- */

function initConflictToggle() {
  $all('input[name="conflictStatus"]').forEach((radio) => {
    radio.addEventListener('change', onConflictStatusChange);
  });
}

function onConflictStatusChange() {
  const selected = $('input[name="conflictStatus"]:checked');
  const show = !!selected && selected.value === 'yes';
  setConditionalRequired(show);
}

function setConditionalRequired(show) {
  const section = $('#conflict-details');
  section.hidden = !show;
  $all('[data-conditional="true"]').forEach((field) => {
    if (field.type === 'radio') {
      // Radio groups: required is set on each option; browser only
      // enforces "at least one checked" when required is present.
      field.required = show;
    } else {
      field.required = show;
    }
  });
  if (!show) {
    $('#relationship-other-wrap').hidden = true;
    $('#relationship-other-text').required = false;
  }
}

function initRelationshipOtherToggle() {
  $('#relationship-nature').addEventListener('change', (e) => {
    const isOther = e.target.value === 'other';
    const wrap = $('#relationship-other-wrap');
    wrap.hidden = !isOther;
    $('#relationship-other-text').required = isOther;
  });
}

function initCertificationGate() {
  const checkbox = $('#certify-checkbox');
  const signature = $('#signature-input');
  const dateField = $('#certification-date');

  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      signature.disabled = false;
      dateField.value = new Date().toLocaleString();
    } else {
      signature.disabled = true;
      signature.value = '';
      dateField.value = '';
    }
  });
}

function initDescriptionCounter() {
  const textarea = $('#conflict-description');
  const counter = $('#description-count');
  textarea.addEventListener('input', () => {
    counter.textContent = textarea.value.length;
  });
}

/* ---------- Validation ---------- */

function validateForm() {
  clearErrors();
  const errors = [];

  requireField('employee-name', 'Employee Name is required.', errors);
  requireField('employee-email', 'Employee Email is required.', errors);
  if ($('#employee-email').value && !validateEmail($('#employee-email').value)) {
    errors.push({ id: 'employee-email', message: 'Enter a valid email address.' });
  }
  requireField('employee-id', 'Employee ID is required.', errors);

  const conflictSelected = $('input[name="conflictStatus"]:checked');
  if (!conflictSelected) {
    errors.push({ id: 'conflict-question', message: 'Select whether you have a potential conflict of interest.' });
  }

  if (conflictSelected && conflictSelected.value === 'yes') {
    requireField('vendor-org', 'Vendor or Organization Involved is required.', errors);
    requireField('relationship-nature', 'Nature of Relationship is required.', errors);
    if ($('#relationship-nature').value === 'other') {
      requireField('relationship-other-text', 'Please describe the relationship.', errors);
    }
    requireField('conflict-description', 'Description of the Conflict is required.', errors);
    requireRadioGroup('financialInterest', 'conflict-question-financial', 'Select an answer for Financial Interest.', errors);
    requireRadioGroup('personalRelationship', 'conflict-question-personal', 'Select an answer for Personal Relationship.', errors);
    requireRadioGroup('businessRelationship', 'conflict-question-business', 'Select an answer for Business Relationship.', errors);
    requireField('conflict-began-date', 'Date Conflict Began is required.', errors);
    if ($('#conflict-began-date').value && !validateDateNotFuture($('#conflict-began-date').value)) {
      errors.push({ id: 'conflict-began-date', message: 'Date conflict began cannot be in the future.' });
    }
  }

  if (!$('#certify-checkbox').checked) {
    errors.push({ id: 'certify-checkbox', message: 'You must check the certification box.' });
  }
  requireField('signature-input', 'Electronic signature is required.', errors);

  return { valid: errors.length === 0, errors };
}

function requireField(id, message, errors) {
  const field = $('#' + id);
  if (!field.value || !field.value.trim()) {
    errors.push({ id, message });
  }
}

function requireRadioGroup(name, anchorId, message, errors) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  if (!checked) {
    errors.push({ id: anchorId, message, groupName: name });
  }
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateDateNotFuture(value) {
  const entered = new Date(value + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return entered <= today;
}

function renderErrors(errors) {
  const summary = $('#error-summary');
  const list = $('#error-summary-list');
  list.innerHTML = '';

  errors.forEach((err) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = '#' + err.id;
    link.textContent = err.message;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      focusErrorTarget(err);
    });
    li.appendChild(link);
    list.appendChild(li);

    if (err.groupName) {
      markGroupError(err.groupName, err.message);
    } else {
      markFieldError(err.id, err.message);
    }
  });

  summary.hidden = errors.length === 0;
  if (errors.length > 0) {
    summary.focus ? summary.setAttribute('tabindex', '-1') : null;
    summary.scrollIntoView({ behavior: 'smooth', block: 'start' });
    summary.focus();
  }
}

function focusErrorTarget(err) {
  const el = err.groupName
    ? document.querySelector(`input[name="${err.groupName}"]`)
    : document.getElementById(err.id);
  if (el) {
    el.focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function markFieldError(id, message) {
  const field = document.getElementById(id);
  if (!field) return;
  field.setAttribute('aria-invalid', 'true');
  const wrap = field.closest('.field');
  if (wrap) {
    wrap.classList.add('has-error');
    appendFieldErrorText(wrap, message);
  }
}

function markGroupError(groupName, message) {
  const firstInput = document.querySelector(`input[name="${groupName}"]`);
  if (!firstInput) return;
  const wrap = firstInput.closest('.field') || firstInput.closest('fieldset');
  if (wrap) {
    wrap.classList.add('has-error');
    appendFieldErrorText(wrap, message);
  }
}

function appendFieldErrorText(wrap, message) {
  const p = document.createElement('p');
  p.className = 'field-error';
  p.textContent = message;
  wrap.appendChild(p);
}

function clearErrors() {
  $('#error-summary').hidden = true;
  $('#error-summary-list').innerHTML = '';
  $all('.has-error').forEach((el) => el.classList.remove('has-error'));
  $all('.field-error').forEach((el) => el.remove());
  $all('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
}

/* ---------- Submission ---------- */

async function handleSubmit(event) {
  event.preventDefault();
  const { valid, errors } = validateForm();

  if (!valid) {
    renderErrors(errors);
    return;
  }

  const record = buildSubmissionRecord();
  const submitBtn = $('#submit-btn');
  submitBtn.disabled = true;

  try {
    const result = await persistSubmission(record);
    if (result.status === 'duplicate') {
      renderErrors([{ id: 'employee-id', message: 'A disclosure has already been submitted for this Employee ID and fiscal year.' }]);
    } else {
      showConfirmation(record);
    }
  } catch (err) {
    renderErrors([{ id: 'employee-email', message: 'Could not reach the disclosure backend. Please try again.' }]);
  } finally {
    submitBtn.disabled = false;
  }
}

function buildSubmissionRecord() {
  const conflictSelected = document.querySelector('input[name="conflictStatus"]:checked');
  const hasConflict = conflictSelected.value === 'yes';

  const record = {
    fiscalYear: FISCAL_YEAR,
    employeeName: $('#employee-name').value.trim(),
    employeeEmail: $('#employee-email').value.trim(),
    employeeId: $('#employee-id').value.trim(),
    hasConflict,
    certificationSignature: $('#signature-input').value.trim(),
    certificationDate: $('#certification-date').value,
    submittedAt: new Date().toISOString(),
    status: 'submitted',
  };

  if (hasConflict) {
    record.conflictDetails = {
      vendorOrganization: $('#vendor-org').value.trim(),
      relationshipNature: $('#relationship-nature').value,
      relationshipNatureOther: $('#relationship-other-text').value.trim(),
      description: $('#conflict-description').value.trim(),
      financialInterest: document.querySelector('input[name="financialInterest"]:checked').value === 'yes',
      personalRelationship: document.querySelector('input[name="personalRelationship"]:checked').value === 'yes',
      businessRelationship: document.querySelector('input[name="businessRelationship"]:checked').value === 'yes',
      conflictBeganDate: $('#conflict-began-date').value,
      additionalComments: $('#additional-comments').value.trim(),
    };
  }

  return record;
}

async function persistSubmission(record) {
  if (usingRemoteBackend()) {
    // text/plain avoids a CORS preflight, which Apps Script Web Apps don't handle;
    // the Apps Script side still parses the body as JSON regardless of this header.
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(record),
    });
    return res.json();
  }

  const key = storageKeyFor(record.employeeId);
  if (localStorage.getItem(key)) {
    return { status: 'duplicate' };
  }
  localStorage.setItem(key, JSON.stringify(record));
  return { status: 'ok' };
}

function showConfirmation(record) {
  $('#coi-form').hidden = true;
  const confirmation = $('#confirmation');
  confirmation.hidden = false;
  $('#confirmation-detail').textContent =
    `Recorded for ${record.employeeName} at ${new Date(record.submittedAt).toLocaleString()}.` +
    (record.hasConflict ? ' The CFO would be notified automatically in production.' : '');
  // Resubmitting is a demo-only affordance; with a real backend, only an
  // admin can reopen a disclosure (see google-sheets-backend/Code.gs adminReopen()).
  $('#submit-another-btn').hidden = usingRemoteBackend();
  confirmation.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- Print a copy ---------- */
// Printing doesn't require completing/submitting the form — it's for
// employees who want a paper copy. We still record who printed (name +
// employee ID + timestamp) so there's an audit trail of paper vs. online
// submissions, separate from the disclosures themselves.

function initPrintFlow() {
  $('#print-form-btn').addEventListener('click', openPrintModal);
  $('#print-modal-cancel').addEventListener('click', closePrintModal);
  $('#print-modal-confirm').addEventListener('click', handlePrintConfirm);

  // Guard against the browser's back/forward cache restoring a page that
  // had the modal open — it should never appear except from an actual click.
  window.addEventListener('pageshow', closePrintModal);
}

function openPrintModal() {
  $('#print-first-name').value = '';
  $('#print-last-name').value = '';
  $('#print-employee-id').value = '';
  $('#print-modal-error').hidden = true;
  $('#print-modal-overlay').hidden = false;
  $('#print-first-name').focus();
}

function closePrintModal() {
  $('#print-modal-overlay').hidden = true;
}

async function handlePrintConfirm() {
  const firstName = $('#print-first-name').value.trim();
  const lastName = $('#print-last-name').value.trim();
  const employeeId = $('#print-employee-id').value.trim();

  if (!firstName || !lastName || !employeeId) {
    $('#print-modal-error').hidden = false;
    return;
  }

  const printRecord = {
    eventType: 'print',
    firstName,
    lastName,
    employeeId,
    fiscalYear: FISCAL_YEAR,
    printedAt: new Date().toISOString(),
  };

  try {
    await logPrintEvent(printRecord);
  } catch (err) {
    console.error('Could not reach the disclosure backend to log the print event.', err);
  }

  closePrintModal();

  // Hand the name/ID off to the print tab via localStorage (shared across
  // same-origin tabs, unlike sessionStorage). print-form.html reads this
  // once on load and clears it immediately after.
  localStorage.setItem('coi-print-fill', JSON.stringify({
    employeeName: `${firstName} ${lastName}`.trim(),
    employeeId,
  }));

  // Print a dedicated, forms-designer-built paper layout (print-form.html)
  // instead of the interactive page — the on-screen form and the paper
  // form intentionally look nothing alike.
  const printWindow = window.open(`print-form.html?v=${PRINT_FORM_VERSION}`, '_blank');
  if (printWindow) {
    printWindow.addEventListener('load', () => printWindow.print());
  }
}

async function logPrintEvent(printRecord) {
  if (usingRemoteBackend()) {
    await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(printRecord),
    });
    return;
  }

  const key = `coi-print-log-${FISCAL_YEAR}`;
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  existing.push(printRecord);
  localStorage.setItem(key, JSON.stringify(existing));
}

/* ---------- Init ---------- */

function initApp() {
  initConflictToggle();
  initRelationshipOtherToggle();
  initCertificationGate();
  initDescriptionCounter();
  initPrintFlow();
  onConflictStatusChange();

  $('#coi-form').addEventListener('submit', handleSubmit);
  $('#submit-another-btn').addEventListener('click', resetDemoSubmission);
}

document.addEventListener('DOMContentLoaded', initApp);
