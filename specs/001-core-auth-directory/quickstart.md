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
2. Omit the phone. The response is 400 and names the field. The vendor is not created.
3. Archive the vendor. It is absent from `GET /api/vendors` and present with `include_archived=true`. Restore it.
4. Add a rating, then a lower rating and a reliability note. The vendor shows the new rating, and both ratings and the note stay readable with author and time.
5. Mark a vendor GST registered and omit the GSTIN. The save is refused. Save a GSTIN, then repeat it on another vendor. The second save is 409.
6. Create a second vendor with the same phone and no `confirm_duplicate_phone`. The response is `PHONE_IN_USE`. Repeat with confirmation. The vendor is saved.
7. Create a project with a name and status Completed. It appears on the default project list. Archive it. It leaves that list and remains available by id.
8. Link one vendor to two projects. `GET` the vendor once. Both projects list that vendor id. A second link for the same pair is 409.
9. Schedule the linked vendor from 09:00 to 12:00, then again from 11:00 to 13:00 on the same date on the other project. Both exist. The second response names the first in `conflicts`. A schedule for a different vendor in that window has an empty `conflicts` array.
10. Set the vendor availability to Unavailable and save another schedule. The schedule is saved.
11. Put `1000.00` on one schedule and `2500.00` on another for the same vendor and project. The vendor `GET` still shows only indicative rates. Change `1000.00` to `1200.00`. The schedule history shows both amounts.
12. Attach a PDF to a schedule that has no fixed price. Download it while signed in. Call the same download without a cookie. The response is 401. Attach a `.png`. The response is 400.
13. Attach a file to a schedule that already has a fixed price. The response is 409.
14. Sign in as the accountant and `POST /api/staff`. The response is 403. Sign in as the administrator, create a user, revoke that user, and call `GET /api/vendors` with the revoked user's cookie. The response is 401. The same email and password cannot sign in. Restore the user and sign in again.
15. Revoke is refused for the only remaining active administrator.

Business-rule unit tests cover overlap boundaries, money scale, the last administrator, and the uniform sign-in message before the routes are considered done. The Supertest suite maps each spec acceptance scenario to a case.

## Web scenarios

Sign in, find a vendor, open a project, add a schedule, and open a costing sheet.

Repeat on a narrow phone width and on a desktop width. The same actions are reachable without a separate mobile app. There is no install prompt and no offline mode.

## Done for a scenario

The automated test for that scenario passes, and the matching quickstart step has been performed on the running web app. A successful typecheck alone does not finish the scenario.
