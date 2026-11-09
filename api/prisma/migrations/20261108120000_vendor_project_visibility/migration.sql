-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HistoryAction" ADD VALUE 'ASSIGNED';
ALTER TYPE "HistoryAction" ADD VALUE 'ASSIGNMENT_EDITED';
ALTER TYPE "HistoryAction" ADD VALUE 'UNASSIGNED';

-- DropIndex
DROP INDEX "vendor_project_links_vendor_id_project_id_key";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "expected_completion_date" DATE,
ADD COLUMN     "start_date" DATE;

-- AlterTable
ALTER TABLE "vendor_project_links" ADD COLUMN     "removed_at" TIMESTAMP(3),
ADD COLUMN     "removed_by" UUID;

-- CreateIndex
CREATE INDEX "vendor_project_links_vendor_id_project_id_idx" ON "vendor_project_links"("vendor_id", "project_id");

-- AddForeignKey
ALTER TABLE "vendor_project_links" ADD CONSTRAINT "vendor_project_links_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Written by hand: Prisma cannot express these (data-model.md).
-- One current assignment per vendor and project; any number of past ones (Feature 001 FR-026, FR-013b).
CREATE UNIQUE INDEX "vendor_project_links_current_key" ON "vendor_project_links" ("vendor_id", "project_id") WHERE "removed_at" IS NULL;

-- An expected completion date is never before the start date (FR-015a).
ALTER TABLE "projects" ADD CONSTRAINT "projects_dates_ck" CHECK ("start_date" IS NULL OR "expected_completion_date" IS NULL OR "expected_completion_date" >= "start_date");

-- A past assignment records both when and by whom it was removed (FR-013).
ALTER TABLE "vendor_project_links" ADD CONSTRAINT "vendor_project_links_removed_ck" CHECK (("removed_at" IS NULL) = ("removed_by" IS NULL));
