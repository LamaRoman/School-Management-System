-- CreateIndex
CREATE INDEX "consolidated_results_academic_year_id_grade_id_idx" ON "consolidated_results"("academic_year_id", "grade_id");

-- CreateIndex
CREATE INDEX "daily_attendances_academic_year_id_date_idx" ON "daily_attendances"("academic_year_id", "date");

-- CreateIndex
CREATE INDEX "fee_payments_student_id_academic_year_id_idx" ON "fee_payments"("student_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "fee_payments_academic_year_id_payment_date_idx" ON "fee_payments"("academic_year_id", "payment_date");

-- CreateIndex
CREATE INDEX "marks_exam_type_id_academic_year_id_student_id_idx" ON "marks"("exam_type_id", "academic_year_id", "student_id");

-- CreateIndex
CREATE INDEX "marks_academic_year_id_student_id_idx" ON "marks"("academic_year_id", "student_id");

-- CreateIndex
CREATE INDEX "students_section_id_is_active_idx" ON "students"("section_id", "is_active");
