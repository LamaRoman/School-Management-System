-- CreateEnum
CREATE TYPE "GradingStyle" AS ENUM ('MARKS_BASED', 'CREDIT_GRADE_BASED');

-- AlterTable
ALTER TABLE "grades" ADD COLUMN     "grading_style" "GradingStyle" NOT NULL DEFAULT 'MARKS_BASED';

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "credit_hour" INTEGER NOT NULL DEFAULT 4;
