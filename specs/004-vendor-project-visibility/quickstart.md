# Quickstart: Vendor–Project Visibility, Project Tracking and Dashboard Views

This is the validation guide for [spec.md](./spec.md). Routes and response keys are in [contracts/http-api.md](./contracts/http-api.md), and columns and rules are in [data-model.md](./data-model.md). The guide contains no implementation code.

## Prerequisites

The Feature 001 prerequisites, `.env`, seed accounts and start command apply unchanged. See the [Feature 001 quickstart](../001-core-auth-directory/quickstart.md).

Before any change, confirm the `main` baseline on this branch is green:

```text
npm install
npm run lint
npm run typecheck
npm test
```

## Start the app (reset only with approval)

**Default: use the existing local database.**

```text
npm run dev
```

The start command applies pending migrations, including `20261108120000_vendor_project_visibility`, and runs the seed. The seed adds missing demonstration records and never changes or deletes existing ones. Sign in as `office@example.com` unless a step names another account.

The seed's dates are relative to the day it first runs (research.md §12). On a database seeded on an earlier day, some seeded items may sit in a different dashboard group than the scenarios describe. Do not silently accept such a difference: record it and investigate whether it comes from stale demonstration instructions or a genuine defect.

**Optional: reset for a demonstration.**

> **Approval required.** `prisma migrate reset --force` deletes all data in the local database. Run it only after the product owner has explicitly approved a reset for this demonstration. Never run it against a database holding data that must be kept.

```text
npx -w api prisma migrate reset --force
npm run dev
```

`migrate reset` applies every migration and runs the seed, so every seeded date is relative to today.

## Automated checks

```text
npm run lint
npm run typecheck
npm test
```

Expected: everything green. Every acceptance scenario in User Stories 1 to 8 has a Supertest or React Testing Library case (plan.md, Testing strategy). The Feature 001 to 003 suites pass, apart from the dashboard web test the plan lists as superseded.

## Scenarios to demonstrate

Run each at **375 px** and **1280 px** browser widths (FR-030). Time the steps marked ⏱.

### 1. Assignments from both sides (US1, US3)

1. Open **Vendors** and pick a vendor on more than one project.
   - Expected: the row shows contact person, phone, categories, locations, availability and the project count (US2-1).
2. ⏱ Open that vendor (SC-001, under 30 s from the directory).
   - Expected: **Projects** lists each current project with its status, role, scope, note and assignment status, and the count matches the list (US1-1).
   - Selecting a project opens it (US1-2).
3. On that project:
   - Expected: each vendor shows phone, contact person, categories and assignment status (US1-3, ⏱ SC-002, under 15 s).
   - Selecting a vendor opens its profile (US1-4).
4. Confirm that among the seeded assignments, each status appears once: No activities, Not started, In progress, Delayed and Completed (US3-2).
5. Open a vendor with no assignments.
   - Expected: "This vendor is not assigned to any project yet" and 0 projects (US1-5).

### 2. Past assignments (US4)

1. On a project, remove a vendor that has a role, scope and note.
   - Expected: a confirmation message appears (FR-026).
   - Expected: the vendor moves to **Past vendors** with role, scope, note, your name and the time (US4-3).
   - Expected: its schedules leave the project view, and its items show "No responsible party" (US4-1).
2. Open the vendor.
   - Expected: the project appears under **Past projects** and the count drops by one (US4-4, US4-5).
3. Open the history of the vendor and of the project.
   - Expected: both show the removal with your name and the time (US4-2).
4. Assign the same vendor again.
   - Expected: a new current assignment appears, and the past one stays (US4-7).
5. Through the API, `PATCH` and `DELETE` the past assignment's id.
   - Expected: 409 `ASSIGNMENT_REMOVED` and 409 `ALREADY_REMOVED` (US4-6).

### 3. Project directory and overview (US5)

1. Open **Projects**.
   - Expected: each row shows status, start and expected completion dates (or "Not set"), vendor count, "N of M items done" with a bar, health label, overdue count and next deadline (US5-1).
2. Search by a client name, then turn on **Has overdue items**, then **Has items due in the next 7 days**.
   - Expected: only matching projects remain each time (US5-2 to US5-4).
3. Open the seeded Delayed project.
   - Expected: the overview shows Delayed, its dates, progress, the overdue count, up to 5 upcoming items, and "N items are due after the expected completion date". Those items are marked on the timeline (US5-6, US5-14).
4. Edit the project:
   - Set an expected completion date earlier than the start date. Expected: both fields are named and nothing is saved (US5-10).
   - Set a valid later date. Expected: the health changes to Ongoing, and the history shows both dates (US5-11, edge cases).
5. Set the project's status to Completed.
   - Expected: the overview shows "Completed on <today>" (US5-12).
6. Open the project with no timeline items.
   - Expected: "No activities yet" and no bar (US5-7).

### 4. Dashboard (US6)

1. Open **Dashboard**.
   - Expected: Overdue is selected and shows days overdue.
   - Expected: Due today, Coming soon, Upcoming and All each show their items, and no item is in two dated groups (US6-1 to US6-5).
2. Filter by one project, then by a vendor, then by status In progress.
   - Expected: the lists narrow, and an empty result says no items match (US6-7 to US6-9, US6-15).
3. Sort by project, then by most recent update (US6-10, US6-11).
4. Select an item, a project name and a vendor name in turn.
   - Expected: each opens the right page (US6-14).
5. Check the other sections (US6-12, US6-13, US6-16 to US6-19):
   - **Missing update**: shows the seeded item.
   - **Recent delays and issues**: shows the newest 10.
   - **Tiles**: unchanged.
   - **Attention section**: the Delayed project first, with "Past expected completion date", and an Ongoing project with "N overdue items".
6. ⏱ Name every project with overdue work (SC-004, under 1 minute).

### 5. Profile menu, messages and empty states (US7)

1. Open the profile menu at the top right.
   - Expected: it shows name, role and email.
   - Change your password, and sign out and back in (US7-1 to US7-3).
2. Sign in as `office@example.com`.
   - Expected: no Staff link is shown (US7-4).
3. Archive and restore a vendor.
   - Expected: a confirmation each time (US7-5).
4. Save a vendor with no name.
   - Expected: the field is named (US7-6).
5. With the API stopped, try any save.
   - Expected: "The action did not complete. Please try again." with no technical detail (US7-8).
6. Visit each empty list in FR-031, using an empty search where needed (US7-9).

### 6. Seed is safe to repeat (US8)

1. Note the number of vendors, projects, assignments and items.
2. Run `npm run -w api prisma:seed` again.
   - Expected: every count is unchanged, and a vendor you edited before the second run keeps your edit (US8-4, SC-007).

## Done

- Every scenario above was demonstrated at both widths.
- The timed criteria SC-001, SC-002 and SC-004 were met.
- `npm run lint`, `npm run typecheck` and `npm test` are green.
- `/speckit-converge` reports Converged.
