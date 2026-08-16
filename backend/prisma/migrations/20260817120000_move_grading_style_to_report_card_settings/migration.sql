-- Moves report card design from per-grade (Grade.gradingStyle) to a single
-- school-wide setting (ReportCardSettings.gradingStyle). Owner decision
-- 2026-08-17: one report card design applies to the whole school, not a mix
-- picked per grade.

-- AlterTable: add the new school-wide column, defaulting everyone to
-- MARKS_BASED (the existing per-column default in the schema).
ALTER TABLE "report_card_settings" ADD COLUMN     "grading_style" "GradingStyle" NOT NULL DEFAULT 'MARKS_BASED';

-- Backfill for schools that already have a report_card_settings row: if any
-- of the school's grades was set to CREDIT_GRADE_BASED, carry that forward as
-- the school-wide setting rather than silently reverting it to marks-based.
UPDATE "report_card_settings" rcs
SET "grading_style" = 'CREDIT_GRADE_BASED'
WHERE EXISTS (
  SELECT 1
  FROM "grades" g
  JOIN "academic_years" ay ON ay."id" = g."academic_year_id"
  WHERE ay."school_id" = rcs."school_id"
    AND g."grading_style" = 'CREDIT_GRADE_BASED'
);

-- Schools with a CREDIT_GRADE_BASED grade but no report_card_settings row yet
-- (that row is created lazily on first GET /report-card-settings) get one
-- created now, so the setting isn't silently lost for them either.
INSERT INTO "report_card_settings" ("id", "school_id", "grading_style", "created_at", "updated_at")
SELECT gen_random_uuid()::text, s."id", 'CREDIT_GRADE_BASED', now(), now()
FROM "schools" s
WHERE EXISTS (
  SELECT 1
  FROM "grades" g
  JOIN "academic_years" ay ON ay."id" = g."academic_year_id"
  WHERE ay."school_id" = s."id"
    AND g."grading_style" = 'CREDIT_GRADE_BASED'
)
AND NOT EXISTS (
  SELECT 1 FROM "report_card_settings" rcs WHERE rcs."school_id" = s."id"
);

-- AlterTable: the per-grade column is gone now that the setting is school-wide.
ALTER TABLE "grades" DROP COLUMN "grading_style";
