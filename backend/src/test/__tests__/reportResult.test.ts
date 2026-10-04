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

describe("an absent subject on the printed card (no grade point for a paper not sat)", () => {
  const absentNepali = subject("Nepali", 0, { isAbsent: true, hasPassed: false, grade: "E", gpa: 0.8, percentage: 0 });
  const rowOf = (html: string, name: string) =>
    html.slice(html.indexOf(`>${name}<`), html.indexOf("</tr>", html.indexOf(`>${name}<`)));
  const resultCell = (html: string, label: string) =>
    html.match(new RegExp(`>${label}</td><td[^>]*>([^<]*)<`))?.[1];

  it("marks-based: the row says Ab, not E / 0.8, and the overall figures are blank", () => {
    const html = buildReportCardHtml(card([subject("English", 25), absentNepali]), "color");
    const row = rowOf(html, "Nepali");
    expect(row).toContain(">Ab<");
    expect(row).not.toContain(">E<");
    expect(row).not.toContain(">0.8<");
    for (const label of ["Percentage", "Description", "GPA"]) expect(resultCell(html, label)).toBe("—");
    expect(resultCell(html, "Result")).toBe("Incomplete");
    expect(html).not.toContain("Not Graded");
  });

  it("credit-grade: the row says Ab and the Grade Points Average is blank", () => {
    const html = buildReportCardHtml({
      ...card([]), gradingStyle: "CREDIT_GRADE_BASED", hasPracticalSubjects: false, overallGpa: 1.57,
      subjects: [
        { subjectName: "Nepali", creditHour: 4, theoryGrade: "E", practicalGrade: null, finalGrade: "E", gradePoint: 0.8, isAbsent: true, notEntered: false },
        { subjectName: "English", creditHour: 4, theoryGrade: "B", practicalGrade: null, finalGrade: "B", gradePoint: 2.8, isAbsent: false, notEntered: false },
      ],
    }, "color");
    const row = rowOf(html, "Nepali");
    expect(row).toContain(">Ab<");
    expect(row).not.toContain(">0.8<");
    expect(rowOf(html, "English")).toContain(">2.8<");
    expect(resultCell(html, "Grade Points Average")).toBe("—");
    expect(resultCell(html, "Result")).toBe("Incomplete");
  });

  it("a complete card still prints its figures", () => {
    const html = buildReportCardHtml(card([subject("English", 25), subject("Nepali", 43)]), "color");
    expect(resultCell(html, "Percentage")).toBe("46.7%");
    expect(resultCell(html, "GPA")).toBe("2.06");
  });
});

it("credit-hour card: a subject below its pass mark fails the student even at grade D+", () => {
  const html = buildReportCardHtml({
    ...card([]), gradingStyle: "CREDIT_GRADE_BASED", hasPracticalSubjects: false, overallGpa: 2.2,
    subjects: [
      // 17/50 = 34% → D+ (a pass by grade alone) but below the 20/50 pass mark.
      { subjectName: "English", creditHour: 4, theoryGrade: "D+", practicalGrade: null, finalGrade: "D+", gradePoint: 1.6, hasPassed: false, isAbsent: false, notEntered: false },
      { subjectName: "Nepali", creditHour: 4, theoryGrade: "B", practicalGrade: null, finalGrade: "B", gradePoint: 2.8, hasPassed: true, isAbsent: false, notEntered: false },
    ],
  }, "color");
  expect(html.match(/>Result<\/td><td[^>]*>([^<]*)</)?.[1]).toBe("Fail");
});
