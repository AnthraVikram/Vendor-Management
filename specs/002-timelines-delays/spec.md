# Feature Specification: Timelines and Delays

**Feature Branch**: `002-timelines-delays`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "002 timelines and delays. Milestones or activities on a project, responsible vendor, planned date, deadline, progress updates. Overdue detection, missing-update detection, delay and coordination issue records. The deadlines and delays part of the dashboard. Covers FR-05, FR-06."

**Backlog coverage**: FR-05 (Timeline Management) and FR-06 (Delay Tracking) from `docs/prd.md`. Both are Phase 1 items in PRD section 5.1. The deadline and delay part of the Phase 1 dashboard is in scope. Vendor counts and client advances on that dashboard are not. Agency dependencies, resolving coordination problems, and reminders are PRD Phase 2 items and stay out.

**Depends on**: Feature 001, Core Auth and Directory (`specs/001-core-auth-directory/`). See [Dependencies](#dependencies).

**Design goal**: Keep it as simple as possible. This is a demonstration project. Each rule below takes the simplest option that meets FR-05 and FR-06.

## Clarifications

### Session 2026-10-28

Product decisions confirmed by the product owner:

- Q: What happens to a timeline item when its responsible vendor is unlinked from the project? → A: The item is kept and its responsible vendor is cleared.
- Q: How are milestones and activities related? → A: One flat list. Milestones and activities are independent, with no parent-child relationship and no automatic progress calculation.
- Q: When does an unfinished item become overdue? → A: The day after its deadline.
- Q: Which items can be flagged for a missing progress update? → A: Only items with status In progress, when more than 7 days have passed without a progress update.
- Q: What can a delay or coordination issue record be attached to? → A: Either a specific timeline item or the project generally.
- Q: What can staff do with timeline items on an archived project? → A: Nothing beyond reading them. They are read-only, and their history is preserved.
- Q: When staff record a delay, what should they capture besides the reason text? → A: Nothing. Reason text only, with no category, days count, or new expected date.
- Q: Should Accountants be able to change timeline data, or only view it? → A: All three roles (Administrator, Office Team, Accountant) view and change timeline data.
- Q: Who can be named as responsible for a timeline item? → A: A vendor linked to the project, the firm's own team, or nobody. The firm's own team is one option shown as "Firm team", not a named staff member.
- Q: How many days before its deadline should an unfinished item be flagged Due soon? → A: Deadline today or within the next 7 days.
- Q: Should a progress update record only a status, or also a percentage complete? → A: Status only (Not started, In progress, Done) with an optional note. No percentage.
- Q: Should the 7-day limit for flagging a missing progress update be one rule for the whole firm, or set per project? → A: One firm-wide rule of 7 days. Projects and items cannot change it.
- Q: Should timeline items be kept completely separate from Feature 001's work schedules, or be able to point to a scheduled task? → A: Fully separate. No link between timeline items and work schedules.
- Q: Should a timeline item have just one optional planned start date and one required deadline, or more dates? → A: Just those two. Actual start and finish are read from progress updates.
- Q: Should every staff member see the same dashboard covering all active projects, or be able to narrow it? → A: One page for the whole firm, the same for everyone, with no filters.
- Q: How many recent delays and coordination issues should the dashboard show? → A: The 10 most recent, newest first. Older entries are read on each project.
- Q: When Feature 001 removes a vendor-project link on an archived project, what happens to timeline items with that vendor responsible? → A: The responsible vendor is still cleared, with the history entry FR-005 already requires. Nothing else on the item changes, and every other timeline write on the archived project is still refused.
- Q: Can a timeline item carry more than one flag? → A: Yes. Overdue, Due soon, and Missing update are worked out independently. An item shows every flag that applies and appears in each matching dashboard list.
- Q: Can an archived item be changed before it is restored? → A: No. It cannot be edited, receive a progress update, or have a delay or coordination issue attached until it is restored. If its project is archived, the project must be restored first.
- Q: Can a coordination issue name an archived vendor that is still linked to the project? → A: Yes. Only an unlinked vendor is refused.
- Q: Does an archived project's read-only timeline show flags? → A: Yes, worked out for today. The dashboard still leaves archived projects out.

## User Scenarios & Testing *(mandatory)*

Terms:

- **Timeline item**: one entry on a project's timeline. Its type is **Milestone** (a point to reach, such as "Handover") or **Activity** (a piece of work, such as "False ceiling, ground floor"). Both types behave the same way. Items are independent of each other: no item contains another, and no item's progress is calculated from other items.
- **Responsible party**: who answers for an item. It is a vendor linked to the project (the PRD's "agency"), the firm's own team (shown as "Firm team"), or nobody. Optional. When it is a vendor, that vendor is the item's **responsible vendor**.
- **Planned date**: the date work on the item is planned to start. Optional.
- **Deadline**: the date the item must be done by. Required.
- **Progress update**: a dated entry that sets the item's status (Not started, In progress, or Done) with an optional note.
- **Active project**: a project that is not archived, whatever its status (Planned, Active, On hold, or Completed). It is not Feature 001's project status named Active.

### User Story 1 - Build a project timeline (Priority: P1)

A staff member opens a project and adds timeline items. Each item has a type, a name, a deadline, and optionally a planned date and a responsible party: a vendor linked to that project, or the firm's own team. The project lists its items by deadline. Staff can edit an item. When a deadline or planned date changes, the earlier value stays readable with who changed it and when. Staff can archive an item that no longer belongs on the plan, and restore it.

**Why this priority**: Everything else in this feature reads the timeline.

**Independent Test**: On an active project with one linked vendor, add a milestone and an activity, the activity with that vendor responsible. Confirm both are listed by deadline. Change the activity's deadline and confirm the old deadline is still readable with author and date.

**Acceptance Scenarios**:

1. **Given** an active project, **When** a staff member saves a milestone with a name and a deadline, **Then** the project's timeline lists it with status Not started.
2. **Given** an active project with an active linked vendor, **When** a staff member saves an activity with that vendor responsible, **Then** the timeline shows the vendor's name on the item, and the vendor record and the link are unchanged.
3. **Given** an active project, **When** a staff member saves an item with no responsible party, **Then** it is saved and shows "No responsible party".
4. **Given** a vendor that is not linked to the project, or is archived, **When** a staff member names it as responsible, **Then** the system refuses and says why.
5. **Given** an item form with no name, no deadline, no type, or a planned date later than the deadline, **When** the staff member saves, **Then** the system names each problem and saves nothing.
6. **Given** an item, **When** a staff member changes its deadline, **Then** the new deadline is shown and the previous deadline remains readable with the date and the staff member who changed it.
7. **Given** an item, **When** a staff member archives it, **Then** it leaves the project's timeline, stays readable from the project's archived items, and can be restored.
8. **Given** an archived project, **When** a staff member tries to add or change a timeline item, progress update, delay, or coordination issue on it, **Then** the system refuses. Its existing timeline and its history stay readable.
9. **Given** an item whose responsible vendor is linked to the project, **When** a staff member removes that vendor's link to the project, **Then** the item stays on the timeline with "No responsible party", and its other details, updates, and history are unchanged.
10. **Given** an active project, **When** a staff member saves an item with the firm's own team responsible, **Then** the timeline shows "Firm team" on the item, and removing any vendor's link to the project leaves it unchanged.
11. **Given** an archived project with an item whose responsible vendor is linked, **When** a staff member removes that vendor's link as Feature 001 permits, **Then** the item shows "No responsible party", the change is recorded against that staff member and time, and the item's other fields and history are unchanged.
12. **Given** an archived item, **When** a staff member tries to edit it, record a progress update on it, or attach a delay or coordination issue to it, **Then** the system refuses and says it must be restored first. If the project is archived, the project must be restored before the item can be.

---

### User Story 2 - Record progress (Priority: P2)

Office staff record progress on an item as work moves. Each update sets the status and may carry a note. The item shows its current status and the date of its last update. Earlier updates stay readable, newest first. Setting the status to Done marks the item complete as of that update. A Done item can be set back to In progress with a new update.

**Why this priority**: The PRD names missing progress updates as a core problem, and detection needs status to work.

**Independent Test**: On an activity, record In progress, then Done. Confirm the item shows Done with that date, and both updates remain readable with their authors and dates.

**Acceptance Scenarios**:

1. **Given** an item, **When** a staff member records an update with status In progress and a note, **Then** the item shows In progress, the note, the date, and the staff member.
2. **Given** an item with earlier updates, **When** a staff member records another, **Then** the newest is current and every earlier update remains readable in order.
3. **Given** an item, **When** a staff member records status Done, **Then** the item shows as Done with the date of that update.
4. **Given** a Done item, **When** a staff member records In progress, **Then** the item is no longer Done and the Done update remains in its history.
5. **Given** an update with no status, or a status other than Not started, In progress, or Done, **When** the staff member saves, **Then** the system refuses and says why.

---

### User Story 3 - See what is overdue, due soon, or missing updates (Priority: P3)

On a project's timeline, each item that needs attention carries every flag that applies: **Overdue**, **Due soon**, or **Missing update**. The system works each one out independently from the dates and updates already recorded. Nobody sets them by hand. Done and archived items never carry a flag.

**Why this priority**: PRD goal 1 is to keep timelines visible and help identify delays.

**Independent Test**: On one project, create an item whose deadline was yesterday, an item due in 3 days, an In progress item last updated 8 days ago, and a Done item whose deadline was last week. Confirm the flags are Overdue, Due soon, Missing update, and none.

**Acceptance Scenarios**:

1. **Given** an item that is not Done and whose deadline was before today, **When** a staff member opens the project, **Then** the item is flagged Overdue with the number of days past its deadline.
2. **Given** an item that is not Done and whose deadline is today or within the next 7 days, **When** a staff member opens the project, **Then** the item is flagged Due soon.
3. **Given** an item whose status is In progress and whose last update is more than 7 days old, **When** a staff member opens the project, **Then** the item is flagged Missing update with the date of its last update.
4. **Given** an item that is Done, **When** its deadline passes, **Then** it carries no flag.
5. **Given** an Overdue item, **When** a staff member moves its deadline to a date after today, **Then** it is no longer Overdue, and the earlier deadline remains readable.
6. **Given** an item flagged Missing update, **When** a staff member records an update, **Then** the flag clears.
7. **Given** an In progress item whose deadline was before today and whose last update is more than 7 days old, **When** a staff member opens the project, **Then** it is flagged both Overdue and Missing update.
8. **Given** an archived project, **When** a staff member opens its read-only timeline, **Then** its items carry the flags that apply today.

---

### User Story 4 - Record delays and coordination issues (Priority: P4)

When work slips, a staff member records a delay with the reason. When agencies get in each other's way, a staff member records a coordination issue and names the vendors involved. Either kind of record is attached to a specific timeline item or to the project generally. Each record keeps its text, date, and author. Records are never edited or deleted. A later development is recorded as another entry.

**Why this priority**: FR-06 requires recording delays and coordination issues. A delay is usually noticed through an Overdue flag, so this follows detection.

**Independent Test**: On an overdue activity with a responsible vendor, record a delay and a coordination issue naming that vendor. Confirm both appear on the item and the project with their date and author, and the vendor record is unchanged.

**Acceptance Scenarios**:

1. **Given** an item, **When** a staff member records a delay with a reason, **Then** the item and the project show the delay with its date and the staff member who recorded it.
2. **Given** a project with a linked vendor, **When** a staff member records a coordination issue naming that vendor, **Then** the project shows the issue with the vendor's name, and the vendor's own notes, rating, and details are unchanged.
3. **Given** a delay with no reason, or a coordination issue with no description, **When** the staff member saves, **Then** the system says the text is required and saves nothing.
4. **Given** a coordination issue naming a vendor that is not linked to the project, **When** the staff member saves, **Then** the system refuses.
5. **Given** a delay on an item, **When** the item's deadline later changes or the item becomes Done, **Then** the delay remains readable on the item.
6. **Given** an active project, **When** a staff member records a delay or a coordination issue without choosing an item, **Then** it is saved against the project generally and the project shows it with no item named.
7. **Given** an item on a different project, **When** a staff member tries to attach a delay or coordination issue to it from this project, **Then** the system refuses.
8. **Given** a vendor that is linked to the project and archived, **When** a staff member records a coordination issue naming it, **Then** the issue is saved and shows the vendor as archived.

---

### User Story 5 - See deadlines and delays on the dashboard (Priority: P5)

A staff member opens the dashboard and sees, across all active projects, four lists: Overdue items, Due soon items, Missing update items, and Recent delays and coordination issues. Each entry names its project and responsible party and opens the item or project.

**Why this priority**: The PRD's Phase 1 dashboard shows project deadlines and delays. It needs every earlier story.

**Independent Test**: With two active projects, each with an overdue item and a recorded delay, and an archived project with an overdue item, open the dashboard. Confirm both active projects' items and delays are listed and the archived project's item is not.

**Acceptance Scenarios**:

1. **Given** overdue items on two active projects, **When** a staff member opens the dashboard, **Then** both appear in Overdue with project, responsible party (the vendor's name, "Firm team", or "None"), deadline, and days overdue, most overdue first.
2. **Given** items flagged Due soon and Missing update, **When** a staff member opens the dashboard, **Then** each appears in its own list.
3. **Given** delays and coordination issues on active projects, **When** a staff member opens the dashboard, **Then** the 10 most recent appear, newest first, each with its project and, where there is one, its item.
4. **Given** an item on an archived project, or an archived item, **When** a staff member opens the dashboard, **Then** it does not appear in any list.
5. **Given** a list with no entries, **When** a staff member opens the dashboard, **Then** that list says it is empty.
6. **Given** a dashboard entry, **When** the staff member selects it, **Then** the matching project opens at that item.
7. **Given** an item flagged both Overdue and Missing update, **When** a staff member opens the dashboard, **Then** it appears in both lists.

---

### Edge Cases

- **Deadline today**: the item is Due soon, not Overdue. It becomes Overdue the next day.
- **Deadline moved earlier, into the past**: an item that is not Done becomes Overdue at once.
- **Done after the deadline**: the item carries no flag. Its history shows the Done date and every deadline it had.
- **Not started, never updated**: Missing update applies only to In progress items. A Not started item is caught by Due soon and Overdue as its deadline approaches.
- **No responsible party, or Firm team**: detected like any other item. The dashboard shows "None" or "Firm team".
- **Responsible vendor archived later**: the item keeps the vendor, shown as archived. It is still detected. A new or edited item cannot name an archived vendor.
- **Vendor-project link removed while the vendor is responsible**: the items stay on the timeline and their responsible vendor is cleared, so they show "No responsible party". Items with Firm team responsible are not affected. The clearing is recorded against the staff member who removed the link and the time. Delays and coordination issues that named the vendor keep the name. The link removal itself still behaves as Feature 001 describes.
- **Project archived**: its whole timeline becomes read-only, apart from the vendor clearing in FR-025, and leaves the dashboard. Every item, date change, progress update, delay, and coordination issue stays readable. Restoring the project makes it editable again, and its flags reflect today.
- **Project status On hold or Completed**: the status does not change items or pause detection.
- **Two people update the same item at once**: both updates are kept in the order saved.
- **Author later revoked**: their entries stay attributed to them, as Feature 001 FR-006 requires.
- **Feature 001 work schedules**: timeline items are separate and hold no reference to a work schedule or scheduled task. Adding, editing, or archiving an item never creates, changes, or removes a work schedule, task price, or costing sheet.

## Requirements *(mandatory)*

### Functional Requirements

#### Timeline items (FR-05)

- **FR-001**: A signed-in, active staff member MUST be able to create, view, edit, archive, and restore timeline items on an active project.
- **FR-002**: A timeline item MUST belong to one project and MUST have a type (Milestone or Activity), a name, and a deadline. It MAY have a planned date, a responsible party, and a description. Milestones and activities follow the same rules. Items MUST NOT have a parent-child relationship, and an item's status MUST NOT be calculated from other items.
- **FR-003**: When a planned date is given, it MUST NOT be later than the deadline. An item MUST have no other dates; when work actually started and finished is shown by its progress updates. Dates are calendar dates without times. "Today" is the date in India Standard Time.
- **FR-004**: The responsible party MUST be one of: a vendor, the firm's own team (one option, shown as "Firm team", not a named staff member), or none. A responsible vendor, when named or changed, MUST be active and MUST be linked to the item's project. Naming a vendor MUST NOT change the vendor record or the link.
- **FR-005**: An item whose responsible vendor is later archived MUST keep that vendor and MUST show that the vendor is archived. When a vendor's link to a project is removed, every item on that project with that vendor responsible MUST be kept and MUST have its responsible vendor cleared, recorded as changed by the staff member who removed the link at that time. This also applies when the project is archived. The clearing MUST change only the responsible-vendor reference and the item's last-updated fields, and add the change record above. Every other item field and all history MUST stay unchanged.
- **FR-006**: Changing a deadline or a planned date MUST keep the earlier value readable with the date and the staff member who changed it.
- **FR-007**: A project's timeline MUST list its non-archived items by deadline, earliest first, then by name. Archived items MUST stay readable from the project and MUST be restorable. An archived item MUST NOT be edited, receive a progress update, or have a delay or coordination issue attached until it is restored.

#### Progress (FR-05)

- **FR-008**: A new item MUST start with status Not started.
- **FR-009**: A staff member MUST be able to record a progress update on an item. An update MUST have a status of Not started, In progress, or Done, and MAY have a note. It MUST NOT have a percentage complete. It MUST keep the date and time and the staff member. The latest update sets the item's current status.
- **FR-010**: Progress updates MUST NOT be edited or deleted. A correction is a new update.
- **FR-011**: An item is Done from the date of the update that set Done, until a later update sets another status.

#### Detection (FR-06)

- **FR-012**: An item MUST be flagged Overdue when it is not Done, not archived, and its deadline is before today. The flag MUST show the number of days past the deadline.
- **FR-013**: An item MUST be flagged Due soon when it is not Done, not archived, and its deadline is today or within the next 7 days.
- **FR-014**: An item MUST be flagged Missing update when its status is In progress, it is not archived, and its last update is more than 7 days before today. The flag MUST show the date of the last update. The 7 days is one firm-wide rule; projects and items MUST NOT change it.
- **FR-015**: Flags MUST be worked out from the recorded dates and updates whenever the timeline or dashboard is shown. Staff MUST NOT be able to set or clear a flag directly. The Overdue, Due soon, and Missing update rules MUST be applied independently, and an item MUST carry every flag that applies. Flags MUST also be shown on an archived project's read-only timeline.

#### Delays and coordination issues (FR-06)

- **FR-016**: A staff member MUST be able to record a delay on a project, with a reason as text. A delay MUST NOT have a category, days count, or new expected date; slippage is shown by changing the item's deadline (FR-006). The delay MAY be attached to one of that project's items; otherwise it concerns the project generally.
- **FR-017**: A staff member MUST be able to record a coordination issue on a project, with a description. The issue MAY be attached to one of that project's items; otherwise it concerns the project generally. It MAY name one or more vendors, each linked to the project when the issue is recorded. A named vendor MAY be archived, provided it is linked.
- **FR-018**: Delays and coordination issues MUST keep their text, date, and author. They MUST NOT be edited or deleted. They have no open or closed state in this feature.
- **FR-019**: A coordination issue MUST NOT add a note to the vendor record. Feature 001 vendor coordination notes stay separate.

#### Dashboard (FR-05, FR-06)

- **FR-020**: A signed-in staff member MUST be able to open one firm-wide dashboard with four lists: Overdue, Due soon, Missing update, and Recent delays and coordination issues. Every staff member MUST see the same dashboard. It MUST NOT have filters by staff member, project, or vendor.
- **FR-021**: Each list MUST cover only active projects and non-archived items. An item MUST appear in every list that matches one of its flags. Each entry MUST show its project, its responsible party (the vendor's name, "Firm team", or "None"), and the date that put it on the list, and MUST open the item or project.
- **FR-022**: Overdue MUST be sorted most days overdue first. Due soon MUST be sorted earliest deadline first. Missing update MUST be sorted oldest last update first. Recent delays and coordination issues MUST show the 10 most recent, newest first, with no link to a longer list; older entries stay readable on their project.
- **FR-023**: An empty list MUST say it is empty. The dashboard MUST show only timeline and delay information. Vendor counts and client advances belong to other backlog items.

#### Access and integrity

- **FR-024**: Every timeline action MUST require a signed-in, active staff member, checked on the server for every request. Administrators, Office Team members, and Accountants MUST all be able to view and change timeline data, as with every project record in Feature 001.
- **FR-025**: On an archived project, timeline items, progress updates, delays, and coordination issues MUST be readable. While the project is archived, every ordinary timeline write on it MUST be refused. The only exception is the FR-005 clearing when Feature 001 removes a vendor-project link, which changes only what FR-005 allows. Restoring an item does not bypass this: on an archived project, the project must be restored first. On a project that is not archived, an archived item is restored as FR-007 describes. Their history, including earlier dates and every update, MUST be preserved.
- **FR-026**: Every item, date change, progress update, delay, and coordination issue MUST record when it was made and by whom.
- **FR-027**: Timeline items MUST be archived, not deleted.
- **FR-028**: This feature MUST NOT change any vendor, vendor-project link, work schedule, task price, or costing sheet. Removing a link gains one added effect, clearing the responsible vendor on that project's items (FR-005), also on archived projects; what Feature 001 does to the link and its schedules is unchanged.
- **FR-029**: This feature MUST NOT include dependencies between items, closing or resolving delays and issues, reminders or notifications, vendor self-service, charts beyond dated lists, procurement, invoices, payments, or client advances.

### Key Entities

- **Timeline item**: One milestone or activity on one project. Type, name, optional description, optional planned date, deadline, optional responsible party (a vendor, Firm team, or none), current status (from its latest update), archive flag, and audit fields.
- **Date change**: One earlier planned date or deadline of an item. Which date, old value, new value, when, and who.
- **Progress update**: One status entry on an item. Status, optional note, when, and who. Never edited.
- **Delay**: One delay on a project, optionally on one of its items. Reason, when, and who. Never edited.
- **Coordination issue**: One problem on a project, optionally on one of its items. Description, the vendors involved, when, and who. Never edited. Separate from Feature 001 vendor notes.
- **Existing Feature 001 entities**: staff account and role, project with status and archive flag, vendor with archive flag, and vendor-project link. This feature reads them and does not change them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A staff member can add a timeline item with a deadline and a responsible vendor in under 1 minute.
- **SC-002**: A staff member can record a progress update in under 30 seconds from opening the project.
- **SC-003**: For a test set covering every flag rule, including the deadline-day and 7-day boundaries and Done items, 100% of items carry the expected flag.
- **SC-004**: From the dashboard, a staff member can name every overdue item across 10 active projects, with its project and responsible party, in under 1 minute.
- **SC-005**: After a deadline has changed three times, all three earlier values are readable with their dates and authors.
- **SC-006**: After a project or vendor is archived, all of its timeline items, updates, delays, and issues are still readable.
- **SC-007**: A signed-out or revoked person is refused on every attempt to view or change timeline data.
- **SC-008**: A staff member can add an item, record progress, record a delay, and read the dashboard on a phone screen and on a computer.

## Assumptions

These are the simplest options, chosen to keep the demonstration small. Rows marked **Confirmed** were confirmed by the product owner on 2026-10-28 (see Clarifications). The row marked **Fixed by PRD** follows from the PRD phase split and constitution Principle VI, and changes only if `docs/prd.md` changes.

| Topic | Chosen option | State |
| --- | --- | --- |
| Structure | One flat list per project. Milestone and Activity are a type label. No parent-child relationship, no automatic progress calculation, no link to work schedules | Confirmed |
| Responsible party | A linked vendor, the firm's own team ("Firm team"), or none. Not the client | Confirmed |
| Vendor unlinked | The item is kept and its responsible vendor is cleared | Confirmed |
| Dates | One optional planned date and one required deadline | Confirmed |
| Progress | Status only: Not started, In progress, Done, with an optional note. No percentage | Confirmed |
| Overdue | From the day after the deadline | Confirmed |
| Due soon | Deadline today or within the next 7 days | Confirmed |
| Missing update | In progress items only, with no update for more than 7 days. One firm-wide rule | Confirmed |
| Delay and issue records | Attached to an item or to the project generally | Confirmed |
| Delay record fields | Reason text only. No category, days count, or new expected date | Confirmed |
| Closing delays and issues | Not in this feature. PRD section 5.2 puts "coordination problems and their resolution" in Phase 2 | Fixed by PRD |
| Archived project | Its timeline is read-only, apart from the FR-025 vendor clearing, and its history is preserved | Confirmed |
| Roles | All three roles view and change timeline data, as in Feature 001 | Confirmed |
| Dashboard | One firm-wide page, the same for everyone, with no filters | Confirmed |
| Recent delays and issues | The 10 most recent on the dashboard | Confirmed |

Other assumptions:

- Staff, not vendors, record all timeline data. Vendors have no accounts, and the constitution recognizes only the three staff roles.
- "Responsible agency" in `docs/prd.md` means a vendor in the Feature 001 directory.
- Flags are worked out when the data is shown. Nothing is sent to anyone.
- The timeline view is a dated list. The PRD open question about the most useful timeline views stays open.
- Validation messages name the field and the problem, as PRD section 8 requires.
- Volume is tens of active projects with tens of items each.

## Dependencies

| Feature 001 capability | Used for | Feature 001 reference |
| --- | --- | --- |
| Sign-in, sessions, revocation | Every timeline action needs an active staff session | FR-001, FR-002, FR-006 |
| Roles and server-side checks | All three roles may change timeline data | FR-004, FR-008, FR-010 |
| Projects, status, archive | Items belong to a project; archived projects are read-only and leave the dashboard | FR-023, FR-024 |
| Vendors and archive | Responsible vendor; archived vendors marked, not removed | FR-011, FR-015 |
| Vendor-project links | A responsible vendor must be linked; link removal also clears the responsible vendor on that project's items | FR-025 to FR-028 |
| Audit conventions | Author and date on every entry; earlier values kept | Constitution Principle III; Feature 001 FR-017, FR-018, FR-034 |

Feature 001's implementation is on `001-core-auth-directory`, not yet on `main`. This feature is built on top of that branch.
