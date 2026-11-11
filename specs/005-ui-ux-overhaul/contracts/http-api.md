# HTTP API Contract: Feature 005

Every route requires a signed-in, active staff member (Feature 001). All three roles may use every route below (FR-046) unless a note says otherwise. Request bodies are validated with zod on the server. Errors use the existing shape `{ message, code?, fields? }`; 400 for validation (with `fields`), 404 not found, 409 conflicts.

## Sections

### `GET /api/projects/:id` (extended)

Adds:

```json
{
  "sections": [
    { "id": "…", "name": "Execution", "position": 7, "description": "…", "notes": "…",
      "updated_at": "…", "updated_by": { "id": "…", "name": "…" },
      "assignments": [
        { "id": "…", "vendor_id": "…", "vendor_name": "…", "vendor_archived": false,
          "vendor_phone": "…", "vendor_contact_person": "…", "vendor_categories": [{ "id": "…", "name": "…" }],
          "role_in_section": "Lead carpenter" }
      ] }
  ],
  "removed_sections": [ { "id": "…", "name": "…", "description": "…", "notes": "…", "removed_at": "…", "removed_by": { "id": "…", "name": "…" },
      "past_assignments": [ { "vendor_id": "…", "vendor_name": "…", "role_in_section": "…", "removed_at": "…" } ] } ],
  "sections_version": "2026-11-09T08:00:00.000Z"
}
```

Each `links[]` entry also gains `sections: [{ id, name }]` (the vendor's current sections in this project). Existing keys are unchanged.

### `POST /api/projects` (extended)

Unchanged body and response, plus the project is created with the 15 default sections in the same transaction (FR-013). History: one `CREATED` entry, as today, whose details add `blueprint_applied` (the 15 names in order). No `BLUEPRINT_APPLIED` entry at creation.

### `POST /api/projects/:id/sections/blueprint`

Adds the 15 default sections and records `BLUEPRINT_APPLIED` on the project. 201 with the project's `sections`. 409 `HAS_SECTIONS` if the project already has a current section; 409 `ARCHIVED` for an archived project.

### `POST /api/projects/:id/sections`

Body `{ name, description?, notes? }`. Added last. 201 with the section. 400 `fields.name` for 1–80 characters; 409 `SECTION_NAME_TAKEN` (message names the existing section).

### `PATCH /api/sections/:id`

Body any of `{ name, description, notes }`. 200 with the section. 409 `SECTION_NAME_TAKEN`; 409 `SECTION_REMOVED` for a removed section. History `SECTION_RENAMED` and/or `SECTION_EDITED` with previous and new values.

### `PUT /api/projects/:id/sections/order`

Body `{ section_ids: [...all current ids in the new order], sections_version }`. 200 with `sections`. 400 if the ids are not exactly the current sections; 409 `SECTIONS_CHANGED` with `{ sections, sections_version }` when the version is stale. History `SECTIONS_REORDERED` with previous and new order.

### `DELETE /api/sections/:id`

Removes (never deletes). 200 with `{ removed_at, removed_by, ended_assignments: n }`. Ends current section assignments in the same transaction (`SECTION_UNASSIGNED` on both targets for each). 409 `ALREADY_REMOVED`.

### `POST /api/sections/:id/restore`

200 with the section, placed last. 409 `SECTION_NAME_TAKEN` (FR-010a); 409 `NOT_REMOVED`.

## Section assignments

### `POST /api/sections/:id/assignments`

Body `{ vendor_id, role_in_section? }`. 201 with

```json
{ "assignment": { "id": "…", "vendor_id": "…", "role_in_section": "…" }, "project_assignment_created": true }
```

When the vendor has no current project assignment, one is created first in the same transaction (FR-015a) with role, scope and note empty, recording `ASSIGNED` as Feature 004 does. Errors: 409 `ARCHIVED` (vendor or project), 409 `SECTION_REMOVED`, 409 `SECTION_ASSIGNMENT_EXISTS`, 404 vendor. Either both rows are saved or neither.

### `PATCH /api/section-assignments/:id`

Body `{ role_in_section }`. 200. 409 `SECTION_ASSIGNMENT_REMOVED`. History `SECTION_ASSIGNMENT_EDITED`.

### `DELETE /api/section-assignments/:id`

Ends it. 200 with `{ removed_at, removed_by }`. 409 `ALREADY_REMOVED`. The project assignment is not touched (FR-015b).

### `DELETE /api/links/:id` (extended)

As Feature 004, plus ends the vendor's current section assignments in that project; the response adds `ended_section_assignments: n`.

### `GET /api/vendors/:id` (extended)

Each `links[]` entry gains `sections: [{ id, name, role_in_section }]`.

## Lists

### `GET /api/vendors`, `GET /api/projects` (extended)

New query parameters: `view=active|archived` (default `active`), `sort`, `limit` (1 to 200), `offset` (0 or more). Paging applies only when `limit` or `offset` is given, so existing callers that list every vendor (for example the assign-a-vendor choices) still get every match; the Vendors and Projects pages always send `limit=50` (implementation note, T016). `include_archived=true` still returns both, for existing callers. The body stays a JSON array. Headers: `X-Total-Count` (matching records), `X-Active-Count`, `X-Archived-Count` (for the current search and filters). Sorts: vendors `name` (default), `category`, `availability`, `project_count`; projects `name` (default), `status`, `expected_completion`, `progress`. Unknown sort → 400 `fields.sort`. Projects also accept `progress=in_progress`: not archived, status not Completed, at least one non-archived item and 0 < done < total (FR-020, FR-021); any other value → 400 `fields.progress`.

## Dashboard

### `GET /api/dashboard/summary` (extended 2026-11-11)

Implementation note (T031): the five FR-020 counts are returned by the overview below instead of being added here, so the `vendors` and `projects` objects keep their exact keys, which the tests check (`dashboard-overview.test.ts`). The response was unchanged until 2026-11-11; the owner change below adds one top-level key and leaves those two objects as they were.

Owner change (2026-11-11): one top-level key is added, `"projects_archived": 2` (archived projects, any status), for an "Archived projects" tile after the status tiles. The `vendors` and `projects` keys are unchanged. The tile labels lost "not archived": "Vendors", "Planned projects" … "Completed projects", "Archived projects".

### `GET /api/dashboard/overview` (new)

```json
{
  "counts": { "vendors_all": 3, "vendors_archived": 1, "projects_not_archived": 7, "projects_in_progress": 2, "projects_archived": 1 },
  "progress": [ { "id": "…", "name": "…", "status": "ACTIVE", "health": "ONGOING", "done": 3, "total": 8, "percent": 38 } ],
  "recently_updated": [ { "id": "…", "name": "…", "status": "ACTIVE", "updated_at": "…" } ],
  "recent_activity": [ { "id": "…", "action": "SECTION_ASSIGNED", "target": { "kind": "project", "id": "…", "name": "…" }, "changes": {}, "details": {}, "created_at": "…", "created_by": { "id": "…", "name": "…" } } ]
}
```

`progress`: up to 10 non-archived, non-Completed projects with at least one item, lowest percent first. `recent_activity`: 10 newest history entries on vendors and projects, plus client-advance entries for the roles allowed to view advance amounts (Feature 003 FR-017: Administrator, Accountant and Office Team, through `ADVANCE_VIEWERS`). `target.kind` is `vendor`, `project` or `client_advance` (the advance's project). There is no `summary` field (implementation note, T031): the web words each entry with the history panel's own `ACTIONS` labels, so the two always read the same.

Owner change (2026-11-11): the Business overview on the dashboard page shows only the first four counts. `counts.projects_archived` stays in this response for compatibility, but the page no longer uses it; the archived-project count is shown once, on the "Archived projects" tile fed by `/dashboard/summary`.

`GET /api/dashboard` is unchanged.

## Search

### `GET /api/search?q=`

`q` 2 to 100 characters (400 otherwise). 200 `{ vendors: [{ id, name, phone, archived }], projects: [{ id, name, client_name, archived }] }`, up to 5 each, name matches first.

## Auth

No route changes. Switch user uses `POST /api/auth/logout`. `GET /api/auth/me` adds `created_at` for the account information (FR-031).
