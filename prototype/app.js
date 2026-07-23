// The "demo user" below stands in for real authentication — no email is
// ever sent to the CFO by this code; see spec/SPEC.md Section 6 for the
// production notification workflow.
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

const DEMO_USERS = [
  { name: 'Jane Doe', email: 'jane.doe@waltoncountyfl.gov', employeeId: '10234' },
  { name: 'Marcus Alvarez', email: 'marcus.alvarez@waltoncountyfl.gov', employeeId: '10567' },
  { name: 'Priya Chandran', email: 'priya.chandran@waltoncountyfl.gov', employeeId: '10891' },
];

let currentUserIndex = 0;

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

/* ---------- Mock auth ---------- */

function initMockAuth() {
  applyCurrentUser();
  $('#switch-user-btn').addEventListener('click', handleSwitchUser);
}

function applyCurrentUser() {
  const user = DEMO_USERS[currentUserIndex];
  $('#mock-user-name').textContent = user.name;
  $('#mock-user-email').textContent = user.email;
  $('#employee-name').value = user.name;
  $('#employee-email').value = user.email;
  $('#employee-id').value = user.employeeId;
}

function handleSwitchUser() {
  currentUserIndex = (currentUserIndex + 1) % DEMO_USERS.length;
  applyCurrentUser();
  checkExistingSubmission();
}

/* ---------- Duplicate-submission check ---------- */

function storageKeyFor(employeeId) {
  return `coi-submission-${FISCAL_YEAR}-${employeeId}`;
}

function usingRemoteBackend() {
  return !!CONFIG.APPS_SCRIPT_URL;
}

async function checkExistingSubmission() {
  const user = DEMO_USERS[currentUserIndex];
  const notice = $('#already-submitted-notice');
  const form = $('#coi-form');
  const confirmation = $('#confirmation');
  confirmation.hidden = true;

  let existing = null;

  if (usingRemoteBackend()) {
    try {
      const url = `${CONFIG.APPS_SCRIPT_URL}?employeeId=${encodeURIComponent(user.employeeId)}&fiscalYear=${FISCAL_YEAR}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.alreadySubmitted) {
        existing = { submittedAt: data.submittedAt };
      }
    } catch (err) {
      console.error('Could not reach the disclosure backend to check for an existing submission.', err);
    }
  } else {
    const stored = localStorage.getItem(storageKeyFor(user.employeeId));
    if (stored) existing = JSON.parse(stored);
  }

  const resetBtn = $('#reset-demo-btn');

  if (existing) {
    notice.hidden = false;
    form.hidden = true;
    $('#already-submitted-detail').textContent = existing.submittedAt
      ? `Submitted ${new Date(existing.submittedAt).toLocaleString()}.`
      : 'Already submitted.';
    // Resetting your own submission from the browser is a demo-only
    // affordance; a real backend only allows an admin to reopen it
    // (see google-sheets-backend/Code.gs adminReopen()).
    resetBtn.hidden = usingRemoteBackend();
  } else {
    notice.hidden = true;
    form.hidden = false;
  }
}

function resetDemoSubmission() {
  if (usingRemoteBackend()) return; // admin-only in production, see Code.gs adminReopen()
  const user = DEMO_USERS[currentUserIndex];
  localStorage.removeItem(storageKeyFor(user.employeeId));
  $('#coi-form').reset();
  applyCurrentUser();
  onConflictStatusChange();
  checkExistingSubmission();
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
      checkExistingSubmission();
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
  const user = DEMO_USERS[currentUserIndex];

  const record = {
    fiscalYear: FISCAL_YEAR,
    employeeName: $('#employee-name').value.trim(),
    employeeEmail: $('#employee-email').value.trim(),
    employeeId: $('#employee-id').value.trim(),
    hasConflict,
    certificationSignature: $('#signature-input').value.trim(),
    certificationDate: $('#certification-date').value,
    submittedAt: new Date().toISOString(),
    submittedBy: user.email,
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

  localStorage.setItem(storageKeyFor(record.employeeId), JSON.stringify(record));
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

/* ---------- Init ---------- */

function initApp() {
  initMockAuth();
  checkExistingSubmission();
  initConflictToggle();
  initRelationshipOtherToggle();
  initCertificationGate();
  initDescriptionCounter();
  onConflictStatusChange();

  $('#coi-form').addEventListener('submit', handleSubmit);
  $('#reset-demo-btn').addEventListener('click', resetDemoSubmission);
  $('#submit-another-btn').addEventListener('click', resetDemoSubmission);
}

document.addEventListener('DOMContentLoaded', initApp);
