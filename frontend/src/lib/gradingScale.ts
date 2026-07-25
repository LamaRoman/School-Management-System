/**
 * Nepal CDC Grading System (official SEE-style scale).
 * Mirrors backend/src/services/grading.service.ts — keep both in sync.
 */
export const GRADING_SCALE = [
  { grade: "A+", range: "90-100%", description: "Outstanding", gpa: "4.0" },
  { grade: "A", range: "80-89%", description: "Excellent", gpa: "3.6" },
  { grade: "B+", range: "70-79%", description: "Very Good", gpa: "3.2" },
  { grade: "B", range: "60-69%", description: "Good", gpa: "2.8" },
  { grade: "C+", range: "50-59%", description: "Satisfactory", gpa: "2.4" },
  { grade: "C", range: "40-49%", description: "Acceptable", gpa: "2.0" },
  { grade: "D", range: "35-39%", description: "Basic", gpa: "1.6" },
  { grade: "NG", range: "Below 35%", description: "Non-Graded (Unclassified)", gpa: "—" },
];
