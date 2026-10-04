/**
 * The "Result" printed on a marks-based report card follows the school's strict rule:
 * Pass only if every subject reaches its pass mark (see overallResult in grading.service).
 * Pure HTML build — no database, no browser.
 */

import { buildReportCardHtml } from "../../services/pdf.service";

const subject = (name: string, total: number, extra: Record<string, unknown> = {}) => ({
  subjectName: name, fullMarks: 50, passMarks: 20, theoryMarks: total, practicalMarks: 0,
  totalMarks: total, percentage: (total / 50) * 100, grade: "C", gpa: 2,
  hasPassed: total >= 20, isAbsent: false, notEntered: false, ...extra,
});

const card = (subjects: any[]) => ({
  school: { name: "Result Test School" },
  student: { name: "Aasha", className: "III", section: "A", rollNo: 1 },
  academicYear: "2083", examType: "First Terminal", paperSize: "A5",
  isTermReport: true, gradingStyle: "MARKS_BASED", hasPracticalSubjects: false,
  overallPercentage: 46.7, overallGpa: 2.06, overallGrade: "C", subjects,
});

const printedResult = (html: string) =>
  html.match(/>Result<\/td><td[^>]*>([^<]*)</)?.[1];

it("prints Fail when one subject is below its pass mark, even at an overall C", () => {
  const html = buildReportCardHtml(card([subject("English", 19.5), subject("Nepali", 43)]), "color");
  expect(printedResult(html)).toBe("Fail");
});

it("prints Pass when every subject reaches its pass mark", () => {
  const html = buildReportCardHtml(card([subject("English", 20), subject("Nepali", 43)]), "color");
  expect(printedResult(html)).toBe("Pass");
});

it("prints Incomplete when a subject is absent", () => {
  const html = buildReportCardHtml(
    card([subject("English", 25), subject("Nepali", 0, { isAbsent: true, hasPassed: false })]), "color");
  expect(printedResult(html)).toBe("Incomplete");
});
