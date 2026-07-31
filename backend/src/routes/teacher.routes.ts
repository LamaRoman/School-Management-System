import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../utils/prisma";
import { authenticate, authorize, invalidateUserCache, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { mangleEmail, unmangleEmail } from "../utils/deactivatedEmail";

const router = Router();

const teacherListInclude = {
  assignments: {
    include: {
      section: { include: { grade: { select: { name: true } } } },
      subject: { select: { name: true } },
    },
  },
  user: { select: { id: true, email: true, isActive: true } },
} as const;

// GET /api/teachers
router.get("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const teachers = await prisma.teacher.findMany({
    where: { isActive: true, schoolId },
    orderBy: { name: "asc" },
    include: teacherListInclude,
  });
  res.json({ data: teachers });
});

// GET /api/teachers/all — includes deactivated
router.get("/all", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const teachers = await prisma.teacher.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
    include: teacherListInclude,
  });
  res.json({ data: teachers });
});

// GET /api/teachers/:id
router.get("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const teacher = await prisma.teacher.findFirstOrThrow({
    where: { id: req.params.id, schoolId },
    include: {
      assignments: {
        include: {
          section: { include: { grade: { select: { name: true } } } },
          subject: { select: { name: true } },
        },
      },
      user: { select: { id: true, email: true, isActive: true } },
    },
  });
  res.json({ data: teacher });
});

// POST /api/teachers
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const schema = z.object({
    name: z.string().min(1).max(200),
    nameNp: z.string().max(200).optional(),
    phone: z.string().max(30).optional(),
    email: z.string().email("Valid email required for teacher login").max(320),
    password: z.string().min(6, "Password must be at least 6 characters").max(72),
  });

  const data = schema.parse(req.body);

  const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
  if (existingUser) throw new AppError("A user with this email already exists");

  // `teachers.email` has no unique index, so the check above misses a teacher
  // record holding this address without a login account — you could end up with
  // two active teachers on one address, only one of them able to sign in.
  // Deactivated teachers are excluded so re-adding someone still works.
  const existingTeacher = await prisma.teacher.findFirst({
    where: { schoolId, email: data.email, isActive: true },
  });
  if (existingTeacher) {
    throw new AppError(`${existingTeacher.name} is already using this email`, 409);
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  const teacher = await prisma.$transaction(async (tx) => {
    const newTeacher = await tx.teacher.create({
      data: {
        schoolId,
        name: data.name,
        nameNp: data.nameNp || null,
        phone: data.phone || null,
        email: data.email,
      },
    });

    await tx.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        role: "TEACHER",
        teacherId: newTeacher.id,
        schoolId,
        isActive: true,
      },
    });

    return newTeacher;
  });

  const result = await prisma.teacher.findUniqueOrThrow({
    where: { id: teacher.id },
    include: teacherListInclude,
  });

  res.status(201).json({ data: result });
});

// PUT /api/teachers/:id
router.put("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const schema = z.object({
    name: z.string().min(1).max(200).optional(),
    nameNp: z.string().max(200).nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
    email: z.string().email().max(320).optional(),
    isActive: z.boolean().optional(),
  });

  const data = schema.parse(req.body);

  // Verify ownership
  const teacher = await prisma.teacher.findFirstOrThrow({
    where: { id: req.params.id, schoolId },
    include: { user: true },
  });

  // A teacher with no linked user row has no login at all — the record predates
  // linked accounts, or its account was never provisioned. Changing the "login
  // email" or flipping the record back to Active cannot do anything for sign-in,
  // and reporting success for it is what made these records so hard to spot.
  // Deactivating still works: there is simply no account to deactivate.
  if (!teacher.user) {
    // Only a real change is rejected — the edit form always resends the
    // prefilled address, and that must not block editing the name or phone.
    if (data.email && data.email !== teacher.email) {
      throw new AppError(
        `${teacher.name} has no login account, so there is no login email to change. Their name, phone and Nepali name can still be edited.`,
        409
      );
    }
    if (data.isActive === true) {
      throw new AppError(
        `${teacher.name} has no login account, so reactivating the record will not restore sign-in access.`,
        409
      );
    }
  }

  // Same guard as on create — another active teacher record must not already
  // hold this address, whether or not it has a login account behind it.
  if (data.email && data.email !== teacher.email) {
    const existingTeacher = await prisma.teacher.findFirst({
      where: { schoolId, email: data.email, isActive: true, id: { not: teacher.id } },
    });
    if (existingTeacher) {
      throw new AppError(`${existingTeacher.name} is already using this email`, 409);
    }
  }

  // Validation reads happen first, then every write lands in one transaction —
  // the login row and the teacher row must not be able to drift apart.
  const userUpdate: Prisma.UserUpdateInput = {};

  if (data.email && teacher.user) {
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser && existingUser.id !== teacher.user.id) {
      throw new AppError("A user with this email already exists");
    }
    userUpdate.email = data.email;
  }

  if (data.isActive !== undefined && teacher.user) {
    userUpdate.isActive = data.isActive;

    // Reactivating without an explicit new email: restore the original email
    // that deactivation mangled away, if it's not now taken by another account.
    if (data.isActive && !data.email) {
      const originalEmail = unmangleEmail(teacher.user.id, teacher.user.email);
      if (originalEmail !== teacher.user.email) {
        const existingUser = await prisma.user.findUnique({ where: { email: originalEmail } });
        if (existingUser && existingUser.id !== teacher.user.id) {
          throw new AppError(
            "Cannot restore original email — it is now used by another account. Please set a new email to reactivate."
          );
        }
        userUpdate.email = originalEmail;
      }
    }
  }

  const linkedUserId = teacher.user?.id;
  const updated = await prisma.$transaction(async (tx) => {
    if (linkedUserId && Object.keys(userUpdate).length > 0) {
      await tx.user.update({ where: { id: linkedUserId }, data: userUpdate });
    }
    return tx.teacher.update({
      where: { id: req.params.id },
      data: {
        name: data.name,
        nameNp: data.nameNp,
        phone: data.phone,
        email: data.email,
        isActive: data.isActive,
      },
      include: teacherListInclude,
    });
  });

  // After commit — this clears an in-memory cache, not database state. Busted in
  // both directions: the cache holds a 60s active/inactive verdict, so skipping
  // it on reactivation left a stale "inactive" that 401s a teacher who has just
  // been let back in and can log in perfectly well.
  if (linkedUserId && data.isActive !== undefined) invalidateUserCache(linkedUserId);

  res.json({ data: updated });
});

// POST /api/teachers/:id/reset-password
//
// Doubles as the repair path for teachers that have no login account at all —
// records created before accounts were linked to teachers, which show up in the
// admin list looking normal but can never sign in. Rather than refusing, this
// provisions the missing account: it is the one admin action that already
// collects a password, so no new UI or flow is needed.
router.post("/:id/reset-password", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { newPassword, email } = z
    .object({
      newPassword: z.string().min(6).max(72),
      // Only consulted when provisioning; required if the teacher record has no
      // email of its own to use as the login address.
      email: z.string().email().max(320).optional(),
    })
    .parse(req.body);

  const teacher = await prisma.teacher.findFirstOrThrow({
    where: { id: req.params.id, schoolId },
    include: { user: true },
  });

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  if (teacher.user) {
    await prisma.user.update({ where: { id: teacher.user.id }, data: { password: hashedPassword } });
    res.json({ data: { message: `Password reset for ${teacher.name}` } });
    return;
  }

  // ─── Provision a missing account ───
  const loginEmail = email || teacher.email;
  if (!loginEmail) {
    throw new AppError(
      `${teacher.name} has no login account and no email on record. Provide an email address to create one.`,
      400
    );
  }

  const taken = await prisma.user.findUnique({ where: { email: loginEmail } });
  if (taken) {
    throw new AppError(
      `Cannot create a login for ${teacher.name}: ${loginEmail} is already used by another account. Provide a different email.`,
      409
    );
  }

  const takenByTeacher = await prisma.teacher.findFirst({
    where: { schoolId, email: loginEmail, isActive: true, id: { not: teacher.id } },
  });
  if (takenByTeacher) {
    throw new AppError(
      `Cannot create a login for ${teacher.name}: ${takenByTeacher.name} is already using ${loginEmail}.`,
      409
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          email: loginEmail,
          password: hashedPassword,
          role: "TEACHER",
          teacherId: teacher.id,
          schoolId,
          // A deactivated teacher must not gain a working login as a side effect
          // of being repaired — reactivating the record enables it.
          isActive: teacher.isActive,
        },
      });
      // Keep the teacher's own email column in step with the login address.
      if (teacher.email !== loginEmail) {
        await tx.teacher.update({ where: { id: teacher.id }, data: { email: loginEmail } });
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(
        `Cannot create a login for ${teacher.name}: ${loginEmail} was just taken by another account.`,
        409
      );
    }
    throw err;
  }

  res.json({
    data: {
      message: teacher.isActive
        ? `Login account created for ${teacher.name} (${loginEmail})`
        : `Login account created for ${teacher.name} (${loginEmail}) — reactivate them to enable sign-in`,
    },
  });
});

// DELETE /api/teachers/:id (soft delete)
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const teacher = await prisma.teacher.findFirstOrThrow({
    where: { id: req.params.id, schoolId },
    include: { user: true },
  });

  // Both rows move together. Deactivating the teacher while the user update
  // failed used to leave a teacher hidden from every admin list who could still
  // log in perfectly well.
  await prisma.$transaction(async (tx) => {
    await tx.teacher.update({ where: { id: req.params.id }, data: { isActive: false } });

    if (teacher.user) {
      // Free up the email so it can be reused by a new/reactivated account —
      // email stays unique in the DB, so a live account otherwise blocks it forever.
      await tx.user.update({
        where: { id: teacher.user.id },
        data: { isActive: false, email: mangleEmail(teacher.user.id, teacher.user.email) },
      });
    }
  });

  // After commit — this clears an in-memory cache, not database state.
  if (teacher.user) invalidateUserCache(teacher.user.id);

  res.json({ data: { message: `${teacher.name} deactivated` } });
});

export default router;
