/**
 * Grade sheet → .xlsx (W4)
 *
 * The sheet is already fully computed on the client — the same `rows`/`subjects`
 * structure that feeds `printGradeSheet` — so this needs no backend route. It
 * mirrors what is on screen exactly: same columns, same order, same "Ab" for
 * absent and "—" for a mark never entered, same red for below-pass.
 *
 * The one thing it does that the printed sheet cannot: **marks are written as
 * numbers, not text.** That is the entire point of wanting Excel rather than a
 * PDF — a teacher can sort by a column, average one, or paste a block into
 * whatever the district asks for this year. Writing "72" as a string would look
 * identical on screen and be useless for all of it.
 *
 * `exceljs` rather than SheetJS: npm's `xlsx` is frozen at 0.18.5 (SheetJS
 * distributes current builds from their own CDN), while exceljs 4.4.0 is the
 * live release. It is imported dynamically so it lands in its own chunk and
 * only downloads when someone actually clicks Excel — the pattern F8 wants for
 * the print helpers too.
 */

export interface SubjectHeader { id: string; name: string; fullMarks: number; passMarks: number }
export interface SubjectResult {
  subjectId: string;
  obtained?: number;
  weightedPercentage?: number;
  grade: string;
  gpa: number | null;
  passed: boolean;
  isAbsent?: boolean;
}
export interface GradeSheetRow {
  studentId: string;
  studentName: string;
  rollNo: number | null;
  subjects: SubjectResult[];
  totalObtained?: number;
  totalFullMarks?: number;
  percentage: number;
  gpa: number | null;
  grade: string;
  rank: number;
}
export interface SheetData {
  gradeName: string;
  sectionName: string;
  examType: string;
  isFinal: boolean;
  showRank: boolean;
  subjects: SubjectHeader[];
  rows: GradeSheetRow[];
  totalStudents: number;
}

const PRIMARY = "FF1E3A5F";
const ACCENT = "FFB8860B";
const FAIL = "FFC0392B";

/** "Ab" and "—" are deliberately strings; everything else stays a number. */
function subjectCell(s: SubjectResult, isFinal: boolean): number | string {
  if (s.isAbsent) return "Ab";
  const value = isFinal ? s.weightedPercentage : s.obtained;
  return value ?? "—";
}

/**
 * Builds the workbook and returns the .xlsx bytes.
 *
 * Split from the download below so the part with all the logic in it can be
 * exercised without a browser — `document` and `Blob` live on the other side of
 * this line, and nothing else does.
 */
export async function buildGradeSheetWorkbook(data: SheetData): Promise<ArrayBuffer> {
  // exceljs ships as CommonJS, so a dynamic import can hand back either the
  // module itself or a namespace object with it under `default`, depending on
  // the bundler and the runtime. Reaching straight for `.Workbook` works in one
  // and throws "not a constructor" in the other.
  const mod = await import("exceljs");
  const ExcelJS = ((mod as unknown as { default?: typeof import("exceljs") }).default ??
    mod) as typeof import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zentara Shikshya";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(`${data.gradeName}-${data.sectionName}`.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 4, xSplit: data.showRank ? 3 : 2 }],
  });

  const leading = data.showRank ? ["Rank", "Roll", "Student Name"] : ["Roll", "Student Name"];
  const trailing = ["%", "GPA", "Grade"];
  const width = leading.length + data.subjects.length + trailing.length;

  // ── Title block ────────────────────────────────────────────────────────────
  sheet.mergeCells(1, 1, 1, width);
  const title = sheet.getCell(1, 1);
  title.value = `${data.gradeName} — Section ${data.sectionName}`;
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: "center" };

  sheet.mergeCells(2, 1, 2, width);
  const subtitle = sheet.getCell(2, 1);
  subtitle.value = `${data.examType} · ${data.totalStudents} students`;
  subtitle.font = { size: 11, color: { argb: "FF666666" } };
  subtitle.alignment = { horizontal: "center" };

  // ── Header rows ────────────────────────────────────────────────────────────
  // Two rows: subject name above its full marks, so the full-marks figure is
  // legible without turning every mark column into text.
  const headerRow = sheet.addRow([...leading, ...data.subjects.map((s) => s.name), ...trailing]);
  const fullMarksRow = sheet.addRow([
    ...leading.map(() => ""),
    ...data.subjects.map((s) => `(${s.fullMarks})`),
    ...trailing.map(() => ""),
  ]);

  for (const row of [headerRow, fullMarksRow]) {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const isTrailing = col > leading.length + data.subjects.length;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isTrailing ? ACCENT : PRIMARY },
      };
      cell.font = { bold: row === headerRow, color: { argb: "FFFFFFFF" }, size: row === headerRow ? 11 : 9 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
  }
  // Merge each leading header down over the full-marks row — they have no
  // full-marks figure and a floating empty cell reads as a mistake.
  for (let col = 1; col <= leading.length; col++) {
    sheet.mergeCells(headerRow.number, col, fullMarksRow.number, col);
  }
  for (let col = leading.length + data.subjects.length + 1; col <= width; col++) {
    sheet.mergeCells(headerRow.number, col, fullMarksRow.number, col);
  }

  // ── Student rows ───────────────────────────────────────────────────────────
  for (const row of data.rows) {
    const values: (string | number | null)[] = [
      ...(data.showRank ? [row.rank] : []),
      row.rollNo ?? "—",
      row.studentName,
      ...row.subjects.map((s) => subjectCell(s, data.isFinal)),
      row.percentage,
      row.gpa ?? "—",
      row.grade,
    ];
    const added = sheet.addRow(values);

    added.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = { top: { style: "hair" }, left: { style: "hair" }, bottom: { style: "hair" }, right: { style: "hair" } };
      // Student name left-aligned, everything else centred — matches the table.
      cell.alignment = { horizontal: col === leading.length ? "left" : "center" };
    });

    // Below-pass subjects in red, the same signal the on-screen legend explains.
    row.subjects.forEach((s, i) => {
      if (!s.passed) {
        const cell = added.getCell(leading.length + 1 + i);
        cell.font = { color: { argb: FAIL }, bold: true };
      }
    });
  }

  // ── Column widths ──────────────────────────────────────────────────────────
  sheet.columns.forEach((column, i) => {
    if (i === leading.length - 1) column.width = 24;        // student name
    else if (i < leading.length) column.width = 7;          // rank / roll
    else column.width = 11;
  });

  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export function gradeSheetFilename(data: SheetData): string {
  return `${data.gradeName}-${data.sectionName}_${data.examType}`
    .replace(/[^a-z0-9\-_]+/gi, "_")
    .replace(/_+/g, "_");
}

export async function exportGradeSheetToExcel(data: SheetData): Promise<void> {
  const buffer = await buildGradeSheetWorkbook(data);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${gradeSheetFilename(data)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoked on the next tick — revoking synchronously can cancel the download
  // in some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
