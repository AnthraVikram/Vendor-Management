-- CreateEnum
CREATE TYPE "ImportPreviewStatus" AS ENUM ('OPEN', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowOutcome" AS ENUM ('IMPORTED', 'SKIPPED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('AGREEMENT', 'DRAWING', 'REGISTRATION_CERTIFICATE', 'PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'OTHER');

-- CreateEnum
CREATE TYPE "HistoryAction" AS ENUM ('CREATED', 'EDITED', 'ARCHIVED', 'RESTORED', 'REVERSED');

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "import_run_id" UUID;

-- CreateTable
CREATE TABLE "vendor_import_previews" (
    "id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_format" TEXT NOT NULL,
    "status" "ImportPreviewStatus" NOT NULL DEFAULT 'OPEN',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "rows" JSONB NOT NULL,
    "ignored_headings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "vendor_import_previews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_import_runs" (
    "id" UUID NOT NULL,
    "preview_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "imported_count" INTEGER NOT NULL,
    "skipped_count" INTEGER NOT NULL,
    "rejected_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "vendor_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_import_rows" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "outcome" "ImportRowOutcome" NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matches" JSONB NOT NULL DEFAULT '[]',
    "vendor_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "vendor_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "vendor_id" UUID,
    "project_id" UUID,
    "title" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "note" TEXT,
    "original_filename" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_advances" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "received_on" DATE NOT NULL,
    "payment_method" "PaymentMethod",
    "reference" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "client_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_advance_reversals" (
    "id" UUID NOT NULL,
    "client_advance_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "client_advance_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_entries" (
    "id" UUID NOT NULL,
    "vendor_id" UUID,
    "project_id" UUID,
    "document_id" UUID,
    "vendor_import_run_id" UUID,
    "client_advance_id" UUID,
    "action" "HistoryAction" NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "history_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_import_runs_preview_id_key" ON "vendor_import_runs"("preview_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_import_rows_run_id_row_number_key" ON "vendor_import_rows"("run_id", "row_number");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");

-- CreateIndex
CREATE INDEX "documents_vendor_id_archived_created_at_idx" ON "documents"("vendor_id", "archived", "created_at");

-- CreateIndex
CREATE INDEX "documents_project_id_archived_created_at_idx" ON "documents"("project_id", "archived", "created_at");

-- CreateIndex
CREATE INDEX "client_advances_project_id_received_on_idx" ON "client_advances"("project_id", "received_on");

-- CreateIndex
CREATE INDEX "client_advances_received_on_idx" ON "client_advances"("received_on");

-- CreateIndex
CREATE UNIQUE INDEX "client_advance_reversals_client_advance_id_key" ON "client_advance_reversals"("client_advance_id");

-- CreateIndex
CREATE INDEX "history_entries_vendor_id_created_at_idx" ON "history_entries"("vendor_id", "created_at");

-- CreateIndex
CREATE INDEX "history_entries_project_id_created_at_idx" ON "history_entries"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "history_entries_document_id_created_at_idx" ON "history_entries"("document_id", "created_at");

-- CreateIndex
CREATE INDEX "history_entries_vendor_import_run_id_created_at_idx" ON "history_entries"("vendor_import_run_id", "created_at");

-- CreateIndex
CREATE INDEX "history_entries_client_advance_id_created_at_idx" ON "history_entries"("client_advance_id", "created_at");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "vendor_import_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_import_previews" ADD CONSTRAINT "vendor_import_previews_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_import_previews" ADD CONSTRAINT "vendor_import_previews_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_import_runs" ADD CONSTRAINT "vendor_import_runs_preview_id_fkey" FOREIGN KEY ("preview_id") REFERENCES "vendor_import_previews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_import_runs" ADD CONSTRAINT "vendor_import_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_import_runs" ADD CONSTRAINT "vendor_import_runs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_import_rows" ADD CONSTRAINT "vendor_import_rows_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "vendor_import_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_import_rows" ADD CONSTRAINT "vendor_import_rows_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_import_rows" ADD CONSTRAINT "vendor_import_rows_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_import_rows" ADD CONSTRAINT "vendor_import_rows_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_advances" ADD CONSTRAINT "client_advances_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_advances" ADD CONSTRAINT "client_advances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_advances" ADD CONSTRAINT "client_advances_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_advance_reversals" ADD CONSTRAINT "client_advance_reversals_client_advance_id_fkey" FOREIGN KEY ("client_advance_id") REFERENCES "client_advances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_advance_reversals" ADD CONSTRAINT "client_advance_reversals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_advance_reversals" ADD CONSTRAINT "client_advance_reversals_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_vendor_import_run_id_fkey" FOREIGN KEY ("vendor_import_run_id") REFERENCES "vendor_import_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_client_advance_id_fkey" FOREIGN KEY ("client_advance_id") REFERENCES "client_advances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A document belongs to exactly one vendor or one project (data-model.md, documents).
ALTER TABLE "documents" ADD CONSTRAINT "documents_parent_ck" CHECK (("vendor_id" IS NULL) <> ("project_id" IS NULL));

-- A history entry points at exactly one record (data-model.md, history_entries).
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_target_ck" CHECK (num_nonnulls("vendor_id", "project_id", "document_id", "vendor_import_run_id", "client_advance_id") = 1);

-- An import row names a vendor exactly when the row was imported (data-model.md, vendor_import_rows).
ALTER TABLE "vendor_import_rows" ADD CONSTRAINT "vendor_import_rows_vendor_ck" CHECK (("outcome" = 'IMPORTED') = ("vendor_id" IS NOT NULL));

-- Client advance and reversal amounts are greater than zero (data-model.md, client_advances and client_advance_reversals).
ALTER TABLE "client_advances" ADD CONSTRAINT "client_advances_amount_ck" CHECK ("amount" > 0);
ALTER TABLE "client_advance_reversals" ADD CONSTRAINT "client_advance_reversals_amount_ck" CHECK ("amount" > 0);
