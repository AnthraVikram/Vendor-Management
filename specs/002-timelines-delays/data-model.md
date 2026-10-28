# Data Model: Timelines and Delays

PostgreSQL 17 through Prisma, added by one new committed migration on top of the Feature 001 migration chain. Every new table has `id` (UUID), `created_at`, `created_by`, `updated_at`, and `updated_by`, with `created_by` and `updated_by` referencing `staff_users.id` (Constitution Principle III). Foreign keys are declared in the database. There is no money in this feature.

Feature 001 tables are read and not altered, with one exception: removing a vendor-project link also updates `timeline_items` and writes `timeline_responsible_changes` rows (FR-005). No Feature 001 column is added or changed.

Dates are PostgreSQL `DATE`, written and read as `YYYY-MM-DD`. "Today" is the India Standard Time calendar date (FR-003). Timestamps are stored in UTC as `TIMESTAMP(3)`, the same as Feature 001, and turned into IST dates by the API.

## Enums

| Enum | Values |
| --- | --- |
| `TimelineItemType` | `MILESTONE`, `ACTIVITY` |
| `TimelineStatus` | `NOT_STARTED`, `IN_PROGRESS`, `DONE` |
| `ResponsibleKind` | `NONE`, `VENDOR`, `FIRM_TEAM` |
| `TimelineDateField` | `PLANNED_DATE`, `DEADLINE` |
| `ResponsibleChangeCause` | `EDIT`, `LINK_REMOVED` |

## timeline_items

One milestone or activity on one project (FR-002). Items have no parent and no relation to other items. There is no relation to `work_schedules`.

| Field | Rules |
| --- | --- |
| project_id | Required. References `projects.id` |
| item_type | Required. `MILESTONE` or `ACTIVITY` |
| name | Required. Trimmed, at least 1 character |
| description | Optional |
| planned_date | Optional `DATE`. When set, not later than `deadline` (FR-003) |
| deadline | Required `DATE` |
| responsible_kind | Required. Default `NONE` |
| responsible_vendor_id | Optional. References `vendors.id`. Set if and only if `responsible_kind = 'VENDOR'`. Enforced by the check constraint `timeline_items_responsible_ck` in migration SQL |
| archived | Default false. Archived items leave the timeline and the dashboard, stay readable, and can be restored (FR-007, FR-027) |

There is no status column. Current status is read from the latest progress update (see below).

Rules applied by the API when an item is created or changed:

- The project must not be archived (FR-025). The one exception is Feature 001 link removal, which clears `responsible_kind` and `responsible_vendor_id` even on an archived project and changes nothing else (plan.md, Product decision 1).
- When `responsible_kind = 'VENDOR'` is newly named or changed, the vendor must be not archived and linked to the project (FR-004). A saved item that keeps an already-named vendor which has since been archived is valid (FR-005).
- When `planned_date` or `deadline` changes, one `timeline_date_changes` row is written in the same transaction (FR-006).
- When `responsible_kind` or `responsible_vendor_id` changes, one `timeline_responsible_changes` row with cause `EDIT` is written in the same transaction.
- An archived item is not changed, and gets no progress update, delay, or issue, until it is restored (plan.md, Product decision 3).
- Items are never deleted. There is no delete route.

Indexes: `(project_id, archived, deadline, name)` for the timeline order in FR-007; `(responsible_vendor_id)` for link removal.

## timeline_date_changes

One earlier planned date or deadline (FR-006, SC-005). Never edited or deleted.

| Field | Rules |
| --- | --- |
| timeline_item_id | Required. References `timeline_items.id` |
| field | Required. `PLANNED_DATE` or `DEADLINE` |
| old_value | `DATE`. Null when a planned date is set for the first time |
| new_value | `DATE`. Null when a planned date is cleared |

`created_at` and `created_by` are when and by whom the change was made. A deadline change always has both values, because the deadline is required.

## timeline_responsible_changes

One change of responsible party. Never edited or deleted.

| Field | Rules |
| --- | --- |
| timeline_item_id | Required. References `timeline_items.id` |
| old_kind | Required `ResponsibleKind` |
| old_vendor_id | Optional. References `vendors.id` |
| new_kind | Required `ResponsibleKind` |
| new_vendor_id | Optional. References `vendors.id` |
| cause | Required. `EDIT` for a staff edit, `LINK_REMOVED` when Feature 001 link removal cleared it |

For `LINK_REMOVED`, `created_by` is the staff member who removed the link and `created_at` is that moment (FR-005, Edge Cases).

## timeline_progress_updates

One dated status entry on an item (FR-009). Never edited or deleted (FR-010).

| Field | Rules |
| --- | --- |
| timeline_item_id | Required. References `timeline_items.id` |
| status | Required. `NOT_STARTED`, `IN_PROGRESS`, or `DONE`. Any other value is a 400 (US2-5) |
| note | Optional |
| seq | Database sequence (`autoincrement`), unique. Orders updates by commit, including two saved at the same moment |

Derived values, never stored:

- **Current status**: `status` of the row with the highest `seq` for the item, or `NOT_STARTED` when there is no row (FR-008).
- **Last update date**: IST calendar date of that row's `created_at`. Absent when there is no row.
- **Done on**: the last update date when the current status is `DONE` (FR-011).

History is shown newest first, by `seq` descending (US2-2).

## delays

One delay on a project, optionally on one of its items (FR-016). Never edited or deleted (FR-018).

| Field | Rules |
| --- | --- |
| project_id | Required. References `projects.id` |
| timeline_item_id | Optional. References `timeline_items.id`. When set, the item's `project_id` must equal this row's `project_id` (checked by the API, US4-7) |
| reason | Required. Trimmed, at least 1 character (US4-3) |

There is no category, day count, expected date, or open/closed state (2026-10-28 clarification, FR-018).

## coordination_issues

One coordination problem on a project, optionally on one of its items (FR-017). Never edited or deleted (FR-018). Separate from Feature 001 `vendor_notes` (FR-019).

| Field | Rules |
| --- | --- |
| project_id | Required. References `projects.id` |
| timeline_item_id | Optional. References `timeline_items.id`. Same project rule as delays |
| description | Required. Trimmed, at least 1 character |

## coordination_issue_vendors

The vendors named on an issue. Written with the issue in one transaction and never changed.

| Field | Rules |
| --- | --- |
| coordination_issue_id | Required. References `coordination_issues.id` |
| vendor_id | Required. References `vendors.id`. Must be linked to the issue's project when the issue is saved (US4-4). May be archived (plan.md, Product decision 4) |

Unique on `(coordination_issue_id, vendor_id)`. Zero rows is allowed: an issue may name no vendor. A later unlink or vendor archive leaves these rows in place, so the name stays readable (Edge Cases).

## Relationships

```text
projects 1 ── * timeline_items 1 ── * timeline_progress_updates
                     │          1 ── * timeline_date_changes
                     │          1 ── * timeline_responsible_changes
                     └── 0..1 vendors (responsible)
projects 1 ── * delays              * ── 0..1 timeline_items
projects 1 ── * coordination_issues * ── 0..1 timeline_items
coordination_issues 1 ── * coordination_issue_vendors * ── 1 vendors
```

`staff_users` gains the back-relations Prisma requires for `created_by` and `updated_by` on each new table. `projects` and `vendors` gain back-relations only. Their columns do not change.

## State

Item lifecycle:

```text
active ──archive──▶ archived ──restore──▶ active
```

Both are refused while the project is archived.

Status, driven only by progress updates:

```text
(no update) = NOT_STARTED ──update──▶ any of NOT_STARTED | IN_PROGRESS | DONE
```

Any status can follow any status. Done is left by recording another status (US2-4).

Flags are derived on read (FR-012 to FR-015). The three rules are independent, and an item carries every flag that applies (plan.md, Product decision 2). See [research.md](./research.md).

## Seed additions

The Feature 001 seed is extended, idempotently, with timeline data on one seeded project: an Overdue activity with the linked vendor responsible, a Due soon milestone, an In progress activity whose last update is 8 days old, a Done item past its deadline, a Firm team item, one delay on the overdue item, and one coordination issue naming the linked vendor. Dates are relative to today in IST when the seed runs.
