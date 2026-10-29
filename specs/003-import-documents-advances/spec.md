# Feature Specification: Import, Documents, and Advances

**Feature Branch**: `003-import-documents-advances`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "003 import, documents, advances. Spreadsheet import with validation, duplicates, preview and summary. Document upload on vendors and projects, never hard deleted. Client advances with record-only or reverse semantics and audit. The counts and money tiles on the dashboard. Covers FR-07, 08, 09, 15, 16"

**Backlog coverage**: FR-07, FR-08, FR-09, FR-15, FR-16 from `docs/prd.md`, and the vendor-count and client-advance part of the Phase 1 dashboard. Dashboard deadlines and delays belong to the timelines feature (FR-05, FR-06). Vendor payments, invoices, advance allocation, and report exports stay out of this specification.

## Clarifications

### Session 2026-10-29

- Q: When staff import the firm's existing vendor spreadsheet, must it be rearranged into a fixed column layout, or should staff match their own columns to vendor fields? → A: Fixed set of column headings, recognised in any column order and regardless of letter case and surrounding spaces. No column-mapping step.
- Q: When a client advance was entered wrongly, must the reversal cancel the full amount, or may staff reverse part of it? → A: Full reversal only. To correct an amount, staff reverse the advance and record a new one.
- Q: Should the dashboard's client-advance totals include advances on archived projects? → A: Yes. The money tiles cover all projects, archived included. The vendor and project count tiles still exclude archived records.
- Q: Who should be able to read the change history of vendors, projects, documents, imports, and advances? → A: All active staff. Nobody can edit or delete history.
- Q: Should every active staff member be able to run a spreadsheet import, or only Administrators? → A: All active staff (Administrators, Accountants, and Office Team members), matching their permission to create vendors. Every import still requires validation, duplicate detection, a complete preview, explicit confirmation, the 1,000-row limit, and a recorded summary with who ran it and when. Rejected and skipped rows are never imported.
- Q: When an older advance is reversed this month, which month's figure does the reversal reduce? → A: The month in which the original advance was received. The month tile counts advances received this month that are not reversed. A reversal recorded this month for an older advance does not reduce this month's figure. The all-time total excludes every reversed advance.
- Q: How must import confirmation behave on a system failure, a retry, or a stale preview? → A: Confirmation saves all eligible rows in one step, or none if a system failure occurs. Rows are revalidated at confirmation, and rows that have become invalid or duplicates are rejected while other eligible rows still import. A preview is single-use and confirmation is idempotent, so retries and double-clicks create no extra vendors. A preview expires 30 minutes after it is created and must then be uploaded again.
- Q: Are indicative rates imported? → A: No. The import template lists only vendor fields from the Feature 001 vendor form, excluding indicative rates. No new vendor fields are added.
- Q: Who may confirm or cancel an import preview? → A: Only the staff member who uploaded the file.
- Q: Which code baseline does Feature 003 build on? → A: The `002-timelines-delays` branch, which already includes Feature 001. Feature 003 is not merged into `main` as part of this work.
- Q: How are phone duplicates matched in the vendor form and in the import? → A: The same way in both. Spaces and dashes are removed, and the new vendor's phone and alternate phone are compared with every existing vendor's phone and alternate phone. A match is a possible duplicate that requires explicit approval. A GSTIN match is still rejected.
- Q: Can documents on an archived vendor or project be archived or restored? → A: No. Documents on an archived vendor or project are read-only: no upload, archive, or restore. Existing documents stay readable.
- Q: Can a rejected import row make a later row a duplicate? → A: No. Duplicate checks within a file compare only against earlier rows that are not rejected. Eligible rows still cannot duplicate each other, and conflicts with existing vendors are still caught.
- Q: Is there a size limit on the import file itself? → A: Yes. 25 MB, in addition to the 1,000-row limit.
- Q: What happens to an expired preview's data? → A: An expired preview cannot be viewed, confirmed, or cancelled. The cell values of a preview are removed once it is confirmed, cancelled, or expired, with no background job. The import run and its row outcomes are kept as the audit record.
- Q: What history do records that existed before Feature 003 show? → A: History begins when Feature 003 is deployed. No earlier events are created. Existing records keep their creation and update stamps.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record client advances and correct them by reversal (Priority: P1)

An Administrator or Accountant opens a project and records an advance received from the client: the amount in Indian rupees, the date received, and optionally the payment method, a reference such as a cheque or transaction number, and a note. The project shows every advance, every reversal, and the net amount received. A recorded advance is never edited or deleted. When an advance was entered wrongly, the staff member reverses it with a reason, and records a new correct advance if needed. Every entry shows who made it and when.

**Why this priority**: Client advances are the only money the firm tracks in Phase 1. The records must be trustworthy before anything summarizes them.

**Independent Test**: Record two advances on a project, reverse one with a reason, and confirm the project shows both advances, the reversal, the net amount, and the author and time of each entry. Confirm the advance cannot be edited or deleted.

**Acceptance Scenarios**:

1. **Given** an active project and a person allowed to record advances, **When** they save an advance with an amount and a date received, **Then** the project lists the advance with its amount, date, author, and time recorded, and the net amount received increases by that amount.
2. **Given** the amount is missing, zero, negative, or has more than two decimal places, or the date is missing or later than today, **When** the person saves, **Then** the system explains the problem and does not save the advance.
3. **Given** a recorded advance, **When** any person tries to change its amount, date, or details, or tries to delete it, **Then** the system refuses.
4. **Given** a recorded advance, **When** a person allowed to record advances reverses it with a reason, **Then** the original advance stays listed and marked as reversed, a reversal entry for the same amount appears with the reason, author, and time, and the net amount received decreases by that amount.
5. **Given** a reversal without a reason, or an advance that is already reversed, **When** a person tries to reverse it, **Then** the system refuses.
6. **Given** a person who is not allowed to record advances, **When** they try to record or reverse an advance, **Then** the system refuses the action itself, not only the control.
7. **Given** an archived project, **When** a person tries to record a new advance on it, **Then** the system refuses, and the project's existing advances and reversals remain readable.
8. **Given** an Office Team member, **When** they open a project, **Then** they see its advances, reversals, and net amount, and they are refused when they try to record or reverse an advance.
9. **Given** a person who is signed out or whose access is revoked, **When** they ask for a project's advances, **Then** the system refuses and sends no amounts.

---

### User Story 2 - Import vendors from a spreadsheet (Priority: P2)

An authorized staff member uploads the firm's existing vendor spreadsheet using the template headings. Before anything is saved, the system shows a preview of every row with its outcome: ready to import, rejected with the reasons, or a possible duplicate. The staff member decides whether each possible duplicate is imported or skipped, then confirms within 30 minutes. The system rechecks the rows and creates the approved vendors in one step, or none if the system fails part way. It then shows a summary of how many rows were imported, skipped, and rejected, and why. Leaving the preview without confirming saves nothing.

**Why this priority**: The firm's vendor list lives in spreadsheets today. Importing it is the fastest way to make the directory useful.

**Independent Test**: Upload a file with valid rows, a row missing a phone number, a row whose GSTIN already belongs to a vendor, and a row whose phone number matches an existing vendor. Skip the phone duplicate, confirm, and check that only the valid rows became vendors and the summary counts match.

**Acceptance Scenarios**:

1. **Given** a file in a supported format with the template headings, **When** a staff member uploads it, **Then** the system shows a preview of every row with its outcome and creates no vendors yet.
2. **Given** a row with no name, no phone number, or no category, or with any value the vendor form would refuse, **When** the preview is shown, **Then** that row is marked rejected with each reason and the row number, and it cannot be imported.
3. **Given** a row whose GSTIN already belongs to a vendor, or appears on an earlier row in the same file that is not rejected, **When** the preview is shown, **Then** that row is rejected as a duplicate GSTIN.
4. **Given** a row whose phone or alternate phone, after removing spaces and dashes, matches the phone or alternate phone of an existing vendor or of an earlier row in the same file that is not rejected, **When** the preview is shown, **Then** that row is marked as a possible duplicate, names the matching vendor or row, and is skipped unless the staff member chooses to import it.
5. **Given** a preview, **When** the staff member confirms, **Then** the system creates one vendor for each ready row and each possible duplicate the staff member chose to import, and shows a summary with the number imported, skipped, and rejected, and the reason for each skipped and rejected row.
6. **Given** a preview, **When** the staff member cancels or leaves without confirming, **Then** no vendor is created.
7. **Given** a file in an unsupported format, a file larger than 25 MB, a file with no data rows, a file over the row limit, or a file missing a required column heading, **When** the staff member uploads it, **Then** the system refuses the whole file and explains why.
8. **Given** a row lists a category that does not exist, **When** the row is imported, **Then** the category is created once and reused by later rows that name it, ignoring differences in letter case and surrounding spaces.
9. **Given** an import was confirmed, **When** a staff member opens the import history, **Then** they see who ran it, when, the file name, and the summary.
10. **Given** a preview was confirmed, **When** the same confirmation is sent again, by a retry or a double-click, **Then** no further vendor is created and the original summary is returned.
11. **Given** a preview created more than 30 minutes ago, or one that was cancelled, **When** the staff member tries to view, confirm, or cancel it, **Then** the system refuses, shows none of its rows, creates nothing, and asks for the file to be uploaded again.
12. **Given** a system or database failure part way through confirmation, **When** the failure occurs, **Then** no vendor from that batch is saved, no import is recorded as confirmed, and the staff member is told the import did not happen.
13. **Given** a staff member enters a phone number on the vendor form, **When** it matches an existing vendor's phone or alternate phone after removing spaces and dashes, such as "98765-43210" against "98765 43210", **Then** the system warns of the possible duplicate and saves only after the person confirms.
14. **Given** a preview uploaded by one staff member, **When** a different staff member tries to view, confirm, or cancel it, **Then** the system refuses and the preview is unchanged.
15. **Given** an earlier row is rejected, for example for a missing name, and a later valid row has the same GSTIN or phone, **When** the preview is shown, **Then** the later row is ready, not rejected or a possible duplicate, because of the earlier row. Two rows that are not rejected and share a GSTIN still leave the later one rejected.
16. **Given** a preview has been confirmed, cancelled, or has expired, **When** its stored data is examined, **Then** the cell values of its rows are gone, and for a confirmed preview the import run, its counts, and each row's number, outcome, and reasons remain.

---

### User Story 3 - Keep documents on vendors and projects (Priority: P3)

A staff member uploads a document to a vendor or a project with a title, a document type, and an optional note. Signed-in staff can open and download it from that record. A document that is no longer current is archived, not deleted. Archived documents are hidden from the default list and can be shown and restored. No one can permanently delete a document.

**Why this priority**: Agreements, registration certificates, and drawings are scattered today. Storing them on the record keeps them findable and retained.

**Independent Test**: Upload a document to a vendor and another to a project, open both while signed in, archive one, confirm it leaves the default list and can be shown and restored, and confirm a signed-out request for the file is refused.

**Acceptance Scenarios**:

1. **Given** an active vendor or project, **When** a staff member uploads a file of an accepted type within the size limit, with a title and a document type, **Then** the document appears on that record with its title, type, file name, size, uploader, and upload time.
2. **Given** a document on a vendor or a project, **When** a signed-in staff member opens it, **Then** the file is returned unchanged.
3. **Given** a person who is signed out or whose access is revoked, **When** they request a document, **Then** the system refuses, and no document can be reached by a link that skips sign-in.
4. **Given** a file of a type that is not accepted or larger than the size limit, or an upload with no title, **When** the staff member saves, **Then** the system explains the problem and does not store the document.
5. **Given** a document, **When** a staff member archives it, **Then** it leaves the default list, appears when archived documents are shown, can still be opened, and can be restored.
6. **Given** any document, active or archived, **When** any person tries to delete it permanently, **Then** the system offers no such action and refuses the request.
7. **Given** an archived vendor or project, **When** a staff member opens it, **Then** its documents, active and archived, remain listed and can be opened, and a new upload, an archive, or a restore of any of its documents is refused.

---

### User Story 4 - See counts and money on the dashboard (Priority: P4)

A signed-in staff member opens the dashboard and sees tiles for the number of active vendors, the number of active projects by status, and, for people allowed to view client advance amounts, the client advances that still stand, in total and for those received in the current month. Each tile states what it counts. Opening a tile leads to the list behind it.

**Why this priority**: The tiles summarize data the earlier stories create. They are useful only after vendors, projects, and advances exist.

**Independent Test**: With known vendors, projects, advances, and one reversal, open the dashboard and check that each tile equals the count or total worked out by hand.

**Acceptance Scenarios**:

1. **Given** active and archived vendors, **When** a staff member opens the dashboard, **Then** the vendor tile shows the number of vendors that are not archived.
2. **Given** projects in several statuses, some archived, **When** a staff member opens the dashboard, **Then** the project tiles show the number of non-archived projects in each status: Planned, Active, On hold, and Completed.
3. **Given** advances and reversals on several projects, **When** a person allowed to view advance amounts opens the dashboard, **Then** the total tile shows the sum of every advance that has not been reversed, on every project, archived or not, and the month tile shows the sum of advances received in the current calendar month that have not been reversed.
4. **Given** an Administrator, an Accountant, or an Office Team member, **When** they open the dashboard, **Then** each of them sees the same money tiles with the same amounts. A signed-out or revoked person receives no tiles and no amounts.
5. **Given** an advance is recorded or reversed, **When** the dashboard is opened afterwards, **Then** the money tiles include that entry.
6. **Given** a staff member selects a tile, **When** the list opens, **Then** it shows the vendors, projects, or project advances that make up that tile.
7. **Given** an advance received in an earlier month is reversed this month, **When** the dashboard is opened, **Then** the total tile drops by that amount and the month tile does not change.
8. **Given** an advance received this month is reversed, **When** the dashboard is opened, **Then** both the total tile and the month tile drop by that amount.

---

### User Story 5 - Trace who changed important records (Priority: P5)

Any active staff member opens the history of a vendor, a project, a document, an import, or a client advance and sees each important change with who made it and when. History cannot be edited or removed.

**Why this priority**: The PRD requires financial and important changes to be traceable. The record and reversal entries already carry authors; this story makes the history readable in one place.

**Independent Test**: Create and edit a vendor, archive a document, run an import, and record and reverse an advance. Open the history and confirm each change appears once with the right person and time.

**Acceptance Scenarios**:

1. **Given** a client advance was recorded and then reversed, **When** the history is opened, **Then** it shows both entries with the amount, the person, the time, and the reversal reason.
2. **Given** a document was uploaded, archived, and restored, **When** the history is opened, **Then** it shows each of those three actions with the person and the time.
3. **Given** a vendor or project was created, edited, archived, or restored, **When** the history is opened, **Then** each change shows the person, the time, and which fields changed with their previous and new values.
4. **Given** any history entry, **When** any person tries to change or delete it, **Then** the system refuses.
5. **Given** an Office Team member or an Accountant, **When** they open the history of a vendor, project, document, import, or advance, **Then** they see it. A signed-out or revoked person is refused.
6. **Given** a vendor or project created before Feature 003 was deployed, **When** its history is opened, **Then** it shows only changes made since deployment, together with the record's existing creation and last-update person and time. No earlier events are shown as history entries.

---

### Edge Cases

- The same phone number appears on two rows of one file and on no existing vendor. The first row is ready, and the second is a possible duplicate of the first.
- Row 3 is rejected for a missing name and has GSTIN X. Row 7 is valid with GSTIN X. Row 7 is ready, because row 3 will never be imported. If row 9 also has GSTIN X, row 9 is rejected as a duplicate of row 7.
- Row 4 is a possible duplicate and also has GSTIN Y. Row 8 has GSTIN Y. Row 8 is rejected in the preview as a duplicate of row 4, and stays rejected even if row 4 is not approved, because a row rejected in the preview is never imported.
- A file is larger than 25 MB. It is refused as a whole before any row is read.
- A row is ready in the preview, but another staff member saves a vendor with the same GSTIN before the import is confirmed. That row is rejected at confirmation and reported in the summary. Other rows still import.
- A row is ready in the preview, but another staff member saves a vendor with the same phone before the import is confirmed. At confirmation that row becomes a possible duplicate the person has not approved, so it is skipped and reported in the summary.
- The staff member double-clicks Confirm, or the connection drops and the browser retries. The vendors are created once, and every repeat returns the same summary.
- A preview is left open for more than 30 minutes. Viewing, confirming, or cancelling it is refused and the file must be uploaded and previewed again. Nothing was saved from the expired preview, and its cell values are removed.
- The database fails while the confirmed rows are being saved. None of the batch is saved, no import appears in the history, and the person may upload the file again.
- Two staff members preview the same file. Each confirmation is checked against the directory at that moment, so a second confirmation reports GSTIN duplicates created by the first.
- A row has extra columns that are not among the template headings. They are ignored and the preview says so once.
- The file's columns are in a different order from the template, or a heading differs only in letter case or surrounding spaces, such as " phone " for "Phone". The file is read normally.
- The same heading appears twice in one file. The whole file is refused and the message names the repeated heading.
- Blank rows in the file are ignored and not counted as rejected.
- Leading and trailing spaces in cells are removed before validation. Phone numbers are compared after removing spaces and dashes.
- A row's alternate phone matches an existing vendor's main phone, or its main phone matches an existing vendor's alternate phone. The row is a possible duplicate, as in the vendor form.
- A row has a negative or fractional team size, an availability other than Available, Limited, or Unavailable, a GST registered value other than Yes or No, a GSTIN that is not valid, or GST registered with no GSTIN. It is rejected with that reason, as the vendor form would refuse it.
- A file has a column for indicative rates, rating, or notes. It is not one of the template headings, so it is ignored like any other extra column.
- An import creates new vendors only. It never changes or archives an existing vendor.
- An advance dated in the past month is recorded today. The month tile uses the date received, not the date recorded.
- An advance received in an earlier month is reversed this month. This month's tile is unchanged. The total tile and the project's net amount drop by that amount.
- An advance on a project that is later archived stays on the project. It stays in the dashboard money totals, which cover all projects. The project leaves the project count tiles while it is archived.
- A reversal of an advance on an archived project is allowed, so a wrong entry can still be corrected. A new advance on an archived project is refused.
- A reversal cannot itself be reversed. To restore a wrongly reversed amount, the person records a new advance.
- An advance with the largest amount the system accepts, and the sum of many advances, are shown exactly to the paisa with no rounding.
- A document is uploaded with the same file name as an existing document on the record. Both are kept as separate documents.
- A vendor or a project is archived. Its documents stay attached and readable, and they still count toward retention. Its documents cannot be uploaded, archived, or restored until the vendor or project is restored. A document that was archived before the record was archived stays archived and readable.
- A vendor or project existed before Feature 003 was deployed. Its history starts at deployment, and its existing creation and last-update person and time are still shown.
- A staff member whose access is revoked keeps authorship of every advance, document, and import they made.
- The upload of a document or a spreadsheet stops part way. Nothing partial is stored.
- An empty project has no advances. It shows a net amount of zero.
- The dashboard is opened when there are no vendors, projects, or advances. Each tile shows zero.

## Requirements *(mandatory)*

### Functional Requirements

**Spreadsheet import (FR-07)**

- **FR-001**: Every active Administrator, Accountant, and Office Team member, being allowed to create vendors under spec 001, MUST be able to upload a vendor spreadsheet as an Excel workbook (.xlsx) or a comma-separated file (.csv). Any other format, including older Excel (.xls), MUST be refused. The system MUST read the first sheet of a workbook.
- **FR-002**: The import MUST use one published set of column headings taken from the Feature 001 vendor form. The headings MUST be exactly: Name, Phone, Categories, Contact person, Alternate phone, Email, Address, GST registered, GSTIN, GST legal name, Team size, Availability, Manpower note, Locations served, Services, and Materials. Categories, Locations served, Services, and Materials MAY hold several values separated by semicolons. GST registered MUST be Yes, No, or blank, and blank means No. Availability MUST be Available, Limited, Unavailable, or blank. Indicative rates, ratings, and notes MUST NOT be imported, and the import MUST NOT add any vendor field that the vendor form lacks. The system MUST recognise each heading in any column order, ignoring differences in letter case and surrounding spaces. The system MUST offer a blank template file with those headings. A file missing the name, phone, or category heading, or naming the same heading twice, MUST be refused as a whole. There is no step for mapping other column names to vendor fields.
- **FR-003**: A file MUST be no larger than 25 MB and MUST hold no more than 1,000 data rows. A file over either limit, an empty file, or a file in an unsupported format MUST be refused as a whole with a reason, and no preview MUST be created.
- **FR-004**: Before saving anything, the system MUST show a preview listing every non-blank row with its row number and one outcome: ready, rejected, or possible duplicate.
- **FR-005**: A row MUST be rejected, with each reason listed, when it would be refused by the vendor form. That includes a missing name, phone number, or category, an invalid team size, availability, GST registered value, or GSTIN, GST registered without a GSTIN, and a GSTIN on a vendor that is not GST registered.
- **FR-006**: A row MUST be rejected when its GSTIN already belongs to a vendor or appears on an earlier row of the same file that is not rejected. A rejected row MUST NOT cause any later row to be rejected or marked a possible duplicate.
- **FR-007**: A row MUST be marked a possible duplicate when its phone or alternate phone matches, under the rule in FR-030, the phone or alternate phone of an existing vendor or of an earlier row of the same file that is not rejected. The preview MUST name the match. Each possible duplicate MUST be skipped unless the person chooses to import it.
- **FR-008**: Confirming the preview MUST create one vendor for each ready row and each approved possible duplicate, rechecking each of those rows against the directory at that moment. A row rejected in the preview MUST stay rejected. A row that has become invalid or a GSTIN duplicate since the preview MUST be rejected. A row that has newly become a possible duplicate MUST be skipped unless the person approved it. The other eligible rows MUST still import. A rejected row, and a possible duplicate the person did not choose to import, MUST NOT create a vendor. Cancelling or leaving the preview MUST create nothing.
- **FR-008a**: All vendors from one confirmation, its new categories, and its import history entry MUST be saved together in one step. If a system or database failure occurs during that step, none of them MUST be saved, and the person MUST be told the import did not happen.
- **FR-008b**: A preview MUST be confirmed at most once. Repeating the confirmation, by a retry or a double-click, MUST create no further vendor and MUST return the summary of the original confirmation. A cancelled preview MUST NOT be confirmable.
- **FR-008c**: A preview MUST expire 30 minutes after it is created. Viewing, confirming, or cancelling an expired preview MUST be refused, MUST show none of its rows, MUST create nothing, and MUST tell the person to upload the file again.
- **FR-008d**: Only the staff member who uploaded the file MUST be able to view, confirm, or cancel its preview. Any other person MUST be refused, and the preview MUST stay unchanged.
- **FR-008e**: The cell values held for a preview MUST be removed when it is confirmed or cancelled. For an expired preview they MUST be removed no later than the next request for that preview or the next preview upload by anyone. Removal MUST NOT need a scheduled job. The import run and its row outcomes MUST be kept as the audit record of a confirmed import.
- **FR-009**: After confirmation the system MUST show a summary with the number of rows imported, skipped, and rejected, and the row number and reason for every skipped and rejected row.
- **FR-010**: Each confirmed import MUST be kept in an import history with the person, the time, the file name, and its summary. Vendors created by an import MUST show which import created them.
- **FR-011**: An import MUST only create vendors. It MUST NOT change, merge, or archive an existing vendor.

**Phone duplicate matching (Feature 001 vendor form and import)**

- **FR-030**: Two phone numbers MUST be treated as matching when they are equal after removing spaces and dashes. The new or edited vendor's phone and alternate phone MUST each be compared with the phone and alternate phone of every other vendor, archived included. This one rule MUST apply both to the vendor form from Feature 001, on create and on edit, and to the import. A match MUST be a possible duplicate that is saved only after explicit approval. A GSTIN match MUST still be refused.

**Documents (FR-08, FR-16)**

- **FR-012**: A staff member MUST be able to upload a document to an active vendor or an active project with a title, a document type, and an optional note. Document types MUST be Agreement, Drawing, Registration certificate, Photo, or Other.
- **FR-013**: The system MUST accept only PDF, JPG, PNG, Word (.doc, .docx), and Excel (.xls, .xlsx) files of at most 25 MB each. The system MUST check the file's actual content, not only its name. Any other file MUST be refused with a reason.
- **FR-014**: A document MUST be opened or downloaded only by a signed-in person with active access. No document MUST be reachable through a link that skips sign-in.
- **FR-015**: A document MUST be archived and restored, never permanently deleted, by any person. Archived documents MUST stay hidden from the default list, MUST be shown on request, and MUST remain openable. While a vendor or project is archived, its documents MUST be read-only: a new upload, and an archive or restore of any of its documents, MUST be refused. Its existing documents, active and archived, MUST remain listed and readable to signed-in staff with active access.
- **FR-016**: Every stored document MUST remain retrievable for at least seven years from upload. This feature MUST NOT include any automatic or manual purge of documents.

**Client advances (FR-09)**

- **FR-017**: Only an Administrator or an Accountant MUST be able to record or reverse a client advance. Administrators, Accountants, and Office Team members MUST be able to view advance amounts, reversals, and net totals on projects and on the dashboard. The server MUST refuse any other person, whether or not the control is shown.
- **FR-018**: A person allowed to record advances MUST be able to record a client advance on an active project with an amount in Indian rupees greater than zero with at most two decimal places, a date received no later than today, and optionally a payment method of Cash, Bank transfer, Cheque, UPI, or Other, a reference, and a note.
- **FR-019**: A recorded advance MUST NOT be edited or deleted by anyone. A correction MUST be made by reversing it.
- **FR-020**: A person allowed to record advances MUST be able to reverse an advance by giving a reason. The reversal MUST be a new entry for the full amount of the original, linked to it, with its own author and time. A partial reversal MUST NOT be offered. A wrong amount MUST be corrected by reversing the advance and recording a new one. An advance MUST be reversed at most once, and a reversal MUST NOT itself be reversed. Reversal MUST be allowed when the project is archived.
- **FR-021**: Each project MUST show its advances and reversals in date order, each with its author and time recorded, and the net amount received as the sum of advances minus reversals, exactly to the paisa.
- **FR-022**: Client advances MUST be recorded against a project and MUST NOT be linked to a vendor or treated as a vendor payment. The project's client name MUST be shown with its advances.

**Dashboard counts and money**

- **FR-023**: The dashboard MUST show the number of vendors that are not archived, and the number of non-archived projects in each status: Planned, Active, On hold, and Completed.
- **FR-024**: For people allowed to view advance amounts, the dashboard MUST show two money tiles covering all projects, archived included. The total tile MUST be the sum of every advance that has not been reversed. The month tile MUST be the sum of advances whose date received falls in the current calendar month and that have not been reversed. A reversal MUST count against the month in which the original advance was received, never the month in which the reversal was recorded, so a reversal recorded this month for an older advance MUST NOT reduce the month tile. Each tile MUST state in words what its number means.
- **FR-025**: The system MUST NOT send the money tiles or any advance amount to a person who is signed out, whose access is revoked, or whose role is not allowed to view advance amounts under FR-017.
- **FR-026**: The dashboard MUST reflect every saved change at the time it is opened. Selecting a tile MUST open the list of records behind it.

**Audit history (FR-15)**

- **FR-027**: The system MUST keep a history entry for each creation, edit, archive, and restore of a vendor or project, each document upload, archive, and restore, each confirmed import, and each advance and reversal. Each entry MUST record the person, the time, and for edits the fields changed with previous and new values. History MUST begin when Feature 003 is deployed. The system MUST NOT create history entries for events before deployment. Records that existed before deployment MUST keep and show their existing creation and last-update person and time.
- **FR-028**: Every active Administrator, Accountant, and Office Team member MUST be able to read the history of any vendor, project, document, import, or advance. A signed-out or revoked person MUST be refused. History entries MUST NOT be edited or deleted by anyone.

**Boundaries**

- **FR-029**: This feature MUST NOT include vendor payments, invoices, allocation of advances to costs, client records separate from the project, report exports, document version replacement, or deletion of any vendor, project, document, advance, or history entry.

### Key Entities

- **Import preview**: One uploaded file awaiting confirmation. The person, the file name, the time created, each row's preview outcome, and the person's choice for each possible duplicate. It expires 30 minutes after creation, can be confirmed once, and creates no vendor until confirmed. Its cell values are temporary and are removed once it is confirmed, cancelled, or expired. Its id, owner, status, and expiry remain so a later request can be refused with the right reason.
- **Import run**: One confirmed spreadsheet import. Person, time, file name, row counts imported, skipped, and rejected, and each row's outcome and reason.
- **Import row outcome**: One row of an import run. Row number, outcome (imported, skipped, rejected), reasons, the matching vendor or row for a possible duplicate, and the vendor created when imported.
- **Document**: One file stored on one vendor or one project. Title, type, note, original file name, size, uploader, upload time, and an archive flag. It is never deleted.
- **Client advance**: Money received from a client against one project. Amount in Indian rupees, date received, payment method, reference, note, author, time recorded, and whether it has been reversed. It is never edited or deleted.
- **Advance reversal**: A correcting entry for one client advance. The full amount of that advance, the reason, author, and time. It cannot be reversed.
- **History entry**: A read-only record of one important change. The record affected, the action, the person, the time, and for edits the previous and new values.
- **Dashboard tile**: A labeled count or amount worked out from current vendors, projects, and advances. It stores nothing of its own.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A staff member can import a 500-row vendor spreadsheet, review the preview, and see the summary in under 10 minutes.
- **SC-002**: In a test file seeded with known invalid rows, GSTIN duplicates, and phone duplicates, 100% of each are reported in the preview with the correct row number, and the summary counts equal the seeded counts.
- **SC-003**: No vendor is created when an import preview is cancelled, abandoned, or expired, or when a failure is forced during confirmation. Confirming the same preview twice or more creates each vendor exactly once.
- **SC-004**: A staff member can upload a document to a vendor or project and open it again in under 1 minute.
- **SC-005**: In every attempt, a signed-out or revoked person is refused a document.
- **SC-006**: No document, client advance, or history entry can be permanently removed or edited through any action in the system.
- **SC-007**: For any project, the net amount received equals the sum of its advances minus its reversals, to the paisa, in every test.
- **SC-008**: Every client advance and reversal shows the person who made it and the time, and 100% of the records and reversals in a test run appear in the history.
- **SC-009**: Each dashboard tile equals the count or amount worked out by hand from the same data, including after an advance is recorded or reversed, and including an older advance reversed in the current month.
- **SC-010**: In every test, an Office Team member is refused when recording or reversing an advance, and a signed-out or revoked person never receives an advance amount, on a project or on the dashboard.
- **SC-011**: In every test, the vendor form and the import flag the same set of phone duplicates for the same numbers, including numbers written with spaces or dashes and matches between a phone and an alternate phone.

## Assumptions

- Resolved with the product owner on 2026-10-28: the import accepts .xlsx and .csv files. Documents accept PDF, JPG, PNG, Word, and Excel files up to 25 MB each. Administrators and Accountants record and reverse client advances. Office Team members can view advance amounts but cannot record or reverse them.
- Resolved with the product owner on 2026-10-29: Feature 003 builds on the `002-timelines-delays` branch, which includes Feature 001. The `003-import-documents-advances` branch was fast-forwarded to that branch's tip, commit 3eeb966. Nothing from Feature 003 is merged into `main` as part of this work.
- Features 001 and 002 are in place: sign-in, roles, vendors, projects, categories, vendor-project links, timelines, and the timeline part of the dashboard. The vendor validation rules in Feature 001 are the rules the import applies to each row.
- Feature 002 states that its dashboard shows only timeline and delay information. That statement describes the scope of Feature 002. This feature adds the count and money tiles to the same dashboard page.
- FR-030 changes how the Feature 001 vendor form matches phone numbers. Before this feature, the form compared the exact text it was given. After it, the form ignores spaces and dashes. The form already compared phone and alternate phone, and it still warns and asks for confirmation rather than refusing.
- Resolved with the product owner on 2026-10-29: every active staff member can import vendors (FR-001). Every active staff member can also upload documents, and archive or restore documents, because spec 001 lets every role create and edit vendors and projects. Client advances are the exception and follow FR-017.
- "Record-only or reverse" means a client advance can be recorded or reversed and nothing else. This follows the constitution: financial records are append-only and a correction is a new reversing entry. Resolved with the product owner on 2026-10-29: reversals are always for the full amount (FR-020).
- The import headings are the 16 listed in FR-002, one per field on the Feature 001 vendor form, with repeated values separated by a semicolon. Columns may appear in any order. There is no screen to map arbitrary columns. Resolved with the product owner on 2026-10-29: indicative rates are not imported. Ratings and notes are not part of the vendor form; they are recorded separately with an author and a comment, so they are not imported either.
- The duplicate rules for the import and the vendor form are the same: a matching GSTIN is refused, and a matching phone number under FR-030 is a possible duplicate that the person may approve.
- Resolved with the product owner on 2026-10-29: import confirmation saves the whole eligible batch or nothing, is idempotent, and works only on a preview less than 30 minutes old.
- Import only creates vendors. Importing projects, schedules, or advances is out of scope.
- The 1,000-row limit covers a typical firm vendor list. A larger list is split into several files. The 25 MB file limit matches the document limit. A 1,000-row vendor sheet is far smaller.
- Documents cannot be deleted, so the seven-year retention requirement is met by keeping every document indefinitely. A later purge after seven years would need a PRD change. Backups and storage are covered in the implementation plan.
- Document types are the short list in FR-012. More types arrive with Phase 2, as the PRD notes. Costing sheets on scheduled tasks stay as defined in spec 001 and are not part of this document list.
- An advance stores the client by way of the project's client name. The PRD question of a separate client record stays open and outside this feature.
- The date received may not be in the future. The current month for the dashboard is the calendar month in India Standard Time.
- Dashboard deadline and delay tiles come from the timelines feature (FR-05, FR-06), not this one.
- Audit history covers the records named in FR-027. Changes made to staff accounts and schedules in spec 001 keep the author and time already defined there.
- Resolved with the product owner on 2026-10-29: history begins at deployment of Feature 003, and no earlier events are reconstructed. A reversal counts against the month in which the original advance was received. Documents on an archived vendor or project are read-only.
