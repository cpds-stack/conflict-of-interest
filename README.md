# Walton County FY2027 Financial Conflict of Interest Disclosure

Annual Financial Conflict of Interest disclosure for Walton County, Florida employees, required under Florida Statutes § 112.311 and Walton County HR policy.

This repo contains three parts:

- **[`spec/SPEC.md`](spec/SPEC.md)** — the complete written specification: form spec, recommended field types, conditional logic, validation rules, suggested database schema, and a workflow diagram.
- **[`prototype/`](prototype/)** — a working static HTML/CSS/JS prototype of the form.
- **[`google-sheets-backend/Code.gs`](google-sheets-backend/Code.gs)** — an optional lightweight backend (Google Apps Script + a Google Sheet) that gives the prototype durable, cross-device storage and server-enforced duplicate-submission prevention.

## Viewing the prototype

No build step or server is required:

```
open prototype/index.html
```

or serve it locally:

```
npx serve prototype
```

**Note:** Out of the box, the prototype is a static, front-end-only demo. It simulates authentication (a "demo user" you can switch between) and stores submissions in the browser's `localStorage`, which is not durable and not shared across devices. No email is actually sent to the CFO by this code — see `spec/SPEC.md` for the production workflow, database schema, and notification design.

## Enabling durable storage (Google Sheets backend)

To have responses persist for real, across employees and devices, instead of just `localStorage`:

1. Create a new Google Sheet (this will hold the `Responses` tab).
2. In the Sheet, go to **Extensions > Apps Script** and replace the default code with the contents of [`google-sheets-backend/Code.gs`](google-sheets-backend/Code.gs).
3. **Deploy > New deployment**, type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone** (or **Anyone within [your domain]** to restrict it to county accounts)
4. Copy the deployment URL and paste it into `CONFIG.APPS_SCRIPT_URL` at the top of [`prototype/app.js`](prototype/app.js).
5. Reload the form. Submissions now go to the Sheet, and the duplicate-submission check runs server-side, keyed on **Employee ID** + fiscal year (an employee cannot submit twice for the same fiscal year, regardless of browser/device). Employee ID is required on the form for this reason.

To let an employee submit again after a correction is needed, an admin runs the `adminReopen(employeeId, fiscalYear)` function from the Apps Script editor — this is intentionally not exposed as a public endpoint, since a client-callable "reopen" would defeat the duplicate-submission control.
