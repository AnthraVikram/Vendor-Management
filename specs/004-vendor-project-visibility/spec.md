# Feature Specification: Vendor–Project Visibility, Project Tracking and Dashboard Views

**Feature Branch**: `004-dashboard`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "Feature 004 — Vendor–Project Visibility, Project Tracking & Dashboard Improvements. Improved vendor directory and vendor profile, improved project directory and project detail, vendor–project assignment visibility, status and history, project dates, progress and health, dashboard deadline groups, filters and sorting, profile menu and general usability, expanded fictional demonstration data. Branding, project area, costing, design style, procurement, accounting, a client approval workflow, and a full Gantt chart without approval are excluded."

**Backlog coverage**: FR-01 (Vendor Management), FR-03 (Project Management), FR-04 (Vendor-Project Relationships), FR-05 (Timeline Management), FR-06 (Delay Tracking), and FR-15 (Audit History, for assignment changes) from `docs/prd.md`. It also covers PRD section 8 Usability ("Vendor and project records must be searchable", "Timelines and delays must be easy to identify") and success criterion 2 ("find vendors by category, location, project, and manpower availability"). All of it is PRD Phase 1 (section 5.1). Nothing from Phase 2 or Phase 3 is included.

**Depends on**: Feature 001 (`specs/001-core-auth-directory/`), Feature 002 (`specs/002-timelines-delays/`), and Feature 003 (`specs/003-import-documents-advances/`), all merged into `main`. See [Dependencies](#dependencies) and [Backward Compatibility](#backward-compatibility).

**Design goal**: Simple to use. Easy to navigate. Visually informative. Reliable at its core. Every screen answers a question office staff actually ask. No information is entered twice.

## Problem Statement

The firm can already record vendors, projects, links between them, timelines, delays, documents and client advances. Office staff still cannot answer everyday questions quickly:

- **Which projects is this vendor on?** The vendor profile does not show the vendor's projects, although the system holds the links.
- **How do I reach the vendors on this project?** The project page names each linked vendor but shows no phone number or contact person, and does not open the vendor's profile.
- **Is this vendor's work on this project going well?** A vendor-project link has no status.
- **Which vendors used to work on this project?** Removing a link deletes it, so past assignments are lost.
- **When does this project start and finish, and how far along is it?** Projects have no dates and no progress summary.
- **What needs attention today?** The dashboard has fixed lists with no "due today" or "upcoming" view, no filters, and no project-level view.

The vendor directory list also leaves out the contact person and categories, so staff open each record to find out who a vendor is.

## Clarifications

All decisions in [Open Questions](#open-questions) were resolved through `/speckit-clarify` on 2026-11-08.

### Session 2026-11-08

- Q: How should each vendor-project assignment get its status: worked out automatically from that vendor's timeline items on the project, set by staff by hand, or worked out automatically with a staff override? → A: Worked out automatically from the vendor's non-archived timeline items on that project, first matching rule wins: no items → No activities; any open item Overdue → Delayed; all items Done → Completed; any item In progress or Done → In progress; otherwise → Not started. Staff cannot set it.
- Q: When staff remove a vendor from a project, should the system delete that assignment, or keep it as a past assignment that stays visible? → A: Keep it as a past assignment that cannot be restored, preserving role, scope of work, note, who removed it, and when. Assigning the same vendor to the same project again creates a new current assignment, and the old one stays as a past assignment.
- Q: How should a project's start date and expected completion date be kept, and does the firm also need an actual completion date? → A: Staff enter a start date and an expected completion date on the project, both optional, with each change kept in history. No actual completion date is stored; the overview shows when the status was set to Completed, taken from the project's history.
- Q: Should the project's expected completion date be completely independent of its milestone and activity deadlines, or should the system point out items whose deadline falls after it? → A: Independent, but pointed out. No date is refused. Open items whose deadline is after the project's expected completion date are marked on the timeline and counted in the project overview. Nothing is pointed out when the project has no expected completion date.
- Q: Which deadlines should the dashboard's "Upcoming" group cover, after the 7-day "Coming soon" window? → A: 8 to 30 days after today. Later deadlines appear only under All.
- Q: How should a project's progress be counted: Done items out of all its timeline items, activities only, or milestones only? → A: All items. Done items out of all non-archived milestones and activities, shown as "N of M items done" with a bar.
- Q: Should projects show a health label, and what decides it? → A: Three labels, first match wins: Completed when the project status is Completed; Delayed when today is after the project's expected completion date; otherwise Ongoing, including projects with no dates or no items. Overdue activities do not make a project Delayed; they show as the project's overdue count. The dashboard's attention section lists Delayed projects and Ongoing projects that have overdue items, each with the reason it is listed.
- Q: Should this feature include a Gantt-style view, or should that be left for a later feature? → A: Defer. No Gantt-style view in this feature; it is a candidate for a later feature.

### Product-owner decisions, 2026-11-08 (after `/speckit-analyze`)

These were first written by the agent as assumptions. The product owner confirmed each one as a decision (analysis finding C1, constitution Principle I).

- D1: A vendor's project count (FR-002, FR-004) excludes assignments on archived projects and includes assignments on projects with status Completed.
- D2: The dashboard's All group (FR-018) lists open items only. Done items stay readable on each project's timeline.
- D3: The project overview (FR-009a) shows up to 5 open items with the earliest deadlines.
- D4: Dashboard filters and sort choices (FR-020, FR-021) reset between visits and are not saved. Every staff member starts from the same default view.
- D5: The 2-second page target in NFR-001 is accepted as the performance objective, checked by hand in the quickstart, with no automated timing test.
- D6: Confirmations (FR-026) are shown on screen only, on the page where the action happened. No email, push or other notification is sent.

Decisions already recorded before this specification:

- Brief of 2026-11-08: the firm's client-approval practice does not become an in-app approval workflow. A project is created by staff when the firm decides to, as today.
- Brief of 2026-11-08: square footage, project costing or budgets, and design style are not part of this feature because the firm's management has not confirmed them.
- Brief of 2026-11-08: branding, logo, favicon and the product name belong to Feature 005.
- Brief of 2026-11-08: the role model and the permissions confirmed in Features 001 to 003 stay unchanged unless explicitly reopened.

## User Scenarios & Testing *(mandatory)*

Terms:

- **Assignment**: the existing Feature 001 vendor-project link between one vendor and one project, with its role on the project, scope of work, and note. This specification calls it an assignment in the interface.
- **Current assignment**: an assignment that has not been removed.
- **Past assignment**: an assignment that was removed. It is kept read-only with who removed it and when ([FR-013](#assignment-history-fr-04-fr-15)).
- **Open item**: a timeline item (Feature 002) that is not Done and not archived.
- **Today**: the calendar date in India Standard Time, as in Feature 002 FR-003.
- **Active project**: a project that is not archived, whatever its status, as in Feature 002.

### User Story 1 - See a vendor's projects and a project's vendors (Priority: P1)

A staff member opens a vendor's profile and sees every project the vendor is assigned to, with the vendor's role, scope and note on each project, the project's status, and how many projects the vendor is on. Each project opens from there. From the other side, a staff member opens a project and sees every assigned vendor with the vendor's phone number, contact person and categories, and the vendor's role on this project. Each vendor's profile opens from there. Nothing is copied: the vendor's details come from the one vendor record, and the role comes from the one assignment.

**Why this priority**: This is the most frequent question the office asks, and the system already holds the data. Without it, staff open records one by one.

**Independent Test**: Assign one vendor to three projects with different roles. Open the vendor's profile and confirm all three projects appear with their roles and the count reads 3. Open one project and confirm the vendor appears with phone, contact person and categories, and that selecting the vendor opens its profile.

**Acceptance Scenarios**:

1. **Given** a vendor is assigned to three projects, **When** a staff member opens that vendor's profile, **Then** all three projects are listed, each with the project name, project status, the vendor's role on that project, scope of work and note, and the profile shows that the vendor is on 3 projects.
2. **Given** a vendor's profile lists a project, **When** the staff member selects the project name, **Then** that project's page opens.
3. **Given** a project has two assigned vendors, **When** a staff member opens the project, **Then** each vendor is listed with name, phone number, contact person (or "No contact person"), categories, and the role, scope and note on this project.
4. **Given** a project lists an assigned vendor, **When** the staff member selects the vendor's name, **Then** that vendor's profile opens.
5. **Given** a vendor with no assignments, **When** a staff member opens the vendor's profile, **Then** the projects section says the vendor has no projects yet and shows 0 projects.
6. **Given** an archived vendor with assignments, **When** a staff member opens it, **Then** its assignments are listed as for an active vendor. This meets Feature 001 FR-015 and User Story 4 scenario 3.
7. **Given** a vendor is assigned to a project that is later archived, **When** a staff member opens the vendor's profile, **Then** that project is listed and marked as archived, and it is not counted among the vendor's current projects ([FR-002](#vendor-profile-fr-01-fr-04)).
8. **Given** a staff member changes a vendor's phone number, **When** they open any project the vendor is assigned to, **Then** the project shows the new phone number. No project holds its own copy.

---

### User Story 2 - Find and recognise vendors quickly in the directory (Priority: P2)

A staff member opens the vendor directory and can tell who each vendor is and how to reach them without opening the record: name, contact person, phone number, categories, locations served, availability, and the number of projects the vendor is on. Every existing search and filter keeps working.

**Why this priority**: The directory is the firm's shared vendor database. Recognising a vendor from the list saves a page visit every time.

**Independent Test**: With seeded vendors, open the directory, confirm each row shows the listed details, search by contact person and by material, filter by category and linked project, and confirm the results match Feature 001 behaviour.

**Acceptance Scenarios**:

1. **Given** vendors with contact persons, categories and assignments, **When** a staff member opens the directory, **Then** each vendor shows name, contact person (blank when none), phone number, categories, locations served, availability, and project count.
2. **Given** a search by name, phone number, contact person, service or material, **When** the staff member searches, **Then** the results are the same vendors Feature 001 FR-014 returns for that search.
3. **Given** filters for category, location served, availability, linked project, and include archived, **When** the staff member combines them, **Then** only vendors matching all of them are shown, as in Feature 001 FR-014.
4. **Given** an archived vendor appears because the staff member chose to include archived vendors, **When** the list is shown, **Then** the vendor is marked archived.
5. **Given** no vendor matches the search and filters, **When** the list is shown, **Then** it says no vendors match and keeps the search and filters as set.
6. **Given** the directory has no vendors at all, **When** a staff member opens it, **Then** it says no vendors have been added and offers to add one or to import a spreadsheet.

---

### User Story 3 - Know the status of each assignment (Priority: P2)

On both the vendor profile and the project page, each current assignment shows one assignment status, so staff can see at a glance whether a vendor's work on a project has not started, is under way, is late, or is finished. The status is worked out from the timeline items on that project for which the vendor is the responsible vendor. Staff never enter it, so it cannot disagree with the timeline.

**Why this priority**: Staff coordinate several vendors across several projects. A status per assignment shows where to follow up.

**Independent Test**: Set up one assignment for each situation in the [assignment-status situations](#assignment-status-situations) table and confirm each shows the listed status, identically on the vendor profile and the project page.

**Acceptance Scenarios**:

1. **Given** a current assignment, **When** a staff member opens the vendor profile or the project page, **Then** the assignment shows exactly one status, and both pages show the same status.
2. **Given** each situation in the [assignment-status situations](#assignment-status-situations) table, **When** the assignment is shown, **Then** it shows the status that table gives.
3. **Given** a vendor's only item on a project is In progress, **When** that item's deadline passes without it being Done, **Then** the assignment shows Delayed the next day, with no staff action.
4. **Given** a Delayed assignment whose only overdue item is set to Done, **When** the page is opened afterwards, **Then** the assignment shows Completed if all its items are Done, or In progress otherwise.
5. **Given** any staff member, **When** they look for a way to set an assignment status, **Then** none is offered, and the server refuses any request that tries to set one.
6. **Given** an item whose responsible party is Firm team or none, **When** assignment statuses on that project are worked out, **Then** that item does not count toward any vendor's assignment status.

---

### User Story 4 - Keep a record of past assignments (Priority: P3)

When a vendor stops working on a project, a staff member removes the vendor from the project. The assignment is not deleted. It becomes a past assignment, listed under "Past vendors" on the project and "Past projects" on the vendor, with its role, scope of work and note, and who removed it and when. A past assignment cannot be edited or restored. If the vendor comes back, staff assign it again, which creates a new current assignment. The vendor record, schedules, prices, costing sheets and timeline history are kept, as Features 001 and 002 already require.

**Why this priority**: The firm wants to know who worked on a project, including vendors who left part way. Today removal loses the role, scope and note.

**Independent Test**: Assign a vendor with a role, scope and note, remove it, and confirm it appears under Past vendors and Past projects with those details and the remover and time. Assign the same vendor again and confirm a new current assignment appears while the past one remains.

**Acceptance Scenarios**:

1. **Given** a current assignment with a role, scope and note, **When** a staff member removes it, **Then** the vendor no longer appears among the project's current vendors, the vendor record is unchanged, the vendor's schedules on that project are archived as Feature 001 FR-028 requires, and timeline items naming that vendor have their responsible vendor cleared as Feature 002 FR-005 requires.
2. **Given** an assignment was removed, **When** a staff member opens the history of the vendor or of the project, **Then** the removal is shown with the person and the time.
3. **Given** an assignment with role "Carpentry", scope "Wardrobes" and a note was removed, **When** a staff member opens the project page, **Then** it appears under Past vendors with the vendor name (opening the vendor profile), that role, scope and note, the person who removed it, and the date and time of removal, and it does not appear among current vendors.
4. **Given** the same removed assignment, **When** a staff member opens the vendor profile, **Then** it appears under Past projects with the project name (opening the project), the same details, and the remover and time.
5. **Given** an assignment was removed, **When** the vendor's project count, the project's vendor count, or any assignment status is shown, **Then** the past assignment is not counted and shows no assignment status.
6. **Given** a past assignment, **When** any staff member tries to edit its role, scope or note, restore it, or delete it, **Then** no such action is offered and the server refuses the request.
7. **Given** a vendor has a past assignment on a project, **When** a staff member assigns that vendor to the same project again, **Then** a new current assignment is created with its own role, scope and note, and the past assignment stays unchanged under Past vendors.
8. **Given** a vendor has been removed from and assigned to the same project twice, **When** the project page is opened, **Then** both past assignments are listed, newest removal first, and one current assignment is shown.
9. **Given** an archived project or an archived vendor, **When** a staff member removes one of its assignments as Feature 001 permits, **Then** it becomes a past assignment in the same way.

---

### User Story 5 - See project dates, progress and what needs attention (Priority: P3)

A staff member opens the project directory and sees, for each project, its status, start date, expected completion date, number of assigned vendors, progress, and whether it has overdue items or items due soon. They can search projects by name, client or site, and filter to projects that need attention. Opening a project shows an overview with the same facts, the assigned vendors, and the existing timeline, with overdue items easy to spot. Staff enter the start and expected completion dates (FR-014). Progress counts Done items out of all items (FR-016). Each project carries a health label, Completed, Delayed or Ongoing (FR-017), which is about the project as a whole: one late activity shows in the overdue count, not as Delayed.

**Why this priority**: Staff decide where to spend the day from the project list. Today it shows only name, client, site and status.

**Independent Test**: With four seeded projects in different states, open the directory, confirm each row shows the listed facts, search by client name, filter to projects with overdue items, and open one project to confirm its overview matches the row.

**Acceptance Scenarios**:

1. **Given** projects in the statuses Planned, Active, On hold and Completed, **When** a staff member opens the project directory, **Then** each project shows its name, client, status (as text and a matching visual marker), start date and expected completion date (or "Not set"), number of current assignments, progress as "N of M items done" (FR-016), number of overdue items, and its earliest open deadline.
2. **Given** a search text, **When** the staff member searches the project directory, **Then** only projects whose name, client name or site location contains the text, ignoring letter case, are shown.
3. **Given** the filter "Has overdue items", **When** it is applied, **Then** only projects with at least one Overdue item (Feature 002 FR-012) are shown.
4. **Given** the filter "Has items due in the next 7 days", **When** it is applied, **Then** only projects with at least one open item whose deadline is today or within the next 7 days are shown.
5. **Given** the existing status filter from a dashboard tile and the include-archived choice, **When** the staff member uses them, **Then** they behave as today.
6. **Given** a project, **When** a staff member opens it, **Then** an overview at the top shows name, status, client, site, start date, expected completion date, progress, number of overdue items, and up to 5 open items with the earliest deadlines, each opening that item on the timeline.
7. **Given** a project with no timeline items, **When** progress is shown, **Then** it says "No activities yet" and shows no percentage or bar.
8. **Given** a project page, **When** the staff member scrolls to the timeline, **Then** the Feature 002 timeline behaves exactly as before, with Overdue, Due soon and Missing update flags shown on each item.
9. **Given** a staff member allowed to edit projects, **When** they create or edit a project, **Then** the form offers name (required), client name, site location, description and status, as Feature 001 FR-023 requires, plus an optional start date and an optional expected completion date.
10. **Given** a project form with an expected completion date earlier than its start date, **When** the staff member saves, **Then** the system names both fields, explains the problem, and saves nothing.
11. **Given** a project whose expected completion date is changed, **When** a staff member opens the project's history, **Then** the previous and new dates are shown with the person and the time.
12. **Given** a project whose status was set to Completed on 3 December, **When** a staff member opens it, **Then** the overview shows "Completed on 3 December". If the status is later changed away from Completed, no completion date is shown.
13. **Given** a project that was already Completed before Feature 003 history began, so no history entry records when, **When** it is opened, **Then** the overview shows "Completed" with no date.
14. **Given** a project with expected completion date 20 December and two open items with deadlines 22 December and 5 January, **When** a staff member opens the project, **Then** the overview says "2 items are due after the expected completion date", and both items are marked "After project completion date" on the timeline. Both items stay saved and editable.
15. **Given** that project, **When** one of those items is set to Done or its deadline is moved to 20 December or earlier, **Then** it is no longer marked or counted.

---

### User Story 6 - See what needs attention across the firm (Priority: P4)

A staff member opens the dashboard and sees open timeline items in five deadline groups: Overdue, Due today, Coming soon, Upcoming, and All. Each item appears in exactly one of the first four groups. The staff member can narrow the items by project, responsible party, and status, and sort them by deadline, project, or most recent update. Every entry opens its item, its project, and its responsible vendor. The existing Missing update list, the 10 most recent delays and coordination issues, and the count and money tiles stay. A project-level section lists the projects that need attention: Delayed projects, and Ongoing projects with overdue items, each with the reason it is listed.

**Why this priority**: The dashboard answers "what needs attention right now?". It builds on every earlier story.

**Independent Test**: With seeded items whose deadlines fall yesterday, today, in 3 days, in 20 days, and in 90 days, open the dashboard and confirm each item is in the expected group and appears in no other deadline group, that All contains all five, that filtering by one project leaves only its items, and that each entry opens the right item, project and vendor.

**Acceptance Scenarios**:

1. **Given** an open item on an active project with a deadline before today, **When** a staff member opens the dashboard, **Then** it is in Overdue with the number of days overdue, and in no other deadline group.
2. **Given** an open item whose deadline is today, **When** the dashboard is opened, **Then** it is in Due today, and in no other deadline group.
3. **Given** an open item whose deadline is 1 to 7 days after today, **When** the dashboard is opened, **Then** it is in Coming soon, and in no other deadline group.
4. **Given** open items whose deadlines are 8 days and 30 days after today, **When** the dashboard is opened, **Then** both are in Upcoming, and in no other deadline group.
5. **Given** open items in every group and one whose deadline is 31 days after today, **When** the staff member chooses All, **Then** every open item on active projects is listed once, including the one beyond the Upcoming range.
6. **Given** a Done item, an archived item, or an item on an archived project, **When** the dashboard is opened, **Then** it appears in no deadline group, as in Feature 002 FR-021.
7. **Given** the staff member filters by one project, **When** any deadline group is shown, **Then** it lists only that project's items.
8. **Given** the staff member filters by responsible party (one vendor, "Firm team", or "None"), **When** a group is shown, **Then** it lists only items with that responsible party.
9. **Given** the staff member filters by status Not started or In progress, **When** a group is shown, **Then** it lists only items with that status.
10. **Given** a group, **When** no sort is chosen, **Then** it is sorted earliest deadline first, which for Overdue is most days overdue first, as in Feature 002 FR-022.
11. **Given** the staff member sorts by project or by most recent update, **When** the group is shown, **Then** items are ordered by project name, or by the date of their latest progress update, newest first.
12. **Given** an In progress item with no update for more than 7 days, **When** the dashboard is opened, **Then** it appears in the Missing update list as in Feature 002 FR-014, as well as in its deadline group.
13. **Given** delays and coordination issues on active projects, **When** the dashboard is opened, **Then** the 10 most recent appear, newest first, as in Feature 002 FR-022.
14. **Given** a dashboard entry, **When** the staff member selects the item, the project name, or the responsible vendor's name, **Then** the item on its project's timeline, the project, or the vendor profile opens.
15. **Given** a filter that leaves a group with no items, **When** it is shown, **Then** the group says no items match and the filters stay as set.
16. **Given** an Office Team member, an Accountant and an Administrator, **When** each opens the dashboard, **Then** they see the same groups, lists and counts. Client-advance amounts follow Feature 003 FR-017 and FR-025 unchanged.
17. **Given** project P1 whose expected completion date was yesterday and project P2 with no missed project date but one overdue item, **When** the dashboard is opened, **Then** the attention section lists P1 labelled Delayed with the reason "Past expected completion date", and P2 labelled Ongoing with the reason "1 overdue item".
18. **Given** an Ongoing project with no overdue items, a Completed project, and an archived project whose expected completion date has passed, **When** the dashboard is opened, **Then** none of them is in the attention section.
19. **Given** a project that is Delayed and also has overdue items, **When** the attention section is shown, **Then** it is listed once, labelled Delayed, with both reasons.

---

### User Story 7 - Move around the application easily (Priority: P5)

Every page has a profile menu at the top right with the signed-in person's name, role and email, the existing change-password form, and sign out. Navigation labels are clear, and vendor and project names open their records wherever they appear. Lists that are empty say why and offer the next step. After a create, update, archive or restore, the person sees a short confirmation. When something fails, the message says what went wrong in plain language without technical details.

**Why this priority**: These changes make the application usable without training. They do not change what the system stores.

**Independent Test**: Sign in as each role, open the profile menu, change password, sign out, and visit every main page. Create, edit and archive a vendor and confirm a confirmation message after each. Submit a vendor form with the name missing and confirm the message names the field. Open each list type empty and confirm its empty message.

**Acceptance Scenarios**:

1. **Given** a signed-in staff member on any page, **When** they open the profile menu at the top right, **Then** it shows their name, role and email, the change-password form, and Sign out.
2. **Given** the profile menu, **When** the staff member signs out, **Then** their session ends exactly as the current Sign out does.
3. **Given** the profile menu, **When** the staff member changes their password, **Then** the behaviour is unchanged from Feature 001 FR-009.
4. **Given** a staff member who is not an Administrator, **When** they look at the navigation, **Then** staff management is not shown, as today, and the server still refuses staff actions (Feature 001 FR-008).
5. **Given** a vendor, project, assignment, document or timeline item is created, updated, archived or restored successfully, **When** the change is saved, **Then** a short confirmation names what happened, for example "Vendor archived".
6. **Given** a save is refused because a required field is missing or invalid, **When** the message is shown, **Then** it names each field and the problem, as the server already reports.
7. **Given** an action is refused because the role is not allowed, **When** the message is shown, **Then** it says the person is not allowed to do this and shows no technical detail.
8. **Given** an unexpected server failure, **When** the message is shown, **Then** it says the action did not complete and to try again, with no error codes, stack traces, or internal names.
9. **Given** each empty list named in [FR-031](#usability-prd-section-8), **When** it is shown, **Then** it shows its stated empty message, and the next action where the person is allowed to take it.

---

### User Story 8 - Demonstrate the system with realistic fictional data (Priority: P5)

A developer or the product owner starts the application with its seed data and finds about 10 fictional vendors and 3 to 4 fictional projects that show every state this feature introduces: vendors on several projects and on one, projects in each status, items in each dashboard group, completed work, and assignment statuses. All names, phone numbers and email addresses are fictional. Running the seed again changes nothing that already exists.

**Why this priority**: The improved views can only be demonstrated and reviewed with varied data. It changes no user-facing behaviour.

**Independent Test**: Seed an empty database, count the records, run the seed again, and confirm the counts are unchanged and no existing record was modified. Open the dashboard and confirm every deadline group has at least one item.

**Acceptance Scenarios**:

1. **Given** an empty database, **When** the seed runs, **Then** it creates between 9 and 12 vendors in at least 6 different categories and 3 or 4 projects with at least three different statuses.
2. **Given** the seeded data, **When** a staff member looks at vendors, **Then** at least two vendors are on more than one project and at least three are on exactly one.
3. **Given** the seeded data, **When** a staff member opens the dashboard on the day the seed ran, **Then** Overdue, Due today, Coming soon, Upcoming and Missing update each contain at least one item, and at least one project has a Done item.
4. **Given** the seed already ran, **When** it runs again, **Then** no record is created twice, and no existing record, including records staff entered, is changed or deleted.
5. **Given** the seeded people, vendors and projects, **When** their contact details are inspected, **Then** every email uses a reserved example domain and every phone number is in the fictional range the existing seed uses.

---

### Edge Cases

#### Assignment-status situations

"The vendor's items" means the non-archived timeline items on that project whose responsible vendor is that vendor. "Overdue" is the Feature 002 FR-012 flag.

| Situation | Status |
| --- | --- |
| Vendor just assigned, nothing else has happened | No activities |
| The vendor has no items on the project | No activities |
| The vendor's only items on the project are archived | No activities |
| All the vendor's items are Not started, none Overdue | Not started |
| At least one item In progress, none Overdue | In progress |
| Some items Done and some Not started, none Overdue | In progress |
| At least one open item Overdue, whatever the others are | Delayed |
| Mixed: one Done, one In progress, one Overdue | Delayed |
| All the vendor's items Done, including any finished after their deadline | Completed |
| The project is archived | Worked out the same way for today, as Feature 002 shows flags on an archived project's timeline |
| The project status is On hold or Completed | Worked out the same way. Project status does not change it, as Feature 002 detection is not paused by project status |
| The vendor is archived but still assigned | Worked out the same way |

#### Other edge cases

- **Vendor on many projects**: the profile lists every assignment. Very long lists stay readable on a phone screen.
- **Same vendor removed and assigned again to the same project**: the past assignment stays as it is and a new current assignment is created (FR-013b). Feature 001 FR-026 still refuses a second current assignment for the same pair.
- **Assignment on an archived project**: it is listed on the vendor profile, marked archived, and not counted among current projects. Its status is worked out as for any assignment (FR-010).
- **Archived vendor still assigned**: the project page lists it, marked archived, with its last known phone number and contact person.
- **Vendor with no contact person or no categories**: the list and project page show "No contact person". A vendor always has at least one category under Feature 001 FR-013.
- **Project with no vendors**: the project page says no vendors are assigned yet and, for people allowed to edit links, offers to assign one.
- **Project with no timeline items**: progress says "No activities yet", no overdue count, no earliest deadline. Its health is Ongoing, or Delayed if its expected completion date has passed.
- **Expected completion date is today**: the project is Ongoing. It becomes Delayed the next day, at midnight India Standard Time.
- **Delayed project set to Completed**: it becomes Completed and leaves the attention section, whatever its dates or open items.
- **Delayed project given a later expected completion date**: it becomes Ongoing at once. The earlier date stays readable in the project's history (FR-015a).
- **Project On hold past its expected completion date**: Delayed. Project status On hold does not pause the health rule, as Feature 002 detection is not paused by status.
- **Archived project**: shows its health label when opened, and never appears in the dashboard attention section, which covers active projects only.
- **All items archived**: treated as no items for progress.
- **Item deadline equal to the project's expected completion date**: not marked. One day later: marked "After project completion date" (FR-015b).
- **Project expected completion date removed**: every "After project completion date" marker on that project disappears.
- **Item deadline today**: in Due today only. Its Feature 002 flag is still Due soon on the project timeline.
- **Item deadline exactly 7 days after today**: in Coming soon. 8 days after today: in Upcoming. 30 days after today: in Upcoming. 31 days after today: only in All.
- **Item beyond the Upcoming range**: in no dated group, only in All.
- **Item both Overdue and Missing update**: in Overdue and in the Missing update list, not in two deadline groups.
- **Midnight in India**: groups move at midnight India Standard Time, not at the server's or browser's midnight.
- **Two staff members change the same assignment at once**: both changes are kept in the order saved, and history shows both.
- **Signed-out or revoked person**: every new view and action is refused, as every existing route is.
- **Large data**: 200 vendors (Feature 001 SC-003) and tens of projects with tens of items each (Feature 002 assumption).

## Requirements *(mandatory)*

### Functional Requirements

#### Vendor profile (FR-01, FR-04)

- **FR-001**: The vendor profile MUST list every current assignment of the vendor with the project name, the project's status, whether the project is archived, the role on the project, the scope of work, the note, and the assignment status ([FR-010](#assignment-status-fr-04-fr-05)). Each project name MUST open that project. This also meets Feature 001 FR-015 and User Story 4 scenario 3, which require an archived vendor's links to stay visible ([Backward Compatibility](#feature-001-corrections-delivered-here)).
- **FR-002**: The vendor profile MUST show the number of the vendor's current assignments on projects that are not archived, labelled as the number of projects. Assignments on archived projects MUST be listed but not counted. Removed assignments MUST NOT be counted.
- **FR-003**: The vendor profile MUST group the existing vendor information into clearly headed sections: contact details (name, contact person, phone, alternate phone, email, address), what the vendor does (categories, services, materials, locations served), manpower (team size, availability, manpower note), GST details, indicative rates, rating, notes, documents, and history. No existing field or action MUST be removed.

#### Vendor directory (FR-01, PRD success criterion 2)

- **FR-004**: Each vendor in the directory list MUST show name, contact person, phone number, categories, locations served, availability, project count as defined in FR-002, and an archived marker when archived.
- **FR-005**: Vendor search and filters MUST behave exactly as Feature 001 FR-014 and FR-030 (Feature 003) define, including search by name, phone, contact person, services and materials, and filters by category, location served, availability, linked project and include archived.

#### Project page vendors (FR-03, FR-04)

- **FR-006**: The project page MUST list every current assignment with the vendor's name, phone number, contact person, categories, an archived marker when the vendor is archived, the role on the project, the scope of work, the note, and the assignment status. Each vendor name MUST open the vendor profile.
- **FR-007**: Vendor details shown on the project page and in the vendor directory MUST be read from the vendor record at the time the page is shown. No vendor detail MUST be copied onto a project or an assignment, as Feature 001 FR-027 requires.

#### Project directory and overview (FR-03, FR-05, PRD section 8)

- **FR-008**: Each project in the project directory MUST show name, client name, status as text with a matching visual marker, start date and expected completion date ([FR-014](#project-dates-fr-03-fr-05)), number of current assignments, progress ([FR-016](#progress-and-health-fr-05-fr-06)), health label (FR-017), number of Overdue items, the earliest deadline among its open items, and an archived marker when archived. Statuses MUST stay Planned, Active, On hold and Completed (Feature 001 FR-023).
- **FR-009**: The project directory MUST offer a text search that matches the project name, client name or site location, ignoring letter case, and filters "Has overdue items" and "Has items due in the next 7 days". The existing status filter and include-archived choice MUST keep working. Search and filters MUST combine, and a project MUST match all of them.
- **FR-009a**: The project page MUST start with an overview showing name, status, client name, site location, start date, expected completion date, health label (FR-017), progress, number of Overdue items, and up to 5 open items with the earliest deadlines, each opening that item on the project timeline. The existing timeline, links, schedules, pricing, documents, advances and history sections MUST keep their current behaviour.

#### Assignment status (FR-04, FR-05)

- **FR-010**: Each current assignment MUST show exactly one assignment status, the same on the vendor profile and the project page. The status MUST be worked out from the vendor's items: the non-archived timeline items on that project whose responsible vendor is that vendor. The first rule that matches MUST decide it:
  1. The vendor has no items → **No activities**.
  2. Any of the vendor's items is Overdue (Feature 002 FR-012) → **Delayed**.
  3. All the vendor's items are Done → **Completed**.
  4. Any of the vendor's items is In progress or Done → **In progress**.
  5. Otherwise, all items are Not started → **Not started**.
- **FR-011**: The rule in FR-010 MUST give the status listed in the [assignment-status situations](#assignment-status-situations) table for each situation there. Items with Firm team or no responsible party MUST NOT count toward any vendor's assignment status.
- **FR-012**: The assignment status MUST be worked out each time it is shown and MUST NOT be stored or set by staff, as with Feature 002 flags (FR-015). The server MUST refuse any request that tries to set it. The assignment stores only its role, scope of work and note, as Feature 001 FR-027 requires.

#### Assignment history (FR-04, FR-15)

- **FR-013**: Removing a vendor from a project MUST NOT delete the assignment. It MUST become a past assignment that keeps its role, scope of work and note unchanged, and records the person who removed it and the date and time of removal. A past assignment MUST NOT be edited, restored or deleted by anyone, and the server MUST refuse such requests.
- **FR-013a**: The project page MUST list past assignments under "Past vendors", and the vendor profile under "Past projects", separate from current assignments, newest removal first, each with role, scope of work, note, who removed it, and when. Each MUST open the vendor or project.
- **FR-013b**: Only one current assignment MAY exist for the same vendor and project, as Feature 001 FR-026 requires. Assigning a vendor that has only past assignments on a project MUST create a new current assignment and MUST leave every past assignment unchanged. One vendor MAY have several past assignments on the same project.
- **FR-013c**: Removing an assignment MUST keep every existing effect: the vendor record stays, the vendor's schedules on that project are archived and remain readable (Feature 001 FR-028), and timeline items with that vendor responsible are kept with the responsible vendor cleared (Feature 002 FR-005).
- **FR-013d**: Creating an assignment, editing its role, scope or note, and removing it MUST each be recorded in the history of both the vendor and the project, with the person, the time, and for edits the previous and new values, following Feature 003 FR-027 and FR-028.
- **FR-013e**: A removed assignment MUST NOT count toward any project count, vendor count, or assignment status on the dashboard or in lists.

#### Project dates (FR-03, FR-05)

- **FR-014**: A project MUST have an optional start date and an optional expected completion date, entered by staff who may edit projects when creating or editing the project. They MUST NOT be worked out from timeline items. Where a date is empty, the project MUST show "Not set". Existing projects MUST start with both dates empty.
- **FR-014a**: No actual completion date MUST be stored. When a project's status is Completed, the overview MUST show the date and time the status was last set to Completed, taken from the project's history (Feature 003 FR-027). When no history entry records it, the overview MUST show "Completed" with no date.
- **FR-015**: The project's expected completion date and the deadlines of its milestones and activities MUST be shown as different things, labelled "Project expected completion" and "Deadline". They MUST be independent: no project date MUST refuse or change an item date, and no item date MUST refuse or change a project date. A milestone MUST NOT be treated as the project deadline.
- **FR-015b**: When a project has an expected completion date, each open item whose deadline is later than that date MUST be marked "After project completion date" on the project timeline, and the project overview MUST state how many such items there are. Done items, archived items, and items whose deadline is on or before the expected completion date MUST NOT be marked or counted. When the project has no expected completion date, nothing MUST be marked. The marker MUST be worked out each time it is shown and MUST NOT be set by staff. It is not one of the Feature 002 flags and does not place the item in any dashboard group.
- **FR-015a**: Project dates MUST be calendar dates in India Standard Time with no time of day, as Feature 002 FR-003 defines. When both are given, an expected completion date earlier than the start date MUST be refused with a message naming both fields. A completion date equal to the start date MUST be allowed. Each change MUST be recorded in the project's history with the previous and new values, the person and the time (Feature 003 FR-027), keeping the previous date, the person and the time readable.

#### Progress and health (FR-05, FR-06)

- **FR-016**: Each project MUST show its progress as the number of its Done items out of all its non-archived timeline items, milestones and activities counted alike, in the form "N of M items done", with a bar filled in the same proportion. An item counts as Done when its current status is Done (Feature 002 FR-011).
- **FR-016a**: A project with no non-archived items MUST show "No activities yet" and no number or bar. Archived items MUST NOT count. Progress MUST state what it counts, for example "12 of 20 items done", and MUST NOT be labelled as project health.
- **FR-017**: Each project MUST show one health label, decided by the first rule that matches:
  1. The project status is Completed → **Completed**.
  2. The project has an expected completion date and today is after it → **Delayed**.
  3. Otherwise → **Ongoing**. This includes projects with no expected completion date, projects with no items, and projects with status Planned or On hold.

  Overdue items MUST NOT change the label. The label MUST appear on the project directory, the project overview and the dashboard attention section.
- **FR-017a**: The interface MUST distinguish a project that is delayed overall (label Delayed) from a project that has one or more overdue items (its overdue count), and MUST NOT show one as the other. A project's health MUST be worked out from recorded data each time it is shown, and staff MUST NOT be able to set it directly.

#### Dashboard (FR-05, FR-06)

- **FR-018**: The dashboard MUST show open items on active projects in five deadline groups, chosen one at a time: **Overdue** (deadline before today), **Due today** (deadline today), **Coming soon** (deadline 1 to 7 days after today), **Upcoming** (deadline 8 to 30 days after today), and **All** (every open item on active projects, whatever its deadline). Overdue, Due today, Coming soon and Upcoming MUST NOT overlap: each open item MUST be in at most one of them.
- **FR-019**: Each deadline group MUST show, per item, the item name and type, project name, responsible party (vendor name, "Firm team", or "None"), deadline, current status, and for Overdue the number of days overdue. Each group MUST state how many items it holds.
- **FR-020**: The dashboard MUST offer filters by project, by responsible party (a vendor, "Firm team", or "None"), and by status (Not started or In progress). Filters MUST combine and MUST apply to the chosen deadline group.
- **FR-021**: The dashboard MUST offer sorting by deadline (the default: earliest first, which for Overdue is most days overdue first), by project name, and by most recent progress update, newest first. Items with no progress update MUST sort last under "most recent update".
- **FR-022**: The Missing update list (Feature 002 FR-014 rule) and the 10 most recent delays and coordination issues (Feature 002 FR-022) MUST stay on the dashboard with their current behaviour. The count and money tiles (Feature 003 FR-023 to FR-026) MUST stay with their current counts, amounts, wording and permissions, and each tile MUST still open the list behind it.
- **FR-023**: Every dashboard item MUST open the item on its project's timeline. Every project name MUST open the project. Every responsible vendor name MUST open the vendor profile. Every delay or coordination issue MUST open its project at that record. No dashboard element that looks selectable MUST be a dead end.
- **FR-023a**: The dashboard MUST show a project-level section listing active projects that need attention, kept separate from the item-level deadline groups. A project needs attention when it is Delayed, or when it is Ongoing and has at least one Overdue item. Each listed project MUST appear once, with its name (opening the project), health label, progress (FR-016), and each reason that applies: "Past expected completion date" and "N overdue items". Delayed projects MUST come first, then by most overdue items. Completed projects MUST NOT be listed, even with overdue items. Every staff member MUST see the same dashboard, as in Feature 002 FR-020, apart from the money tiles governed by Feature 003 FR-025.

#### Timeline view

- **FR-023b**: This feature MUST NOT include a Gantt-style view or any chart other than the per-project progress bar (FR-016). The project timeline stays the Feature 002 dated list. A Gantt-style view is a candidate for a later feature, once staff have used the views in this one and the PRD question on timeline views (section 10) is answered.

#### Usability (PRD section 8)

- **FR-024**: Every signed-in page MUST have a profile menu at the top right showing the person's name, role and email, the existing change-password form (Feature 001 FR-009), and Sign out. The menu MUST be usable with a keyboard. Sign-in, sign-out, sessions and password rules MUST NOT change.
- **FR-025**: The main navigation MUST keep one level, with clear section labels, and MUST mark the current section. Staff management MUST stay visible only to Administrators, and the server MUST still refuse other roles (Feature 001 FR-008). Vendor and project names MUST open their records wherever they appear in lists, profiles and the dashboard.
- **FR-026**: After a successful create, update, archive, restore, assignment or removal, the interface MUST show a short confirmation naming the record and the action.
- **FR-027**: A refused save MUST name each field and its problem in plain language. A refusal because of role MUST say the person is not allowed to do this. An unexpected failure MUST say the action did not complete and to try again, and MUST NOT show error codes, stack traces, database or internal names.
- **FR-028**: Status, overdue and archived information MUST be shown as text as well as colour or icon, so it can be understood without seeing colour.
- **FR-029**: The same icons, colours and wording MUST be used for the same meaning on every page, for example one marker for "archived" and one set of markers for project statuses and assignment statuses.
- **FR-030**: Every page MUST be usable at a phone width of 375 pixels and a computer width of 1280 pixels without sideways scrolling of the page, as Feature 001 SC-007 and Feature 002 SC-008 already require.
- **FR-031**: Each of these lists MUST show the stated empty message and, where the person is allowed, the next action:
  - Vendor directory with no vendors: "No vendors have been added yet", with Add vendor and Import spreadsheet.
  - Vendor directory with no matches: "No vendors match your search and filters".
  - Project directory with no projects: "No projects have been created yet", with Add project.
  - Project directory with no matches: "No projects match your search and filters".
  - Project with no vendors: "No vendors are assigned to this project yet", with Assign a vendor.
  - Vendor with no projects: "This vendor is not assigned to any project yet".
  - Each empty deadline group: "No overdue items", "Nothing due today", "Nothing due in the next 7 days", "No upcoming items", or "No open items".
  - Project with no timeline items: "No activities yet", with Add an item.

#### Demonstration data

- **FR-032**: The seed data MUST provide between 9 and 12 fictional vendors across at least 6 categories, and 3 or 4 fictional projects covering at least three of the four statuses. At least two vendors MUST be assigned to more than one project and at least three to exactly one. Assignments MUST carry different roles and scopes.
- **FR-033**: Relative to the day the seed runs, the seed MUST create open items in each of Overdue, Due today, Coming soon and Upcoming, at least one Missing update item, at least one Done item, and assignments showing each of No activities, Not started, In progress, Delayed and Completed. At least one past assignment MUST be seeded, and at least one open item MUST have a deadline after its project's expected completion date.
- **FR-034**: Every seeded person, vendor and project MUST be fictional. Emails MUST use the reserved `example.com` domain, and phone numbers MUST use the fictional range the existing seed uses. The three existing seeded staff accounts, one per role, MUST be kept.
- **FR-035**: Running the seed again MUST NOT create duplicates and MUST NOT change or delete any existing record, including records created by staff, following the find-or-create behaviour the current seed already uses.

#### Access and integrity

- **FR-036**: Every new view and action MUST require a signed-in, active staff member, checked on the server for every request. Administrators, Office Team members and Accountants MUST all be able to view everything this feature shows, apart from client-advance amounts, which follow Feature 003 FR-017 and FR-025 unchanged.
- **FR-037**: Removing an assignment and entering or changing project dates MUST be allowed to exactly the roles that may edit vendor-project links and projects under Feature 001 FR-010, which today is all three roles. No new permission MUST be introduced, and only Administrators MUST manage staff accounts.
- **FR-038**: Every new stored record or field MUST follow constitution Principle III: audit columns on every table, archive rather than hard delete for vendors, projects and documents, and schema changes only through committed migrations. No existing data MUST be lost or rewritten by this feature's migrations.

#### Boundaries

- **FR-039**: This feature MUST NOT include branding, a logo, a favicon or a product name (Feature 005); project area, costing, budget or design-style fields; quotations, purchase or work orders, deliveries, invoices or payments; new accounting functions; a client approval workflow; dependencies between timeline items; reminders or notifications; or replacement of the authentication system.
- **FR-040**: This feature MUST NOT change the behaviour of Features 001, 002 or 003 except where the [Backward Compatibility](#backward-compatibility) table names the superseded requirement and the change.

### Non-Functional Requirements

- **NFR-001**: With 200 vendors, 10 active projects and 30 timeline items each, the vendor directory, a vendor profile, the project directory, a project page and the dashboard MUST each show their content within 2 seconds on the firm's office connection.
- **NFR-002**: Every derived value (project count, assignment status, progress, health, deadline group, flags) MUST reflect the data saved at the moment the page is opened, as Feature 002 FR-015 and Feature 003 FR-026 already require.
- **NFR-003**: All dates and "today" MUST use India Standard Time (Feature 002 FR-003).
- **NFR-004**: Every action in this feature MUST be reachable with a keyboard and readable by a screen reader, with labels on every control.
- **NFR-005**: Messages, labels and empty states MUST use plain English that office staff understand without training, and MUST NOT use internal terms such as "link", "entity", "record id" or error codes.

### Key Entities

- **Assignment** (existing vendor-project link, Feature 001): one vendor on one project, with role on the project, scope of work and note. Shows an assignment status that is worked out, not stored (FR-010). It gains a removed state recording who removed it and when. A removed assignment is a past assignment: read-only, never restored, never deleted. One vendor can have many assignments, and one project can have many. Only one current assignment can exist for the same vendor and project, alongside any number of past ones.
- **Assignment status**: one of No activities, Not started, In progress, Delayed or Completed per current assignment, worked out each time from the vendor's non-archived timeline items on the project (FR-010). Stores nothing and cannot be set by hand.
- **Project** (existing, Feature 001): gains an optional start date and an optional expected completion date, entered by staff (FR-014). No actual completion date is stored; the date the project became Completed is read from its history (FR-014a). Status stays Planned, Active, On hold or Completed.
- **Project progress**: Done items out of all non-archived timeline items, milestones and activities alike (FR-016), worked out each time. Stores nothing.
- **Project health**: Completed, Delayed or Ongoing (FR-017), worked out each time from the project's status, expected completion date and today. Stores nothing and cannot be set by hand. Separate from the project status that staff choose.
- **Deadline group**: one of Overdue, Due today, Coming soon, Upcoming or All, worked out from an open item's deadline and today. Stores nothing.
- **History entry** (existing, Feature 003): gains assignment events, recorded against both the vendor and the project.
- **Existing entities read and not changed**: vendor and its categories, rates, notes and ratings; timeline items, progress updates, date changes, delays and coordination issues; work schedules and prices; documents; client advances; staff accounts and sessions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Starting from the vendor directory, a staff member can name every project a given vendor is assigned to, with the vendor's role on each, in under 30 seconds.
- **SC-002**: Starting from a project page, a staff member can read the phone number and contact person of any assigned vendor in under 15 seconds without leaving the page.
- **SC-003**: For a test set with items due yesterday, today, in 1, 7, 8 and 200 days, Done items, archived items and items on archived projects, 100% of items land in the expected deadline group, and no item appears in two of Overdue, Due today, Coming soon and Upcoming.
- **SC-004**: From the dashboard, a staff member can list every project with overdue work across 10 active projects in under 1 minute.
- **SC-005**: In a walkthrough with a staff member who has not used the system before, at least 4 of these 5 tasks are completed on the first attempt without help: find a vendor's phone number, see which projects a vendor is on, open an overdue item, narrow the dashboard to one project, sign out from the profile menu.
- **SC-006**: Every acceptance scenario of Features 001, 002 and 003 that this feature does not supersede still passes its automated test unchanged.
- **SC-007**: Running the seed twice in a row leaves the number of every kind of record unchanged after the second run, and no record created by staff before the second run is modified.
- **SC-008**: In every test, a signed-out or revoked person is refused every new view and action.
- **SC-009**: For any project, the progress shown equals the count worked out by hand from its non-archived items, and a project with no items shows "No activities yet".

## Open Questions

Each question was a product decision that constitution Principle I forbids an agent from choosing. All were answered by the product owner in `/speckit-clarify` on 2026-11-08.

| ID | Question | Why it matters | Options to consider |
| --- | --- | --- | --- |
| OQ-1 | How is an assignment's status decided? | Decides whether staff maintain the same information twice. | **Resolved 2026-11-08**: worked out from the timeline (FR-010). |
| OQ-2 | When a vendor is removed from a project, is the assignment kept as a past assignment? | Today removal deletes the link and loses role, scope and note. | **Resolved 2026-11-08**: kept as a past assignment, not restorable (FR-013). |
| OQ-3 | How are project start and expected completion dates kept, and is an actual completion date needed? | Decides whether projects gain fields that staff fill in. | **Resolved 2026-11-08**: entered by staff, both optional; no actual completion date (FR-014, FR-014a). |
| OQ-4 | How does the project's expected completion date relate to milestone and activity deadlines? | Avoids treating the last milestone as the project deadline without approval. | **Resolved 2026-11-08**: independent, with items after the project date pointed out (FR-015, FR-015b). |
| OQ-5 | What range does the Upcoming group cover? | Defines the dashboard group and its tests. | **Resolved 2026-11-08**: 8 to 30 days after today (FR-018). |
| OQ-6 | How is project progress counted? | Prevents a misleading percentage. | **Resolved 2026-11-08**: Done items out of all non-archived items (FR-016). |
| OQ-7 | Should projects show a health label, and what decides it? | "Delayed project" and "project with one late activity" must not be confused. | **Resolved 2026-11-08**: Completed, Delayed or Ongoing (FR-017). |
| OQ-8 | Is a Gantt-style timeline view included or deferred? | Feature 002 FR-029 ruled out charts. A Gantt view is a large addition. | **Resolved 2026-11-08**: deferred (FR-023b). |

Feature 001 product-owner questions that remain open and are not answered by this specification:

- **T092**: may an administrator set their own password through the staff route without the current password?
- **T093**: is a vendor edit a full replacement or a partial update?
- **T094**: how is a task with no mapped acceptance scenario that changes configuration or tests, or runs checks, completed under Principle V?

They do not block this feature. They stay with Feature 001 and are listed here so they are not treated as answered.

## Backward Compatibility

### Requirements this feature may supersede

The original specifications stay unchanged. This is the final list after clarification on 2026-11-08.

| Earlier requirement | Current behaviour | Change in this feature | Applies if |
| --- | --- | --- | --- |
| Feature 001 FR-028 | Removing a link removes the association. | A removed assignment is kept as a read-only past assignment with who removed it and when. Its other effects stay. | Always |
| Feature 001 FR-026 | A second link for the same vendor and project is refused. | Unchanged for current assignments. Any number of past assignments may exist for the same pair, and a new current one may be created beside them. | Always |
| Feature 001 Key Entities, Project | Name, client, site, description, status, archive flag. | Adds an optional start date and an optional expected completion date, entered by staff. | Always |
| Feature 002 FR-020 | One dashboard with no filters. | Adds filters by project, responsible party and status, the same for every staff member. | Always |
| Feature 002 FR-022 | Each list has one fixed sort. | The fixed sort stays as the default. Adds sorting by project and by most recent update. | Always |
| Feature 002 FR-020 and FR-021 | Four lists: Overdue, Due soon, Missing update, Recent delays and issues. | Overdue and Due soon become the non-overlapping groups Overdue, Due today, Coming soon, Upcoming and All. Missing update and Recent delays and issues stay. The timeline item flags of FR-012 to FR-015 do not change. | Always |
| Feature 002 FR-023 | The dashboard shows only timeline and delay information. Already extended by Feature 003 tiles. | Adds a project-level attention section with health and progress. | Always |
| Feature 002 FR-029 | No charts beyond dated lists. | Allows a simple progress bar per project. Every other chart, including a Gantt-style view, stays ruled out. | Always |

### Feature 001 corrections delivered here

These are gaps between Feature 001's specification and its implementation. They are not new requirements and do not change Feature 001's specification.

- **Vendor profile does not show its project links.** Feature 001 FR-015 and User Story 4 scenario 3 require links to stay visible on an archived vendor's record, and the server already returns them. This feature delivers the display through FR-001. When implemented, the Feature 001 task list records the correction against those requirements.
- **Fuller project create and edit form (Feature 001 task T078).** Feature 001 FR-023 already requires client name, site location and description. This feature builds on the same form (User Story 5 scenario 9). Feature 004's task list includes T078 by reference and completes it in Feature 001's task list, rather than restating the requirement.

### Behaviour that stays unchanged

Search and filters (Feature 001 FR-014, Feature 003 FR-030), duplicate rules, roles and permissions, sessions and revocation, schedules and pricing, timeline item rules and flags, delays and coordination issues, import, documents, client advances, dashboard tiles and their permissions, and history.

## Dependencies

| Existing capability | Used for | Reference |
| --- | --- | --- |
| Sign-in, sessions, revocation, roles | Every new view and action | Feature 001 FR-001 to FR-010 |
| Vendors, categories, search and filters | Directory list, vendor profile, project page vendor details | Feature 001 FR-011 to FR-022, Feature 003 FR-030 |
| Projects, status, archive | Project directory, overview, dates | Feature 001 FR-023, FR-024 |
| Vendor-project links | Assignments, counts, status, history | Feature 001 FR-025 to FR-028 |
| Timeline items, progress updates, flags | Assignment status (if derived), progress, deadline groups | Feature 002 FR-001 to FR-015 |
| Dashboard lists | Missing update, recent delays and issues | Feature 002 FR-020 to FR-023 |
| Dashboard tiles | Kept unchanged | Feature 003 FR-023 to FR-026 |
| History | Assignment events | Feature 003 FR-027, FR-028 |
| Seed data and one-command start | Expanded demonstration data | Feature 001 plan, constitution Principle II |

## Assumptions

- The feature is built on the `004-dashboard` branch from `main`, which already includes Features 001 to 003 and the UI redesign.
- "Workload" in the brief is shown by the project count on the vendor list and profile and by the list of the vendor's projects with their statuses. No capacity calculation, calendar or hours are added. Feature 001 FR-019 states that availability is not a guarantee that a vendor is free.
- The visual review in FR-028 to FR-030 adjusts layout, spacing and markers within the existing design. It does not introduce a new visual identity, which belongs to Feature 005.
- Volume stays at hundreds of vendors and tens of active projects with tens of items each, as in Features 001 and 002.
- PRD section 5.2 lists "record work progress and completion" in Phase 2 for procurement work orders. Assignment status in this feature describes timeline progress already in Phase 1 (FR-05) and is not a work order. Because it is worked out from existing timeline data (FR-010), it adds no Phase 2 work tracking, as constitution Principle VI requires.

## Out of Scope

- Branding, logo, favicon, product name and new visual identity (Feature 005).
- Project area, costing, budgets and design style.
- Quotations, quotation comparison, purchase and work orders, deliveries, invoices, vendor payments and new accounting functions.
- A client approval workflow.
- Dependencies between timeline items and work sequencing (PRD Phase 2).
- Reminders and notifications (PRD FR-12).
- Report exports (PRD FR-13).
- Vendor self-service.
- A Gantt-style view (deferred to a later feature, FR-023b).
- Changes to roles, permissions or authentication.
