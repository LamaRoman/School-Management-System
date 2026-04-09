// ─── Shared Print Utilities ─────────────────────────────────────────────────
// Industry-standard: opens a clean window with only printable content.
// No sidebar, no layout chrome — just the document.

import { api } from "./api";

// ─── Core ───────────────────────────────────────────────────────────────────

export function openPrintWindow(html: string) {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow popups to print.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.onload = () => win.print();
}

// ─── Shared base styles ─────────────────────────────────────────────────────

const baseStyles = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #222; line-height: 1.4; max-width: 800px; margin: 0 auto; padding: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; font-size: 12px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .bold { font-weight: 700; }
  .muted { color: #777; }
  .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 16px; }
  .header h1 { font-size: 16px; margin-bottom: 2px; }
  .header h2 { font-size: 13px; font-weight: 400; color: #555; margin-bottom: 2px; }
  .header p { font-size: 10px; color: #777; }
  .title { text-align: center; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 12px 0 4px; }
  .subtitle { text-align: center; font-size: 12px; color: #555; margin-bottom: 16px; }
  .footer { text-align: center; margin-top: 30px; font-size: 9px; color: #999; }
  .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
  .sig { text-align: center; font-size: 10px; }
  .sig-line { width: 100px; border-top: 1px solid #555; margin: 0 auto 3px; }
  .page-break { page-break-before: always; }
  @page { size: A4; margin: 15mm; }
`;

// ─── School info fetcher (cached) ───────────────────────────────────────────

let cachedSchool: any = null;

export async function getSchoolInfo(): Promise<{ name: string; nameNp: string; address: string; phone: string }> {
  if (cachedSchool) return cachedSchool;
  try {
    cachedSchool = await api.get<any>("/school");
  } catch {
    cachedSchool = { name: "School", nameNp: "", address: "", phone: "" };
  }
  return cachedSchool;
}

function schoolHeaderHtml(school: any): string {
  const phoneLine = school.phone ? ` • ${school.phone}` : "";
  const nepaliLine = school.nameNp ? `<h2>${school.nameNp}</h2>` : "";
  return `
    <div class="header">
      <h1>${school.name || "School"}</h1>
      ${nepaliLine}
      <p>${school.address || ""}${phoneLine}</p>
    </div>
  `;
}

// ─── Exam Seating Print ─────────────────────────────────────────────────────

interface SeatingStudent {
  id: string;
  name: string;
  className: string;
  section: string;
  rollNo?: number;
  seatNumber?: number;
}

interface SeatingAllocation {
  room: { id: string; name: string; capacity: number };
  students: SeatingStudent[];
  filled: number;
}

export async function printSeatingArrangement(
  allocations: SeatingAllocation[],
  examName: string,
) {
  const school = await getSchoolInfo();
  const totalStudents = allocations.reduce((s, a) => s + a.filled, 0);

  const roomsHtml = allocations.map((alloc, idx) => {
    const rows = alloc.students.map((stu, i) =>
      `<tr>
        <td class="text-center">${stu.seatNumber || i + 1}</td>
        <td class="bold">${stu.name}</td>
        <td>${stu.className}</td>
        <td>${stu.section}</td>
        <td class="text-center">${stu.rollNo || "—"}</td>
      </tr>`
    ).join("");

    return `
      ${idx > 0 ? '<div class="page-break"></div>' : ""}
      <div style="margin-bottom: 24px;">
        <div style="background: #1a3a5c; color: white; padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; border-radius: 4px 4px 0 0;">
          <span style="font-weight: 600; font-size: 13px;">${alloc.room.name}</span>
          <span style="font-size: 11px; opacity: 0.8;">${alloc.filled} / ${alloc.room.capacity} seats</span>
        </div>
        <table>
          <thead><tr><th class="text-center" style="width:60px">Seat</th><th>Student Name</th><th>Class</th><th>Section</th><th class="text-center" style="width:70px">Roll No.</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Seating — ${examName}</title>
<style>${baseStyles}</style></head><body>
${schoolHeaderHtml(school)}
<div class="title">${examName} — Exam Seating Arrangement</div>
<div class="subtitle">Total Students: ${totalStudents} · ${allocations.length} Rooms</div>
${roomsHtml}
<div class="signatures">
  <div class="sig"><div class="sig-line"></div>Exam Coordinator</div>
  <div class="sig"><div class="sig-line"></div>Principal</div>
</div>
<div class="footer">Computer generated document</div>
</body></html>`;

  openPrintWindow(html);
}

// ─── Exam Routine Print ─────────────────────────────────────────────────────

interface RoutineEntry {
  id: string;
  examDate: string;
  dayName?: string;
  startTime?: string;
  endTime?: string;
  subject: { name: string };
}

export async function printExamRoutine(
  entries: RoutineEntry[],
  examName: string,
  gradeName: string,
) {
  const school = await getSchoolInfo();

  const rows = entries.map((e, i) =>
    `<tr>
      <td class="text-center">${i + 1}</td>
      <td class="bold">${e.subject.name}</td>
      <td>${e.examDate}</td>
      <td class="muted">${e.dayName || "—"}</td>
      <td>${e.startTime || "—"}</td>
      <td>${e.endTime || "—"}</td>
    </tr>`
  ).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Exam Routine — ${examName} — ${gradeName}</title>
<style>${baseStyles}</style></head><body>
${schoolHeaderHtml(school)}
<div class="title">${examName} — Exam Routine</div>
<div class="subtitle">Class: ${gradeName}</div>
<table>
  <thead><tr><th class="text-center" style="width:40px">SN</th><th>Subject</th><th>Date (BS)</th><th>Day</th><th>Start Time</th><th>End Time</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="signatures">
  <div class="sig"><div class="sig-line"></div>Exam Coordinator</div>
  <div class="sig"><div class="sig-line"></div>Principal</div>
</div>
<div class="footer">Computer generated document</div>
</body></html>`;

  openPrintWindow(html);
}

// ─── Grade Sheet Print ──────────────────────────────────────────────────────

interface GradeSheetSubject { id: string; name: string; fullMarks: number }
interface GradeSheetSubjectResult { subjectId: string; obtained?: number; weightedPercentage?: number; grade: string; gpa: number; passed: boolean }
interface GradeSheetRow {
  studentId: string; studentName: string; rollNo: number | null;
  subjects: GradeSheetSubjectResult[];
  percentage: number; gpa: number; grade: string; rank: number;
}

export async function printGradeSheet(data: {
  gradeName: string; sectionName: string; examType: string; showRank: boolean;
  subjects: GradeSheetSubject[]; rows: GradeSheetRow[]; totalStudents: number;
}) {
  const school = await getSchoolInfo();
  const isFinal = data.examType?.includes("Final");

  const subjectHeaders = data.subjects.map(s =>
    `<th class="text-center" style="min-width:50px"><div>${s.name}</div><div style="font-size:9px;font-weight:normal;opacity:0.7">(${s.fullMarks})</div></th>`
  ).join("");

  const bodyRows = data.rows.map((row, i) => {
    const subjectCells = row.subjects.map(s => {
      const value = isFinal ? s.weightedPercentage : s.obtained;
      const style = !s.passed ? 'color:#dc2626;font-weight:700' : '';
      return `<td class="text-center" style="${style}">${value ?? "—"}</td>`;
    }).join("");

    return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9f9f9'}">
      ${data.showRank ? `<td class="text-center bold">${row.rank}</td>` : ""}
      <td class="text-center muted">${row.rollNo || "—"}</td>
      <td class="bold">${row.studentName}</td>
      ${subjectCells}
      <td class="text-center bold" style="color:#c8102e">${row.percentage}</td>
      <td class="text-center bold">${row.gpa}</td>
      <td class="text-center bold" style="color:#1a3a5c">${row.grade}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Grade Sheet — ${data.gradeName} ${data.sectionName} — ${data.examType}</title>
<style>
  ${baseStyles}
  @page { size: A4 landscape; margin: 10mm; }
  body { max-width: 100%; }
  table { font-size: 10px; }
  th, td { padding: 4px 6px; }
</style></head><body>
${schoolHeaderHtml(school)}
<div class="title">${data.examType} — Grade Sheet</div>
<div class="subtitle">${data.gradeName} — Section ${data.sectionName} · ${data.totalStudents} Students</div>
<table>
  <thead><tr style="background:#1a3a5c;color:white">
    ${data.showRank ? '<th class="text-center" style="width:40px;border-color:#1a3a5c">Rank</th>' : ""}
    <th class="text-center" style="width:40px;border-color:#1a3a5c">Roll</th>
    <th style="min-width:120px;border-color:#1a3a5c">Student Name</th>
    ${subjectHeaders}
    <th class="text-center" style="background:#c8102e;border-color:#c8102e;min-width:40px">%</th>
    <th class="text-center" style="background:#c8102e;border-color:#c8102e;min-width:40px">GPA</th>
    <th class="text-center" style="background:#c8102e;border-color:#c8102e;min-width:45px">Grade</th>
  </tr></thead>
  <tbody>${bodyRows}</tbody>
</table>
<div style="margin-top:8px;font-size:9px;color:#999"><span style="color:#dc2626;font-weight:700">Red</span> = below pass marks${isFinal ? " · Values show weighted percentage per subject" : ""}</div>
<div class="signatures">
  <div class="sig"><div class="sig-line"></div>Class Teacher</div>
  <div class="sig"><div class="sig-line"></div>Exam Coordinator</div>
  <div class="sig"><div class="sig-line"></div>Principal</div>
</div>
<div class="footer">Computer generated document</div>
</body></html>`;

  openPrintWindow(html);
}
