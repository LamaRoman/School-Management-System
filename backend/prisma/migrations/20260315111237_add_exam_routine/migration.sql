-- CreateTable
CREATE TABLE "exam_routines" (
    "id" TEXT NOT NULL,
    "exam_type_id" TEXT NOT NULL,
    "grade_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "exam_date" TEXT NOT NULL,
    "day_name" TEXT,
    "start_time" TEXT,
    "end_time" TEXT,
    "room_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_routines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_routines_exam_type_id_grade_id_subject_id_key" ON "exam_routines"("exam_type_id", "grade_id", "subject_id");

-- AddForeignKey
ALTER TABLE "exam_routines" ADD CONSTRAINT "exam_routines_exam_type_id_fkey" FOREIGN KEY ("exam_type_id") REFERENCES "exam_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_routines" ADD CONSTRAINT "exam_routines_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_routines" ADD CONSTRAINT "exam_routines_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
