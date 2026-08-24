CREATE TYPE "RepairPhotoStage" AS ENUM ('FAULT_DECLARATION', 'REPAIR_COMPLETION');

ALTER TABLE "RepairPhoto"
ADD COLUMN "stage" "RepairPhotoStage" NOT NULL DEFAULT 'FAULT_DECLARATION';

CREATE INDEX "RepairPhoto_repairId_stage_createdAt_idx" ON "RepairPhoto"("repairId", "stage", "createdAt");

CREATE INDEX "RepairPhoto_stage_idx" ON "RepairPhoto"("stage");
