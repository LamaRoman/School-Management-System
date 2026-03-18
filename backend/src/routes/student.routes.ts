import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

const studentSchema = z.object({
  name: z.string().min(1),
  nameNp: z.string().optional(),
  dateOfBirth: z.string().optional(),
  rollNo: z.number().int().optional().nullable(),
  symbolNumber: z.string().optional(),
  gender: z.string().optional(),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  address: z.string().optional(),
  photo: z.string().optional(),
  sectionId: z.string().min(1),
  isActive: z.boolean().default(true),
});

// ─── HELPERS ────────────────────────────────────────────

// User.teacherId -> Teacher.id (User has teacherId field)
async function getTeacherId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { teacherId: true },
  });
  return user?.teacherId || null;
}

// TeacherAssignment has isClassTeacher: Boolean
async function isClassTeacherOf(teacherId: string, sectionId: string): Promise<boolean> {
  const assignment = await prisma.teacherAssignment.findFirst({
    where: {
      teacherId,
      sectionId,
      isClassTeacher: true,
    },
  });
  return !!assignment;
}

async function authorizeForSection(user: any, sectionId: string): Promise<void> {
  if (user.role === "SYSTEM_ADMIN" || user.role === "ADMIN") return;

  if (user.role === "TEACHER") {
    const teacherId = await getTeacherId(user.id);
    if (!teacherId) throw new AppError("Teacher record not found for this user", 403);
    const authorized = await isClassTeacherOf(teacherId, sectionId);
    if (!authorized) throw new AppError("You can only manage students in your assigned section", 403);
    return;
  }

  throw new AppError("Not authorized", 403);
}

/**
 * Auto-create a User account for a newly added student.
 * Email: firstname.lastname@school.edu.np
 * Default password: student123
 */
async function autoCreateStudentUser(studentId: string, studentName: string): Promise<void> {
  const baseName = studentName.toLowerCase().trim().replace(/\s+/g, ".");
  let email = `${baseName}@school.edu.np`;

  let attempts = 0;
  while (attempts < 100) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) break;
    attempts++;
    email = `${baseName}${attempts}@school.edu.np`;
  }

  const hashedPassword = await bcrypt.hash("student123", 10);

  await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      role: "STUDENT",
      studentId,
      isActive: true,
    },
  });
}

// ─── ROUTES ─────────────────────────────────────────────

// GET /api/students?sectionId=xxx&gradeId=xxx
router.get("/", async (req, res) => {
  const { sectionId, gradeId } = req.query;
  const where: any = { isActive: true };
  if (sectionId) where.sectionId = String(sectionId);
  if (gradeId) where.section = { gradeId: String(gradeId) };

  const students = await prisma.student.findMany({
    where,
    orderBy: { rollNo: "asc" },
    include: {
      section: { include: { grade: { select: { name: true } } } },
    },
  });
  res.json({ data: students });
});

// GET /api/students/:id
router.get("/:id", async (req, res) => {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      section: { include: { grade: true } },
      marks: { include: { subject: true, examType: true } },
      attendances: true,
      results: true,
    },
  });
  res.json({ data: student });
});

// POST /api/students — create student + auto-create user account
router.post("/", authenticate, async (req, res) => {
  const data = studentSchema.parse(req.body);
  const user = (req as any).user;

  await authorizeForSection(user, data.sectionId);

  const student = await prisma.student.create({ data });

  try {
    await autoCreateStudentUser(student.id, student.name);
  } catch (err) {
    console.error("Failed to auto-create student user:", err);
  }

  res.status(201).json({ data: student });
});

// POST /api/students/bulk — create multiple + auto-create user accounts
router.post("/bulk", authenticate, async (req, res) => {
  const schema = z.object({
    sectionId: z.string().min(1),
    students: z.array(studentSchema.omit({ sectionId: true })),
  });
  const { sectionId, students } = schema.parse(req.body);
  const user = (req as any).user;

  await authorizeForSection(user, sectionId);

  const created = await prisma.$transaction(
    students.map((s) => prisma.student.create({ data: { ...s, sectionId } }))
  );

  for (const student of created) {
    try {
      await autoCreateStudentUser(student.id, student.name);
    } catch (err) {
      console.error(`Failed to auto-create user for ${student.name}:`, err);
    }
  }

  res.status(201).json({ data: created });
});

// PUT /api/students/:id
router.put("/:id", authenticate, async (req, res) => {
  const data = studentSchema.partial().parse(req.body);
  const user = (req as any).user;

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: req.params.id },
  });

  await authorizeForSection(user, student.sectionId);

  if (user.role === "TEACHER") {
    delete data.sectionId;
  }

  const updated = await prisma.student.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ data: updated });
});

// POST /api/students/assign-rolls
router.post("/assign-rolls", authenticate, async (req, res) => {
  const schema = z.object({
    sectionId: z.string().min(1),
    assignments: z.array(z.object({
      studentId: z.string().min(1),
      rollNo: z.number().int().min(1),
    })),
  });

  const { sectionId, assignments } = schema.parse(req.body);
  const user = (req as any).user;

  await authorizeForSection(user, sectionId);

  const rollNumbers = assignments.map((a) => a.rollNo);
  if (new Set(rollNumbers).size !== rollNumbers.length) {
    throw new AppError("Duplicate roll numbers found in the input");
  }

  const studentIds = assignments.map((a) => a.studentId);
  const studentsInSection = await prisma.student.findMany({
    where: { id: { in: studentIds }, sectionId },
    select: { id: true },
  });
  if (studentsInSection.length !== studentIds.length) {
    throw new AppError("Some students do not belong to this section");
  }

  await prisma.$transaction(
    assignments.map((a) =>
      prisma.student.update({
        where: { id: a.studentId },
        data: { rollNo: a.rollNo },
      })
    )
  );

  res.json({ data: { message: `Roll numbers assigned to ${assignments.length} students` } });
});

// DELETE /api/students/:id (soft delete — admin only)
router.delete("/:id", authenticate, authorize("ADMIN", "SYSTEM_ADMIN"), async (req, res) => {
  await prisma.student.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ data: { message: "Student deactivated" } });
});

export default router;