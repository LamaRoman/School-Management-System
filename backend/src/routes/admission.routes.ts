import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

const ADMIN_OR_ACCOUNTANT = authorize("ADMIN", "ACCOUNTANT");

// Schema reference:
//   Admission { id, studentName, studentNameNp?, dateOfBirth?, gender?, fatherName?, motherName?,
//     guardianName?, guardianPhone?, address?, previousSchool?, applyingForGradeId, academicYearId,
//     status (PENDING/APPROVED/REJECTED/ENROLLED), remarks?, appliedDate, reviewedById?, reviewedDate? }
//   Relations: applyingForGrade -> Grade, academicYear -> AcademicYear, reviewedBy -> User?

// GET /api/admissions?status=xxx&academicYearId=xxx&gradeId=xxx
router.get("/", authenticate, ADMIN_OR_ACCOUNTANT, async (req, res) => {
  const { status, academicYearId, gradeId } = req.query;
  const where: any = {};
  if (status) where.status = String(status);
  if (academicYearId) where.academicYearId = String(academicYearId);
  if (gradeId) where.applyingForGradeId = String(gradeId);

  const admissions = await prisma.admission.findMany({
    where,
    include: {
      applyingForGrade: { select: { id: true, name: true } },
      academicYear: { select: { id: true, yearBS: true } },
      reviewedBy: { select: { id: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ data: admissions });
});

// GET /api/admissions/:id
router.get("/:id", authenticate, ADMIN_OR_ACCOUNTANT, async (req, res) => {
  const admission = await prisma.admission.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      applyingForGrade: { select: { id: true, name: true } },
      academicYear: { select: { id: true, yearBS: true } },
      reviewedBy: { select: { id: true, email: true } },
    },
  });
  res.json({ data: admission });
});

// POST /api/admissions — create new admission application
router.post("/", authenticate, ADMIN_OR_ACCOUNTANT, async (req, res) => {
  const schema = z.object({
    studentName: z.string().min(1),
    studentNameNp: z.string().optional(),
    dateOfBirth: z.string().optional(),
    gender: z.string().optional(),
    fatherName: z.string().optional(),
    motherName: z.string().optional(),
    guardianName: z.string().optional(),
    guardianPhone: z.string().optional(),
    address: z.string().optional(),
    previousSchool: z.string().optional(),
    applyingForGradeId: z.string().min(1),
    academicYearId: z.string().min(1),
    appliedDate: z.string().min(1),
    remarks: z.string().optional(),
  });

  const data = schema.parse(req.body);

  const admission = await prisma.admission.create({
    data: {
      studentName: data.studentName,
      studentNameNp: data.studentNameNp || null,
      dateOfBirth: data.dateOfBirth || null,
      gender: data.gender || null,
      fatherName: data.fatherName || null,
      motherName: data.motherName || null,
      guardianName: data.guardianName || null,
      guardianPhone: data.guardianPhone || null,
      address: data.address || null,
      previousSchool: data.previousSchool || null,
      applyingForGradeId: data.applyingForGradeId,
      academicYearId: data.academicYearId,
      appliedDate: data.appliedDate,
      remarks: data.remarks || null,
      status: "PENDING",
    },
    include: {
      applyingForGrade: { select: { id: true, name: true } },
    },
  });

  res.status(201).json({ data: admission });
});

// PUT /api/admissions/:id — update admission details
router.put("/:id", authenticate, ADMIN_OR_ACCOUNTANT, async (req, res) => {
  const schema = z.object({
    studentName: z.string().min(1).optional(),
    studentNameNp: z.string().nullable().optional(),
    dateOfBirth: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    fatherName: z.string().nullable().optional(),
    motherName: z.string().nullable().optional(),
    guardianName: z.string().nullable().optional(),
    guardianPhone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    previousSchool: z.string().nullable().optional(),
    applyingForGradeId: z.string().optional(),
    remarks: z.string().nullable().optional(),
  });

  const data = schema.parse(req.body);

  const updated = await prisma.admission.update({
    where: { id: req.params.id },
    data,
    include: {
      applyingForGrade: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, email: true } },
    },
  });

  res.json({ data: updated });
});

// POST /api/admissions/:id/approve — approve an admission
router.post("/:id/approve", authenticate, ADMIN_OR_ACCOUNTANT, async (req, res) => {
  const schema = z.object({
    reviewedDate: z.string().min(1),
    remarks: z.string().optional(),
  });

  const { reviewedDate, remarks } = schema.parse(req.body);
  const user = req.user!;

  const admission = await prisma.admission.findUniqueOrThrow({
    where: { id: req.params.id },
  });

  if (admission.status !== "PENDING") {
    throw new AppError(`Cannot approve — current status is ${admission.status}`);
  }

  const updated = await prisma.admission.update({
    where: { id: req.params.id },
    data: {
      status: "APPROVED",
      reviewedById: user.userId,
      reviewedDate,
      remarks: remarks || admission.remarks,
    },
    include: {
      applyingForGrade: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, email: true } },
    },
  });

  res.json({ data: updated });
});

// POST /api/admissions/:id/reject — reject an admission
router.post("/:id/reject", authenticate, ADMIN_OR_ACCOUNTANT, async (req, res) => {
  const schema = z.object({
    reviewedDate: z.string().min(1),
    remarks: z.string().optional(),
  });

  const { reviewedDate, remarks } = schema.parse(req.body);
  const user = req.user!;

  const admission = await prisma.admission.findUniqueOrThrow({
    where: { id: req.params.id },
  });

  if (admission.status !== "PENDING") {
    throw new AppError(`Cannot reject — current status is ${admission.status}`);
  }

  const updated = await prisma.admission.update({
    where: { id: req.params.id },
    data: {
      status: "REJECTED",
      reviewedById: user.userId,
      reviewedDate,
      remarks: remarks || admission.remarks,
    },
  });

  res.json({ data: updated });
});

// POST /api/admissions/:id/enroll — convert approved admission to student
router.post("/:id/enroll", authenticate, ADMIN_OR_ACCOUNTANT, async (req, res) => {
  const schema = z.object({
    sectionId: z.string().min(1),
  });

  const { sectionId } = schema.parse(req.body);

  const admission = await prisma.admission.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { applyingForGrade: true },
  });

  if (admission.status !== "APPROVED") {
    throw new AppError("Only approved admissions can be enrolled");
  }

  // Verify section belongs to the applying grade
  const section = await prisma.section.findUniqueOrThrow({
    where: { id: sectionId },
  });
  if (section.gradeId !== admission.applyingForGradeId) {
    throw new AppError("Section does not belong to the applying grade");
  }

  // Create student record
  const student = await prisma.student.create({
    data: {
      name: admission.studentName,
      nameNp: admission.studentNameNp,
      dateOfBirth: admission.dateOfBirth,
      gender: admission.gender,
      fatherName: admission.fatherName,
      motherName: admission.motherName,
      guardianName: admission.guardianName,
      guardianPhone: admission.guardianPhone,
      address: admission.address,
      sectionId,
      isActive: true,
      status: "ACTIVE",
    },
  });

  // Auto-create user account for the student
  try {
    const baseName = admission.studentName.toLowerCase().trim().replace(/\s+/g, ".");
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
        studentId: student.id,
        isActive: true,
      },
    });
  } catch (err) {
    console.error("Failed to auto-create student user:", err);
  }

  // Update admission status to ENROLLED
  await prisma.admission.update({
    where: { id: req.params.id },
    data: { status: "ENROLLED" },
  });

  res.json({
    data: {
      message: `${admission.studentName} enrolled in ${admission.applyingForGrade.name} Section ${section.name}`,
      studentId: student.id,
    },
  });
});

// DELETE /api/admissions/:id
router.delete("/:id", authenticate, ADMIN_OR_ACCOUNTANT, async (req, res) => {
  const admission = await prisma.admission.findUniqueOrThrow({
    where: { id: req.params.id },
  });

  if (admission.status === "ENROLLED") {
    throw new AppError("Cannot delete an enrolled admission");
  }

  await prisma.admission.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Admission deleted" } });
});

export default router;