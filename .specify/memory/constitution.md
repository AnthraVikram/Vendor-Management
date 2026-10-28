<!--
Sync Impact Report
- Version change: 1.0.1 → 1.1.0
- Modified principles:
  - V. Tests and Done: adds when a documentation-only task is done (stated documentation criteria met, verified against the named files, reviewed, and approved, with the record kept on the task or pull request). Tasks that change application code, configuration, or tests, and tasks that run checks or demonstrations, keep the tests-and-demonstration rule unchanged. The Rationale gains one sentence for documentation-only tasks.
- Added sections: none
- Removed sections: none
- Follow-up TODOs: specs/001-core-auth-directory/tasks.md checkbox rule to cite this definition; T091 needs its review and approval recorded before it counts as done; T004, T005, T007, T009, T063, T090, and T064 (no acceptance scenario, not documentation-only) remain unresolved.
-->

# Vendor & Project Management Constitution

## Core Principles

### I. Spec Before Code

No application code is written for a feature until that feature has a `spec.md` and a
`plan.md`. One feature occupies one branch and one pull request.

A product unknown is marked `NEEDS CLARIFICATION` in the spec and resolved before the
plan is written. An agent MUST NOT choose a default for a product question.

`docs/prd.md` is the product backlog. Every spec lists the functional-requirement ids
it covers.

Rationale: Specs stay traceable to the backlog, and product decisions stay with the
people who own the product.

### II. Fixed Stack

Application code is TypeScript. The runtime and tools are Node LTS, Express, React,
PostgreSQL 17, Prisma, Vitest, Supertest, ESLint, and Prettier.

A new runtime dependency is added only with a one-line reason in `research.md`.

The system is one repository with `api/` and `web/`. One command starts both and loads
seed data.

Rationale: A single stack and a single start command keep the internal web app
reproducible. PostgreSQL 17 and Prisma are the approved database and migration tools.

### III. Data Rules

Every table has `id`, `created_at`, `created_by`, `updated_at`, and `updated_by`.

Vendors, projects, documents, and financial records are archived with a flag. Those
records are not hard-deleted.

Money is `DECIMAL(15,2)` in INR. `FLOAT` is forbidden for money. Financial records are
append-only. A correction is a new reversing entry.

Schema changes happen only through Prisma migrations committed to the repository.
Foreign keys are enforced in the database.

Rationale: Audit columns, archive flags, exact decimal money, and database-enforced
relationships keep vendor, project, and financial history recoverable.

### IV. Security

Every API route checks authentication and role on the server. Hiding a control in the
interface does not grant or deny access.

Passwords are hashed with bcrypt. Secrets live in `.env` and are never committed.
`.env.example` is committed.

Documents are served only through an authenticated endpoint. A document has no public
URL.

All input is validated on the server with a schema library, including input the
frontend already checks.

Rationale: The server is the access-control and validation boundary for staff data,
money, and documents.

### V. Tests and Done

Every acceptance scenario in a spec has an automated test. For a business rule, the
test is written first.

A task is done when its tests pass and its acceptance scenario is demonstrated.
Compilation alone does not complete a task.

A task whose only deliverable is a change to documentation — specifications, plans,
task lists, contracts, the PRD, or other project records — and that changes no
application code, configuration, or tests, is done when its stated documentation
criteria are met and verified against the files they name, and the change has been
reviewed and approved. The verification and the approval are recorded in the task or
in the pull request. A task that runs checks or demonstrations is not
documentation-only, even when it also records results. Every other task is done only
as stated above. This distinction waives no other requirement of this constitution.

CI runs lint, typecheck, and tests on every pull request. A red CI result blocks merge.

`converge` reports Converged before a pull request is opened.

Rationale: Done means the specified behavior is proven, and a failing check stops the
merge. For a documentation-only task, done means the stated records are correct,
verified, and approved.

### VI. Simplicity

The implementation is the simplest design that meets the spec. The data model may
leave room for a later phase, including a nullable foreign key. Code for a later phase
is not written in the current phase.

The client is a responsive web application. There is no PWA, no native application,
and no offline mode.

A Phase 1 spec includes nothing from PRD Phase 2 or Phase 3 unless `docs/prd.md` is
changed first.

Rationale: Phase 1 stays limited to vendors, projects, timelines, and client advances,
and later work stays in the backlog until the PRD says otherwise.

## Product Boundaries

The product is the Vendor & Project Management System, an internal web application for
an architecture and interior design firm.

Authorization MUST recognize three roles: Owner / Administrator, Office Team /
Architects, and Accountant. Staff access MUST be revocable.

Phase 1 is vendors, projects, timelines, and client advances. Client advance records
stay distinct from vendor payments.

The following stay out of scope until `docs/prd.md` changes: a general ledger, bank
integration, automatic tax filing or GST return submission, automatic payment
execution, native mobile applications, AI vendor recommendations, and inventory or
warehouse management.

Documents covered by the retention requirement MUST remain recoverable for seven years,
subject to applicable law and firm policy.

## Delivery Gates

A pull request opens only when all of the following are true:

- The feature has a `spec.md` and a `plan.md` on its branch.
- The spec lists the functional-requirement ids it covers.
- The spec contains no unresolved `NEEDS CLARIFICATION` item.
- `converge` reports Converged.
- CI lint, typecheck, and tests are green.

## Governance

This constitution supersedes conflicting practice, including a technology
recommendation in the PRD that differs from Principle II. A stack change requires an
amendment here and a matching update to `docs/prd.md`.

Amendments are made in a pull request that edits this file. The pull request states
the rationale, bumps the version, and sets **Last Amended** to the amendment date.
Reviewers MUST reject work that violates a principle in this document.

Versioning follows semantic versioning:

- MAJOR: a principle is removed or redefined in a backward-incompatible way.
- MINOR: a principle or section is added, or guidance is materially expanded.
- PATCH: wording, clarification, or other non-semantic refinement.

The original adoption date is **Ratified**. Compliance is checked when a spec, plan,
or pull request is reviewed. Product scope is read from `docs/prd.md`. Feature work
follows that backlog through spec, plan, tasks, and converge.

**Version**: 1.1.0 | **Ratified**: 2026-10-23 | **Last Amended**: 2026-10-27
