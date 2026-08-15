-- CreateTable
CREATE TABLE "student_optional_subjects" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_optional_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_optional_subjects_subject_id_idx" ON "student_optional_subjects"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_optional_subjects_student_id_subject_id_key" ON "student_optional_subjects"("student_id", "subject_id");

-- AddForeignKey
ALTER TABLE "student_optional_subjects" ADD CONSTRAINT "student_optional_subjects_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_optional_subjects" ADD CONSTRAINT "student_optional_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
