# HTTP API: Import, Documents, and Advances

These are additions to the [Feature 001 HTTP API](../../001-core-auth-directory/contracts/http-api.md) and the [Feature 002 HTTP API](../../002-timelines-delays/contracts/http-api.md). The base path is `/api`, and bodies are JSON unless a route says `multipart/form-data`. Money is a string with two decimals, such as `"125000.00"`. Dates are `YYYY-MM-DD`, and timestamps are ISO 8601.

## Authentication, roles, and errors

Every route requires a session cookie for an active staff user, checked on the server on every request. A missing, expired, or revoked session gets 401 and no data (FR-014, FR-025, FR-028).

| Area | Administrator | Accountant | Office Team |
| --- | --- | --- | --- |
| Import: template, preview, confirm, cancel, history | Yes | Yes | Yes |
| Documents: upload, list, download, archive, restore | Yes | Yes | Yes |
| Client advances: view | Yes | Yes | Yes |
| Client advances: record, reverse | Yes | Yes | No (403 `ROLE_NOT_ALLOWED`) |
| Dashboard summary, money tiles included | Yes | Yes | Yes |
| History | Yes | Yes | Yes |

| Status | When |
| --- | --- |
| 400 | Validation failed. `fields` names each problem. Whole-file import refusals also use 400, with `code` |
| 401 | No active session |
| 403 | Role or ownership refusal. `code` is `ROLE_NOT_ALLOWED` or `PREVIEW_NOT_YOURS` |
| 404 | The record does not exist, or the route does not exist. There is no route that edits or deletes an advance, reversal, document, import, or history entry |
| 409 | A rule refused the change. `code` is listed below |
| 500 | `IMPORT_FAILED` only from import confirmation: "The import did not happen. Nothing was saved." Any other 500 is the Feature 001 generic error |

| `code` | Meaning |
| --- | --- |
| `UNSUPPORTED_FORMAT` | (400) Not `.xlsx` or `.csv`, content does not match, `.xls`, or CSV not UTF-8 (FR-001) |
| `EMPTY_FILE` | (400) No heading row or no data rows (FR-003) |
| `TOO_MANY_ROWS` | (400) More than 1,000 non-blank data rows (FR-003) |
| `MISSING_HEADING` | (400) Name, Phone, or Categories heading missing. `extra.headings` lists them (FR-002) |
| `REPEATED_HEADING` | (400) A heading appears twice. `extra.headings` lists them (FR-002) |
| `PREVIEW_NOT_YOURS` | (403) The preview belongs to another person (FR-008d) |
| `PREVIEW_EXPIRED` | (409) Created more than 30 minutes ago. Upload again (FR-008c) |
| `PREVIEW_CANCELLED` | (409) The preview was cancelled (FR-008b) |
| `PREVIEW_CONFIRMED` | (409) Cancel was sent after confirmation |
| `PARENT_ARCHIVED` | (409) The vendor or project is archived, so its documents are read-only (FR-015) |
| `PROJECT_ARCHIVED` | (409) New advance on an archived project (US1-7) |
| `ALREADY_REVERSED` | (409) The advance already has a reversal (FR-020) |
| `ROLE_NOT_ALLOWED` | (403) Only an Administrator or Accountant can record or reverse (FR-017) |
| `PHONE_IN_USE` | (409) Feature 001 code. Its matching rule changes to FR-030. The response shape is unchanged |

## Vendor import

### `GET /vendor-imports/template?format=xlsx|csv`

Returns a blank file with the 16 headings of FR-002, as an attachment. In the `.xlsx` template, the Phone and Alternate phone columns are formatted as text.

### `POST /vendor-imports/previews`, multipart

Field `file`: one `.xlsx` or `.csv`, at most 25 MB. Creates nothing but the preview (US2-1).

`201`:

```json
{
  "id": "uuid",
  "file_name": "vendors.xlsx",
  "expires_at": "2026-10-29T06:30:00.000Z",
  "status": "OPEN",
  "ignored_headings": ["Rate"],
  "counts": { "ready": 41, "rejected": 3, "possible_duplicate": 2 },
  "rows": [
    { "row_number": 2, "outcome": "READY", "name": "Sharma Interiors", "reasons": [], "matches": [] },
    { "row_number": 3, "outcome": "REJECTED", "name": "", "reasons": ["Name is required.", "Phone is required."], "matches": [] },
    { "row_number": 4, "outcome": "REJECTED", "name": "Gupta Steel", "reasons": ["This GSTIN already belongs to Gupta & Sons."], "matches": [{ "kind": "VENDOR", "vendor_id": "uuid", "vendor_name": "Gupta & Sons" }] },
    { "row_number": 5, "outcome": "POSSIBLE_DUPLICATE", "name": "Mehta Tiles", "reasons": ["Phone matches an existing vendor."], "matches": [{ "kind": "VENDOR", "vendor_id": "uuid", "vendor_name": "Mehta Tile Co" }] },
    { "row_number": 9, "outcome": "POSSIBLE_DUPLICATE", "name": "Mehta Tiles 2", "reasons": ["Phone matches row 5."], "matches": [{ "kind": "ROW", "row_number": 5 }] }
  ]
}
```

Each row also carries `cells`, the trimmed text of each recognised heading, so the preview can show every value. Whole-file refusals return 400 with the codes above, and no preview is created (US2-7).

### `GET /vendor-imports/previews/:id`

Returns the same body to the uploader. Another person gets 403 `PREVIEW_NOT_YOURS`. An expired preview returns its body with `"status": "OPEN"` and `"expired": true`, so the screen can ask for a new upload.

### `POST /vendor-imports/previews/:id/confirm`

```json
{ "approved_rows": [5] }
```

`approved_rows` lists the row numbers of possible duplicates the person chose to import. Any other number in it is ignored.

- `201` on the first successful confirmation, or `200` when the preview was already confirmed. The original run is returned and nothing new is written (FR-008b, US2-10).
- `403 PREVIEW_NOT_YOURS`, `409 PREVIEW_EXPIRED`, `409 PREVIEW_CANCELLED`, or `500 IMPORT_FAILED`. Nothing is saved in any of these cases (FR-008a, FR-008c).

```json
{
  "run": {
    "id": "uuid",
    "file_name": "vendors.xlsx",
    "created_at": "2026-10-29T06:12:00.000Z",
    "created_by": { "id": "uuid", "name": "Asha Rao" },
    "imported_count": 42,
    "skipped_count": 1,
    "rejected_count": 4
  },
  "rows": [
    { "row_number": 2, "outcome": "IMPORTED", "vendor_id": "uuid", "reasons": [] },
    { "row_number": 7, "outcome": "SKIPPED", "vendor_id": null, "reasons": ["Phone matches an existing vendor. Not approved."] },
    { "row_number": 8, "outcome": "REJECTED", "vendor_id": null, "reasons": ["This GSTIN already belongs to Rao Glass."] }
  ]
}
```

### `POST /vendor-imports/previews/:id/cancel`

`200 { "status": "CANCELLED" }`. Only the uploader may cancel. Cancelling a confirmed preview is 409 `PREVIEW_CONFIRMED`. Cancelling a cancelled preview returns 200 again.

### `GET /vendor-imports` and `GET /vendor-imports/:runId`

The list returns runs newest first, each with the `run` shape above. The detail returns `{ run, rows }`. Every staff member may read them (US2-9).

## Vendor form change (Feature 001)

`POST /vendors` and `PATCH /vendors/:id` keep their request and response shapes. `409 PHONE_IN_USE` is now decided by FR-030:
- spaces and dashes are ignored
- phone and alternate phone are compared both ways
- archived vendors are included

`confirm_duplicate_phone: true` still saves (US2-13).

`GET /projects` gains an optional `status` query of `PLANNED`, `ACTIVE`, `ON_HOLD`, or `COMPLETED` for the dashboard tiles (US4-6). Without it, the list is unchanged.

## Documents

### `POST /vendors/:id/documents` and `POST /projects/:id/documents`, multipart

| Field | Rules |
| --- | --- |
| file | Required. `.pdf`, `.jpg`, `.jpeg`, `.png`, `.doc`, `.docx`, `.xls`, or `.xlsx`, at most 25 MB, content matching the extension (FR-013) |
| title | Required. Trimmed |
| document_type | `AGREEMENT`, `DRAWING`, `REGISTRATION_CERTIFICATE`, `PHOTO`, or `OTHER` |
| note | Optional |

`201` returns a document. `409 PARENT_ARCHIVED` is returned when the vendor or project is archived (US3-7).

```json
{
  "id": "uuid",
  "vendor_id": "uuid",
  "project_id": null,
  "title": "Rate agreement 2026",
  "document_type": "AGREEMENT",
  "note": null,
  "original_filename": "agreement.pdf",
  "media_type": "application/pdf",
  "byte_size": 182344,
  "archived": false,
  "created_at": "2026-10-29T06:00:00.000Z",
  "created_by": { "id": "uuid", "name": "Asha Rao" }
}
```

### `GET /vendors/:id/documents?include_archived=true` and `GET /projects/:id/documents?include_archived=true`

The list is newest first. Archived documents appear only when `include_archived=true` (US3-5). This works on archived vendors and projects too.

### `GET /documents/:id/file`

Returns the stored bytes unchanged, with `Content-Type` set to `media_type`, `Content-Disposition: attachment`, and `X-Content-Type-Options: nosniff`. Archived documents and documents on archived records can be downloaded (US3-2, US3-7).

### `POST /documents/:id/archive` and `POST /documents/:id/restore`

Each returns the document. `409 PARENT_ARCHIVED` is returned while the vendor or project is archived (FR-015). Repeating the same action returns the document unchanged.

There is no `DELETE /documents/:id`, and the request falls through to 404 (US3-6).

## Client advances

### `GET /projects/:id/client-advances`

Any staff role may call it. It also works on archived projects (US1-7, US1-8).

```json
{
  "project": { "id": "uuid", "name": "Kapoor Residence", "client_name": "R. Kapoor", "archived": false },
  "net_amount": "150000.00",
  "advances": [
    {
      "id": "uuid",
      "amount": "100000.00",
      "received_on": "2026-09-14",
      "payment_method": "BANK_TRANSFER",
      "reference": "NEFT 8812",
      "note": null,
      "created_at": "2026-09-14T10:00:00.000Z",
      "created_by": { "id": "uuid", "name": "Accounts" },
      "reversal": {
        "id": "uuid",
        "amount": "100000.00",
        "reason": "Entered against the wrong project.",
        "created_at": "2026-10-02T09:00:00.000Z",
        "created_by": { "id": "uuid", "name": "Accounts" }
      }
    }
  ]
}
```

Advances are sorted by `received_on`, then `created_at`. `reversal` is `null` until the advance is reversed. The response is in date order with author and time (FR-021). `net_amount` is the sum of advances with `reversal: null`.

### `POST /projects/:id/client-advances`

Administrators and Accountants only (FR-017).

```json
{ "amount": "50000.00", "received_on": "2026-10-20", "payment_method": "UPI", "reference": "UTR 4471", "note": "Second advance" }
```

The amount is a decimal string greater than zero, with at most two decimal places and at most 9999999999999.99. `received_on` is no later than today in India Standard Time. `payment_method`, `reference`, and `note` are optional.

`201` returns the advance. `400` returns `fields`. `409 PROJECT_ARCHIVED` is returned for an archived project.

### `POST /client-advances/:id/reversal`

Administrators and Accountants only.

```json
{ "reason": "Amount keyed wrongly." }
```

`201` returns the advance with its `reversal`. `400` is returned when the reason is missing, and `409 ALREADY_REVERSED` when a reversal exists. Allowed on archived projects (FR-020).

### `GET /client-advances?scope=all|month`

Lists the standing (not reversed) advances behind a money tile, across all projects, archived included. Each item has the advance shape above plus `project: { id, name, client_name, archived }`. `scope=month` limits the list to `received_on` in the current India Standard Time month.

There are no `PATCH`, `PUT`, or `DELETE` routes for advances or reversals, and those requests fall through to 404 (US1-3).

## Dashboard summary

### `GET /dashboard/summary`

```json
{
  "vendors": { "active": 184 },
  "projects": { "PLANNED": 3, "ACTIVE": 12, "ON_HOLD": 2, "COMPLETED": 9 },
  "client_advances": {
    "standing_total": "4520000.00",
    "received_this_month": "350000.00",
    "month": "2026-10",
    "labels": {
      "standing_total": "Client advances received and not reversed, all projects",
      "received_this_month": "Client advances received in October 2026 and not reversed"
    }
  }
}
```

`client_advances` is present only for roles in `ADVANCE_VIEWERS`, which is all three roles today (FR-024, FR-025).

The Feature 002 `GET /dashboard` is unchanged.

## History

### `GET /history?vendor_id=|project_id=|document_id=|import_run_id=|client_advance_id=`

Exactly one query parameter is required; anything else is 400.

```json
{
  "record": {
    "created_at": "2026-10-24T05:00:00.000Z",
    "created_by": { "id": "uuid", "name": "Admin" },
    "updated_at": "2026-10-27T08:00:00.000Z",
    "updated_by": { "id": "uuid", "name": "Office" }
  },
  "entries": [
    {
      "id": "uuid",
      "action": "EDITED",
      "changes": { "phone": { "from": "98765 43210", "to": "98765-43211" } },
      "details": {},
      "created_at": "2026-10-29T06:00:00.000Z",
      "created_by": { "id": "uuid", "name": "Asha Rao" }
    }
  ]
}
```

`record` carries the target's existing stamps, so a record created before deployment still shows who created it and who last updated it (US5-6). `entries` are newest first and include only events since deployment. There are no write routes for history (US5-4).
