# Feature Specification: Core Auth and Directory

**Feature Branch**: `001-core-auth-directory`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "001 core: auth and directory. Login, roles, admin creates and revokes users. Vendor directory with the full vendor model, categories, search, filter, archive, ratings and notes. Projects with archive. Vendor-to-project links with per-project fields. Covers FR-01, 02, 03, 04, 14. Project scaffolding, stack setup, seed data, one-command run and CI go into this spec’s plan rather than a separate spec."

**Backlog coverage**: FR-01, FR-02, FR-03, FR-04, FR-14 from `docs/prd.md`.

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
8. **Given** an active office team member or accountant, **When** they try to create, revoke, restore, or change a staff account, **Then** the system refuses the action.

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

An authorized staff member links an existing vendor to an existing project. The same vendor can appear on many projects, and a project can have many vendors, without a second copy of the vendor. The link holds the vendor's role on that project, the scope of work, an agreed rate in Indian rupees, a planned start, a planned end, and a note. The agreed rate is context for that job. It is not a quotation, invoice, or payment. A vendor or project that is archived cannot receive a new link. Existing links remain visible when someone opens the archived record.

**Why this priority**: The firm needs to see who is working on which job. The link is only useful after vendors and projects exist.

**Independent Test**: Create one vendor and two projects, link the vendor to both, and confirm both projects show the same vendor record.

**Acceptance Scenarios**:

1. **Given** one active vendor and two active projects, **When** a person links that vendor to each project, **Then** both projects list that vendor and the directory still contains one vendor record.
2. **Given** a vendor is already linked to a project, **When** a person tries to link that same pair again, **Then** the system refuses the duplicate link.
3. **Given** a vendor or a project is archived, **When** a person tries to create a new link for it, **Then** the system refuses the new link and existing links stay visible on the archived record.
4. **Given** a person removes a link that has a role, a scope, an agreed rate, dates, and a note, **When** they open the vendor and the project, **Then** the vendor record still exists, and the project no longer shows that link or those details.
5. **Given** a person saves a link with a role, a scope of work, an agreed rate, a planned start, a planned end, and a note, **When** they open that project, **Then** those details are shown on that link only, and the vendor's indicative rates are unchanged.
6. **Given** a planned end is earlier than the planned start, or the agreed rate is negative or has more than two decimal places, **When** the person saves the link, **Then** the system explains the problem and does not save those details.

---

### Edge Cases

- A person who is already signed in is revoked. The next attempt to view or change a record is refused, and signing in again is refused.
- The last active administrator cannot be revoked, restored into a non-administrator role, or archived. This feature has no separate archive action for staff accounts; revoke is how access ends.
- Two people try to revoke the same account. The account ends revoked, and the second attempt reports that it is already revoked.
- An administrator tries to create a user with an email that already exists. The system refuses, including when the existing account is revoked.
- A vendor is archived while linked to projects. The vendor leaves the default directory. Each linked project still shows the vendor and marks the vendor as archived.
- A project is archived while vendors are linked. Those vendors remain in the directory. The archived project still lists them.
- Search text matches nothing. The directory shows an empty result and the filters stay as the person set them.
- A rate amount, including an agreed rate on a link, has more than two decimal places or is negative. The system explains the problem and does not save that rate.
- A team size is negative or is not a whole number. The system explains the problem and does not save that manpower update. Availability accepts only Available, Limited, or Unavailable.
- A link has a planned end earlier than its planned start. The system explains the problem and does not save that link.
- Removing a link removes its role, scope, agreed rate, dates, and note from the project. The vendor record remains.
- A rating outside 1 to 5 is refused. A vendor may be saved with no rating.
- A note with no text is refused.
- A category name that already exists is reused rather than creating a second category with the same name.
- Filters combine. A vendor must match the search text and every selected filter. Including archived vendors is off unless the person turns it on.
- A person confirms a possible duplicate phone number, then the vendor is saved. If they do not confirm, the vendor is not saved.
- A GST-unregistered vendor is saved with no GSTIN. Adding a GSTIN later requires marking the vendor as registered.
- Restoring an archived vendor or project returns it to the default list and keeps its links.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A person MUST be able to sign in with an email address and a password, and MUST be able to sign out.
- **FR-002**: The system MUST refuse sign-in for an unknown email, a wrong password, or a revoked account, and MUST use the same refusal message for all three.
- **FR-003**: An administrator MUST be able to create a staff account with a name, a unique email, one role, and a password. The person MUST NOT be able to create their own account.
- **FR-004**: Each staff account MUST have exactly one role: Administrator, Office Team, or Accountant.
- **FR-005**: An administrator MUST be able to revoke an account, restore a revoked account, change another person's role, and set another person's password.
- **FR-006**: A revoked person MUST be refused on the next attempt to view or change any record, and earlier records they created MUST remain attributed to them.
- **FR-007**: The system MUST refuse any change that would leave the firm with no active administrator.
- **FR-008**: A person who is not an administrator MUST be refused when they create, revoke, restore, or change a staff account. Hiding the control is not sufficient; the action itself MUST be refused.
- **FR-009**: A signed-in person MUST be able to change their own password. They MUST NOT be able to change their own role.
- **FR-010**: Every active administrator, office team member, and accountant MUST be able to view, create, edit, archive, and restore every vendor and every project, and MUST be able to create, edit, and remove every vendor-project link. This feature has no assignment of people to projects. Only an administrator can manage staff accounts.
- **FR-011**: A person allowed to edit vendors MUST be able to create, view, edit, search, filter, archive, and restore vendor records.
- **FR-012**: A vendor MUST be stored once and MUST be able to hold contact details, one or more categories, locations served, services, materials, indicative rates in Indian rupees, GST registration details, manpower, one current rating, and notes.
- **FR-013**: Saving a vendor MUST require a name, one phone number, and at least one category. The system MUST explain any missing or invalid field and MUST NOT save until those are corrected.
- **FR-014**: Vendor search MUST match name, phone number, contact person, services, and materials. Filters MUST include category, location served, manpower availability, linked project, and whether archived vendors are included. Archived vendors MUST stay out of the default directory.
- **FR-015**: An archived vendor MUST remain openable, MUST keep its notes, rating history, and project links, and MUST be restorable to the default directory.
- **FR-016**: Categories MUST come from one shared list. Choosing an existing category name MUST reuse that category. A vendor MUST be able to have more than one category.
- **FR-017**: A vendor rating MUST be a whole number from 1 to 5, or empty when the vendor has not been rated. Each change MUST keep the previous score, comment, date, and author readable.
- **FR-018**: Notes MUST be one of past work, reliability, coordination, or general. Each note MUST keep its text, date, and the staff member who wrote it.
- **FR-019**: Vendor manpower MUST record an approximate team size, an availability status, and a short note. Team size, when provided, MUST be a whole number of zero or greater. Availability, when provided, MUST be Available, Limited, or Unavailable. The manpower filter MUST match that status. A vendor MAY be saved with manpower left empty. This feature has no daily availability calendar.
- **FR-020**: An indicative rate MUST be a label, an amount in Indian rupees with at most two decimal places, zero or greater, and a unit. A negative amount or a third decimal place MUST be refused.
- **FR-021**: A GST-registered vendor MUST have a GSTIN. A vendor who is not GST registered MUST be saved without a GSTIN. The same GSTIN MUST NOT be stored on two vendors.
- **FR-022**: When a phone number already belongs to another vendor, the system MUST warn the person and MUST save the new vendor only after they confirm.
- **FR-023**: A person allowed to edit projects MUST be able to create, view, edit, archive, and restore projects. A project MUST require a name. Status MUST be one of Planned, Active, On hold, or Completed, and MUST be independent of the archive flag.
- **FR-024**: An archived project MUST leave the default project list, MUST remain openable with its vendor links, and MUST be restorable.
- **FR-025**: A person allowed to edit links MUST be able to associate an existing vendor with an existing project without creating a second vendor record. One vendor MUST be able to link to many projects, and one project MUST be able to link to many vendors.
- **FR-026**: The system MUST refuse a second link for the same vendor and project, and MUST refuse a new link when the vendor or the project is archived.
- **FR-027**: Each vendor-project link MUST be able to store a role on the project, a scope of work, an agreed rate in Indian rupees, a planned start date, a planned end date, and a note. Any of those details MAY be left empty. The agreed rate, when provided, MUST follow the same amount rules as an indicative rate. A planned end earlier than the planned start MUST be refused. The agreed rate is context for that job and is not a quotation, invoice, or payment.
- **FR-028**: Removing a link MUST leave the vendor record in place and MUST remove that association from the project.

### Key Entities

- **Staff account**: A person at the firm. Name, unique email, optional phone, one role, password, and whether access is active or revoked.
- **Vendor**: One business the firm can hire. Name, contact person, phone, alternate phone, email, address, categories, locations served, services, materials, indicative rates, GST registration flag, GSTIN, GST legal name, approximate team size, availability status, manpower note, current rating, rating history, notes, and an archive flag.
- **Category**: A shared label such as a trade. Many vendors can use one category, and one vendor can use many categories.
- **Indicative rate**: A directory price for a vendor, with a label, an amount in Indian rupees, and a unit. It is not a quotation or an order.
- **Vendor note**: Past work, reliability, coordination, or a general note, with text, date, and author.
- **Project**: A job. Name, optional client name as text, optional site location, optional description, status, and an archive flag. This feature does not include a separate client directory.
- **Vendor-project link**: The association between one vendor and one project. It stores the role on the project, scope of work, agreed rate in Indian rupees, planned start, planned end, and a note. Removing the link removes those details from the project and does not remove the vendor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can create a staff account and that person can sign in on the first attempt in under 2 minutes.
- **SC-002**: After an account is revoked, the person is refused on the next attempt to view or change a record, and is refused when they try to sign in again.
- **SC-003**: From a directory of 200 vendors, a staff member can locate one vendor by category and location in under 30 seconds.
- **SC-004**: A vendor linked to two projects appears on both projects while the directory still contains a single record for that vendor.
- **SC-005**: After a vendor or a project is archived, a staff member can still open it and see its details and existing links.
- **SC-006**: In every attempt, a person who is not an administrator is refused when creating, revoking, or changing a staff account.
- **SC-007**: A staff member can sign in, find a vendor, and open a project on a phone screen and on a computer.

## Assumptions

- The three roles are the Owner / Administrator, Office Team / Architects, and Accountant described in `docs/prd.md`. This specification uses the names Administrator, Office Team, and Accountant.
- Staff do not register themselves. There is no password reset by email in this feature. A forgotten password is replaced by an administrator. A person may change their own password after signing in.
- Passwords are at least 8 characters. The system stores them so they cannot be read back.
- Resolved with the product owner on 2026-10-23: active office team members and accountants can view and edit every vendor, project, and link. Only administrators manage staff accounts. People are not assigned to projects in this feature.
- Resolved with the product owner on 2026-10-23: manpower is an approximate team size, a status of Available, Limited, or Unavailable, and a short note. The directory filters on that status. There is no daily calendar.
- Resolved with the product owner on 2026-10-23: a vendor-project link stores role, scope of work, agreed rate in Indian rupees, planned start, planned end, and a note. Those details may be left blank. The agreed rate is job context, not a financial record. Removing the link removes it from view.
- A project stores the client as a name on the project. A separate client directory, timelines, milestones, delays, documents, spreadsheet import, client advances, dashboards, reminders, quotations, orders, invoices, and payments are out of scope. Those remain in later backlog items (FR-05 through FR-13, FR-15, and FR-16).
- GST details in this feature are whether the vendor is registered, the GSTIN when registered, and the legal name on the registration. GST deadlines, GST documents, and verification flags stay out of scope.
- Categories, locations served, services, and materials are shared or repeatable labels so filters stay consistent. They are not a price book or a materials catalog.
- Indicative rates are directory information. They are not quotations, purchase orders, or payment records.
- The current rating is optional. History of ratings and notes stays on the vendor after archive.
- The same phone number may be saved on two vendors only after the person confirms the warning. The same GSTIN may not.
- A link may be removed. Vendors, projects, and their notes are archived rather than deleted.
- Completed is a project status. Archive is a separate choice that removes a record from the default list.
- Vendor filters for location and manpower availability match the fields defined for the vendor. The linked-project filter lists vendors linked to the chosen project, including when the viewer has chosen to include archived vendors.
- Application setup, sample staff, vendor, and project data, one command that starts the system with that sample data, and the checks that must pass before work is merged belong to this feature's implementation plan. They are not a separate specification and are not additional user-facing requirements.
