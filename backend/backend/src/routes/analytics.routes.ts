import { Router } from "express";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { verifyAcademicYear } from "../utils/schoolScope";
import {
  calculatePercentage,
} from "../services/grading.service";

const router = Router();

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

  const grades = await prisma.grade.findMany({
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
  });

  const examTypes = await prisma.examType.findMany({
    where: { academicYearId: yearId },
    orderBy: { displayOrder: "asc" },
  });

  // ─── 1. Class-wise average GPA ─────────────────────
  const classAverages: { gradeName: string; avgGpa: number; avgPct: number; studentCount: number }[] = [];

  for (const grade of grades) {
    const studentIds = grade.sections.flatMap((s) => s.students.map((st) => st.id));
    if (studentIds.length === 0) {
      classAverages.push({ gradeName: grade.name, avgGpa: 0, avgPct: 0, studentCount: 0 });
      continue;
    }

    const results = await prisma.consolidatedResult.findMany({
      where: { academicYearId: yearId, gradeId: grade.id, studentId: { in: studentIds } },
    });

    if (results.length === 0) {
      classAverages.push({ gradeName: grade.name, avgGpa: 0, avgPct: 0, studentCount: studentIds.length });
      continue;
    }

    const avgGpa = parseFloat((results.reduce((a, r) => a + (r.totalGpa || 0), 0) / results.length).toFixed(2));
    const avgPct = parseFloat((results.reduce((a, r) => a + (r.totalPercentage || 0), 0) / results.length).toFixed(1));
    classAverages.push({ gradeName: grade.name, avgGpa, avgPct, studentCount: studentIds.length });
  }

  // ─── 2. Top performers ────────────────────────────
  const topPerformers = await prisma.consolidatedResult.findMany({
    where: { academicYearId: yearId },
    orderBy: { totalPercentage: "desc" },
    take: 10,
    include: {
      student: { select: { name: true, section: { include: { grade: { select: { name: true } } } } } },
    },
  });

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

  for (const grade of grades) {
    if (grade.subjects.length === 0) continue;
    const studentIds = grade.sections.flatMap((s) => s.students.map((st) => st.id));
    if (studentIds.length === 0) continue;

    const lastExam = examTypes[examTypes.length - 1];
    if (!lastExam) continue;

    const marks = await prisma.mark.findMany({
      where: {
        academicYearId: yearId,
        examTypeId: lastExam.id,
        studentId: { in: studentIds },
        subjectId: { in: grade.subjects.map((s) => s.id) },
      },
    });

    for (const subject of grade.subjects) {
      const subjectMarks = marks.filter((m) => m.subjectId === subject.id);
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
  const allAttendances = await prisma.attendance.findMany({
    where: { academicYearId: yearId },
    include: {
      student: { select: { section: { include: { grade: { select: { name: true } } } } } },
    },
  });

  const overallPresentDays = allAttendances.reduce((a, r) => a + r.presentDays, 0);
  const overallTotalDays = allAttendances.reduce((a, r) => a + r.totalDays, 0);
  const overallAttendanceRate = overallTotalDays > 0
    ? parseFloat(((overallPresentDays / overallTotalDays) * 100).toFixed(1))
    : 0;

  // Per-grade attendance
  const gradeAttendance: { gradeName: string; rate: number }[] = [];
  for (const grade of grades) {
    const gradeAtt = allAttendances.filter(
      (a) => a.student.section.grade.name === grade.name
    );
    if (gradeAtt.length === 0) {
      gradeAttendance.push({ gradeName: grade.name, rate: 0 });
      continue;
    }
    const present = gradeAtt.reduce((a, r) => a + r.presentDays, 0);
    const total = gradeAtt.reduce((a, r) => a + r.totalDays, 0);
    gradeAttendance.push({
      gradeName: grade.name,
      rate: total > 0 ? parseFloat(((present / total) * 100).toFixed(1)) : 0,
    });
  }

  // ─── 5. Today's attendance counts ─────────────────
  let todayPresent = 0;
  let todayAbsent = 0;

  if (todayBS) {
    const todayRecords = await prisma.dailyAttendance.findMany({
      where: { date: String(todayBS), academicYearId: yearId },
      select: { status: true },
    });
    todayPresent = todayRecords.filter((r) => r.status === "PRESENT").length;
    todayAbsent = todayRecords.filter((r) => r.status === "ABSENT").length;
  }

  // ─── 6. Term comparison ────────────────────────────
  const termComparison: { examName: string; avgPercentage: number; studentCount: number }[] = [];

  for (const exam of examTypes) {
    const examMarks = await prisma.mark.findMany({
      where: { academicYearId: yearId, examTypeId: exam.id },
      include: { subject: true },
    });

    if (examMarks.length === 0) {
      termComparison.push({ examName: exam.name, avgPercentage: 0, studentCount: 0 });
      continue;
    }

    const studentMap = new Map<string, { totalPct: number; count: number }>();
    for (const m of examMarks) {
      const fullMarks = m.subject.fullTheoryMarks + m.subject.fullPracticalMarks;
      const obtained = (m.theoryMarks || 0) + (m.practicalMarks || 0);
      const pct = calculatePercentage(obtained, fullMarks);

      const entry = studentMap.get(m.studentId) || { totalPct: 0, count: 0 };
      entry.totalPct += pct;
      entry.count++;
      studentMap.set(m.studentId, entry);
    }

    const studentAvgs = Array.from(studentMap.values()).map((e) => e.totalPct / e.count);
    const overallAvg = studentAvgs.length > 0
      ? parseFloat((studentAvgs.reduce((a, b) => a + b, 0) / studentAvgs.length).toFixed(1))
      : 0;

    termComparison.push({ examName: exam.name, avgPercentage: overallAvg, studentCount: studentMap.size });
  }

  // ─── Summary stats ────────────────────────────────
  const totalStudents = grades.reduce((a, g) => a + g.sections.reduce((b, s) => b + s.students.length, 0), 0);
  const totalTeachers = await prisma.teacher.count({ where: { isActive: true, schoolId } });

  res.json({
    data: {
      summary: {
        totalStudents,
        totalTeachers,
        todayPresent,
        todayAbsent,
        overallAttendanceRate,
      },
      classAverages,
      topPerformers: topPerformersList,
      subjectStats,
      attendanceOverview: {
        overallRate: overallAttendanceRate,
        gradeWise: gradeAttendance,
      },
      termComparison,
    },
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