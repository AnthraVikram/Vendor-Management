# Feature Specification: Core Auth and Directory

**Feature Branch**: `001-core-auth-directory`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "001 core: auth and directory. Login, roles, admin creates and revokes users. Vendor directory with the full vendor model, categories, search, filter, archive, ratings and notes. Projects with archive. Vendor-to-project links with per-project fields. Covers FR-01, 02, 03, 04, 14. Project scaffolding, stack setup, seed data, one-command run and CI go into this spec’s plan rather than a separate spec."

**Backlog coverage**: FR-01, FR-02, FR-03, FR-04, FR-14, FR-17, FR-18 from `docs/prd.md`. Work scheduling (FR-17) and per-job pricing (FR-18) were added by the product owner on 2026-10-23. Quotation comparison, purchase orders, invoices, and payments stay out of this specification.

## Clarifications

### Session 2026-10-27

- Q: Should an administrator be allowed to change their own role while another active administrator remains? → A: No. Nobody can change their own role, administrators included; another administrator must do it.
- Q: Once a scheduled task has a fixed price or a costing sheet, should staff be able to switch it to the other pricing method? → A: Yes. Staff clear the current method first: a fixed price is reversed, or a costing sheet is archived. The earlier price or file stays readable with its date and author.
- Q: What is the largest costing-sheet file staff should be able to attach to a task? → A: 10 MB.
- Q: If one booking for a vendor ends exactly when another for the same vendor starts, should that be flagged as a conflict? → A: No. Back-to-back bookings are not a conflict; only times that truly overlap are flagged.
- Q: When an administrator sets a new password for another staff member, should that person's open sessions end? → A: Yes. All of that person's open sessions end; they sign in again with the new password.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in and manage who has access (Priority: P1)

An administrator creates a staff account, assigns one role, and the staff member signs in with email and password. Active administrators, office team members, and accountants can all view and edit every vendor, project, and vendor-project link. When someone leaves the firm, the administrator revokes that account. A revoked person cannot continue using the system. The administrator can restore access if the person returns. People who are not administrators cannot create or revoke accounts. This feature does not assign people to particular projects.

**Why this priority**: Vendor and project records are internal. Nothing else in this feature is safe to use until the firm can grant and remove access.

**Independent Test**: Create an administrator and one staff account, sign in as the staff member, revoke that account, and confirm the next attempt to use the system is refused. Delivers a firm-controlled directory of people.

**Acceptance Scenarios**:

1. **Given** an active administrator, **When** they create a staff member with a name, email, role, and password, **Then** that person can sign in with that email and password and sees only what that role allows.
2. **Given** a staff member is signed in, **When** an administrator revokes the account, **Then** the next attempt to open or change a record is refused, and a new sign-in with that email is refused.
3. **Given** a revoked account, **When** an administrator restores it and sets a password, **Then** that person can sign in again.
4. **Given** an office team member or an accountant, **When** they try to create, revoke, restore, or change another person's role or password, **Then** the system refuses the action.
5. **Given** one active administrator remains, **When** someone tries to revoke that account or change its role, **Then** the system refuses and leaves the account active.
6. **Given** a wrong password, an unknown email, or a revoked account, **When** a person tries to sign in, **Then** the system refuses and does not reveal which of those three cases occurred.
7. **Given** an active office team member or accountant, **When** they create, edit, archive, or restore a vendor or a project, or create or remove a vendor-project link, **Then** the change is saved.
8. **Given** an administrator attempts to change their own role, **When** they submit the change, **Then** the system refuses it and their role remains unchanged, even when another active administrator exists. Another administrator may change their role.
9. **Given** a staff member has an active session, **When** an administrator resets that person's password, **Then** their existing sessions no longer grant access and they must sign in again using the new password.

---

### User Story 2 - Keep a searchable vendor directory (Priority: P2)

An authorized staff member adds a vendor once, with contact details, categories, locations served, services, materials, indicative rates, GST registration details, approximate team size, an availability status, a manpower note, a rating, and notes. They can search and filter the directory, update the record over time, and archive a vendor the firm no longer uses. An archived vendor stays available to open later. The directory hides archived vendors unless the viewer asks to include them.

**Why this priority**: The firm currently keeps vendors in spreadsheets and messages. One searchable record is the main value of this feature.

**Independent Test**: Sign in as a person allowed to edit vendors, add a vendor with the required details, find it by category and location, archive it, and open it again from archived records.

**Acceptance Scenarios**:

1. **Given** a person allowed to edit vendors, **When** they save a vendor with a name, a phone number, at least one category, and any other details they have, **Then** the vendor appears in the directory and can be opened.
2. **Given** a vendor form is missing the name, the phone number, or a category, **When** the person tries to save, **Then** the system explains what is missing and does not create the vendor.
3. **Given** vendors exist in several categories and locations, **When** a person searches by name, phone, contact person, service, or material, and filters by category, location served, manpower availability, or linked project, **Then** the directory shows only vendors that match every chosen filter.
4. **Given** an active vendor, **When** a person archives it, **Then** it disappears from the default directory, remains openable from archived records, and can be restored to the default directory.
5. **Given** a vendor already has a rating and notes, **When** a person changes the rating or adds a past-work, reliability, coordination, or general note, **Then** the new rating is shown and the earlier rating and notes remain readable with the date and the staff member who wrote them.
6. **Given** a vendor is marked GST registered, **When** the person saves without a GSTIN, **Then** the system explains that the GSTIN is required and does not save that change.
7. **Given** a GSTIN is already stored on a vendor, **When** a person tries to save the same GSTIN on a different vendor, **Then** the system refuses the duplicate.
8. **Given** a phone number already belongs to a vendor, **When** a person enters that phone number on a different vendor, **Then** the system warns of the possible duplicate and saves only after the person confirms.
9. **Given** a vendor has a team size, an availability status of Available, Limited, or Unavailable, and a manpower note, **When** a person filters the directory by that status, **Then** the vendor is included, and vendors with a different status are excluded.

---

### User Story 3 - Keep a project list (Priority: P3)

An authorized staff member creates a project with a name and the identifying details the firm uses before timelines exist. They can update it, archive it when it should leave the working list, and open it again later. Archiving a project does not delete it.

**Why this priority**: Vendors need somewhere to be linked. A project list is useful on its own as the firm's working set of jobs.

**Independent Test**: Create a project, change its status, archive it, confirm it leaves the default list, and open it from archived projects.

**Acceptance Scenarios**:

1. **Given** a person allowed to edit projects, **When** they save a project with a name, **Then** the project appears in the default project list.
2. **Given** a project form has no name, **When** the person tries to save, **Then** the system explains that the name is required and does not create the project.
3. **Given** an active project, **When** a person archives it, **Then** it leaves the default list, remains openable from archived projects, and can be restored.
4. **Given** a completed project that is not archived, **When** a person views the default list, **Then** the project is still listed and shows its status as completed.

---

### User Story 4 - Link a vendor to projects without copying the vendor (Priority: P4)

An authorized staff member links an existing vendor to an existing project. The same vendor can appear on many projects, and a project can have many vendors, without a second copy of the vendor. The link stores only that vendor's role on the project, the scope of work, and a note. Contact details, categories, rates, manpower, and other vendor information stay on the vendor record. A vendor or project that is archived cannot receive a new link. Existing links remain visible when someone opens the archived record.

**Why this priority**: The firm needs to see who is working on which job. The link is only useful after vendors and projects exist.

**Independent Test**: Create one vendor and two projects, link the vendor to both, and confirm both projects show the same vendor record.

**Acceptance Scenarios**:

1. **Given** one active vendor and two active projects, **When** a person links that vendor to each project, **Then** both projects list that vendor and the directory still contains one vendor record.
2. **Given** a vendor is already linked to a project, **When** a person tries to link that same pair again, **Then** the system refuses the duplicate link.
3. **Given** a vendor or a project is archived, **When** a person tries to create a new link for it, **Then** the system refuses the new link and existing links stay visible on the archived record.
4. **Given** a person removes a link that has a role, a scope, and a note, **When** they open the vendor and the project, **Then** the vendor record still exists unchanged, and the project no longer shows that link.
5. **Given** a person saves a link with a role, a scope of work, and a note, **When** they open the vendor and the project, **Then** the project shows those three details on the link, and the vendor's contact details, rates, and manpower are unchanged.

---

### User Story 5 - Schedule vendor work on a project (Priority: P5)

A staff member schedules work for a vendor who is already linked to a project. They enter the task, the date, the start time, the end time, and the required team size. The schedule does not copy the vendor record onto the project. If that same vendor already has work whose times overlap, on this project or another, the system flags the conflict and still saves the schedule. The vendor's Available, Limited, or Unavailable status does not reserve a time and does not block the booking.

**Why this priority**: The firm needs to see when a vendor is booked. Scheduling is useful only after the vendor is linked to the project.

**Independent Test**: Link one vendor to a project, schedule a task with a date and times, then schedule a second task for that vendor in the same time range and confirm the conflict is visible while both schedules remain saved.

**Acceptance Scenarios**:

1. **Given** an active vendor linked to an active project, **When** a staff member saves a schedule with a task, a date, a start time, an end time, and a required team size, **Then** the project shows that schedule and the vendor record is unchanged.
2. **Given** that vendor already has a schedule on the same date with overlapping times, on any project, **When** a staff member saves another schedule in that overlap, **Then** the system names the conflicting schedule and still saves the new one.
3. **Given** two schedules overlap in time and belong to different vendors, **When** both are saved, **Then** the system does not flag them as a conflict with each other.
4. **Given** a vendor's status is Available or Unavailable, **When** a staff member schedules that vendor, **Then** the system saves the schedule and does not treat the status as proof that the vendor is free or busy for that time.
5. **Given** the task or date is missing, the end time is not later than the start time, or the required team size is missing, zero, negative, or not a whole number, **When** the staff member saves, **Then** the system explains the problem and does not save the schedule.
6. **Given** the vendor is not linked to the project, or the vendor or the project is archived, **When** a staff member tries to add a schedule, **Then** the system refuses.

---

### User Story 6 - Price a job without changing the vendor (Priority: P5)

Each scheduled task is a job. That task can carry a fixed agreed price or one attached costing sheet, which is a spreadsheet or PDF file. A project can hold many priced tasks for the same vendor, and each task keeps its own price. The price is not written onto the vendor profile. Staff can still keep indicative rates on the vendor for the directory. Comparing quotations, purchase orders, invoices, and payments are outside this feature.

**Why this priority**: The firm needs a price for a specific booking. That price has to stay distinct from the vendor's general rates, and from later purchasing and payment records.

**Independent Test**: Add two schedules for one vendor on one project, put a different fixed price on each, attach a spreadsheet to a third unpriced schedule, and confirm the vendor profile still shows only its own indicative rates.

**Acceptance Scenarios**:

1. **Given** a scheduled task has a fixed agreed price, **When** a staff member opens the vendor who is doing the work, **Then** the vendor's indicative rates are unchanged and the task price does not appear as a vendor rate.
2. **Given** one vendor has two scheduled tasks on the same project, **When** a staff member sets a different fixed price on each task, **Then** each task shows its own price.
3. **Given** a scheduled task has no fixed price, **When** a staff member attaches a spreadsheet or PDF costing sheet, **Then** a signed-in staff member can open that file from the task.
4. **Given** a person is signed out, **When** they try to open a costing sheet, **Then** the system refuses.
5. **Given** a scheduled task already has a fixed agreed price, **When** a staff member also attaches a costing sheet, **Then** the system refuses to keep both and explains that the task uses one pricing method.
6. **Given** a fixed agreed price is negative or has more than two decimal places, or the file is not a spreadsheet or PDF or is larger than 10 MB, **When** a staff member saves it, **Then** the system explains the problem and does not save that price or file.
7. **Given** a staff member changes a fixed agreed price or replaces a costing sheet, **When** they open the task later, **Then** the new price or file is shown and the previous price or file remains readable with the date and the staff member who changed it.
8. **Given** a scheduled task uses a fixed price or a costing sheet, **When** an authorized staff member clears the current method and records the alternative, **Then** only the new method is current, the previous record remains readable in history with its date and the responsible staff member, and both methods are never current simultaneously.

---

### Edge Cases

- A person who is already signed in is revoked. The next attempt to view or change a record is refused, and signing in again is refused.
- The last active administrator cannot be revoked, restored into a non-administrator role, or archived. This feature has no separate archive action for staff accounts; revoke is how access ends.
- Two people try to revoke the same account. The account ends revoked, and the second attempt reports that it is already revoked.
- An administrator sets a new password for a staff member who is signed in. That person's next request is refused, and they must sign in again with the new password.
- An administrator tries to change their own role. The system refuses and the role stays unchanged, even when another active administrator exists.
- An administrator tries to create a user with an email that already exists. The system refuses, including when the existing account is revoked.
- A vendor is archived while linked to projects. The vendor leaves the default directory. Each linked project still shows the vendor and marks the vendor as archived.
- A project is archived while vendors are linked. Those vendors remain in the directory. The archived project still lists them.
- Search text matches nothing. The directory shows an empty result and the filters stay as the person set them.
- An indicative rate or a fixed agreed price has more than two decimal places or is negative. The system explains the problem and does not save that amount.
- A team size on the vendor, or a required team size on a schedule, is negative or is not a whole number. The system explains the problem and does not save that update. Vendor availability accepts only Available, Limited, or Unavailable.
- A schedule end time is not later than its start time, or the schedule has no task or date. The system does not save it.
- The same vendor has two schedules on the same date whose times overlap, including schedules on different projects. Both remain saved, and both show a conflict.
- Overlapping schedules for different vendors are not flagged.
- Back-to-back schedules for the same vendor, where one ends exactly when the next starts, are not flagged.
- A vendor marked Available is still flagged when a new schedule overlaps an existing one. A vendor marked Unavailable can still be scheduled.
- Removing a link removes its role, scope, and note from the project. The vendor record remains. Schedules for that vendor on that project leave the working project view. Those schedules, their price entries, their price history, and their costing-sheet files are not deleted, and an authorized staff member can still read them.
- A costing sheet can be opened by a signed-in staff member from the scheduled task. A signed-out person cannot open it. Replacing the file keeps the previous file readable.
- A file that is not a spreadsheet or PDF, or is larger than 10 MB, is refused. A task cannot show both a current fixed price and a current costing sheet.
- A staff member switches a task from a fixed price to a costing sheet, or the reverse, by clearing the current method first. Attaching a file to a task that still has a current fixed price, or the reverse, is still refused.
- Restoring an archived vendor or project returns it to the default list and keeps its links and existing schedules.
- A rating outside 1 to 5 is refused. A vendor may be saved with no rating.
- A note with no text is refused.
- A category name that already exists, ignoring letter case, is reused rather than creating a second category. The stored name stays as it was first saved.
- Filters combine. A vendor must match the search text and every selected filter. Including archived vendors is off unless the person turns it on.
- A person confirms a possible duplicate phone number, then the vendor is saved. If they do not confirm, the vendor is not saved.
- A GST-unregistered vendor is saved with no GSTIN. Adding a GSTIN later requires marking the vendor as registered.
- A schedule that crosses midnight is out of scope. Start and end are times on the single date of that schedule.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A person MUST be able to sign in with an email address and a password, and MUST be able to sign out.
- **FR-002**: The system MUST refuse sign-in for an unknown email, a wrong password, or a revoked account, and MUST use the same refusal message for all three.
- **FR-003**: An administrator MUST be able to create a staff account with a name, a unique email, one role, and a password. The person MUST NOT be able to create their own account.
- **FR-004**: Each staff account MUST have exactly one role: Administrator, Office Team, or Accountant.
- **FR-005**: An administrator MUST be able to revoke an account, restore a revoked account, change another person's role, and set another person's password. Setting another person's password MUST end all of that person's open sessions.
- **FR-006**: A revoked person MUST be refused on the next attempt to view or change any record, and earlier records they created MUST remain attributed to them.
- **FR-007**: The system MUST refuse any change that would leave the firm with no active administrator.
- **FR-008**: A person who is not an administrator MUST be refused when they create, revoke, restore, or change a staff account. Hiding the control is not sufficient; the action itself MUST be refused.
- **FR-009**: A signed-in person MUST be able to change their own password. A person, including an administrator, MUST NOT be able to change their own role; only another administrator can change it.
- **FR-010**: Every active administrator, office team member, and accountant MUST be able to view, create, edit, archive, and restore every vendor and every project, MUST be able to create, edit, and remove every vendor-project link, and MUST be able to create, edit, and remove every work schedule. This feature has no assignment of people to projects. Only an administrator can manage staff accounts.
- **FR-011**: A person allowed to edit vendors MUST be able to create, view, edit, search, filter, archive, and restore vendor records.
- **FR-012**: A vendor MUST be stored once and MUST be able to hold contact details, one or more categories, locations served, services, materials, indicative rates in Indian rupees, GST registration details, manpower, one current rating, and notes.
- **FR-013**: Saving a vendor MUST require a name, one phone number, and at least one category. The system MUST explain any missing or invalid field and MUST NOT save until those are corrected.
- **FR-014**: Vendor search MUST match name, phone number, contact person, services, and materials. Filters MUST include category, location served, manpower availability, linked project, and whether archived vendors are included. Archived vendors MUST stay out of the default directory.
- **FR-015**: An archived vendor MUST remain openable, MUST keep its notes, rating history, and project links, and MUST be restorable to the default directory.
- **FR-016**: Categories MUST come from one shared list. A category name MUST be matched without regard to letter case. When the name matches an existing category, that category MUST be reused and its stored name MUST stay unchanged. A vendor MUST be able to have more than one category.
- **FR-017**: A vendor rating MUST be a whole number from 1 to 5, or empty when the vendor has not been rated. Each change MUST keep the previous score, comment, date, and author readable.
- **FR-018**: Notes MUST be one of past work, reliability, coordination, or general. Each note MUST keep its text, date, and the staff member who wrote it.
- **FR-019**: Vendor manpower MUST record an approximate team size, an availability status, and an optional short note. Team size, when provided, MUST be a whole number of zero or greater. Availability, when provided, MUST be Available, Limited, or Unavailable. The manpower filter MUST match that status. A vendor MAY be saved with manpower left empty. This feature has no daily availability calendar. The availability status MUST NOT be treated as a guarantee that the vendor is free for a particular job or time, and it MUST NOT block scheduling.
- **FR-020**: An indicative rate MUST be a label, an amount in Indian rupees with at most two decimal places, zero or greater, and a unit. A negative amount or a third decimal place MUST be refused.
- **FR-021**: A GST-registered vendor MUST have a GSTIN. A vendor who is not GST registered MUST be saved without a GSTIN. The same GSTIN MUST NOT be stored on two vendors.
- **FR-022**: When a phone number already belongs to another vendor, the system MUST warn the person and MUST save the new vendor only after they confirm.
- **FR-023**: A person allowed to edit projects MUST be able to create, view, edit, archive, and restore projects. A project MUST require a name. Status MUST be one of Planned, Active, On hold, or Completed, and MUST be independent of the archive flag.
- **FR-024**: An archived project MUST leave the default project list, MUST remain openable with its vendor links, and MUST be restorable.
- **FR-025**: A person allowed to edit links MUST be able to associate an existing vendor with an existing project without creating a second vendor record. One vendor MUST be able to link to many projects, and one project MUST be able to link to many vendors.
- **FR-026**: The system MUST refuse a second link for the same vendor and project, and MUST refuse a new link when the vendor or the project is archived.
- **FR-027**: Each vendor-project link MUST store only the vendor's role on the project, the scope of work, and a note. Any of those three MAY be left empty. Vendor contact details, categories, indicative rates, manpower, ratings, and notes MUST remain on the vendor record and MUST NOT be copied onto the link.
- **FR-028**: Removing a link MUST leave the vendor record in place and MUST remove that association from the project. It MUST archive working schedules for that vendor and project. It MUST NOT delete those schedules, their task prices, their price history, or their costing-sheet files. An authorized staff member MUST still be able to read that history.
- **FR-029**: A staff member MUST be able to schedule work for a vendor on a project by entering a task, a date, a start time, an end time, and a required team size. The vendor MUST already be linked to that project. The vendor and the project MUST be active. The schedule MUST NOT copy vendor details onto the project.
- **FR-030**: The system MUST flag a schedule when the same vendor has another schedule on the same date whose start and end times overlap, including a schedule on a different project. A schedule that starts exactly when another ends does not overlap it. The system MUST still save the schedule. Overlapping schedules for different vendors MUST NOT be flagged as conflicts with each other.
- **FR-031**: A schedule MUST be refused when the task or date is missing, the end time is not later than the start time, or the required team size is missing, zero, negative, or not a whole number. A schedule covers one date. Start and end are times on that date.
- **FR-032**: Pricing MUST belong to each scheduled task. Two tasks for the same vendor on the same project MUST be able to carry different prices. A price MUST NOT be copied onto the vendor profile or onto the vendor-project link.
- **FR-033**: A scheduled task MAY have no price. When it is priced, it MUST use either one fixed agreed price or one attached costing sheet, not both. A fixed agreed price MUST be an amount in Indian rupees with at most two decimal places and zero or greater. A costing sheet MUST be one spreadsheet or PDF file of at most 10 MB. A signed-in staff member MUST be able to open that file from the task. A person who is signed out MUST be refused. Replacing the file MUST keep the previous file readable with the date and the staff member who replaced it. A staff member MUST be able to clear a task's current pricing method so the task can use the other method: clearing a fixed price records a reversal, and clearing a costing sheet archives it. The cleared price or file MUST stay readable with the date and the staff member who cleared it, and the task has no price until a new one is set.
- **FR-034**: Changing a fixed agreed price MUST keep the previous amount, the date, and the staff member who changed it readable on that job.
- **FR-035**: This feature MUST NOT include quotation comparison, purchase orders, invoices, vendor payments, or client advances.

### Key Entities

- **Staff account**: A person at the firm. Name, unique email, optional phone, one role, password, and whether access is active or revoked.
- **Vendor**: One business the firm can hire. Name, contact person, phone, alternate phone, email, address, categories, locations served, services, materials, indicative rates, GST registration flag, GSTIN, GST legal name, approximate team size, availability status, manpower note, current rating, rating history, notes, and an archive flag.
- **Category**: A shared label such as a trade. Names match without regard to letter case. Reuse keeps the stored name. Many vendors can use one category, and one vendor can use many categories.
- **Indicative rate**: A directory price for a vendor, with a label, an amount in Indian rupees, and a unit. It is not a quotation or an order.
- **Vendor note**: Past work, reliability, coordination, or a general note, with text, date, and author.
- **Project**: One of the firm's jobs as a whole. Name, optional client name as text, optional site location, optional description, status, and an archive flag. This feature does not include a separate client directory.
- **Vendor-project link**: The association between one vendor and one project. It stores the role on the project, the scope of work, and a note. It does not copy the vendor record. Removing the link does not remove the vendor.
- **Work schedule**: One booked task for one linked vendor on one project. Task, date, start time, end time, required team size, and any conflict with that vendor's other schedules.
- **Job price**: The fixed agreed price or the spreadsheet or PDF costing sheet on one scheduled task. Each task has its own price. It is not an indicative rate on the vendor, and it is not a quotation, order, invoice, or payment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can create a staff account and that person can sign in on the first attempt in under 2 minutes.
- **SC-002**: After an account is revoked, the person is refused on the next attempt to view or change a record, and is refused when they try to sign in again.
- **SC-003**: From a directory of 200 vendors, a staff member can locate one vendor by category and location in under 30 seconds.
- **SC-004**: A vendor linked to two projects appears on both projects while the directory still contains a single record for that vendor.
- **SC-005**: After a vendor or a project is archived, a staff member can still open it and see its details and existing links.
- **SC-006**: In every attempt, a person who is not an administrator is refused when creating, revoking, or changing a staff account.
- **SC-007**: A staff member can sign in, find a vendor, schedule work, and open a project on a phone screen and on a computer.
- **SC-008**: A staff member can add a vendor schedule, with task, date, times, and required team size, in under 2 minutes.
- **SC-009**: When a second schedule overlaps the same vendor's existing time, the conflict is visible on the schedule and both schedules remain saved.
- **SC-010**: After a fixed agreed price is saved on a scheduled task, the vendor profile still shows only that vendor's own indicative rates.
- **SC-011**: Two scheduled tasks for the same vendor on one project can show two different prices, and a signed-in staff member can open a costing sheet attached to a task. A signed-out person cannot open that file.

## Assumptions

- The three roles are the Owner / Administrator, Office Team / Architects, and Accountant described in `docs/prd.md`. This specification uses the names Administrator, Office Team, and Accountant.
- Staff do not register themselves. There is no password reset by email in this feature. A forgotten password is replaced by an administrator. A person may change their own password after signing in.
- Passwords are at least 8 characters. The system stores them so they cannot be read back.
- Resolved with the product owner on 2026-10-23: active office team members and accountants can view and edit every vendor, project, and link. Only administrators manage staff accounts. People are not assigned to projects in this feature.
- Revised with the product owner on 2026-10-23: manpower is an approximate team size, a status of Available, Limited, or Unavailable, and an optional note. The directory filters on that status. There is no daily calendar. The status does not mean the vendor is free or busy for a particular job or time.
- Revised with the product owner on 2026-10-23: a vendor-project link stores role, scope of work, and a note. It does not store a price or schedule dates. Vendor details stay on the vendor record.
- A project stores the client as a name on the project. Milestones, delay tracking, the general document library, spreadsheet import, client advances, dashboards, reminders, quotation comparison, purchase orders, invoices, and payments are out of scope. Those remain in later backlog items (FR-05 through FR-13, FR-15, and FR-16). Work scheduling is in this specification. Each scheduled task may carry a fixed price or one spreadsheet or PDF costing sheet. `docs/prd.md` numbers these FR-17 and FR-18.
- Resolved with the product owner on 2026-10-23: the priced job is each scheduled task. The costing sheet is a file, a spreadsheet or PDF, opened only by a signed-in staff member. A task does not use a fixed price and a costing sheet at the same time.
- GST details in this feature are whether the vendor is registered, the GSTIN when registered, and the legal name on the registration. GST deadlines, GST documents, and verification flags stay out of scope.
- Categories, locations served, services, and materials are shared or repeatable labels so filters stay consistent. They are not a price book or a materials catalog.
- Indicative rates stay on the vendor as directory information. They are not the agreed price of a job, and they are not quotations, purchase orders, or payment records.
- A conflict is the same vendor booked for overlapping times on the same date. Touching times, where one booking ends as the next begins, are not a conflict. The schedule is still saved. Schedules for other vendors are not part of that conflict.
- The current rating is optional. History of ratings and notes stays on the vendor after archive.
- The same phone number may be saved on two vendors only after the person confirms the warning. The same GSTIN may not.
- A link may be removed. Vendors, projects, and their notes are archived rather than deleted.
- Completed is a project status. Archive is a separate choice that removes a record from the default list.
- Vendor filters for location and manpower availability match the fields defined for the vendor. The linked-project filter lists vendors linked to the chosen project, including when the viewer has chosen to include archived vendors.
- Application setup, sample staff, vendor, and project data, one command that starts the system with that sample data, and the checks that must pass before work is merged belong to this feature's implementation plan. They are not a separate specification and are not additional user-facing requirements.
