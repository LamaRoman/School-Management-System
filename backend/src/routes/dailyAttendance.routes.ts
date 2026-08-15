import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifySection, verifyAcademicYear, verifyStudent } from "../utils/schoolScope";

const router = Router();

// GET /api/daily-attendance?sectionId=xxx&date=xxx&academicYearId=xxx
router.get("/", authenticate, authorize("ADMIN", "TEACHER"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { sectionId, date, academicYearId } = req.query;
  if (!sectionId || !date || !academicYearId) {
    throw new AppError("sectionId, date, and academicYearId are required");
  }
  await verifySection(String(sectionId), schoolId);
  await verifyAcademicYear(String(academicYearId), schoolId);

  const students = await prisma.student.findMany({
    where: { sectionId: String(sectionId), isActive: true },
    orderBy: { rollNo: "asc" },
    select: { id: true, name: true, rollNo: true },
  });

  const records = await prisma.dailyAttendance.findMany({
    where: {
      date: String(date),
      academicYearId: String(academicYearId),
      studentId: { in: students.map((s) => s.id) },
    },
  });

  const attendance = students.map((student) => {
    const record = records.find((r) => r.studentId === student.id);
    return {
      studentId: student.id,
      studentName: student.name,
      rollNo: student.rollNo,
      status: record?.status || null,
      remarks: record?.remarks || null,
      isMarked: !!record,
    };
  });

  res.json({ data: attendance });
});

// POST /api/daily-attendance/bulk — mark attendance for entire section
// Only Admin and Teachers assigned to the section can mark attendance.
router.post("/bulk", authenticate, authorize("ADMIN", "TEACHER"), async (req, res) => {
  const schema = z.object({
    sectionId: z.string().min(1),
    date: z.string().min(1).max(20),
    academicYearId: z.string().min(1),
    records: z.array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(["PRESENT", "ABSENT"]),
        remarks: z.string().max(300).nullable().optional(),
      })
    ).min(1).max(200),
  });

  const { sectionId, date, academicYearId, records } = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  await verifySection(sectionId, schoolId);
  await verifyAcademicYear(academicYearId, schoolId);

  // Get the teacher's id from the user
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { teacherId: true },
  });

  // If teacher, verify they're assigned to this section
  if (req.user!.role === "TEACHER") {
    if (!user?.teacherId) throw new AppError("Teacher record not found", 403);
    const assignment = await prisma.teacherAssignment.findFirst({
      where: { teacherId: user.teacherId, sectionId },
    });
    if (!assignment) throw new AppError("You are not assigned to this section", 403);
  }

  // Verify every studentId actually belongs to this section. Without this, a
  // teacher or admin could write attendance rows for arbitrary student ids —
  // including students in another school, whose Attendance totals and report
  // cards would then silently absorb them.
  //
  // This is also the server-side backstop for the client-side race where the
  // section selector changes mid-fetch and the page saves against a roster it
  // is no longer showing: that now fails cleanly instead of corrupting data.
  const uniqueStudentIds = [...new Set(records.map((r) => r.studentId))];
  const validStudentCount = await prisma.student.count({
    where: { id: { in: uniqueStudentIds }, sectionId },
  });
  if (validStudentCount !== uniqueStudentIds.length) {
    throw new AppError("One or more students do not belong to this section", 400);
  }

  // Marking attendance is the highest-frequency write in the app — every
  // teacher, every section, every morning — so both halves of it are single
  // set-based statements rather than a query per student.
  //
  // They also run in one transaction. The totals below are derived from the
  // rows written just above; when the recompute sat outside the write, a
  // failure between the two left the day saved and the totals stale, and a
  // stale total prints on a report card with nothing on the page to show it
  // is wrong.
  //
  // The ids are generated in SQL because a set-based INSERT has no chance to
  // run Prisma's client-side cuid(). Both columns are opaque TEXT surrogate
  // keys that nothing reads or parses, so the mixed format is invisible.
  const markedById = user?.teacherId || null;

  // Last entry wins for a repeated student. ON CONFLICT DO UPDATE cannot touch
  // the same row twice in one statement, so a duplicate id would error rather
  // than overwrite the way the per-row upserts used to.
  const byStudent = new Map(records.map((r) => [r.studentId, r]));
  const rows = [...byStudent.values()].map(
    (r) => Prisma.sql`(${r.studentId}::text, ${r.status}::"AttendanceStatus", ${r.remarks || null}::text)`
  );

  const saved = await prisma.$transaction(async (tx) => {
    const written = await tx.$executeRaw`
      INSERT INTO daily_attendances
        (id, student_id, date, academic_year_id, status, remarks, marked_by_id, created_at, updated_at)
      SELECT gen_random_uuid()::text, v.student_id, ${date}::text, ${academicYearId}::text,
             v.status, v.remarks, ${markedById}::text, NOW(), NOW()
      FROM (VALUES ${Prisma.join(rows)}) AS v(student_id, status, remarks)
      ON CONFLICT (student_id, date, academic_year_id) DO UPDATE
        SET status       = EXCLUDED.status,
            remarks      = EXCLUDED.remarks,
            marked_by_id = EXCLUDED.marked_by_id,
            updated_at   = NOW()
    `;

    // Recompute the year-to-date totals for the section in Postgres. This used
    // to load every daily row each student had for the whole year and count
    // them in JavaScript, once per student: ~800 rows in Baisakh, ~8,800 by
    // Chaitra, on every save. The counting now happens where the rows already
    // are and nothing crosses the wire.
    //
    // The LEFT JOIN keeps the old behaviour of giving every active student in
    // the section a totals row, zeroed if they have no daily rows yet.
    await tx.$executeRaw`
      INSERT INTO attendances
        (id, student_id, academic_year_id, total_days, present_days, absent_days, created_at, updated_at)
      SELECT gen_random_uuid()::text, s.id, ${academicYearId}::text,
             COUNT(d.id),
             COUNT(d.id) FILTER (WHERE d.status = 'PRESENT'),
             COUNT(d.id) FILTER (WHERE d.status = 'ABSENT'),
             NOW(), NOW()
      FROM students s
      LEFT JOIN daily_attendances d
        ON d.student_id = s.id AND d.academic_year_id = ${academicYearId}::text
      WHERE s.section_id = ${sectionId}::text AND s.is_active = true
      GROUP BY s.id
      ON CONFLICT (student_id, academic_year_id) DO UPDATE
        SET total_days   = EXCLUDED.total_days,
            present_days = EXCLUDED.present_days,
            absent_days  = EXCLUDED.absent_days,
            updated_at   = NOW()
    `;

    return written;
  });

  res.json({ data: { saved, message: "Attendance saved" } });
});

// GET /api/daily-attendance/summary?sectionId=xxx&academicYearId=xxx
router.get("/summary", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { sectionId, academicYearId } = req.query;
  if (!sectionId || !academicYearId) {
    throw new AppError("sectionId and academicYearId are required");
  }
  await verifySection(String(sectionId), schoolId);

  const students = await prisma.student.findMany({
    where: { sectionId: String(sectionId), isActive: true },
    orderBy: { rollNo: "asc" },
    select: { id: true, name: true, rollNo: true },
  });

  const attendances = await prisma.attendance.findMany({
    where: {
      academicYearId: String(academicYearId),
      studentId: { in: students.map((s) => s.id) },
    },
  });

  const summary = students.map((student) => {
    const att = attendances.find((a) => a.studentId === student.id);
    return {
      studentId: student.id,
      studentName: student.name,
      rollNo: student.rollNo,
      totalDays: att?.totalDays || 0,
      presentDays: att?.presentDays || 0,
      absentDays: att?.absentDays || 0,
      attendanceRate: att && att.totalDays > 0
        ? parseFloat(((att.presentDays / att.totalDays) * 100).toFixed(1))
        : 0,
    };
  });

  res.json({ data: summary });
});

// GET /api/daily-attendance/student/:studentId?academicYearId=xxx
// Per-student attendance broken down by BS month, for the student profile.
router.get("/student/:studentId", authenticate, authorize("ADMIN", "TEACHER"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { studentId } = req.params;
  const { academicYearId } = req.query;
  if (!academicYearId) throw new AppError("academicYearId is required");
  await verifyStudent(studentId, schoolId);
  await verifyAcademicYear(String(academicYearId), schoolId);

  const records = await prisma.dailyAttendance.findMany({
    where: { studentId, academicYearId: String(academicYearId) },
    select: { date: true, status: true },
  });

  // Group by BS month (date is "YYYY/MM/DD"). Index 1..12 = Baisakh..Chaitra.
  // Track the specific absent dates so the profile can list them on demand
  // (present dates are just the complement, so we don't need to send those).
  const byMonth = new Map<number, { present: number; absent: number; absentDates: string[] }>();
  for (const r of records) {
    const month = parseInt(r.date.split("/")[1], 10);
    if (!month || month < 1 || month > 12) continue;
    const bucket = byMonth.get(month) || { present: 0, absent: 0, absentDates: [] };
    if (r.status === "PRESENT") bucket.present++;
    else if (r.status === "ABSENT") { bucket.absent++; bucket.absentDates.push(r.date); }
    byMonth.set(month, bucket);
  }

  const months = [...byMonth.entries()]
    .map(([month, c]) => ({
      month,
      present: c.present,
      absent: c.absent,
      total: c.present + c.absent,
      absentDates: c.absentDates.sort(),
    }))
    .sort((a, b) => a.month - b.month);

  res.json({ data: months });
});

export default router;