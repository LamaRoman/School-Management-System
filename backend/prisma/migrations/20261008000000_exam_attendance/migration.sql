-- CreateTable
CREATE TABLE "exam_attendances" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "exam_type_id" TEXT NOT NULL,
    "present_days" INTEGER NOT NULL,
    "total_days" INTEGER NOT NULL,
    "cumulative_present" INTEGER NOT NULL,
    "cumulative_total" INTEGER NOT NULL,
    "frozen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_attendances_exam_type_id_idx" ON "exam_attendances"("exam_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attendances_student_id_exam_type_id_key" ON "exam_attendances"("student_id", "exam_type_id");

-- AddForeignKey
ALTER TABLE "exam_attendances" ADD CONSTRAINT "exam_attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attendances" ADD CONSTRAINT "exam_attendances_exam_type_id_fkey" FOREIGN KEY ("exam_type_id") REFERENCES "exam_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

