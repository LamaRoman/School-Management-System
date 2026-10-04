import prisma from "../utils/prisma";
import {
  calculatePercentage,
  calculateWeightedPercentage,
  getGradeFromPercentage,
  hasPassed,
  rankPassedOnly,
  studentResult,
  totalMarksPercentage,
  type StudentResult,
} from "./grading.service";

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
 * **Only students who passed are ranked** (decided 2026-10-04). A student who is below the
 * pass mark in any subject, or has an absent / not-yet-entered paper, gets no rank (null) —
 * see `studentResult` / `rankPassedOnly` in grading.service. Among those who passed, the
 * score is the **total-marks percentage** over every subject in their grade (total obtained
 * over total full marks, `totalMarksPercentage`), with a missing mark row scoring 0 — the
 * same figure printed on the report card and the grade sheet.
 *
 * (Until 2026-10-04 everyone was ranked, failed or not, on the plain average of subject
 * percentages; the history below explains why the divisor is every subject.)
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
 * **Optional subjects are the one exception** (**R7a**). A subject with `isOptional`
 * counts only for the students enrolled in it via `StudentOptionalSubject`; for
 * everyone else it is left out of the divisor entirely rather than scored 0.
 *
 * That enrollment table is what makes the two cases separable. The first cut of this
 * inferred "does not take it" from the absence of a mark row, which could not tell a
 * genuine non-enrollment apart from an elective whose mark was merely late — so a late
 * mark silently dropped the subject instead of counting as a zero. With explicit
 * enrollment, an enrolled student with no mark yet scores 0 like any other subject.
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
  /** Position among the students who passed; null for Fail / Incomplete. */
  rank: number | null;
  /** False when the student has no mark row at all for this exam. */
  hasAnyMarks: boolean;
  /** Total-marks percentage, rounded to 1 decimal as printed. */
  pct: number;
  result: StudentResult;
}

export interface SectionRanking {
  ranks: Map<string, SectionRank>;
  /** Active students in the section — the class size, not the number ranked. */
  totalStudents: number;
}

async function gradingStyleOfSection(sectionId: string) {
  const section = await prisma.section.findUniqueOrThrow({
    where: { id: sectionId },
    select: { gradeId: true, grade: { select: { academicYear: { select: { schoolId: true } } } } },
  });
  const settings = await prisma.reportCardSettings.findUnique({
    where: { schoolId: section.grade.academicYear.schoolId },
    select: { gradingStyle: true },
  });
  return { gradeId: section.gradeId, style: settings?.gradingStyle ?? ("MARKS_BASED" as const) };
}

function finish(
  scored: { studentId: string; pct: number; result: StudentResult; hasAnyMarks: boolean }[],
  totalStudents: number,
): SectionRanking {
  const positions = rankPassedOnly(scored);
  const ranks = new Map<string, SectionRank>();
  for (const s of scored) {
    ranks.set(s.studentId, { rank: positions.get(s.studentId) ?? null, hasAnyMarks: s.hasAnyMarks, pct: s.pct, result: s.result });
  }
  return { ranks, totalStudents };
}

const round1 = (n: number) => parseFloat(n.toFixed(1));

/**
 * Compute the whole section's ranking for one exam in one pass.
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
  const [students, { gradeId, style }] = await Promise.all([
    prisma.student.findMany({
      where: { sectionId, isActive: true },
      select: { id: true },
    }),
    gradingStyleOfSection(sectionId),
  ]);

  if (students.length === 0) {
    return { ranks: new Map(), totalStudents: 0 };
  }

  const [subjects, allMarks, optionalEnrollments] = await Promise.all([
    prisma.subject.findMany({
      where: { gradeId },
      select: { id: true, fullTheoryMarks: true, fullPracticalMarks: true, passMarks: true, isOptional: true },
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
        isAbsent: true,
      },
    }),
    prisma.studentOptionalSubject.findMany({
      where: { studentId: { in: students.map((s) => s.id) } },
      select: { studentId: true, subjectId: true },
    }),
  ]);

  const optionalByStudent = new Map<string, Set<string>>();
  for (const e of optionalEnrollments) {
    let set = optionalByStudent.get(e.studentId);
    if (!set) {
      set = new Set();
      optionalByStudent.set(e.studentId, set);
    }
    set.add(e.subjectId);
  }

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
    const takesOptional = optionalByStudent.get(student.id);
    const counted = subjects
      // An optional subject only counts for the students actually enrolled in it.
      // Everyone takes the compulsory ones, so those always count — a missing mark
      // there means "not entered yet" and scores 0, which is the R7 decision.
      .filter((subject) => !subject.isOptional || takesOptional?.has(subject.id))
      .map((subject) => {
        const mark = studentMarks?.get(subject.id);
        const obtained = mark ? (mark.theoryMarks || 0) + (mark.practicalMarks || 0) : 0;
        const fullMarks = subject.fullTheoryMarks + subject.fullPracticalMarks;
        const exact = calculatePercentage(obtained, fullMarks);
        return {
          // Rounded per subject exactly as the report card and grade sheet print it, so the
          // overall figure here is the printed one to the decimal (no rank split between two
          // students whose printed percentages are equal).
          percentage: round1(exact),
          fullMarks,
          grade: getGradeFromPercentage(exact).grade,
          hasPassed: hasPassed(obtained, subject.passMarks),
          isAbsent: mark?.isAbsent ?? false,
          notEntered: !mark,
        };
      });
    const pct = round1(totalMarksPercentage(counted));
    return {
      studentId: student.id,
      pct,
      result: studentResult(getGradeFromPercentage(pct).grade, counted, style),
      hasAnyMarks: (studentMarks?.size ?? 0) > 0,
    };
  });

  return finish(scored, students.length);
}

/**
 * The annual (final, weighted) ranking for a section — one implementation for the annual
 * report card, its PDF and the annual grade sheet, which each used to carry their own copy.
 * Each subject's percentage is the weighted blend of its terms (GradingPolicy); a subject
 * is passed if that percentage reaches the pass mark's share of full marks, and counts as
 * absent only when absent in every term — the same rules the annual report builders use.
 */
export async function computeFinalSectionRanks(
  sectionId: string,
  academicYearId: string
): Promise<SectionRanking> {
  const [students, { gradeId, style }] = await Promise.all([
    prisma.student.findMany({ where: { sectionId, isActive: true }, select: { id: true } }),
    gradingStyleOfSection(sectionId),
  ]);
  if (students.length === 0) return { ranks: new Map(), totalStudents: 0 };

  const [subjects, policies, allMarks] = await Promise.all([
    prisma.subject.findMany({
      where: { gradeId },
      select: { id: true, fullTheoryMarks: true, fullPracticalMarks: true, passMarks: true },
    }),
    prisma.gradingPolicy.findMany({ where: { gradeId }, select: { examTypeId: true, weightagePercent: true } }),
    prisma.mark.findMany({
      where: { academicYearId, studentId: { in: students.map((s) => s.id) } },
      select: { studentId: true, subjectId: true, examTypeId: true, theoryMarks: true, practicalMarks: true, isAbsent: true },
    }),
  ]);

  const markOf = new Map<string, (typeof allMarks)[number]>();
  for (const m of allMarks) markOf.set(`${m.studentId}|${m.subjectId}|${m.examTypeId}`, m);

  const scored = students.map((student) => {
    const counted = subjects.map((subject) => {
      const fullMarks = subject.fullTheoryMarks + subject.fullPracticalMarks;
      const termMarks = policies.map((p) => markOf.get(`${student.id}|${subject.id}|${p.examTypeId}`));
      const exact = calculateWeightedPercentage(
        policies.map((p, i) => ({
          obtained: termMarks[i] ? (termMarks[i]!.theoryMarks || 0) + (termMarks[i]!.practicalMarks || 0) : 0,
          fullMarks,
          weightage: p.weightagePercent,
        }))
      );
      return {
        percentage: round1(exact),
        fullMarks,
        grade: getGradeFromPercentage(exact).grade,
        hasPassed: fullMarks > 0 && exact >= (subject.passMarks / fullMarks) * 100,
        // Same as the annual report builders: absent in every weighted term.
        isAbsent: termMarks.length > 0 && termMarks.every((m) => m?.isAbsent === true),
      };
    });
    const pct = round1(totalMarksPercentage(counted));
    return {
      studentId: student.id,
      pct,
      result: studentResult(getGradeFromPercentage(pct).grade, counted, style),
      hasAnyMarks: allMarks.some((m) => m.studentId === student.id),
    };
  });

  return finish(scored, students.length);
}
