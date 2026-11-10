
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HistoryAction" ADD VALUE 'SECTION_ADDED';
ALTER TYPE "HistoryAction" ADD VALUE 'SECTION_RENAMED';
ALTER TYPE "HistoryAction" ADD VALUE 'SECTION_EDITED';
ALTER TYPE "HistoryAction" ADD VALUE 'SECTIONS_REORDERED';
ALTER TYPE "HistoryAction" ADD VALUE 'SECTION_REMOVED';
ALTER TYPE "HistoryAction" ADD VALUE 'SECTION_RESTORED';
ALTER TYPE "HistoryAction" ADD VALUE 'BLUEPRINT_APPLIED';
ALTER TYPE "HistoryAction" ADD VALUE 'SECTION_ASSIGNED';
ALTER TYPE "HistoryAction" ADD VALUE 'SECTION_ASSIGNMENT_EDITED';
ALTER TYPE "HistoryAction" ADD VALUE 'SECTION_UNASSIGNED';

-- CreateTable
CREATE TABLE "project_sections" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "removed_at" TIMESTAMP(3),
    "removed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "project_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_assignments" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "role_in_section" TEXT,
    "removed_at" TIMESTAMP(3),
    "removed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "section_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_sections_project_id_position_idx" ON "project_sections"("project_id", "position");

-- CreateIndex
CREATE INDEX "section_assignments_section_id_idx" ON "section_assignments"("section_id");

-- CreateIndex
CREATE INDEX "section_assignments_vendor_id_idx" ON "section_assignments"("vendor_id");

-- AddForeignKey
ALTER TABLE "project_sections" ADD CONSTRAINT "project_sections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sections" ADD CONSTRAINT "project_sections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sections" ADD CONSTRAINT "project_sections_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sections" ADD CONSTRAINT "project_sections_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_assignments" ADD CONSTRAINT "section_assignments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "project_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_assignments" ADD CONSTRAINT "section_assignments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_assignments" ADD CONSTRAINT "section_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_assignments" ADD CONSTRAINT "section_assignments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_assignments" ADD CONSTRAINT "section_assignments_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Written by hand: Prisma cannot express these (data-model.md, research §6).
-- One current section name per project, compared without regard to case (FR-011).
CREATE UNIQUE INDEX "project_sections_current_name_key" ON "project_sections" ("project_id", lower("name")) WHERE "removed_at" IS NULL;

-- One current assignment per vendor and section (FR-016).
CREATE UNIQUE INDEX "section_assignments_current_key" ON "section_assignments" ("section_id", "vendor_id") WHERE "removed_at" IS NULL;

-- A removed section or assignment records both when and by whom (FR-010, FR-017).
ALTER TABLE "project_sections" ADD CONSTRAINT "project_sections_removed_ck" CHECK (("removed_at" IS NULL) = ("removed_by" IS NULL));
ALTER TABLE "section_assignments" ADD CONSTRAINT "section_assignments_removed_ck" CHECK (("removed_at" IS NULL) = ("removed_by" IS NULL));
