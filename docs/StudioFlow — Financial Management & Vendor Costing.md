# StudioFlow — Financial Management & Vendor Costing

---

# 1\. Objective

Extend StudioFlow to provide financial visibility and management across projects, client costing, vendor quotations, Bills of Quantities (BOQs), vendor commitments, advances, payments and outstanding balances.

The new functionality should integrate with the existing vendor and project management workflows rather than create disconnected financial modules.

StudioFlow is evolving from a Vendor & Project Management System towards an Architecture Firm Operations & Financial Management System.

The objective is to help the firm understand:

* How much a project is worth to the firm.  
* How much the firm has quoted to its client.  
* How much vendors have quoted for different project sections.  
* Which vendor quotations have been approved.  
* How much money has been committed to vendors.  
* How much has already been paid.  
* How much remains payable.  
* Whether project costs are within the agreed financial limits.  
* Where the firm's financial commitments and expenses are concentrated.

The system should provide reliable financial information while retaining the simplicity and usability of the existing StudioFlow application.

## 1.1 Guiding Principles

1. Single source of truth: Financial records should be connected to the relevant projects, vendors and project sections.  
2. No silent financial changes: Approved quotations, commitments and payment records must retain their history.  
3. Clear financial terminology: Estimated costs, quoted amounts, approved commitments and actual payments must remain distinct.  
4. Traceability: Important financial actions should record who performed them and when.  
5. Controlled access: Financial information and actions should respect approved user permissions.  
6. Incremental implementation: Financial functionality should be introduced through smaller, independently testable features.  
7. Reliable calculations: Dashboard metrics must be calculated from defined financial records, not assumptions.

---

# 2\. Existing StudioFlow Foundation

The financial additions must build upon the existing application.

Features 001–005 have already established:

* User authentication and role-based access.  
* Administrator, Office Staff and Accountant roles.  
* Shared vendor directory.  
* Shared project directory.  
* Vendor and project profiles.  
* Many-to-many vendor/project assignments.  
* Project sections and vendor assignments.  
* Assignment history.  
* Project activities and timelines.  
* Dashboard summaries and project visibility.  
* Archive and restore functionality.  
* Existing application navigation and UI system.

## 2.1 Integration Requirements

The new functionality should:

* Reuse existing vendor records instead of creating duplicate vendor records for financial purposes.  
* Reuse existing project records.  
* Associate financial information with existing project sections wherever relevant.  
* Preserve existing vendor/project assignments.  
* Allow financial records to be accessed from relevant project and vendor profiles.  
* Extend the existing dashboard rather than replace its current functionality.  
* Preserve existing authentication and staff management behaviour.  
* Avoid introducing a separate vendor or project directory.

## 2.2 Existing Functionality Must Remain Stable

Financial additions must not unintentionally alter:

* Existing authentication.  
* Existing role permissions.  
* Vendor and project CRUD operations.  
* Vendor/project assignment behaviour.  
* Project section functionality.  
* Activity and timeline tracking.  
* Existing archive/restore behaviour.  
* Existing dashboard functionality.

Any changes to existing behaviour must be explicitly specified, reviewed and approved.

---

# 3\. Business Workflow

The proposed financial workflow follows the way an architecture/interior design firm handles a project.

## 3.1 End-to-End Workflow

1. The firm receives a project from a client.  
2. The project is created in StudioFlow.  
3. The firm records the client's stated budget or project value, where available.  
4. The firm prepares a costing estimate and submits a quotation to the client.  
5. The client reviews the quotation.  
6. The project is divided into sections or work packages.  
7. Vendors submit quotations and BOQs for relevant sections.  
8. The office uploads and associates these documents with the relevant vendor, project and section.  
9. The firm compares vendor quotations.  
10. The firm selects and approves a vendor quotation.  
11. The approved quotation becomes a vendor commitment.  
12. The firm records advances and subsequent payments.  
13. StudioFlow calculates paid amounts and outstanding balances.  
14. Management reviews project-level and overall financial information.

## 3.2 Important Business Distinctions

The system must distinguish between:

* A quotation received and a quotation approved.  
* An estimated cost and an approved cost.  
* A vendor assignment and a financial commitment.  
* A payment recorded and a payment approved, if approval is required.  
* A project budget and the actual agreed client amount.  
* A financial estimate and a verified financial result.

A vendor being assigned to a project or section must not automatically mean that the vendor has received an approved financial commitment.

Similarly, receiving a vendor quotation must not automatically increase approved project costs.

---

# 4\. Financial Terminology and Data Definitions

Before implementation, StudioFlow must use consistent definitions for financial values.

## 4.1 Client-Side Financial Terms

| Term | Definition |
| ----- | ----- |
| Client Budget | The budget communicated or allocated by the client for the project. |
| Firm Costing Estimate | The firm's internal estimate of the project cost. |
| Firm Quotation | The amount formally quoted by the firm to the client. |
| Agreed Client Amount | The amount formally accepted by the client. |
| Client Quotation Revision | A new version of the firm's quotation reflecting changes or negotiations. |
| Client Amount Received | Money actually received from the client, if client payment tracking is included in scope. |

These values must remain separate because a client's budget, the firm's quotation and the agreed amount may differ.

## 4.2 Vendor-Side Financial Terms

| Term | Definition |
| ----- | ----- |
| Vendor Quotation | An amount proposed by a vendor for specific project work. |
| Estimated Vendor Cost | An estimated vendor expense before formal approval. |
| Approved Vendor Quotation | A vendor quotation formally accepted by the firm. |
| Vendor Commitment | The approved financial obligation associated with an appointed vendor. |
| Advance Payment | An initial payment made to a vendor against an approved commitment. |
| Subsequent Payment | Any additional payment made after an advance. |
| Total Paid | The total amount of valid recorded payments against a commitment. |
| Outstanding Payable | The remaining amount payable against a commitment. |

## 4.3 Calculation Definitions

The following calculations are proposed.

Vendor Commitment

The approved financial amount associated with an appointed vendor quotation.

Total Paid

The sum of valid payment records associated with a vendor commitment.

Outstanding Payable

Approved Vendor Commitment − Total Valid Payments

Vendor Cost Variance

Approved Vendor Cost − Estimated Vendor Cost

Estimated Project Margin

Agreed Client Amount − Relevant Project Costs

Estimated project margin must not automatically be labelled as profit.

The calculation must account for the agreed cost categories, inclusions and exclusions.

## 4.4 Financial Calculation Rules

* Unapproved vendor quotations must not be included in approved vendor commitments.  
* Cancelled quotations must not contribute to approved commitment totals.  
* Only valid payment records should contribute to total paid.  
* Reversed or cancelled payments must be handled explicitly.  
* Revised commitments must preserve their previous approved values.  
* Outstanding balances must reflect approved adjustments and valid payments.  
* Overpayments must be identifiable rather than silently converted into negative balances.  
* All financial calculations must use a consistent currency and agreed precision.  
* The system must not assume that all financial amounts include taxes.

Open Decision: The firm must confirm how GST, discounts, transport, labour, materials and other additional costs are represented.

---

# 5\. Project-Level Financial Management

Every project should have a dedicated Financial Overview section.

This section should consolidate client-side costing, vendor costs, approved commitments and payments.

## 5.1 Client and Firm Costing

Proposed information:

* Client budget.  
* Internal project costing estimate.  
* Firm quotation submitted to the client.  
* Agreed client amount.  
* Quotation submission date.  
* Client approval status.  
* Quotation revision history.  
* Notes and supporting documents.

The system should retain previous quotation versions.

A revised quotation must not overwrite the previous quotation.

## 5.2 Vendor Costing

Proposed information:

* Total estimated vendor costs.  
* Total approved vendor costs.  
* Vendor-wise cost breakdown.  
* Project-section-wise cost breakdown.  
* Estimated versus approved vendor cost.  
* Vendor quotation status.  
* Approved vendor commitments.  
* Cost revisions and adjustments.

The system should allow management to identify which project sections account for the largest vendor costs.

## 5.3 Payment Overview

Proposed information:

* Total advances paid.  
* Subsequent payments.  
* Total amount paid.  
* Outstanding vendor balance.  
* Payment due dates.  
* Payment history.  
* Payment references.  
* Supporting receipts or proof.

Payments should be associated with the relevant vendor, project and approved commitment.

## 5.4 Project Financial Status

Proposed statuses:

| Status | Meaning |
| ----- | ----- |
| Within Budget | Approved costs remain within the defined project financial limit. |
| Approaching Budget | Costs have reached an agreed warning threshold. |
| Over Budget | Costs exceed the defined project financial limit. |
| Awaiting Client Approval | The firm's quotation is awaiting client approval. |
| Vendor Payments Pending | One or more vendor payments are due or outstanding. |
| Financial Review Required | Financial information is incomplete or requires attention. |

The status rules and warning thresholds must be defined before implementation.

A project may have more than one applicable financial condition.

The system should not use arbitrary colour coding or unexplained status changes.

---

# 6\. Client Costing and Quotations

This section covers the firm's financial proposal to its client.

## 6.1 Quotation Management

StudioFlow should support:

* Creating and recording client quotations.  
* Associating quotations with projects.  
* Recording quotation amounts.  
* Recording quotation dates.  
* Tracking quotation submission and approval status.  
* Storing supporting quotation documents.  
* Maintaining quotation revision history.  
* Recording changes between revisions.  
* Recording the final agreed client amount.

## 6.2 Quotation Statuses

Proposed statuses:

* Draft.  
* Submitted.  
* Under Review.  
* Approved.  
* Rejected.  
* Revised.  
* Withdrawn.

The firm must confirm whether all these statuses are needed and who can change them.

## 6.3 Revision History

Every revision should preserve:

* Previous quotation amount.  
* Revised quotation amount.  
* Revision date.  
* Revision reason.  
* Person responsible.  
* Approval status.  
* Supporting document, where applicable.

The system should clearly identify the current quotation version without deleting earlier versions.

## 6.4 Client Payments

Client payment tracking is a separate scope decision.

If included, it may cover:

* Client advances received.  
* Milestone payments received.  
* Other client receipts.  
* Payment dates.  
* Payment methods.  
* References.  
* Supporting receipts.  
* Outstanding client receivables.

If client payments are excluded, the first financial release will focus on project costing and vendor-side financial management.

Open Decision: Confirm whether StudioFlow should track money received from clients in addition to money paid to vendors.

---

# 7\. Vendor BOQ and Quotation Document Management

Vendor document management is a core addition.

Vendors may submit quotations and BOQs in different formats. StudioFlow should provide a central location to store and retrieve these documents.

## 7.1 Supported Documents

Proposed supported document types:

* PDF quotations.  
* Excel BOQs (.xlsx).  
* Excel spreadsheets (.xls).  
* Revised quotations.  
* Supporting costing documents.  
* Other approved project-related costing documents.

Actual supported formats and upload limits must be confirmed during technical planning.

## 7.2 Document Metadata

Every uploaded document should record:

* Vendor.  
* Project.  
* Project section or work package, where applicable.  
* Document type.  
* Document title or description.  
* Upload date and time.  
* Revision or version.  
* Uploaded by.  
* Approval status.  
* Associated quotation, where applicable.

## 7.3 Document Versioning

Document history must be preserved.

For example:

1. Vendor submits Quotation V1.  
2. Office uploads V1.  
3. Vendor submits revised Quotation V2.  
4. Office uploads V2.  
5. V1 remains accessible.  
6. V2 is identified as the latest version.

Uploading a new version must never silently overwrite the original document.

The system should identify the current version and preserve previous versions.

## 7.4 Document Access and Management

The following requirements need business approval:

* Who can upload documents?  
* Who can view documents?  
* Who can download documents?  
* Who can change document metadata?  
* Who can mark documents as approved or rejected?  
* Can documents be deleted, or should they only be archived?  
* How long should financial documents be retained?

Financial document access must follow the approved permission model.

## 7.5 Vendor Profile — Costing & Quotations

Add a dedicated Costing & Quotations section to the existing vendor profile.

It should display:

* All submitted BOQs.  
* All submitted quotations.  
* Associated projects.  
* Associated project sections.  
* Quotation amounts, where available.  
* Revision history.  
* Approval status.  
* Appointment or commitment status.  
* Relevant document links.

This gives the firm a central history of each vendor's submitted and approved costing documents.

---

# 8\. Structured BOQ Data and Vendor Quotation Comparison

Quotation comparison should be a dedicated workspace rather than simply a list of uploaded files.

## 8.1 Objective

Allow the office to compare multiple vendor quotations for the same project section or work package.

The comparison should help the firm understand not only which vendor has the lowest quotation, but also whether the vendors are quoting for equivalent work.

## 8.2 Example

A project requires carpentry work. Three vendors submit quotations.

| Work Item | Vendor A | Vendor B | Vendor C |
| ----- | ----- | ----- | ----- |
| Wardrobes | ₹2,40,000 | ₹2,20,000 | ₹2,55,000 |
| Kitchen Cabinets | ₹1,80,000 | ₹1,95,000 | ₹1,75,000 |
| Installation | ₹35,000 | ₹30,000 | ₹40,000 |
| Total | ₹4,55,000 | ₹4,45,000 | ₹4,70,000 |

*Illustrative values only.*

## 8.3 BOQ Line-Item Structure

For meaningful comparison, the system should support structured BOQ information.

Proposed fields:

* Item description.  
* Quantity.  
* Unit.  
* Rate.  
* Amount.  
* Taxes.  
* Discounts, where applicable.  
* Additional charges.  
* Exclusions.  
* Specifications or remarks.

The actual office BOQ template should be collected before finalising the data structure.

## 8.4 Comparison Functionality

The comparison workspace should support:

* Comparing multiple vendors for the same project section.  
* Comparing individual BOQ line items.  
* Comparing total quotation amounts.  
* Identifying the lowest and highest quotations.  
* Showing differences between vendors.  
* Highlighting individual item rate differences.  
* Identifying missing items.  
* Identifying unmatched line items.  
* Highlighting different quantities.  
* Highlighting differing specifications.  
* Identifying additional charges and exclusions.  
* Recording manual corrections.  
* Keeping the original uploaded document accessible.

## 8.5 Manual Corrections

The system should allow authorised users to correct extracted or manually entered BOQ data.

Corrections should not alter the original uploaded document.

The system should retain the structured comparison data and its correction history.

## 8.6 BOQ Data Entry and Extraction

Uploading a PDF or Excel file does not automatically mean StudioFlow can interpret its contents.

The following should be treated as separate capabilities:

1. Uploading and storing original documents.  
2. Manually entering structured BOQ data.  
3. Importing structured data from supported Excel templates.  
4. Extracting data from PDFs or other formats, if required.

Automated extraction should only be considered after the firm provides actual BOQ samples and the expected data structure is understood.

## 8.7 Vendor Selection

The comparison workspace should support the firm's evaluation process.

However:

* The lowest quotation must not automatically be selected.  
* StudioFlow should not automatically appoint a vendor.  
* Final vendor selection must remain a deliberate business decision.  
* The selected quotation should be explicitly approved before becoming a financial commitment.

---

# 9\. Vendor Appointment and Financial Commitments

This section connects vendor selection to project financial records.

## 9.1 Quotation Approval Workflow

Proposed progression:

1. Vendor quotation received.  
2. Quotation uploaded and associated with the project and section.  
3. Quotation reviewed.  
4. Comparison performed, where applicable.  
5. Firm selects a quotation.  
6. Selected quotation is approved.  
7. Approved quotation becomes a vendor commitment.

The system should preserve the relationship between the original quotation and the resulting commitment.

## 9.2 Commitment Information

Each vendor commitment should record:

* Vendor.  
* Project.  
* Project section or work package.  
* Approved quotation.  
* Approved amount.  
* Approval date.  
* Approved by.  
* Supporting documents.  
* Commitment status.  
* Revision history.

## 9.3 Commitment Changes

If the scope or amount changes after approval:

* The previous approved amount must remain available.  
* The revised amount must be recorded separately.  
* The reason for the change should be captured.  
* The person responsible should be recorded.  
* Approval should be obtained according to the firm's policy.  
* The current commitment should be clearly identified.

A new quotation or revision must not silently modify an existing approved commitment.

---

# 10\. Vendor Payments and Advances

Vendor payments should have a dedicated financial workflow.

## 10.1 Payment Workflow

Step 1 — Approved Commitment

A vendor quotation is formally approved and becomes a commitment.

Step 2 — Advance Payment

An advance is recorded against the commitment.

Step 3 — Subsequent Payments

Additional payments are recorded as work progresses or according to agreed milestones.

Step 4 — Outstanding Balance

StudioFlow calculates the remaining payable amount against the current approved commitment.

## 10.2 Payment Record Fields

Every payment should record:

* Vendor.  
* Project.  
* Project section, where applicable.  
* Related approved quotation or commitment.  
* Payment type.  
* Amount.  
* Payment date.  
* Payment method.  
* Payment reference.  
* Supporting receipt or proof.  
* Recorded by.  
* Recording date and time.  
* Approval status, if required.  
* Notes.

## 10.3 Payment Types

Proposed types:

* Advance.  
* Milestone Payment.  
* Partial Payment.  
* Final Payment.  
* Other Approved Payment.

The firm should confirm whether any additional payment categories are needed.

## 10.4 Payment Statuses

Proposed statuses:

* Recorded.  
* Pending Approval.  
* Approved.  
* Rejected.  
* Cancelled.  
* Reversed.

The final status model depends on the firm's payment approval policy.

## 10.5 Payment History and Corrections

Financial records must not be silently overwritten.

The system should:

* Preserve payment history.  
* Record who created each payment.  
* Record who modified or approved it.  
* Preserve previous values when corrections are made.  
* Provide a traceable method for cancellation or reversal.  
* Maintain supporting documentation.

A cancelled or reversed payment must no longer contribute to the valid paid total.

## 10.6 Outstanding Balance

Proposed calculation:

Outstanding Payable \= Current Approved Commitment − Total Valid Payments

The system must also identify:

* Overpayments.  
* Payments awaiting approval.  
* Payments that have been rejected.  
* Payments that have been cancelled or reversed.  
* Commitments that have been revised.

The calculation should use only the financial records and statuses defined by the approved business rules.

---

# 11\. Financial Dashboard

The dashboard should provide management with an overview of the firm's financial position.

It should summarise information from the underlying project, quotation, commitment and payment records.

Detailed financial actions should take place within dedicated screens.

## 11.1 Main Financial Summary

Proposed metrics:

| Metric | Description |
| ----- | ----- |
| Total Project Value | Combined value of relevant client projects, based on the agreed definition. |
| Client Budget | Combined client budgets, where recorded. |
| Firm Quoted Amount | Total amount quoted by the firm to clients. |
| Agreed Client Amount | Total accepted client quotation amounts. |
| Estimated Vendor Costs | Estimated costs from vendor quotations. |
| Approved Vendor Commitments | Total value of approved vendor commitments. |
| Vendor Advances Paid | Valid advance payments made to vendors. |
| Other Vendor Payments | Valid subsequent vendor payments. |
| Total Vendor Payments | Total valid payments made to vendors. |
| Outstanding Vendor Balance | Remaining amount payable against approved commitments. |
| Estimated Project Margin | Difference between agreed client amounts and defined relevant project costs, where sufficient data exists. |

Every metric must have a documented calculation and inclusion rule.

Metrics should not display misleading values when source information is incomplete.

## 11.2 Financial Graphs

Three primary visualisations are proposed.

### A. Project Cost Comparison

Compare:

* Client budget.  
* Firm quotation.  
* Agreed client amount.  
* Estimated vendor costs.  
* Approved vendor commitments.

This should help management identify projects where vendor costs are approaching or exceeding the relevant financial limits.

### B. Payment Tracking

Show:

* Advances.  
* Subsequent payments.  
* Total payments.  
* Outstanding balances.  
* Payment trends over time.

This should help management understand outgoing cash flow.

### C. Project-Wise Financial Breakdown

Show which projects account for the largest:

* Vendor commitments.  
* Vendor payments.  
* Outstanding balances.  
* Estimated project costs.

This should help management identify where financial commitments are concentrated.

## 11.3 Dashboard Filters

Proposed filters:

* All Projects / Individual Project.  
* Date Range.  
* Active Projects.  
* Completed Projects.  
* Archived Projects.  
* Vendor.  
* Vendor Category.  
* Project Section, where relevant.

The exact behaviour of date filters must be defined separately for quotations, commitments and payments.

For example, filtering payments by payment date should not be confused with filtering projects by creation date.

## 11.4 Drill-Down Behaviour

Clicking a dashboard metric or graph should ideally navigate to the relevant underlying records.

Examples:

* Clicking outstanding vendor balance opens the vendor outstanding register.  
* Clicking a project cost opens that project's financial overview.  
* Clicking a vendor payment metric opens the payments register.  
* Clicking an approved commitment opens its associated quotation and approval details.

Dashboard summaries must remain traceable to the records used to calculate them.

## 11.5 Financial Status and Warnings

The dashboard may highlight:

* Projects approaching budget limits.  
* Projects exceeding budget limits.  
* Vendor payments due.  
* Outstanding balances.  
* Pending quotation approvals.  
* Financial records requiring review.

Warnings must be based on explicitly defined rules.

---

# 12\. Finance Module and Navigation

The navigation should remain simple and should not overload the existing application.

The following is a proposed structure, not a final UI decision.

| Main Navigation | Proposed Subsections |
| ----- | ----- |
| Dashboard | Existing Overview, Financial Summary |
| Projects | Project Overview |
|  | Sections & Vendors |
|  | Financial Overview |
|  | Client Costing & Quotations |
|  | BOQs & Vendor Quotations |
|  | Payments & Advances |
| Vendors | Vendor Directory |
|  | Vendor Profile |
|  | Costing & Quotations |
|  | Project Assignments |
| Cost Comparison | Quotation Comparison Workspace |
| Finance | Payments Register |
|  | Vendor Outstanding Balances |
|  | Project Financial Reports |

## 12.1 Navigation Principles

* Existing project and vendor profiles should remain the primary entry points for related information.  
* Financial information should be accessible in context.  
* Avoid unnecessary duplication between the Projects, Vendors and Finance sections.  
* The dashboard should summarise information rather than contain every financial operation.  
* New navigation items should only be introduced when their workflows are defined.  
* The final navigation should be reviewed against actual office usage.

---

# 13\. Permissions and Financial Controls

StudioFlow currently supports:

* Administrator.  
* Office Staff.  
* Accountant.

The existing access model allows active administrators, office team members and accountants to view and edit shared vendor, project and assignment information. Only administrators manage staff accounts.

Financial permissions require a separate business decision.

## 13.1 Proposed Permission Matrix

The following is a discussion proposal only.

| Capability | Administrator | Accountant | Office Staff |
| ----- | ----- | ----- | ----- |
| View Financial Dashboard | Yes | Yes | To be decided |
| View Project Costing | Yes | Yes | To be decided |
| View Vendor Quotations | Yes | Yes | To be decided |
| Upload Vendor BOQs | Yes | Yes | To be decided |
| Compare Quotations | Yes | Yes | To be decided |
| Record Vendor Payments | Yes | Yes | To be decided |
| Approve Vendor Payments | To be decided | To be decided | To be decided |
| Modify Approved Commitments | Controlled | Controlled | To be decided |
| View Vendor Outstanding Balances | Yes | Yes | To be decided |
| Modify Approved Financial Records | Controlled | Controlled | To be decided |
| Manage Staff Accounts | Yes | No | No |

## 13.2 Permission Requirements

The final system should distinguish between:

* Viewing financial information.  
* Uploading financial documents.  
* Editing draft financial records.  
* Submitting quotations for approval.  
* Approving quotations.  
* Creating vendor commitments.  
* Recording payments.  
* Approving payments.  
* Modifying approved records.  
* Reversing or cancelling financial transactions.

## 13.3 Backend Enforcement

Financial permissions must be enforced by the backend.

Hiding buttons or restricting frontend navigation is not sufficient.

The system must prevent unauthorised users from performing restricted financial actions through API requests.

Permission tests should cover both permitted and denied actions.

## 13.4 Audit History

Important financial actions should retain:

* User responsible.  
* Action performed.  
* Record affected.  
* Previous value, where applicable.  
* New value, where applicable.  
* Date and time.  
* Reason for changes, where required.

The audit history should provide accountability for financial operations.

---

# 14\. Data Integrity and Technical Considerations

Financial information requires stronger consistency guarantees than ordinary descriptive records.

The technical design should account for the following.

## 14.1 Relationships

Financial records should be associated with the existing:

* Projects.  
* Vendors.  
* Project Sections.  
* Staff Accounts.

Additional relationships may include:

* Client Quotations.  
* Vendor Quotations.  
* BOQ Documents.  
* BOQ Line Items.  
* Vendor Commitments.  
* Payment Records.  
* Financial Revisions.

The final data model should be determined during the SDD planning process.

## 14.2 Financial Precision

* Financial amounts must use appropriate database numeric/decimal types.  
* Floating-point arithmetic should not be used for financial calculations.  
* Currency and precision rules must be consistent.  
* Rounding behaviour must be defined.  
* Tax treatment must be explicitly specified.

## 14.3 Transaction Safety

Operations that affect related financial records should be atomic where necessary.

For example:

* Approving a quotation and creating its commitment.  
* Recording a payment and updating relevant financial summaries.  
* Revising an approved commitment.  
* Reversing a payment.

The system should avoid partially completed financial operations.

## 14.4 Data Validation

The system should validate:

* Positive or otherwise explicitly permitted payment amounts.  
* Required vendor and project relationships.  
* Commitment and quotation relationships.  
* Payment amounts against relevant business rules.  
* Duplicate or invalid payment references, where applicable.  
* Valid quotation and commitment statuses.  
* Required approval information.

Validation rules should be agreed before implementation.

## 14.5 Archiving and Retention

The financial system must define how financial records behave when:

* A vendor is archived.  
* A project is archived.  
* A vendor is restored.  
* A project is restored.  
* A staff account is deactivated.

Archiving a vendor or project must not silently delete historical financial information.

Financial records should remain traceable after archival.

---

# 15\. Reporting

StudioFlow should eventually support financial reporting for management.

Proposed reports:

1. Project Financial Summary.  
2. Vendor Commitment Report.  
3. Vendor Outstanding Balance Report.  
4. Vendor Payment History.  
5. Project Cost Breakdown.  
6. Quotation Comparison Report.  
7. Client Quotation History.  
8. Financial Variance Report.

Reports should support relevant filters and clear date ranges.

Export formats such as PDF and Excel may be considered.

Export functionality should be scoped separately, including access restrictions and data visibility rules.

---

# 16\. Implementation Roadmap

Financial management should not be implemented as one large feature.

The phases below are proposed based on business and technical dependencies.

## Phase 0 — Business Discovery and Requirements

Priority: Essential

Scope:

* Confirm financial terminology.  
* Understand the firm's actual costing workflow.  
* Confirm client-side financial requirements.  
* Obtain sample vendor quotations.  
* Obtain the actual office BOQ template.  
* Define quotation approval and vendor appointment workflows.  
* Define payment workflows.  
* Confirm financial permissions.  
* Define calculation rules.  
* Identify document storage and retention requirements.

Deliverable:

An approved financial requirements baseline.

No financial implementation should begin until the essential business decisions are understood.

## Phase 1 — Client Costing and Quotations

Priority: High

Proposed scope:

* Project financial overview foundation.  
* Client budget and costing information.  
* Firm quotations.  
* Quotation statuses.  
* Quotation revision history.  
* Supporting document association.

Dependencies:

* Agreed client-side financial terminology.  
* Confirmation of whether client payments are in scope.

## Phase 2 — Vendor BOQ and Quotation Document Management

Priority: High

Proposed scope:

* Upload vendor quotations and BOQs.  
* Associate documents with vendors, projects and sections.  
* Document metadata.  
* Version and revision history.  
* Vendor profile costing section.  
* Document access controls.

Dependencies:

* Document storage requirements.  
* Supported file formats.  
* Permission decisions.

## Phase 3 — Structured BOQ and Vendor Comparison

Priority: High

Proposed scope:

* Structured BOQ line items.  
* Vendor quotation comparison.  
* Price and quantity comparisons.  
* Missing item detection.  
* Specification differences.  
* Manual corrections.  
* Original document access.

Dependencies:

* Actual office BOQ template.  
* Sample vendor submissions.  
* Agreed comparison rules.

## Phase 4 — Vendor Appointment, Commitments and Payments

Priority: High

Proposed scope:

* Vendor quotation approval.  
* Vendor appointment records.  
* Financial commitment creation.  
* Commitment revisions.  
* Advances.  
* Subsequent payments.  
* Payment history.  
* Outstanding balance calculations.  
* Payment approval workflow, if required.  
* Audit history.

Dependencies:

* Approved quotation workflow.  
* Payment policies.  
* Financial permissions.  
* Agreed calculation rules.

## Phase 5 — Financial Dashboard and Reporting

Priority: High

Proposed scope:

* Financial summary metrics.  
* Project financial comparison.  
* Payment tracking graphs.  
* Project-wise financial breakdown.  
* Outstanding balances.  
* Financial warnings.  
* Filters and drill-down navigation.  
* Financial reports.

Dependencies:

* Reliable underlying financial records.  
* Agreed financial calculations.  
* Sufficient data for meaningful summaries.

---

# 17\. SDD Governance and Implementation Requirements

All financial additions must follow StudioFlow's existing Spec-Driven Development process and project constitution.

## 17.1 Spec-First Development

Before implementation:

1. Review the approved financial requirements.  
2. Inspect the existing application and relevant features.  
3. Identify existing capabilities that can be reused.  
4. Define the new feature scope.  
5. Write functional and non-functional requirements.  
6. Identify user stories and acceptance criteria.  
7. Clarify ambiguities.  
8. Prepare the implementation plan.  
9. Define data models and API contracts.  
10. Generate tasks.  
11. Run consistency analysis.  
12. Resolve specification contradictions.  
13. Obtain approval before implementation.

## 17.2 Feature Independence

Each feature should be independently understandable and testable.

Features must have:

* Clearly defined scope.  
* Explicit dependencies.  
* Functional requirements.  
* User stories.  
* Acceptance criteria.  
* Data model changes, where necessary.  
* API contracts.  
* Test requirements.  
* Documentation updates.

## 17.3 Testing Requirements

Financial functionality should include tests for:

* Correct financial calculations.  
* Quotation status transitions.  
* Quotation revision history.  
* Vendor commitment creation.  
* Commitment revision history.  
* Payment recording.  
* Payment cancellation and reversal.  
* Outstanding balance calculations.  
* Overpayment handling.  
* Permission enforcement.  
* Document versioning.  
* Financial record consistency.  
* Dashboard metric accuracy.

Testing must cover both successful and invalid operations.

## 17.4 Database Safety

Financial migrations and data changes must follow the existing project database safety practices.

* Review every migration before applying it.  
* Preserve existing vendor and project data.  
* Avoid destructive changes without explicit approval.  
* Back up the database before significant schema changes.  
* Do not reset or reseed the development database casually.  
* Verify migration behaviour against existing records.

## 17.5 Acceptance

A feature should not be considered complete solely because implementation tasks are marked done.

Acceptance should distinguish:

* Automated test evidence.  
* API verification.  
* Browser/UI verification.  
* Manual workflow verification.  
* Business-owner approval.

Financial calculations and approval workflows require particular attention during acceptance.

---

# 18\. Open Questions Requiring Business Approval

The following decisions must be resolved before the relevant features are specified.

## 18.1 Client Financial Workflow

1. Should StudioFlow track money received from clients, or only project costing and vendor expenses?  
2. Does the firm maintain an internal costing estimate separately from the quotation submitted to the client?  
3. Does the firm issue multiple quotation revisions?  
4. Does the firm require client payment milestones?  
5. Should the system track client advances and outstanding receivables?

## 18.2 Vendor BOQs

6. Does the office have a standard BOQ Excel template?  
7. Do vendors usually submit BOQs in the same format?  
8. Are quotations normally associated with an entire project or individual project sections?  
9. Should BOQ data be entered manually, imported from Excel, or extracted from PDFs?  
10. Who should be allowed to upload, view, edit and approve BOQs?

## 18.3 Vendor Selection and Commitments

11. Who approves a vendor quotation?  
12. Does approving a quotation automatically create a vendor commitment?  
13. Can multiple vendors be appointed for the same project section?  
14. Can a commitment be revised after approval?  
15. Is a formal approval record or supporting document required?

## 18.4 Payments

16. Who records vendor payments?  
17. Who approves vendor payments?  
18. Are advances always linked to an approved vendor commitment?  
19. Are payments usually made against milestones?  
20. Can a vendor receive more than one advance?  
21. How should cancelled, reversed or incorrect payments be handled?  
22. Should payment receipts or proof be mandatory?

## 18.5 Financial Permissions

23. Can Office Staff view vendor quotations and costing?  
24. Can Office Staff record payments?  
25. Can Office Staff view vendor outstanding balances?  
26. Can Accountants approve vendor quotations or only payments?  
27. Who can modify approved commitments?  
28. Should financial records have separate viewing and editing permissions?

## 18.6 Financial Calculations

29. Are amounts normally inclusive or exclusive of GST?  
30. Should transport, labour, materials and miscellaneous costs be tracked separately?  
31. Does the firm want project margin calculations?  
32. What financial threshold should trigger an approaching-budget warning?  
33. Which currency and rounding rules should be used?

## 18.7 Documents and Retention

34. Where should financial documents be stored?  
35. Who can delete or archive uploaded documents?  
36. Should original documents be retained permanently?  
37. Are there document size or file-format restrictions?

---

# 19\. Out of Scope Until Explicitly Approved

The following should not be assumed to be part of the initial financial-management release:

* Full accounting software functionality.  
* General ledger management.  
* Tax filing and GST returns.  
* Automated bank integrations.  
* Automatic payment execution.  
* Payroll management.  
* Automated vendor payments.  
* Client invoicing and receipt generation.  
* Automated OCR or AI-based BOQ extraction.  
* Profit and loss statements.  
* Balance sheets.  
* Cash-flow forecasting.  
* Purchase order management.  
* Inventory management.

These may be considered later if the firm identifies a genuine business requirement.

---

# 20\. Final Recommendation

StudioFlow should evolve into a connected project and financial management workspace, not a collection of unrelated financial screens.

The most important foundation is the relationship between:

Project → Project Section → Vendor → Quotation → Approved Commitment → Payment → Outstanding Balance

Client-side costing and quotations should connect to the same project so that management can understand the relationship between the firm's agreed client amount and its project expenses.

The financial dashboard should be built only after the underlying financial records and calculation rules are established.

The implementation should remain incremental and follow the existing StudioFlow SDD governance.

Immediate next step: Conduct business clarification with the firm, obtain actual BOQ and quotation samples, confirm financial permissions and agree on the client-side and vendor-side workflows.

Only after these decisions are sufficiently clear should the requirements be divided into new Spec Kit features.

No implementation should begin directly from this draft.



