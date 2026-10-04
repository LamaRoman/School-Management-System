-- One report card design (credit hour + grade point), no pass / fail, no rank.

-- The marks-based design and the setting that chose between the two.
ALTER TABLE "report_card_settings" DROP COLUMN "grading_style";
DROP TYPE "GradingStyle";

-- Columns only the marks-based card printed.
ALTER TABLE "report_card_settings" DROP COLUMN "show_pass_marks";
ALTER TABLE "report_card_settings" DROP COLUMN "show_percentage";

-- Ranking.
ALTER TABLE "report_card_settings" DROP COLUMN "show_rank";
ALTER TABLE "exam_types" DROP COLUMN "show_rank";
ALTER TABLE "consolidated_results" DROP COLUMN "rank";

-- Pass / fail.
ALTER TABLE "subjects" DROP COLUMN "pass_marks";
