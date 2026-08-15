import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifyTeacher, verifySection, verifySubjectInSection } from "../utils/schoolScope";

const router = Router();

// GET /api/teacher-assignments?sectionId=xxx&teacherId=xxx
router.get("/", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { sectionId, teacherId, gradeId } = req.query;
  const where: any = { section: { grade: { academicYear: { schoolId } } } };
  if (sectionId) where.sectionId = String(sectionId);
  if (teacherId) where.teacherId = String(teacherId);
  if (gradeId) where.section = { gradeId: String(gradeId) };

  // Filter out expired temporary assignments
  where.OR = [
    { isTemporary: false },
    { isTemporary: true, expiresAt: null },
    { isTemporary: true, expiresAt: { gte: new Date() } },
  ];

  const assignments = await prisma.teacherAssignment.findMany({
    where,
    include: {
      teacher: { select: { id: true, name: true, nameNp: true, phone: true, email: true } },
      section: { include: { grade: { select: { id: true, name: true } } } },
      subject: { select: { id: true, name: true, nameNp: true } },
    },
    orderBy: [{ section: { grade: { displayOrder: "asc" } } }, { section: { name: "asc" } }],
  });

  res.json({ data: assignments });
});

// GET /api/teacher-assignments/my — get current teacher's assignments
router.get("/my", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { teacherId: true },
  });

  if (!user?.teacherId) {
    throw new AppError("No teacher profile linked to this account", 403);
  }

  const now = new Date();
  const assignments = await prisma.teacherAssignment.findMany({
    where: {
      teacherId: user.teacherId,
      OR: [
        { isTemporary: false },
        { isTemporary: true, expiresAt: null },
        { isTemporary: true, expiresAt: { gte: now } },
      ],
    },
    include: {
      section: { include: { grade: { select: { id: true, name: true, academicYearId: true } } } },
      subject: { select: { id: true, name: true, nameNp: true, fullTheoryMarks: true, fullPracticalMarks: true, passMarks: true } },
    },
    orderBy: [{ section: { grade: { displayOrder: "asc" } } }, { section: { name: "asc" } }],
  });

  // Separate class teacher sections from subject assignments
  const classTeacherSections = assignments
    .filter((a) => a.isClassTeacher)
    .map((a) => ({
      assignmentId: a.id,
      sectionId: a.sectionId,
      sectionName: a.section.name,
      gradeId: a.section.grade.id,
      gradeName: a.section.grade.name,
      academicYearId: a.section.grade.academicYearId,
      isTemporary: a.isTemporary,
      expiresAt: a.expiresAt,
    }));

  const subjectAssignments = assignments
    .filter((a) => !a.isClassTeacher && a.subject)
    .map((a) => ({
      assignmentId: a.id,
      sectionId: a.sectionId,
      sectionName: a.section.name,
      gradeId: a.section.grade.id,
      gradeName: a.section.grade.name,
      academicYearId: a.section.grade.academicYearId,
      subjectId: a.subject!.id,
      subjectName: a.subject!.name,
      fullTheoryMarks: a.subject!.fullTheoryMarks,
      fullPracticalMarks: a.subject!.fullPracticalMarks,
      isTemporary: a.isTemporary,
      expiresAt: a.expiresAt,
    }));

  res.json({
    data: {
      teacherId: user.teacherId,
      classTeacherSections,
      subjectAssignments,
    },
  });
});

// POST /api/teacher-assignments — assign teacher to section/subject
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    teacherId: z.string().min(1),
    sectionId: z.string().min(1),
    subjectId: z.string().nullable().optional(),
    isClassTeacher: z.boolean().default(false),
    isTemporary: z.boolean().default(false),
    expiresAt: z.string().nullable().optional(),
  });

  const data = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  await verifyTeacher(data.teacherId, schoolId);
  await verifySection(data.sectionId, schoolId);

  // The subject has to belong to the section's own grade, not merely to this
  // school. This assignment is what gates mark entry, so a Class 3 subject
  // attached to a Class 9 section decides who may enter marks for what — and
  // `admin/teacher-assignments` fetches its subject dropdown per grade, so a
  // stale list (the F4a race) posts exactly that pairing.
  //
  // Class-teacher assignments store no subject (see the create below), so
  // there is nothing to check on that path.
  if (!data.isClassTeacher && data.subjectId) {
    await verifySubjectInSection(data.subjectId, data.sectionId);
  }

// If assigning as class teacher, check no class teacher already exists for this section
  if (data.isClassTeacher) {
    const existing = await prisma.teacherAssignment.findFirst({
      where: {
        sectionId: data.sectionId,
        isClassTeacher: true,
      },
    });
    if (existing && existing.teacherId === data.teacherId) {
      throw new AppError("This teacher is already the class teacher for this section.");
    }
    if (existing) {
      throw new AppError("This section already has a class teacher. Remove the existing one first.");
    }
  }

  // Prevent duplicate subject assignment (same teacher + section + subject)
  if (!data.isClassTeacher && data.subjectId) {
    const existingSubject = await prisma.teacherAssignment.findFirst({
      where: {
        teacherId: data.teacherId,
        sectionId: data.sectionId,
        subjectId: data.subjectId,
      },
    });
    if (existingSubject) {
      throw new AppError("This teacher is already assigned to this subject for this section.");
    }
  }
  const assignment = await prisma.teacherAssignment.create({
    data: {
      teacherId: data.teacherId,
      sectionId: data.sectionId,
      subjectId: data.isClassTeacher ? null : (data.subjectId || null),
      isClassTeacher: data.isClassTeacher,
      isTemporary: data.isTemporary,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    },
    include: {
      teacher: { select: { name: true } },
      section: { include: { grade: { select: { name: true } } } },
      subject: { select: { name: true } },
    },
  });

  res.status(201).json({ data: assignment });
});

// Resolve an assignment only if it belongs to the caller's school (via the
// section → grade → academicYear chain). Prevents one school's admin from
// deleting/revoking another school's assignments by id.
async function findAssignmentInSchool(id: string, schoolId: string) {
  return prisma.teacherAssignment.findFirst({
    where: { id, section: { grade: { academicYear: { schoolId } } } },
  });
}

// DELETE /api/teacher-assignments/:id
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const assignment = await findAssignmentInSchool(req.params.id, schoolId);
  if (!assignment) throw new AppError("Assignment not found", 404);

  await prisma.teacherAssignment.delete({ where: { id: assignment.id } });
  res.json({ data: { message: "Assignment removed" } });
});

// POST /api/teacher-assignments/:id/revoke — revoke temporary access immediately
router.post("/:id/revoke", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const assignment = await findAssignmentInSchool(req.params.id, schoolId);
  if (!assignment) throw new AppError("Assignment not found", 404);
  if (!assignment.isTemporary) throw new AppError("Can only revoke temporary assignments");

  await prisma.teacherAssignment.delete({ where: { id: assignment.id } });
  res.json({ data: { message: "Temporary access revoked" } });
});

export default router;