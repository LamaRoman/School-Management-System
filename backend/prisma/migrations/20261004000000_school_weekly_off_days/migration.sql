-- AlterTable
ALTER TABLE "schools" ADD COLUMN "weekly_off_days" INTEGER[] DEFAULT ARRAY[6]::INTEGER[];
