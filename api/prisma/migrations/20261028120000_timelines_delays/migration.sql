-- CreateEnum
CREATE TYPE "TimelineItemType" AS ENUM ('MILESTONE', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "TimelineStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "ResponsibleKind" AS ENUM ('NONE', 'VENDOR', 'FIRM_TEAM');

-- CreateEnum
CREATE TYPE "TimelineDateField" AS ENUM ('PLANNED_DATE', 'DEADLINE');

-- CreateEnum
CREATE TYPE "ResponsibleChangeCause" AS ENUM ('EDIT', 'LINK_REMOVED');

-- CreateTable
CREATE TABLE "timeline_items" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "item_type" "TimelineItemType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "planned_date" DATE,
    "deadline" DATE NOT NULL,
    "responsible_kind" "ResponsibleKind" NOT NULL DEFAULT 'NONE',
    "responsible_vendor_id" UUID,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "timeline_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_date_changes" (
    "id" UUID NOT NULL,
    "timeline_item_id" UUID NOT NULL,
    "field" "TimelineDateField" NOT NULL,
    "old_value" DATE,
    "new_value" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "timeline_date_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_responsible_changes" (
    "id" UUID NOT NULL,
    "timeline_item_id" UUID NOT NULL,
    "old_kind" "ResponsibleKind" NOT NULL,
    "old_vendor_id" UUID,
    "new_kind" "ResponsibleKind" NOT NULL,
    "new_vendor_id" UUID,
    "cause" "ResponsibleChangeCause" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "timeline_responsible_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_progress_updates" (
    "id" UUID NOT NULL,
    "timeline_item_id" UUID NOT NULL,
    "status" "TimelineStatus" NOT NULL,
    "note" TEXT,
    "seq" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "timeline_progress_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delays" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "timeline_item_id" UUID,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "delays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coordination_issues" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "timeline_item_id" UUID,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "coordination_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coordination_issue_vendors" (
    "id" UUID NOT NULL,
    "coordination_issue_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "coordination_issue_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timeline_items_project_id_archived_deadline_name_idx" ON "timeline_items"("project_id", "archived", "deadline", "name");

-- CreateIndex
CREATE INDEX "timeline_items_responsible_vendor_id_idx" ON "timeline_items"("responsible_vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_progress_updates_seq_key" ON "timeline_progress_updates"("seq");

-- CreateIndex
CREATE INDEX "timeline_progress_updates_timeline_item_id_seq_idx" ON "timeline_progress_updates"("timeline_item_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "coordination_issue_vendors_coordination_issue_id_vendor_id_key" ON "coordination_issue_vendors"("coordination_issue_id", "vendor_id");

-- AddForeignKey
ALTER TABLE "timeline_items" ADD CONSTRAINT "timeline_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_items" ADD CONSTRAINT "timeline_items_responsible_vendor_id_fkey" FOREIGN KEY ("responsible_vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_items" ADD CONSTRAINT "timeline_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_items" ADD CONSTRAINT "timeline_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_date_changes" ADD CONSTRAINT "timeline_date_changes_timeline_item_id_fkey" FOREIGN KEY ("timeline_item_id") REFERENCES "timeline_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_date_changes" ADD CONSTRAINT "timeline_date_changes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_date_changes" ADD CONSTRAINT "timeline_date_changes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_responsible_changes" ADD CONSTRAINT "timeline_responsible_changes_timeline_item_id_fkey" FOREIGN KEY ("timeline_item_id") REFERENCES "timeline_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_responsible_changes" ADD CONSTRAINT "timeline_responsible_changes_old_vendor_id_fkey" FOREIGN KEY ("old_vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_responsible_changes" ADD CONSTRAINT "timeline_responsible_changes_new_vendor_id_fkey" FOREIGN KEY ("new_vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_responsible_changes" ADD CONSTRAINT "timeline_responsible_changes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_responsible_changes" ADD CONSTRAINT "timeline_responsible_changes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_progress_updates" ADD CONSTRAINT "timeline_progress_updates_timeline_item_id_fkey" FOREIGN KEY ("timeline_item_id") REFERENCES "timeline_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_progress_updates" ADD CONSTRAINT "timeline_progress_updates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_progress_updates" ADD CONSTRAINT "timeline_progress_updates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delays" ADD CONSTRAINT "delays_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delays" ADD CONSTRAINT "delays_timeline_item_id_fkey" FOREIGN KEY ("timeline_item_id") REFERENCES "timeline_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delays" ADD CONSTRAINT "delays_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delays" ADD CONSTRAINT "delays_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordination_issues" ADD CONSTRAINT "coordination_issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordination_issues" ADD CONSTRAINT "coordination_issues_timeline_item_id_fkey" FOREIGN KEY ("timeline_item_id") REFERENCES "timeline_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordination_issues" ADD CONSTRAINT "coordination_issues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordination_issues" ADD CONSTRAINT "coordination_issues_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordination_issue_vendors" ADD CONSTRAINT "coordination_issue_vendors_coordination_issue_id_fkey" FOREIGN KEY ("coordination_issue_id") REFERENCES "coordination_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordination_issue_vendors" ADD CONSTRAINT "coordination_issue_vendors_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordination_issue_vendors" ADD CONSTRAINT "coordination_issue_vendors_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordination_issue_vendors" ADD CONSTRAINT "coordination_issue_vendors_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A responsible vendor is stored exactly when the responsible party is a vendor (data-model.md).
ALTER TABLE "timeline_items" ADD CONSTRAINT "timeline_items_responsible_ck" CHECK (("responsible_kind" = 'VENDOR') = ("responsible_vendor_id" IS NOT NULL));
