-- CreateTable
CREATE TABLE "admissions" (
    "id" TEXT NOT NULL,
    "student_name" TEXT NOT NULL,
    "student_name_np" TEXT,
    "date_of_birth" TEXT,
    "gender" TEXT,
    "father_name" TEXT,
    "mother_name" TEXT,
    "guardian_name" TEXT,
    "guardian_phone" TEXT,
    "address" TEXT,
    "previous_school" TEXT,
    "applying_for_grade_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "applied_date" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "reviewed_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admissions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_applying_for_grade_id_fkey" FOREIGN KEY ("applying_for_grade_id") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
