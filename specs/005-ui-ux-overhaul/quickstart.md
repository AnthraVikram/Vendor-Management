# Quickstart: Feature 005 UI/UX Overhaul

Validation guide for [spec.md](./spec.md). Routes are in [contracts/http-api.md](./contracts/http-api.md); tables in [data-model.md](./data-model.md).

## Prerequisites

The Feature 001 prerequisites, `.env` and seed accounts apply. The development database must already have the Feature 004 migration (applied 2026-11-09).

## Automated checks

```text
npm run lint
npm run typecheck
npm test
npm run build -w web
```

Expected: all green; Feature 001 to 004 suites pass apart from cases the plan lists as superseded.

## Migration and startup

The Feature 005 migration, `api/prisma/migrations/20261109120000_project_sections/migration.sql`, was reviewed by the product owner and applied to the development database under T047 (2026-11-10). It adds tables and enum values and inserts no rows. Never run `prisma migrate reset` or `db push` against the development database. Do not use `npm run dev`: it runs `docker compose up -d`, `prisma migrate deploy` and the seed against the development database (T046).

Start the app this way:

1. Start Docker Desktop, then the existing database container: `docker start vendor-management-db-1`. Its data lives in an anonymous volume; never remove or recreate the container.
2. Start the API from `api/`: `npx tsx --env-file=../.env src/server.ts` (port 4000). The development settings reach only this process.
3. Start the web app from the repository root: `npm run dev -w web` (port 5173; it forwards `/api` to the API).

Never run the API tests in a shell where the development `DATABASE_URL` is set; without it they use their own embedded test database.

## Scenarios

Run each at 375 px, 768 px and 1280 px. Sign in as `office@example.com` unless stated.

1. **Lists first (US1)**: open Vendors and Projects. The list shows first, the add form is closed. Add vendor opens the form and focuses Name. Type, then click Dashboard: a confirmation asks before leaving. Sort Projects by progress, leave and return: the sort is kept; the search box is empty. More than 50 records show **Show more**.
2. **Sections (US2)**: create a project. It has 15 sections in the FR-012 order. Rename, reorder, add "Landscaping", remove "Budget & Costing", then restore it (it returns last with its notes). Open another project: unchanged. Open Lake House (created before this feature): no sections, **Use the standard blueprint** adds 15.
3. **Section vendors (US2)**: in Execution, assign a vendor not on the project: the toast says "Vendor assigned to project and to Execution" and the vendor appears in the project's Vendors list. Assign the same vendor to Site Coordination. Remove the vendor from the project: both section assignments end. Check the project and vendor histories.
4. **Dashboard (US3)**: compare each count with the list it opens. Each percentage equals done over total items on the project page. Add project opens Projects with the form open.
5. **Archived (US4)**: archive a vendor (the dialog says nothing is deleted). It moves to the Archived view, muted and badged, and still appears in its projects' sections marked archived. Restore it.
6. **Profile and switching (US5)**: the icon shows initials. Switch user, confirm, sign in as `accountant@example.com`: the icon and menu show the Accountant; Staff stays hidden.
7. **Visual system (US6)**: every page uses white surfaces, black navigation, yellow primary buttons and focus rings. Tab through a page: focus is always visible.
8. **Search and orientation (US7)**: type "meh" in the header search and open Mehta Carpentry; the breadcrumb reads "Vendors / Mehta Carpentry". Dates read like "9 Nov 2026".

Record results, timings (SC-002, SC-003) and any difference under the quickstart task in `tasks.md`.

## Walkthrough (T049 for SC-005; with the SC-002 and SC-003 timings for T048)

Owner-approved procedure (2026-11-10). It applies the spec's criteria and adds no requirement.

### What it assesses

| Criterion | Exercise | Target | Decides |
|---|---|---|---|
| SC-005 | Tasks 1 to 5 | At least 4 of 5 completed without help; no time limit | T049, and nothing else decides T049 |
| SC-002 | A | Says which vendor is responsible for a named section within 20 seconds of opening the project | T048 (recorded separately) |
| SC-003 | B | Renames, reorders and adds a section in one project and confirms a second project is unchanged, in under 2 minutes | T048 (recorded separately) |

### Participant and accounts

A staff member who has never used the system, signed in by the observer as Office Team (`office@example.com`) before the session. Task 5 uses `accountant@example.com`. All three roles may do every task (Feature 001 FR-010, FR-046). The observer holds both demonstration passwords from `.env` and hands over the Accountant password only at task 5; passwords are never written on the sheet.

### Before the session

1. Start the app as in [Migration and startup](#migration-and-startup); do not use `npm run dev`.
2. Check the data with a read-only query (Windows PowerShell; read-only through the session setting, the read-only transaction and SELECT-only statements):

   ```powershell
   docker exec -e "PGOPTIONS=-c default_transaction_read_only=on" vendor-management-db-1 psql -X -U vendor -d vendor -v ON_ERROR_STOP=1 `
     -c "BEGIN TRANSACTION READ ONLY" `
     -c "SELECT name, archived FROM vendors WHERE name IN ('Bose Colour Works', 'Joseph Woodcraft', 'Khan Ceiling Systems') ORDER BY name" `
     -c "SELECT name AS walkthrough_project FROM projects WHERE name ILIKE 'Walkthrough%' ORDER BY name" `
     -c "SELECT count(*) AS lake_house_projects FROM projects WHERE name = 'Lake House'" `
     -c "SELECT v.name AS execution_vendor, v.archived FROM projects p JOIN project_sections s ON s.project_id = p.id AND s.removed_at IS NULL JOIN section_assignments sa ON sa.section_id = s.id AND sa.removed_at IS NULL JOIN vendors v ON v.id = sa.vendor_id WHERE p.name = 'Lake House' AND s.name = 'Execution' ORDER BY v.name" `
     -c "COMMIT"
   ```

   Expected: three vendor rows (Bose Colour Works, Joseph Woodcraft, Khan Ceiling Systems), each `f`; no Walkthrough project; `lake_house_projects` 1; exactly one Execution vendor, `Mehta Carpentry | f`. Current section assignments have `removed_at` empty; there is no `ended_at` column. If a card's vendor is missing or archived, or Lake House's Execution answer is not exactly Mehta Carpentry, stop and resolve it before the session. If "Walkthrough 1" exists, choose another unused name and use it on cards 2, 3 and B.
3. Leave the demonstration data and the T048 project as they are. The session adds permanent records (a project and its sections, a section assignment and project assignment, an archive and restore, the section changes in B, and history entries).
4. Use a fresh private browser window at 1280 px, signed in as Office Team, on the Dashboard.

### Observing

- Read each card exactly as written. Give no hints during tasks 1 to 5; if the participant asks and is helped, the task is "completed with help".
- Record one outcome per exercise: **W** completed without help, **H** completed with help, **U** unable to complete (gave up or stopped while stuck), **E** ended by the observer while the participant was still working.
- The observer may end an exercise after about 5 minutes to keep the session moving. This is an observer convenience, not an acceptance rule; such an exercise is recorded as E. Only W counts towards SC-005.
- Record the time of every exercise, the mistakes (actions undone, error messages, wrong saves) and any confusion (pauses of about 10 seconds or more, going back and forth, "where is …").
- Do not correct the data between exercises.

### Order and cards

| Order | Exercise | Card (read aloud) | Success | Timing |
|---|---|---|---|---|
| 1 | A (SC-002) | "Open the project Lake House. Tell me which vendor is responsible for its Execution section." | Answers "Mehta Carpentry" | Start when the participant begins opening Lake House (the first click or keystroke towards it), not when the page has loaded; stop at the answer. Pass: 20 seconds or less |
| 2 | Task 1 (SC-005) | "Find the vendor Khan Ceiling Systems and open their details." | Khan Ceiling Systems' page is open | Recorded only |
| 3 | Task 2 (SC-005) | "Add a new project called 'Walkthrough 1'." | "Project created"; Walkthrough 1 is listed | Recorded only |
| 4 | Task 3 (SC-005) | "In the project Walkthrough 1, make Joseph Woodcraft responsible for the Execution section." | Joseph Woodcraft is under Execution; "Vendor assigned to project and to Execution" | Recorded only |
| 5 | Task 4 (SC-005) | "Archive the vendor Bose Colour Works. Then bring it back." | Archived, then restored ("Vendor restored"); back in the Active list | Recorded only |
| 6 | B (SC-003) | "In Walkthrough 1, rename the section 'Snagging' to 'Snag list', move 'Completion' up one place, and add a section called 'Handover'. Then check that Lake House's sections have not changed." | All three changes saved (the order with **Save order**) and Lake House confirmed | Start when the card has been read; stop when Lake House is confirmed. Pass: under 2:00 |
| 7 | Task 5 (SC-005) | "Your colleague, the accountant, needs to use this computer. Switch so the accountant is signed in." | The Accountant is signed in; the icon shows "AA" | Recorded only |

B runs after task 4 and before task 5, so the participant is still Office Team while editing sections; task 5 is last.

### Results sheet

Participant (initials) ____ Date ____ Observer ____ Screen width ____

| Order | Exercise | Outcome (W/H/U/E) | Time (m:ss) | Mistakes | Confusion and notes |
|---|---|---|---|---|---|
| 1 | A: SC-002 | | | | |
| 2 | Task 1: find a vendor | | | | |
| 3 | Task 2: add a project | | | | |
| 4 | Task 3: assign a vendor to a section | | | | |
| 5 | Task 4: archive and restore a vendor | | | | |
| 6 | B: SC-003 | | | | |
| 7 | Task 5: switch user | | | | |

### Assessment

| Criterion | Target | Result | Pass/fail |
|---|---|---|---|
| SC-005 (T049) | At least 4 of tasks 1 to 5 marked W | ___ of 5 | PASS / FAIL |
| SC-002 (T048) | Correct answer, 20 seconds or less from starting to open the project | ___ s | PASS / FAIL / not run |
| SC-003 (T048) | All three changes saved and Lake House confirmed, under 2:00 | ___ m:ss | PASS / FAIL / not run |

Record the sheet under T049 (SC-005) and T048 (SC-002, SC-003) in `tasks.md`. T049 is checked only when SC-005 has been assessed and passed; T048 only when SC-002 and SC-003 have both been assessed and passed.
