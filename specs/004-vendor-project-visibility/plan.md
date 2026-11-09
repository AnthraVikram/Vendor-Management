# Implementation Plan: Vendor–Project Visibility, Project Tracking and Dashboard Views

**Branch**: `004-dashboard` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-vendor-project-visibility/spec.md`

## Summary

This feature makes the data the firm already records easy to see and act on:

- **Assignments both ways**: a vendor's profile lists its projects, and a project lists its vendors with phone, contact person, categories and an assignment status. The status is worked out from the vendor's timeline items on that project, never typed in.
- **Past assignments**: removing a vendor from a project keeps the assignment as a read-only past record with who removed it and when. A returning vendor gets a new assignment.
- **Project tracking**: projects get optional start and expected completion dates entered by staff. Progress is "N of M items done", and health is Completed, Delayed or Ongoing. Items due after the project's expected completion date are pointed out.
- **Dashboard**: open items fall into non-overlapping groups (Overdue, Due today, Coming soon, Upcoming 8 to 30 days, and All), with filters and sorting. A new section lists projects needing attention. The Feature 002 lists and the Feature 003 tiles stay.
- **Usability**: a top-right profile menu, one confirmation message region, plain error messages, consistent badges, and the empty states in FR-031.
- **Seed**: 10 fictional vendors and 4 projects showing every new state, still find-or-create.

The technical approach is deliberately small:

- **One migration**: two optional date columns on `projects`, two removal columns on `vendor_project_links` with a partial unique index, and three history actions.
- **Three pure rule libraries**: assignment status, deadline groups, and project health and progress.
- **Additive API changes**: every existing response key keeps its meaning.
- **Web changes**: in the existing pages. No new dependency.

## Technical Context

**Language/Version**: TypeScript on Node.js 24 Active LTS, as in Features 001 to 003

**Primary Dependencies**: The existing set: Express, React, Prisma, Zod, bcrypt, multer, cors and exceljs. No addition (research.md §13)

**Storage**: PostgreSQL 17 through Prisma. One migration, `20261108120000_vendor_project_visibility`: `projects.start_date` and `projects.expected_completion_date` (`DATE`, nullable), `vendor_project_links.removed_at` and `removed_by`, a partial unique index for current assignments, two check constraints, and three `HistoryAction` values (data-model.md)

**Testing**:
- Vitest unit tests, written first, for `assignment-status`, `deadline-groups` and `project-health`.
- Supertest for every acceptance scenario in User Stories 1 to 6 and 8 that the API can prove.
- Vitest and React Testing Library for the pages, including User Story 7.

**Target Platform**: Responsive web app in phone (375 px) and desktop (1280 px) browsers. The API runs on Node.js beside PostgreSQL 17

**Project Type**: Internal web application, `api/` and `web/` in one repository

**Performance Goals**: The vendor directory, a vendor profile, the project directory, a project page and the dashboard each return in under 2 seconds with 200 vendors and 10 active projects of 30 items each (NFR-001). Each is a handful of Prisma queries, with the rules applied in memory

**Constraints**:
- No stored derived values.
- Assignments are never deleted, and past assignments are read-only.
- Every existing response key keeps its meaning.
- Every route keeps the session check, and Zod validates every new input.
- No new background job, notification or dependency.

**Scale/Scope**: One firm and three roles. The spec has 8 user stories, 40 functional requirements (FR-001 to FR-040, plus lettered sub-requirements), 5 non-functional requirements and 9 success criteria

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution version 1.1.0.

| Gate | Before research | After design |
| --- | --- | --- |
| I. Spec and plan before code. The spec lists FR-01, FR-03, FR-04, FR-05, FR-06 and FR-15. No `NEEDS CLARIFICATION`. Agent chose no product default | Pass. All 8 open questions were answered by the product owner on 2026-11-08 | Pass. Design choices are technical only (research.md). No product question is outstanding |
| I. One feature, one branch | Pass. Branch `004-dashboard` from `main` (research.md §14) | Pass |
| II. Fixed stack. A new runtime dependency needs a reason in research | Pass | Pass. None added |
| II. `api/` and `web/`, one start command that seeds | Pass | Pass. `npm run dev` unchanged, seed extended |
| III. Audit columns on every table, database foreign keys, committed Prisma migrations | Pass | Pass. No new table. `removed_by` has a foreign key to `staff_users`. Check constraints are in the migration |
| III. Protected records archived, not deleted | Pass | Pass. Assignments move from hard delete to a kept past record. The append-only test bans `vendorProjectLink.delete` and `deleteMany` |
| III. Money rules | Not touched | Not touched. No money column, and the advance tiles are unchanged |
| IV. Server checks auth and role on every route. Zod on all input | Pass | Pass. No new route, so the existing session middleware covers everything. New body and query fields are in Zod schemas. Permissions are unchanged (FR-036, FR-037) |
| V. A test for every acceptance scenario, business rules tested first, CI green, `converge` Converged | Pass | Pass. See Testing strategy and [quickstart.md](./quickstart.md) |
| VI. Simplest design, responsive web only, nothing from PRD Phase 2 or 3 | Pass. Gantt deferred (FR-023b); no dependencies, reminders or procurement | Pass. Derived values are pure functions, filters run in the browser, and there is no job or cache |

No gate fails. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-vendor-project-visibility/
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

New files are marked `+`. Changed files are marked `~`.

```text
api/
├── prisma/
│   ├── ~ schema.prisma                         # projects dates, link removal, HistoryAction values
│   ├── migrations/
│   │   └── + 20261108120000_vendor_project_visibility/migration.sql
│   └── ~ seed.ts                               # 10 vendors, 4 projects, every state (data-model.md)
├── src/
│   ├── lib/
│   │   ├── + assignment-status.ts              # FR-010 rule order
│   │   ├── + deadline-groups.ts                # FR-018 groups
│   │   └── + project-health.ts                 # progress, health, after-completion, attention reasons
│   └── modules/
│       ├── ~ links/routes.ts                   # removal keeps the row, refusals on past rows, history
│       ├── + links/statuses.ts                 # assignmentStatuses(): loads items, applies assignment-status
│       ├── ~ projects/routes.ts                # dates, list filters and figures, detail additions
│       ├── + projects/figures.ts               # projectFigures(): shared by list, detail, dashboard
│       ├── ~ vendors/routes.ts                 # current and past links, project_count, statuses
│       ├── ~ schedules/routes.ts               # requireLinked: current assignments only
│       ├── ~ timeline/routes.ts                # linked checks current only; after_project_completion
│       └── ~ dashboard/routes.ts               # + items, + attention_projects; old keys unchanged
└── tests/
    ├── unit/
    │   ├── + assignment-status.test.ts
    │   ├── + deadline-groups.test.ts
    │   ├── + project-health.test.ts
    │   └── ~ append-only.test.ts               # vendorProjectLink never deleted
    └── api/
        ├── + assignments.test.ts               # US1, US3, US4
        ├── ~ projects.test.ts                  # US5: dates, filters, figures, completed_on
        ├── ~ vendors.test.ts                   # project_count, links and past_links, linked filter
        ├── ~ dashboard.test.ts                 # US6: groups, items, attention
        ├── ~ timeline-items.test.ts            # past vendor cannot be responsible; marker
        ├── ~ schedules.test.ts                 # past vendor cannot be scheduled
        ├── ~ history.test.ts                   # assignment events on both targets
        └── + seed.test.ts                      # US8: seed twice, counts unchanged, every state present

web/
├── src/
│   ├── + notify.ts                             # notify(message) → one status region
│   ├── ~ main.tsx                              # header profile menu, status region
│   ├── ~ api/client.ts                         # plain 403 and 500 messages
│   ├── ~ badges.tsx                            # AssignmentStatusBadge, HealthBadge
│   ├── ~ styles.css                            # header, progress bar, group tabs, badges
│   └── pages/
│       ├── ~ vendors.tsx                       # list columns, empty states
│       ├── ~ vendor-detail.tsx                 # grouped sections, Projects, Past projects
│       ├── ~ projects.tsx                      # columns, search, filters, form fields and dates (T078)
│       ├── ~ project-detail.tsx                # overview, vendor cards, Past vendors, edit form
│       ├── ~ project-timeline.tsx              # "After project completion date" marker
│       ├── ~ dashboard.tsx                     # groups, filters, sort, attention section
│       └── ~ history-panel.tsx                 # labels for the three new actions
└── tests/
    ├── + vendor-detail.test.tsx
    ├── + vendors-list.test.tsx
    ├── + project-vendors.test.tsx
    ├── + projects-list.test.tsx
    ├── + project-overview.test.tsx
    ├── + profile-menu.test.tsx
    ├── + client-errors.test.tsx
    ├── ~ dashboard.test.tsx                    # rewritten for the groups (supersedes 002 FR-020, FR-021)
    └── ~ history-panel.test.tsx                # new action labels
```

**Structure Decision**: Constitution Principle II fixes `api/` and `web/`. The layout follows Features 001 to 003:
- Rules tested first live in `api/src/lib` with no HTTP or Prisma.
- Routes live in one module per area.
- Screens are files in `web/src/pages`.

The only new module file, `projects/figures.ts`, exists so the project list, the project page and the dashboard work out the same figures with one function.

## Architecture

The request path is unchanged: session middleware, then Zod, then the module, then Prisma. There is no new route.

### Assignments

- **Readers**: every reader of `vendor_project_links` filters `removedAt: null`, except where past assignments are shown (research.md §4).
- **Remove** (`DELETE /links/:id`): one transaction.
  1. Lock the link row `FOR UPDATE`. A past assignment gives 409 `ALREADY_REMOVED`.
  2. Archive the pair's schedules and clear the responsible vendor on the project's items. Both steps are unchanged from Features 001 and 002.
  3. Set `removed_at`, `removed_by` and the update stamps.
  4. Write the two `UNASSIGNED` history entries.

  Two concurrent removals therefore give one 200 and one 409.
- **Edit**: locks the row, refuses a past assignment, updates, and writes `ASSIGNMENT_EDITED` entries only when `diffFields` finds a change.
- **Assign**: checks for a current pair, creates the row, and writes the `ASSIGNED` entries, in one transaction. A P2002 from the partial unique index is caught and returned as 409 `LINK_EXISTS`.
- **Status**: the vendor and project routes load the relevant non-archived items with `itemInclude`, group them by vendor or project, and call `assignmentStatus(items.map(i => ({ status: currentState(i).status, overdue: flagsOf(i).some(f => f.type === 'OVERDUE') })))`.

### Projects

- **Create and edit**:
  - `projectSchema` gains the two dates, parsed with the existing India date helpers.
  - A refinement uses the stored value for a date not sent and checks the order.
  - `EDITED_FIELDS` and `projectSnapshot` gain both dates, so changes are recorded in history.
- **`projectFigures(rows, today)`** (`projects/figures.ts`): takes projects loaded with their non-archived items (`itemInclude`) and a `_count` of current links. It returns progress, overdue count, next deadline, health, after-completion count and attention reasons, using `lib/project-health.ts`.
  - The list route applies `q` in the Prisma `where` and `has_overdue` and `due_within_7` on the figures.
  - The detail route adds `upcoming`, `completed_on` (history lookup, research.md §7) and the enriched `links` and `past_links`.
- **Timeline**: `GET /projects/:projectId/timeline` adds `after_project_completion` per item from the project it already loads.

### Dashboard

`GET /dashboard` reuses its existing item query and adds two keys:
- `items`: each open item with `deadlineGroup(...)`, status, last update and responsible party.
- `attention_projects`: from `projectFigures` over active projects with at least one reason.

The Feature 002 keys are built exactly as today. The page uses the new keys for the groups, filters, sort and attention section, and the old `missing_update` and `recent_delays_and_issues` lists as before.

### Web

- **Profile menu**: the account block moves from the sidebar into a top-right header button showing the person's name. Its panel holds name, role, email, the change-password form and Sign out (FR-024, research.md §11).
- **Messages**: `notify()` plus one `role="status"` region carries confirmations (FR-026). `api/client.ts` replaces 403 and 500 messages with plain wording (FR-027).
- **Badges**: `badges.tsx` gains assignment-status and health badges that always show text (FR-028, FR-029).
- **Directory**: the vendor list shows contact person, categories and project count.
- **Vendor profile**: grouped sections (FR-003), then Projects and Past projects.
- **Projects list**: shows the figures with search and two filters. Its form gains client name, site location, description and the two dates (Feature 001 T078).
- **Project page**: starts with the overview. It shows vendor cards with contact details and a link to the vendor, Past vendors, and an edit form.
- **Dashboard**: one control picks the group. Filters and sort apply to it, and the attention section sits above the groups.
- **Empty states**: each list shows its FR-031 message.

## Authorization

There is no permission change (FR-036, FR-037). All routes stay behind the Feature 001 `sessionMiddleware`. Assigning, editing, removing and entering dates stay open to all three roles, as link and project edits are today (Feature 001 FR-010). Advance amounts keep their Feature 003 gate. Tests cover a signed-out caller on every changed route and each role on remove and on project dates.

## Error handling

The existing `HttpError` and `errorMiddleware` are reused:
- Zod failures return 400 with `fields`.
- New 409 codes: `ASSIGNMENT_REMOVED` and `ALREADY_REMOVED`.
- The links module maps P2002 on the current-assignment index to `LINK_EXISTS` before the generic `CONFLICT` mapping can apply.

## Data integrity

- Audit columns are set with `stampCreate` and `stampUpdate`.
- History rows are written in the same transaction as their change.
- Check constraints are added by hand to the migration SQL: `projects_dates_ck` and `vendor_project_links_removed_ck`. The partial unique index `vendor_project_links_current_key` replaces the old unique index.
- `append-only.test.ts` adds `vendorProjectLink` to the never-deleted models. As in Features 002 and 003, the test also proves the pattern can fail.
- The migration adds only nullable columns and enum values. No existing row changes.

## Testing strategy

### Unit tests, written first

Write these in `api/tests/unit` and leave them failing until each library exists:

- **assignment-status**: each of the five rules, plus:
  - mixed Done, In progress and Overdue gives Delayed
  - Done and Not started gives In progress
  - all Done, including one finished late, gives Completed
  - an empty list gives No activities
- **deadline-groups**: yesterday, today, +1, +7, +8, +30 and +31 days.
- **project-health**:
  - health for Completed (with past dates and overdue items)
  - health when the date is today, yesterday or absent
  - progress with 0 items and with archived items excluded
  - `isAfterCompletion` with the deadline equal to the date and one day after it, a Done item, and no date
  - attention reasons for Delayed with overdue items, Ongoing with overdue items, Ongoing with none, and Completed with overdue items

### API tests

Add Supertest cases in `api/tests/api` for every API-provable acceptance scenario, using [contracts/http-api.md](./contracts/http-api.md):

- `assignments.test.ts`:
  - US1-1 to US1-8: counts, archived project excluded from the count, phone change visible on the project
  - US3-1 to US3-6: each situation in the spec table, and a status in a PATCH body refused with 400
  - US4-1 to US4-9: past rows, both history targets, reassignment, refusals, and removal on archived records
  - concurrency: two parallel removals give one 200 and one 409, and two parallel assignments of the same pair give one 201 and one 409
- `projects.test.ts`:
  - US5-1 to US5-5 and US5-9 to US5-15
  - date validation, including changing only one date
  - `completed_on` from history, and `null` for a project created Completed
  - figures for archived items
- `vendors.test.ts`: `project_count`, current and past `links`, and the `project_id` filter ignoring past assignments.
- `dashboard.test.ts`:
  - US6-1 to US6-6, US6-12, US6-13 and US6-16 to US6-19
  - no item in two dated groups
  - the Feature 002 keys unchanged
- `timeline-items.test.ts` and `schedules.test.ts`: a vendor with only a past assignment is refused as responsible party, in coordination issues, and for scheduling.
- `history.test.ts`: assignment events appear once on each target.
- **Every changed route**: a signed-out call gives 401 (SC-008).

### Web tests

These cover:
- vendor profile sections, Projects and Past projects, and the empty state
- project list columns, search and filters
- project overview with health, progress, "No activities yet" and "Completed on"
- dashboard groups, filters, sort, empty group message, attention section and links (US6-7 to US6-11, US6-14, US6-15)
- the profile menu (US7-1 to US7-4)
- the confirmation region and client error mapping (US7-5 to US7-8)
- every FR-031 empty message (US7-9)

### Superseded tests

`web/tests/dashboard.test.tsx` is rewritten for the five groups. Its Feature 002 cases for the Overdue and Due soon lists cite the supersession of Feature 002 FR-020 and FR-021 in the spec's Backward Compatibility table. Its Missing update and recent-records cases are kept. No other Feature 001 to 003 test changes meaning, because the API changes are additive and `links` keeps listing current assignments (SC-006).

### Demonstration

Phone and desktop layout, and the timed criteria SC-001, SC-002 and SC-004, are demonstrated with the quickstart.

## Delivery

- **Changes**: one migration and the seed. No change to dependencies, `docker-compose.yml`, `.env.example`, CI or root scripts. CI already runs lint, typecheck, migrate and test.
- **Feature 001 records**: when the vendor profile shows links (FR-001) and the project form gains its fields (T078), Feature 001's `tasks.md` records the correction against FR-015, US4-3 and T078, as the spec's Backward Compatibility section states.
- **Graph**: after code changes, run `graphify update .` (CLAUDE.md).

## Implementation order

The order is for `/speckit-tasks`. This command does not write application code.

1. Confirm the `main` baseline on `004-dashboard` passes `npm run lint`, `npm run typecheck` and `npm test` before any change.
2. Prisma schema and migration (dates, link removal, partial index, check constraints, enum values), then regenerate the client.
3. Unit tests, then `assignment-status`, `deadline-groups` and `project-health`.
4. Every link reader treats only current assignments as linked (research.md §4), replacing the compound key `vendorId_projectId`. After this step the Feature 001 and 002 suites are green again.
5. US1 and US3: current and past links with statuses on the vendor and project routes, and `project_count`.
6. US4: the links module keeps the row on removal, refuses changes to past assignments, and writes history on both targets. Past assignments appear in responses, and reassignment works.
7. US5: project dates, `projectFigures`, the list filters, the detail additions, `completed_on` and the timeline marker.
8. US6: dashboard `items` and `attention_projects`.
9. Web: badges, `notify`, the client error mapping and the profile menu (US7), then vendor pages (US1, US2), project pages (US5, T078), the timeline marker, the dashboard (US6), history labels and empty states.
10. US8: seed extension. Run it twice and compare counts.
11. Quickstart demonstration at both widths, update Feature 001's `tasks.md` for the corrections, then `/speckit-converge`.

## Product decisions recorded during planning

None were needed. Every product decision was made in `/speckit-clarify` on 2026-11-08 and is recorded in the spec.

## Unresolved items

None for this feature. Feature 001's open product-owner questions T092, T093 and T094 stay with Feature 001, as the spec records. T093 (vendor edit as a full or partial update) does not affect this feature, because project and link edits keep their current conventions.

## Complexity Tracking

No constitution violation requires a justification. No dependency, service, job or Phase 2 or 3 module is introduced.
