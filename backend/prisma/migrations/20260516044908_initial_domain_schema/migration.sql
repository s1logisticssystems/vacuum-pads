-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'TECHNICIAN', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "LocationStatus" AS ENUM ('IN_RACK', 'ON_MACHINE', 'IN_REPAIR', 'IN_TRANSIT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OperationalStatus" AS ENUM ('FUNCTIONAL', 'INSPECTION_REQUIRED', 'UNDER_REPAIR', 'OUT_OF_SERVICE', 'RETIRED');

-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('CHARGE', 'DECHARGE', 'RACK_TRANSFER', 'REPAIR_INTAKE', 'REPAIR_RELEASE', 'STATUS_CHANGE', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('REPORTED', 'ASSIGNED', 'UNDER_REPAIR', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RepairPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "RepairOutcome" AS ENUM ('RETURNED_TO_SERVICE', 'OUT_OF_SERVICE', 'RETIRED', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'CHARGE', 'DECHARGE', 'REPAIR_REPORTED', 'REPAIR_ASSIGNED', 'REPAIR_COMPLETED', 'PHOTO_UPLOADED', 'STATUS_CHANGE', 'MANUAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VacuumPad" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "serialNumber" TEXT,
    "description" TEXT,
    "dimensions" TEXT,
    "type" TEXT,
    "locationStatus" "LocationStatus" NOT NULL DEFAULT 'UNKNOWN',
    "operationalStatus" "OperationalStatus" NOT NULL DEFAULT 'FUNCTIONAL',
    "currentRackLocationId" TEXT,
    "currentMachineId" TEXT,
    "lastRepairAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VacuumPad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RackLocation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "zone" TEXT,
    "rack" TEXT,
    "level" TEXT,
    "slot" TEXT,
    "label" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RackLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "area" TEXT,
    "project" TEXT,
    "status" "MachineStatus" NOT NULL DEFAULT 'ACTIVE',
    "responsibleOperatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadMovement" (
    "id" TEXT NOT NULL,
    "vacuumPadId" TEXT NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "fromRackLocationId" TEXT,
    "toRackLocationId" TEXT,
    "fromMachineId" TEXT,
    "toMachineId" TEXT,
    "previousLocationStatus" "LocationStatus",
    "newLocationStatus" "LocationStatus",
    "previousOperationalStatus" "OperationalStatus",
    "newOperationalStatus" "OperationalStatus",
    "performedById" TEXT NOT NULL,
    "deviceId" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repair" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "vacuumPadId" TEXT NOT NULL,
    "reportedById" TEXT,
    "technicianId" TEXT,
    "status" "RepairStatus" NOT NULL DEFAULT 'REPORTED',
    "priority" "RepairPriority" NOT NULL DEFAULT 'NORMAL',
    "problemDescription" TEXT NOT NULL,
    "technicianNotes" TEXT,
    "repairActions" TEXT,
    "spareParts" TEXT,
    "repairCost" DECIMAL(10,2),
    "outcome" "RepairOutcome",
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairPhoto" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "originalFilename" TEXT,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "caption" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT,
    "deviceId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "VacuumPad_code_key" ON "VacuumPad"("code");

-- CreateIndex
CREATE UNIQUE INDEX "VacuumPad_qrCode_key" ON "VacuumPad"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "VacuumPad_serialNumber_key" ON "VacuumPad"("serialNumber");

-- CreateIndex
CREATE INDEX "VacuumPad_locationStatus_idx" ON "VacuumPad"("locationStatus");

-- CreateIndex
CREATE INDEX "VacuumPad_operationalStatus_idx" ON "VacuumPad"("operationalStatus");

-- CreateIndex
CREATE INDEX "VacuumPad_currentRackLocationId_idx" ON "VacuumPad"("currentRackLocationId");

-- CreateIndex
CREATE INDEX "VacuumPad_currentMachineId_idx" ON "VacuumPad"("currentMachineId");

-- CreateIndex
CREATE INDEX "VacuumPad_createdAt_idx" ON "VacuumPad"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RackLocation_code_key" ON "RackLocation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RackLocation_qrCode_key" ON "RackLocation"("qrCode");

-- CreateIndex
CREATE INDEX "RackLocation_zone_idx" ON "RackLocation"("zone");

-- CreateIndex
CREATE INDEX "RackLocation_rack_idx" ON "RackLocation"("rack");

-- CreateIndex
CREATE INDEX "RackLocation_isActive_idx" ON "RackLocation"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_code_key" ON "Machine"("code");

-- CreateIndex
CREATE INDEX "Machine_status_idx" ON "Machine"("status");

-- CreateIndex
CREATE INDEX "Machine_responsibleOperatorId_idx" ON "Machine"("responsibleOperatorId");

-- CreateIndex
CREATE INDEX "Machine_area_idx" ON "Machine"("area");

-- CreateIndex
CREATE INDEX "Machine_project_idx" ON "Machine"("project");

-- CreateIndex
CREATE INDEX "PadMovement_vacuumPadId_createdAt_idx" ON "PadMovement"("vacuumPadId", "createdAt");

-- CreateIndex
CREATE INDEX "PadMovement_movementType_idx" ON "PadMovement"("movementType");

-- CreateIndex
CREATE INDEX "PadMovement_performedById_idx" ON "PadMovement"("performedById");

-- CreateIndex
CREATE INDEX "PadMovement_fromRackLocationId_idx" ON "PadMovement"("fromRackLocationId");

-- CreateIndex
CREATE INDEX "PadMovement_toRackLocationId_idx" ON "PadMovement"("toRackLocationId");

-- CreateIndex
CREATE INDEX "PadMovement_fromMachineId_idx" ON "PadMovement"("fromMachineId");

-- CreateIndex
CREATE INDEX "PadMovement_toMachineId_idx" ON "PadMovement"("toMachineId");

-- CreateIndex
CREATE INDEX "PadMovement_createdAt_idx" ON "PadMovement"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Repair_code_key" ON "Repair"("code");

-- CreateIndex
CREATE INDEX "Repair_vacuumPadId_idx" ON "Repair"("vacuumPadId");

-- CreateIndex
CREATE INDEX "Repair_vacuumPadId_status_idx" ON "Repair"("vacuumPadId", "status");

-- CreateIndex
CREATE INDEX "Repair_status_idx" ON "Repair"("status");

-- CreateIndex
CREATE INDEX "Repair_priority_idx" ON "Repair"("priority");

-- CreateIndex
CREATE INDEX "Repair_reportedById_idx" ON "Repair"("reportedById");

-- CreateIndex
CREATE INDEX "Repair_technicianId_idx" ON "Repair"("technicianId");

-- CreateIndex
CREATE INDEX "Repair_reportedAt_idx" ON "Repair"("reportedAt");

-- CreateIndex
CREATE INDEX "Repair_completedAt_idx" ON "Repair"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RepairPhoto_objectKey_key" ON "RepairPhoto"("objectKey");

-- CreateIndex
CREATE INDEX "RepairPhoto_repairId_createdAt_idx" ON "RepairPhoto"("repairId", "createdAt");

-- CreateIndex
CREATE INDEX "RepairPhoto_uploadedById_idx" ON "RepairPhoto"("uploadedById");

-- CreateIndex
CREATE INDEX "RepairPhoto_createdAt_idx" ON "RepairPhoto"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "VacuumPad" ADD CONSTRAINT "VacuumPad_currentRackLocationId_fkey" FOREIGN KEY ("currentRackLocationId") REFERENCES "RackLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacuumPad" ADD CONSTRAINT "VacuumPad_currentMachineId_fkey" FOREIGN KEY ("currentMachineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_responsibleOperatorId_fkey" FOREIGN KEY ("responsibleOperatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadMovement" ADD CONSTRAINT "PadMovement_vacuumPadId_fkey" FOREIGN KEY ("vacuumPadId") REFERENCES "VacuumPad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadMovement" ADD CONSTRAINT "PadMovement_fromRackLocationId_fkey" FOREIGN KEY ("fromRackLocationId") REFERENCES "RackLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadMovement" ADD CONSTRAINT "PadMovement_toRackLocationId_fkey" FOREIGN KEY ("toRackLocationId") REFERENCES "RackLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadMovement" ADD CONSTRAINT "PadMovement_fromMachineId_fkey" FOREIGN KEY ("fromMachineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadMovement" ADD CONSTRAINT "PadMovement_toMachineId_fkey" FOREIGN KEY ("toMachineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadMovement" ADD CONSTRAINT "PadMovement_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_vacuumPadId_fkey" FOREIGN KEY ("vacuumPadId") REFERENCES "VacuumPad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPhoto" ADD CONSTRAINT "RepairPhoto_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPhoto" ADD CONSTRAINT "RepairPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
