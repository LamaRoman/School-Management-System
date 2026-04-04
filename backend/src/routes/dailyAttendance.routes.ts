import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// GET /api/daily-attendance?sectionId=xxx&date=xxx&academicYearId=xxx
router.get("/", authenticate, async (req, res) => {
  const { sectionId, date, academicYearId } = req.query;
  if (!sectionId || !date || !academicYearId) {
    throw new AppError("sectionId, date, and academicYearId are required");
  }

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
    date: z.string().min(1),
    academicYearId: z.string().min(1),
    records: z.array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(["PRESENT", "ABSENT"]),
        remarks: z.string().nullable().optional(),
      })
    ),
  });

  const { sectionId, date, academicYearId, records } = schema.parse(req.body);

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

  // Upsert each record
  const results = await prisma.$transaction(
    records.map((r) =>
      prisma.dailyAttendance.upsert({
        where: {
          studentId_date_academicYearId: {
            studentId: r.studentId,
            date,
            academicYearId,
          },
        },
        update: {
          status: r.status,
          remarks: r.remarks || null,
          markedById: user?.teacherId || null,
        },
        create: {
          studentId: r.studentId,
          date,
          academicYearId,
          status: r.status,
          remarks: r.remarks || null,
          markedById: user?.teacherId || null,
        },
      })
    )
  );

  // Auto-update the Attendance totals table
  const sectionStudents = await prisma.student.findMany({
    where: { sectionId, isActive: true },
    select: { id: true },
  });

  for (const student of sectionStudents) {
    const dailyRecords = await prisma.dailyAttendance.findMany({
      where: { studentId: student.id, academicYearId },
    });

    const totalDays = dailyRecords.length;
    const presentDays = dailyRecords.filter((r) => r.status === "PRESENT").length;
    const absentDays = dailyRecords.filter((r) => r.status === "ABSENT").length;

    await prisma.attendance.upsert({
      where: {
        studentId_academicYearId: { studentId: student.id, academicYearId },
      },
      update: { totalDays, presentDays, absentDays },
      create: { studentId: student.id, academicYearId, totalDays, presentDays, absentDays },
    });
  }

  res.json({ data: { saved: results.length, message: "Attendance saved" } });
});

// GET /api/daily-attendance/summary?sectionId=xxx&academicYearId=xxx
router.get("/summary", authenticate, async (req, res) => {
  const { sectionId, academicYearId } = req.query;
  if (!sectionId || !academicYearId) {
    throw new AppError("sectionId and academicYearId are required");
  }

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

export default router;