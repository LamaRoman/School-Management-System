/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `schools` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "academic_years_school_id_idx";

-- DropIndex
DROP INDEX "academic_years_year_bs_key";

-- DropIndex
DROP INDEX "exam_rooms_school_id_idx";

-- DropIndex
DROP INDEX "fee_categories_school_id_idx";

-- DropIndex
DROP INDEX "teachers_school_id_idx";

-- DropIndex
DROP INDEX "users_school_id_idx";

-- AlterTable
ALTER TABLE "report_card_settings" ADD COLUMN     "logo_position" TEXT NOT NULL DEFAULT 'center',
ADD COLUMN     "logo_size" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "show_nepali_name" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "student_fee_assignments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "fee_category_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_fee_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_counters" (
    "school_id" TEXT NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "receipt_counters_pkey" PRIMARY KEY ("school_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_assignments_student_id_fee_category_id_academic_key" ON "student_fee_assignments"("student_id", "fee_category_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "schools_code_key" ON "schools"("code");

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_fee_category_id_fkey" FOREIGN KEY ("fee_category_id") REFERENCES "fee_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_counters" ADD CONSTRAINT "receipt_counters_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
