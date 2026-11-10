# Data Model: Feature 005 UI/UX Overhaul

Two new tables and new history actions. No existing column is changed or removed, and the migration inserts no rows (FR-047, owner decision).

## ProjectSection (`project_sections`)

| Column | Type | Rules |
|---|---|---|
| `id` | uuid, primary key | |
| `project_id` | uuid, FK → `projects.id`, `ON DELETE RESTRICT` | required |
| `name` | text | 1 to 80 characters after trimming (FR-008); unique among the project's current sections, case-insensitive (FR-011) |
| `position` | integer | ≥ 0; current sections of a project have distinct positions. Not enforced by the database: the server rewrites all positions of a project in one transaction on add, reorder and restore, holding a lock on the project's sections |
| `description` | text, nullable | up to 5,000 characters |
| `notes` | text, nullable | up to 5,000 characters |
| `removed_at` | timestamp, nullable | set when removed (FR-010) |
| `removed_by` | uuid, nullable, FK → `staff_users.id`, `ON DELETE RESTRICT` | set with `removed_at` |
| `created_at`, `created_by`, `updated_at`, `updated_by` | audit columns | Constitution III |

Indexes and constraints (hand-written in the migration, research §6):

- `project_sections_current_name_key`: unique `(project_id, lower(name)) WHERE removed_at IS NULL`.
- `project_sections_removed_ck`: `(removed_at IS NULL) = (removed_by IS NULL)`.
- index `(project_id, position)`.

State transitions: **current** → (remove) → **removed** → (restore) → **current**, placed last (`position` = max + 1), name re-checked for uniqueness (FR-010a). Removing keeps its section assignments as they were at that moment: current assignments are ended (`removed_at` set) in the same transaction, and stay past after a restore.

## SectionAssignment (`section_assignments`)

| Column | Type | Rules |
|---|---|---|
| `id` | uuid, primary key | |
| `section_id` | uuid, FK → `project_sections.id`, `ON DELETE RESTRICT` | required |
| `vendor_id` | uuid, FK → `vendors.id`, `ON DELETE RESTRICT` | required; references the existing vendor, nothing copied (FR-016) |
| `role_in_section` | text, nullable | up to 120 characters |
| `removed_at`, `removed_by` | as above | FR-017 |
| audit columns | | Constitution III |

Constraints:

- `section_assignments_current_key`: unique `(section_id, vendor_id) WHERE removed_at IS NULL` (FR-016).
- `section_assignments_removed_ck`: as above.
- index `(vendor_id)`.

Rules enforced by the server:

- The vendor and project must not be archived (Feature 001 FR-025; `activePair`).
- If the vendor has no current `vendor_project_links` row for the section's project, one is created in the same transaction (FR-015a).
- Ending a project assignment ends every current section assignment of that vendor in that project (FR-015b).
- Assignments on a removed section, or on an archived project, are read-only.

## HistoryAction (enum additions)

`SECTION_ADDED`, `SECTION_RENAMED`, `SECTION_EDITED`, `SECTIONS_REORDERED`, `SECTION_REMOVED`, `SECTION_RESTORED`, `BLUEPRINT_APPLIED` (project target; only for **Use the standard blueprint** — at creation the blueprint goes into the existing `CREATED` entry's details as `blueprint_applied`); `SECTION_ASSIGNED`, `SECTION_ASSIGNMENT_EDITED`, `SECTION_UNASSIGNED` (vendor and project targets). Details include `section: { id, name }` and, for assignments, `vendor` and `project` as Feature 004 does.

## Default blueprint (constant, not stored)

`api/src/lib/blueprint.ts`, exactly 15 names in this order (FR-012): Project Overview, Client Information, Scope of Work, Design & Planning, Drawings / Documentation, Procurement, Materials, Execution, Site Coordination, Budget & Costing, Timeline, Milestones, Deliverables, Snagging, Completion. Positions 0 to 14. Every section holds text only.

## Derived values (not stored)

- **Progress percentage**: `round(done / total × 100)` from Feature 004 `projectProgress`; none when `total` is 0.
- **In progress** (FR-020): not archived, status not `COMPLETED`, `0 < done < total`.
- **Vendor counts**: active = `archived = false`; archived = `archived = true`; total = both.
- **Project counts**: total = not archived; archived counted separately.

## Browser storage (not on the server)

`localStorage` keys `vm.list.vendors` and `vm.list.projects`: `{ "sort": string, "view": "active" | "archived" }` (FR-005). Ignored if unreadable or invalid.

## Migration

`api/prisma/migrations/<timestamp>_project_sections/migration.sql`, generated with `prisma migrate diff` and extended by hand with the partial unique indexes and check constraints above. Additive only: `ALTER TYPE … ADD VALUE`, two `CREATE TABLE`, indexes, foreign keys and checks. It is applied to the test database by the test setup, and to the development database only after the product owner reviews the SQL and approves.
