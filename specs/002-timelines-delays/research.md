# Research: Timelines and Delays

The stack, repository shape, session auth, Zod validation, audit helper, and test tools are already decided in [Feature 001 research](../001-core-auth-directory/research.md). This feature reuses them unchanged. The decisions below are the ones this feature adds.

## Decision: Build on the Feature 001 branch

**Rationale**: `002-timelines-delays` was cut from `main`, which has the Feature 001 spec but not its code. The code is on `001-core-auth-directory` (head `a307e14`). The spec says this feature is built on top of that branch. The first implementation task brings that branch into `002-timelines-delays`, by merge or rebase, before any timeline code is written.

**Alternatives considered**: Waiting for Feature 001 to merge to `main`. Rejected because it blocks this feature for no product reason. Copying files by hand. Rejected because the history and the Prisma migration chain would diverge.

## Decision: No new runtime or dev dependency

**Rationale**: Dates, flags, lists, and forms need only what Feature 001 already installed: Express, Prisma, Zod, React, Vitest, Supertest, and React Testing Library. Constitution Principle II requires a one-line reason for each new runtime dependency, and none is needed.

**Alternatives considered**: A date library such as date-fns or Luxon for India Standard Time. Rejected. `Intl.DateTimeFormat` with `timeZone: 'Asia/Kolkata'` gives the calendar date, and calendar dates are compared as `YYYY-MM-DD` strings or whole-day differences. A chart or Gantt library. Rejected. FR-029 excludes charts beyond dated lists.

## Decision: "Today" is the India Standard Time calendar date, worked out on the server

**Rationale**: FR-003 says today is the date in India Standard Time. One helper, `todayInIndia(now = new Date())`, returns `YYYY-MM-DD`. A second helper, `indiaDateOf(timestamp)`, turns a progress update's `created_at` into its IST calendar date. India has no daylight saving, so a fixed `Asia/Kolkata` zone is exact. The browser never computes flags. It shows what the API returns.

The flag functions take `today` as an argument, so unit tests pass fixed dates and need no fake clock. API tests build deadlines relative to `todayInIndia()` and insert backdated progress updates directly through Prisma for the Missing update cases.

**Alternatives considered**: Computing today in the browser. Rejected. Two staff in different time zones would see different flags. A fake system clock in Supertest tests. Rejected as unnecessary when the rule functions take `today` as input.

## Decision: Flags are computed on read, from three independent rules

**Rationale**: FR-015 says flags are worked out whenever the timeline or dashboard is shown and are never stored. One pure function, `flagsFor(item, today)`, returns a list:

- **Overdue** when not Done, not archived, and `deadline < today`, with `days_overdue = today − deadline`.
- **Due soon** when not Done, not archived, and `today ≤ deadline ≤ today + 7`.
- **Missing update** when the status is In progress, not archived, and `today − lastUpdateDate > 7`, with the last update date.

The three rules are independent, and the function returns every flag that applies. The product owner confirmed this on 2026-10-28 (plan.md, Product decision 2). An item that meets several conditions shows all of them and appears in each matching dashboard list. Overdue and Due soon cannot both apply, because their deadline ranges do not overlap. Either can apply together with Missing update.

**Alternatives considered**: Storing flags in a column refreshed by a job. Rejected by FR-015 and because a job is extra moving parts. One flag per item with a priority order. Rejected because FR-014 and the separate Missing update list on the dashboard (FR-020) would then lose items.

## Decision: Current status comes from the latest progress update, not a stored column

**Rationale**: FR-009 says the latest update sets the current status, and FR-010 says updates are never edited. Reading the latest row means status and history cannot disagree. An item with no updates is Not started (FR-008), so a new item needs no update row. "Done from" is the IST date of the latest update when that update is Done (FR-011).

"Latest" is decided by a database sequence column, `seq`, which increases in commit order. Two updates saved at the same moment are then still ordered as saved (Edge Cases: two people update at once). `created_at` alone can tie at the same millisecond.

**Alternatives considered**: A `status` column on the item, updated in the same transaction. Rejected. It duplicates the latest update and can drift if a write path forgets it. Volume is hundreds of items, so reading the latest update per item is cheap.

## Decision: Responsible party is a kind plus an optional vendor

**Rationale**: The spec allows a linked vendor, Firm team, or nobody (FR-004). The item stores `responsible_kind` (`NONE`, `VENDOR`, `FIRM_TEAM`) and `responsible_vendor_id`. A database check constraint requires the vendor id exactly when the kind is `VENDOR`. Prisma has no syntax for check constraints, so the migration SQL adds it by hand. The migration is still a committed Prisma migration, as Principle III requires.

**Alternatives considered**: A nullable vendor id plus a `firm_team` boolean. Rejected. Two fields can both be set. A Firm team staff member picker. Rejected by the 2026-10-28 clarification: Firm team is one option, not a named person.

## Decision: Keep responsible-party changes in a history table

**Rationale**: FR-005 says clearing the vendor when a link is removed is "recorded as changed by the staff member who removed the link at that time". The item's `updated_by` is overwritten by the next edit, so it cannot keep that record. A `timeline_responsible_changes` row stores the old and new party, who, when, and the cause (`EDIT` or `LINK_REMOVED`). Writing a row on every change, not only on link removal, is one rule instead of two. It matches FR-006, which keeps earlier dates readable.

**Alternatives considered**: Relying on `updated_by` and `updated_at`. Rejected for the reason above. A single change table for dates and responsible party. Rejected. Mixed value types make every column nullable and the rules harder to read.

## Decision: Link removal clears responsible vendors inside the existing Feature 001 transaction

**Rationale**: FR-005 and FR-028 add one effect to `DELETE /api/links/:id`. The handler already archives that pair's schedules and deletes the link in one transaction. In that same transaction it now finds every item on the project with that vendor responsible, archived or not, sets `responsible_kind = NONE` and `responsible_vendor_id = null`, stamps `updated_by` with the remover, and writes one `LINK_REMOVED` history row for each item. Items with Firm team responsible are not touched. The response gains `cleared_timeline_item_ids`. Every other part of the response and behavior stays as Feature 001 defined it.

Nothing in this feature calls the links module, and the links module does not call timeline routes. The one shared write is a Prisma query inside the existing transaction, the same exception Feature 001 already makes for schedules.

**Archived projects**: Feature 001 does not refuse link removal on an archived project, and there FR-005 (clear the vendor) and FR-025 (refuse every change to timeline items) conflict. The product owner decided on 2026-10-28 (plan.md, Product decision 1) that the clearing happens on archived projects too, as a consequence of the link removal. The step changes only the responsible vendor and the audit columns, and writes the history row. It does not open any timeline route to writes on an archived project.

**Alternatives considered**: Leaving items unchanged on an archived project. Rejected by the product owner, because the item would keep a vendor that is no longer linked. Refusing link removal on an archived project. Rejected because it changes Feature 001 behavior, which FR-028 forbids.

## Decision: "Active project" means a project that is not archived

**Rationale**: The spec contrasts active and archived projects throughout, and its Edge Cases say On hold and Completed statuses do not change items or pause detection. Feature 001 also has a project status named `ACTIVE`. That status is not what this feature means. Timeline writes check `project.archived`, and the dashboard filters on `archived = false` for every status: Planned, Active, On hold, and Completed.

**Alternatives considered**: Limiting the dashboard to status `ACTIVE`. Rejected. It contradicts the On hold and Completed edge case.

## Decision: Archived projects are read-only through one server guard

**Rationale**: FR-025 refuses every change to timeline items, progress updates, delays, and coordination issues on an archived project. Each write route loads the project and calls one helper, `assertProjectWritable(project)`, which throws `409 PROJECT_ARCHIVED`. Reads stay open. Restoring a project (Feature 001) makes writes work again with no extra step.

**Alternatives considered**: An archived flag on each timeline row copied from the project. Rejected. The flag would duplicate the project and need updating on every archive and restore.

## Decision: Delays and issues store an optional item id, checked on the server

**Rationale**: A delay or issue belongs to one project and optionally one item on that project (FR-016, FR-017). Rows store `project_id` and a nullable `timeline_item_id`, each a database foreign key. The route refuses an item from another project with `409 ITEM_NOT_ON_PROJECT` (US4-7). Coordination issue vendors live in `coordination_issue_vendors`, one row per vendor, and each vendor must be linked to the project when the issue is saved. A later unlink does not remove the row, so the name stays readable (Edge Cases).

**Alternatives considered**: A composite foreign key `(timeline_item_id, project_id)` to stop cross-project rows in the database. Rejected. Prisma composite relations that share a scalar column with another relation make the schema harder to read for a check the route already makes and a test already covers.

## Decision: The dashboard is one read endpoint built in memory

**Rationale**: Volume is tens of projects with tens of items (spec Assumptions). `GET /api/dashboard` loads every non-archived item on a non-archived project with its latest update and responsible vendor, applies `flagsFor`, and sorts the three item lists as FR-022 says. It then loads the 10 newest delays and coordination issues on non-archived projects that are general or attached to a non-archived item. A few hundred rows fit in one request.

**Alternatives considered**: SQL views or materialized flags. Rejected. Flags depend on today, and a view would repeat the rule in SQL beside the tested TypeScript function.

## Decision: The web app adds a dashboard page and a timeline section on the project page

**Rationale**: Feature 001 uses hash routes and one page file per screen. This feature adds `#/dashboard`, served by `web/src/pages/dashboard.tsx`, and a timeline section rendered inside `project-detail.tsx` from `web/src/pages/project-timeline.tsx`. A dashboard entry opens `#/projects/<projectId>?item=<itemId>`. The project page scrolls to and highlights that item. Plain CSS from Feature 001 covers phone and desktop widths (SC-008).

**Alternatives considered**: Making the dashboard the default landing page. Not requested by the spec. The navigation gains a Dashboard link, and `#/vendors` stays the default.

## Dependencies not added

Date libraries, chart or Gantt libraries, job schedulers, email or push notification services, and anything for item dependencies, closing delays, reminders, or vendor self-service (FR-029).
