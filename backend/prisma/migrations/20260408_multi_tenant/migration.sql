-- ─── Multi-Tenant Migration ─────────────────────────────────────────────────
-- Adds schoolId scoping to root entities for multi-tenant support.
-- Existing data is assigned to the first existing school (or a new default school).

-- 1. Rename SYSTEM_ADMIN → SUPER_ADMIN in UserRole enum
ALTER TYPE "UserRole" RENAME VALUE 'SYSTEM_ADMIN' TO 'SUPER_ADMIN';

-- 2. Add isActive column to schools
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

-- 3. Add school_id columns (nullable first so existing rows don't break)
ALTER TABLE "academic_years" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
ALTER TABLE "fee_categories" ADD COLUMN IF NOT EXISTS "school_id" TEXT;
ALTER TABLE "exam_rooms" ADD COLUMN IF NOT EXISTS "school_id" TEXT;

-- 4. Ensure at least one school exists, then populate schoolId on existing rows
DO $$
DECLARE
  default_school_id TEXT;
BEGIN
  -- Get the first existing school
  SELECT id INTO default_school_id FROM "schools" LIMIT 1;

  -- If no school exists, create one
  IF default_school_id IS NULL THEN
    INSERT INTO "schools" (id, name, "is_active", "created_at", "updated_at")
    VALUES (gen_random_uuid()::text, 'Default School', true, NOW(), NOW())
    RETURNING id INTO default_school_id;
  END IF;

  -- Assign all existing rows to this school
  UPDATE "academic_years" SET "school_id" = default_school_id WHERE "school_id" IS NULL;
  UPDATE "teachers" SET "school_id" = default_school_id WHERE "school_id" IS NULL;
  UPDATE "users" SET "school_id" = default_school_id WHERE "school_id" IS NULL;
  UPDATE "fee_categories" SET "school_id" = default_school_id WHERE "school_id" IS NULL;
  UPDATE "exam_rooms" SET "school_id" = default_school_id WHERE "school_id" IS NULL;
END $$;

-- 5. Make school_id NOT NULL on entities that require it (User stays nullable for SUPER_ADMIN)
ALTER TABLE "academic_years" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "teachers" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "fee_categories" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "exam_rooms" ALTER COLUMN "school_id" SET NOT NULL;

-- 6. Add foreign key constraints
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teachers" ADD CONSTRAINT "teachers_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "users" ADD CONSTRAINT "users_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fee_categories" ADD CONSTRAINT "fee_categories_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exam_rooms" ADD CONSTRAINT "exam_rooms_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Update unique constraints to include schoolId
-- AcademicYear: yearBS was globally unique, now unique per school
ALTER TABLE "academic_years" DROP CONSTRAINT IF EXISTS "academic_years_year_bs_key";
CREATE UNIQUE INDEX "academic_years_year_bs_school_id_key" ON "academic_years"("year_bs", "school_id");

-- FeeCategory: name unique per school
CREATE UNIQUE INDEX IF NOT EXISTS "fee_categories_name_school_id_key" ON "fee_categories"("name", "school_id");

-- 8. Add indexes for performance
CREATE INDEX IF NOT EXISTS "academic_years_school_id_idx" ON "academic_years"("school_id");
CREATE INDEX IF NOT EXISTS "teachers_school_id_idx" ON "teachers"("school_id");
CREATE INDEX IF NOT EXISTS "users_school_id_idx" ON "users"("school_id");
CREATE INDEX IF NOT EXISTS "fee_categories_school_id_idx" ON "fee_categories"("school_id");
CREATE INDEX IF NOT EXISTS "exam_rooms_school_id_idx" ON "exam_rooms"("school_id");
