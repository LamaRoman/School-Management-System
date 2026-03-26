import puppeteer, { Browser } from "puppeteer";

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

interface PdfOptions {
  html: string;
  paperSize: "A4" | "A5";
}

export async function generatePdf({ html, paperSize }: PdfOptions): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15000 });
    const width = paperSize === "A5" ? "148mm" : "210mm";
    const height = paperSize === "A5" ? "210mm" : "297mm";

    const pdfBuffer = await page.pdf({
      width,
      height,
      margin: paperSize === "A5"
        ? { top: "5mm", right: "6mm", bottom: "5mm", left: "6mm" }
        : { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
      printBackground: true,
      preferCSSPageSize: false,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}

function getTheme(mode: "color" | "bw") {
  const isBW = mode === "bw";
  return {
    primary: isBW ? "#444444" : "#1a3a5c",
    accent: isBW ? "#444444" : "#c8102e",
    headerBg: isBW ? "#555555" : "#2d5f8a",
    altRow: isBW ? "#f5f7f9" : "#f5f8fc",
    border: isBW ? "#aaaaaa" : "#dddddd",
    pct: isBW ? "#666666" : "#666666",
    infoBg: isBW ? "#f5f5f5" : "#f9fafb",
    rankAttBg: isBW ? "#f5f5f5" : "#f9fafb",
  };
}

function getDivision(pct: number): { division: string; result: string } {
  if (pct >= 80) return { division: "Distinction", result: "Pass" };
  if (pct >= 60) return { division: "1st Division", result: "Pass" };
  if (pct >= 40) return { division: "2nd Division", result: "Pass" };
  if (pct >= 20) return { division: "3rd Division", result: "Pass" };
  return { division: "—", result: "Fail" };
}

export interface ReportCardColumnSettings {
  showPassMarks: boolean;
  showTheoryPrac: boolean;
  showPercentage: boolean;
  showGrade: boolean;
  showGpa: boolean;
  showRank: boolean;
  showAttendance: boolean;
  showRemarks: boolean;
  showPromotion: boolean;
}

export const defaultColumnSettings: ReportCardColumnSettings = {
  showPassMarks: true,
  showTheoryPrac: true,
  showPercentage: false,
  showGrade: true,
  showGpa: true,
  showRank: true,
  showAttendance: true,
  showRemarks: true,
  showPromotion: true,
};

export function buildReportCardHtml(
  reportData: any,
  mode: "color" | "bw",
  cols: ReportCardColumnSettings = defaultColumnSettings,
  observations: any[] | null = null
): string {
  const t = getTheme(mode);
  const isTermReport = reportData.isTermReport;
  const hasPractical = reportData.hasPractical && cols.showTheoryPrac;
  const paperSize = reportData.paperSize || "A4";

  const isA5 = paperSize === "A5";
  const fs = {
    schoolNp: isA5 ? "13px" : "16px",
    schoolEn: isA5 ? "10px" : "12px",
    address: isA5 ? "8px" : "10px",
    badge: isA5 ? "8px" : "10px",
    info: isA5 ? "9px" : "10px",
    th: isA5 ? "8px" : "10px",
    td: isA5 ? "8px" : "10px",
    footer: isA5 ? "8px" : "10px",
    sig: isA5 ? "8px" : "9px",
    overall: isA5 ? "8px" : "10px",
    legend: isA5 ? "7px" : "8px",
  };
  const pad = {
    header: isA5 ? "8px 10px" : "12px 16px",
    info: isA5 ? "6px 10px" : "10px 16px",
    cell: isA5 ? "4px 3px" : "6px 8px",
    cellCenter: isA5 ? "4px 2px" : "6px 4px",
    bottom: isA5 ? "8px 10px" : "12px 16px",
  };

  // Term headers for final report
  let termHeaders = "";
  let termColCount = 0;
  if (!isTermReport && reportData.subjects?.[0]?.terms) {
    termColCount = reportData.subjects[0].terms.length;
    termHeaders = reportData.subjects[0].terms
      .map(
        (term: any) =>
          `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.headerBg};color:#fff;font-size:${fs.th};font-weight:600;">${term.examTypeName.replace("Terminal", "Term")} (${term.weightage}%)</th>`
      )
      .join("");
  }

  // Subject rows
  const subjectRows = (reportData.subjects || [])
    .map((s: any, i: number) => {
      const bg = i % 2 === 0 ? "#ffffff" : t.altRow;
      let dataCols = "";

      if (isTermReport) {
        if (hasPractical) {
          dataCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">${s.theoryMarks}</td>`;
          dataCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">${s.practicalMarks || "—"}</td>`;
        }
        dataCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};font-weight:600;">${s.totalMarks}</td>`;
      } else {
        dataCols = (s.terms || [])
          .map(
            (term: any) =>
              `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">${term.totalMarks}</td>`
          )
          .join("");
      }

      const pctValue = isTermReport ? s.percentage : s.weightedPercentage;

      let resultCols = "";
      if (cols.showPercentage) {
        resultCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};font-weight:700;color:${t.primary};">${pctValue}</td>`;
      }
      if (cols.showGrade) {
        resultCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};font-weight:700;color:${t.primary};">${s.grade}</td>`;
      }
      if (cols.showGpa) {
        resultCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">${s.gpa}</td>`;
      }

      let passMark = "";
      if (cols.showPassMarks) {
        passMark = `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};color:${t.pct};">${s.passMarks}</td>`;
      }

      return `<tr style="background:${bg};">
        <td style="padding:${pad.cell};border:1px solid ${t.border};font-size:${fs.td};font-weight:500;">${s.subjectName}</td>
        <td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">${s.fullMarks}</td>
        ${passMark}
        ${dataCols}
        ${resultCols}
      </tr>`;
    })
    .join("");

  // Table header columns
  let theadCols = "";
  if (isTermReport) {
    if (hasPractical) {
      theadCols += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.headerBg};color:#fff;font-size:${fs.th};font-weight:600;">Theory</th>`;
      theadCols += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.headerBg};color:#fff;font-size:${fs.th};font-weight:600;">Prac.</th>`;
    }
    theadCols += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};color:#fff;font-size:${fs.th};font-weight:600;">${hasPractical ? "Total" : "Obtained"}</th>`;
  } else {
    theadCols = termHeaders;
  }

  let resultHeaders = "";
  if (cols.showPercentage) {
    resultHeaders += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.accent};color:#fff;font-size:${fs.th};font-weight:600;">%</th>`;
  }
  if (cols.showGrade) {
    resultHeaders += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.accent};color:#fff;font-size:${fs.th};font-weight:600;">Grade</th>`;
  }
  if (cols.showGpa) {
    resultHeaders += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.accent};color:#fff;font-size:${fs.th};font-weight:600;">GPA</th>`;
  }

  let passHeader = "";
  if (cols.showPassMarks) {
    passHeader = `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};color:#fff;font-size:${fs.th};font-weight:600;">Pass</th>`;
  }

  // Division & Result
  const divResult = getDivision(reportData.overallPercentage);

  // Rank + Attendance
  let bottomInfoHtml = "";
  const infoParts: string[] = [];
  if (cols.showRank && reportData.showRank && reportData.rank) {
    infoParts.push(`<span style="font-weight:600;color:${t.accent};font-size:${fs.footer};">Rank: ${reportData.rank} out of ${reportData.totalStudents}</span>`);
  }
  if (cols.showAttendance && reportData.attendance) {
    infoParts.push(`<span style="font-weight:600;color:${t.primary};font-size:${fs.footer};">Attendance:</span> <span style="font-size:${fs.footer};">Total: <b>${reportData.attendance.totalDays}</b></span> <span style="font-size:${fs.footer};">Present: <b>${reportData.attendance.presentDays}</b></span> <span style="font-size:${fs.footer};">Absent: <b>${reportData.attendance.absentDays}</b></span>`);
  }
  if (infoParts.length > 0) {
    bottomInfoHtml = `<div style="display:flex;gap:16px;align-items:center;font-size:${fs.footer};margin-bottom:8px;padding:6px 8px;background:${t.rankAttBg};border-radius:4px;flex-wrap:wrap;">${infoParts.join('<span style="color:#ccc;margin:0 4px;">|</span>')}</div>`;
  }

  // Observation table
  const observationHtml = observations && observations.length > 0 ? `
    <div style="margin-bottom:8px;">
      <table style="border-collapse:collapse;width:auto;table-layout:auto;">
        <caption style="text-align:left;font-weight:700;font-size:${fs.footer};color:${t.primary};padding-bottom:3px;">General Observation</caption>
        ${observations.map((obs: any) => `<tr><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};">${obs.categoryName}</td><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};font-weight:700;color:${t.primary};text-align:center;">${obs.grade}</td></tr>`).join("")}
      </table>
    </div>` : "";

  // Result Summary
  const resultSummaryHtml = `
    <div style="margin-bottom:8px;">
      <table style="border-collapse:collapse;width:auto;table-layout:auto;">
        <caption style="text-align:left;font-weight:700;font-size:${fs.footer};color:${t.primary};padding-bottom:3px;">Result</caption>
        <tr><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};font-weight:600;">Percentage</td><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};font-weight:700;color:${t.primary};">${reportData.overallPercentage}%</td></tr>
        <tr><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};font-weight:600;">Division</td><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};font-weight:700;color:${t.primary};">${divResult.division}</td></tr>
        ${cols.showGrade ? `<tr><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};font-weight:600;">Grade</td><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};font-weight:700;color:${t.primary};">${reportData.overallGrade}</td></tr>` : ""}
        ${cols.showGpa ? `<tr><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};font-weight:600;">GPA</td><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};font-weight:700;color:${t.primary};">${reportData.overallGpa}</td></tr>` : ""}
        <tr><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};font-weight:600;">Result</td><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};font-weight:700;color:${divResult.result === "Pass" ? "#15803d" : t.accent};">${divResult.result}</td></tr>
      </table>
    </div>`;

  // Grading Scale
  const gradingRows = [
    ["A/A+", "Distinction", "80%–100%"],
    ["B/B+", "1st Division", "60%–79%"],
    ["C/C+", "2nd Division", "40%–59%"],
    ["D", "3rd Division", "20%–39%"],
    ["E", "Fail", "0%–19%"],
  ];
  const gradingScaleHtml = `
    <div style="margin-bottom:8px;">
      <table style="border-collapse:collapse;width:auto;table-layout:auto;">
        <caption style="text-align:left;font-weight:700;font-size:${fs.footer};color:${t.primary};padding-bottom:3px;">Grading and Marking System</caption>
        ${gradingRows.map(([grade, div, range]) => `<tr><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};font-weight:600;">${grade}</td><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};font-weight:700;">${div}</td><td style="border:1px solid ${t.border};padding:2px 6px;font-size:${fs.legend};">${range}</td></tr>`).join("")}
      </table>
    </div>`;

  // Comments
  const commentsHtml = cols.showRemarks && reportData.remarks
    ? `<div style="margin-bottom:8px;padding:6px 8px;background:${t.rankAttBg};border-radius:4px;font-size:${fs.footer};"><span style="font-weight:700;color:${t.primary};">Comments: </span><b>${reportData.remarks}</b></div>`
    : "";

  // Promotion
  const promotionHtml = cols.showPromotion && reportData.promoted
    ? `<div style="text-align:center;padding:6px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;font-size:${fs.footer};font-weight:700;color:#15803d;margin-bottom:10px;">✓ ${reportData.promotedTo || "Promoted"}</div>`
    : "";

  // Student info
  const infoFields = [
    ["Student", reportData.student?.name || "—"],
    ["Class / Section", `${reportData.student?.className || ""} / ${reportData.student?.section || ""}`],
    ["Roll No.", reportData.student?.rollNo || "—"],
    ["DOB", reportData.student?.dateOfBirth || "—"],
    ["Examination", reportData.examType || "—"],
  ];
  const infoRows = infoFields
    .map(([label, value]) => `<div style="display:flex;gap:6px;"><span style="color:#888;min-width:${isA5 ? "70px" : "90px"};font-size:${fs.info};">${label}:</span><span style="font-weight:600;color:${t.primary};font-size:${fs.info};">${value}</span></div>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Noto Sans', Arial, sans-serif; color: #333; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 0; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  </style>
</head>
<body>
  <div style="border:2px solid ${t.primary};border-radius:4px;overflow:hidden;margin:${isA5 ? "2mm" : "3mm"};">
    <div style="padding:${pad.header};border-bottom:2px solid ${t.primary};text-align:center;">
      <h2 style="font-size:${fs.schoolNp};font-weight:700;color:${t.primary};font-family:Georgia,'Noto Serif',serif;margin-bottom:2px;">${reportData.school?.nameNp || ""}</h2>
      <p style="font-size:${fs.schoolEn};color:${t.primary};margin-bottom:1px;">${reportData.school?.name || ""}</p>
      <p style="font-size:${fs.address};color:#888;margin-bottom:6px;">${reportData.school?.address || ""}</p>
      <div style="display:inline-block;padding:3px 14px;background:${t.accent};color:#fff;font-size:${fs.badge};font-weight:700;text-transform:uppercase;letter-spacing:1px;border-radius:4px;">
        ${reportData.examType} — ${reportData.academicYear} B.S.
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;padding:${pad.info};background:${t.infoBg};border-bottom:1px solid ${t.border};">
      ${infoRows}
    </div>
    <table>
      <thead>
        <tr style="background:${t.primary};">
          <th style="text-align:left;padding:${pad.cell};border:1px solid ${t.primary};color:#fff;font-size:${fs.th};font-weight:600;">Subject</th>
          <th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};color:#fff;font-size:${fs.th};font-weight:600;">Full</th>
          ${passHeader}
          ${theadCols}
          ${resultHeaders}
        </tr>
      </thead>
      <tbody>
        ${subjectRows}
      </tbody>
    </table>
    <div style="padding:${pad.bottom};border-top:2px solid ${t.primary};">
      ${bottomInfoHtml}
      <div style="display:flex;gap:${isA5 ? "8px" : "16px"};flex-wrap:wrap;margin-bottom:8px;">
        ${observationHtml}
        ${resultSummaryHtml}
        ${gradingScaleHtml}
      </div>
      ${commentsHtml}
      ${promotionHtml}
      <div style="display:flex;justify-content:space-between;margin-top:${isA5 ? "28px" : "40px"};">
        ${["Class Teacher", "Exam Coordinator", "Principal"].map((role) => `<div style="text-align:center;min-width:${isA5 ? "70px" : "100px"};"><div style="border-bottom:1px solid #999;height:${isA5 ? "14px" : "20px"};margin-bottom:3px;"></div><span style="font-size:${fs.sig};font-weight:600;">${role}</span></div>`).join("")}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function buildBatchReportCardHtml(
  reportDataArray: any[],
  mode: "color" | "bw",
  paperSize: "A4" | "A5",
  cols: ReportCardColumnSettings = defaultColumnSettings
): string {
  const pages = reportDataArray
    .map((reportData, index) => {
      const singleHtml = buildReportCardHtml(reportData, mode, cols, reportData._observations || null);
      const bodyMatch = singleHtml.match(/<body>([\s\S]*)<\/body>/);
      const bodyContent = bodyMatch ? bodyMatch[1] : "";
      const pageBreak = index < reportDataArray.length - 1 ? `page-break-after: always;` : "";
      return `<div style="${pageBreak}">${bodyContent}</div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Noto Sans', Arial, sans-serif; color: #333; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 0; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  </style>
</head>
<body>
  ${pages}
</body>
</html>`;
}