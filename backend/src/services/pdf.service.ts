import puppeteer, { Browser } from "puppeteer";
import NepaliDate from "nepali-date-converter";
import { GRADING_SCALE, isPassingGrade } from "./grading.service";
import logger from "../utils/logger";

let browserInstance: Browser | null = null;

// Close the idle browser a few minutes after the last PDF request. Chrome
// sits at 150MB+ resident even when doing nothing, and report cards are
// generated a few times a term — there's no reason to pay for that memory
// around the clock. `unref()` so this timer alone can't keep the process
// alive on shutdown.
const IDLE_SHUTDOWN_MS = 5 * 60 * 1000;
let idleTimer: NodeJS.Timeout | null = null;

function resetIdleShutdown(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    closeBrowser().catch((err) =>
      logger.error({ err }, "Idle browser shutdown failed"),
    );
  }, IDLE_SHUTDOWN_MS);
  idleTimer.unref();
}

/**
 * Escape user-controlled strings before interpolating into the HTML template
 * that Puppeteer renders. Puppeteer executes the rendered HTML as a real
 * browser page with `--no-sandbox`, which means an unescaped <script> tag in
 * a database field (school name, student name, remarks, etc.) runs with full
 * Node.js context. Every database field that reaches the template MUST be
 * wrapped in esc().
 */
function esc(str: unknown): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Validate a logo URL before embedding it as <img src="...">. Puppeteer will
 * fetch whatever URL is in src — an admin who sets the logo to an internal URL
 * (e.g. http://169.254.169.254/... for AWS IMDS) triggers SSRF. Only allow:
 *   - data:image/... base64 URIs (inline, no network)
 *   - https URLs on our own S3 bucket
 */
function isSafeLogoUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  const bucket = process.env.AWS_S3_BUCKET;
  if (
    bucket &&
    url.startsWith("https://") &&
    url.includes(`${bucket}.s3.`) &&
    url.includes(".amazonaws.com/")
  )
    return true;
  return false;
}

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        // WARNING: --disable-gpu stops Chrome emitting the networkAlmostIdle
        // and networkIdle lifecycle events on macOS. Any wait that depends on
        // them — waitUntil "networkidle0"/"networkidle2" in setContent, goto,
        // or waitForNavigation — will therefore NEVER resolve in local dev and
        // can only end in a navigation timeout, no matter how high the timeout
        // is set. Linux (production) is unaffected, so this presents as a
        // "works in prod, hangs locally" bug. Use waitUntil "load" instead;
        // see generatePdf below. The flag has no effect on rendered output —
        // PDFs are byte-identical with and without it.
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
    });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

interface PdfOptions {
  html: string;
  paperSize: "A4" | "A5";
}

/**
 * Cap on concurrent Chrome pages (P6).
 *
 * Each open page holds 50-100MB for the duration of its render. Report cards are
 * printed in class-sized batches at term end, which is exactly when several teachers
 * are likely to click Print within the same minute — five concurrent renders plus the
 * base browser is enough to OOM-kill a memory-billed instance, and an OOM kill takes
 * every other in-flight request with it. Queueing costs the fifth teacher a few
 * seconds; not queueing costs everyone the process.
 *
 * Three, not one: a single slot would serialise unrelated single-student downloads
 * behind a 40-page class batch, and the box can comfortably hold three pages.
 */
const MAX_CONCURRENT_PAGES = 3;
let activePages = 0;
const pageQueue: Array<() => void> = [];

async function acquirePageSlot(): Promise<void> {
  if (activePages < MAX_CONCURRENT_PAGES) {
    activePages++;
    return;
  }
  // Park until a render finishes. Deliberately unbounded and FIFO — the alternative
  // is rejecting the request, and a teacher waiting is better than a failed print run
  // during the one week these are actually used.
  await new Promise<void>((resolve) => pageQueue.push(resolve));
  activePages++;
}

function releasePageSlot(): void {
  activePages--;
  const next = pageQueue.shift();
  if (next) next();
}

/** Test/diagnostic hook — how many renders are running and waiting right now. */
export function getPdfConcurrency(): { active: number; queued: number; max: number } {
  return { active: activePages, queued: pageQueue.length, max: MAX_CONCURRENT_PAGES };
}

export async function generatePdf({
  html,
  paperSize,
}: PdfOptions): Promise<Buffer> {
  await acquirePageSlot();

  let browser;
  let page;
  try {
    browser = await getBrowser();
    page = await browser.newPage();
  } catch (err) {
    // Never strand a slot if the browser or page could not be opened.
    releasePageSlot();
    throw err;
  }

  // Cancel any pending idle-shutdown for the duration of this render — a
  // large batch can take longer than the idle window, and closing the
  // browser mid-render would kill the in-flight page.
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  try {
    // "load" (not domcontentloaded) — the logo is fetched from S3 over the
    // network, and domcontentloaded fires before that request resolves,
    // producing a PDF with a blank logo slot. The load event waits for every
    // subresource, so the logo is decoded by the time we print.
    //
    // Deliberately NOT networkidle0 — see the --disable-gpu warning in
    // getBrowser above. That flag suppresses the networkIdle lifecycle events
    // on macOS, so networkidle0 can only ever end in a navigation timeout in
    // local dev, however high the timeout is set.
    await page.setContent(html, { waitUntil: "load", timeout: 15000 });
    const width = paperSize === "A5" ? "148mm" : "210mm";
    const height = paperSize === "A5" ? "210mm" : "297mm";

    const pdfBuffer = await page.pdf({
      width,
      height,
      margin:
        paperSize === "A5"
          ? { top: "5mm", right: "6mm", bottom: "5mm", left: "6mm" }
          : { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
      printBackground: true,
      preferCSSPageSize: false,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    // Close the page before handing the slot on, so the next render's memory does not
    // overlap with this one's — otherwise the cap would not actually bound peak usage.
    try {
      await page.close();
    } finally {
      releasePageSlot();
      resetIdleShutdown();
    }
  }
}

/**
 * Report card palette.
 *
 * "bw" is not a desaturated copy of "color" — it is a genuinely ink-friendly
 * line-art rendering: white everywhere, black text, black hairline rules, and
 * no solid fills at all. Solid bars spanning a full-width table are by far the
 * biggest toner cost on a laser printer, and on inkjets they bleed and curl
 * the paper. Schools print these in class-sized batches, so every filled
 * region is paid for a few hundred times over.
 *
 * The split between a text colour and its matching *Bg is deliberate: in B&W
 * an accent still needs to read as emphasis in TEXT (a black bold heading)
 * while contributing no FILL behind a table header.
 */
function getTheme(mode: "color" | "bw") {
  const isBW = mode === "bw";
  return {
    primary: isBW ? "#000000" : "#1a3a5c",
    accent: isBW ? "#000000" : "#c8102e",
    // Table header fills — all white in B&W so the header row is defined by
    // its rules and bold text rather than a block of toner.
    theadBg: isBW ? "#ffffff" : "#1a3a5c",
    headerBg: isBW ? "#ffffff" : "#2d5f8a",
    accentBg: isBW ? "#ffffff" : "#c8102e",
    headerText: isBW ? "#000000" : "#ffffff",
    altRow: isBW ? "#ffffff" : "#f5f8fc",
    border: isBW ? "#000000" : "#dddddd",
    pct: isBW ? "#000000" : "#666666",
    infoBg: isBW ? "#ffffff" : "#f9fafb",
    rankAttBg: isBW ? "#ffffff" : "#f9fafb",
    // Exam badge: a filled pill in colour, an outlined box in B&W (the school's
    // own printed sheet outlines it the same way).
    badgeBg: isBW ? "#ffffff" : "#c8102e",
    badgeText: isBW ? "#000000" : "#ffffff",
    badgeBorder: isBW ? "1px solid #000000" : "none",
    positive: isBW ? "#000000" : "#15803d",
    promoBg: isBW ? "#ffffff" : "#f0fdf4",
    promoBorder: isBW ? "#000000" : "#bbf7d0",
  };
}

/**
 * Printable height of the report card box.
 *
 * MUST stay in sync with two things: the `margin` passed to page.pdf() in
 * generatePdf, and the card's own outer margin in the templates below.
 *   A4: 297mm − (8+8)mm PDF margin − (3+3)mm card margin = 275mm
 *   A5: 210mm − (5+5)mm PDF margin − (2+2)mm card margin = 196mm
 * Overshooting pushes a blank second page after every student in a class
 * batch, so the reportCard tests assert the rendered page count.
 */
function cardMinHeight(isA5: boolean): string {
  return isA5 ? "196mm" : "275mm";
}

/**
 * Empty rows that carry the table's vertical column rules down through the
 * unused part of the page, the way the school's printed grade sheet does.
 *
 * The table targets a fixed slot count (A4 = 14, A5 = 12) rather than
 * stretching to fill the entire page. With max ~12 subjects, this keeps a
 * small ruled margin below the last subject while leaving room for the
 * bottom section (Result, Grading Scale, signatures) to render at a
 * comfortable size instead of being squeezed into whatever's left over.
 *
 * Each filler row uses the same cell padding as the real data rows, so its
 * height matches. Left/right borders continue the column rules.
 */
function buildTableFillerRows(
  theadInnerHtml: string,
  borderColor: string,
  subjectCount: number,
  isA5: boolean,
): string {
  const targetRows = isA5 ? 9 : 11;
  const fillerCount = Math.max(0, targetRows - subjectCount);
  if (fillerCount === 0) return "";
  const columnCount = (theadInnerHtml.match(/<th\b/g) || []).length;
  if (columnCount === 0) return "";
  const cellPad = isA5 ? "6px 3px" : "9px 8px";
  const cell = `<td style="padding:${cellPad};border-left:1px solid ${borderColor};border-right:1px solid ${borderColor};">&nbsp;</td>`;
  const row = `<tr>${cell.repeat(columnCount)}</tr>`;
  return row.repeat(fillerCount);
}

/** Issue date, in BS, matching the printed sheet's "Date of Issue" field. */
function issueDateHtml(fontSize: string): string {
  return `<span style="font-size:${fontSize};font-weight:600;">Date of Issue: ${esc(new NepaliDate().format("YYYY-MM-DD"))}</span>`;
}

function getResultSummary(overallGrade: string): {
  description: string;
  result: string;
} {
  const entry = GRADING_SCALE.find((e) => e.grade === overallGrade);
  return {
    description: entry?.description || "—",
    result: isPassingGrade(overallGrade) ? "Pass" : "Fail",
  };
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
  showNepaliName: boolean;
  logoPosition: "left" | "center" | "center-inline" | "right";
  logoSize: "small" | "medium" | "large";
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
  showNepaliName: false,
  logoPosition: "center",
  logoSize: "medium",
};

export function buildReportCardHtml(
  reportData: any,
  mode: "color" | "bw",
  cols: ReportCardColumnSettings = defaultColumnSettings,
  observations: any[] | null = null,
): string {
  // Credit-hour / grade-point report style (SEE/NEB-like) renders through a
  // fully separate function — see buildCreditGradeReportCardHtml below.
  // Everything from here down is the original marks-based template and is
  // only ever reached when gradingStyle is unset or "MARKS_BASED".
  if (reportData.gradingStyle === "CREDIT_GRADE_BASED") {
    return buildCreditGradeReportCardHtml(reportData, mode, cols, observations);
  }

  const t = getTheme(mode);
  const isTermReport = reportData.isTermReport;
  const hasPractical = reportData.hasPractical && cols.showTheoryPrac;
  const paperSize = reportData.paperSize || "A4";

  const isA5 = paperSize === "A5";
  const logoSizeMap: Record<string, string> = {
    small: isA5 ? "28px" : "35px",
    medium: isA5 ? "40px" : "55px",
    large: isA5 ? "55px" : "75px",
  };
  const computedLogoSize = logoSizeMap[cols.logoSize] || logoSizeMap["medium"];
  const fs = {
    schoolName: isA5 ? "17px" : "22px",
    schoolNp: isA5 ? "11px" : "13px",
    schoolEn: isA5 ? "10px" : "12px",
    address: isA5 ? "8px" : "10px",
    logoSize: computedLogoSize,
    badge: isA5 ? "8px" : "10px",
    info: isA5 ? "9px" : "10px",
    th: isA5 ? "8px" : "10px",
    td: isA5 ? "8px" : "10px",
    footer: isA5 ? "9px" : "11px",
    sig: isA5 ? "8px" : "10px",
    overall: isA5 ? "9px" : "11px",
    legend: isA5 ? "8px" : "9px",
  };
  const pad = {
    header: isA5 ? "8px 10px" : "12px 16px",
    info: isA5 ? "6px 10px" : "10px 16px",
    cell: isA5 ? "6px 3px" : "9px 8px",
    cellCenter: isA5 ? "6px 2px" : "9px 4px",
    bottom: isA5 ? "10px 10px" : "14px 16px",
  };

  // Term headers for final report
  let termHeaders = "";
  if (!isTermReport && reportData.subjects?.[0]?.terms) {
    termHeaders = reportData.subjects[0].terms
      .map(
        (term: any) =>
          `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.headerBg};color:${t.headerText};font-size:${fs.th};font-weight:600;">${esc(String(term.examTypeName || "").replace("Terminal", "Term"))} (${esc(term.weightage)}%)</th>`,
      )
      .join("");
  }

  // Subject rows
  const subjectRows = (reportData.subjects || [])
    .map((s: any, i: number) => {
      const bg = i % 2 === 0 ? "#ffffff" : t.altRow;
      let dataCols = "";

      if (isTermReport) {
        // "Ab" asserts the student was absent. A subject whose marks simply have not
        // been entered yet must not say that — it prints "—" while still scoring 0
        // in the percentage, grade and GPA columns beside it.
        if (s.notEntered) {
          if (hasPractical) {
            dataCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">—</td>`;
            dataCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">—</td>`;
          }
          dataCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};font-weight:600;">—</td>`;
        } else if (s.isAbsent) {
          if (hasPractical) {
            dataCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">Ab</td>`;
            dataCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">Ab</td>`;
          }
          dataCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};font-weight:600;">Ab</td>`;
        } else {
          if (hasPractical) {
            dataCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">${esc(s.theoryMarks)}</td>`;
            dataCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">${esc(s.practicalMarks || "—")}</td>`;
          }
          dataCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};font-weight:600;">${esc(s.totalMarks)}</td>`;
        }
      } else {
        dataCols = (s.terms || [])
          .map(
            (term: any) =>
              `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">${term.isAbsent ? "Ab" : esc(term.totalMarks)}</td>`,
          )
          .join("");
      }

      const pctValue = isTermReport ? s.percentage : s.weightedPercentage;

      let resultCols = "";
      if (cols.showPercentage) {
        resultCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};font-weight:700;color:${t.primary};">${s.isAbsent ? "NG" : esc(pctValue)}</td>`;
      }
      if (cols.showGrade) {
        resultCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};font-weight:700;color:${t.primary};">${s.isAbsent ? "NG" : esc(s.grade)}</td>`;
      }
      if (cols.showGpa) {
        resultCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">${s.isAbsent ? "NG" : esc(s.gpa)}</td>`;
      }

      let passMark = "";
      if (cols.showPassMarks) {
        passMark = `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};color:${t.pct};">${esc(s.passMarks)}</td>`;
      }

      return `<tr style="background:${bg};">
        <td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};color:${t.pct};">${i + 1}</td>
        <td style="padding:${pad.cell};border:1px solid ${t.border};font-size:${fs.td};font-weight:500;">${esc(s.subjectName)}</td>
        <td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">${esc(s.fullMarks)}</td>
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
      theadCols += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.headerBg};color:${t.headerText};font-size:${fs.th};font-weight:600;">Theory</th>`;
      theadCols += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.headerBg};color:${t.headerText};font-size:${fs.th};font-weight:600;">Prac.</th>`;
    }
    theadCols += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};color:${t.headerText};font-size:${fs.th};font-weight:600;">${hasPractical ? "Total" : "Obtained"}</th>`;
  } else {
    theadCols = termHeaders;
  }

  let resultHeaders = "";
  if (cols.showPercentage) {
    resultHeaders += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.accentBg};color:${t.headerText};font-size:${fs.th};font-weight:600;">%</th>`;
  }
  if (cols.showGrade) {
    resultHeaders += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.accentBg};color:${t.headerText};font-size:${fs.th};font-weight:600;">Grade</th>`;
  }
  if (cols.showGpa) {
    resultHeaders += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.accentBg};color:${t.headerText};font-size:${fs.th};font-weight:600;">GPA</th>`;
  }

  let passHeader = "";
  if (cols.showPassMarks) {
    passHeader = `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};color:${t.headerText};font-size:${fs.th};font-weight:600;">Pass</th>`;
  }

  // Assembled header row, kept as a single string so buildTableFillerRow can
  // count its columns instead of re-deriving which optional columns are on.
  // S.N. and Subject get explicit widths (table-layout is fixed); the
  // remaining width is shared evenly by the numeric columns.
  const theadHtml = `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};color:${t.headerText};font-size:${fs.th};font-weight:600;width:${isA5 ? "6%" : "5%"};">S.N.</th>
          <th style="text-align:left;padding:${pad.cell};border:1px solid ${t.primary};color:${t.headerText};font-size:${fs.th};font-weight:600;width:24%;">Subject</th>
          <th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};color:${t.headerText};font-size:${fs.th};font-weight:600;">Full</th>
          ${passHeader}
          ${theadCols}
          ${resultHeaders}`;

  // Result summary (description + pass/fail)
  // "Incomplete" covers both an absence and a subject whose marks have not been
  // entered yet — in either case the result on this card is not the final word, and
  // printing a confident "Pass"/"Fail" over a missing paper is how a provisional
  // number ends up being read as a final one.
  const anyAbsent = (reportData.subjects || []).some((s: any) => s.isAbsent || s.notEntered);
  const divResult = getResultSummary(reportData.overallGrade);

  // Rank + Attendance
  let bottomInfoHtml = "";
  const infoParts: string[] = [];
  if (cols.showRank && reportData.showRank && reportData.rank) {
    infoParts.push(
      `<span style="font-weight:600;color:${t.accent};font-size:${fs.footer};">Rank: ${esc(reportData.rank)} out of ${esc(reportData.totalStudents)}</span>`,
    );
  }
  if (cols.showAttendance && reportData.attendance) {
    infoParts.push(
      `<span style="font-weight:600;color:${t.primary};font-size:${fs.footer};">Attendance:</span> <span style="font-size:${fs.footer};">Total: <b>${esc(reportData.attendance.totalDays)}</b></span> <span style="font-size:${fs.footer};">Present: <b>${esc(reportData.attendance.presentDays)}</b></span> <span style="font-size:${fs.footer};">Absent: <b>${esc(reportData.attendance.absentDays)}</b></span>`,
    );
  }
  if (infoParts.length > 0) {
    bottomInfoHtml = `<div style="display:flex;gap:16px;align-items:center;font-size:${fs.footer};margin-bottom:8px;padding:6px 8px;background:${t.rankAttBg};border-radius:4px;flex-wrap:wrap;">${infoParts.join('<span style="color:#ccc;margin:0 4px;">|</span>')}</div>`;
  }

  // Observation table
  const observationHtml =
    observations && observations.length > 0
      ? `
    <div style="margin-bottom:8px;">
      <table style="border-collapse:collapse;width:auto;table-layout:auto;">
        <caption style="text-align:left;font-weight:700;font-size:${fs.footer};color:${t.primary};padding-bottom:3px;">General Observation</caption>
        ${observations.map((obs: any) => `<tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};">${esc(obs.categoryName)}</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:700;color:${t.primary};text-align:center;">${esc(obs.grade)}</td></tr>`).join("")}
      </table>
    </div>`
      : "";

  // Result Summary
  const resultSummaryHtml = `
    <div style="margin-bottom:8px;">
      <table style="border-collapse:collapse;width:auto;table-layout:auto;">
        <caption style="text-align:left;font-weight:700;font-size:${fs.footer};color:${t.primary};padding-bottom:3px;">Result</caption>
        <tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:600;">Percentage</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:700;color:${t.primary};">${esc(reportData.overallPercentage)}%</td></tr>
        <tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:600;">Description</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:700;color:${t.primary};">${esc(divResult.description)}</td></tr>
        ${cols.showGrade ? `<tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:600;">Grade</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:700;color:${t.primary};">${esc(reportData.overallGrade)}</td></tr>` : ""}
        ${cols.showGpa ? `<tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:600;">GPA</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:700;color:${t.primary};">${esc(reportData.overallGpa)}</td></tr>` : ""}
        <tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:600;">Result</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:700;color:${anyAbsent ? t.accent : (divResult.result === "Pass" ? t.positive : t.accent)};">${anyAbsent ? "Incomplete" : esc(divResult.result)}</td></tr>
      </table>
    </div>`;

  // Grading Scale (source of truth in grading.service.ts)
  const gradingScaleHtml = `
    <div style="margin-bottom:8px;">
      <table style="border-collapse:collapse;width:auto;table-layout:auto;">
        <caption style="text-align:left;font-weight:700;font-size:${fs.footer};color:${t.primary};padding-bottom:3px;">Grading and Marking System</caption>
        ${GRADING_SCALE.map((row) => `<tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:600;">${row.grade}</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};">${row.range}</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:700;">${row.gpa ?? "—"}</td></tr>`).join("")}
        <tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:600;">NG</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};" colspan="2">Not Graded</td></tr>
        <tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:600;">Ab</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};" colspan="2">Absent</td></tr>
      </table>
    </div>`;

  // Comments
  const commentsHtml =
    cols.showRemarks && reportData.remarks
      ? `<div style="margin-bottom:8px;padding:6px 8px;background:${t.rankAttBg};border-radius:4px;font-size:${fs.footer};"><span style="font-weight:700;color:${t.primary};">Comments: </span><b>${esc(reportData.remarks)}</b></div>`
      : "";

  // Promotion
  const promotionHtml =
    cols.showPromotion && reportData.promoted
      ? `<div style="text-align:center;padding:6px;background:${t.promoBg};border:1px solid ${t.promoBorder};border-radius:4px;font-size:${fs.footer};font-weight:700;color:${t.positive};margin-bottom:10px;">✓ ${esc(reportData.promotedTo || "Promoted")}</div>`
      : "";

  // Student info — labels are static strings (safe); values are DB-backed and
  // must be escaped at the interpolation site below.
  const infoFields = [
    ["Student", reportData.student?.name || "—"],
    [
      "Class / Section",
      `${reportData.student?.className || ""} / ${reportData.student?.section || ""}`,
    ],
    ["Roll No.", reportData.student?.rollNo || "—"],
    ["DOB", reportData.student?.dateOfBirth || "—"],
    ["Examination", reportData.examType || "—"],
  ];
  const infoRows = infoFields
    .map(
      ([label, value]) =>
        `<div style="display:flex;gap:6px;"><span style="color:#888;min-width:${isA5 ? "70px" : "90px"};font-size:${fs.info};">${label}:</span><span style="font-weight:600;color:${t.primary};font-size:${fs.info};">${esc(value)}</span></div>`,
    )
    .join("");

  // Logo URL must be validated BEFORE embedding as <img src>. Puppeteer will
  // fetch whatever URL is set here — an internal URL (e.g. AWS IMDS, localhost
  // services, file://) would trigger SSRF on the server.
  const rawLogoUrl = reportData.school?.logo || "";
  const logoUrl = isSafeLogoUrl(rawLogoUrl) ? rawLogoUrl : "";
  const logoHtml = logoUrl
    ? `<img src="${esc(logoUrl)}" style="width:${fs.logoSize};height:${fs.logoSize};object-fit:contain;border-radius:4px;" />`
    : "";
  const nepaliNameHtml =
    cols.showNepaliName && reportData.school?.nameNp
      ? `<p style="font-size:${fs.schoolNp};color:${t.primary};font-family:Georgia,'Noto Serif',serif;margin-bottom:1px;">${esc(reportData.school.nameNp)}</p>`
      : "";
  const schoolNameBlock = `
    <h2 style="font-size:${fs.schoolName};font-weight:700;color:${t.primary};margin-bottom:2px;">${esc(reportData.school?.name || "")}</h2>
    ${nepaliNameHtml}
    <p style="font-size:${fs.address};color:#888;margin-bottom:6px;">${esc(reportData.school?.address || "")}</p>`;

  const examBadgeHtml = `<div style="display:inline-block;padding:3px 14px;background:${t.badgeBg};color:${t.badgeText};border:${t.badgeBorder};font-size:${fs.badge};font-weight:700;text-transform:uppercase;letter-spacing:1px;border-radius:4px;">
    ${esc(reportData.examType)} — ${esc(reportData.academicYear)} B.S.
  </div>`;

  const pos = cols.logoPosition || "center";
  let headerInnerHtml = "";
  let badgeInline = false;
  if (!logoHtml) {
    // No logo — just centered text
    headerInnerHtml = `${schoolNameBlock}`;
  } else if (pos === "center") {
    headerInnerHtml = `<div style="margin-bottom:4px;">${logoHtml}</div>${schoolNameBlock}`;
  } else if (pos === "left") {
    headerInnerHtml = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
      ${logoHtml}
      <div style="text-align:left;">${schoolNameBlock}</div>
    </div>`;
  } else if (pos === "center-inline") {
    // Nest the exam badge inside the name column (rather than centering it on
    // the full logo+name width) so it lines up under the school name itself.
    badgeInline = true;
    headerInnerHtml = `<div style="display:flex;justify-content:center;align-items:center;gap:12px;margin-bottom:4px;">
      ${logoHtml}
      <div style="text-align:center;">
        ${schoolNameBlock}
        ${examBadgeHtml}
      </div>
    </div>`;
  } else {
    // right
    headerInnerHtml = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
      <div style="text-align:right;flex:1;">${schoolNameBlock}</div>
      ${logoHtml}
    </div>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:;">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Noto Sans', Arial, sans-serif; color: #333; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 0; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  </style>
</head>
<body>
  <div style="border:2px solid ${t.primary};border-radius:4px;overflow:hidden;margin:${isA5 ? "2mm" : "3mm"};min-height:${cardMinHeight(isA5)};display:flex;flex-direction:column;">
    <div style="padding:${pad.header};border-bottom:2px solid ${t.primary};text-align:center;">
      ${headerInnerHtml}
      ${badgeInline ? "" : examBadgeHtml}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;padding:${pad.info};background:${t.infoBg};border-bottom:1px solid ${t.border};">
      ${infoRows}
    </div>
    <table>
      <thead>
        <tr style="background:${t.theadBg};">
          ${theadHtml}
        </tr>
      </thead>
      <tbody>
        ${subjectRows}
        ${buildTableFillerRows(theadHtml, t.border, (reportData.subjects || []).length, isA5)}
      </tbody>
    </table>
    <div style="flex:1;padding:${pad.bottom};border-top:2px solid ${t.primary};display:flex;flex-direction:column;justify-content:space-between;">
      <div>
        ${bottomInfoHtml}
        <div style="display:flex;gap:${isA5 ? "12px" : "20px"};flex-wrap:wrap;margin-bottom:8px;">
          ${observationHtml}
          ${resultSummaryHtml}
          ${gradingScaleHtml}
        </div>
        ${commentsHtml}
        ${promotionHtml}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:${isA5 ? "16px" : "24px"};">
        ${issueDateHtml(fs.sig)}
        ${["Class Teacher", "Exam Coordinator", "Principal"].map((role) => `<div style="text-align:center;min-width:${isA5 ? "70px" : "100px"};"><div style="border-bottom:1px solid ${t.border};height:${isA5 ? "14px" : "20px"};margin-bottom:3px;"></div><span style="font-size:${fs.sig};font-weight:600;">${role}</span></div>`).join("")}
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─── CREDIT-HOUR / GRADE-POINT REPORT (SEE/NEB style) ───
// Used only when reportData.gradingStyle === "CREDIT_GRADE_BASED" (see the
// branch at the top of buildReportCardHtml). This is a deliberately
// self-contained template — it does not share rendering code with
// buildReportCardHtml above, so nothing here can change how the existing
// marks-based report renders.
function buildCreditGradeReportCardHtml(
  reportData: any,
  mode: "color" | "bw",
  cols: ReportCardColumnSettings,
  observations: any[] | null,
): string {
  const t = getTheme(mode);
  const paperSize = reportData.paperSize || "A4";
  const isA5 = paperSize === "A5";

  const logoSizeMap: Record<string, string> = {
    small: isA5 ? "28px" : "35px",
    medium: isA5 ? "40px" : "55px",
    large: isA5 ? "55px" : "75px",
  };
  const computedLogoSize = logoSizeMap[cols.logoSize] || logoSizeMap["medium"];
  const fs = {
    schoolName: isA5 ? "17px" : "22px",
    schoolNp: isA5 ? "11px" : "13px",
    address: isA5 ? "8px" : "10px",
    logoSize: computedLogoSize,
    badge: isA5 ? "8px" : "10px",
    info: isA5 ? "9px" : "10px",
    th: isA5 ? "8px" : "10px",
    td: isA5 ? "8px" : "10px",
    footer: isA5 ? "9px" : "11px",
    sig: isA5 ? "8px" : "10px",
    legend: isA5 ? "8px" : "9px",
  };
  const pad = {
    header: isA5 ? "8px 10px" : "12px 16px",
    info: isA5 ? "6px 10px" : "10px 16px",
    cell: isA5 ? "6px 3px" : "9px 8px",
    cellCenter: isA5 ? "6px 2px" : "9px 4px",
    bottom: isA5 ? "10px 10px" : "14px 16px",
  };

  const hasPracticalCol =
    cols.showTheoryPrac &&
    (reportData.subjects || []).some((s: any) => s.practicalGrade !== null);

  const subjectRows = (reportData.subjects || [])
    .map((s: any, i: number) => {
      const bg = i % 2 === 0 ? "#ffffff" : t.altRow;
      let midCols = "";
      if (hasPracticalCol) {
        midCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">${s.isAbsent ? "NG" : esc(s.theoryGrade)}</td>`;
        // A theory-only subject has no practical column value even when absent
        // (practicalGrade is null); keep the structural "—" rather than NG.
        midCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">${s.practicalGrade === null ? "—" : (s.isAbsent ? "NG" : esc(s.practicalGrade))}</td>`;
      }
      let resultCols = "";
      if (cols.showGrade) {
        resultCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};font-weight:700;color:${t.primary};">${s.isAbsent ? "NG" : esc(s.finalGrade)}</td>`;
      }
      if (cols.showGpa) {
        resultCols += `<td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">${s.isAbsent ? "NG" : esc(s.gradePoint)}</td>`;
      }
      return `<tr style="background:${bg};">
        <td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};color:${t.pct};">${i + 1}</td>
        <td style="padding:${pad.cell};border:1px solid ${t.border};font-size:${fs.td};font-weight:500;">${esc(s.subjectName)}</td>
        <td style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.border};font-size:${fs.td};">${esc(s.creditHour)}</td>
        ${midCols}
        ${resultCols}
      </tr>`;
    })
    .join("");

  let theadMid = "";
  if (hasPracticalCol) {
    theadMid += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.headerBg};color:${t.headerText};font-size:${fs.th};font-weight:600;">Theory</th>`;
    theadMid += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.headerBg};color:${t.headerText};font-size:${fs.th};font-weight:600;">Prac.</th>`;
  }
  let resultHeaders = "";
  if (cols.showGrade) {
    resultHeaders += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.accentBg};color:${t.headerText};font-size:${fs.th};font-weight:600;">Final Grade</th>`;
  }
  if (cols.showGpa) {
    resultHeaders += `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};background:${t.accentBg};color:${t.headerText};font-size:${fs.th};font-weight:600;">Grade Point</th>`;
  }

  // Assembled header row — see the matching comment in buildReportCardHtml.
  const theadHtml = `<th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};color:${t.headerText};font-size:${fs.th};font-weight:600;width:${isA5 ? "6%" : "5%"};">S.N.</th>
          <th style="text-align:left;padding:${pad.cell};border:1px solid ${t.primary};color:${t.headerText};font-size:${fs.th};font-weight:600;width:28%;">Subject</th>
          <th style="text-align:center;padding:${pad.cellCenter};border:1px solid ${t.primary};color:${t.headerText};font-size:${fs.th};font-weight:600;">Credit Hr.</th>
          ${theadMid}
          ${resultHeaders}`;

  // A student fails the term if any subject landed in a failing band — see
  // FAILING_GRADES in grading.service. Keyed off the grade rather than a
  // percentage because the credit-grade payload carries grades, not marks.
  // Same reasoning as the marks-based template above.
  const anyAbsentCG = (reportData.subjects || []).some((s: any) => s.isAbsent || s.notEntered);
  const anyFailed = !anyAbsentCG && (reportData.subjects || []).some(
    (s: any) => !s.isAbsent && !isPassingGrade(s.finalGrade),
  );
  const cgResult = anyAbsentCG ? "Incomplete" : (anyFailed ? "Fail" : "Pass");
  const cgResultColor = cgResult === "Pass" ? t.positive : t.accent;
  const resultSummaryHtml = `
    <div style="margin-bottom:8px;">
      <table style="border-collapse:collapse;width:auto;table-layout:auto;">
        <caption style="text-align:left;font-weight:700;font-size:${fs.footer};color:${t.primary};padding-bottom:3px;">Result</caption>
        <tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:600;">Grade Points Average</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:700;color:${t.primary};">${esc(reportData.overallGpa ?? "—")}</td></tr>
        <tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:600;">Result</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:700;color:${cgResultColor};">${cgResult}</td></tr>
      </table>
    </div>`;

  const gradingScaleHtml = `
    <div style="margin-bottom:8px;">
      <table style="border-collapse:collapse;width:auto;table-layout:auto;">
        <caption style="text-align:left;font-weight:700;font-size:${fs.footer};color:${t.primary};padding-bottom:3px;">Grading and Marking System</caption>
        ${GRADING_SCALE.map((row) => `<tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:600;">${row.grade}</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};">${row.range}</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:700;">${row.gpa ?? "—"}</td></tr>`).join("")}
        <tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:600;">NG</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};" colspan="2">Not Graded</td></tr>
        <tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:600;">Ab</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};" colspan="2">Absent</td></tr>
      </table>
    </div>`;

  const observationHtml =
    observations && observations.length > 0
      ? `
    <div style="margin-bottom:8px;">
      <table style="border-collapse:collapse;width:auto;table-layout:auto;">
        <caption style="text-align:left;font-weight:700;font-size:${fs.footer};color:${t.primary};padding-bottom:3px;">General Observation</caption>
        ${observations.map((obs: any) => `<tr><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};">${esc(obs.categoryName)}</td><td style="border:1px solid ${t.border};padding:3px 8px;font-size:${fs.legend};font-weight:700;color:${t.primary};text-align:center;">${esc(obs.grade)}</td></tr>`).join("")}
      </table>
    </div>`
      : "";

  const commentsHtml =
    cols.showRemarks && reportData.remarks
      ? `<div style="margin-bottom:8px;padding:6px 8px;background:${t.rankAttBg};border-radius:4px;font-size:${fs.footer};"><span style="font-weight:700;color:${t.primary};">Comments: </span><b>${esc(reportData.remarks)}</b></div>`
      : "";

  const promotionHtml =
    cols.showPromotion && reportData.promoted
      ? `<div style="text-align:center;padding:6px;background:${t.promoBg};border:1px solid ${t.promoBorder};border-radius:4px;font-size:${fs.footer};font-weight:700;color:${t.positive};margin-bottom:10px;">✓ ${esc(reportData.promotedTo || "Promoted")}</div>`
      : "";

  let bottomInfoHtml = "";
  const infoParts: string[] = [];
  if (cols.showRank && reportData.showRank && reportData.rank) {
    infoParts.push(
      `<span style="font-weight:600;color:${t.accent};font-size:${fs.footer};">Rank: ${esc(reportData.rank)} out of ${esc(reportData.totalStudents)}</span>`,
    );
  }
  if (cols.showAttendance && reportData.attendance) {
    infoParts.push(
      `<span style="font-weight:600;color:${t.primary};font-size:${fs.footer};">Attendance:</span> <span style="font-size:${fs.footer};">Total: <b>${esc(reportData.attendance.totalDays)}</b></span> <span style="font-size:${fs.footer};">Present: <b>${esc(reportData.attendance.presentDays)}</b></span> <span style="font-size:${fs.footer};">Absent: <b>${esc(reportData.attendance.absentDays)}</b></span>`,
    );
  }
  if (infoParts.length > 0) {
    bottomInfoHtml = `<div style="display:flex;gap:16px;align-items:center;font-size:${fs.footer};margin-bottom:8px;padding:6px 8px;background:${t.rankAttBg};border-radius:4px;flex-wrap:wrap;">${infoParts.join('<span style="color:#ccc;margin:0 4px;">|</span>')}</div>`;
  }

  const infoFields = [
    ["Student", reportData.student?.name || "—"],
    [
      "Class / Section",
      `${reportData.student?.className || ""} / ${reportData.student?.section || ""}`,
    ],
    ["Roll No.", reportData.student?.rollNo || "—"],
    ["DOB", reportData.student?.dateOfBirth || "—"],
    ["Examination", reportData.examType || "—"],
  ];
  const infoRows = infoFields
    .map(
      ([label, value]) =>
        `<div style="display:flex;gap:6px;"><span style="color:#888;min-width:${isA5 ? "70px" : "90px"};font-size:${fs.info};">${label}:</span><span style="font-weight:600;color:${t.primary};font-size:${fs.info};">${esc(value)}</span></div>`,
    )
    .join("");

  const rawLogoUrl = reportData.school?.logo || "";
  const logoUrl = isSafeLogoUrl(rawLogoUrl) ? rawLogoUrl : "";
  const logoHtml = logoUrl
    ? `<img src="${esc(logoUrl)}" style="width:${fs.logoSize};height:${fs.logoSize};object-fit:contain;border-radius:4px;" />`
    : "";
  const nepaliNameHtml =
    cols.showNepaliName && reportData.school?.nameNp
      ? `<p style="font-size:${fs.schoolNp};color:${t.primary};font-family:Georgia,'Noto Serif',serif;margin-bottom:1px;">${esc(reportData.school.nameNp)}</p>`
      : "";
  const schoolNameBlock = `
    <h2 style="font-size:${fs.schoolName};font-weight:700;color:${t.primary};margin-bottom:2px;">${esc(reportData.school?.name || "")}</h2>
    ${nepaliNameHtml}
    <p style="font-size:${fs.address};color:#888;margin-bottom:6px;">${esc(reportData.school?.address || "")}</p>`;

  const examBadgeHtml = `<div style="display:inline-block;padding:3px 14px;background:${t.badgeBg};color:${t.badgeText};border:${t.badgeBorder};font-size:${fs.badge};font-weight:700;text-transform:uppercase;letter-spacing:1px;border-radius:4px;">
    ${esc(reportData.examType)} — ${esc(reportData.academicYear)} B.S.
  </div>`;

  const pos = cols.logoPosition || "center";
  let headerInnerHtml = "";
  let badgeInline = false;
  if (!logoHtml) {
    headerInnerHtml = `${schoolNameBlock}`;
  } else if (pos === "center") {
    headerInnerHtml = `<div style="margin-bottom:4px;">${logoHtml}</div>${schoolNameBlock}`;
  } else if (pos === "left") {
    headerInnerHtml = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
      ${logoHtml}
      <div style="text-align:left;">${schoolNameBlock}</div>
    </div>`;
  } else if (pos === "center-inline") {
    badgeInline = true;
    headerInnerHtml = `<div style="display:flex;justify-content:center;align-items:center;gap:12px;margin-bottom:4px;">
      ${logoHtml}
      <div style="text-align:center;">
        ${schoolNameBlock}
        ${examBadgeHtml}
      </div>
    </div>`;
  } else {
    headerInnerHtml = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
      <div style="text-align:right;flex:1;">${schoolNameBlock}</div>
      ${logoHtml}
    </div>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:;">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Noto Sans', Arial, sans-serif; color: #333; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 0; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  </style>
</head>
<body>
  <div style="border:2px solid ${t.primary};border-radius:4px;overflow:hidden;margin:${isA5 ? "2mm" : "3mm"};min-height:${cardMinHeight(isA5)};display:flex;flex-direction:column;">
    <div style="padding:${pad.header};border-bottom:2px solid ${t.primary};text-align:center;">
      ${headerInnerHtml}
      ${badgeInline ? "" : examBadgeHtml}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;padding:${pad.info};background:${t.infoBg};border-bottom:1px solid ${t.border};">
      ${infoRows}
    </div>
    <table>
      <thead>
        <tr style="background:${t.theadBg};">
          ${theadHtml}
        </tr>
      </thead>
      <tbody>
        ${subjectRows}
        ${buildTableFillerRows(theadHtml, t.border, (reportData.subjects || []).length, isA5)}
      </tbody>
    </table>
    <div style="flex:1;padding:${pad.bottom};border-top:2px solid ${t.primary};display:flex;flex-direction:column;justify-content:space-between;">
      <div>
        ${bottomInfoHtml}
        <div style="display:flex;gap:${isA5 ? "12px" : "20px"};flex-wrap:wrap;margin-bottom:8px;">
          ${observationHtml}
          ${resultSummaryHtml}
          ${gradingScaleHtml}
        </div>
        ${commentsHtml}
        ${promotionHtml}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:${isA5 ? "16px" : "24px"};">
        ${issueDateHtml(fs.sig)}
        ${["Class Teacher", "Exam Coordinator", "Principal"].map((role) => `<div style="text-align:center;min-width:${isA5 ? "70px" : "100px"};"><div style="border-bottom:1px solid ${t.border};height:${isA5 ? "14px" : "20px"};margin-bottom:3px;"></div><span style="font-size:${fs.sig};font-weight:600;">${role}</span></div>`).join("")}
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
  cols: ReportCardColumnSettings = defaultColumnSettings,
): string {
  const pages = reportDataArray
    .map((reportData, index) => {
      const singleHtml = buildReportCardHtml(
        reportData,
        mode,
        cols,
        reportData._observations || null,
      );
      const bodyMatch = singleHtml.match(/<body>([\s\S]*)<\/body>/);
      const bodyContent = bodyMatch ? bodyMatch[1] : "";
      const pageBreak =
        index < reportDataArray.length - 1 ? `page-break-after: always;` : "";
      return `<div style="${pageBreak}">${bodyContent}</div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:;">
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
