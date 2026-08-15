-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHED');

-- CreateTable
CREATE TABLE "exam_result_statuses" (
    "id" TEXT NOT NULL,
    "exam_type_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "status" "ResultStatus" NOT NULL DEFAULT 'DRAFT',
    "marked_ready_by_id" TEXT,
    "marked_ready_at" TIMESTAMP(3),
    "published_by_id" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_result_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_result_statuses_section_id_idx" ON "exam_result_statuses"("section_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_result_statuses_exam_type_id_section_id_key" ON "exam_result_statuses"("exam_type_id", "section_id");

-- AddForeignKey
ALTER TABLE "exam_result_statuses" ADD CONSTRAINT "exam_result_statuses_exam_type_id_fkey" FOREIGN KEY ("exam_type_id") REFERENCES "exam_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_result_statuses" ADD CONSTRAINT "exam_result_statuses_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_result_statuses" ADD CONSTRAINT "exam_result_statuses_marked_ready_by_id_fkey" FOREIGN KEY ("marked_ready_by_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_result_statuses" ADD CONSTRAINT "exam_result_statuses_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every (exam type x section) that already has marks starts PUBLISHED.
--
-- Without this, the moment this migration lands every family loses access to
-- results they could see the day before, until an admin goes and publishes
-- each one. The workflow is for exams from here on; what is already out stays
-- out.
--
-- Only pairs that actually have a mark are seeded. A pair with no marks would
-- 404 in the portal today anyway, so leaving it absent (= DRAFT) changes
-- nothing a family can observe and starts it in the right state.
--
-- published_by_id and published_at are left NULL on purpose: nobody published
-- these, and recording a fictional publisher would be worse than recording
-- none. The UI reads a NULL published_at on a PUBLISHED row as "visible from
-- before results publishing existed".
INSERT INTO "exam_result_statuses" ("id", "exam_type_id", "section_id", "status", "created_at", "updated_at")
SELECT gen_random_uuid()::text, m."exam_type_id", s."section_id", 'PUBLISHED', NOW(), NOW()
FROM "marks" m
JOIN "students" s ON s."id" = m."student_id"
GROUP BY m."exam_type_id", s."section_id"
ON CONFLICT ("exam_type_id", "section_id") DO NOTHING;
