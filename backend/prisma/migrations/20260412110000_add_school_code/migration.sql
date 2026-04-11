-- Add a short, human-readable code to each school (e.g. "GHS", "SPS").
-- Used as the prefix in receipt numbers: RCP-GHS-000001
-- Nullable initially so existing schools don't break; unique once set.

ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "code" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "schools_code_key" ON "schools"("code") WHERE "code" IS NOT NULL;
