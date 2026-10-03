// Pure helpers for the Report Cards screen (class teacher opens / shares report card PDFs).

export type PdfMode = 'color' | 'bw';
export interface ExamRef { id: string; name: string; isFinal?: boolean; paperSize?: string }

/** Backend route for one student's report card (a final exam covers the whole academic year). */
export function studentPdfPath(exam: ExamRef, studentId: string, academicYearId: string, mode: PdfMode): string {
  return exam.isFinal
    ? `/pdf/final/${studentId}/${academicYearId}?mode=${mode}`
    : `/pdf/term/${studentId}/${exam.id}?mode=${mode}`;
}

/** Backend route for the whole section in one PDF. */
export function classPdfPath(exam: ExamRef, sectionId: string, academicYearId: string, mode: PdfMode): string {
  return exam.isFinal
    ? `/pdf/class/final/${sectionId}/${academicYearId}?mode=${mode}`
    : `/pdf/class/term/${sectionId}/${exam.id}?mode=${mode}`;
}

/** A file name that is safe on every phone: letters, digits, dot, dash, underscore; ends in .pdf. */
export function safeFilename(name: string): string {
  const base = name.replace(/\.pdf$/i, '').replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${base || 'report-card'}.pdf`;
}

/** The server's suggested name from Content-Disposition, or the fallback. */
export function filenameFromDisposition(header: string | undefined | null, fallback: string): string {
  const m = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return safeFilename(m ? decodeURIComponentSafe(m[1]) : fallback);
}

function decodeURIComponentSafe(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** True if the bytes really are a PDF (starts with "%PDF"). Guards against saving an error page. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}
