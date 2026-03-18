-- CreateTable
CREATE TABLE "observation_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_np" TEXT,
    "grade_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observation_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observation_results" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "exam_type_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observation_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "observation_categories_name_grade_id_key" ON "observation_categories"("name", "grade_id");

-- CreateIndex
CREATE UNIQUE INDEX "observation_results_student_id_category_id_exam_type_id_aca_key" ON "observation_results"("student_id", "category_id", "exam_type_id", "academic_year_id");

-- AddForeignKey
ALTER TABLE "observation_categories" ADD CONSTRAINT "observation_categories_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_results" ADD CONSTRAINT "observation_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_results" ADD CONSTRAINT "observation_results_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "observation_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_results" ADD CONSTRAINT "observation_results_exam_type_id_fkey" FOREIGN KEY ("exam_type_id") REFERENCES "exam_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_results" ADD CONSTRAINT "observation_results_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
