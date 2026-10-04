/**
 * What the printed report card says about a student's standing: grades, grade points and the
 * credit-weighted Grade Points Average — no pass / fail, no rank, no pass marks. An absent
 * paper prints "Ab" (never the E it is scored as), and while any paper is absent or not yet
 * entered the GPA prints "—". Pure HTML build — no database, no browser.
 */

import { buildReportCardHtml, defaultColumnSettings } from "../../services/pdf.service";

const subject = (name: string, finalGrade: string, gradePoint: number, extra: Record<string, unknown> = {}) => ({
  subjectName: name, creditHour: 4, theoryGrade: finalGrade, practicalGrade: null,
  finalGrade, gradePoint, isAbsent: false, notEntered: false, ...extra,
});

const card = (subjects: any[], overallGpa: number) => ({
  school: { name: "Result Test School" },
  student: { name: "Aasha", className: "III", section: "A", rollNo: 1 },
  academicYear: "2083", examType: "First Terminal", paperSize: "A5",
  isTermReport: true, overallGpa, subjects,
});

const rowOf = (html: string, name: string) =>
  html.slice(html.indexOf(`>${name}<`), html.indexOf("</tr>", html.indexOf(`>${name}<`)));
const summaryCell = (html: string, label: string) =>
  html.match(new RegExp(`${label}: <b[^>]*>([^<]*)<`))?.[1];

it("an absent subject's row says Ab, not E / 0.8, and the GPA is blank", () => {
  const html = buildReportCardHtml(card([
    subject("Nepali", "E", 0.8, { isAbsent: true }),
    subject("English", "B", 2.8),
  ], 1.8), "color");
  const row = rowOf(html, "Nepali");
  expect(row).toContain(">Ab<");
  expect(row).not.toContain(">E<");
  expect(row).not.toContain(">0.8<");
  expect(rowOf(html, "English")).toContain(">2.8<");
  expect(summaryCell(html, "Grade Points Average")).toBe("—");
});

it("a not-yet-entered subject prints — and also blanks the GPA", () => {
  const html = buildReportCardHtml(card([
    subject("Nepali", "E", 0.8, { notEntered: true }),
    subject("English", "B", 2.8),
  ], 1.8), "color");
  expect(rowOf(html, "Nepali")).not.toContain(">Ab<");
  expect(summaryCell(html, "Grade Points Average")).toBe("—");
});

it("a complete card prints its GPA, even with an E — there is no pass / fail", () => {
  const html = buildReportCardHtml(card([subject("English", "E", 0.8), subject("Nepali", "B", 2.8)], 1.8), "color");
  expect(summaryCell(html, "Grade Points Average")).toBe("1.8");
  expect(html).not.toContain(">Result<");
  for (const gone of ["Pass", "Fail", "Incomplete", "Rank", "Pass Marks"]) expect(html).not.toContain(gone);
});

describe("attendance on the summary line, as on the school's printed sheet", () => {
  const complete = () => card([subject("English", "B", 2.8)], 2.8);

  it("prints present / total next to the GPA", () => {
    const html = buildReportCardHtml({ ...complete(), attendance: { presentDays: 54, totalDays: 58 } }, "color");
    expect(summaryCell(html, "Attendance")).toBe("54/58");
    expect(summaryCell(html, "Grade Points Average")).toBe("2.8");
  });

  it("leaves it off when no attendance was taken, or the school turned it off", () => {
    expect(buildReportCardHtml(complete(), "color")).not.toContain("Attendance:");
    const off = buildReportCardHtml(
      { ...complete(), attendance: { presentDays: 54, totalDays: 58 } }, "color",
      { ...defaultColumnSettings, showAttendance: false },
    );
    expect(off).not.toContain("Attendance:");
  });
});
