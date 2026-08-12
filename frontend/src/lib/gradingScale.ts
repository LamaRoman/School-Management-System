/**
 * Grading scale, matching the school's printed grade sheet.
 * Mirrors backend/src/services/grading.service.ts — keep both in sync.
 *
 * There is no NG / Non-Graded band: every interval down to 0% carries a grade
 * point, the lowest being E at 0.8. "Fail" therefore cannot be derived from an
 * NG grade and is expressed through isPassingGrade below.
 */
export const GRADING_SCALE = [
  { grade: "A+", range: "90% to 100%", description: "Outstanding", gpa: "4.0" },
  { grade: "A", range: "80% to Below 90%", description: "Excellent", gpa: "3.6" },
  { grade: "B+", range: "70% to Below 80%", description: "Very Good", gpa: "3.2" },
  { grade: "B", range: "60% to Below 70%", description: "Good", gpa: "2.8" },
  { grade: "C+", range: "50% to Below 60%", description: "Satisfactory", gpa: "2.4" },
  { grade: "C", range: "40% to Below 50%", description: "Acceptable", gpa: "2.0" },
  { grade: "D+", range: "30% to Below 40%", description: "Partially Acceptable", gpa: "1.6" },
  { grade: "D", range: "20% to Below 30%", description: "Insufficient", gpa: "1.2" },
  { grade: "E", range: "0 to Below 20%", description: "Very Insufficient", gpa: "0.8" },
];

/**
 * Grades that count as a fail — the two bands the scale itself calls
 * Insufficient and Very Insufficient. D+ ("Partially Acceptable") and above
 * pass. Must match FAILING_GRADES in the backend's grading.service.
 */
export const FAILING_GRADES = ["D", "E"];

export function isPassingGrade(grade: string): boolean {
  return !FAILING_GRADES.includes(grade);
}
