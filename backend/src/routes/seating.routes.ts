import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifyAcademicYear, verifyExamType, verifyExamRoom, verifyGrade } from "../utils/schoolScope";

const router = Router();

// Schema reference:
//   ExamRoom { id, name, capacity, displayOrder, isActive, createdAt, updatedAt }
//   SeatAllocation { id, examTypeId, academicYearId, studentId, roomId, seatNumber?, createdAt }
//   Student { id, name, nameNp, rollNo, sectionId, isActive, status, ... }
//   Section { id, name, gradeId }
//   Grade { id, name, displayOrder }

// ─── ROOMS ──────────────────────────────────────────────

// GET /api/seating/rooms
router.get("/rooms", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const rooms = await prisma.examRoom.findMany({
    where: { isActive: true, schoolId },
    orderBy: { displayOrder: "asc" },
  });
  res.json({ data: rooms });
});

// POST /api/seating/rooms
router.post("/rooms", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    capacity: z.number().int().min(1),
    displayOrder: z.number().int().default(0),
  });

  const data = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  const room = await prisma.examRoom.create({
    data: { schoolId, name: data.name, capacity: data.capacity, displayOrder: data.displayOrder },
  });
  res.status(201).json({ data: room });
});

// PUT /api/seating/rooms/:id
router.put("/rooms/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    capacity: z.number().int().min(1).optional(),
    displayOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  });

  const data = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  await prisma.examRoom.findFirstOrThrow({ where: { id: req.params.id, schoolId } });
  const room = await prisma.examRoom.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ data: room });
});

// DELETE /api/seating/rooms/:id (soft delete)
router.delete("/rooms/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  await prisma.examRoom.findFirstOrThrow({ where: { id: req.params.id, schoolId } });
  await prisma.examRoom.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ data: { message: "Room deactivated" } });
});

// ─── ALLOCATION ─────────────────────────────────────────

// GET /api/seating/allocations?examTypeId=xxx&academicYearId=xxx
router.get("/allocations", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { examTypeId, academicYearId } = req.query;
  if (!examTypeId || !academicYearId) {
    throw new AppError("examTypeId and academicYearId are required");
  }
  await Promise.all([
    verifyExamType(String(examTypeId), schoolId),
    verifyAcademicYear(String(academicYearId), schoolId),
  ]);

  const allocations = await prisma.seatAllocation.findMany({
    where: {
      examTypeId: String(examTypeId),
      academicYearId: String(academicYearId),
    },
    include: {
      student: {
        include: {
          section: {
            include: { grade: true },
          },
        },
      },
      room: true,
    },
    orderBy: { seatNumber: "asc" },
  });

  // Group by room
  const rooms = await prisma.examRoom.findMany({
    where: { isActive: true, schoolId },
    orderBy: { displayOrder: "asc" },
  });

  const grouped = rooms.map((room) => {
    const roomAllocations = allocations
      .filter((a) => a.roomId === room.id)
      .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));

    return {
      room: { id: room.id, name: room.name, capacity: room.capacity },
      students: roomAllocations.map((a) => ({
        id: a.student.id,
        name: a.student.name,
        nameNp: a.student.nameNp,
        rollNo: a.student.rollNo,
        className: a.student.section.grade.name,
        section: a.student.section.name,
        seatNumber: a.seatNumber,
      })),
      filled: roomAllocations.length,
    };
  }).filter((g) => g.filled > 0);

  res.json({ data: grouped });
});

// POST /api/seating/generate — auto-generate seating arrangement
router.post("/generate", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    examTypeId: z.string().min(1),
    academicYearId: z.string().min(1),
    gradeIds: z.array(z.string().min(1)).min(1),
    method: z.enum(["alternating", "sequential", "random"]),
  });

  const { examTypeId, academicYearId, gradeIds, method } = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  await Promise.all([
    verifyExamType(examTypeId, schoolId),
    verifyAcademicYear(academicYearId, schoolId),
    ...gradeIds.map(gId => verifyGrade(gId, schoolId)),
  ]);

  // Get all active rooms for this school
  const rooms = await prisma.examRoom.findMany({
    where: { isActive: true, schoolId },
    orderBy: { displayOrder: "asc" },
  });

  if (rooms.length === 0) {
    throw new AppError("No exam rooms defined. Add rooms first.");
  }

  // Get all sections from selected grades, sorted
  const sections = await prisma.section.findMany({
    where: { gradeId: { in: gradeIds } },
    include: { grade: true },
  });
  sections.sort((a, b) => a.grade.displayOrder - b.grade.displayOrder || a.name.localeCompare(b.name));

  // Get all students from those sections
  const students = await prisma.student.findMany({
    where: {
      sectionId: { in: sections.map((s) => s.id) },
      isActive: true,
      status: "ACTIVE",
    },
    include: {
      section: {
        include: { grade: true },
      },
    },
  });

  // Sort students by grade displayOrder, section name, rollNo
  students.sort((a, b) => {
    const gradeOrder = a.section.grade.displayOrder - b.section.grade.displayOrder;
    if (gradeOrder !== 0) return gradeOrder;
    const sectionOrder = a.section.name.localeCompare(b.section.name);
    if (sectionOrder !== 0) return sectionOrder;
    return (a.rollNo || 0) - (b.rollNo || 0);
  });

  if (students.length === 0) {
    throw new AppError("No active students found in the selected grades.");
  }

  const totalCapacity = rooms.reduce((sum, r) => sum + r.capacity, 0);
  if (students.length > totalCapacity) {
    throw new AppError(`Not enough room capacity. Students: ${students.length}, Total capacity: ${totalCapacity}. Add more rooms.`);
  }

  // Shuffle students based on method
  let shuffled: typeof students;

  if (method === "alternating") {
    // Group by section, then interleave
    const bySection: Map<string, typeof students> = new Map();
    for (const stu of students) {
      if (!bySection.has(stu.sectionId)) bySection.set(stu.sectionId, []);
      bySection.get(stu.sectionId)!.push(stu);
    }

    const sectionArrays = Array.from(bySection.values());
    shuffled = [];
    const maxLen = sectionArrays.reduce((max, arr) => Math.max(max, arr.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const arr of sectionArrays) {
        if (i < arr.length) {
          shuffled.push(arr[i]);
        }
      }
    }
  } else if (method === "random") {
    // Fisher-Yates shuffle
    shuffled = [...students];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  } else {
    // Sequential — already sorted by grade, section, roll
    shuffled = [...students];
  }

  // Delete existing allocations for this exam
  await prisma.seatAllocation.deleteMany({
    where: { examTypeId, academicYearId },
  });

  // Assign students to rooms
  let roomIndex = 0;
  let seatInRoom = 0;
  const allocations: { studentId: string; roomId: string; seatNumber: number }[] = [];

  for (const stu of shuffled) {
    while (roomIndex < rooms.length && seatInRoom >= rooms[roomIndex].capacity) {
      roomIndex++;
      seatInRoom = 0;
    }

    if (roomIndex >= rooms.length) break;

    seatInRoom++;
    allocations.push({
      studentId: stu.id,
      roomId: rooms[roomIndex].id,
      seatNumber: seatInRoom,
    });
  }

  // Bulk create allocations
  await prisma.$transaction(
    allocations.map((a) =>
      prisma.seatAllocation.create({
        data: {
          examTypeId,
          academicYearId,
          studentId: a.studentId,
          roomId: a.roomId,
          seatNumber: a.seatNumber,
        },
      })
    )
  );

  // Build summary
  const summary = rooms.map((room) => {
    const count = allocations.filter((a) => a.roomId === room.id).length;
    return { room: room.name, assigned: count, capacity: room.capacity };
  }).filter((s) => s.assigned > 0);

  res.json({
    data: {
      message: `Seating arrangement generated for ${allocations.length} students across ${summary.length} rooms`,
      totalStudents: allocations.length,
      method,
      rooms: summary,
    },
  });
});

// DELETE /api/seating/allocations?examTypeId=xxx&academicYearId=xxx
router.delete("/allocations", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { examTypeId, academicYearId } = req.query;
  if (!examTypeId || !academicYearId) {
    throw new AppError("examTypeId and academicYearId are required");
  }
  await Promise.all([
    verifyExamType(String(examTypeId), schoolId),
    verifyAcademicYear(String(academicYearId), schoolId),
  ]);

  await prisma.seatAllocation.deleteMany({
    where: {
      examTypeId: String(examTypeId),
      academicYearId: String(academicYearId),
    },
  });

  res.json({ data: { message: "Seating arrangement cleared" } });
});

export default router;