-- CreateTable
CREATE TABLE "report_card_settings" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "show_pass_marks" BOOLEAN NOT NULL DEFAULT true,
    "show_theory_prac" BOOLEAN NOT NULL DEFAULT true,
    "show_percentage" BOOLEAN NOT NULL DEFAULT false,
    "show_grade" BOOLEAN NOT NULL DEFAULT true,
    "show_gpa" BOOLEAN NOT NULL DEFAULT true,
    "show_rank" BOOLEAN NOT NULL DEFAULT true,
    "show_attendance" BOOLEAN NOT NULL DEFAULT true,
    "show_remarks" BOOLEAN NOT NULL DEFAULT true,
    "show_promotion" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_card_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_card_settings_school_id_key" ON "report_card_settings"("school_id");

-- AddForeignKey
ALTER TABLE "report_card_settings" ADD CONSTRAINT "report_card_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
