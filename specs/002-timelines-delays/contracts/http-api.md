# HTTP API: Timelines and Delays

Additions to the [Feature 001 HTTP API](../../001-core-auth-directory/contracts/http-api.md). Base path `/api`, JSON. Dates are `YYYY-MM-DD`, and "today" is the India Standard Time date. Timestamps are ISO 8601.

## Authentication, roles, and errors

Every route below requires a session cookie for an active staff user, checked on the server for every request (FR-024). A missing, expired, or revoked session is 401 (SC-007). Administrators, Office Team members, and Accountants have the same access to every route here. No route returns 403.

| Status | When |
| --- | --- |
| 400 | Validation failed. `fields` names each problem (US1-5, US2-5, US4-3) |
| 401 | No active session |
| 404 | The project, item, or vendor does not exist |
| 409 | A rule refused the change. `code` is one of the codes below |

| `code` | Meaning |
| --- | --- |
| `PROJECT_ARCHIVED` | The project is archived, so its timeline is read-only (FR-025) |
| `VENDOR_NOT_LINKED` | The named vendor is not linked to the project (US1-4, US4-4) |
| `VENDOR_ARCHIVED` | The named vendor is archived (US1-4) |
| `ITEM_NOT_ON_PROJECT` | The item belongs to another project (US4-7) |
| `ITEM_ARCHIVED` | The item is archived. Restore it first. Applies to edit, progress update, and attaching a delay or issue (plan.md, Product decision 3) |

Validation body, as in Feature 001:

```json
{
  "message": "Check the highlighted fields.",
  "fields": {
    "name": "Name is required.",
    "planned_date": "Planned date cannot be later than the deadline."
  }
}
```

## Shared shapes

**Responsible party** in requests:

```json
{ "kind": "VENDOR", "vendor_id": "uuid" }
```

`kind` is `NONE`, `VENDOR`, or `FIRM_TEAM`. `vendor_id` is required for `VENDOR` and must be absent or null otherwise.

**Responsible party** in responses:

```json
{ "kind": "VENDOR", "vendor": { "id": "uuid", "name": "Sharma Interiors", "archived": false }, "label": "Sharma Interiors" }
```

`label` is the vendor's name, `"Firm team"`, or `"No responsible party"`. On the dashboard the label for `NONE` is `"None"` (FR-021).

**Flags**:

```json
[
  { "type": "OVERDUE", "days_overdue": 3 },
  { "type": "MISSING_UPDATE", "last_update_on": "2026-10-19" }
]
```

`type` is `OVERDUE`, `DUE_SOON`, or `MISSING_UPDATE`. `DUE_SOON` has no extra field. Each rule is calculated independently, and the list holds every flag that applies (plan.md, Product decision 2). `OVERDUE` and `DUE_SOON` never appear together, because their deadline ranges do not overlap. Either can appear with `MISSING_UPDATE`. The list is empty for Done and archived items. Flags are computed per request, and no route accepts a flag (FR-015).

**Item summary**:

```json
{
  "id": "uuid",
  "project_id": "uuid",
  "item_type": "ACTIVITY",
  "name": "False ceiling, ground floor",
  "description": null,
  "planned_date": "2026-10-20",
  "deadline": "2026-10-25",
  "responsible": { "kind": "VENDOR", "vendor": { "id": "uuid", "name": "Sharma Interiors", "archived": false }, "label": "Sharma Interiors" },
  "status": "IN_PROGRESS",
  "last_update_on": "2026-10-19",
  "done_on": null,
  "archived": false,
  "flags": [{ "type": "OVERDUE", "days_overdue": 3 }]
}
```

`status` is `NOT_STARTED` when the item has no progress update (FR-008). `done_on` is set only when `status` is `DONE` (FR-011).

## Project timeline

`GET /api/projects/:projectId/timeline`

Allowed on an archived project (FR-025). Flags are calculated for today there too (plan.md, Product decision 5). Response:

```json
{
  "project": { "id": "uuid", "name": "Mehta Residence", "archived": false },
  "items": ["item summary"],
  "archived_items": ["item summary"],
  "delays": ["delay"],
  "coordination_issues": ["coordination issue"]
}
```

`items` holds non-archived items, sorted by `deadline` ascending, then `name` (FR-007). `archived_items` uses the same order. `delays` and `coordination_issues` cover the whole project, newest first, including rows on archived items.

## Timeline items

`POST /api/projects/:projectId/timeline-items`

```json
{
  "item_type": "ACTIVITY",
  "name": "False ceiling, ground floor",
  "description": "Gypsum board",
  "planned_date": "2026-10-20",
  "deadline": "2026-10-25",
  "responsible": { "kind": "VENDOR", "vendor_id": "uuid" }
}
```

Required: `item_type`, `name`, `deadline`. `responsible` defaults to `{ "kind": "NONE" }`. 201 returns the item summary with status `NOT_STARTED`.

- 400 when `item_type`, `name`, or `deadline` is missing, or `planned_date` is later than `deadline`. Every problem is named in one response (US1-5).
- 409 `PROJECT_ARCHIVED`, `VENDOR_NOT_LINKED`, or `VENDOR_ARCHIVED`.

Saving never changes the vendor, the link, or any work schedule (FR-004, FR-028).

`GET /api/timeline-items/:id`

Allowed when the item or the project is archived. Returns the item summary plus:

```json
{
  "progress_updates": [
    { "id": "uuid", "status": "DONE", "note": "Handed over", "created_at": "2026-10-27T10:15:00+05:30", "created_by": { "id": "uuid", "name": "Office User" } }
  ],
  "date_changes": [
    { "id": "uuid", "field": "DEADLINE", "old_value": "2026-10-20", "new_value": "2026-10-25", "created_at": "...", "created_by": { "id": "uuid", "name": "..." } }
  ],
  "responsible_changes": [
    { "id": "uuid", "old": "responsible party", "new": "responsible party", "cause": "LINK_REMOVED", "created_at": "...", "created_by": { "id": "uuid", "name": "..." } }
  ],
  "delays": ["delay"],
  "coordination_issues": ["coordination issue"]
}
```

Every list is newest first. Progress updates are ordered by save order (`seq`).

`PATCH /api/timeline-items/:id`

Any of `item_type`, `name`, `description`, `planned_date` (a date or `null`), `deadline`, `responsible`. Unknown fields are a 400. The same 400 and 409 rules as create apply to the resulting item, plus 409 `ITEM_ARCHIVED`. A changed date writes a date change, and a changed responsible party writes a responsible change, in the same transaction. 200 returns the item summary.

`POST /api/timeline-items/:id/archive` and `POST /api/timeline-items/:id/restore`

200 returns the item summary. 409 `PROJECT_ARCHIVED` when the project is archived. There is no delete route (FR-027).

## Progress updates

`POST /api/timeline-items/:id/progress-updates`

```json
{ "status": "IN_PROGRESS", "note": "Framing done on the east side" }
```

`status` is required and must be `NOT_STARTED`, `IN_PROGRESS`, or `DONE`. `note` is optional. 201 returns the item summary with the new status, `last_update_on`, and recomputed flags.

- 400 when `status` is missing or is another value (US2-5).
- 409 `PROJECT_ARCHIVED` or `ITEM_ARCHIVED`.

There is no route to edit or delete an update (FR-010).

## Delays

`POST /api/projects/:projectId/delays`

```json
{ "reason": "Gypsum board delivery late", "timeline_item_id": "uuid" }
```

`reason` is required. `timeline_item_id` is optional. Without it, the delay concerns the project generally (US4-6). 201 returns:

```json
{
  "id": "uuid",
  "project_id": "uuid",
  "timeline_item": { "id": "uuid", "name": "False ceiling, ground floor" },
  "reason": "Gypsum board delivery late",
  "created_at": "...",
  "created_by": { "id": "uuid", "name": "..." }
}
```

`timeline_item` is `null` for a general delay.

- 400 when `reason` is missing or blank.
- 409 `PROJECT_ARCHIVED`, `ITEM_NOT_ON_PROJECT`, or `ITEM_ARCHIVED`.

## Coordination issues

`POST /api/projects/:projectId/coordination-issues`

```json
{ "description": "Electrician and carpenter both need the ceiling on Monday", "timeline_item_id": "uuid", "vendor_ids": ["uuid", "uuid"] }
```

`description` is required. `timeline_item_id` is optional. `vendor_ids` is optional and defaults to an empty list. Duplicates are ignored. 201 returns the same shape as a delay, with `description` in place of `reason` and `vendors: [{ "id", "name", "archived" }]`.

- 400 when `description` is missing or blank.
- 409 `PROJECT_ARCHIVED`, `ITEM_NOT_ON_PROJECT`, `ITEM_ARCHIVED`, or `VENDOR_NOT_LINKED`. `VENDOR_NOT_LINKED` includes `vendor_ids` with the offending ids. A linked vendor that is archived is accepted (plan.md, Product decision 4).

Saving never writes a vendor note, rating, or vendor field (FR-019, US4-2).

There are no routes to edit, delete, close, or resolve a delay or an issue (FR-018, FR-029).

## Dashboard

`GET /api/dashboard`

Covers only non-archived projects and non-archived items (FR-021). The same for every staff member, with no query parameters (FR-020).

```json
{
  "today": "2026-10-28",
  "overdue": [
    { "project": { "id": "uuid", "name": "..." }, "item": { "id": "uuid", "name": "..." }, "responsible_label": "Sharma Interiors", "deadline": "2026-10-25", "days_overdue": 3 }
  ],
  "due_soon": [
    { "project": {}, "item": {}, "responsible_label": "Firm team", "deadline": "2026-10-30" }
  ],
  "missing_update": [
    { "project": {}, "item": {}, "responsible_label": "None", "last_update_on": "2026-10-19" }
  ],
  "recent_delays_and_issues": [
    { "kind": "DELAY", "id": "uuid", "project": {}, "item": null, "responsible_label": "None", "text": "...", "created_at": "...", "created_by": { "id": "uuid", "name": "..." } }
  ]
}
```

An item appears once in each list that matches one of its flags. An item flagged Overdue and Missing update is in both `overdue` and `missing_update`.

Sort order (FR-022):

- `overdue`: `days_overdue` descending, then project name, then item name.
- `due_soon`: `deadline` ascending, then project name, then item name.
- `missing_update`: `last_update_on` ascending, then project name, then item name.
- `recent_delays_and_issues`: the 10 newest delays and coordination issues together, by `created_at` descending. A row attached to an archived item is left out. `kind` is `DELAY` or `COORDINATION_ISSUE`. `responsible_label` comes from the attached item, or `"None"` when there is none.

An empty list is `[]`. The web page shows the empty message (FR-023). Vendor counts and client advances are not in this response.

## Changed Feature 001 route

`DELETE /api/links/:id`

Behaves as Feature 001 defines, and in the same transaction also clears the responsible vendor on every timeline item on that project, archived or not, whose responsible vendor is the link's vendor (FR-005). Each cleared item gets `responsible_kind = NONE`, `responsible_vendor_id = null`, `updated_by` = the caller, and one responsible change with cause `LINK_REMOVED`. The response gains:

```json
{ "cleared_timeline_item_ids": ["uuid"] }
```

This also happens when the project is archived, whenever Feature 001 permits the link removal (plan.md, Product decision 1). It does not return `PROJECT_ARCHIVED`. Only the responsible vendor and the item's `updated_*` audit columns change. Deadlines, planned dates, progress updates, date changes, earlier responsible changes, delays, coordination issues and their named vendors, and items with Firm team responsible are not changed. This is not a general permission: every timeline route above still refuses writes on an archived project with 409 `PROJECT_ARCHIVED`.

## Out of scope for this contract

No routes for item dependencies, closing or resolving delays and issues, reminders, notifications, vendor self-service, charts, procurement, invoices, payments, or client advances (FR-029).
