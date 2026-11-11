# Feature Specification: UI/UX Overhaul — Profile, Dashboard Overview, Project Sections and Visual Theme

**Feature Branch**: `005-ui-ux-overhaul`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "005 UI/UX overhaul. Seven required changes: 1 top-right profile icon with switch user, 2 descriptive dashboard with counts and real progress, 3 lists before collapsible add forms on Vendors and Projects, 4 configurable per-project blueprint sections, 5 multiple vendors assigned to individual project sections, 6 clear archived-state presentation with Active/Archived views and restore, 7 white/black/yellow/grey design system; plus 15 additional usability improvements. Builds on Feature 004. Preserve authentication, permissions and existing data; no demo impersonation; new stored data only through reviewed migrations; respect the Feature 004 FR-039 exclusions unless the product owner lifts them."

**Backlog coverage**: FR-01 (Vendor Management), FR-03 (Project Management), FR-04 (Vendor-Project Relationships: a vendor is associated with parts of a project without duplicating the vendor record), FR-05 (Timeline Management, shown through progress), FR-14 (Access Control, unchanged) and FR-15 (Audit History, for section and section-assignment changes) from `docs/prd.md`, and PRD section 8 Usability. All of it is PRD Phase 1. Nothing from Phase 2 (quotations, procurement, work orders) or Phase 3 (invoices, payments, project spending) is included as functionality.

## Problem Statement

Staff can record vendors, projects, assignments and timelines (Features 001 to 004), but the application is hard to learn and slow to use:

- Vendors and Projects open on a large add form, so existing records sit below the fold.
- A project is one undivided record. Staff cannot say which vendor is responsible for which part of the work, such as Execution or Site Coordination, only that a vendor is on the project.
- The dashboard answers "what is due" but not "how is the business doing": there are no vendor and project totals with archived counts, no percentages, no recent activity and no quick actions.
- Archived records sit behind an "Include archived" checkbox and look much like active ones, so staff fear archiving loses data.
- Switching between staff on a shared office computer means finding Sign out and starting over.
- The dark theme is hard to read in bright offices, and controls look different from page to page.

## Goals

1. A staff member new to the system can find, read and act on vendors and projects without training (SC-005).
2. Every project can be organised into its own sections, and each section shows which vendors are responsible for it.
3. The dashboard gives an accurate overview of vendors, projects and progress from saved data.
4. Archived records are clearly separate, visibly marked and easy to restore, and archiving loses nothing.
5. One consistent, accessible visual system is used on every page.

## Non-goals

- No change to authentication, sessions, password rules, roles or permissions, and no staff member acting as another (FR-032).
- No logo, favicon or product-name change.
- No budget or cost amounts, quotations, procurement, purchase or work orders, invoices, payments or reminders (PRD Phase 2 and 3). Procurement and Budget & Costing are text-only sections.
- No editable default blueprint and no blueprint templates beyond the one default (FR-014).
- No Gantt view or charts beyond progress bars (Feature 004 FR-023b).
- No new framework, component library or architectural rewrite (Constitution Principle II).
- No change to how assignment status, health, deadline groups or flags are worked out (Feature 004).

## Clarifications

### Session 2026-11-09

- Brief of 2026-11-09 (seven UI/UX changes). The product owner chose to specify these as a new feature on branch `005-ui-ux-overhaul`, built on Feature 004, before any code is written.
- Feature 004 excluded section assignments and configurable project modules from its own scope, and reserved a new visual identity for Feature 005. This feature is where they are now specified.
- Q: How should Switch user work? → A: Confirm, end the current session exactly as Sign out does, then open sign-in saying who was signed out. The next person enters their own email and password. Nothing is remembered in the browser, and no one acts as another (US5-3, FR-032).
- Q: Must a vendor already be on the project before being assigned to one of its sections? → A: No. Assigning a vendor to a section also creates a current project assignment when the vendor has none on that project, under the Feature 004 assignment rules and history (FR-015a).
- Q: How should the default Procurement and Budget & Costing sections work? → A: They stay in the default blueprint as text-only sections (description and notes), with no amounts and no procurement functions (FR-012).
- Q: Which projects count as "In progress" on the dashboard? → A: Not archived, not Completed, and progress above 0% and below 100% (FR-020).
- Q: Should existing projects get the default sections? → A: Only on request. Existing projects start with no sections and offer "Use the standard blueprint"; the migration adds no section rows (FR-013, FR-047).
- Q: Which default sections does every new project start with? → A: 15, in this order: Project Overview, Client Information, Scope of Work, Design & Planning, Drawings / Documentation, Procurement, Materials, Execution, Site Coordination, Budget & Costing, Timeline, Milestones, Deliverables, Snagging, Completion (FR-012).
- Q: Can a removed section be restored? → A: Yes. Restore puts it back as the last section with its name, description and notes; its vendor assignments stay past and are re-made by hand (FR-010a).
- Q: Should Vendors and Projects remember search, filters and sort between visits? → A: Only the sort and the Active or Archived view, per browser. Search and filters start empty each visit (FR-005).
- Owner confirmed defaults (2026-11-09, before planning): lists show 50 records at a time (FR-006); dates read "9 Nov 2026" (FR-042); the tablet width is 768 px (FR-045).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See existing records first, and add new ones without losing my place (Priority: P1)

A staff member opens **Vendors** or **Projects** and immediately sees the existing list, with search, sorting and filters above it. The add form is closed by default, below the list, and opens from a clear **Add vendor** or **Add project** button. The form is split into short, headed sections. Leaving a form with unsaved changes asks for confirmation.

**Why this priority**: Staff use these lists every day. Today they must scroll past a large form before they see any record.

**Independent Test**: Open Vendors and Projects with records present. The first records are visible without scrolling at 1280 px. The add form is closed. Press **Add vendor**: the form opens and takes focus. Type a name, then navigate away: a confirmation asks before discarding.

**Acceptance Scenarios**:

1. **Given** vendors exist, **When** a staff member opens Vendors, **Then** the list, with search, sort and filters, appears before any add form, and the add form is closed.
2. **Given** the add form is closed, **When** the staff member presses **Add vendor** (or **Add project**), **Then** the form opens below the list, scrolls into view and the first field takes focus.
3. **Given** the vendor or project add form, **When** it is open, **Then** its fields are grouped under headed sections (for vendors: Contact, What they do, Manpower, GST, Rates; for projects: Basics, Client, Dates).
4. **Given** an open form with changes, **When** the staff member closes it, navigates to another page or closes the tab, **Then** they are asked to confirm before the changes are discarded.
5. **Given** a list, **When** the staff member sorts it (Vendors: name, category, availability, project count; Projects: name, status, expected completion date, progress), **Then** the order changes and the chosen sort is remembered on that browser for the next visit.
6. **Given** more than 50 matching records, **When** the list is shown, **Then** the first 50 appear with a **Show more** control that adds the next 50.
7. **Given** no records or no matches, **When** the list is shown, **Then** the Feature 004 FR-031 empty messages and next actions appear.

---

### User Story 2 - Organise each project into sections and see who does what (Priority: P1)

Every new project starts with a standard blueprint of sections. Staff can rename, reorder, add and remove sections for that project only, and write a description and notes for each section. Within a section, staff assign one or more vendors already working on the project, with their role in that section. The project page shows each section with its vendors, their contact details and what they do there.

**Why this priority**: The firm needs to know which vendor is responsible for which part of a project, not only who is on the project.

**Independent Test**: Create a project. It has the default sections in order. Rename "Materials" to "Material selection", move it above "Procurement", add a custom section "Landscaping", remove "Budget & Costing", and write a description. A second project still has the unchanged default. Assign two vendors to "Execution" and one of them also to "Site Coordination". Each section shows its vendors with phone and role.

**Acceptance Scenarios**:

1. **Given** a new project is created, **When** it is saved, **Then** it gets its own copy of the default blueprint (FR-012), in the default order.
2. **Given** a project's sections, **When** a staff member renames, reorders, adds or removes one, **Then** only that project changes, and other projects and the default blueprint are unchanged.
3. **Given** a section, **When** a staff member edits its description or notes, **Then** the text is saved and shown on the project page under that section.
4. **Given** a section, **When** a staff member assigns a vendor, **Then** the vendor appears inside that section with phone, contact person, categories and their role in the section. If the vendor was not on the project, they are also assigned to the project, and the confirmation says so (FR-015a).
5. **Given** a vendor assigned to two sections of the same project, **When** the project page is shown, **Then** the vendor appears in both sections, and the vendor record is not duplicated.
6. **Given** a section assignment, **When** a staff member removes it, **Then** the vendor no longer appears in that section, and the vendor's other section assignments and project assignment are unchanged.
7. **Given** a section with vendors, **When** a staff member removes the section, **Then** a confirmation names the vendors assigned to it, and after confirming the section and its assignments are kept as removed (read-only), listed under "Removed sections" and no longer shown among the project's current sections. Restore brings it back, with its description and notes, as the last section (FR-010a).
8. **Given** a vendor's profile, **When** it is shown, **Then** each project in the Projects list names the sections the vendor is assigned to.
9. **Given** each change to a section or a section assignment, **When** it is saved, **Then** the project's history records it with the person, the time, and the previous and new values (Feature 003 FR-027).
10. **Given** a project created before this feature, **When** it is opened, **Then** it has no sections and offers **Use the standard blueprint**, which adds the default sections to that project only.

---

### User Story 3 - Know at a glance how the business is doing (Priority: P2)

The dashboard opens with counts of vendors and projects, project progress with percentages, recently updated projects, recent activity, and quick actions to add a vendor or project. The Feature 004 deadline groups and attention section stay.

**Why this priority**: The dashboard is the first page staff see, and today it answers "what is due" but not "what is the state of the business".

**Independent Test**: With seeded data, open the dashboard. Compare each count with the Vendors and Projects lists. Each project's percentage equals its done items divided by its non-archived items. Press **Add vendor** and land on an open vendor form.

**Acceptance Scenarios**:

1. **Given** vendors and projects exist, **When** the dashboard opens, **Then** it shows the four FR-020 Business overview counts ("Vendors, all", "Vendors, archived", "Projects, not archived", "Projects in progress") and the six FR-025 tiles ("Vendors", "Planned projects", "Active projects", "On hold projects", "Completed projects", "Archived projects"), each linked to the matching list (FR-021). The archived-project count appears once, on the "Archived projects" tile.
2. **Given** projects with timeline items, **When** the dashboard shows project progress, **Then** each non-archived, non-completed project shows a bar and a percentage equal to done items over non-archived items, rounded to a whole number, with its health label (Feature 004 FR-016, FR-017).
3. **Given** a project with no timeline items, **When** the dashboard progress list is shown, **Then** that project is not listed (it is never in progress, FR-020), and the Projects list and project page show "No activities yet" with no bar and no percentage (Feature 004 FR-016a).
4. **Given** recent changes, **When** the dashboard opens, **Then** "Recently updated projects" lists up to 5 projects by most recent change, and "Recent activity" lists up to 10 recent history entries the person may see, each with who, what and when.
5. **Given** the dashboard, **When** the staff member presses **Add vendor** or **Add project**, **Then** the matching page opens with its add form open.
6. **Given** no vendors or projects, **When** the dashboard opens, **Then** each empty section explains what it will show and offers the action that fills it.
7. **Given** the Feature 004 deadline groups, attention section, Missing update list, recent delays and issues, and the Feature 003 tiles and money permissions, **When** the dashboard opens, **Then** they behave exactly as before, apart from the FR-025 tile labels and the added "Archived projects" tile.

---

### User Story 4 - Tell archived records apart and bring them back (Priority: P2)

Vendors and Projects have **Active** and **Archived** views. Archived records carry an Archived badge and muted styling everywhere they appear, and say that archiving keeps everything. Archiving asks for confirmation; restoring is one action for permitted roles.

**Why this priority**: Staff currently confuse archived and active records, and fear archiving deletes data.

**Independent Test**: Archive a vendor on two projects. A confirmation explains nothing is deleted. The vendor moves to the Archived view, muted and badged. Its project assignments and history are still readable. Restore it from the Archived view.

**Acceptance Scenarios**:

1. **Given** Vendors or Projects, **When** the page opens, **Then** it shows the Active view, with a switch to the Archived view showing each view's count.
2. **Given** the Archived view, **When** a staff member searches, filters or sorts, **Then** it works as in the Active view.
3. **Given** an active record, **When** a staff member chooses Archive, **Then** a confirmation says the record will be hidden from active lists, nothing is deleted, and it can be restored.
4. **Given** an archived record anywhere (lists, profiles, project vendor cards, sections, dashboard), **When** it is shown, **Then** it carries the Archived badge and muted styling, with text, not colour alone.
5. **Given** an archived record, **When** a permitted staff member chooses Restore, **Then** it returns to the Active view with a confirmation message, and its assignments, section assignments, documents and history are unchanged.
6. **Given** an archived vendor, **When** its former projects are opened, **Then** its assignments and section assignments are still shown, marked archived.

---

### User Story 5 - Switch to another account from the profile menu (Priority: P3)

A round profile icon with the person's initials sits at the top right. It opens a menu with the person's name, role and email, account information and change password, **Switch user**, and **Sign out**. Switch user asks for confirmation, signs the current person out, and opens sign-in so another staff member can sign in with their own password.

**Why this priority**: Office computers are shared. Switching today means finding Sign out and starting over.

**Independent Test**: Signed in as Office Team, open the icon menu, choose Switch user, confirm, sign in as the Accountant. The icon shows the Accountant's initials and the menu says Accountant. Staff management stays hidden.

**Acceptance Scenarios**:

1. **Given** a signed-in staff member, **When** they look at the top right, **Then** a profile icon shows their initials, and its tooltip and accessible name give their name and role.
2. **Given** the profile menu, **When** it opens, **Then** it shows name, role and email, account information and change password (Feature 001 FR-009, unchanged), Switch user and Sign out, and it works with a keyboard (Feature 004 FR-024).
3. **Given** Switch user, **When** the staff member confirms, **Then** their session ends exactly as Sign out does, and the sign-in page opens and states that the previous person was signed out. The next person signs in with their own email and password; no account list is remembered.
4. **Given** a new person signs in after switching, **When** any page is shown, **Then** it reflects only that person's role and permissions, and nothing from the previous person's session is available.

---

### User Story 6 - A clean, consistent look that is easy to read (Priority: P3)

Every page uses one visual system: white surfaces, black text and navigation, yellow for primary actions and highlights, and grey for secondary text, borders and muted surfaces. Buttons, inputs, cards, tables, badges, menus and dialogs look and behave the same everywhere.

**Why this priority**: Consistency makes the application learnable. The current dark theme is hard to read in bright offices.

**Independent Test**: Visit every page at 1280 px, 768 px and 375 px. Each uses the same tokens. Every primary action is yellow with black text. Text and controls meet contrast targets, and every control shows a visible focus ring.

**Acceptance Scenarios**:

1. **Given** any page, **When** it is shown, **Then** surfaces are white or light grey, body text is black or dark grey, and yellow is used only for primary actions, the current navigation item, focus and highlights, never as a large page background.
2. **Given** any control, **When** it is focused with the keyboard, **Then** a visible focus indicator appears.
3. **Given** any text or status badge, **When** measured, **Then** it meets the contrast targets in FR-041.
4. **Given** status, health, assignment and archived markers, **When** shown on any page, **Then** each keeps its text label and has one colour treatment used on every page (Feature 004 FR-028, FR-029).

---

### User Story 7 - Find anything and always know where I am (Priority: P3)

A global search in the header finds vendors and projects by name and opens them. Detail pages show breadcrumbs. Lists show skeletons while loading, icons have tooltips, dates read the same everywhere, and important actions ask for confirmation.

**Why this priority**: These remove the friction a new staff member meets in the first week.

**Independent Test**: Type part of a vendor name in the header search and open it from the results. The breadcrumb reads "Vendors / <name>". Reload a list and see skeleton rows before data arrives.

**Acceptance Scenarios**:

1. **Given** the header search, **When** a staff member types 2 or more characters, **Then** up to 5 matching vendors and 5 matching projects appear, archived ones marked, and choosing one opens it.
2. **Given** a vendor, project or import page, **When** it is shown, **Then** breadcrumbs show the path (for example "Projects / Lake House") and each earlier part opens its page.
3. **Given** a list or page waiting for data, **When** it loads, **Then** placeholder rows or blocks in the shape of the content appear instead of plain "Loading" text.
4. **Given** an icon-only control, **When** hovered or focused, **Then** a tooltip names it, and its accessible name matches.
5. **Given** any date shown, **When** displayed, **Then** it uses one format (for example "9 Nov 2026") and India Standard Time, as Feature 002 FR-003 requires.

### Edge Cases

- **Vendor removed from the project (Feature 004 FR-013c)**: every section assignment of that vendor on that project ends with the project assignment, and is kept as a past section assignment.
- **Assigning a vendor not on the project**: the vendor is also assigned to the project in the same save (FR-015a). If the project assignment is refused (for example the vendor or project is archived), the section assignment is not saved and the message gives the project-assignment reason.
- **Vendor with only past assignments on the project**: a new current project assignment is created beside the past ones (Feature 004 FR-013b).
- **Same vendor assigned twice to one section**: refused; one current assignment per vendor per section.
- **Renaming a section to a name another current section of the same project uses**: refused with a message naming the existing section. Names are compared without regard to case.
- **Restoring a section whose name is now used by another current section**: refused; the message names the other section and asks to rename one first (FR-010a).
- **Removing every section**: allowed; the project shows "No sections" and offers **Use the standard blueprint** and **Add a section**.
- **Archived project**: sections and section assignments are read-only, as other project details are (Feature 001).
- **Two staff reorder sections at the same time**: the later save wins, and the earlier person is told the order changed and shown the new order.
- **Section with a very long description**: shown collapsed to a few lines with **Show more**.
- **Switch user with an unsaved form**: the unsaved-changes confirmation appears first.
- **Remembered sort refers to an option that no longer exists**: falls back to the default sort.
- **Global search with no match**: "No vendors or projects match".

## Requirements *(mandatory)*

### Functional Requirements

#### Lists and forms (US1)

- **FR-001**: The Vendors and Projects pages MUST show the record list, with its search, sort and filters, before the add form.
- **FR-002**: The add form MUST be closed by default, opened by an **Add vendor** or **Add project** button above the list, and placed below the list. Opening it MUST move focus to its first field.
- **FR-003**: Add and edit forms MUST group their fields under headed sections. No existing field, rule or message MUST be removed (Feature 001, Feature 004 FR-015).
- **FR-004**: Vendors MUST be sortable by name, category, availability and project count; Projects by name, status, expected completion date and progress. Each MUST have a default sort (name, ascending).
- **FR-005**: On Vendors and Projects, the chosen sort and the Active or Archived view MUST be remembered on that browser only, and MUST fall back to the defaults if they cannot be applied. Search text and filters MUST start empty on every visit, apart from filters carried in a link (for example a dashboard count, FR-021). The dashboard keeps Feature 004 D4 (filters reset on every visit).
- **FR-006**: Lists MUST show 50 records at a time with **Show more**. Counts MUST state the total that match.
- **FR-007**: Leaving a form with unsaved changes (closing it, navigating, signing out, switching user or closing the tab) MUST ask for confirmation. This applies to: the vendor and project add forms, the Edit project form, a section's name, description and notes while being edited, the section-assignment role while being edited, and the change-password form. Forms that save on a single action without typed text (selects and buttons only) are exempt.

#### Project sections (US2)

- **FR-008**: Each project MAY have any number of sections. A section has a name (1 to 80 characters), a position, an optional description and optional notes (each up to 5,000 characters), and audit columns.
- **FR-009**: Staff MUST be able to add, rename, reorder and remove a project's sections, and edit their description and notes. These changes MUST affect only that project.
- **FR-010**: Removing a section MUST keep it as a removed section, with who removed it and when, readable in history, and MUST NOT delete it.
- **FR-010a**: The project page MUST list removed sections under "Removed sections" (read-only, with who removed them and when). **Restore** MUST put the section back as the last current section with its name, description and notes. Its section assignments stay past; vendors are assigned again by hand. Restoring is recorded in the project's history. A restore whose name matches a current section (compared without regard to case) is refused with a message asking to rename one of them first.
- **FR-011**: Section names MUST be unique among a project's current sections, compared without regard to case.
- **FR-012**: The default blueprint is this ordered list, the same for every new project: Project Overview, Client Information, Scope of Work, Design & Planning, Drawings / Documentation, Procurement, Materials, Execution, Site Coordination, Budget & Costing, Timeline, Milestones, Deliverables, Snagging, Completion (15 sections). Every section, including Procurement and Budget & Costing, holds only text (description and notes): no amounts, quotations, orders or other Phase 2 or Phase 3 functions (FR-048).
- **FR-013**: Creating a project MUST give it its own copy of the default blueprint. The project's existing `CREATED` history entry records this in its details (`blueprint_applied` with the 15 section names); no separate history entry is added at creation. Projects created before this feature MUST NOT receive sections automatically, from the migration, the seed or any other path; they offer **Use the standard blueprint**, which adds the default sections to that project once and records `BLUEPRINT_APPLIED`.
- **FR-014**: The default blueprint itself is fixed in this feature and is not editable by staff.

#### Section assignments (US2)

- **FR-015**: A section MAY have any number of section assignments. Each links one vendor to one section, with an optional role in the section (up to 120 characters) and audit columns.
- **FR-015a**: Assigning a vendor to a section of a project where the vendor has no current project assignment MUST, in the same save, create a current project assignment (role, scope and note empty) under the Feature 004 rules: the same refusals as assigning a vendor to the project (Feature 001 FR-025, FR-026), the same history entries (Feature 004 FR-013d), and a confirmation naming both ("Vendor assigned to project and to <section>"). If either cannot be saved, neither is saved.
- **FR-015b**: Removing a vendor from the project (Feature 004 FR-013c) MUST end every current section assignment of that vendor on that project, recording each in history. Removing a vendor's last section assignment MUST NOT remove the project assignment.
- **FR-016**: A vendor MUST have at most one current assignment per section, and MAY be assigned to many sections and many projects. Section assignments MUST reference the existing vendor record; no vendor data is copied.
- **FR-017**: Removing a section assignment, or ending it because its project assignment or section was removed, MUST keep it as a past section assignment with who and when, and MUST NOT delete it.
- **FR-018**: The project page MUST show each current section with its description, notes and current section assignments (vendor name linked to the profile, phone, contact person, categories, role in the section, and archived marker). The vendor profile MUST name, for each project, the sections the vendor is assigned to.
- **FR-019**: Every change to sections and section assignments MUST be recorded in the project's history, and section-assignment changes also in the vendor's history, with person, time, and previous and new values (Feature 003 FR-027, FR-028).

#### Dashboard overview (US3)

- **FR-020**: The dashboard's Business overview MUST show exactly these four counts, each with its label as written: "Vendors, all" (archived included), "Vendors, archived", "Projects, not archived" and "Projects in progress". Non-archived vendors, the per-status project counts (Planned, Active, On hold, Completed) and archived projects are shown on the FR-025 tiles and are not repeated in the Business overview; the archived-project count appears once on the dashboard, on the "Archived projects" tile. "In progress" means a non-archived project whose status is not Completed and whose progress (Feature 004 FR-016) is above 0% and below 100%. A project with no timeline items is never in progress.
- **FR-021**: Each count MUST open the list it counts, with the matching view and filters applied: vendors all → Vendors with both views counted (Active view open); vendors archived → Vendors, Archived view; projects not archived → Projects, Active view; projects in progress → Projects, Active view filtered to in progress (the same FR-020 rule). The "Archived projects" tile (FR-025) opens Projects, Archived view. The in-progress filter is shown and clearable like any other filter.
- **FR-022**: Project progress MUST be done items over non-archived items (Feature 004 FR-016), shown as a bar and a whole-number percentage, for each non-archived project whose status is not Completed, sorted by lowest percentage first, up to 10, with a link to the full Projects list.
- **FR-023**: "Recently updated projects" MUST list up to 5 non-archived projects by their most recent change (project, section, assignment or timeline change), with the change time. "Recent activity" MUST list the 10 most recent history entries for vendors and projects, with who, what and when. Client-advance entries follow Feature 003 FR-017 and FR-025 and are shown only to roles that may see amounts.
- **FR-024**: The dashboard MUST offer **Add vendor** and **Add project** quick actions that open the matching page with its add form open.
- **FR-025**: The Feature 004 dashboard (deadline groups, attention section, Missing update, recent delays and issues) and the Feature 003 tiles and their permissions MUST be kept. The count tiles MUST be exactly six, labelled as written: "Vendors" (not archived), "Planned projects", "Active projects", "On hold projects", "Completed projects" (each counting non-archived projects in that status) and "Archived projects" (archived projects of any status, opening Projects, Archived view). The FR-020 counts are additions; no count on a tile is shown a second time.

#### Archived records (US4)

- **FR-026**: Vendors and Projects MUST each offer an Active view (default) and an Archived view, showing each view's count. This replaces the "Include archived" checkbox; search, sort and filters work in both views.
- **FR-027**: Archived records MUST carry the shared Archived badge and muted styling on every page, and MUST state "Archived records are kept and can be restored".
- **FR-028**: Archiving a vendor or project MUST ask for confirmation that explains nothing is deleted. Restoring MUST NOT ask, and MUST show a confirmation message (Feature 004 FR-026). Permissions are unchanged (Feature 001 FR-010).
- **FR-029**: Archiving and restoring MUST NOT change assignments, section assignments, documents, schedules or history.

#### Profile menu and switching (US5)

- **FR-030**: Every signed-in page MUST show a profile icon at the top right with the person's initials (first letters of the first two words of the name), and a tooltip and accessible name with name and role.
- **FR-031**: The profile menu MUST contain name, role and email, account information (the date the account was created), change password (Feature 001 FR-009, unchanged), **Switch user** and **Sign out**, and MUST be usable with a keyboard (Feature 004 FR-024).
- **FR-032**: Switch user MUST ask for confirmation, then end the current session exactly as Sign out does, then show sign-in with a message naming who was signed out. No staff member MAY act as another, and no password MAY be stored in the browser by this feature.

#### Visual system (US6)

- **FR-033**: The application MUST use one set of named colour tokens: white and near-white surfaces, black and near-black text and navigation, grey for secondary text, borders, dividers and muted surfaces, and yellow for primary actions, the current navigation item, focus and highlights. Yellow MUST NOT be used as the background of a page or a large panel.
- **FR-034**: Buttons (primary, secondary, danger, link), inputs, selects, checkboxes, cards, tables, badges, menus, dialogs, toasts and tooltips MUST each have one style used on every page, with defined hover, active, focus and disabled states.
- **FR-035**: Typography, spacing and corner radii MUST each follow one scale used on every page.
- **FR-036**: The Feature 004 status, health, assignment-status and archived markers MUST keep their text and get one colour treatment each in the new palette (Feature 004 FR-028, FR-029).

#### Navigation and feedback (US7)

- **FR-037**: The header MUST offer a global search over vendor names and phones and project names and client names, showing up to 5 of each with archived ones marked.
- **FR-038**: Vendor, project and import pages MUST show breadcrumbs.
- **FR-039**: Loading lists and pages MUST show placeholders in the shape of the content.
- **FR-040**: Icon-only controls MUST have a tooltip and an accessible name. Hover details MUST NOT hide information that is not also available without hovering.
- **FR-041**: Body text MUST have a contrast ratio of at least 4.5:1 and large text, icons and control borders at least 3:1 against their background. Every focusable control MUST show a visible focus indicator.
- **FR-042**: Dates MUST be shown as day, short month and year (for example "9 Nov 2026"), and date-times also with 24-hour time, in India Standard Time. Date inputs keep the browser's date picker.
- **FR-043**: Confirmation dialogs MUST be used for archiving, removing a vendor from a project, removing a section, removing a section assignment and switching user. Each MUST name the record and the consequence, and MUST be operable with a keyboard, with focus returned afterwards.
- **FR-044**: Successful actions MUST show the Feature 004 FR-026 confirmation message, styled as a toast in the new visual system. Errors keep Feature 004 FR-027 wording.
- **FR-045**: Every page MUST be usable at 375 px, 768 px and 1280 px without sideways page scrolling (Feature 004 FR-030, extended to tablet width).

#### Access and integrity

- **FR-046**: Every new view and action MUST require a signed-in, active staff member, checked on the server. All three roles MAY view and change sections and section assignments, as for vendor-project links (Feature 001 FR-010). No new role or permission is introduced.
- **FR-047**: New stored records MUST follow Constitution Principle III: audit columns, kept rather than deleted, and schema changes only through committed, reviewed migrations. The migration MUST NOT change or delete existing records.
- **FR-048**: This feature MUST NOT include a logo, favicon or product name change, budget or cost amounts, quotations, purchase or work orders, invoices, payments, reminders, a Gantt view or charts beyond progress bars, or any staff member acting as another.

### Non-Functional Requirements

- **NFR-001**: Every page MUST load in under 2 seconds, and the global search MUST show results within 1 second of the last keystroke, with 200 vendors, 50 projects and 20 sections per project (Feature 004 NFR-001).
- **NFR-002**: Every count, percentage and section list MUST reflect the data saved at the moment the page or result is shown (Feature 004 NFR-002).
- **NFR-003**: Accessibility: WCAG 2.1 AA contrast (FR-041), full keyboard operation, visible focus, focus trapped inside open dialogs and returned afterwards, and text labels on every status (Feature 004 FR-028).
- **NFR-004**: Responsive at 375 px, 768 px and 1280 px without sideways page scrolling (FR-045).
- **NFR-005**: Wording is plain English for staff; no internal names, codes or "link" terminology appear on screen (Feature 004 NFR-005).
- **NFR-006**: No new runtime dependency is added unless the plan justifies it against Constitution Principle II.
- **NFR-007**: Every server change keeps Feature 001 to 004 behaviour, and the full Feature 001 to 004 test suites pass (SC-008).

### Key Entities *(include if feature involves data)*

- **Project section**: belongs to one project. Name, position, description, notes, removed (when and by whom), audit columns. Many per project.
- **Section assignment**: links one vendor to one project section, with an optional role in the section, removed (when and by whom), and audit columns. Many per section; a vendor has many across sections and projects.
- **Default blueprint**: the fixed, ordered list of section names in FR-012. Not stored per project; copied into a project's sections when it is created or when **Use the standard blueprint** is chosen.
- **Remembered list preferences**: the sort and the Active or Archived view, per browser, not stored on the server.

### Data Model Implications

- **New**: project sections and section assignments (above), each with audit columns and removal fields, following the Feature 004 pattern for past assignments. One current section name per project (compared without case) and one current assignment per vendor per section, each enforced in the database.
- **History**: new history actions for section added, renamed, reordered, described, removed, restored and blueprint applied through **Use the standard blueprint** (recorded on the project; at project creation the blueprint is recorded inside the existing `CREATED` entry, FR-013), and for section assignment added, edited and removed (recorded on both the vendor and the project, as Feature 004 assignment events are). History entries keep targeting the vendor and the project; no new history target is needed.
- **Unchanged**: vendors, projects, vendor-project assignments, timelines, documents, client advances and staff accounts keep their columns. No column is removed or rewritten, and no existing record is changed by the migration (FR-047).
- **Migration**: one additive migration on this branch that creates the new tables and history actions and inserts no rows, reviewed before it is applied to any shared database. It is applied to the development database only with the product owner's approval.

### System Impact

- **Screens**: the app shell (header with global search, breadcrumbs, profile icon and menu, toasts), Dashboard, Vendors, Vendor profile, Projects, Project page (new Sections area), sign-in (switch-user message), and every form, dialog and list for the visual system.
- **Server**: new section and section-assignment actions with validation and history; project creation copies the default blueprint; the vendor-to-project assignment action is reused for the auto-assignment (FR-015a), in the same save; removing a project assignment ends its section assignments (FR-015b); dashboard counts, progress list, recently updated projects and recent activity; global search; Active and Archived views use the existing archived filter.
- **Unchanged server behaviour**: sign-in, sign-out, sessions and roles; Feature 004 assignment statuses, health, deadline groups and flags; import, documents and client advances.
- **Seed**: the demo seed adds sections and section assignments to the projects it creates, using find-or-create only (Feature 004 FR-035).

## Dependencies

- Feature 004 (branch `004-dashboard`, commit `ab87bc0`): project assignments, past assignments, progress, health, deadline groups, profile menu, confirmations and error wording. Feature 004's open tasks T063 (quickstart demonstration) and T064 (walkthrough) are not blocked by this feature, but its demonstration will show the Feature 004 screens, not these.
- The development database has the Feature 004 migration applied (2026-11-09). This feature's migration builds on it.
- Feature 001 roles and assignment rules (FR-010, FR-025, FR-026); Feature 003 history (FR-027, FR-028) and tiles (FR-023 to FR-026).

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The theme change touches every page and breaks existing tests that check classes or text | Many test failures, hidden regressions | Keep every text label and accessible name; change only tokens and component styles; run all Feature 001 to 004 suites at each checkpoint |
| Auto-assigning to the project from a section (FR-015a) creates project assignments staff did not expect | Confusing project vendor lists | The confirmation names both actions; history records both; the project assignment can be removed as in Feature 004 |
| Two kinds of assignment (project and section) confuse staff | Wrong vendor contacted | The project page shows sections with their vendors, and the vendor card lists that vendor's sections |
| A large blueprint makes project pages long | Slow reading on phones | Sections collapse; long descriptions show a few lines with Show more |
| Yellow on white fails contrast | Unreadable text | Yellow is used behind black text and for borders and focus, never for text on white (FR-041) |
| A remembered Archived view or sort surprises staff on return | Records seem missing | Only sort and view are remembered (FR-005); the current view is always labelled with both counts |
| The visual change is large for one pull request | Hard review | The plan splits delivery by user story; P1 stories ship first |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On Vendors and Projects at 1280 px, the first existing record is visible without scrolling.
- **SC-002**: A staff member new to the system can say which vendor is responsible for a named section of a project within 20 seconds of opening the project.
- **SC-003**: A staff member can rename, reorder and add a section in one project, and confirm a second project is unchanged, in under 2 minutes.
- **SC-004**: Every dashboard count equals the count of the list it opens, and every progress percentage equals done over non-archived items, for 100% of seeded projects.
- **SC-005**: In a walkthrough with 5 tasks (find a vendor, add a project, assign a vendor to a section, archive and restore a vendor, switch user), a staff member new to the system completes at least 4 without help.
- **SC-006**: 100% of text and controls checked meet FR-041, and every page passes a keyboard-only check (reach and operate every control, see focus).
- **SC-007**: Every page loads in under 2 seconds with 200 vendors and 50 projects, as Feature 004 NFR-001 requires.
- **SC-008**: Every Feature 001 to 004 automated test passes, apart from cases this spec supersedes and names in the Backward Compatibility table.

## Backward Compatibility

| Earlier requirement | Before | After |
|---|---|---|
| Feature 001 FR-014 (include archived checkbox) | One list with an "Include archived" checkbox | Active and Archived views (FR-026); search and filters unchanged |
| Feature 004 FR-024 (profile menu) | Name button with menu | Initials icon with the same menu plus account information and Switch user (FR-030 to FR-032) |
| Feature 004 FR-028, FR-029 (markers) and the dark navy theme (PR #3) | Dark theme | White, black, yellow and grey system (FR-033 to FR-036); every marker keeps its text |
| Feature 004 FR-039 (configurable project modules, section assignments, new visual identity were outside Feature 004) | Excluded | Specified here, as Feature 005 |
| Feature 001 and 004 page layout (add form above list) | Form first | List first, form collapsed below (FR-001, FR-002) |
| Feature 003 FR-023 (count tiles) | Five tiles labelled "… not archived" | Six tiles without "not archived" in their labels, the sixth being "Archived projects" (FR-025); counts and links of the first five unchanged |

Unchanged: authentication, sessions, passwords and roles; vendor-project assignment rules and statuses (Feature 004); timelines, flags, deadline groups and attention rules; import, documents, client advances and their permissions; history behaviour.

## Assumptions

- "Active vendors" means vendors that are not archived; vendors have no other active state.
- Recently used accounts are not remembered for switching; each person signs in with their own email and password.
- The remembered sort and view use the browser's own storage and may be lost when it is cleared.
- Section assignments do not change Feature 004 assignment status, which stays derived from timeline items.
- The demo seed (Feature 004 FR-032 to FR-035) gains sections and section assignments for the projects it creates, using find-or-create only.
- Tablet means 768 px wide (confirmed by the owner); Feature 004's 375 px and 1280 px widths still apply.
- The visual system is defined in this feature's plan as named tokens; exact colour values are chosen to meet FR-041.
