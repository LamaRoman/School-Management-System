/*
  Warnings:

  - A unique constraint covering the columns `[fee_category_id,grade_id,academic_year_id,exam_type_id]` on the table `fee_structures` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "fee_structures_fee_category_id_grade_id_academic_year_id_key";

-- AlterTable
ALTER TABLE "fee_structures" ADD COLUMN     "exam_type_id" TEXT;

-- AlterTable
ALTER TABLE "student_fee_overrides" ADD COLUMN     "discount_percent" DOUBLE PRECISION,
ADD COLUMN     "discount_type" TEXT NOT NULL DEFAULT 'FLAT';

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_fee_category_id_grade_id_academic_year_id_ex_key" ON "fee_structures"("fee_category_id", "grade_id", "academic_year_id", "exam_type_id");

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_exam_type_id_fkey" FOREIGN KEY ("exam_type_id") REFERENCES "exam_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
