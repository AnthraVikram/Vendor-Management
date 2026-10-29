# Quickstart: Import, Documents, and Advances

This is the validation guide for [spec.md](./spec.md). Routes and bodies are in [contracts/http-api.md](./contracts/http-api.md), and tables and rules are in [data-model.md](./data-model.md). The guide contains no implementation code.

## Prerequisites

The Feature 001 prerequisites, start command, `.env`, and seed accounts apply unchanged. See the [Feature 001 quickstart](../001-core-auth-directory/quickstart.md).

This branch is based on `002-timelines-delays` (3eeb966). Before any change, confirm the baseline is green:

```text
npm install
npm run lint
npm run typecheck
npm test
```

## Start

```text
npm install
npm run dev
```

The start command:
- applies the new migration after the Feature 001 and Feature 002 migrations
- loads the extended seed, which puts three advances on two seeded projects. One was received last month and reversed this month.

## Checks that must pass before merge

```text
npm run lint
npm run typecheck
npm test
```

CI runs the same three checks, and a red result blocks merge. `converge` must report Converged before the pull request opens (Constitution Principle V).

## Fixtures

Use `api/tests/fixtures/` for the import files. The test helpers build them, and they can also be written by hand:

- `vendors-valid.xlsx`: 5 valid rows, with headings in a different order and mixed letter case.
- `vendors-mixed.csv`: 1 valid row, 1 with no phone, 1 whose GSTIN belongs to a seeded vendor, 1 whose phone matches a seeded vendor written with dashes, 1 repeating an earlier row's phone, and 1 blank row.
- `vendors-1001.csv`: 1,001 data rows.
- `vendors-repeated-heading.csv`: two `Phone` headings.
- `old.xls`: any legacy Excel file.

## API scenarios

Sign in as `office@example.com` unless a step says otherwise.

### Client advances (US1)

1. As `accountant@example.com`, record 50000.00 received today on an active project. The project list shows it with author and time, and `net_amount` rises by 50000.00 (US1-1).
2. Post 0, -5, 10.123, no amount, and a date tomorrow. Each returns 400 with `fields`, and nothing is saved (US1-2).
3. Send `PATCH` and `DELETE` to the advance. Both return 404 (US1-3).
4. Reverse it with a reason. The advance stays listed with its `reversal`, and `net_amount` drops by 50000.00. Reversing it again returns 409 `ALREADY_REVERSED`, and a reversal with no reason returns 400 (US1-4, US1-5).
5. As `office@example.com`, read the advances and see the same amounts. Recording and reversing both return 403 `ROLE_NOT_ALLOWED` (US1-6, US1-8, SC-010).
6. Archive the project. A new advance returns 409 `PROJECT_ARCHIVED`. Reversing an older advance on it succeeds. The list still reads (US1-7).
7. Sign out, then request the advances. The response is 401 and contains no amounts (US1-9).

### Import (US2)

8. Download both templates. Each has the 16 FR-002 headings.
9. Upload `vendors-mixed.csv`. The preview shows:
   - the valid row as `READY`
   - the no-phone row and the GSTIN row as `REJECTED`, with reasons and row numbers
   - the dashed-phone row and the repeated-phone row as `POSSIBLE_DUPLICATE`, naming the vendor or row
   - the blank row is left out

   The vendor count is unchanged (US2-1 to US2-4, SC-002).
10. Confirm with `approved_rows` naming only the dashed-phone row. The summary shows 2 imported, 1 skipped, and 2 rejected, and the reason for each skipped and rejected row. New categories in the file now exist once (US2-5, US2-8).
11. Send the same confirmation twice more, once in parallel. Each response returns the same run, and the vendor count does not change again (US2-10, SC-003).
12. Upload `vendors-valid.xlsx`, then cancel. Confirming afterwards returns 409 `PREVIEW_CANCELLED`, and no vendor is created (US2-6, US2-11).
13. Upload again and move `expires_at` 31 minutes into the past through the database. Confirming returns 409 `PREVIEW_EXPIRED`, and no vendor is created (US2-11).
14. As `accountant@example.com`, open, confirm, or cancel a preview made by `office@example.com`. Each returns 403 `PREVIEW_NOT_YOURS`, and the preview is unchanged (US2-14).
15. Upload `vendors-1001.csv`, `vendors-repeated-heading.csv`, `old.xls`, a file with only headings, and a file with no Phone heading. Each returns 400 with its `code`, and no preview is created (US2-7).
16. The forced-failure test adds a temporary trigger that fails the run insert. Confirming returns 500 `IMPORT_FAILED`. There are zero new vendors and zero runs, and the preview is still `OPEN` (US2-12, FR-008a).
17. Open `GET /vendor-imports`. Each confirmed run shows who ran it, when, the file name, and the counts. A vendor created by an import shows its run (US2-9, FR-010).
18. On the vendor form, add a vendor whose phone is a seeded vendor's alternate phone written with spaces. The response is 409 `PHONE_IN_USE` naming that vendor. With `confirm_duplicate_phone: true`, it saves (US2-13, SC-011).

### Documents (US3)

19. Upload a PDF to a vendor and a JPG to a project, with a title and type. Download both. The bytes are identical to the originals (US3-1, US3-2).
20. Sign out and request each file. The response is 401. No URL serves a file without a session (US3-3, SC-005).
21. Upload a `.exe` renamed to `.pdf`, a 26 MB PDF, a `.xls` renamed to `.doc`, and a PDF with no title. Each returns 400, and nothing is stored on disk or in the database (US3-4).
22. Archive the vendor document. It leaves the default list, appears with `include_archived=true`, still downloads, and restores (US3-5).
23. `DELETE /documents/:id` returns 404, and the document is unchanged (US3-6).
24. Archive the project. Its documents still list and download. Upload, archive, and restore each return 409 `PARENT_ARCHIVED` (US3-7).

### Dashboard (US4)

25. With the seed, `GET /dashboard/summary` shows:
   - non-archived vendors
   - non-archived projects by status
   - `standing_total` equal to every unreversed advance
   - `received_this_month` that excludes the advance received last month and reversed this month

   Check each figure by hand (US4-1 to US4-3, SC-009).
26. Record an advance today, then reverse it. Both tiles rise, then fall back. Reverse a last-month advance. Only `standing_total` falls (US4-5, US4-7, US4-8).
27. Administrator, Accountant, and Office Team get identical money tiles. A signed-out request is 401 (US4-4).
28. Each tile's list matches its figure: `/vendors`, `/projects?status=ACTIVE`, and `/client-advances?scope=month` (US4-6).

### History (US5)

29. Edit a vendor's phone and categories. The vendor's history shows one `EDITED` entry with the old and new values, the person, and the time (US5-3).
30. The document from step 22 shows `CREATED`, `ARCHIVED`, and `RESTORED`. The advance from step 4 shows `CREATED` and `REVERSED` with the reason (US5-1, US5-2).
31. A seeded vendor that is untouched since deployment shows `record` stamps and no entries (US5-6).
32. Office Team and Accountant can read every history. Signed out, the response is 401. There is no write route (US5-4, US5-5).

## Web demonstration

Sign in on a desktop browser and on a phone-width window (about 390 px). Then:

1. Import `vendors-mixed.csv`: preview, tick the duplicate, confirm, and read the summary. Time a 500-row file from upload to summary. It must be under 10 minutes (SC-001).
2. Upload and reopen a document on a vendor. It must take under 1 minute (SC-004).
3. Record and reverse an advance as the Accountant. As Office Team, confirm the record and reverse controls are absent and the amounts are shown.
4. Open the dashboard. The tiles sit above the Feature 002 lists, each tile states what it counts, and each opens its list.
5. Open a vendor's history panel.
