/**
 * Nepal CDC Grading System (official SEE-style scale)
 * This is the SINGLE SOURCE OF TRUTH for all grade/GPA calculations.
 * Never duplicate this logic elsewhere.
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

export const GRADING_SCALE: GradingScaleEntry[] = [
  { min: 90, grade: "A+", gpa: 4.0, description: "Outstanding", range: "90-100%" },
  { min: 80, grade: "A", gpa: 3.6, description: "Excellent", range: "80-89%" },
  { min: 70, grade: "B+", gpa: 3.2, description: "Very Good", range: "70-79%" },
  { min: 60, grade: "B", gpa: 2.8, description: "Good", range: "60-69%" },
  { min: 50, grade: "C+", gpa: 2.4, description: "Satisfactory", range: "50-59%" },
  { min: 40, grade: "C", gpa: 2.0, description: "Acceptable", range: "40-49%" },
  { min: 35, grade: "D", gpa: 1.6, description: "Basic", range: "35-39%" },
  { min: 0, grade: "NG", gpa: null, description: "Non-Graded (Unclassified)", range: "Below 35%" },
];

/**
 * Get grade and GPA from a percentage value.
 * NG (below 35%) has no grade point, per the official scale.
 */
export function getGradeFromPercentage(percentage: number): GradeResult {
  const clamped = Math.max(0, Math.min(100, percentage));
  for (const entry of GRADING_SCALE) {
    if (clamped >= entry.min) {
      return { grade: entry.grade, gpa: entry.gpa, description: entry.description };
    }
  }
  return { grade: "NG", gpa: null, description: "Non-Graded (Unclassified)" };
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
 * Subjects graded NG (gpa === null) carry no grade point and are excluded
 * from the average. If every subject is NG, there is no overall GPA.
 */
export function calculateOverallGpa(subjectGpas: (number | null)[]): number | null {
  const graded = subjectGpas.filter((gpa): gpa is number => gpa !== null);
  if (graded.length === 0) return null;
  const sum = graded.reduce((acc, gpa) => acc + gpa, 0);
  return parseFloat((sum / graded.length).toFixed(2));
}

/**
 * Check if a student has passed a subject
 * Pass requires: total marks >= passMarks
 */
export function hasPassed(totalMarks: number, passMarks: number): boolean {
  return totalMarks >= passMarks;
}
