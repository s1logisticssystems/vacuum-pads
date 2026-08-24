-- CreateEnum
CREATE TYPE "RackLocationType" AS ENUM ('AVL', 'REP');

-- CreateEnum
CREATE TYPE "PhotoStorageProvider" AS ENUM ('MINIO', 'FILESYSTEM');

-- DropForeignKey
ALTER TABLE "PadMovement" DROP CONSTRAINT "PadMovement_performedById_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "operatorName" TEXT;

-- AlterTable
ALTER TABLE "Machine"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "qrCode" TEXT;

-- Manual backfill for existing machine rows before enforcing NOT NULL + UNIQUE.
UPDATE "Machine"
SET "qrCode" = CONCAT('QR-MIGRATED-', "code")
WHERE "qrCode" IS NULL;

-- AlterTable
ALTER TABLE "Machine"
ALTER COLUMN "qrCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "PadMovement"
ADD COLUMN "operatorName" TEXT,
ALTER COLUMN "performedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RackLocation"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "type" "RackLocationType" NOT NULL DEFAULT 'AVL';

-- AlterTable
ALTER TABLE "Repair"
ADD COLUMN "faultCatalogId" TEXT,
ADD COLUMN "faultOtherText" TEXT,
ADD COLUMN "operatorName" TEXT;

-- AlterTable
ALTER TABLE "RepairPhoto"
ADD COLUMN "filesystemPath" TEXT,
ADD COLUMN "operatorName" TEXT,
ADD COLUMN "publicUrl" TEXT,
ADD COLUMN "storageProvider" "PhotoStorageProvider" NOT NULL DEFAULT 'MINIO';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "VacuumPad" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FaultCatalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaultCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeSession" (
    "id" TEXT NOT NULL,
    "vacuumPadId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "chargedAt" TIMESTAMP(3) NOT NULL,
    "dechargedAt" TIMESTAMP(3),
    "dechargeRackLocationId" TEXT,
    "chargedById" TEXT,
    "dechargedById" TEXT,
    "chargeDeviceId" TEXT,
    "dechargeDeviceId" TEXT,
    "chargeOperatorName" TEXT,
    "dechargeOperatorName" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargeSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FaultCatalog_code_key" ON "FaultCatalog"("code");

-- CreateIndex
CREATE INDEX "FaultCatalog_isActive_idx" ON "FaultCatalog"("isActive");

-- CreateIndex
CREATE INDEX "FaultCatalog_sortOrder_idx" ON "FaultCatalog"("sortOrder");

-- CreateIndex
CREATE INDEX "FaultCatalog_deletedAt_idx" ON "FaultCatalog"("deletedAt");

-- CreateIndex
CREATE INDEX "ChargeSession_vacuumPadId_idx" ON "ChargeSession"("vacuumPadId");

-- CreateIndex
CREATE INDEX "ChargeSession_machineId_idx" ON "ChargeSession"("machineId");

-- CreateIndex
CREATE INDEX "ChargeSession_dechargeRackLocationId_idx" ON "ChargeSession"("dechargeRackLocationId");

-- CreateIndex
CREATE INDEX "ChargeSession_chargedAt_idx" ON "ChargeSession"("chargedAt");

-- CreateIndex
CREATE INDEX "ChargeSession_dechargedAt_idx" ON "ChargeSession"("dechargedAt");

-- CreateIndex
CREATE INDEX "ChargeSession_chargedById_idx" ON "ChargeSession"("chargedById");

-- CreateIndex
CREATE INDEX "ChargeSession_dechargedById_idx" ON "ChargeSession"("dechargedById");

-- Manual partial unique index: one open charge session per pad.
CREATE UNIQUE INDEX "ChargeSession_open_vacuumPadId_key"
ON "ChargeSession"("vacuumPadId")
WHERE "dechargedAt" IS NULL;

-- Manual partial unique index: one occupied machine per open charge session.
CREATE UNIQUE INDEX "ChargeSession_open_machineId_key"
ON "ChargeSession"("machineId")
WHERE "dechargedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Machine_qrCode_key" ON "Machine"("qrCode");

-- CreateIndex
CREATE INDEX "Machine_deletedAt_idx" ON "Machine"("deletedAt");

-- CreateIndex
CREATE INDEX "RackLocation_type_idx" ON "RackLocation"("type");

-- CreateIndex
CREATE INDEX "RackLocation_deletedAt_idx" ON "RackLocation"("deletedAt");

-- CreateIndex
CREATE INDEX "Repair_faultCatalogId_idx" ON "Repair"("faultCatalogId");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "VacuumPad_deletedAt_idx" ON "VacuumPad"("deletedAt");

-- Manual partial unique index: one active machine assignment per non-deleted pad.
CREATE UNIQUE INDEX "VacuumPad_currentMachineId_active_key"
ON "VacuumPad"("currentMachineId")
WHERE "currentMachineId" IS NOT NULL AND "deletedAt" IS NULL;

-- Manual partial unique index: one active rack occupant per non-deleted rack position.
CREATE UNIQUE INDEX "VacuumPad_currentRackLocationId_active_key"
ON "VacuumPad"("currentRackLocationId")
WHERE "currentRackLocationId" IS NOT NULL AND "deletedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "PadMovement" ADD CONSTRAINT "PadMovement_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_faultCatalogId_fkey" FOREIGN KEY ("faultCatalogId") REFERENCES "FaultCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeSession" ADD CONSTRAINT "ChargeSession_vacuumPadId_fkey" FOREIGN KEY ("vacuumPadId") REFERENCES "VacuumPad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeSession" ADD CONSTRAINT "ChargeSession_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeSession" ADD CONSTRAINT "ChargeSession_dechargeRackLocationId_fkey" FOREIGN KEY ("dechargeRackLocationId") REFERENCES "RackLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeSession" ADD CONSTRAINT "ChargeSession_chargedById_fkey" FOREIGN KEY ("chargedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeSession" ADD CONSTRAINT "ChargeSession_dechargedById_fkey" FOREIGN KEY ("dechargedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
