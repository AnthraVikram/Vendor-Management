# Data Model: Import, Documents, and Advances

The tables live in PostgreSQL 17 through Prisma. One new committed migration, `20261029120000_import_documents_advances`, goes on top of the Feature 001 and Feature 002 migrations.

Every new table has these columns:
- `id` (UUID), `created_at`, `created_by`, `updated_at`, and `updated_by`. `created_by` and `updated_by` reference `staff_users.id` (Constitution Principle III).
- On append-only tables, `updated_at` and `updated_by` equal the creation values and never change.

Foreign keys are declared in the database with `ON DELETE RESTRICT`.

Money is `DECIMAL(15,2)` in Indian rupees. Dates are `DATE`, read and written as `YYYY-MM-DD`. "Today" and "the current month" are India Standard Time calendar values (Feature 002 `india-date.ts`).

## Changes to existing tables

| Table | Change |
| --- | --- |
| `vendors` | Add `import_run_id`, an optional reference to `vendor_import_runs.id` that is set only on vendors created by an import (FR-010). No other column changes |

No other Feature 001 or Feature 002 column is added or changed. Three Feature 001 write paths change behaviour, as described in plan.md, Architecture:
- the phone duplicate check
- the vendor-identity lock
- history writes for vendor and project create, edit, archive, and restore

## Enums

| Enum | Values |
| --- | --- |
| `ImportPreviewStatus` | `OPEN`, `CONFIRMED`, `CANCELLED` |
| `ImportRowOutcome` | `IMPORTED`, `SKIPPED`, `REJECTED` |
| `DocumentType` | `AGREEMENT`, `DRAWING`, `REGISTRATION_CERTIFICATE`, `PHOTO`, `OTHER` |
| `PaymentMethod` | `CASH`, `BANK_TRANSFER`, `CHEQUE`, `UPI`, `OTHER` |
| `HistoryAction` | `CREATED`, `EDITED`, `ARCHIVED`, `RESTORED`, `REVERSED` |

## vendor_import_previews

One uploaded file waiting for confirmation (Key Entity: Import preview).

| Field | Rules |
| --- | --- |
| file_name | Required. The original file name |
| file_format | Required. `XLSX` or `CSV`, stored as text |
| status | `ImportPreviewStatus`. Starts `OPEN` |
| expires_at | Required. `created_at + 30 minutes` (FR-008c) |
| rows | Required `jsonb`. One element per non-blank data row: `{ row_number, cells: { heading: text }, outcome: "READY" \| "REJECTED" \| "POSSIBLE_DUPLICATE", reasons: [text], matches: [{ kind: "VENDOR" \| "ROW", vendor_id?, vendor_name?, row_number? }] }` |
| ignored_headings | `text[]`. Headings found in the file that are not template headings |

Rules:
- Only `created_by` may read, confirm, or cancel the preview (FR-008d).
- `OPEN` may become `CONFIRMED` or `CANCELLED`. Neither of those changes again.
- A preview past `expires_at` is treated as expired on every request. It cannot be viewed, confirmed, or cancelled (FR-008c).
- The raw file is not stored.
- `rows` is set to `[]` and `ignored_headings` to `{}` (FR-008e):
  - in the confirm transaction, after the run and row outcomes are written
  - in the cancel request
  - on any request for the preview after it expires
  - at the start of every preview upload, for every expired `OPEN` preview

  The row itself stays as a marker of id, owner, status, and expiry, so later requests get the right refusal. It is never deleted, and no job is involved. Each clearing sets `updated_by` to the signed-in person whose request did it, including when an upload clears someone else's expired preview.

## vendor_import_runs

One confirmed import (Key Entity: Import run). Insert-only.

| Field | Rules |
| --- | --- |
| preview_id | Required. Unique. References `vendor_import_previews.id`. A preview has at most one run, which is how FR-008b is enforced in the database |
| file_name | Required. Copied from the preview |
| imported_count, skipped_count, rejected_count | Required. Whole numbers of zero or more |

`created_by` and `created_at` are who ran the import and when (FR-010).

## vendor_import_rows

The final outcome of one row of a run (Key Entity: Import row outcome). Insert-only.

| Field | Rules |
| --- | --- |
| run_id | Required. References `vendor_import_runs.id` |
| row_number | Required. The spreadsheet row number, counting the heading row as row 1 |
| outcome | `ImportRowOutcome` |
| reasons | `text[]`. Empty for `IMPORTED` |
| matches | `jsonb`. The matches shown for a possible duplicate, if any |
| vendor_id | References `vendors.id`. Set if and only if `outcome = 'IMPORTED'`. Enforced by the check constraint `vendor_import_rows_vendor_ck` |

Unique: `(run_id, row_number)`.

Run and row outcomes are the lasting audit record of an import (FR-010, FR-008e). They keep row numbers, outcomes, reasons, and matches, not the cell values of skipped or rejected rows.

Preview outcome within the file (FR-006, FR-007): rows are compared only with earlier rows that are not rejected. A rejected row is never added to the GSTIN or phone index (research.md).

Outcome at confirmation (FR-008):
- **`IMPORTED`:** a row that is still valid and has no GSTIN duplicate, and is either not a possible duplicate or is a possible duplicate the person approved.
- **`REJECTED`:** any row rejected in the preview, which stays rejected, or a row that now fails validation or has a GSTIN duplicate in the directory.
- **`SKIPPED`:** a possible duplicate that was not approved, including one that first became a possible duplicate at confirmation.

## documents

One file on one vendor or one project (FR-012 to FR-016). Never deleted.

| Field | Rules |
| --- | --- |
| vendor_id | References `vendors.id` |
| project_id | References `projects.id`. Exactly one of `vendor_id` and `project_id` is set, enforced by the check constraint `documents_parent_ck` |
| title | Required. Trimmed, at least 1 character |
| document_type | `DocumentType` |
| note | Optional |
| original_filename | Required |
| media_type | Required. Chosen from the checked content (research.md) |
| byte_size | Required. 1 to 26,214,400 (25 MB) |
| storage_key | Required. Unique. `uuid + extension` under `FILE_STORAGE_DIR` |
| archived | Default false |

Rules:
- Upload, archive, and restore are refused while the parent vendor or project is archived (FR-015). Reading is allowed.
- No route or code path deletes a row or its file. Archived documents stay downloadable.

Index: `(vendor_id, archived, created_at)` and `(project_id, archived, created_at)`.

## client_advances

Money received from a client against one project (FR-018 to FR-022). Insert-only: no column changes after insert.

| Field | Rules |
| --- | --- |
| project_id | Required. References `projects.id`. The project must not be archived when the advance is recorded |
| amount | Required `DECIMAL(15,2)`. Check `amount > 0` (`client_advances_amount_ck`). At most two decimal places, refused by the API before insert |
| received_on | Required `DATE`. Not later than today in India Standard Time |
| payment_method | Optional `PaymentMethod` |
| reference | Optional text |
| note | Optional text |

"Reversed" is not a column. An advance is reversed exactly when a `client_advance_reversals` row references it.

Indexes: `(project_id, received_on)` and `(received_on)`.

## client_advance_reversals

The full-amount correction of one advance (FR-020). Insert-only.

| Field | Rules |
| --- | --- |
| client_advance_id | Required. Unique. References `client_advances.id`. At most one reversal per advance |
| amount | Required `DECIMAL(15,2)`. Copied from the advance. Check `amount > 0` |
| reason | Required. Trimmed, at least 1 character |

There is no reference from a reversal to a reversal, so a reversal cannot be reversed. A reversal is allowed when the project is archived.

## history_entries

A read-only record of one important change (FR-027, FR-028). Insert-only.

| Field | Rules |
| --- | --- |
| vendor_id | References `vendors.id` |
| project_id | References `projects.id` |
| document_id | References `documents.id` |
| vendor_import_run_id | References `vendor_import_runs.id` |
| client_advance_id | References `client_advances.id` |
| action | `HistoryAction` |
| changes | `jsonb`. For `EDITED`: `{ field: { from, to } }`. Otherwise `{}` |
| details | `jsonb`. For example `{ "import_run_id": "…" }` on a vendor created by an import, or `{ "reason": "…", "amount": "…" }` on `REVERSED` |

Check `history_entries_target_ck`: exactly one of the five target columns is set.

Index: one per target column with `created_at`.

Entries written by this feature:

| Event | Target | Action |
| --- | --- | --- |
| Vendor created by the form or an import | vendor | `CREATED` (import adds `details.import_run_id`) |
| Vendor edited | vendor | `EDITED` with the changed fields |
| Vendor archived or restored | vendor | `ARCHIVED` or `RESTORED` |
| Project created, edited, archived, or restored | project | Same as vendor |
| Document uploaded, archived, or restored | document | `CREATED`, `ARCHIVED`, or `RESTORED` |
| Import confirmed | vendor_import_run | `CREATED` with the counts in `details` |
| Advance recorded | client_advance | `CREATED` with amount and date in `details` |
| Advance reversed | client_advance | `REVERSED` with amount and reason in `details` |

Fields compared for vendor `EDITED`: name, contact person, phone, alternate phone, email, address, categories, locations served, services, materials, indicative rates, GST registered, GSTIN, GST legal name, team size, availability, and manpower note.

Fields compared for project `EDITED`: name, client name, site location, description, and status.

Ratings and notes keep their own Feature 001 history and are not repeated here.

History starts at deployment. No entry is created for an earlier event.

## Derived values

None of these is stored.

| Value | Definition |
| --- | --- |
| Project net amount | Sum of the project's advances that have no reversal (FR-021) |
| Total tile | Sum of all advances that have no reversal, on every project, archived included (FR-024) |
| Month tile | Sum of advances with `received_on` in the current India Standard Time calendar month that have no reversal (FR-024) |
| Vendor tile | Count of vendors with `archived = false` (FR-023) |
| Project tiles | Count of projects with `archived = false`, grouped by `status` (FR-023) |

## Seed additions

The seed is rerunnable without duplicates and inserts:
- two advances on one seeded project: one received this month, and one received last month and reversed this month
- one advance on a second project

These cover the month-attribution rule at a glance. The seed does not create documents or imports.

## Test reset order

`resetDatabase` deletes rows in this order, before the existing Feature 002 and Feature 001 tables:
1. `history_entries`
2. `client_advance_reversals`
3. `client_advances`
4. `documents`
5. `vendor_import_rows`
6. Clear `vendors.import_run_id`
7. `vendor_import_runs`
8. `vendor_import_previews`
