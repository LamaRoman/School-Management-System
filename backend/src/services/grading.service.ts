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
 * grade point, the lowest being E at 0.8, so no subject is ever excluded from a
 * GPA average. (Previously an NG subject had a null grade point and was
 * skipped, which quietly inflated the average of a struggling student.)
 *
 * There is no pass / fail and no rank: a report card shows grades, grade
 * points and the credit-weighted GPA. An absent paper prints "Ab", not E.
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
 * Overall GPA, weighted by each subject's credit hour — the report card's Grade Points
 * Average. Every band in GRADING_SCALE carries a grade point, so in practice no subject is
 * skipped; the null handling guards callers that pass an ungraded subject through. If
 * nothing is graded there is no GPA.
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
