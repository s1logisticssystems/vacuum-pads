-- Add optional technical and commercial metadata for Vacuum Pads.
-- Existing rows remain valid because every new field is nullable.
ALTER TABLE "VacuumPad"
ADD COLUMN "netWeightKg" DOUBLE PRECISION,
ADD COLUMN "dimensionLengthMm" INTEGER,
ADD COLUMN "dimensionWidthMm" INTEGER,
ADD COLUMN "dimensionHeightMm" INTEGER,
ADD COLUMN "liftingCapacityKg" DOUBLE PRECISION,
ADD COLUMN "costEuro" DECIMAL(10, 2),
ADD COLUMN "receivedAt" TIMESTAMP(3);
