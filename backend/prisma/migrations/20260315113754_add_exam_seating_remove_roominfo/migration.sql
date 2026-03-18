/*
  Warnings:

  - You are about to drop the column `room_info` on the `exam_routines` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "exam_routines" DROP COLUMN "room_info";

-- CreateTable
CREATE TABLE "exam_rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_allocations" (
    "id" TEXT NOT NULL,
    "exam_type_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "seat_number" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seat_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seat_allocations_exam_type_id_academic_year_id_student_id_key" ON "seat_allocations"("exam_type_id", "academic_year_id", "student_id");

-- AddForeignKey
ALTER TABLE "seat_allocations" ADD CONSTRAINT "seat_allocations_exam_type_id_fkey" FOREIGN KEY ("exam_type_id") REFERENCES "exam_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_allocations" ADD CONSTRAINT "seat_allocations_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_allocations" ADD CONSTRAINT "seat_allocations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_allocations" ADD CONSTRAINT "seat_allocations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "exam_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
