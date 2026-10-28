# Implementation Plan: Timelines and Delays

**Branch**: `002-timelines-delays` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-timelines-delays/spec.md`

## Summary

Staff keep a flat timeline of milestones and activities on each project. Each item has a deadline, an optional planned date, and a responsible party: a linked vendor, Firm team, or none. Staff record progress as dated status updates and record delays and coordination issues against an item or the whole project. The server works out Overdue, Due soon, and Missing update flags on every read from the dates and updates, using today in India Standard Time. One dashboard for the whole firm lists those flags and the 10 most recent delays and issues across non-archived projects.

The implementation extends the Feature 001 monorepo. It adds one Prisma migration, one API module, one dashboard route, a small change to the existing link-removal transaction, a timeline section on the project page, and a dashboard page. No dependency is added.

## Technical Context

**Language/Version**: TypeScript on Node.js 24 Active LTS, as in Feature 001

**Primary Dependencies**: The Feature 001 set unchanged: Express, React, Prisma, Zod, bcrypt, multer, and cors. Dev: Vitest, Supertest, ESLint, Prettier, concurrently, and React Testing Library. No new package

**Storage**: PostgreSQL 17 through Prisma. Seven new tables in one migration. No file storage

**Testing**: Vitest units for the flag rules, IST date helpers, planned-date rule, responsible-party rule, and dashboard sort. Supertest for every acceptance scenario in US1 to US5. Vitest and React Testing Library for the item form, the progress form, and the dashboard empty states

**Target Platform**: Responsive web app in phone and desktop browsers. The API runs on Node.js beside PostgreSQL 17

**Project Type**: Internal web application, `api/` and `web/` in one repository

**Performance Goals**: At the stated volume of tens of projects with tens of items each, the timeline and dashboard each come back in under a second on the local database. Nothing beyond that volume is in scope

**Constraints**: Flags are never stored (FR-015). Updates, date changes, delays, and issues are append-only. Items are archived, not deleted. Archived projects are read-only for timeline data. Server-side session check and Zod validation on every route. No charts, notifications, or jobs

**Scale/Scope**: One firm, three roles with equal timeline access, five user stories, and 29 functional requirements in the spec

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Before research | After design |
| --- | --- | --- |
| I. Spec exists and lists FR-05 and FR-06. No `NEEDS CLARIFICATION` in the spec. Agent did not choose a product default | Pass. 16 decisions in Clarifications, and every Assumptions row is Confirmed or Fixed by PRD | Pass. Five questions found in design were decided by the product owner (Product decisions recorded during planning). No product decision is outstanding |
| II. Stack is TypeScript, Node LTS, Express, React, PostgreSQL 17, Prisma, Vitest, Supertest, ESLint, Prettier. Each new runtime dependency has a reason in research | Pass | Pass. No dependency added. See [research.md](./research.md) |
| II. Repository is `api/` and `web/`, with one start command that seeds | Pass | Pass. Root `npm run dev` from Feature 001, with the seed extended |
| III. Audit columns on every table. Foreign keys in the database. Changes only through committed Prisma migrations. Protected records archived | Pass | Pass. Every new table has the five audit columns. One migration, with a hand-added check constraint. See [data-model.md](./data-model.md) |
| III. Money is `DECIMAL(15,2)` and append-only | Not applicable | Not applicable. This feature stores no money |
| IV. Server checks auth and role on every route. Zod validates all input | Pass | Pass. See [contracts/http-api.md](./contracts/http-api.md) |
| V. An automated test for every acceptance scenario. Business rules tested first. CI is green. `converge` reports Converged | Pass | Pass. See [quickstart.md](./quickstart.md) and Testing strategy |
| VI. Simplest design. Responsive web only. Nothing from PRD Phase 2 or 3 | Pass. Agency dependencies, resolving coordination problems, and reminders are excluded (FR-029) | Pass. No dependency, resolution, reminder, or chart code |

No gate fails. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-timelines-delays/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── http-api.md
├── checklists/
│   └── requirements.md
└── tasks.md              # /speckit-tasks, not this command
```

### Source Code (repository root)

New files are marked `+`. Changed Feature 001 files are marked `~`. Everything else is unchanged Feature 001 code.

```text
api/
├── prisma/
│   ├── ~ schema.prisma                 # 5 enums, 7 models, back-relations
│   ├── migrations/
│   │   └── + 20261028120000_timelines_delays/migration.sql
│   └── ~ seed.ts                       # timeline seed rows
├── src/
│   ├── ~ app.ts                        # mount timeline and dashboard routers
│   ├── lib/
│   │   ├── + india-date.ts             # todayInIndia, indiaDateOf, addDays, daysBetween
│   │   ├── + timeline-flags.ts         # flagsFor(item, today)
│   │   ├── + timeline-rules.ts         # planned-date rule, responsible-party rule, project writable guard
│   │   └── + dashboard-sort.ts         # FR-022 sort orders
│   └── modules/
│       ├── + timeline/routes.ts        # items, progress, delays, issues, project timeline
│       ├── + timeline/present.ts       # item summary, responsible label, history shapes
│       ├── + dashboard/routes.ts       # GET /api/dashboard
│       └── links/~ routes.ts           # DELETE also clears responsible vendor
└── tests/
    ├── ~ helpers.ts                    # reset order and timeline factories
    ├── unit/
    │   ├── + india-date.test.ts
    │   ├── + timeline-flags.test.ts
    │   ├── + timeline-rules.test.ts
    │   └── + dashboard-sort.test.ts
    └── api/
        ├── + timeline-items.test.ts    # US1
        ├── + progress.test.ts          # US2
        ├── + flags.test.ts             # US3
        ├── + delays-issues.test.ts     # US4
        ├── + dashboard.test.ts         # US5
        └── ~ links.test.ts             # unlink clears responsible vendor

web/
├── src/
│   ├── ~ main.tsx                      # Dashboard nav link, #/dashboard, ?item= on project route
│   ├── ~ styles.css                    # flag badges, list layout at phone width
│   └── pages/
│       ├── + dashboard.tsx
│       ├── + project-timeline.tsx      # timeline list, item form, progress, delay and issue forms
│       └── ~ project-detail.tsx        # renders ProjectTimeline
└── tests/
    ├── + timeline-form.test.tsx
    ├── + progress-form.test.tsx
    ├── + dashboard.test.tsx
    └── + project-timeline-focus.test.tsx
```

**Structure Decision**: Constitution Principle II fixes `api/` and `web/`, and Feature 001 already set up the workspaces, scripts, CI, and compose file. This feature follows the Feature 001 layout. Rules that are tested first live in `api/src/lib` with no HTTP or Prisma. Routes live in one module per area under `api/src/modules`. Web screens are files in `web/src/pages`.

## Architecture

The request path is unchanged from Feature 001: the session middleware, then Zod, then the module, then Prisma.

Module boundaries:

- **timeline** owns items, date changes, responsible changes, progress updates, delays, coordination issues, and the project timeline read. It reads `projects`, `vendors`, and `vendor_project_links` to check archive flags and links, and never writes them (FR-028).
- **dashboard** is read-only. It reuses `flagsFor` and the `present` helpers from the timeline module.
- **links** (Feature 001) gains one step inside its existing `DELETE` transaction: clear the responsible vendor on that project's items and write `LINK_REMOVED` history rows. The step runs whether or not the project is archived (Product decision 1), and it touches only `responsible_kind`, `responsible_vendor_id`, and the `updated_*` audit columns. It does not call `assertProjectWritable`, which guards only the timeline routes. This is the only Feature 001 write path that changes, and its response gains `cleared_timeline_item_ids`.

No timeline code touches `work_schedules`, `task_price_entries`, `costing_sheet_files`, `vendor_notes`, or `vendor_ratings`.

Every timeline write route runs these checks in order. Each is one helper call:

1. The project exists, else 404. `assertProjectWritable`, else 409 `PROJECT_ARCHIVED`.
2. Zod body validation, which collects every field problem into one 400.
3. Cross-field rules: planned date not after deadline (added to the same 400), item on this project, item not archived.
4. Vendor rules: linked and not archived for a newly named responsible vendor, linked for each issue vendor.
5. One Prisma transaction for the write and its history rows.

## Authorization

The routes sit behind the Feature 001 `sessionMiddleware`, so every request without an active session is 401. No `requireRole` is added. All three roles may read and write timeline data (FR-024, 2026-10-28 clarification). Tests check the 401 cases and the Accountant success cases (SC-007).

## Dates and flags

`india-date.ts` is the only place that knows the time zone. `todayInIndia()` uses `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })`. Date arithmetic works on whole UTC days between `YYYY-MM-DD` values, so there is no time-of-day drift.

`flagsFor({ status, archived, deadline, lastUpdateOn }, today)` returns the flag list from three rules (FR-012 to FR-014):

- Overdue: not Done, not archived, deadline before today. Reports days overdue.
- Due soon: not Done, not archived, deadline from today to today + 7.
- Missing update: In progress, not archived, more than 7 days since the last update. Reports the last update date.

The rules are independent, and the function returns every flag that applies (Product decision 2). The dashboard puts an item in each list that matches one of its flags.

The project-archived check is applied by the callers, not by `flagsFor`: the timeline still shows flags on an archived project (Product decision 5), and the dashboard filters archived projects out.

## Error handling

Feature 001's `errorMiddleware` and `HttpError` are reused. Zod failures become 400 with `fields`. Rule refusals become 409 with a stable `code` from the contract. A missing project, item, or vendor is 404. Unknown errors become 500 with a generic message.

## Data integrity

Audit columns are set with the Feature 001 `stampCreate` and `stampUpdate` helpers. History rows are written in the same transaction as the change they describe. A failed write leaves no orphan history.

There are no update or delete routes for progress updates, date changes, responsible changes, delays, issues, or issue vendors. The Prisma client is not called with `update` or `delete` on those models anywhere in `api/src`. A unit test greps the module source to keep it that way.

The check constraint `timeline_items_responsible_ck` is `(responsible_kind = 'VENDOR') = (responsible_vendor_id IS NOT NULL)`. It is added to the generated migration SQL by hand.

## Testing strategy

Write these unit tests first in `api/tests/unit`, and leave them failing until the helpers exist:

- `india-date`: an instant at 23:59 IST and one at 00:01 IST fall on different dates. `daysBetween` across a month end.
- `timeline-flags`: deadline yesterday is Overdue 1; today, today + 7, and today + 3 are Due soon; today + 8 has no flag; Done before or after the deadline has no flag; archived has no flag; In progress last updated 8 days ago is Missing update; 7 days ago is not; Not started never updated is never Missing update; In progress, overdue, and stale returns both Overdue and Missing update; In progress, due in 3 days, and stale returns both Due soon and Missing update; no input returns both Overdue and Due soon.
- `timeline-rules`: planned date after deadline is refused, equal is allowed, absent is allowed. Responsible `VENDOR` without an id, and `FIRM_TEAM` with an id, are refused. An archived project is refused.
- `dashboard-sort`: the three sort orders and their tie-breaks, and the 10-row limit with mixed delays and issues.

Then add Supertest cases in `api/tests/api` for each acceptance scenario in US1 to US5, using the routes in [contracts/http-api.md](./contracts/http-api.md), and these extra cases:

- `links.test.ts`: unlinking on an active project clears the responsible vendor and writes `LINK_REMOVED` history. Unlinking on an archived project does the same, and the item's deadline, planned date, progress updates, date changes, delays, and issues are unchanged. After that unlink, every timeline write on the archived project is still 409 `PROJECT_ARCHIVED`. Firm team items are untouched in both cases.
- `timeline-items.test.ts`: on an archived item, edit, progress update, and attaching a delay or issue are each 409 `ITEM_ARCHIVED`, and restore succeeds (Product decision 3).
- `delays-issues.test.ts`: an issue naming an archived vendor that is still linked is saved and shows the vendor as archived (Product decision 4).
- `flags.test.ts`: an archived project's timeline returns the same flags as before it was archived, and the dashboard leaves that project out (Product decision 5).
- `flags.test.ts` and `dashboard.test.ts`: an In progress item past its deadline with an update 8 days old shows Overdue and Missing update on the timeline, and appears in both the `overdue` and `missing_update` dashboard lists. Flag cases build deadlines from `todayInIndia()` and insert backdated progress updates directly through Prisma.

Web tests cover: the item form sends the fields and shows each 400 message; the progress form sends the status; the dashboard renders four lists, each empty message, and a link to `#/projects/<id>?item=<itemId>`; `project-timeline-focus.test.tsx` checks that opening a project from that link highlights and scrolls to the selected item, including an archived one (US5-6). Phone and desktop layout, and the timed success criteria SC-001, SC-002, and SC-004, are demonstrated with the quickstart.

## Delivery

No change to `docker-compose.yml`, `.env.example`, CI, or root scripts. CI already runs lint, typecheck, migrate, and test on pull requests, so the new migration and tests run there automatically.

The seed upserts timeline rows on one seeded project, with dates relative to today in IST when it runs (data-model.md, Seed additions). Rerunning the seed does not duplicate rows.

`api/tests/helpers.ts` `resetDatabase` deletes the new tables first, children before parents, then the Feature 001 tables.

## Implementation order

The order is for `/speckit-tasks`. This command does not write application code.

1. Bring the Feature 001 code from `001-core-auth-directory` into this branch, and confirm `npm run lint`, `npm run typecheck`, and `npm test` pass before any change.
2. Prisma schema, migration with the check constraint, test reset order, and seed.
3. Unit tests, then `india-date`, `timeline-flags`, `timeline-rules`, and `dashboard-sort`.
4. US1: item create, edit, archive, restore, and date and responsible history, plus the link-removal change.
5. US2: progress updates and derived status.
6. US3: flags on the project timeline read.
7. US4: delays and coordination issues.
8. US5: dashboard route.
9. Web: timeline section, forms, dashboard page, and navigation.
10. Quickstart demonstration at phone and desktop widths, then `converge`.

## Product decisions recorded during planning

Decided by the product owner on 2026-10-28, after the first draft of this plan. Decisions 1 and 2 resolve conflicts found during design. Decisions 3 to 5 answer questions the spec left open; each was the plan's proposal, confirmed as written.

1. **Link removal on an archived project clears the responsible vendor.** When Feature 001 permits removing a vendor-project link, the link-removal transaction clears that vendor as responsible vendor on every affected item, even when the project is archived. The items and all their histories are kept. Deadlines, planned dates, progress updates, date changes, delays, coordination issues, and every other timeline field are not changed. One `LINK_REMOVED` responsible change is written for each cleared item. This is a consequence of the link-removal action only. It does not let staff edit timeline data on an archived project. Every timeline route still refuses writes there with 409 `PROJECT_ARCHIVED` (FR-025).
2. **An item can carry more than one flag.** Overdue, Due soon, and Missing update are calculated independently (FR-012 to FR-014). An item that meets several conditions shows every applicable flag and appears in each matching dashboard list. Overdue and Due soon cannot both hold for the same item, because their deadline ranges do not overlap. In practice the combinations are Overdue with Missing update, and Due soon with Missing update.

3. **An archived item cannot be changed until it is restored.** Now recorded in the spec as FR-007, FR-025, and US1-12. Editing an archived item, recording a progress update on it, and attaching a delay or coordination issue to it are refused with 409 `ITEM_ARCHIVED`. On an active project, restoring the item is allowed (FR-007). On an archived project, the project must be restored before an archived item can be restored or changed, so those requests are refused with 409 `PROJECT_ARCHIVED` (FR-025). Archived items carry no flags (FR-012 to FR-014).
4. **A coordination issue may name an archived vendor that is still linked.** Now recorded in the spec as FR-017 and US4-8. An archived vendor that is still linked is accepted, because a coordination problem may involve a vendor the firm has since stopped using. An unlinked vendor is still refused with 409 `VENDOR_NOT_LINKED`. This differs on purpose from a responsible vendor, which must not be archived (FR-004).
5. **An archived project's timeline still shows flags.** Now recorded in the spec as FR-015 and US3-8. The read-only timeline of an archived project shows flags calculated for today, by the same rules as any project. The dashboard still leaves archived projects out (FR-021). After a restore, flags keep reflecting today (Edge Cases).

## Unresolved items

No product decision is outstanding. The two items below record how the plan reads the spec and handles the branch, so implementation does not invent a second rule.

6. **"Active project" means not archived.** Feature 001 also has a project status named Active. This feature's "active project" means `archived = false`, for every status (Edge Cases: On hold and Completed do not pause detection).
7. **Branch base.** This branch was cut from `main`, which does not yet have the Feature 001 code. Implementation order step 1 handles it. If Feature 001 merges to `main` first, step 1 becomes a rebase onto `main`.

## Complexity Tracking

No constitution violation requires a justification. No new service, dependency, job, or Phase 2 module is introduced.
