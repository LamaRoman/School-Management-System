import { Router } from "express";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { verifyAcademicYear } from "../utils/schoolScope";
import {
  calculatePercentage,
} from "../services/grading.service";

const router = Router();

// ─── Dashboard cache ──────────────────────────────────────
// This is the admin's landing page, and everything on it except today's
// present/absent counts derives from data that changes a few times a term —
// marks entry, a new enrolment — not a few times a minute. Recomputing all of
// it on every load was the bulk of P5.
//
// Deliberately in-process rather than Redis: one Railway instance, and the
// worst case of a cold cache is the same work the endpoint used to do every
// time. Keyed by school *and* year: the school half is redundant today (a year
// id belongs to exactly one school and is verified above) but it makes the
// tenancy boundary visible at the point where a leak would be worst.
const DASHBOARD_TTL_MS = 5 * 60 * 1000;

type CachedDashboard = {
  summary: { totalStudents: number; totalTeachers: number; overallAttendanceRate: number };
  classAverages: unknown;
  topPerformers: unknown;
  subjectStats: unknown;
  subjectStatsExam: { name: string; inferred: boolean } | null;
  attendanceOverview: unknown;
  termComparison: unknown;
};

const dashboardCache = new Map<string, { expiresAt: number; data: CachedDashboard }>();

const dashboardKey = (schoolId: string, yearId: string) => `${schoolId}::${yearId}`;

function readDashboardCache(schoolId: string, yearId: string): CachedDashboard | null {
  const hit = dashboardCache.get(dashboardKey(schoolId, yearId));
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    dashboardCache.delete(dashboardKey(schoolId, yearId));
    return null;
  }
  return hit.data;
}

function writeDashboardCache(schoolId: string, yearId: string, data: CachedDashboard): void {
  // Drop anything already expired so the map can't grow without bound as
  // schools and years accumulate.
  const now = Date.now();
  for (const [key, entry] of dashboardCache) {
    if (entry.expiresAt <= now) dashboardCache.delete(key);
  }
  dashboardCache.set(dashboardKey(schoolId, yearId), { expiresAt: now + DASHBOARD_TTL_MS, data });
}

/** Test hook — the suite needs a cold cache between cases. */
export function clearDashboardCache(): void {
  dashboardCache.clear();
}

// GET /api/analytics/dashboard?academicYearId=xxx&todayBS=2081/12/14
router.get("/dashboard", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { academicYearId, todayBS } = req.query;

  const yearId = academicYearId
    ? String(academicYearId)
    : (await prisma.academicYear.findFirst({ where: { isActive: true, schoolId } }))?.id;

  if (yearId) await verifyAcademicYear(yearId, schoolId);

  if (!yearId) {
    return res.json({ data: null });
  }

  // Today's counts are deliberately outside the cache: an admin watching
  // attendance arrive through the morning should see it arrive. It is one
  // grouped count, so serving it fresh on a cache hit is nearly free.
  const todayCounts = async () => {
    let todayPresent = 0;
    let todayAbsent = 0;
    if (todayBS) {
      const byStatus = await prisma.dailyAttendance.groupBy({
        by: ["status"],
        where: { date: String(todayBS), academicYearId: yearId },
        _count: { _all: true },
      });
      todayPresent = byStatus.find((r) => r.status === "PRESENT")?._count._all ?? 0;
      todayAbsent = byStatus.find((r) => r.status === "ABSENT")?._count._all ?? 0;
    }
    return { todayPresent, todayAbsent };
  };

  const cached = readDashboardCache(schoolId, yearId);
  if (cached) {
    const { todayPresent, todayAbsent } = await todayCounts();
    return res.json({
      data: { ...cached, summary: { ...cached.summary, todayPresent, todayAbsent } },
    });
  }

  const [grades, examTypes] = await Promise.all([
    prisma.grade.findMany({
      where: { academicYearId: yearId },
      orderBy: { displayOrder: "asc" },
      include: {
        sections: {
          include: {
            students: { where: { isActive: true }, select: { id: true } },
          },
        },
        subjects: { select: { id: true, name: true, fullTheoryMarks: true, fullPracticalMarks: true, passMarks: true } },
      },
    }),
    prisma.examType.findMany({
      where: { academicYearId: yearId },
      orderBy: { displayOrder: "asc" },
    }),
  ]);

  // studentId → gradeId, for every active student in the year. Every panel
  // below used to re-derive its slice of this with its own query per grade.
  const gradeOfStudent = new Map<string, string>();
  for (const grade of grades) {
    for (const section of grade.sections) {
      for (const student of section.students) gradeOfStudent.set(student.id, grade.id);
    }
  }
  const activeStudentIds = [...gradeOfStudent.keys()];

  // R8 — which exam the subject-wise pass/fail panel is about.
  //
  // This used to be `examTypes[examTypes.length - 1]`: the last one by
  // displayOrder. Adding a makeup or supplementary exam, or reordering the
  // list, silently pointed the panel at the wrong exam — no error, just wrong
  // numbers on the dashboard.
  //
  // `isFinal` is the flag that actually means it, so prefer it. But it is
  // opt-in and defaults to false, and no exam type in the dev database has it
  // set — a school that never ticked the box would get an empty panel where it
  // used to get a populated one. So fall back to display order rather than
  // showing nothing, and report which way it was resolved: the response
  // carries the exam's name so the panel can say what it is looking at, which
  // is the part that turns a silently wrong number into a visibly wrong one.
  const finalExam =
    [...examTypes].reverse().find((e) => e.isFinal) ?? examTypes[examTypes.length - 1] ?? null;
  const subjectStatsExam = finalExam
    ? { name: finalExam.name, inferred: !finalExam.isFinal }
    : null;

  // Two batches rather than one Promise.all of five: the pool is 5 connections
  // (utils/prisma.ts), and the landing page should not be able to hold all of
  // them at once while two admins log in together.
  const [consolidatedResults, topPerformers, allAttendances] = await Promise.all([
    prisma.consolidatedResult.findMany({
      where: { academicYearId: yearId, studentId: { in: activeStudentIds } },
      select: { studentId: true, gradeId: true, totalGpa: true, totalPercentage: true },
    }),
    prisma.consolidatedResult.findMany({
      where: { academicYearId: yearId },
      orderBy: { totalPercentage: "desc" },
      take: 10,
      include: {
        student: { select: { name: true, section: { include: { grade: { select: { name: true } } } } } },
      },
    }),
    prisma.attendance.findMany({
      where: { academicYearId: yearId },
      select: {
        presentDays: true,
        totalDays: true,
        student: { select: { section: { select: { gradeId: true } } } },
      },
    }),
  ]);

  const [examMarks, totalTeachers] = await Promise.all([
    // Every mark in the year, once. The per-exam loop below used to fetch
    // these one exam at a time with `include: { subject: true }`, joining a
    // full subject row onto every mark; the subject data it needed is already
    // loaded above with the grades.
    examTypes.length > 0
      ? prisma.mark.findMany({
          where: { academicYearId: yearId, examTypeId: { in: examTypes.map((e) => e.id) } },
          select: {
            studentId: true,
            examTypeId: true,
            subjectId: true,
            theoryMarks: true,
            practicalMarks: true,
          },
        })
      : Promise.resolve([]),
    prisma.teacher.count({ where: { isActive: true, schoolId } }),
  ]);

  // ─── 1. Class-wise average GPA ─────────────────────
  const resultsByGrade = new Map<string, { totalGpa: number | null; totalPercentage: number | null }[]>();
  for (const r of consolidatedResults) {
    // A result whose gradeId disagrees with where its student sits now (a
    // mid-year move) belonged to neither grade under the old per-grade query,
    // which filtered on gradeId *and* that grade's students. Keep that.
    if (gradeOfStudent.get(r.studentId) !== r.gradeId) continue;
    const bucket = resultsByGrade.get(r.gradeId);
    if (bucket) bucket.push(r);
    else resultsByGrade.set(r.gradeId, [r]);
  }

  const studentCountByGrade = new Map<string, number>();
  for (const gradeId of gradeOfStudent.values()) {
    studentCountByGrade.set(gradeId, (studentCountByGrade.get(gradeId) ?? 0) + 1);
  }

  const classAverages = grades.map((grade) => {
    const studentCount = studentCountByGrade.get(grade.id) ?? 0;
    const results = resultsByGrade.get(grade.id) ?? [];
    if (studentCount === 0 || results.length === 0) {
      return { gradeName: grade.name, avgGpa: 0, avgPct: 0, studentCount };
    }
    return {
      gradeName: grade.name,
      avgGpa: parseFloat((results.reduce((a, r) => a + (r.totalGpa || 0), 0) / results.length).toFixed(2)),
      avgPct: parseFloat((results.reduce((a, r) => a + (r.totalPercentage || 0), 0) / results.length).toFixed(1)),
      studentCount,
    };
  });

  // ─── 2. Top performers ────────────────────────────
  const topPerformersList = topPerformers.map((r, i) => ({
    rank: i + 1,
    studentName: r.student.name,
    gradeName: r.student.section.grade.name,
    sectionName: r.student.section.name,
    gpa: r.totalGpa || 0,
    percentage: r.totalPercentage || 0,
  }));

  // ─── 3. Subject-wise pass/fail ───────────────────
  const subjectStats: { subjectName: string; gradeName: string; totalStudents: number; passed: number; failed: number; passRate: number }[] = [];

  const finalExamMarksBySubject = new Map<string, typeof examMarks>();
  if (finalExam) {
    for (const m of examMarks) {
      if (m.examTypeId !== finalExam.id) continue;
      // Only active students, as the per-grade query's studentId filter did.
      if (!gradeOfStudent.has(m.studentId)) continue;
      const bucket = finalExamMarksBySubject.get(m.subjectId);
      if (bucket) bucket.push(m);
      else finalExamMarksBySubject.set(m.subjectId, [m]);
    }
  }

  for (const grade of grades) {
    if (grade.subjects.length === 0) continue;
    if ((studentCountByGrade.get(grade.id) ?? 0) === 0) continue;
    if (!finalExam) continue;

    for (const subject of grade.subjects) {
      // A subject belongs to one grade, so its marks can only come from that
      // grade's students — but pin it anyway, since the old query's studentId
      // filter made that explicit.
      const subjectMarks = (finalExamMarksBySubject.get(subject.id) ?? []).filter(
        (m) => gradeOfStudent.get(m.studentId) === grade.id
      );
      if (subjectMarks.length === 0) continue;

      let passed = 0;
      let failed = 0;

      for (const m of subjectMarks) {
        const total = (m.theoryMarks || 0) + (m.practicalMarks || 0);
        if (total >= subject.passMarks) passed++;
        else failed++;
      }

      subjectStats.push({
        subjectName: subject.name,
        gradeName: grade.name,
        totalStudents: subjectMarks.length,
        passed,
        failed,
        passRate: parseFloat(((passed / subjectMarks.length) * 100).toFixed(1)),
      });
    }
  }

  // ─── 4. Attendance overview ────────────────────────
  const overallPresentDays = allAttendances.reduce((a, r) => a + r.presentDays, 0);
  const overallTotalDays = allAttendances.reduce((a, r) => a + r.totalDays, 0);
  const overallAttendanceRate = overallTotalDays > 0
    ? parseFloat(((overallPresentDays / overallTotalDays) * 100).toFixed(1))
    : 0;

  // Per-grade attendance. Matched on gradeId rather than grade *name* as
  // before — same result, minus the assumption that names are unique.
  const attendanceByGrade = new Map<string, { present: number; total: number }>();
  for (const a of allAttendances) {
    const gradeId = a.student.section.gradeId;
    const bucket = attendanceByGrade.get(gradeId) ?? { present: 0, total: 0 };
    bucket.present += a.presentDays;
    bucket.total += a.totalDays;
    attendanceByGrade.set(gradeId, bucket);
  }

  const gradeAttendance = grades.map((grade) => {
    const bucket = attendanceByGrade.get(grade.id);
    return {
      gradeName: grade.name,
      rate: bucket && bucket.total > 0
        ? parseFloat(((bucket.present / bucket.total) * 100).toFixed(1))
        : 0,
    };
  });

  // ─── 5. Term comparison ────────────────────────────
  // Full marks come from the subjects already loaded with the grades. A mark
  // can in principle reference a subject from another year's grade — nothing
  // enforces that pairing (the S4 class of gap) — so fetch any stragglers
  // rather than silently dropping them from the average.
  const fullMarksBySubject = new Map<string, number>();
  for (const grade of grades) {
    for (const s of grade.subjects) {
      fullMarksBySubject.set(s.id, s.fullTheoryMarks + s.fullPracticalMarks);
    }
  }
  const unknownSubjectIds = [
    ...new Set(examMarks.map((m) => m.subjectId).filter((id) => !fullMarksBySubject.has(id))),
  ];
  if (unknownSubjectIds.length > 0) {
    const extra = await prisma.subject.findMany({
      where: { id: { in: unknownSubjectIds } },
      select: { id: true, fullTheoryMarks: true, fullPracticalMarks: true },
    });
    for (const s of extra) {
      fullMarksBySubject.set(s.id, s.fullTheoryMarks + s.fullPracticalMarks);
    }
  }

  const perExamStudents = new Map<string, Map<string, { totalPct: number; count: number }>>();
  for (const exam of examTypes) perExamStudents.set(exam.id, new Map());
  for (const m of examMarks) {
    const studentMap = perExamStudents.get(m.examTypeId);
    if (!studentMap) continue;
    const fullMarks = fullMarksBySubject.get(m.subjectId) ?? 0;
    const obtained = (m.theoryMarks || 0) + (m.practicalMarks || 0);
    const pct = calculatePercentage(obtained, fullMarks);

    const entry = studentMap.get(m.studentId) || { totalPct: 0, count: 0 };
    entry.totalPct += pct;
    entry.count++;
    studentMap.set(m.studentId, entry);
  }

  const termComparison = examTypes.map((exam) => {
    const studentMap = perExamStudents.get(exam.id)!;
    if (studentMap.size === 0) {
      return { examName: exam.name, avgPercentage: 0, studentCount: 0 };
    }
    const studentAvgs = [...studentMap.values()].map((e) => e.totalPct / e.count);
    return {
      examName: exam.name,
      avgPercentage: parseFloat(
        (studentAvgs.reduce((a, b) => a + b, 0) / studentAvgs.length).toFixed(1)
      ),
      studentCount: studentMap.size,
    };
  });

  // ─── Summary stats ────────────────────────────────
  const totalStudents = activeStudentIds.length;

  const payload: CachedDashboard = {
    summary: { totalStudents, totalTeachers, overallAttendanceRate },
    classAverages,
    topPerformers: topPerformersList,
    subjectStats,
    subjectStatsExam,
    attendanceOverview: {
      overallRate: overallAttendanceRate,
      gradeWise: gradeAttendance,
    },
    termComparison,
  };
  writeDashboardCache(schoolId, yearId, payload);

  const { todayPresent, todayAbsent } = await todayCounts();

  res.json({
    data: { ...payload, summary: { ...payload.summary, todayPresent, todayAbsent } },
  });
});

// GET /api/analytics/absent-students?date=2081/12/14&academicYearId=xxx
// Returns absent students for a given BS date, grouped by grade → section
router.get("/absent-students", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { date, academicYearId } = req.query;

  if (!date) {
    return res.status(400).json({ error: "date is required" });
  }

  const yearId = academicYearId
    ? String(academicYearId)
    : (await prisma.academicYear.findFirst({ where: { isActive: true, schoolId } }))?.id;

  if (yearId) await verifyAcademicYear(yearId, schoolId);

  if (!yearId) {
    return res.json({ data: [] });
  }

  const absentRecords = await prisma.dailyAttendance.findMany({
    where: {
      date: String(date),
      status: "ABSENT",
      academicYearId: yearId,
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          rollNo: true,
          section: {
            select: {
              id: true,
              name: true,
              grade: {
                select: {
                  id: true,
                  name: true,
                  displayOrder: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ student: { section: { grade: { displayOrder: "asc" } } } }],
  });

  // Group by grade → section
  const grouped: Record<
    string,
    {
      gradeId: string;
      gradeName: string;
      sections: Record<
        string,
        {
          sectionId: string;
          sectionName: string;
          students: { id: string; name: string; rollNo: number | null }[];
        }
      >;
    }
  > = {};

  for (const record of absentRecords) {
    const { student } = record;
    const grade = student.section.grade;
    const section = student.section;

    if (!grouped[grade.id]) {
      grouped[grade.id] = {
        gradeId: grade.id,
        gradeName: grade.name,
        sections: {},
      };
    }

    if (!grouped[grade.id].sections[section.id]) {
      grouped[grade.id].sections[section.id] = {
        sectionId: section.id,
        sectionName: section.name,
        students: [],
      };
    }

    grouped[grade.id].sections[section.id].students.push({
      id: student.id,
      name: student.name,
      rollNo: student.rollNo,
    });
  }

  // Convert to array, sort students by rollNo within each section
  const result = Object.values(grouped).map((g) => ({
    gradeId: g.gradeId,
    gradeName: g.gradeName,
    sections: Object.values(g.sections).map((s) => ({
      sectionId: s.sectionId,
      sectionName: s.sectionName,
      students: s.students.sort((a, b) => (a.rollNo ?? 999) - (b.rollNo ?? 999)),
    })),
  }));

  res.json({ data: result });
});

export default router;