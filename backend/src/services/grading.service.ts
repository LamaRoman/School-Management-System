/**
 * Nepal CDC Grading System
 * This is the SINGLE SOURCE OF TRUTH for all grade/GPA calculations.
 * Never duplicate this logic elsewhere.
 */

export interface GradeResult {
  grade: string;
  gpa: number;
  description: string;
}

const GRADING_SCALE: { min: number; grade: string; gpa: number; description: string }[] = [
  { min: 90, grade: "A+", gpa: 4.0, description: "Outstanding" },
  { min: 80, grade: "A", gpa: 3.6, description: "Excellent" },
  { min: 70, grade: "B+", gpa: 3.2, description: "Very Good" },
  { min: 60, grade: "B", gpa: 2.8, description: "Good" },
  { min: 50, grade: "C+", gpa: 2.4, description: "Satisfactory" },
  { min: 40, grade: "C", gpa: 2.0, description: "Acceptable" },
  { min: 30, grade: "D+", gpa: 1.6, description: "Partially Acceptable" },
  { min: 20, grade: "D", gpa: 1.2, description: "Insufficient" },
  { min: 0, grade: "E", gpa: 0.8, description: "Very Insufficient" },
];

/**
 * Get grade and GPA from a percentage value
 */
export function getGradeFromPercentage(percentage: number): GradeResult {
  const clamped = Math.max(0, Math.min(100, percentage));
  for (const entry of GRADING_SCALE) {
    if (clamped >= entry.min) {
      return { grade: entry.grade, gpa: entry.gpa, description: entry.description };
    }
  }
  return { grade: "E", gpa: 0.8, description: "Very Insufficient" };
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
 * Calculate overall GPA from an array of subject GPAs
 */
export function calculateOverallGpa(subjectGpas: number[]): number {
  if (subjectGpas.length === 0) return 0;
  const sum = subjectGpas.reduce((acc, gpa) => acc + gpa, 0);
  return parseFloat((sum / subjectGpas.length).toFixed(2));
}

/**
 * Check if a student has passed a subject
 * Pass requires: total marks >= passMarks
 */
export function hasPassed(totalMarks: number, passMarks: number): boolean {
  return totalMarks >= passMarks;
}

/**
 * Get the full grading scale (for display purposes)
 */
export function getGradingScale() {
  return GRADING_SCALE.map((entry) => ({
    range: entry.min === 0 ? "Below 20" : `${entry.min} – ${entry.min + 9 >= 100 ? 100 : entry.min + 9}`,
    ...entry,
  }));
}
