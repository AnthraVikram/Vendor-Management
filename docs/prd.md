# Product Requirements Document (PRD)

## Vendor & Project Management System

**Version:** 0.2
**Status:** Updated Draft â€” Pending Client Confirmation
**Product Type:** Internal Web Application
**Target Users:** Architecture and Interior Design Firm

## 1. Product Overview

The Vendor & Project Management System is a web application for managing vendors, projects, work timelines, agency coordination, documents, and payments.

The firm currently uses Excel, phone calls, and WhatsApp. The system will bring important information into one place and help the office team keep projects on schedule.

The application will work on computers and phones and will be developed in three phases.

## 2. Problem Statement

The firm faces several challenges:

- Vendors do not always meet deadlines or provide progress updates.
- Coordinating multiple agencies and sequencing their work is difficult.
- Some vendors struggle to understand drawings or coordinate with other agencies.
- Vendor manpower availability is difficult to track.
- Client advances, vendor payments, and GST-related information need better tracking.
- Vendor records and project documents are scattered across different sources.

The system should make responsibilities, deadlines, delays, vendor information, and financial records easier to manage.

## 3. Product Goals

1. Keep project timelines visible and help identify delays.
2. Improve coordination between agencies working on the same project.
3. Maintain a searchable vendor database with location and manpower information.
4. Track which vendors work on which projects.
5. Record client advances against projects.
6. Manage quotations, orders, deliveries, invoices, and vendor payments in later phases.
7. Store important documents and retain them for seven years, subject to applicable requirements.
8. Provide useful project-wise and vendor-wise reports.
9. Allow authorized staff to access the system from computers and phones.
10. Support importing existing vendor records from spreadsheets.

## 4. Target Users and Roles

### 4.1 Owner / Administrator

- View and manage all projects and vendors.
- View project timelines, delays, and financial summaries.
- Manage staff accounts and permissions.
- Review reports and important records.

### 4.2 Office Team / Architects

- Manage assigned projects and vendors.
- Update work schedules and progress.
- Track agency responsibilities, delays, and coordination issues.
- Record vendor manpower availability.
- Upload relevant documents.

### 4.3 Accountant

- Record client advances received against projects.
- Manage vendor invoices and payments as features become available.
- Track outstanding balances and payment due dates.
- Access authorized financial records and reports.

Access must be revocable when a staff member leaves the firm.

## 5. Project Scope

### 5.1 Phase 1 â€” Vendors, Projects, Timelines and Client Advances

**Priority: Build this first.**

The first version will include:

- Secure login and basic role-based permissions.
- Create, edit, search, and archive vendor records.
- Store vendor contact details, categories, locations served, services, materials, rates, and GST registration details.
- Record vendor manpower availability and approximate team size.
- Maintain vendor ratings, past work history, reliability notes, and coordination issues.
- Create and manage projects.
- Link multiple vendors to a project without creating duplicate vendor records.
- Record project milestones, responsible agencies, planned dates, deadlines, and progress updates.
- Identify upcoming deadlines, delayed activities, and missing progress updates.
- Import vendor records from spreadsheets with validation and duplicate detection.
- Upload and organize basic vendor and project documents.
- Record client advances received against each project, including amount and date.
- Show a simple dashboard with project deadlines, delays, vendor counts, and client advances.

**Phase 1 outcome:** The firm can manage its vendors, project timelines, coordination, and basic client advance records in one place.

### 5.2 Phase 2 â€” Quotations, Procurement and Work Tracking

Planned features:

- Record quotations from multiple vendors.
- Compare quotations before selecting a vendor.
- Create purchase orders and work orders.
- Track approvals where required.
- Track material deliveries and partial deliveries.
- Record work progress and completion.
- Track dependencies between agencies, including which activity must finish before another begins.
- Record coordination problems and their resolution.
- Send reminders for upcoming work, delays, and pending deliveries.
- Store quotations, orders, drawings, and delivery documents.

**Phase 2 outcome:** The firm can track procurement and coordinate agency work more systematically.

### 5.3 Phase 3 â€” Vendor Accounts and Reporting

Planned features:

- Record vendor invoices against projects and orders.
- Record vendor advances paid, full payments, and partial payments.
- Allocate payments to invoices.
- Calculate outstanding vendor balances.
- Track payment due dates and overdue amounts.
- Track client advances received and their allocation to projects or other agreed purposes.
- Provide project-wise vendor spending and financial summaries.
- Track GST-related documents, registration details, and relevant deadlines.
- Flag unverified GST information for review.
- Send reminders for pending payments and relevant deadlines.
- Export reports to Excel and PDF.
- Maintain a history of important financial changes.

**Phase 3 outcome:** The firm can track vendor accounts, project spending, payments, and financial obligations more reliably.

### 5.4 Out of Scope

The initial system will not include:

- Full accounting or general-ledger software.
- Automatic bank transaction integration.
- Automatic tax filing or GST return submission.
- Automatic payment execution.
- Native Android or iOS applications.
- AI-based vendor recommendations.
- Complex inventory or warehouse management.

These features can be reconsidered later if needed.

## 6. Core Workflows

### Workflow A â€” Manage a Vendor

1. An authorized user adds a vendor.
2. The user enters contact details, category, location, services, manpower information, and relevant GST details.
3. The system validates the required fields.
4. The vendor becomes searchable and can be linked to projects.
5. The firm can update the vendor's history, ratings, and notes over time.

### Workflow B â€” Manage Project Timelines

1. A user creates a project and records its milestones.
2. The user assigns each activity to the responsible agency or vendor.
3. Planned dates and deadlines are recorded.
4. The office team updates progress and records delays.
5. The system highlights upcoming deadlines and delayed work.
6. The team can review dependencies and identify activities affected by delays.

### Workflow C â€” Import Vendor Records

1. An authorized user uploads a supported spreadsheet.
2. The system previews the data.
3. Invalid rows and possible duplicates are identified.
4. The user reviews the import.
5. The system imports approved records and provides a summary of successful, skipped, and rejected rows.

### Workflow D â€” Record a Client Advance

1. An authorized user selects a project.
2. The user records the amount received and the date.
3. The record is associated with the relevant project and, where available, client information.
4. The system displays recorded advances in the project's financial summary.
5. Changes remain traceable.

### Workflow E â€” Manage Procurement and Vendor Payments

This workflow will be implemented across later phases.

1. Staff record and compare quotations.
2. An authorized user records the selected vendor and purchase/work order.
3. Staff track deliveries and work completion.
4. The accountant records invoices and payments.
5. The system calculates outstanding balances and identifies due or overdue obligations.

## 7. Functional Requirements

**FR-01 â€” Vendor Management:** Users shall be able to create, view, edit, search, filter, and archive vendor records.

**FR-02 â€” Vendor Information:** Vendor records shall support contact details, categories, locations served, services, materials, rates, manpower information, GST details, ratings, and notes.

**FR-03 â€” Project Management:** Users shall be able to create, update, view, and archive project records.

**FR-04 â€” Vendor-Project Relationships:** A vendor shall be associable with multiple projects without duplicating the vendor record.

**FR-05 â€” Timeline Management:** Users shall be able to record project milestones, responsible agencies, planned dates, deadlines, and progress.

**FR-06 â€” Delay Tracking:** The system shall identify overdue activities and allow users to record delays and coordination issues.

**FR-07 â€” Data Import:** The system shall import supported spreadsheet formats and report invalid rows and potential duplicates.

**FR-08 â€” Document Management:** Documents shall be associated with relevant vendors and projects, with support for additional document types in later phases.

**FR-09 â€” Client Advances:** Authorized users shall be able to record client advances against projects and view recorded amounts.

**FR-10 â€” Procurement:** The system shall support quotations, quotation comparisons, purchase/work orders, deliveries, and work progress in Phase 2.

**FR-11 â€” Vendor Accounts:** The system shall support invoices, advances paid, payment allocations, partial payments, and outstanding balances in Phase 3.

**FR-12 â€” Reminders:** The system shall support relevant project deadline, delivery, and payment reminders as each feature becomes available.

**FR-13 â€” Reporting:** The system shall provide project-wise and vendor-wise summaries, with Excel and PDF exports as planned.

**FR-14 â€” Access Control:** The system shall enforce permissions on the backend and allow authorized administrators to revoke user access.

**FR-15 â€” Audit History:** Important record changes, particularly financial changes, shall be traceable to the user and time of change.

**FR-16 â€” Document Retention:** The system shall support a seven-year document retention policy, subject to applicable legal requirements and the firm's policy.

## 8. Non-Functional Requirements

### Security

- Users must log in to access protected functions.
- Permissions must be enforced on the backend.
- Financial information must be restricted to authorized users.
- Private documents must not be accessible through unrestricted public links.
- Staff access must be revocable.

### Data Integrity

- Records must have unique identifiers.
- Vendor-project relationships must remain consistent.
- Financial values must use appropriate monetary representations.
- Client advances must remain distinct from vendor payments.
- Important historical and financial records must not be silently deleted or overwritten.

### Reliability

- Invalid inputs must produce clear error messages.
- Spreadsheet import errors must be reported.
- Backups and recovery procedures must be established before production use.
- Deadline and payment reminders must use clearly defined dates and rules.

### Usability

- The application must work on computers and phones.
- Vendor and project records must be searchable.
- Forms must explain validation errors clearly.
- Timelines and delays must be easy to identify.
- Financial summaries must clearly show what their amounts represent.

### Maintainability

- Important business rules must have automated tests.
- Database changes must be managed through migrations.
- Each phase must have defined requirements and acceptance criteria.

## 9. Success Criteria

The initial release will be considered successful when:

1. Existing vendor records can be imported and reviewed.
2. Staff can quickly find vendors by category, location, project, and manpower availability.
3. Multiple vendors can be linked to a project without duplicate records.
4. The team can see upcoming deadlines and delayed activities.
5. Staff can record progress and coordination issues.
6. Client advances can be recorded against projects.
7. Authorized users can access the system from computers and phones.
8. Vendor and project history remains available after records are archived.
9. Important documents can be stored and retrieved.
10. The core workflows pass their acceptance tests.

Later phases will be evaluated on procurement tracking, coordination, financial accuracy, reminder reliability, and report correctness.

## 10. Assumptions and Open Questions

The following details need confirmation before the relevant features are finalized:

- Which project timeline views are most useful to the office team?
- Should vendors eventually update their own progress, or will office staff enter updates?
- How should agency dependencies and work sequencing be represented?
- Should client advances be linked to client records as well as projects?
- How should advances be allocated or adjusted against project costs?
- Is daily manpower availability required, or is approximate team size and availability sufficient?
- Which GST details and deadlines does the firm need to track?
- Who can view, edit, or approve financial records?
- Which reminder channels should be used?
- Which spreadsheet formats and document types must be supported?
- What are the firm's hosting, backup, and document retention requirements?

## 11. Development Strategy

Development will follow a spec-driven workflow:

1. Confirm requirements with the client.
2. Finalize the specification for the next phase.
3. Create an implementation plan and small tasks.
4. Implement and test each task.
5. Demonstrate the working version to the client.
6. Collect feedback and update the specification.

The first priority is a usable foundation for vendors, projects, timelines, and client advances. Procurement and detailed vendor accounts will be introduced incrementally.



## 12. Technology Stack

| Component | Recommended technology | Purpose |
|---|---|---|
| Frontend | React + Vite + TypeScript | Responsive management dashboard |
| UI styling | Tailwind CSS | Consistent, maintainable interface |
| Backend | Node.js + Express.js + TypeScript | Business logic and REST APIs |
| Database | PostgreSQL 17+ | Vendors, projects, quotations, orders, invoices and payments |
| ORM & migrations | Prisma ORM + Prisma Migrate | Type-safe database queries and schema migrations |
| Authentication | Phone/email login + JWT access and refresh tokens | Secure user sessions |
| Authorization | Role-based access control (RBAC) | Separate permissions for owner, architects and accountant |
| File storage | Local storage initially, with an upgrade path to object storage | Quotations, invoices, purchase orders and supporting documents |
| PDF reports | PDFKit or a comparable PDF generation library | Generate invoices, summaries and financial reports |
| Notifications | In-app reminders; email integration as needed | Delivery deadlines, payment dues and project milestones |
| Version control | Git + GitHub | Source control and collaboration |
| CI/CD | GitHub Actions | Automated tests and deployment workflows |
| Deployment | Docker Compose on a cloud VM | Run the application and supporting services |
| Reverse proxy & HTTPS | Caddy | TLS certificates and secure web traffic |
| Testing | Vitest + Supertest | Unit and API integration tests |
| SDD tooling | GitHub Spec Kit | Requirements, plans, tasks and implementation verification |
| Monitoring | OpenTelemetry + Grafana; error tracking as needed | Diagnose errors and monitor application health |


