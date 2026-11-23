-- Written by hand: the whole migration is one transaction, so a failure at any statement applies nothing and the
-- history target check below is replaced atomically. Every statement here is allowed in a transaction on
-- PostgreSQL 17; the enum values added with ALTER TYPE ... ADD VALUE are not used before COMMIT.
BEGIN;

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ReceiptType" AS ENUM ('ADVANCE', 'STAGE_PAYMENT', 'FINAL_PAYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('SUBMITTED', 'VERIFIED_ON_ENTRY');

-- CreateEnum
CREATE TYPE "RecordedUnder" AS ENUM ('FEATURE_003', 'FEATURE_006');

-- CreateEnum
CREATE TYPE "RecordDecision" AS ENUM ('VERIFIED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SubmissionRoute" AS ENUM ('RECEIPTS', 'CLIENT_ADVANCES');

-- Written by hand: quotation references Q-000001, Q-000002 ... (research R7).
CREATE SEQUENCE "client_quotation_reference_seq";

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'QUOTATION';
ALTER TYPE "DocumentType" ADD VALUE 'PURCHASE_ORDER';
ALTER TYPE "DocumentType" ADD VALUE 'PAYMENT_PROOF';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HistoryAction" ADD VALUE 'REVISION_ADDED';
ALTER TYPE "HistoryAction" ADD VALUE 'STATUS_CHANGED';
ALTER TYPE "HistoryAction" ADD VALUE 'APPROVED';
ALTER TYPE "HistoryAction" ADD VALUE 'VERIFIED';
ALTER TYPE "HistoryAction" ADD VALUE 'REJECTED';
ALTER TYPE "HistoryAction" ADD VALUE 'WITHDRAWN';
ALTER TYPE "HistoryAction" ADD VALUE 'CANCELLED';
ALTER TYPE "HistoryAction" ADD VALUE 'ATTACHED';
ALTER TYPE "HistoryAction" ADD VALUE 'ATTACHMENT_REMOVED';
ALTER TYPE "HistoryAction" ADD VALUE 'SUPERSEDED';
ALTER TYPE "HistoryAction" ADD VALUE 'WARNING_CONFIRMED';

-- AlterTable
ALTER TABLE "client_advances" ADD COLUMN     "client_approval_id" UUID,
ADD COLUMN     "client_purchase_order_id" UUID,
ADD COLUMN     "entry_status" "EntryStatus" NOT NULL DEFAULT 'VERIFIED_ON_ENTRY',
ADD COLUMN     "receipt_type" "ReceiptType" NOT NULL DEFAULT 'ADVANCE',
ADD COLUMN     "recorded_under" "RecordedUnder" NOT NULL DEFAULT 'FEATURE_003',
ADD COLUMN     "submission_id" UUID,
ADD COLUMN     "submission_route" "SubmissionRoute";

-- Written by hand: the default above fills every existing advance with FEATURE_003; new rows get FEATURE_006.
ALTER TABLE "client_advances" ALTER COLUMN "recorded_under" SET DEFAULT 'FEATURE_006';

-- AlterTable
ALTER TABLE "history_entries" ADD COLUMN     "client_purchase_order_id" UUID,
ADD COLUMN     "client_quotation_id" UUID;

-- CreateTable
CREATE TABLE "client_quotations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "client_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_revisions" (
    "id" UUID NOT NULL,
    "client_quotation_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "quotation_date" DATE NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "validity_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "quotation_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_status_changes" (
    "id" UUID NOT NULL,
    "quotation_revision_id" UUID NOT NULL,
    "from_status" "RevisionStatus" NOT NULL,
    "to_status" "RevisionStatus" NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "quotation_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_approvals" (
    "id" UUID NOT NULL,
    "quotation_revision_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "client_acceptance_date" DATE,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "client_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_purchase_orders" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "client_approval_id" UUID NOT NULL,
    "po_number" TEXT NOT NULL,
    "po_date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "entry_status" "EntryStatus" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "client_purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_decisions" (
    "id" UUID NOT NULL,
    "client_purchase_order_id" UUID NOT NULL,
    "decision" "RecordDecision" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "purchase_order_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_cancellations" (
    "id" UUID NOT NULL,
    "client_purchase_order_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "purchase_order_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_receipt_decisions" (
    "id" UUID NOT NULL,
    "client_advance_id" UUID NOT NULL,
    "decision" "RecordDecision" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "client_receipt_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_attachments" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "quotation_revision_id" UUID,
    "client_approval_id" UUID,
    "client_purchase_order_id" UUID,
    "client_advance_id" UUID,
    "supersedes_attachment_id" UUID,
    "supersede_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "financial_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_attachment_removals" (
    "id" UUID NOT NULL,
    "financial_attachment_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "financial_attachment_removals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_quotations_project_id_key" ON "client_quotations"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_quotations_reference_key" ON "client_quotations"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_revisions_client_quotation_id_number_key" ON "quotation_revisions"("client_quotation_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_status_changes_quotation_revision_id_to_status_key" ON "quotation_status_changes"("quotation_revision_id", "to_status");

-- CreateIndex
CREATE UNIQUE INDEX "client_approvals_quotation_revision_id_key" ON "client_approvals"("quotation_revision_id");

-- CreateIndex
CREATE INDEX "client_purchase_orders_project_id_idx" ON "client_purchase_orders"("project_id");

-- CreateIndex
CREATE INDEX "client_purchase_orders_client_approval_id_idx" ON "client_purchase_orders"("client_approval_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_decisions_client_purchase_order_id_key" ON "purchase_order_decisions"("client_purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_cancellations_client_purchase_order_id_key" ON "purchase_order_cancellations"("client_purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_receipt_decisions_client_advance_id_key" ON "client_receipt_decisions"("client_advance_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_attachments_supersedes_attachment_id_key" ON "financial_attachments"("supersedes_attachment_id");

-- CreateIndex
CREATE INDEX "financial_attachments_document_id_idx" ON "financial_attachments"("document_id");

-- CreateIndex
CREATE INDEX "financial_attachments_quotation_revision_id_idx" ON "financial_attachments"("quotation_revision_id");

-- CreateIndex
CREATE INDEX "financial_attachments_client_approval_id_idx" ON "financial_attachments"("client_approval_id");

-- CreateIndex
CREATE INDEX "financial_attachments_client_purchase_order_id_idx" ON "financial_attachments"("client_purchase_order_id");

-- CreateIndex
CREATE INDEX "financial_attachments_client_advance_id_idx" ON "financial_attachments"("client_advance_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_attachment_removals_financial_attachment_id_key" ON "financial_attachment_removals"("financial_attachment_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_advances_submission_id_key" ON "client_advances"("submission_id");

-- CreateIndex
CREATE INDEX "client_advances_client_approval_id_idx" ON "client_advances"("client_approval_id");

-- CreateIndex
CREATE INDEX "client_advances_client_purchase_order_id_idx" ON "client_advances"("client_purchase_order_id");

-- CreateIndex
CREATE INDEX "history_entries_client_quotation_id_created_at_idx" ON "history_entries"("client_quotation_id", "created_at");

-- CreateIndex
CREATE INDEX "history_entries_client_purchase_order_id_created_at_idx" ON "history_entries"("client_purchase_order_id", "created_at");

-- AddForeignKey
ALTER TABLE "client_advances" ADD CONSTRAINT "client_advances_client_approval_id_fkey" FOREIGN KEY ("client_approval_id") REFERENCES "client_approvals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_advances" ADD CONSTRAINT "client_advances_client_purchase_order_id_fkey" FOREIGN KEY ("client_purchase_order_id") REFERENCES "client_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_client_quotation_id_fkey" FOREIGN KEY ("client_quotation_id") REFERENCES "client_quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_client_purchase_order_id_fkey" FOREIGN KEY ("client_purchase_order_id") REFERENCES "client_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_quotations" ADD CONSTRAINT "client_quotations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_quotations" ADD CONSTRAINT "client_quotations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_quotations" ADD CONSTRAINT "client_quotations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_client_quotation_id_fkey" FOREIGN KEY ("client_quotation_id") REFERENCES "client_quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_status_changes" ADD CONSTRAINT "quotation_status_changes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_status_changes" ADD CONSTRAINT "quotation_status_changes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_status_changes" ADD CONSTRAINT "quotation_status_changes_quotation_revision_id_fkey" FOREIGN KEY ("quotation_revision_id") REFERENCES "quotation_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_approvals" ADD CONSTRAINT "client_approvals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_approvals" ADD CONSTRAINT "client_approvals_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_approvals" ADD CONSTRAINT "client_approvals_quotation_revision_id_fkey" FOREIGN KEY ("quotation_revision_id") REFERENCES "quotation_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_purchase_orders" ADD CONSTRAINT "client_purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_purchase_orders" ADD CONSTRAINT "client_purchase_orders_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_purchase_orders" ADD CONSTRAINT "client_purchase_orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_purchase_orders" ADD CONSTRAINT "client_purchase_orders_client_approval_id_fkey" FOREIGN KEY ("client_approval_id") REFERENCES "client_approvals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_decisions" ADD CONSTRAINT "purchase_order_decisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_decisions" ADD CONSTRAINT "purchase_order_decisions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_decisions" ADD CONSTRAINT "purchase_order_decisions_client_purchase_order_id_fkey" FOREIGN KEY ("client_purchase_order_id") REFERENCES "client_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_cancellations" ADD CONSTRAINT "purchase_order_cancellations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_cancellations" ADD CONSTRAINT "purchase_order_cancellations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_cancellations" ADD CONSTRAINT "purchase_order_cancellations_client_purchase_order_id_fkey" FOREIGN KEY ("client_purchase_order_id") REFERENCES "client_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_receipt_decisions" ADD CONSTRAINT "client_receipt_decisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_receipt_decisions" ADD CONSTRAINT "client_receipt_decisions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_receipt_decisions" ADD CONSTRAINT "client_receipt_decisions_client_advance_id_fkey" FOREIGN KEY ("client_advance_id") REFERENCES "client_advances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_quotation_revision_id_fkey" FOREIGN KEY ("quotation_revision_id") REFERENCES "quotation_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_client_approval_id_fkey" FOREIGN KEY ("client_approval_id") REFERENCES "client_approvals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_client_purchase_order_id_fkey" FOREIGN KEY ("client_purchase_order_id") REFERENCES "client_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_client_advance_id_fkey" FOREIGN KEY ("client_advance_id") REFERENCES "client_advances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_supersedes_attachment_id_fkey" FOREIGN KEY ("supersedes_attachment_id") REFERENCES "financial_attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachment_removals" ADD CONSTRAINT "financial_attachment_removals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachment_removals" ADD CONSTRAINT "financial_attachment_removals_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachment_removals" ADD CONSTRAINT "financial_attachment_removals_financial_attachment_id_fkey" FOREIGN KEY ("financial_attachment_id") REFERENCES "financial_attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Written by hand: rules Prisma cannot express (data-model.md).
-- Every new amount is positive (FR-004, OQ-24).
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_amount_ck" CHECK ("amount" > 0);
ALTER TABLE "client_approvals" ADD CONSTRAINT "client_approvals_amount_ck" CHECK ("amount" > 0);
ALTER TABLE "client_purchase_orders" ADD CONSTRAINT "client_purchase_orders_amount_ck" CHECK ("amount" > 0);

-- Field lengths (FR-022, FR-029) and revision numbering from 1 with a reason from revision 2 (FR-023).
ALTER TABLE "client_quotations" ADD CONSTRAINT "client_quotations_title_ck" CHECK (char_length("title") BETWEEN 1 AND 200);
ALTER TABLE "client_purchase_orders" ADD CONSTRAINT "client_purchase_orders_po_number_ck" CHECK (char_length("po_number") BETWEEN 1 AND 100);
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_reason_ck" CHECK ("number" >= 1 AND ("number" = 1 OR "reason" IS NOT NULL));

-- A reason is required for Rejected and Withdrawn (FR-018, FR-025, FR-030).
ALTER TABLE "quotation_status_changes" ADD CONSTRAINT "quotation_status_changes_reason_ck" CHECK ("to_status" NOT IN ('REJECTED', 'WITHDRAWN') OR "reason" IS NOT NULL);
ALTER TABLE "purchase_order_decisions" ADD CONSTRAINT "purchase_order_decisions_reason_ck" CHECK ("decision" = 'VERIFIED' OR "reason" IS NOT NULL);
ALTER TABLE "client_receipt_decisions" ADD CONSTRAINT "client_receipt_decisions_reason_ck" CHECK ("decision" = 'VERIFIED' OR "reason" IS NOT NULL);

-- Only the six status changes of FR-025 (Approved only through the approval). Both columns are NOT NULL, so the
-- check can never evaluate to NULL.
ALTER TABLE "quotation_status_changes" ADD CONSTRAINT "quotation_status_changes_transition_ck" CHECK (
  ("from_status", "to_status") IN (
    ('DRAFT', 'SUBMITTED'),
    ('DRAFT', 'WITHDRAWN'),
    ('SUBMITTED', 'UNDER_REVIEW'),
    ('SUBMITTED', 'WITHDRAWN'),
    ('UNDER_REVIEW', 'APPROVED'),
    ('UNDER_REVIEW', 'REJECTED')
  )
);

-- An attachment links exactly one financial record; a supersede carries its reason (FR-042e).
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_record_ck" CHECK (num_nonnulls("quotation_revision_id", "client_approval_id", "client_purchase_order_id", "client_advance_id") = 1);
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_supersede_ck" CHECK (("supersedes_attachment_id" IS NULL) = ("supersede_reason" IS NULL));

-- A receipt links at most one approval or PO (FR-021); a submission ID always carries its route (research R13).
ALTER TABLE "client_advances" ADD CONSTRAINT "client_advances_link_ck" CHECK (num_nonnulls("client_approval_id", "client_purchase_order_id") <= 1);
ALTER TABLE "client_advances" ADD CONSTRAINT "client_advances_submission_ck" CHECK (("submission_id" IS NULL) = ("submission_route" IS NULL));

-- Each history entry still has exactly one target, now one of seven (research R6). Every existing row satisfies it.
ALTER TABLE "history_entries" DROP CONSTRAINT "history_entries_target_ck";
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_target_ck" CHECK (num_nonnulls("vendor_id", "project_id", "document_id", "vendor_import_run_id", "client_advance_id", "client_quotation_id", "client_purchase_order_id") = 1);

COMMIT;
