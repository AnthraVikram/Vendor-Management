# Data Model: Core Auth and Directory

PostgreSQL 17 through Prisma. Every table has `id` (UUID), `created_at`, `created_by`, `updated_at`, and `updated_by`. `created_by` and `updated_by` reference `staff_users.id`. Money columns are `DECIMAL(15,2)`. Foreign keys are declared in the database. There is no float money column.

`archived` on vendors, projects, schedules, and costing-sheet files means the row leaves the working view and stays readable. Link rows may be deleted. Price entries and file bytes are not deleted.

## staff_users

A staff account. One role. Revoke sets `revoked_at`. Restore clears it.

| Field | Rules |
| --- | --- |
| name | Required |
| email | Required, unique, stored lowercase |
| phone | Optional |
| role | `ADMINISTRATOR`, `OFFICE_TEAM`, or `ACCOUNTANT` |
| password_hash | Required, bcrypt, never returned |
| revoked_at | Null while active |

The seed administrator's `created_by` is its own `id`. An update that would leave zero rows with `role = ADMINISTRATOR` and `revoked_at` null is refused. Email uniqueness includes revoked accounts.

## sessions

| Field | Rules |
| --- | --- |
| staff_user_id | Required |
| expires_at | Required |
| revoked_at | Set on sign-out and when the account is revoked |

A request with a missing, expired, or revoked session is unauthenticated. A session whose user has `revoked_at` set is refused even if the session row is still open.

## categories

| Field | Rules |
| --- | --- |
| name | Required, unique case-insensitively |

A matching name, ignoring letter case, returns the existing row and does not rewrite `name`. Vendors use a category through `vendor_categories`.

## vendors

One business. Archive is independent of links and schedules.

| Field | Rules |
| --- | --- |
| name | Required |
| contact_person | Optional |
| phone | Required |
| alternate_phone | Optional |
| email | Optional |
| address | Optional |
| gst_registered | Required boolean |
| gstin | Required when `gst_registered` is true, otherwise null. Unique among non-null values. 15-character GSTIN shape |
| gst_legal_name | Optional |
| team_size | Optional whole number, zero or greater |
| availability | Optional `AVAILABLE`, `LIMITED`, or `UNAVAILABLE` |
| manpower_note | Optional |
| archived | Default false |

Saving a phone that already exists on another vendor returns a warning and does not save until the request sets `confirm_duplicate_phone`.

Default directory queries exclude `archived = true` unless `include_archived` is set.

## vendor_categories

`vendor_id`, `category_id`. Unique pair. A vendor needs at least one category to be saved.

## vendor_locations, vendor_services, vendor_materials

`vendor_id`, `label`. Unique pair per vendor. Labels are the filter and search values. They are not a catalog of materials or a price book.

## vendor_rates

Directory indicative rates. Not task prices.

| Field | Rules |
| --- | --- |
| vendor_id | Required |
| label | Required |
| amount | `DECIMAL(15,2)`, zero or greater |
| unit | Required |

## vendor_notes

| Field | Rules |
| --- | --- |
| vendor_id | Required |
| note_type | `PAST_WORK`, `RELIABILITY`, `COORDINATION`, or `GENERAL` |
| body | Required, non-empty |

The author is `created_by`. Notes are not updated in place.

## vendor_ratings

| Field | Rules |
| --- | --- |
| vendor_id | Required |
| score | Whole number 1 through 5 |
| comment | Optional |

The current rating is the latest row. A vendor with no rows is unrated. Older rows stay readable.

## projects

| Field | Rules |
| --- | --- |
| name | Required |
| client_name | Optional text. No client table |
| site_location | Optional |
| description | Optional |
| status | `PLANNED`, `ACTIVE`, `ON_HOLD`, or `COMPLETED` |
| archived | Default false. Independent of status |

The default project list includes every status and excludes archived projects.

## vendor_project_links

| Field | Rules |
| --- | --- |
| vendor_id | Required |
| project_id | Required |
| role_on_project | Optional |
| scope_of_work | Optional |
| note | Optional |

Unique `(vendor_id, project_id)`. Insert refused when either side is archived or the pair already exists. Delete of this row is allowed. It does not delete the vendor or the project. In the same action, working schedules for that vendor and project are archived. The delete does not delete those schedules, their `task_price_entries`, or their `costing_sheet_files`.

This table has no price and no schedule dates.

## work_schedules

One booked task. The priced job is this row, not the vendor and not the link.

| Field | Rules |
| --- | --- |
| vendor_id | Required. Vendor details are not copied here |
| project_id | Required |
| task | Required |
| work_date | Required. One calendar date |
| start_time | Required. Time on `work_date` |
| end_time | Required, later than `start_time` |
| required_team_size | Required whole number, 1 or greater |
| pricing_mode | `NONE`, `FIXED`, or `FILE`. Default `NONE` |
| archived | Default false |

Insert requires an existing link and both the vendor and the project active (`archived = false`).

Conflict query: other rows with the same `vendor_id`, the same `work_date`, `archived = false`, and `start_time < other.end_time` and `end_time > other.start_time`. The vendor's `availability` is not part of the query. Conflicts are returned and the row is still saved.

Working project views exclude `archived = true`. An archived schedule, its price history, and its files remain readable by id.

## task_price_entries

Append-only charges and reversals for `pricing_mode = FIXED`.

| Field | Rules |
| --- | --- |
| schedule_id | Required |
| amount | `DECIMAL(15,2)`. A charge is zero or greater. A reversal stores the negated previous charge |
| kind | `CHARGE` or `REVERSAL` |
| reverses_entry_id | Required for `REVERSAL`, otherwise null |

The current price is the latest `CHARGE` that has no reversal. Changing it inserts a `REVERSAL` of that charge and a new `CHARGE`. Rows are not updated to hide an old amount. A charge cannot be inserted while `pricing_mode` is `FILE`.

## costing_sheet_files

| Field | Rules |
| --- | --- |
| schedule_id | Required |
| storage_key | Required. Path relative to `FILE_STORAGE_DIR`. Not a public URL |
| original_filename | Required |
| media_type | Spreadsheet or PDF |
| byte_size | Greater than 0, at most 10 MB |
| archived | Default false |

At most one row per schedule has `archived = false`. Replacing a file sets the previous row `archived = true` and keeps the bytes. A file cannot be attached while `pricing_mode` is `FIXED`. Download requires a signed-in active staff member.

## Relationships

```text
staff_users 1──* sessions
staff_users 1──* (created_by / updated_by on every table)

categories *──* vendors through vendor_categories
vendors 1──* vendor_locations
vendors 1──* vendor_services
vendors 1──* vendor_materials
vendors 1──* vendor_rates
vendors 1──* vendor_notes
vendors 1──* vendor_ratings

vendors *──* projects through vendor_project_links
vendors 1──* work_schedules
projects 1──* work_schedules
work_schedules 1──* task_price_entries
work_schedules 1──* costing_sheet_files
```

A schedule stores `vendor_id` and `project_id` so it remains readable after the link row is deleted. `work_schedules` has no foreign key to `vendor_project_links`, so deleting a link cannot cascade to a schedule. `task_price_entries.schedule_id` and `costing_sheet_files.schedule_id` use `ON DELETE RESTRICT`. A schedule does not store a copy of vendor contact details, rates, categories, or manpower.

## State

**Staff**: active (`revoked_at` null) or revoked. No archive flag.

**Vendor and project**: working (`archived` false) or archived. Project `status` changes without archiving. Completed and not archived stays on the default list.

**Schedule pricing**: `NONE` → `FIXED` or `NONE` → `FILE`. No transition between `FIXED` and `FILE` in this feature.

**Schedule visibility**: working or archived. Archive happens when the schedule is removed or when its vendor-project link is removed.

## Explicitly absent

No tables for clients, milestones, delays, quotations, purchase orders, invoices, payments, client advances, staff-to-project assignment, or a general document library.
