# HTTP API: Vendor–Project Visibility, Project Tracking and Dashboard Views

Only endpoints this feature adds to or changes are listed. Every endpoint keeps the Feature 001 rules:

- It requires an active session (401 otherwise) and is open to all three roles.
- Bodies and queries are validated with Zod (400 with `fields`).
- Rule refusals are 409 with a `code`.

Every change is **additive**. Existing keys keep their meaning, so Feature 001 to 003 clients and tests keep working. Dates are `YYYY-MM-DD` in India Standard Time, and timestamps are ISO 8601.

Shared shapes:

```text
AssignmentStatus = "NO_ACTIVITIES" | "NOT_STARTED" | "IN_PROGRESS" | "DELAYED" | "COMPLETED"
Health           = "COMPLETED" | "DELAYED" | "ONGOING"
Group            = "OVERDUE" | "DUE_TODAY" | "COMING_SOON" | "UPCOMING" | null
Person           = { id, name }
Progress         = { done: number, total: number }
```

## Vendors

### `GET /api/vendors`

The query is unchanged (`q`, `category_id`, `location`, `availability`, `project_id`, `include_archived`). `project_id` now matches **current** assignments only.

Each vendor gains:

| Key | Meaning |
| --- | --- |
| `project_count` | Current assignments on projects that are not archived (FR-002) |

`links` now lists current assignments only (see below). `past_links` is added.

### `GET /api/vendors/:id`

`links[]`, the current assignments, keeps its keys and adds:

```text
project_status: "PLANNED" | "ACTIVE" | "ON_HOLD" | "COMPLETED"
project_archived: boolean
assignment_status: AssignmentStatus
```

New keys:

```text
project_count: number
past_links: [{ id, project_id, project_name, project_archived, role_on_project, scope_of_work, note,
               removed_at, removed_by: Person }]      // newest removal first
```

## Projects

### `GET /api/projects`

The query gains three parameters. They combine with the existing `status` and `include_archived`, and a project must match all of them.

| Param | Meaning |
| --- | --- |
| `q` | Name, client name or site location contains the text, ignoring letter case |
| `has_overdue=true` | At least one Overdue item |
| `due_within_7=true` | At least one open item with a deadline from today to today + 7 |

Each project gains:

```text
start_date: string | null
expected_completion_date: string | null
vendor_count: number              // current assignments
progress: Progress
overdue_count: number
next_deadline: string | null      // earliest open-item deadline
health: Health
```

### `POST /api/projects` and `PATCH /api/projects/:id`

The body gains `start_date` and `expected_completion_date`: `YYYY-MM-DD`, optional, nullable. On PATCH, a missing key leaves the date unchanged and `null` clears it.

- 400 `fields.start_date` or `fields.expected_completion_date`: "Enter a date as YYYY-MM-DD."
- 400 with both fields: "The expected completion date cannot be before the start date." The check uses the stored value for any date not sent.

The response is the project shape above, without the computed figures. A change is recorded as a project `EDITED` history entry.

### `GET /api/projects/:id`

The existing keys are kept. `links` now lists current assignments only, and each one gains:

```text
vendor_phone: string
vendor_contact_person: string | null
vendor_categories: [{ id, name }]
assignment_status: AssignmentStatus
```

New keys:

```text
start_date, expected_completion_date, health, progress, overdue_count
completed_on: string | null              // FR-014a
after_completion_count: number           // FR-015b
upcoming: [{ id, name, item_type, deadline, status, flags }]   // up to 5 open items, earliest deadline first
past_links: [{ id, vendor_id, vendor_name, vendor_archived, role_on_project, scope_of_work, note,
               removed_at, removed_by: Person }]   // newest removal first
```

### `GET /api/projects/:projectId/timeline` (Feature 002)

Each item gains `after_project_completion: boolean` (FR-015b). `flags` is unchanged.

## Assignments (existing link routes)

### `POST /api/projects/:projectId/links`

The request and response are unchanged.

- 409 `LINK_EXISTS` only when the pair has a **current** assignment. A past assignment does not block it (FR-013b). A unique-index race is also returned as `LINK_EXISTS`.
- Writes `ASSIGNED` history entries to the vendor and the project.

### `PATCH /api/links/:id`

The body is unchanged and still `.strict()`, so a body with `assignment_status` or any other unknown key is refused with 400 (FR-012).

- 409 `ASSIGNMENT_REMOVED`: "This vendor was removed from the project. A past assignment cannot be changed."
- Writes `ASSIGNMENT_EDITED` history entries when something changed.

### `DELETE /api/links/:id`

The assignment is removed, **not deleted** (FR-013). The response keeps its Feature 001 keys and adds:

```text
removed_at: string
removed_by: Person
```

- 409 `ALREADY_REMOVED`: "This vendor has already been removed from the project."
- The side effects are unchanged: schedules archived, responsible vendor cleared.
- Writes `UNASSIGNED` history entries.

There is no restore route.

## Dashboard

### `GET /api/dashboard`

The Feature 002 keys `today`, `overdue`, `due_soon`, `missing_update` and `recent_delays_and_issues` are **unchanged**. New keys:

```text
items: [{
  id, name, item_type, deadline, status, last_update_on: string | null,
  group: Group,
  days_overdue: number | null,
  flags: TimelineFlag[],
  project: { id, name },
  responsible: { kind: "VENDOR" | "FIRM_TEAM" | "NONE", vendor: { id, name, archived } | null, label }
}]   // every open item on an active project, earliest deadline first

attention_projects: [{
  id, name, health, progress, overdue_count,
  reasons: [{ type: "PAST_EXPECTED_COMPLETION" } | { type: "OVERDUE_ITEMS", count }]
}]   // Delayed first, then most overdue items, then name
```

The browser filters `items` by `group`, project, responsible party and status, and sorts by deadline (the default), project name or `last_update_on` (newest first, nulls last). The "All" view is every entry in `items`.

## History

### `GET /api/history`

Unchanged, except that entries may now carry the actions `ASSIGNED`, `ASSIGNMENT_EDITED` and `UNASSIGNED` on vendor and project targets (data-model.md).
