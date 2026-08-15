import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import NepaliDate from "nepali-date-converter";
import prisma from "../utils/prisma";
import { authenticate, authorize, invalidateUserCache, getSchoolId } from "../middleware/auth";
import { verifySection, verifyStudent, verifySubject } from "../utils/schoolScope";
import { AppError } from "../middleware/errorHandler";
import { getStudentDefaultPassword } from "../utils/studentPassword";
import { mangleEmail, unmangleEmail } from "../utils/deactivatedEmail";
import { Prisma } from "@prisma/client";

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
  if (user.role === "ADMIN") return;

  if (user.role === "TEACHER") {
    const teacherId = await getTeacherId(user.userId);
    if (!teacherId) throw new AppError("Teacher record not found for this user", 403);
    const authorized = await isClassTeacherOf(teacherId, sectionId);
    if (!authorized) throw new AppError("You can only manage students in your assigned section", 403);
    return;
  }

  throw new AppError("Not authorized", 403);
}

/** Check if a teacher has ANY assignment (class teacher or subject) for a given section. */
async function isTeacherOfSection(teacherId: string, sectionId: string): Promise<boolean> {
  const assignment = await prisma.teacherAssignment.findFirst({
    where: { teacherId, sectionId },
  });
  return !!assignment;
}

/** Authorize read access to a specific student record based on role. */
async function authorizeStudentRead(userId: string, role: string, studentId: string, studentSectionId: string): Promise<void> {
  // Admin and accountant can see everything
  if (role === "ADMIN" || role === "ACCOUNTANT") return;

  // Teachers can see students in sections they're assigned to
  if (role === "TEACHER") {
    const teacherId = await getTeacherId(userId);
    if (!teacherId) throw new AppError("Teacher record not found", 403);
    const assigned = await isTeacherOfSection(teacherId, studentSectionId);
    if (!assigned) throw new AppError("You can only view students in your assigned sections", 403);
    return;
  }

  // Students can only see their own record
  if (role === "STUDENT") {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { studentId: true } });
    if (user?.studentId !== studentId) throw new AppError("You can only view your own record", 403);
    return;
  }

  // Parents can only see linked children
  if (role === "PARENT") {
    const link = await prisma.parentStudent.findFirst({ where: { parentId: userId, studentId } });
    if (!link) throw new AppError("You can only view your linked children", 403);
    return;
  }

  throw new AppError("Not authorized", 403);
}

/**
 * Login address for an auto-created student account.
 * Email: firstname.lastname@school.edu.np (id suffix guarantees uniqueness in one query)
 */
function studentLoginEmail(studentId: string, studentName: string): string {
  const baseName = studentName.toLowerCase().trim().replace(/\s+/g, ".");
  // Use the studentId suffix to guarantee uniqueness without any DB lookup loop
  return `${baseName}.${studentId.slice(-6)}@school.edu.np`;
}

/**
 * Hash the default student password once per request, ahead of any transaction —
 * bcrypt is slow enough that hashing inside one would risk the interactive
 * transaction timeout on a bulk import.
 *
 * Returns null when account provisioning is deliberately switched off: in
 * production with DEFAULT_STUDENT_PASSWORD unset, getStudentDefaultPassword()
 * refuses the publicly-known fallback rather than handing every student the same
 * guessable login. That case is intentional and creates the student without a
 * login account. Every *other* failure is a real bug and must not be swallowed —
 * that is what silently produced students who could never log in.
 */
function resolveStudentPassword(): string | null {
  try {
    return getStudentDefaultPassword();
  } catch (err) {
    // The only throw is the deliberate production refusal above.
    console.warn("Skipping student login account:", (err as Error).message);
    return null;
  }
}

async function hashStudentPassword(): Promise<string | null> {
  const defaultPassword = resolveStudentPassword();
  return defaultPassword === null ? null : bcrypt.hash(defaultPassword, 10);
}

/** Data for the student's login row. Created in the same transaction as the student. */
function studentUserData(
  student: { id: string; name: string },
  hashedPassword: string,
  schoolId: string
): Prisma.UserUncheckedCreateInput {
  return {
    email: studentLoginEmail(student.id, student.name),
    password: hashedPassword,
    role: "STUDENT",
    studentId: student.id,
    schoolId,
    isActive: true,
  };
}

/**
 * A duplicate login email means the student would exist with no way to sign in,
 * which is the failure this whole path is written to avoid. Surface it as a
 * clear 409 instead of the generic "a record with this data already exists".
 */
function asLoginEmailConflict(err: unknown, studentName: string): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return new AppError(
      `Could not create a login account for "${studentName}" — the generated email is already in use. The student was not saved. Rename slightly or check for an existing record.`,
      409
    );
  }
  return err;
}

// ─── ROUTES ─────────────────────────────────────────────

// GET /api/students?sectionId=xxx&gradeId=xxx
// Admin/Accountant: all students. Teacher: only their assigned sections. Student/Parent: denied (use /me or /my-children).
router.get("/", authenticate, async (req, res) => {
  const user = req.user!;
  const schoolId = getSchoolId(req);
  const { sectionId, gradeId, search, subjectId } = req.query;
  const where: any = { isActive: true, section: { grade: { academicYear: { schoolId } } } };
  if (search) where.name = { contains: String(search), mode: "insensitive" };
  if (sectionId) {
    await verifySection(String(sectionId), schoolId);
    where.sectionId = String(sectionId);
  }
  if (gradeId) where.section = { ...where.section, gradeId: String(gradeId) };

  // `subjectId` narrows the roster to the students who actually take that subject.
  // Only meaningful for an optional one — everybody takes the compulsory subjects, so
  // for those this is a no-op rather than an error. Mark entry uses it so an elective's
  // screen lists only the students it can legitimately save marks for.
  if (subjectId) {
    await verifySubject(String(subjectId), schoolId);
    const subject = await prisma.subject.findUniqueOrThrow({
      where: { id: String(subjectId) },
      select: { isOptional: true },
    });
    if (subject.isOptional) {
      where.optionalSubjects = { some: { subjectId: String(subjectId) } };
    }
  }

  // Students and parents should use /students/me or /parents/my-children
  if (user.role === "STUDENT" || user.role === "PARENT") {
    throw new AppError("Use /students/me or /parents/my-children instead", 403);
  }

  // Teachers can only list students in sections they're assigned to
  if (user.role === "TEACHER") {
    const teacherId = await getTeacherId(user.userId);
    if (!teacherId) return res.json({ data: [] });
    const assignments = await prisma.teacherAssignment.findMany({
      where: { teacherId },
      select: { sectionId: true },
    });
    const assignedSectionIds = assignments.map(a => a.sectionId);
    // If a specific section is requested, verify teacher is assigned to it
    if (sectionId && !assignedSectionIds.includes(String(sectionId))) {
      throw new AppError("You can only view students in your assigned sections", 403);
    }
    // If no section filter, auto-restrict to assigned sections
    if (!sectionId) {
      where.sectionId = { in: assignedSectionIds };
    }
  }

  // `photo` is deliberately excluded: photos are stored as base64 data URIs, so
  // including them turns a 40-student roster into tens of megabytes of JSON.
  // Fetch a single student via GET /students/:id when the photo is actually needed.
  const students = await prisma.student.findMany({
    where,
    orderBy: { rollNo: "asc" },
    select: {
      id: true,
      name: true,
      nameNp: true,
      dateOfBirth: true,
      rollNo: true,
      symbolNumber: true,
      gender: true,
      fatherName: true,
      motherName: true,
      guardianName: true,
      guardianPhone: true,
      address: true,
      sectionId: true,
      isActive: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      section: { include: { grade: { select: { name: true } } } },
    },
  });
  res.json({ data: students });
});

// GET /api/students/:id
// GET /api/students/me — returns the student record linked to the logged-in student user
router.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: {
      student: {
        include: {
          section: { include: { grade: true } },
        },
      },
    },
  });
  if (!user?.student) throw new AppError("No student record linked to this account", 404);
  res.json({ data: user.student });
});

router.get("/:id", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  await verifyStudent(req.params.id, schoolId);
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      section: { include: { grade: true } },
      marks: { include: { subject: true, examType: true } },
      attendances: true,
      results: true,
    },
  });

  // Verify the requesting user has permission to view this student
  await authorizeStudentRead(req.user!.userId, req.user!.role, student.id, student.sectionId);

  res.json({ data: student });
});

// GET /api/students/:id/optional-subjects
//
// Every optional subject offered by this student's grade, each flagged with whether
// this student takes it. Compulsory subjects are deliberately not listed — everyone
// in the grade takes those, so there is nothing to choose.
router.get("/:id/optional-subjects", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  await verifyStudent(req.params.id, schoolId);

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: req.params.id },
    select: { id: true, sectionId: true, section: { select: { gradeId: true } } },
  });
  await authorizeStudentRead(req.user!.userId, req.user!.role, student.id, student.sectionId);

  const [offered, enrolled] = await Promise.all([
    prisma.subject.findMany({
      where: { gradeId: student.section.gradeId, isOptional: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true, nameNp: true },
    }),
    prisma.studentOptionalSubject.findMany({
      where: { studentId: student.id },
      select: { subjectId: true },
    }),
  ]);

  const enrolledIds = new Set(enrolled.map((e) => e.subjectId));
  res.json({
    data: offered.map((s) => ({ ...s, isEnrolled: enrolledIds.has(s.id) })),
  });
});

// PUT /api/students/:id/optional-subjects — Admin only. Replaces the whole set.
router.put("/:id/optional-subjects", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  await verifyStudent(req.params.id, schoolId);

  const schema = z.object({ subjectIds: z.array(z.string().min(1)).max(50) });
  const { subjectIds } = schema.parse(req.body);

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: req.params.id },
    select: { id: true, section: { select: { gradeId: true } } },
  });

  // Every submitted subject must be an optional subject of THIS student's grade.
  // Without this an admin could enrol a student in another grade's — or another
  // school's — subject, the same class of unverified-FK hole S1-S4 covered.
  if (subjectIds.length > 0) {
    const valid = await prisma.subject.count({
      where: {
        id: { in: subjectIds },
        gradeId: student.section.gradeId,
        isOptional: true,
      },
    });
    if (valid !== new Set(subjectIds).size) {
      throw new AppError("One or more subjects are not optional subjects of this student's grade");
    }
  }

  // Replace wholesale inside a transaction — a partial write would leave the student
  // enrolled in some electives and not others with no way to tell which.
  await prisma.$transaction([
    prisma.studentOptionalSubject.deleteMany({ where: { studentId: student.id } }),
    prisma.studentOptionalSubject.createMany({
      data: subjectIds.map((subjectId) => ({ studentId: student.id, subjectId })),
      skipDuplicates: true,
    }),
  ]);

  res.json({ data: { studentId: student.id, subjectIds } });
});

// POST /api/students — Admin only. Creates student + user account + admission paper trail.
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const data = studentSchema.parse(req.body);
  await verifySection(data.sectionId, schoolId);

  // Resolve section → grade → academic year for the admission record
  const section = await prisma.section.findUniqueOrThrow({
    where: { id: data.sectionId },
    include: { grade: { include: { academicYear: true } } },
  });

  const createData: Prisma.StudentCreateInput = {
    name: data.name,
    nameNp: data.nameNp,
    dateOfBirth: data.dateOfBirth,
    rollNo: data.rollNo,
    symbolNumber: data.symbolNumber,
    gender: data.gender,
    fatherName: data.fatherName,
    motherName: data.motherName,
    guardianName: data.guardianName,
    guardianPhone: data.guardianPhone,
    address: data.address,
    photo: data.photo,
    isActive: data.isActive,
    section: { connect: { id: data.sectionId } },
  };
  // Student and login account are created together — a student saved without a
  // usable login just surfaces later as "invalid email or password".
  const hashedPassword = await hashStudentPassword();

  let student: Awaited<ReturnType<typeof prisma.student.create>>;
  try {
    student = await prisma.$transaction(async (tx) => {
      const newStudent = await tx.student.create({ data: createData });
      if (hashedPassword) {
        await tx.user.create({ data: studentUserData(newStudent, hashedPassword, schoolId) });
      }
      return newStudent;
    });
  } catch (err) {
    throw asLoginEmailConflict(err, data.name);
  }

  // Auto-create admission record so there is always a paper trail
  try {
    const todayBS = new NepaliDate().format("YYYY/MM/DD");
    await prisma.admission.create({
      data: {
        studentName: student.name,
        studentNameNp: student.nameNp || null,
        dateOfBirth: student.dateOfBirth || null,
        gender: student.gender || null,
        fatherName: student.fatherName || null,
        motherName: student.motherName || null,
        guardianName: student.guardianName || null,
        guardianPhone: student.guardianPhone || null,
        address: student.address || null,
        applyingForGradeId: section.grade.id,
        academicYearId: section.grade.academicYearId,
        status: "ENROLLED",
        appliedDate: todayBS,
        reviewedById: req.user!.userId,
        reviewedDate: todayBS,
        remarks: "Added directly by admin",
      },
    });
  } catch (err) {
    console.error("Failed to auto-create admission record:", err);
  }

  // Real account-creation failures already propagate (the create is inside the
  // transaction above). What stays silent is the *deliberate* skip — production
  // with DEFAULT_STUDENT_PASSWORD unset — which leaves a student with no login and
  // told the admin nothing. Report it the same way `/admissions/:id/enroll` does.
  res.status(201).json({ data: { ...student, accountCreated: hashedPassword !== null } });
});

// POST /api/students/bulk — create multiple + auto-create user accounts
router.post("/bulk", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const schema = z.object({
    sectionId: z.string().min(1),
    students: z.array(studentSchema.omit({ sectionId: true })),
  });
  const { sectionId, students } = schema.parse(req.body);
  await verifySection(sectionId, schoolId);
  const user = req.user!;

  await authorizeForSection(user, sectionId);

  // Hash every password up front — bcrypt is far too slow to run inside the
  // transaction, where it would hold a pooled connection and risk the timeout.
  // Resolved once so a disabled-provisioning warning isn't logged per student.
  const defaultPassword = resolveStudentPassword();
  const hashedPasswords = await Promise.all(
    students.map(() => (defaultPassword === null ? null : bcrypt.hash(defaultPassword, 10)))
  );

  // Students and their login accounts go in together. This import was already
  // all-or-nothing for the student rows; extending it to the user rows is what
  // stops a partial import leaving students who can never sign in.
  const created = await prisma.$transaction(
    async (tx) => {
      const rows = [];
      for (const [i, s] of students.entries()) {
        const newStudent = await tx.student.create({ data: {
          name: s.name,
          nameNp: s.nameNp,
          dateOfBirth: s.dateOfBirth,
          rollNo: s.rollNo,
          symbolNumber: s.symbolNumber,
          gender: s.gender,
          fatherName: s.fatherName,
          motherName: s.motherName,
          guardianName: s.guardianName,
          guardianPhone: s.guardianPhone,
          address: s.address,
          photo: s.photo,
          isActive: s.isActive ?? true,
          section: { connect: { id: sectionId } },
        } as Prisma.StudentCreateInput });

        const hashedPassword = hashedPasswords[i];
        if (hashedPassword) {
          try {
            await tx.user.create({ data: studentUserData(newStudent, hashedPassword, schoolId) });
          } catch (err) {
            throw asLoginEmailConflict(err, s.name);
          }
        }
        rows.push(newStudent);
      }
      return rows;
    },
    // A large import is many round trips; the 5s default is not enough.
    { timeout: 30_000, maxWait: 10_000 }
  );

  res.status(201).json({ data: created });
});

// PUT /api/students/:id
router.put("/:id", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  await verifyStudent(req.params.id, schoolId);
  const data = studentSchema.partial().parse(req.body);
  const user = req.user!;

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: req.params.id },
  });

  await authorizeForSection(user, student.sectionId);

  if (user.role === "TEACHER") {
    delete data.sectionId;
  }

  // Keep the login account in step with the student record. Without this a
  // student deactivated via DELETE (which frees their email by mangling it)
  // stayed locked out forever after being reactivated here — the student row
  // read "Active" while the login still held a `deleted_<id>_` address.
  //
  // Validation reads happen first; the two writes then go in one transaction so
  // they cannot drift apart the way the delete path used to.
  let linkedUser: { id: string; email: string } | null = null;
  let userUpdate: Prisma.UserUpdateInput | null = null;

  if (data.isActive !== undefined) {
    linkedUser = await prisma.user.findFirst({ where: { studentId: req.params.id } });
    if (linkedUser) {
      userUpdate = { isActive: data.isActive };

      if (data.isActive) {
        const originalEmail = unmangleEmail(linkedUser.id, linkedUser.email);
        if (originalEmail !== linkedUser.email) {
          const existing = await prisma.user.findUnique({ where: { email: originalEmail } });
          if (existing && existing.id !== linkedUser.id) {
            throw new AppError(
              "Cannot restore this student's original login email — it is now used by another account.",
              409
            );
          }
          userUpdate.email = originalEmail;
        }
      }
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (linkedUser && userUpdate) {
      await tx.user.update({ where: { id: linkedUser.id }, data: userUpdate });
    }
    return tx.student.update({ where: { id: req.params.id }, data });
  });

  // After commit — this clears an in-memory cache, not database state. Busted in
  // both directions: the cached active/inactive verdict lives for 60s, so
  // skipping it on reactivation would 401 a student who has just been let back in.
  if (linkedUser && data.isActive !== undefined) invalidateUserCache(linkedUser.id);

  res.json({ data: updated });
});

// POST /api/students/assign-rolls
router.post("/assign-rolls", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const schema = z.object({
    sectionId: z.string().min(1),
    assignments: z.array(z.object({
      studentId: z.string().min(1),
      rollNo: z.number().int().min(1),
    })),
  });

  const { sectionId, assignments } = schema.parse(req.body);
  await verifySection(sectionId, schoolId);
  const user = req.user!;

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
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  await verifyStudent(req.params.id, schoolId);
  // Also deactivate the linked user account and free up the email — it stays
  // unique in the DB, so a live account otherwise blocks it forever from being
  // reused by a new/reactivated account. Both rows move together, so a failure
  // cannot leave a deactivated student who can still log in.
  const linkedUser = await prisma.user.findFirst({ where: { studentId: req.params.id } });

  await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    if (linkedUser) {
      await tx.user.update({
        where: { id: linkedUser.id },
        data: { isActive: false, email: mangleEmail(linkedUser.id, linkedUser.email) },
      });
    }
  });

  // After commit — this clears an in-memory cache, not database state.
  if (linkedUser) invalidateUserCache(linkedUser.id);

  res.json({ data: { message: "Student deactivated" } });
});

export default router;