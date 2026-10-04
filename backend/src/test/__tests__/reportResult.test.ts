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

describe("an absent subject on the printed card", () => {
  const absentNepali = subject("Nepali", 0, { isAbsent: true, hasPassed: false, grade: "E", gpa: 0.8, percentage: 0 });

  it("marks-based: Obtained says Ab, grade/GPA show the E / 0.8 it counts as, never NG", () => {
    const html = buildReportCardHtml(card([subject("English", 25), absentNepali]), "color");
    const row = html.slice(html.indexOf(">Nepali<"), html.indexOf("</tr>", html.indexOf(">Nepali<")));
    expect(row).toContain(">Ab<");
    expect(row).toContain(">E<");
    expect(row).toContain(">0.8<");
    expect(html).not.toContain("NG");
    expect(html).not.toContain("Not Graded");
  });

  it("credit-grade: Theory grade says Ab, Final Grade / Grade Point show E / 0.8, never NG", () => {
    const html = buildReportCardHtml({
      ...card([]), gradingStyle: "CREDIT_GRADE_BASED", hasPracticalSubjects: true, overallGpa: 2,
      subjects: [
        { subjectName: "Nepali", creditHour: 4, theoryGrade: "E", practicalGrade: "E", finalGrade: "E", gradePoint: 0.8, isAbsent: true, notEntered: false },
        { subjectName: "English", creditHour: 4, theoryGrade: "B", practicalGrade: "A", finalGrade: "B+", gradePoint: 3.2, isAbsent: false, notEntered: false },
      ],
    }, "color");
    const row = html.slice(html.indexOf(">Nepali<"), html.indexOf("</tr>", html.indexOf(">Nepali<")));
    expect(row).toContain(">Ab<");
    expect(row).toContain(">E<");
    expect(row).toContain(">0.8<");
    expect(html).not.toContain("Not Graded");
  });
});

it("credit-grade with no practical columns still shows the absence, beside the E it counts as", () => {
  const html = buildReportCardHtml({
    ...card([]), gradingStyle: "CREDIT_GRADE_BASED", hasPracticalSubjects: false, overallGpa: 2,
    subjects: [
      { subjectName: "Nepali", creditHour: 4, theoryGrade: "E", practicalGrade: null, finalGrade: "E", gradePoint: 0.8, isAbsent: true, notEntered: false },
      { subjectName: "English", creditHour: 4, theoryGrade: "B", practicalGrade: null, finalGrade: "B", gradePoint: 2.8, isAbsent: false, notEntered: false },
    ],
  }, "color");
  const row = (name: string) => html.slice(html.indexOf(`>${name}<`), html.indexOf("</tr>", html.indexOf(`>${name}<`)));
  expect(row("Nepali")).toContain(">E (Ab)<");
  expect(row("Nepali")).toContain(">0.8<");
  expect(row("English")).not.toContain("Ab");
});
