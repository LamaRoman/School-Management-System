import prisma from "../utils/prisma";
import { calculatePercentage } from "./grading.service";

/**
 * Single source of truth for a section's exam ranking.
 *
 * This existed as three separate implementations — `pdf.routes.ts` (the PDF report
 * card), `report.routes.ts` (the web portal) and `gradeSheet.routes.ts` (the class
 * mark sheet) — which disagreed with each other. Both the report card and the grade
 * sheet are printed and handed out, so the disagreement was visible to parents.
 *
 * ## The rule
 *
 * A student's score is their average percentage **over every subject in their grade**,
 * with a missing mark row scoring 0 — the same basis the grade sheet's Total and
 * Percentage columns have always used.
 *
 * The report card used to divide by *the number of mark rows that student happened to
 * have*, which is what **R6** describes: a student missing one subject was averaged
 * over 7 while their classmates were averaged over 8, so an incomplete record inflated
 * their position. A rank whose divisor changes per student is not a rank. Decided
 * 2026-08-14 in favour of the grade sheet's rule.
 *
 * Marked-absent subjects need no special case: their marks are stored `null`, read as
 * 0, and count toward the average — the **R1** decision, already applied everywhere.
 *
 * ## Ties
 *
 * Standard competition ranking: equal percentages share a rank and the next distinct
 * percentage skips (1, 2, 2, 4). Unchanged from all three previous implementations.
 *
 * ## Who is included
 *
 * Every active student in the section, matching the grade sheet — so `totalStudents`
 * is the real class size. Callers decide what to do about a student with no marks at
 * all for this exam: they rank last on 0%, which is right for the mark sheet, but the
 * report card deliberately prints no rank for them rather than telling a mid-year
 * transfer they came last (see `hasAnyMarks`).
 */
export interface SectionRank {
  rank: number;
  /** False when the student has no mark row at all for this exam. */
  hasAnyMarks: boolean;
  /** The student's average percentage over every subject in the grade. */
  avgPct: number;
}

export interface SectionRanking {
  ranks: Map<string, SectionRank>;
  /** Active students in the section — the class size, not the number ranked. */
  totalStudents: number;
}

/**
 * Compute the whole section's ranking in one pass.
 *
 * Deliberately returns the entire section rather than one student's rank: bulk report
 * card generation used to recompute the identical ranking once per student, loading
 * every mark in the section each time (**P3**). Callers building a batch should call
 * this once and index into the Map.
 */
export async function computeSectionRanks(
  sectionId: string,
  examTypeId: string,
  academicYearId: string
): Promise<SectionRanking> {
  const [students, section] = await Promise.all([
    prisma.student.findMany({
      where: { sectionId, isActive: true },
      select: { id: true },
    }),
    prisma.section.findUniqueOrThrow({
      where: { id: sectionId },
      select: { gradeId: true },
    }),
  ]);

  if (students.length === 0) {
    return { ranks: new Map(), totalStudents: 0 };
  }

  const [subjects, allMarks] = await Promise.all([
    prisma.subject.findMany({
      where: { gradeId: section.gradeId },
      select: { id: true, fullTheoryMarks: true, fullPracticalMarks: true },
    }),
    prisma.mark.findMany({
      where: {
        examTypeId,
        academicYearId,
        studentId: { in: students.map((s) => s.id) },
      },
      select: {
        studentId: true,
        subjectId: true,
        theoryMarks: true,
        practicalMarks: true,
      },
    }),
  ]);

  // Index once — the previous implementations ran a linear `filter` per student and a
  // linear `find` per subject, which is what made this quadratic inside a batch.
  const marksByStudent = new Map<string, Map<string, (typeof allMarks)[number]>>();
  for (const m of allMarks) {
    let forStudent = marksByStudent.get(m.studentId);
    if (!forStudent) {
      forStudent = new Map();
      marksByStudent.set(m.studentId, forStudent);
    }
    forStudent.set(m.subjectId, m);
  }

  const scored = students.map((student) => {
    const studentMarks = marksByStudent.get(student.id);
    let pctSum = 0;
    for (const subject of subjects) {
      const mark = studentMarks?.get(subject.id);
      const obtained = mark ? (mark.theoryMarks || 0) + (mark.practicalMarks || 0) : 0;
      pctSum += calculatePercentage(obtained, subject.fullTheoryMarks + subject.fullPracticalMarks);
    }
    return {
      studentId: student.id,
      avgPct: subjects.length > 0 ? pctSum / subjects.length : 0,
      hasAnyMarks: (studentMarks?.size ?? 0) > 0,
    };
  });

  scored.sort((a, b) => b.avgPct - a.avgPct);

  const ranks = new Map<string, SectionRank>();
  let rank = 0;
  let prevPct = Number.NaN;
  let position = 0;
  for (const s of scored) {
    position++;
    if (s.avgPct !== prevPct) {
      rank = position;
      prevPct = s.avgPct;
    }
    ranks.set(s.studentId, { rank, hasAnyMarks: s.hasAnyMarks, avgPct: s.avgPct });
  }

  return { ranks, totalStudents: students.length };
}
