/**
 * Grading system, matching the school's own printed grade sheets.
 *
 * This is the source of truth for all grade/GPA calculations on the server.
 * One deliberate duplicate exists — frontend/src/lib/gradingScale.ts, which
 * renders the scale in the student, teacher and admin pages. Change both
 * together or the web UI and the PDFs will disagree.
 */

export interface GradeResult {
  grade: string;
  gpa: number | null;
  description: string;
}

export interface GradingScaleEntry {
  min: number;
  grade: string;
  gpa: number | null;
  description: string;
  range: string;
}

/**
 * Matches the school's printed grade sheet exactly.
 *
 * Note there is no NG / Non-Graded band: every interval down to 0% carries a
 * grade point, the lowest being E at 0.8. That has two consequences worth
 * knowing about:
 *   1. No subject is ever excluded from a GPA average any more. Previously an
 *      NG subject had a null grade point and was skipped, which quietly
 *      inflated the average of a struggling student.
 *   2. "Fail" can no longer be derived from the grade NG, so it is expressed
 *      through isPassingGrade below.
 *
 * Verified against a real printed sheet: grades B+, C+, B+, C+, B, B, C at
 * equal credit hours give 2.69, the GPA that sheet shows.
 */
export const GRADING_SCALE: GradingScaleEntry[] = [
  { min: 90, grade: "A+", gpa: 4.0, description: "Outstanding", range: "90% to 100%" },
  { min: 80, grade: "A", gpa: 3.6, description: "Excellent", range: "80% to Below 90%" },
  { min: 70, grade: "B+", gpa: 3.2, description: "Very Good", range: "70% to Below 80%" },
  { min: 60, grade: "B", gpa: 2.8, description: "Good", range: "60% to Below 70%" },
  { min: 50, grade: "C+", gpa: 2.4, description: "Satisfactory", range: "50% to Below 60%" },
  { min: 40, grade: "C", gpa: 2.0, description: "Acceptable", range: "40% to Below 50%" },
  { min: 30, grade: "D+", gpa: 1.6, description: "Partially Acceptable", range: "30% to Below 40%" },
  { min: 20, grade: "D", gpa: 1.2, description: "Insufficient", range: "20% to Below 30%" },
  { min: 0, grade: "E", gpa: 0.8, description: "Very Insufficient", range: "0 to Below 20%" },
];

/**
 * Grades that count as a fail.
 *
 * The scale above has no NG band, so a fail is identified by grade rather than
 * by a percentage threshold. D and E are the two bands the scale itself calls
 * Insufficient and Very Insufficient; D+ ("Partially Acceptable") and above
 * pass.
 *
 * This moves the fail line from below 35% to below 30%, because the new scale
 * has no boundary at 35% — D+ spans 30–40%. A student at 32% used to be NG
 * (Fail) and is now D+ (Pass).
 */
export const FAILING_GRADES = ["D", "E"];

export function isPassingGrade(grade: string): boolean {
  return !FAILING_GRADES.includes(grade);
}

/**
 * The overall percentage: total marks obtained over total full marks — the school's own
 * method (decided 2026-10-04). Until then it was the plain average of the subject
 * percentages, which gives a 25-mark subject the same weight as a 50-mark one; with every
 * subject on the same full marks the two agree, which is why nobody noticed until III-A's
 * Computer (out of 25) made them differ (Aasha: 51.3% averaged vs 50.3% by total).
 *
 * Written as the full-marks-weighted mean of the subject percentages, which is exactly
 * total/total for a term, and the natural equivalent for the annual result, where each
 * subject's percentage is already the weighted blend of its terms. Unrounded.
 */
export function totalMarksPercentage(subjects: { percentage: number; fullMarks: number }[]): number {
  const full = subjects.reduce((a, s) => a + s.fullMarks, 0);
  if (full <= 0) return 0;
  return subjects.reduce((a, s) => a + s.percentage * s.fullMarks, 0) / full;
}

export type StudentResult = "Pass" | "Fail" | "Incomplete";

/**
 * A student's result for an exam (or the year), as printed on the report card and used to
 * decide who is ranked — the same rule for both card styles (decided 2026-10-04; the
 * credit-hour card used to fail a subject only on grade D/E, i.e. below 30%, so 30–39%
 * passed there while failing the school's 40% pass mark). Incomplete if any subject is
 * absent or not yet entered; otherwise every subject must reach its pass mark and the
 * overall grade must not be D/E (overallResult).
 */
export function studentResult(
  overallGrade: string,
  subjects: { hasPassed?: boolean; isAbsent?: boolean; notEntered?: boolean }[],
): StudentResult {
  if (subjects.some((s) => s.isAbsent || s.notEntered)) return "Incomplete";
  return overallResult(overallGrade, subjects);
}

/**
 * Rank only the students who passed (decided 2026-10-04): a student who failed a subject or
 * has an absent / missing paper gets no rank (null) rather than a position that could sit
 * above someone who passed. Among those who passed, standard competition ranking on the
 * percentage: equal percentages share a rank and the next one skips (1, 2, 2, 4).
 */
export function rankPassedOnly(
  students: { studentId: string; pct: number; result: StudentResult }[],
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const passed = students.filter((s) => s.result === "Pass").sort((a, b) => b.pct - a.pct);
  let rank = 0;
  let prev = Number.NaN;
  passed.forEach((s, i) => {
    if (s.pct !== prev) { rank = i + 1; prev = s.pct; }
    out.set(s.studentId, rank);
  });
  for (const s of students) if (!out.has(s.studentId)) out.set(s.studentId, null);
  return out;
}

/**
 * The overall result, marks-based report cards. The school follows the usual Nepali rule: a
 * student passes only by reaching the pass mark in EVERY subject — fail one subject and the
 * result is Fail, whatever the overall percentage. (Until 2026-10-04 only the overall grade
 * decided it, so a student below the pass mark in three subjects could still print "Pass".)
 * A failing overall grade (D/E) is still a fail too.
 *
 * Absent and not-yet-entered subjects are left to the caller, which prints "Incomplete" for
 * them before looking at this; they are skipped here so a missing paper never reads as a fail.
 * Must match overallResult in frontend/src/lib/gradingScale.ts.
 */
export function overallResult(
  overallGrade: string,
  subjects: { hasPassed?: boolean; isAbsent?: boolean; notEntered?: boolean }[],
): "Pass" | "Fail" {
  const failedSubject = subjects.some((s) => !s.isAbsent && !s.notEntered && s.hasPassed === false);
  return failedSubject || !isPassingGrade(overallGrade) ? "Fail" : "Pass";
}

/**
 * Get grade and GPA from a percentage value. The lowest band starts at 0, so
 * every input resolves to a grade; the fallback exists only to satisfy the
 * compiler if the scale is ever edited to not reach 0.
 */
export function getGradeFromPercentage(percentage: number): GradeResult {
  const clamped = Math.max(0, Math.min(100, percentage));
  for (const entry of GRADING_SCALE) {
    if (clamped >= entry.min) {
      return { grade: entry.grade, gpa: entry.gpa, description: entry.description };
    }
  }
  const lowest = GRADING_SCALE[GRADING_SCALE.length - 1];
  return { grade: lowest.grade, gpa: lowest.gpa, description: lowest.description };
}

/**
 * Calculate percentage from marks
 */
export function calculatePercentage(obtained: number, fullMarks: number): number {
  if (fullMarks === 0) return 0;
  return (obtained / fullMarks) * 100;
}

/**
 * Calculate weighted percentage using percentage-first method
 * Each term's marks are converted to percentage first, then weightage is applied.
 */
export function calculateWeightedPercentage(
  termResults: { obtained: number; fullMarks: number; weightage: number }[]
): number {
  let weighted = 0;
  for (const term of termResults) {
    const pct = calculatePercentage(term.obtained, term.fullMarks);
    weighted += pct * (term.weightage / 100);
  }
  return weighted;
}

/**
 * Calculate overall GPA from an array of subject GPAs.
 *
 * Every band in GRADING_SCALE now carries a grade point, so in practice no
 * subject is skipped. The null handling is kept as a guard for callers that
 * pass an ungraded subject through; if nothing is graded there is no GPA.
 */
export function calculateOverallGpa(subjectGpas: (number | null)[]): number | null {
  const graded = subjectGpas.filter((gpa): gpa is number => gpa !== null);
  if (graded.length === 0) return null;
  const sum = graded.reduce((acc, gpa) => acc + gpa, 0);
  return parseFloat((sum / graded.length).toFixed(2));
}

/**
 * Calculate overall GPA weighted by each subject's credit hour.
 * Used only by the credit-hour/grade-point report style
 * (ReportCardSettings.gradingStyle === "CREDIT_GRADE_BASED"). Same
 * null-handling convention as calculateOverallGpa above.
 */
export function calculateOverallGpaWeighted(
  subjects: { gpa: number | null; creditHour: number }[]
): number | null {
  const graded = subjects.filter(
    (s): s is { gpa: number; creditHour: number } => s.gpa !== null && s.creditHour > 0
  );
  if (graded.length === 0) return null;
  const totalCreditHours = graded.reduce((acc, s) => acc + s.creditHour, 0);
  if (totalCreditHours === 0) return null;
  const weightedSum = graded.reduce((acc, s) => acc + s.gpa * s.creditHour, 0);
  return parseFloat((weightedSum / totalCreditHours).toFixed(2));
}

/**
 * Check if a student has passed a subject
 * Pass requires: total marks >= passMarks
 */
export function hasPassed(totalMarks: number, passMarks: number): boolean {
  return totalMarks >= passMarks;
}
