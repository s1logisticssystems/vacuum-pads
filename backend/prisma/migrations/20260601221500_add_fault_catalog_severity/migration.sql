-- Add optional severity metadata to fault catalog rows imported from the
-- production master-data workbook. Existing repair priority values are reused
-- so no new enum is required.
ALTER TABLE "FaultCatalog" ADD COLUMN "severity" "RepairPriority";
