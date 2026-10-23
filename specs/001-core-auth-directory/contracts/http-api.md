# HTTP API: Core Auth and Directory

Base path: `/api`. JSON unless a route says otherwise. Dates are `YYYY-MM-DD`. Times are `HH:MM` on that date. Money is a string with two decimal places, such as `"1500.00"`, so the client does not use binary floating point.

## Authentication and errors

Every route except `POST /api/auth/login` and `GET /api/health` requires a session cookie for an active staff user. The role is checked on the server. Hiding a button is not sufficient.

| Status | When |
| --- | --- |
| 400 | Schema validation failed. `fields` names the inputs |
| 401 | Missing session, expired session, revoked session, or sign-in failure |
| 403 | Signed in, and the role cannot perform the action |
| 404 | The row does not exist, including a file the caller cannot address |
| 409 | Conflict that is not a schedule overlap: duplicate email, duplicate GSTIN, duplicate link, last administrator, phone warning, price and file both present |

Sign-in failure body, for an unknown email, a wrong password, or a revoked account:

```json
{ "message": "Email or password is not valid." }
```

Validation body:

```json
{ "message": "Check the highlighted fields.", "fields": { "phone": "Phone is required." } }
```

Phone already used, before confirmation:

```json
{
  "code": "PHONE_IN_USE",
  "message": "Another vendor already uses this phone number.",
  "matches": [{ "id": "uuid", "name": "Existing Vendor" }]
}
```

The client repeats the save with `confirm_duplicate_phone: true` to proceed.

Schedule overlap is not a 409. The save returns 201 or 200 and includes `conflicts`.

## Roles

| Action | Administrator | Office Team | Accountant |
| --- | --- | --- | --- |
| Sign in, sign out, change own password | Yes | Yes | Yes |
| Create, revoke, restore, set role, set another person's password | Yes | No | No |
| View and edit vendors, projects, links, schedules, and task prices | Yes | Yes | Yes |
| Open a costing sheet | Yes | Yes | Yes |

A revoked user receives 401 on the next request and cannot sign in.

## Health

`GET /api/health` → `200 { "status": "ok" }`. No staff or vendor data.

## Auth

`POST /api/auth/login` with `{ "email", "password" }`. Sets the session cookie. Returns `{ "id", "name", "email", "role" }`.

`POST /api/auth/logout`. Revokes the current session.

`GET /api/auth/me`. Returns the same identity fields.

`POST /api/auth/password` with `{ "current_password", "new_password" }`. The caller cannot send a role.

## Staff

Administrator only.

`GET /api/staff`

`POST /api/staff` with `{ "name", "email", "phone", "role", "password" }`.

`PATCH /api/staff/:id` with any of `name`, `phone`, `role`, `password`, `revoked` (`true` or `false`). Revoking also revokes open sessions. The last active administrator cannot be revoked or moved to another role. Response `409` with message `The firm must keep one active administrator.`

## Categories

`GET /api/categories`

`POST /api/categories` with `{ "name" }`. Returns the existing category when the name already exists, case-insensitively.

## Vendors

`GET /api/vendors`

Query: `q`, `category_id`, `location`, `availability`, `project_id`, `include_archived`. `q` matches name, phone, alternate phone, contact person, service labels, and material labels. Every supplied filter applies. Archived vendors are omitted unless `include_archived=true`.

`POST /api/vendors` creates the vendor and optional child rows: `category_ids`, `locations`, `services`, `materials`, `rates`, `manpower`. Required: `name`, `phone`, at least one category.

`GET /api/vendors/:id` returns the vendor, children, current rating, rating history, notes, links, and whether it is archived. It does not include task agreed prices.

`PATCH /api/vendors/:id` updates directory fields. Rates, labels, and categories are replaced by the arrays sent. Notes and ratings are not edited here.

`POST /api/vendors/:id/archive` and `POST /api/vendors/:id/restore`.

`POST /api/vendors/:id/notes` with `{ "note_type", "body" }`.

`POST /api/vendors/:id/ratings` with `{ "score", "comment" }`.

Rate amount rules match the data model. A third decimal place or a negative amount is 400.

## Projects

`GET /api/projects?include_archived=`

The default list includes Planned, Active, On hold, and Completed, and excludes archived projects.

`POST /api/projects` with `{ "name", "client_name", "site_location", "description", "status" }`. `name` is required.

`GET /api/projects/:id` includes links (role, scope, note, vendor id and name, vendor archived flag) and working schedules. Vendor contact fields, indicative rates, and manpower are not copied onto the link.

`PATCH /api/projects/:id`

`POST /api/projects/:id/archive` and `POST /api/projects/:id/restore`.

## Links

`POST /api/projects/:projectId/links` with `{ "vendor_id", "role_on_project", "scope_of_work", "note" }`.

`PATCH /api/links/:id` updates only role, scope, and note.

`DELETE /api/links/:id` deletes the link, archives working schedules for that vendor and project, and leaves vendors, price entries, and files in place.

409 when the pair exists or either side is archived.

## Schedules

`POST /api/projects/:projectId/schedules`

```json
{
  "vendor_id": "uuid",
  "task": "Floor tiling",
  "work_date": "2026-11-02",
  "start_time": "09:00",
  "end_time": "13:00",
  "required_team_size": 4
}
```

201 body includes the schedule and `conflicts`: `{ "id", "project_id", "project_name", "task", "start_time", "end_time" }`. `conflicts` is empty when there is no overlap. The vendor record is not modified.

400 when the task or date is missing, `end_time` is not later than `start_time`, or team size is missing, zero, negative, or not a whole number. 409 when the vendor is not linked to the project or either record is archived.

`GET /api/schedules/:id` returns the schedule, current price or current file metadata, price history, and file history. Allowed when the schedule is archived.

`PATCH /api/schedules/:id` updates task, date, times, and team size. Overlap is recalculated. It does not change pricing mode.

`POST /api/schedules/:id/archive` removes it from the working project view.

## Task price and costing sheet

`PUT /api/schedules/:id/price` with `{ "amount": "15000.00" }`.

Refused with 409 when `pricing_mode` is `FILE`. On success, `pricing_mode` becomes `FIXED`. A change from an existing charge writes a reversal and a new charge. History remains on `GET /api/schedules/:id`.

`POST /api/schedules/:id/costing-sheet` as `multipart/form-data` field `file`.

Refused with 409 when `pricing_mode` is `FIXED`. Refused with 400 when the file is empty, over 10 MB, or not `.xls`, `.xlsx`, `.csv`, or `.pdf`. On success, `pricing_mode` becomes `FILE`, any previous current file is archived, and the new file is current.

`GET /api/schedules/:scheduleId/costing-sheets/:fileId`

Requires a session. Returns the bytes with the stored filename. Archived files remain downloadable by id. There is no unauthenticated URL and no static file path.

The vendor `GET` payload does not include these amounts or files.

## Out of scope for this contract

No routes for quotations, purchase orders, invoices, payments, client advances, milestones, vendor import, or a general document library.
