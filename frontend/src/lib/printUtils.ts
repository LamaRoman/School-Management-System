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
  /* Force browsers to reproduce our exact background/text colors when printing
     instead of the default "economy" mode, which strips colored backgrounds
     (e.g. the navy table header) and dulls white text to grey. */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
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

// ─── School info + header settings fetchers (cached) ────────────────────────

let cachedSchool: any = null;
let cachedHeaderSettings: HeaderSettings | null = null;

interface HeaderSettings {
  logoPosition: "left" | "center" | "center-inline" | "right";
  logoSize: "small" | "medium" | "large";
  showNepaliName: boolean;
}

const DEFAULT_HEADER_SETTINGS: HeaderSettings = {
  logoPosition: "center",
  logoSize: "medium",
  showNepaliName: false,
};

export async function getSchoolInfo(): Promise<{ name: string; nameNp: string; address: string; phone: string; logo?: string | null }> {
  if (cachedSchool) return cachedSchool;
  try {
    cachedSchool = await api.get<any>("/school");
  } catch {
    cachedSchool = { name: "School", nameNp: "", address: "", phone: "", logo: null };
  }
  return cachedSchool;
}

// Header logo/name presentation is configured per-school in Report Card Settings.
// Printed documents mirror the same header so their branding matches the report card.
export async function getHeaderSettings(): Promise<HeaderSettings> {
  if (cachedHeaderSettings) return cachedHeaderSettings;
  try {
    const s = await api.get<Partial<HeaderSettings>>("/report-card-settings");
    cachedHeaderSettings = { ...DEFAULT_HEADER_SETTINGS, ...s };
  } catch {
    cachedHeaderSettings = DEFAULT_HEADER_SETTINGS;
  }
  return cachedHeaderSettings;
}

const LOGO_SIZE_PX: Record<string, number> = { small: 36, medium: 56, large: 75 };

function schoolHeaderHtml(school: any, settings: HeaderSettings = DEFAULT_HEADER_SETTINGS): string {
  const phoneLine = school.phone ? ` • ${school.phone}` : "";
  const nepaliLine = settings.showNepaliName && school.nameNp ? `<h2>${school.nameNp}</h2>` : "";
  const nameBlock = `<h1>${school.name || "School"}</h1>${nepaliLine}<p>${school.address || ""}${phoneLine}</p>`;

  if (!school.logo) {
    return `<div class="header">${nameBlock}</div>`;
  }

  const sizePx = LOGO_SIZE_PX[settings.logoSize] || LOGO_SIZE_PX.medium;
  const logoImg = `<img src="${school.logo}" alt="" style="height:${sizePx}px;object-fit:contain" />`;

  if (settings.logoPosition === "left") {
    return `<div class="header" style="display:flex;align-items:center;gap:12px;text-align:left">
      ${logoImg}
      <div>${nameBlock}</div>
    </div>`;
  }
  if (settings.logoPosition === "center-inline") {
    return `<div class="header" style="display:flex;align-items:center;justify-content:center;gap:12px;text-align:left">
      ${logoImg}
      <div>${nameBlock}</div>
    </div>`;
  }
  if (settings.logoPosition === "right") {
    return `<div class="header" style="display:flex;align-items:center;gap:12px">
      <div style="flex:1;text-align:right">${nameBlock}</div>
      ${logoImg}
    </div>`;
  }
  // center (default): logo stacked above the name block
  return `<div class="header">
    <div style="margin-bottom:4px">${logoImg}</div>
    ${nameBlock}
  </div>`;
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
  const [school, headerSettings] = await Promise.all([getSchoolInfo(), getHeaderSettings()]);
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
${schoolHeaderHtml(school, headerSettings)}
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
  const [school, headerSettings] = await Promise.all([getSchoolInfo(), getHeaderSettings()]);

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
${schoolHeaderHtml(school, headerSettings)}
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
  gradeName: string; sectionName: string; examType: string; isFinal: boolean; showRank: boolean;
  subjects: GradeSheetSubject[]; rows: GradeSheetRow[]; totalStudents: number;
}) {
  const [school, headerSettings] = await Promise.all([getSchoolInfo(), getHeaderSettings()]);
  const isFinal = data.isFinal;

  const subjectHeaders = data.subjects.map(s =>
    `<th class="text-center" style="min-width:50px;background:#1a3a5c;color:white;border-color:#1a3a5c"><div>${s.name}</div><div style="font-size:9px;font-weight:normal;opacity:0.7">(${s.fullMarks})</div></th>`
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
${schoolHeaderHtml(school, headerSettings)}
<div class="title">${data.examType} — Grade Sheet</div>
<div class="subtitle">${data.gradeName} — Section ${data.sectionName} · ${data.totalStudents} Students</div>
<table>
  <thead><tr style="background:#1a3a5c;color:white">
    ${data.showRank ? '<th class="text-center" style="width:40px;background:#1a3a5c;color:white;border-color:#1a3a5c">Rank</th>' : ""}
    <th class="text-center" style="width:40px;background:#1a3a5c;color:white;border-color:#1a3a5c">Roll</th>
    <th style="min-width:120px;background:#1a3a5c;color:white;border-color:#1a3a5c">Student Name</th>
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

// ─── Certificate ────────────────────────────────────────────────────────────

export interface CertificateData {
  title: string;        // heading, e.g. "Certificate of Participation"
  recipient: string;    // name (free text)
  functionName: string; // the event/function
  award?: string;       // optional position/award
  body?: string;        // optional citation; auto-composed if blank
  date?: string;        // BS date
  signatures: string[]; // configurable signature labels
  design?: string;      // visual theme id (see CERTIFICATE_DESIGNS)
}

// Selectable certificate designs. Each has a genuinely different layout —
// border treatment, decoration, and composition — not just a recolored
// version of the same template. `accent` drives the picker chip.
export const CERTIFICATE_DESIGNS: { id: string; label: string; accent: string }[] = [
  { id: "classic", label: "Traditional", accent: "#1a3a5c" },
  { id: "minimal", label: "Modern Minimal", accent: "#0d9488" },
  { id: "seal", label: "Elegant Seal", accent: "#b8860b" },
  { id: "banner", label: "Bold Banner", accent: "#9d174d" },
];

// Shared layout + decorative elements (corners, bands, seal, ribbon) that
// each theme below turns on/off and restyles — this is what lets the four
// designs share one HTML structure while looking structurally different.
const CERT_COMMON_CSS = `
  * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  @page { size: A4 landscape; margin: 0; }
  html, body { height: 100%; }
  .c-page { width: 297mm; height: 210mm; padding: 12mm; }
  .c-frame { height: 100%; padding: 9mm; position: relative; }
  .c-inner { position:relative; z-index:1; height:100%; display:flex; flex-direction:column; align-items:center; text-align:center; }
  .c-logo { height: 62px; object-fit:contain; margin-bottom:5px; }
  .c-school { font-size: 19px; font-weight:bold; letter-spacing:.5px; }
  .c-school-np { font-size: 12px; margin-top:1px; opacity:.75; }
  .c-school-addr { font-size: 10px; margin-top:2px; opacity:.6; }
  .c-title { font-size: 30px; font-weight:bold; text-transform:uppercase; margin: 8mm 0 2mm; }
  .c-rule { width: 90px; height: 3px; margin-bottom: 6mm; }
  .c-pre { font-size: 12.5px; font-style:italic; opacity:.7; }
  .c-recipient { font-size: 28px; font-weight:bold; margin: 3mm 0 4mm; padding: 0 22mm 3mm; }
  .c-body { font-size: 13.5px; line-height:1.7; max-width: 205mm; opacity:.9; }
  .c-award { font-size: 14px; font-weight:bold; margin-top: 4mm; }
  .c-seal { display:none; position:relative; width:24mm; height:24mm; border-radius:50%; margin: 5mm auto 0; align-items:center; justify-content:center; }
  .c-seal-ring { position:absolute; inset:3mm; border-radius:50%; border:1px dashed currentColor; opacity:.6; }
  .c-seal-star { font-size:13px; }
  .c-seal::before, .c-seal::after { content:''; position:absolute; top:19mm; width:5mm; height:12mm; opacity:.85; }
  .c-seal::before { left:4mm; transform:skewY(18deg); }
  .c-seal::after { right:4mm; transform:skewY(-18deg); }
  .c-date { font-size: 11.5px; margin-top: 5mm; opacity:.7; }
  .c-sigs { display:flex; justify-content:space-around; align-items:flex-end; gap: 14mm; width:100%; margin-top:auto; padding-top: 7mm; }
  .c-sig { font-size: 11.5px; }
  .c-sig-line { width: 46mm; border-top: 1px solid #444; margin: 0 auto 4px; }

  /* Decorative elements — hidden unless a theme opts in */
  .c-corner { position:absolute; z-index:0; width:16mm; height:16mm; border-top:3px solid transparent; border-left:3px solid transparent; display:none; }
  .c-corner-tl { top:6mm; left:6mm; }
  .c-corner-tr { top:6mm; right:6mm; transform:rotate(90deg); transform-origin: top right; }
  .c-corner-bl { bottom:6mm; left:6mm; transform:rotate(-90deg); transform-origin: bottom left; }
  .c-corner-br { bottom:6mm; right:6mm; transform:rotate(180deg); }
  .c-band { position:absolute; z-index:0; left:0; right:0; display:none; }
  .c-band-top { top:0; height:6mm; }
  .c-band-bottom { bottom:0; height:6mm; }
  .c-ribbon { display:none; position:absolute; z-index:2; top:9mm; right:-13mm; width:58mm; transform:rotate(45deg); text-align:center; font-size:9px; font-weight:bold; letter-spacing:1.5px; padding:2px 0; color:#fff; }
`;

const CERT_THEMES: Record<string, string> = {
  // Traditional — full double-line border frame, centered serif composition.
  classic: `
    body { font-family: Georgia, 'Times New Roman', serif; background:#fff; color:#1f2d3d; }
    .c-frame { border: 3px solid #1a3a5c; }
    .c-frame::before { content:''; position:absolute; inset:4mm; border:1px solid #c8a34e; pointer-events:none; }
    .c-school, .c-title { color:#1a3a5c; }
    .c-title { letter-spacing:3px; }
    .c-rule { background:#c8102e; }
    .c-recipient { color:#c8102e; border-bottom:1px solid #ddd; }
    .c-award { color:#b8860b; }
  `,
  // Modern Minimal — no border at all; thin color bars top/bottom; pill-shaped
  // recipient highlight and award badge instead of rules and lines.
  minimal: `
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background:#fff; color:#1f2937; }
    .c-frame { border:none; }
    .c-band-top, .c-band-bottom { display:block; background:#0d9488; }
    .c-band-top { height:5mm; }
    .c-band-bottom { height:4mm; }
    .c-inner { padding-top:9mm; padding-bottom:6mm; }
    .c-school { color:#0f172a; }
    .c-title { color:#0d9488; letter-spacing:5px; font-weight:800; }
    .c-rule { display:none; }
    .c-recipient { color:#0f172a; background:#f0fdfa; border-radius:10px; border-bottom:none; padding:3mm 10mm; }
    .c-award { display:inline-block; background:#0d9488; color:#fff; padding:2mm 6mm; border-radius:20px; font-size:12px; }
    .c-date { display:inline-block; background:#f1f5f9; padding:1.5mm 5mm; border-radius:20px; }
    .c-sig-line { border-top-color:#94a3b8; }
  `,
  // Elegant Seal — no continuous border; open corner brackets frame the page
  // and a ring-and-ribbon medallion seal sits above the signatures.
  seal: `
    body { font-family: 'Palatino Linotype', 'Book Antiqua', Georgia, serif; background:#fffdf7; color:#4a3f2f; }
    .c-frame { border:none; }
    .c-corner { display:block; border-color:#b8860b; }
    .c-school, .c-title { color:#7a5c1e; }
    .c-title { letter-spacing:4px; }
    .c-rule { background:#b8860b; }
    .c-recipient { color:#9a5b23; border-bottom:1px solid #e4d7b0; }
    .c-award { color:#8a6d1e; }
    .c-seal { display:flex; background:#fff8e7; border:2px solid #b8860b; color:#b8860b; }
    .c-seal::before, .c-seal::after { background:#b8860b; }
    .c-sig-line { border-top-color:#8a7a52; }
  `,
  // Bold Banner — solid color header band, pill-badge title, and a diagonal
  // corner ribbon; hairline outline instead of a frame.
  banner: `
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background:#fff; color:#1c2b24; }
    .c-frame { border:1px solid #e5e5e5; overflow:hidden; }
    .c-band-top { display:block; height:9mm; background:#9d174d; }
    .c-ribbon { display:block; background:#9d174d; }
    .c-inner { padding-top:4mm; }
    .c-school { color:#111827; }
    .c-title { display:inline-block; background:#9d174d; color:#fff; padding:3mm 10mm; border-radius:2px; letter-spacing:3px; margin-top:10mm; }
    .c-rule { display:none; }
    .c-recipient { color:#9d174d; border-bottom:2px solid #f3d3df; }
    .c-award { color:#9d174d; }
    .c-sig-line { border-top-color:#6b7280; }
  `,
};

function certEsc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function certificateBody(d: CertificateData): string {
  if (d.body && d.body.trim()) return certEsc(d.body).replace(/\n/g, "<br>");
  const fn = d.functionName.trim();
  const award = (d.award || "").trim();
  const parts = [`has participated in <strong>${certEsc(fn) || "&hellip;"}</strong>`];
  if (award) parts.push(`, securing <strong>${certEsc(award)}</strong>`);
  return `${parts.join("")}. We commend their dedication and wish them continued success.`;
}

export function buildCertificateHtml(
  d: CertificateData,
  school: { name: string; nameNp: string; address: string; phone: string; logo?: string | null },
): string {
  const phoneLine = school.phone ? ` &bull; ${certEsc(school.phone)}` : "";
  const logo = school.logo ? `<img class="c-logo" src="${school.logo}" alt="" />` : "";
  const nepali = school.nameNp ? `<div class="c-school-np">${certEsc(school.nameNp)}</div>` : "";
  const award = (d.award || "").trim() ? `<div class="c-award">${certEsc(d.award)}</div>` : "";
  const dateLine = (d.date || "").trim() ? `<div class="c-date">Date: ${certEsc(d.date)} (B.S.)</div>` : "";
  const sigs = (d.signatures.length ? d.signatures : [""])
    .map((s) => `<div class="c-sig"><div class="c-sig-line"></div>${certEsc(s) || "&nbsp;"}</div>`)
    .join("");

  const themeCss = CERT_THEMES[d.design || "classic"] || CERT_THEMES.classic;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${certEsc(d.title) || "Certificate"}</title>
<style>${CERT_COMMON_CSS}${themeCss}</style></head>
<body>
  <div class="c-page"><div class="c-frame">
    <div class="c-corner c-corner-tl"></div>
    <div class="c-corner c-corner-tr"></div>
    <div class="c-corner c-corner-bl"></div>
    <div class="c-corner c-corner-br"></div>
    <div class="c-band c-band-top"></div>
    <div class="c-band c-band-bottom"></div>
    <div class="c-ribbon"></div>
    <div class="c-inner">
    ${logo}
    <div class="c-school">${certEsc(school.name) || "School"}</div>
    ${nepali}
    <div class="c-school-addr">${certEsc(school.address)}${phoneLine}</div>
    <div class="c-title">${certEsc(d.title) || "Certificate"}</div>
    <div class="c-rule"></div>
    <div class="c-pre">This is to certify that</div>
    <div class="c-recipient">${certEsc(d.recipient) || "&hellip;"}</div>
    <div class="c-body">${certificateBody(d)}</div>
    ${award}
    <div class="c-seal"><div class="c-seal-ring"></div><span class="c-seal-star">&#9733;</span></div>
    ${dateLine}
    <div class="c-sigs">${sigs}</div>
  </div></div></div>
</body></html>`;
}

export async function printCertificate(d: CertificateData) {
  const school = await getSchoolInfo();
  openPrintWindow(buildCertificateHtml(d, school));
}