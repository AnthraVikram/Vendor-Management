# Quickstart: Core Auth and Directory

Validation guide for the feature in [spec.md](./spec.md). Contracts are in [contracts/http-api.md](./contracts/http-api.md). Fields and relationships are in [data-model.md](./data-model.md). This guide does not contain implementation code.

## Prerequisites

- Node.js 24
- npm
- Docker, for the PostgreSQL 17 container

Copy `.env.example` to `.env`. Fill the local database URL, session secret, file storage directory, and seed passwords. Do not commit `.env`.

## Start

From the repository root:

```text
npm install
npm run dev
```

`npm run dev` starts PostgreSQL 17, applies the committed Prisma migrations, loads seed data, and starts the API and the web app. The web app is the only UI. The API is not a public document host.

Seed accounts, passwords from `.env`:

| Email | Role |
| --- | --- |
| admin@example.com | Administrator |
| office@example.com | Office Team |
| accountant@example.com | Accountant |

Seed data also includes categories, vendors across those categories and locations, two projects, one vendor linked to both projects, two schedules for that vendor with different fixed prices, and one schedule with a sample PDF costing sheet.

## Checks that must pass before merge

```text
npm run lint
npm run typecheck
npm test
```

CI runs those three against a PostgreSQL 17 service. A failure blocks merge.

## API scenarios

Use the cookie from `POST /api/auth/login`. Expected bodies are in the contract.

1. Sign in as `office@example.com`. Create a vendor with name, phone, and a category. Search `q` and filter by that category and a location. The vendor is returned.
2. Omit the phone. The response is 400 and names the field. The vendor is not created. Send each case below as its own request, with every other required field present:
    - **Missing phone:** omit `phone`. The response is 400 with `fields.phone` set (contract example: `"Phone is required."`).
    - **Missing name:** omit `name`. The response is 400 with `fields.name` set.
    - **Missing category:** omit `category_ids`, then send `category_ids: []`. Each response is 400 with `fields.category_ids` set.

    Every response body has the contract's validation shape, `{ "message": "Check the highlighted fields.", "fields": { … } }`, and `fields` names only the missing input. After each request, `GET /api/vendors?include_archived=true` returns the same number of vendors as before it, so no vendor was saved.
3. Archive the vendor. It is absent from `GET /api/vendors` and present with `include_archived=true`. Restore it. It is back in the default `GET /api/vendors`.
4. Add a rating and a past-work note. Then add a lower rating and a reliability note. The vendor shows the lower rating as current. The earlier rating and the earlier note stay readable beside the new ones, each with author and time.
5. Mark a vendor GST registered and omit the GSTIN. The save is refused. Save a GSTIN, then repeat it on another vendor. The second save is 409.
6. Create a second vendor with the same phone and no `confirm_duplicate_phone`. The response is `PHONE_IN_USE`. Repeat with confirmation. The vendor is saved.
7. Create a project with a name and status Completed. It appears on the default project list, and its returned `status` is `COMPLETED`. Archive it. It leaves that list and remains available by id.
8. Link one vendor to two projects. `GET` the vendor once; it lists both links. Both projects list that same vendor id. `GET /api/vendors` contains that vendor exactly once, and the number of vendors is unchanged. A second link for the same pair is 409.
9. Schedule the linked vendor from 09:00 to 12:00, then again from 11:00 to 13:00 on the same date on the other project. Both exist. The second response names the first in `conflicts`. A schedule for a different vendor in that window has an empty `conflicts` array.
10. Set the vendor availability to Unavailable and save another schedule. The schedule is saved.
11. Record the vendor's indicative rates. Put `1000.00` on one schedule and `2500.00` on another for the same vendor and project. The vendor `GET` shows the same indicative rates as recorded and no task price. `GET` each schedule: one has `current_price` `1000.00` and the other `2500.00`. Change `1000.00` to `1200.00`. The schedule history shows both amounts.
12. Attach a PDF to a schedule that has no fixed price. Download it while signed in. Call the same download without a cookie. The response is 401. Attach a `.png`. The response is 400.
13. Attach a file to a schedule that already has a fixed price. The response is 409.
14. Sign in as the accountant and `POST /api/staff`. The response is 403. Sign in as the administrator and create an Office Team user. That user signs in with the email and password given, `GET /api/vendors` returns 200, and `GET /api/staff` returns 403. As the administrator, revoke that user, and call `GET /api/vendors` with the revoked user's cookie. The response is 401. The same email and password cannot sign in. Restore the user and sign in again.
15. Revoke is refused for the only remaining active administrator.
16. Create a category, then submit the same name in a different letter case. The existing category is returned and its stored name is unchanged.
17. Delete a vendor-project link that has a schedule, a fixed price, and a costing sheet. The vendor remains. The schedule is archived. An authorized caller can still read the price history and the file.
18. As the administrator, change your own role. The response is 403 `OWN_ROLE`, including when a second administrator exists. Change the office user's role instead. That succeeds.
19. Sign in as the office user, then, as the administrator, set the office user's password. The office user's existing cookie now receives 401. The new password signs in.
20. On a fixed-priced schedule, `POST …/price/clear`. The schedule shows no current price and the history ends with a reversal. Attach a PDF. That succeeds. Then `POST …/costing-sheet/clear` and set a fixed price. That succeeds, and the cleared file still downloads with a session. After each request, at most one method is current: `pricing_mode` names it, and the other method's `current_price` or `current_file` is null. The reversal from the cleared price keeps its `created_at` and author. The cleared file keeps its `created_at` and author and shows `archived_at` and `archived_by`.
21. Attach a file larger than 10 MB. The response is 400 and names the file field.
22. Schedule the same vendor 09:00–12:00 and 12:00–14:00 on one date. Neither response lists the other in `conflicts`.
23. As the administrator, revoke the office user, then send `PATCH /api/staff/:id` with `revoked: false` and a new `password` in one request. The old password no longer signs in. The new password signs in.
24. Sign in as the office user, then as the accountant. Each one sends, against another person's account: `POST /api/staff`, `PATCH` with `revoked: true`, `PATCH` with `revoked: false` on a revoked account, `PATCH` with a `role`, and `PATCH` with a `password`. Every response is 403. `GET /api/staff` as the administrator shows no change.
25. With exactly one active administrator, that administrator sends `PATCH` with a different `role` on their own account. The request is refused (403 `OWN_ROLE`, because only that administrator can make the request). Together with step 15, the account stays active and keeps the Administrator role.
26. Sign in with an unknown email, with a wrong password, and with a revoked account. Each response is 401 with the identical body `{ "message": "Email or password is not valid." }`.
27. Sign in as the office user, then as the accountant. Each one creates, edits, archives, and restores a vendor and a project, and creates and removes a vendor-project link. Each request succeeds, and a following `GET` shows the change.
28. Save three vendors with a team size, a manpower note, and availability Available, Limited, and Unavailable. `GET /api/vendors?availability=LIMITED` returns only the Limited vendor. Repeat for the other two statuses.
29. `POST /api/projects` without a name. The response is 400 and names the field. The project list is unchanged.
30. After step 7, `GET /api/projects?include_archived=true` lists the archived project. Restore it. It is back on the default project list.
31. Archive a linked vendor. A new link for it to another project is 409. `GET` the vendor still lists its links, and `GET` the linked project shows the link with `vendor_archived: true`. Restore the vendor. Archive a linked project. A new link to it is 409, and `GET` the project by id still lists its links.
32. Record the vendor's `GET` body. Link the vendor with a role, a scope of work, and a note. `GET` the project shows those three on the link. `GET` the vendor shows the same contact details, rates, and manpower as before.
33. Remove the link from step 32. `GET` the project no longer lists it. `GET` the vendor matches the body recorded in step 32 except for its links.
34. Schedule a linked vendor with a task, a date, a start time, an end time, and a required team size. The response is 201. `GET` the project lists the schedule. `GET` the vendor is unchanged.
35. Send each invalid schedule as its own request: no task, no date, an end time equal to the start time, an end time before the start time, and a required team size that is missing, `0`, `-1`, or `1.5`. Each response is 400 and names the field. `GET` the project shows no new schedule.
36. Schedule a vendor that is not linked to the project. The response is 409. Schedule a linked vendor while the vendor is archived, then while the project is archived. Each response is 409.
37. `PUT …/price` with `-5.00`, then with `10.001`. Each response is 400 and names the amount, and the schedule's price is unchanged. Steps 12 and 21 cover the file type and the 10 MB limit.
38. Set a linked vendor's availability to Available, and schedule it from 09:00 to 12:00 on one date. Schedule the same vendor from 10:00 to 11:00 on that date. The response is 201, the schedule is saved, and `conflicts` names the first schedule. Available is not treated as proof that the vendor is free. Step 10 covers Unavailable.
39. Create vendor M with a distinct name, phone, alternate phone, contact person, service, and material, plus a category, a location, availability Limited, and a link to project P. Create decoy vendors that share M's service but each differ from M in exactly one of: category, location, availability, or link to P.
    - Search `q` once for each of M's name, phone, alternate phone, contact person, service, and material. Each search returns M, and no vendor that lacks that value.
    - Combine `q` set to M's service with `category_id`, `location`, `availability=LIMITED`, and `project_id=P` in one request. Only M is returned. Every decoy is excluded, each by the one filter it fails.
40. On a schedule that has a costing sheet, attach a second file. `current_file` is the new file. `file_history` lists the previous file with `archived: true`, its `created_at` and author, and `archived_at` and `archived_by`. The previous file still downloads with a session. On the schedule from step 11, every `price_history` entry has a `created_at` and an author.
41. Create a vendor with a contact person, alternate phone, email, address, locations, services, materials, GST registration with a GSTIN and legal name, team size, availability, manpower note, and an indicative rate. `GET /api/vendors/:id` returns each of those values as saved, and the vendor appears in `GET /api/vendors`.
42. With two active administrators A and B, B changes A's role to Office Team. The response is 200, and A's next `GET /api/auth/me` shows the new role. B stays an active administrator throughout, so the firm always has an active administrator.

Business-rule unit tests cover overlap boundaries, money scale, the last administrator, category reuse, and the uniform sign-in message before the routes are considered done. The Supertest suite maps each spec acceptance scenario to a case. A separate case loads 200 vendors and checks the category and location filter finishes in under 30 seconds. Another case confirms quotation, purchase-order, invoice, and payment routes are absent.

## Web scenarios

Sign in, find a vendor, open a project, add a schedule, and open a costing sheet.

Steps W1–W8 demonstrate outcomes the person sees on screen. Each names the scenarios it covers.

- **W1** (US1-1). Sign in as each seed account. The administrator can open staff management. When the office user or the accountant tries a staff action, the screen shows the refusal and nothing changes.
- **W2** (US1-6). Sign in with a wrong password, an unknown email, and a revoked account. The sign-in screen shows the same message each time.
- **W3** (US1-2, US1-3, US1-8, US1-9). In a second browser, sign in as a staff member.
  - As the administrator, revoke that account. The staff member's next action requires signing in, and signing in is refused.
  - Restore the account with a new password. The staff member signs in with it.
  - Reset that staff member's password. Their open session stops working, and the new password signs in.
  - Your own row on the staff screen has no role control, so you cannot change your own role from the web app. API steps 18, 25, and 42 demonstrate the refusal.
- **W4** (US2-1 to US2-9). Vendors:
  - Create a vendor with a name, a phone, a category, and other details. It appears in the directory and opens.
  - Leave out the name, the phone, or the category. The form explains what is missing and does not save.
  - Search, and combine the category, location, availability, and linked-project filters. Only matching vendors are shown. A search with no match shows an empty list and keeps the filters.
  - Archive the vendor, open it from archived records, and restore it.
  - Change the rating and add a note. The new rating shows, and earlier ratings and notes show their date and author.
  - Mark the vendor GST registered without a GSTIN. The form explains the problem.
  - Reuse a stored GSTIN on another vendor. It is refused.
  - Reuse a stored phone. A warning appears, and the vendor saves only after you confirm.
- **W5** (US3-1 to US3-4). Projects:
  - Create a project with a name. It appears on the list.
  - Leave out the name. The form explains the problem.
  - Archive the project. It leaves the list, opens from archived projects, and can be restored.
  - A completed project that is not archived stays on the list and shows Completed.
- **W6** (US4-1 to US4-5). Links:
  - Link one vendor to two projects. Both project screens show it, and the directory still lists one vendor.
  - A duplicate link is refused.
  - With the vendor or the project archived, a new link is refused, and existing links still show.
  - A link's role, scope, and note show on the project, and the vendor screen is unchanged.
  - Remove the link. The project no longer shows it, and the vendor is unchanged.
- **W7** (US5-1 to US5-6). Schedules:
  - Add a schedule. The project shows it.
  - Add an overlapping schedule for the same vendor. It saves, and the conflict names the first schedule. A different vendor in the same window shows no conflict.
  - An Unavailable vendor can be scheduled.
  - An Available vendor's overlapping schedule still saves and still shows the conflict.
  - Enter each invalid input on its own: no task, no date, an end time equal to the start time, an end time before the start time, and a team size that is missing, `0`, `-1`, or `1.5`. Each time, the form shows a message explaining the problem, and no schedule is added.
  - A vendor that is not linked, or is archived, cannot be scheduled.
- **W8** (US6-1 to US6-8). Pricing:
  - Two tasks for one vendor show their own fixed prices, and the vendor screen shows only its indicative rates.
  - Attach a PDF to an unpriced task and open it.
  - After signing out, opening it is refused.
  - Adding a costing sheet to a fixed-priced task is refused with an explanation.
  - A negative amount, a third decimal place, a non-spreadsheet file, or a file over 10 MB is explained and not saved.
  - Change a fixed price and replace a costing sheet. The new one shows, and the earlier one stays readable with its date and author.
  - Clear the current method and set the other. Only the new method is current, and the cleared record stays readable with its date and author.

Repeat on a narrow phone width and on a desktop width. The same actions are reachable without a separate mobile app. There is no install prompt and no offline mode.

## Done for a scenario

The automated test for that scenario passes, and the matching quickstart step has been performed against the running system and recorded in the T061 log below.

- **Web steps** (W1–W8) are performed in the running web app.
- **API-only scenarios** (marked "No" under "On screen" in the coverage table) may be demonstrated through reproducible requests and responses against the running API. Record the method, path, request body, status, and response body, with the session cookie redacted.
- **Scenarios marked "On screen: Yes"** need both their applicable API demonstration and the relevant browser demonstration.
- **When a scenario is "On screen: Yes".** Its acceptance criteria require at least one of:
  - a user-facing message or warning that the person must read
  - an app-specific interaction, such as confirming after a warning or opening a file from a task
  - role-dependent visibility checked in the web app
  - an explicitly required UI display, even when the API can also show the data

  Otherwise, API responses may demonstrate record state, refusals, saved data, list results, and history.
- **A general walkthrough is not evidence.** It counts only if the scenario's required outcome is actually checked and recorded.
- **Tests and typechecks alone do not demonstrate a scenario.**

Some steps cannot pass until the revision tasks (T065–T089 in [tasks.md](./tasks.md)) are complete.

## Scenario coverage

| Scenario | API step | Web step | On screen |
| --- | --- | --- | --- |
| US1-1 | 14 | W1 | Yes |
| US1-2 | 14 | W3 | No |
| US1-3 | 14, 23 | W3 | No |
| US1-4 | 14, 24 | W1 | No |
| US1-5 | 15, 25 | — | No |
| US1-6 | 26 | W2 | Yes |
| US1-7 | 1, 27 | — | No |
| US1-8 | 18, 42 | W3 | No |
| US1-9 | 19 | W3 | No |
| US2-1 | 1, 41 | W4 | No |
| US2-2 | 2 | W4 | Yes |
| US2-3 | 1, 39 | W4 | No |
| US2-4 | 3 | W4 | No |
| US2-5 | 4 | W4 | No |
| US2-6 | 5 | W4 | Yes |
| US2-7 | 5 | W4 | No |
| US2-8 | 6 | W4 | Yes |
| US2-9 | 28 | W4 | No |
| US3-1 | 7 | W5 | No |
| US3-2 | 29 | W5 | Yes |
| US3-3 | 7, 30 | W5 | No |
| US3-4 | 7 | W5 | No |
| US4-1 | 8 | W6 | No |
| US4-2 | 8 | W6 | No |
| US4-3 | 31 | W6 | No |
| US4-4 | 17, 33 | W6 | No |
| US4-5 | 32 | W6 | No |
| US5-1 | 34 | W7 | No |
| US5-2 | 9 | W7 | Yes |
| US5-3 | 9 | W7 | No |
| US5-4 | 10, 38 | W7 | No |
| US5-5 | 35 | W7 | Yes |
| US5-6 | 36 | W7 | No |
| US6-1 | 11 | W8 | No |
| US6-2 | 11 | W8 | Yes |
| US6-3 | 12 | W8 | Yes |
| US6-4 | 12 | W8 | No |
| US6-5 | 13 | W8 | Yes |
| US6-6 | 12, 21, 37 | W8 | Yes |
| US6-7 | 11, 40 | W8 | No |
| US6-8 | 20 | W8 | No |

## Demonstration log (T061)

Add one row per attempt. Record failed attempts too. A re-run adds a new row instead of editing an earlier one.

- **Commit** is the commit under review.
- **Environment** names the operating system, the browser and its width for web steps (375px and 1280px), or the API base URL for API steps.
- **Evidence reference** points to a screenshot, recording, or request-and-response transcript under `specs/001-core-auth-directory/evidence/`.

A scenario is demonstrated when, on the same commit, every API step listed for it in the coverage table has a Pass row. For a scenario marked "On screen: Yes", its web step also needs a Pass row. A scenario with no API step listed is demonstrated by its web step.

| Date | Performer | Commit | Environment | Scenario ID | Quickstart step | Observed result | Pass/Fail | Evidence reference |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
