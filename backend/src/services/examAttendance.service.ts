/**
 * Attendance on the report card: present days / total days, counted from the daily register
 * teachers mark in the app.
 *
 * A term card shows only that term's days: the year-to-date count minus what the previous
 * exam already covered. The annual card shows the whole year. Both are frozen when the
 * admin publishes the exam (`freezeExamAttendance`, called from result-status /publish), so
 * a card reprinted months later still shows the numbers it was released with. Before an
 * exam is published, teachers and admins previewing the card see the live count.
 *
 * "Previous exam" is the closest earlier exam of the year (by display order) that has a
 * frozen snapshot for the student; with none, the term starts at the beginning of the year.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import prisma from "../utils/prisma";

export interface Days {
  present: number;
  total: number;
}

type Db = PrismaClient | Prisma.TransactionClient;
type ExamRef = { id: string; academicYearId: string; displayOrder: number };

/** Year-to-date counts from the daily register, now. */
async function cumulativeNow(db: Db, studentIds: string[], academicYearId: string): Promise<Map<string, Days>> {
  const out = new Map<string, Days>(studentIds.map((id) => [id, { present: 0, total: 0 }]));
  if (studentIds.length === 0) return out;
  const rows = await db.dailyAttendance.groupBy({
    by: ["studentId", "status"],
    where: { studentId: { in: studentIds }, academicYearId },
    _count: { _all: true },
  });
  for (const r of rows) {
    const d = out.get(r.studentId)!;
    d.total += r._count._all;
    if (r.status === "PRESENT") d.present += r._count._all;
  }
  return out;
}

/** What the previous exam already covered: its frozen year-to-date count, per student. */
async function coveredBefore(db: Db, studentIds: string[], exam: ExamRef): Promise<Map<string, Days>> {
  const out = new Map<string, Days>();
  if (studentIds.length === 0) return out;
  const earlier = await db.examAttendance.findMany({
    where: {
      studentId: { in: studentIds },
      examType: { academicYearId: exam.academicYearId, displayOrder: { lt: exam.displayOrder } },
    },
    select: { studentId: true, cumulativePresent: true, cumulativeTotal: true, examType: { select: { displayOrder: true } } },
  });
  const best = new Map<string, number>();
  for (const e of earlier) {
    if ((best.get(e.studentId) ?? -Infinity) >= e.examType.displayOrder) continue;
    best.set(e.studentId, e.examType.displayOrder);
    out.set(e.studentId, { present: e.cumulativePresent, total: e.cumulativeTotal });
  }
  return out;
}

const minus = (a: Days, b: Days | undefined): Days => ({
  present: Math.max(0, a.present - (b?.present ?? 0)),
  total: Math.max(0, a.total - (b?.total ?? 0)),
});

/**
 * Freeze the attendance of every active student in `sectionIds` for this exam, as of now.
 * Re-running it (unpublish, then publish again) replaces the snapshot.
 */
export async function freezeExamAttendance(db: Db, exam: ExamRef, sectionIds: string[]): Promise<void> {
  if (sectionIds.length === 0) return;
  const studentIds = (
    await db.student.findMany({ where: { sectionId: { in: sectionIds }, isActive: true }, select: { id: true } })
  ).map((s) => s.id);
  if (studentIds.length === 0) return;

  const [now, before] = await Promise.all([
    cumulativeNow(db, studentIds, exam.academicYearId),
    coveredBefore(db, studentIds, exam),
  ]);

  await db.examAttendance.deleteMany({ where: { examTypeId: exam.id, studentId: { in: studentIds } } });
  await db.examAttendance.createMany({
    data: studentIds.map((studentId) => {
      const cum = now.get(studentId)!;
      const term = minus(cum, before.get(studentId));
      return {
        studentId,
        examTypeId: exam.id,
        presentDays: term.present,
        totalDays: term.total,
        cumulativePresent: cum.present,
        cumulativeTotal: cum.total,
      };
    }),
  });
}

/**
 * That term's days for each student on this exam's card: the frozen snapshot when there is
 * one, otherwise the live count (not published yet). A fixed number of queries for any
 * number of students, so a whole class prints without a query per student.
 */
export async function termAttendance(studentIds: string[], exam: ExamRef): Promise<Map<string, Days>> {
  // All three in parallel: one round trip instead of two. The live counts are cheap
  // grouped queries, so fetching them for students who turn out to be frozen costs little.
  const [frozen, now, before] = await Promise.all([
    prisma.examAttendance.findMany({
      where: { examTypeId: exam.id, studentId: { in: studentIds } },
      select: { studentId: true, presentDays: true, totalDays: true },
    }),
    cumulativeNow(prisma, studentIds, exam.academicYearId),
    coveredBefore(prisma, studentIds, exam),
  ]);
  const out = new Map<string, Days>(frozen.map((f) => [f.studentId, { present: f.presentDays, total: f.totalDays }]));
  for (const id of studentIds) if (!out.has(id)) out.set(id, minus(now.get(id)!, before.get(id)));
  return out;
}

/**
 * The whole year for the annual card: frozen when the Final exam is published, live before.
 */
export async function yearAttendance(studentId: string, academicYearId: string, finalExamTypeId: string | null): Promise<Days> {
  if (finalExamTypeId) {
    const frozen = await prisma.examAttendance.findUnique({
      where: { studentId_examTypeId: { studentId, examTypeId: finalExamTypeId } },
      select: { cumulativePresent: true, cumulativeTotal: true },
    });
    if (frozen) return { present: frozen.cumulativePresent, total: frozen.cumulativeTotal };
  }
  return (await cumulativeNow(prisma, [studentId], academicYearId)).get(studentId)!;
}

/** How the card receives it: nothing when no attendance was taken in that period. */
export function cardAttendance(d: Days | undefined) {
  return d && d.total > 0 ? { presentDays: d.present, totalDays: d.total } : undefined;
}
