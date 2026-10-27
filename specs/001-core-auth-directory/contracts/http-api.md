# HTTP API: Core Auth and Directory

Base path: `/api`. JSON unless a route says otherwise. Dates are `YYYY-MM-DD`. Times are `HH:MM` on that date. Money is a string with two decimal places, such as `"1500.00"`, so the client does not use binary floating point.

Behaviors marked *(planned: Txxx)* are specified here but not yet implemented. The named task in [tasks.md](../tasks.md) delivers them.

## Authentication and errors

Every route except `POST /api/auth/login` and `GET /api/health` requires a session cookie for an active staff user. The role is checked on the server. Hiding a button is not sufficient.

| Status | When |
| --- | --- |
| 400 | Schema validation failed. `fields` names the inputs |
| 401 | Missing session, expired session, revoked session, or sign-in failure |
| 403 | Signed in, and the role cannot perform the action, or the caller is changing their own role (`OWN_ROLE`) |
| 404 | The row does not exist, including a file the caller cannot address |
| 409 | Conflict that is not a schedule overlap: duplicate email, duplicate GSTIN, duplicate link, last administrator, already revoked, phone warning, price and file both present, clearing a pricing method the task does not use (*planned: T086, T087*) |

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

`POST /api/auth/password` with `{ "current_password", "new_password" }`. The caller cannot send a role; a body with `role` returns 400. Other open sessions of the caller stay open.

## Staff

Administrator only.

`GET /api/staff`

`POST /api/staff` with `{ "name", "email", "phone", "role", "password" }`.

`PATCH /api/staff/:id` with any of `name`, `phone`, `role`, `password`, `revoked` (`true` or `false`).

- Revoking also revokes open sessions. Revoking an account that is already revoked returns `409` `{ "code": "ALREADY_REVOKED", "message": "The account is already revoked." }`.
- Setting `password` for another person also revokes that person's open sessions. When the caller sets their own password through this route, the behavior is unchanged and sessions are not revoked, pending tasks.md T092. A `password` shorter than 8 characters, including an empty string, returns `400` with `fields.password`.
- A `role` that differs from the stored role on the caller's own account returns `403` `{ "code": "OWN_ROLE", "message": "You cannot change your own role." }`. This check runs before the last-administrator check.
- The last active administrator cannot be revoked or moved to another role. Response `409` `{ "code": "LAST_ADMINISTRATOR", "message": "The firm must keep one active administrator." }`.

## Categories

`GET /api/categories`

`POST /api/categories` with `{ "name" }`. Match `name` without regard to letter case. When a category already matches, return that row and leave its stored name unchanged.

## Vendors

`GET /api/vendors`

Query: `q`, `category_id`, `location`, `availability`, `project_id`, `include_archived`. `q` matches name, phone, alternate phone, contact person, service labels, and material labels. Every supplied filter applies. Archived vendors are omitted unless `include_archived=true`.

`POST /api/vendors` creates the vendor and its child rows in one request. The body is flat. Manpower is three top-level fields (`team_size`, `availability`, `manpower_note`), not a nested object.

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string | Required, non-empty after trimming |
| `phone` | string | Required, non-empty after trimming |
| `category_ids` | array of category UUIDs | Required, at least one. Every id must exist; otherwise 400 with `fields.category_ids` |
| `contact_person`, `alternate_phone`, `email`, `address` | string | Optional. `email` is not format-checked |
| `gst_registered` | boolean | Optional, default `false` |
| `gstin` | string or `null` | Required when `gst_registered` is `true`. Must be absent, `null`, or empty when it is `false`. Must match the 15-character GSTIN shape and is stored in upper case. A problem returns 400 with `fields.gstin`. A GSTIN already stored on another vendor returns 409 `GSTIN_IN_USE` |
| `gst_legal_name` | string | Optional |
| `team_size` | integer or `null` | Optional, zero or greater |
| `availability` | `AVAILABLE`, `LIMITED`, `UNAVAILABLE`, or `null` | Optional |
| `manpower_note` | string | Optional |
| `locations`, `services`, `materials` | array of non-empty strings | Optional |
| `rates` | array of `{ "label", "amount", "unit" }` | Optional. `label` and `unit` are non-empty strings. `amount` is a JSON string such as `"1500.00"`, zero or greater with at most two decimal places; otherwise 400 with `fields.amount` |
| `confirm_duplicate_phone` | boolean | Optional. Set to `true` to save after a `PHONE_IN_USE` warning |

`phone` and `alternate_phone` are each compared with every other vendor's phone and alternate phone, including archived vendors. A match returns 409 `PHONE_IN_USE` with `matches` unless `confirm_duplicate_phone` is `true`.

Fields the schema does not list, including a nested `manpower` object, are ignored rather than rejected. Validation failures use the validation body above, with `fields` keyed by field path (for example `rates.0.label`). Success returns 201 with the vendor in the `GET /api/vendors/:id` shape.

`GET /api/vendors/:id` returns the vendor, children, current rating, rating history, notes, links, and whether it is archived. It does not include task agreed prices.

`PATCH /api/vendors/:id` updates directory fields. Rates, labels, and categories are replaced by the arrays sent. Notes and ratings are not edited here. Whether PATCH is a full replacement or a partial update is not yet decided; see "Vendor PATCH behavior" under Unresolved items in [plan.md](../plan.md).

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

`DELETE /api/links/:id` deletes the link row and archives working schedules for that vendor and project. The response still includes those schedule ids. The call does not delete the vendor, the project, the schedules, `task_price_entries`, or `costing_sheet_files`. The database has no cascade from the link to those rows. An authorized caller can still `GET` an archived schedule and its price history and files.

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

- Each `price_history` entry has `id`, `amount`, `kind` (`CHARGE` or `REVERSAL`), `reverses_entry_id`, `created_at`, and `author` (`{ id, name }`).
- Each `file_history` entry has `id`, `original_filename`, `media_type`, `byte_size`, `archived`, `created_at`, `author` (`{ id, name }`), `archived_at`, and `archived_by` (`{ id, name }`).
- `archived_at` and `archived_by` are **planned and not yet returned by the API**. FR-033 requires them to record who replaced or cleared the file and when, and tasks.md T086 adds them. Once added, both are `null` while the file is current. Until then, `file_history` entries carry only the other fields listed above.

`PATCH /api/schedules/:id` updates task, date, times, and team size. Overlap is recalculated. It does not change pricing mode.

`POST /api/schedules/:id/archive` removes it from the working project view.

## Task price and costing sheet

`PUT /api/schedules/:id/price` with `{ "amount": "15000.00" }`.

Refused with 409 when `pricing_mode` is `FILE`. On success, `pricing_mode` becomes `FIXED`. A change from an existing charge writes a reversal and a new charge. History remains on `GET /api/schedules/:id`.

`POST /api/schedules/:id/costing-sheet` as `multipart/form-data` field `file`.

Refused with 409 when `pricing_mode` is `FIXED`. Refused with 400 when the file is empty, over 10 MB, or not `.xls`, `.xlsx`, `.csv`, or `.pdf`. On success, `pricing_mode` becomes `FILE`, any previous current file is archived, and the new file is current.

`POST /api/schedules/:id/price/clear` *(planned: T086)*

Refused with 409 `{ "code": "NOT_FIXED" }` when `pricing_mode` is not `FIXED`. On success, inserts a reversal of the current charge, sets `pricing_mode` to `NONE`, and returns the schedule with `current_price: null` and the full price history. The task can then receive a costing sheet.

`POST /api/schedules/:id/costing-sheet/clear` *(planned: T087)*

Refused with 409 `{ "code": "NOT_FILE" }` when `pricing_mode` is not `FILE`. On success, archives the current file, keeps its bytes, sets `pricing_mode` to `NONE`, and returns the schedule with `current_file: null` and the full file history. The task can then receive a fixed price.

`GET /api/schedules/:scheduleId/costing-sheets/:fileId`

Requires a session. Returns the bytes with the stored filename. Archived files remain downloadable by id. There is no unauthenticated URL and no static file path.

The vendor `GET` payload does not include these amounts or files.

## Out of scope for this contract

No routes for quotations, purchase orders, invoices, payments, client advances, milestones, vendor import, or a general document library.
