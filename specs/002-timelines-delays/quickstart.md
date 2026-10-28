# Quickstart: Timelines and Delays

Validation guide for [spec.md](./spec.md). Routes and bodies are in [contracts/http-api.md](./contracts/http-api.md). Fields and rules are in [data-model.md](./data-model.md). This guide has no implementation code.

## Prerequisites

The Feature 001 prerequisites, start command, `.env`, and seed accounts apply unchanged. See the [Feature 001 quickstart](../001-core-auth-directory/quickstart.md).

This branch must contain the Feature 001 code from `001-core-auth-directory` before anything below works (plan.md, Implementation order step 1).

## Start

```text
npm install
npm run dev
```

The command applies the new timeline migration after the Feature 001 migration and loads the extended seed. One seeded project then has an Overdue item, a Due soon item, a Missing update item, a Done item past its deadline, a Firm team item, one delay, and one coordination issue. Seed dates are relative to today in India Standard Time.

## Checks that must pass before merge

```text
npm run lint
npm run typecheck
npm test
```

CI runs the same three. A red result blocks merge (Constitution Principle V). `converge` must report Converged before the pull request opens.

## API scenarios

Sign in as `office@example.com` unless a step says otherwise. "D+n" means today in IST plus n days.

1. On an active project with one linked vendor, create a milestone with deadline D+20, and an activity with deadline D+10 and that vendor responsible. `GET /timeline` lists the activity first, both `NOT_STARTED`. The vendor and the link are unchanged (US1-1, US1-2).
2. Create an item with responsible `NONE`, and another with `FIRM_TEAM`. Labels are "No responsible party" and "Firm team" (US1-3, US1-10).
3. Name an unlinked vendor, then an archived linked vendor. Each is 409 with `VENDOR_NOT_LINKED` or `VENDOR_ARCHIVED` (US1-4).
4. Post an item with no name, no type, no deadline, and a planned date after its deadline. One 400 names every field. Nothing is saved (US1-5).
5. Change the activity's deadline three times. `GET /timeline-items/:id` shows three date changes with author and time (US1-6, SC-005).
6. Archive the milestone. It moves to `archived_items` and leaves the dashboard. Editing it, recording a progress update on it, and attaching a delay or issue to it each return 409 `ITEM_ARCHIVED`. Restore it (US1-7, plan.md Product decision 3).
7. Remove the vendor's link. The activity shows "No responsible party". Its responsible changes include `LINK_REMOVED` by the caller. Its updates and date history are unchanged. The Firm team item is unchanged (US1-9).
8. Record In progress with a note, then Done, then In progress. The item shows In progress. All three updates are listed newest first with author (US2-1 to US2-4). Post status `PAUSED`. The response is 400 (US2-5).
9. Create items with deadlines D−1, D, D+3, D+7, and D+8, and a Done item with deadline D−7. Add two more items with deadline D+30, and insert an In progress update dated D−8 on one and D−7 on the other. Flags are Overdue (1 day), Due soon, Due soon, Due soon, none, none, Missing update, and none (US3-1 to US3-4, SC-003). Then add an item with deadline D−2 and an In progress update dated D−8. It shows both Overdue (2 days) and Missing update (plan.md, Product decision 2).
10. Move the D−1 item's deadline to D+2. Overdue clears to Due soon, and the old deadline is still listed. Record an update on the Missing update item. The flag clears (US3-5, US3-6).
11. Record a delay on the overdue activity, and a coordination issue naming its linked vendor. Both appear on the item and on the project timeline with author and date. The vendor's notes and rating are unchanged (US4-1, US4-2). Archive a second linked vendor and name it on an issue. The issue is saved and shows the vendor as archived (plan.md, Product decision 4).
12. Post a delay with a blank reason, an issue with no description, an issue naming an unlinked vendor, and a delay with an item from another project. The responses are 400, 400, 409 `VENDOR_NOT_LINKED`, and 409 `ITEM_NOT_ON_PROJECT` (US4-3, US4-4, US4-7).
13. Record a delay with no item. It appears on the project with no item named (US4-6). Change the item's deadline and mark it Done. Its delay stays listed (US4-5).
14. With two non-archived projects that each have an overdue item and a delay, and an archived project with an overdue item, `GET /api/dashboard`. Both projects' items and delays are listed. The archived project's item is not. Overdue is sorted by days overdue, most first. Recent entries are at most 10, newest first (US5-1 to US5-4). The item from step 9 with two flags is listed in both Overdue and Missing update.
15. Archive a project. Every timeline write on it returns 409 `PROJECT_ARCHIVED`, and `GET /timeline` still returns all its history, with flags calculated for today (plan.md, Product decision 5). Restore it. Writes work again (US1-8, FR-025, SC-006).
16. On a project with an item whose responsible vendor is linked, plus a progress update, a changed deadline, a delay, and an issue naming that vendor, archive the project. Then remove the vendor's link. The item shows "No responsible party", with a `LINK_REMOVED` responsible change by the caller. Its deadline, planned date, progress updates, date changes, delay, and issue are unchanged, and the issue still names the vendor. A timeline write on the project is still 409 `PROJECT_ARCHIVED` (plan.md, Product decision 1).
17. Repeat steps 1, 8, and 11 as `accountant@example.com`. They succeed. Call any route here with no cookie, or with a revoked user's cookie. The response is 401 (FR-024, SC-007).

Each step maps to a Supertest case. Unit tests for the flag rules, the IST date helpers, and the planned-date rule are written first and must fail before the code exists.

## Web scenarios

1. Open a project and add an activity with a deadline and a responsible vendor. Time it: under 1 minute (SC-001).
2. From the project page, record a progress update. Time it: under 30 seconds (SC-002).
3. Record a delay on that item.
4. Open the dashboard. Each of the four lists shows entries or says it is empty (US5-5). Select an Overdue entry. The project opens at that item (US5-6).
5. Add overdue items across 10 non-archived projects. Then name every overdue item, its project, and its responsible party from the dashboard in under 1 minute (SC-004).

Repeat 1 to 4 at a narrow phone width and at a desktop width (SC-008).

## Done for a scenario

Its automated test passes and the matching step above has been performed on the running app. A passing typecheck alone does not finish it.
