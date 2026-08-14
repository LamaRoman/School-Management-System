/**
 * Account Provisioning Regression Tests
 *
 * Covers the two ways a person could end up existing in the system with no
 * usable login — both of which surfaced only as "Invalid email or password":
 *
 *   1. Repeated deactivation stacked a second `deleted_<id>_` marker onto the
 *      login email. Reactivation stripped one, leaving the account "Active" in
 *      the admin UI holding an address nobody could sign in with.
 *   2. A student's user row was created outside the student's transaction with
 *      the error swallowed, so a duplicate login email produced a saved student
 *      with no account and a 201 response.
 */

import request from "supertest";
import { AppError } from "../../middleware/errorHandler";
import {
  app,
  prisma,
  cleanDatabase,
  disconnectDatabase,
  seedSchoolContext,
  loginAs,
  authHeader,
} from "../helpers";

let ctx: Awaited<ReturnType<typeof seedSchoolContext>>;
let adminToken: string;

beforeAll(async () => {
  await cleanDatabase();
  ctx = await seedSchoolContext({
    schoolName: "Provisioning Test School",
    schoolCode: "PTS",
    adminEmail: "admin@provisioning.test",
  });
  const login = await loginAs("admin@provisioning.test", ctx.adminPassword);
  adminToken = login.token;
});

afterAll(async () => {
  await disconnectDatabase();
});

// ─── #2: deactivation must not corrupt the login email ──

describe("Teacher deactivate/reactivate cycles", () => {
  const email = "cycle.teacher@provisioning.test";
  const password = "Teach@123";
  let teacherId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/teachers")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Cycle Teacher", email, password });
    expect(res.status).toBe(201);
    teacherId = res.body.data.id;
  });

  it("creates the teacher with a working login", async () => {
    const login = await request(app).post("/auth/login").send({ email, password });
    expect(login.status).toBe(200);
  });

  it("survives a repeated deactivation without stacking the email marker", async () => {
    // Two DELETEs — a double-clicked confirm, or any client retry.
    await request(app).delete(`/teachers/${teacherId}`).set("Authorization", authHeader(adminToken));
    await request(app).delete(`/teachers/${teacherId}`).set("Authorization", authHeader(adminToken));

    const user = await prisma.user.findFirstOrThrow({ where: { teacherId } });
    expect(user.isActive).toBe(false);
    expect(user.email).toBe(`deleted_${user.id}_${email}`);
    // The bug: `deleted_<id>_deleted_<id>_<email>`
    expect(user.email.match(/deleted_/g)).toHaveLength(1);
  });

  it("restores a login that actually works after reactivation", async () => {
    const res = await request(app)
      .put(`/teachers/${teacherId}`)
      .set("Authorization", authHeader(adminToken))
      .send({ isActive: true });
    expect(res.status).toBe(200);

    const user = await prisma.user.findFirstOrThrow({ where: { teacherId } });
    expect(user.email).toBe(email);
    expect(user.isActive).toBe(true);

    const login = await request(app).post("/auth/login").send({ email, password });
    expect(login.status).toBe(200);
  });

  it("repairs an email already stacked by the old code", async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { teacherId } });
    // Reproduce the corruption the previous implementation left behind.
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false, email: `deleted_${user.id}_deleted_${user.id}_${email}` },
    });
    await prisma.teacher.update({ where: { id: teacherId }, data: { isActive: false } });

    await request(app)
      .put(`/teachers/${teacherId}`)
      .set("Authorization", authHeader(adminToken))
      .send({ isActive: true });

    const repaired = await prisma.user.findFirstOrThrow({ where: { teacherId } });
    expect(repaired.email).toBe(email);

    const login = await request(app).post("/auth/login").send({ email, password });
    expect(login.status).toBe(200);
  });
});

// ─── Orphaned teachers must not report false success ────

describe("Teacher with no linked login account", () => {
  let orphanId: string;

  beforeAll(async () => {
    // Mirrors a teacher created before login accounts were linked.
    const orphan = await prisma.teacher.create({
      data: { schoolId: ctx.school.id, name: "Orphan Teacher", email: "orphan@provisioning.test" },
    });
    orphanId = orphan.id;
  });

  it("still allows editing details that do not need an account", async () => {
    const res = await request(app)
      .put(`/teachers/${orphanId}`)
      .set("Authorization", authHeader(adminToken))
      // The edit form always resends the prefilled address unchanged.
      .send({ name: "Orphan Renamed", phone: "9800000000", email: "orphan@provisioning.test" });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Orphan Renamed");
  });

  it("rejects changing the login email instead of silently succeeding", async () => {
    const res = await request(app)
      .put(`/teachers/${orphanId}`)
      .set("Authorization", authHeader(adminToken))
      .send({ email: "newaddress@provisioning.test" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no login account/i);

    const after = await prisma.teacher.findUniqueOrThrow({ where: { id: orphanId } });
    expect(after.email).toBe("orphan@provisioning.test");
  });

  it("rejects reactivation instead of implying access was restored", async () => {
    await prisma.teacher.update({ where: { id: orphanId }, data: { isActive: false } });

    const res = await request(app)
      .put(`/teachers/${orphanId}`)
      .set("Authorization", authHeader(adminToken))
      .send({ isActive: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no login account/i);
  });

  it("still allows deactivating — there is simply no account to disable", async () => {
    await prisma.teacher.update({ where: { id: orphanId }, data: { isActive: true } });

    const res = await request(app)
      .put(`/teachers/${orphanId}`)
      .set("Authorization", authHeader(adminToken))
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });
});

// ─── One address, one active teacher ────────────────────

describe("Duplicate teacher email guard", () => {
  const email = "shared.address@provisioning.test";

  it("blocks a second active teacher on an address held without a login", async () => {
    // An accountless record still occupies the address as far as staff are
    // concerned, and `teachers.email` has no unique index to catch it.
    await prisma.teacher.create({
      data: { schoolId: ctx.school.id, name: "Holder", email, isActive: true },
    });

    const res = await request(app)
      .post("/teachers")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Second Teacher", email, password: "Second@123" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Holder is already using/i);

    expect(await prisma.teacher.count({ where: { email, isActive: true } })).toBe(1);
  });

  it("blocks reassigning that address to another teacher via edit", async () => {
    const other = await request(app)
      .post("/teachers")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Edit Target", email: "edit.target@provisioning.test", password: "Edit@1234" });

    const res = await request(app)
      .put(`/teachers/${other.body.data.id}`)
      .set("Authorization", authHeader(adminToken))
      .send({ email });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already using/i);
  });

  it("still lets a deactivated teacher's address be reused", async () => {
    const freed = "freed.address@provisioning.test";
    const created = await request(app)
      .post("/teachers")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Leaver", email: freed, password: "Leaver@123" });

    await request(app)
      .delete(`/teachers/${created.body.data.id}`)
      .set("Authorization", authHeader(adminToken));

    const res = await request(app)
      .post("/teachers")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Replacement", email: freed, password: "Replace@123" });
    expect(res.status).toBe(201);

    const login = await request(app).post("/auth/login").send({ email: freed, password: "Replace@123" });
    expect(login.status).toBe(200);
  });
});

// ─── Deactivation moves both rows or neither ────────────

describe("Deactivation is atomic", () => {
  it("leaves teacher and login consistent", async () => {
    const email = "atomic.deactivate@provisioning.test";
    const created = await request(app)
      .post("/teachers")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Atomic Deactivate", email, password: "Atomic@123" });

    await request(app)
      .delete(`/teachers/${created.body.data.id}`)
      .set("Authorization", authHeader(adminToken));

    const teacher = await prisma.teacher.findUniqueOrThrow({ where: { id: created.body.data.id } });
    const user = await prisma.user.findFirstOrThrow({ where: { teacherId: created.body.data.id } });
    expect(teacher.isActive).toBe(false);
    expect(user.isActive).toBe(false);

    // The whole point: a deactivated teacher must not still be able to sign in.
    const login = await request(app).post("/auth/login").send({ email, password: "Atomic@123" });
    expect(login.status).toBe(401);
  });

  it("leaves student and login consistent", async () => {
    const created = await request(app)
      .post("/students")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Atomic Student Deactivate", sectionId: ctx.section.id });

    await request(app)
      .delete(`/students/${created.body.data.id}`)
      .set("Authorization", authHeader(adminToken));

    const student = await prisma.student.findUniqueOrThrow({ where: { id: created.body.data.id } });
    const user = await prisma.user.findFirstOrThrow({ where: { studentId: created.body.data.id } });
    expect(student.isActive).toBe(false);
    expect(user.isActive).toBe(false);
  });
});

// ─── Lockout must not become an existence oracle ────────

describe("Failed logins do not reveal whether an account exists", () => {
  it("locks an unknown email exactly like a real one", async () => {
    const unknown = "definitely.not.a.user@provisioning.test";
    const real = "oracle.check@provisioning.test";
    await request(app)
      .post("/teachers")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Oracle Check", email: real, password: "Oracle@123" });

    const hammer = async (email: string) => {
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await request(app).post("/auth/login").send({ email, password: "wrong-password" });
        codes.push(res.status);
      }
      return codes;
    };

    // Identical status sequences, so "locked" cannot be used to tell a real
    // account from a made-up one.
    expect(await hammer(unknown)).toEqual(await hammer(real));
  });
});

// ─── Repairing a teacher that has no login account ──────

describe("Reset password provisions a missing account", () => {
  it("creates a working login from the teacher's own email", async () => {
    const orphan = await prisma.teacher.create({
      data: { schoolId: ctx.school.id, name: "Repair Me", email: "repair.me@provisioning.test" },
    });

    const res = await request(app)
      .post(`/teachers/${orphan.id}/reset-password`)
      .set("Authorization", authHeader(adminToken))
      .send({ newPassword: "Repaired@1" });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(/created/i);

    const login = await request(app)
      .post("/auth/login")
      .send({ email: "repair.me@provisioning.test", password: "Repaired@1" });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe("TEACHER");

    // And the record is no longer an orphan, so editing it works again.
    const edit = await request(app)
      .put(`/teachers/${orphan.id}`)
      .set("Authorization", authHeader(adminToken))
      .send({ email: "repaired.new@provisioning.test" });
    expect(edit.status).toBe(200);
  });

  it("accepts an explicit email when the record has none", async () => {
    const orphan = await prisma.teacher.create({
      data: { schoolId: ctx.school.id, name: "No Email Teacher" },
    });

    const missing = await request(app)
      .post(`/teachers/${orphan.id}/reset-password`)
      .set("Authorization", authHeader(adminToken))
      .send({ newPassword: "Repaired@2" });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/provide an email/i);

    const res = await request(app)
      .post(`/teachers/${orphan.id}/reset-password`)
      .set("Authorization", authHeader(adminToken))
      .send({ newPassword: "Repaired@2", email: "supplied@provisioning.test" });
    expect(res.status).toBe(200);

    // The teacher's own email column is brought in step with the login address.
    const after = await prisma.teacher.findUniqueOrThrow({ where: { id: orphan.id } });
    expect(after.email).toBe("supplied@provisioning.test");

    const login = await request(app)
      .post("/auth/login")
      .send({ email: "supplied@provisioning.test", password: "Repaired@2" });
    expect(login.status).toBe(200);
  });

  it("refuses an email already used by another account", async () => {
    const orphan = await prisma.teacher.create({
      data: { schoolId: ctx.school.id, name: "Clash Teacher", email: "admin@provisioning.test" },
    });

    const res = await request(app)
      .post(`/teachers/${orphan.id}/reset-password`)
      .set("Authorization", authHeader(adminToken))
      .send({ newPassword: "Repaired@3" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already used/i);

    expect(await prisma.user.count({ where: { teacherId: orphan.id } })).toBe(0);
  });

  it("does not hand a deactivated teacher a working login", async () => {
    const orphan = await prisma.teacher.create({
      data: {
        schoolId: ctx.school.id,
        name: "Inactive Teacher",
        email: "inactive@provisioning.test",
        isActive: false,
      },
    });

    const res = await request(app)
      .post(`/teachers/${orphan.id}/reset-password`)
      .set("Authorization", authHeader(adminToken))
      .send({ newPassword: "Repaired@4" });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(/reactivate/i);

    const created = await prisma.user.findFirstOrThrow({ where: { teacherId: orphan.id } });
    expect(created.isActive).toBe(false);

    const blocked = await request(app)
      .post("/auth/login")
      .send({ email: "inactive@provisioning.test", password: "Repaired@4" });
    expect(blocked.status).toBe(401);

    // Reactivating the record — now permitted, since the account exists — enables it.
    await request(app)
      .put(`/teachers/${orphan.id}`)
      .set("Authorization", authHeader(adminToken))
      .send({ isActive: true });

    const login = await request(app)
      .post("/auth/login")
      .send({ email: "inactive@provisioning.test", password: "Repaired@4" });
    expect(login.status).toBe(200);
  });

  it("still just resets the password when an account already exists", async () => {
    const email = "existing.reset@provisioning.test";
    const created = await request(app)
      .post("/teachers")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Existing Account", email, password: "Before@123" });

    const res = await request(app)
      .post(`/teachers/${created.body.data.id}/reset-password`)
      .set("Authorization", authHeader(adminToken))
      .send({ newPassword: "After@123" });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(/password reset/i);

    expect((await request(app).post("/auth/login").send({ email, password: "After@123" })).status).toBe(200);
    expect(await prisma.user.count({ where: { teacherId: created.body.data.id } })).toBe(1);
  });
});

// ─── Student reactivation restores the login ────────────

describe("Student deactivate/reactivate cycles", () => {
  let studentId: string;
  let loginEmail: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/students")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Cycle Student", sectionId: ctx.section.id });
    studentId = res.body.data.id;
    const user = await prisma.user.findFirstOrThrow({ where: { studentId } });
    loginEmail = user.email;
  });

  it("frees the login email on deactivation", async () => {
    await request(app).delete(`/students/${studentId}`).set("Authorization", authHeader(adminToken));

    const user = await prisma.user.findFirstOrThrow({ where: { studentId } });
    expect(user.isActive).toBe(false);
    expect(user.email).toBe(`deleted_${user.id}_${loginEmail}`);
  });

  it("does not stack the marker on a repeated deactivation", async () => {
    await request(app).delete(`/students/${studentId}`).set("Authorization", authHeader(adminToken));

    const user = await prisma.user.findFirstOrThrow({ where: { studentId } });
    expect(user.email.match(/deleted_/g)).toHaveLength(1);
  });

  it("restores the original login email on reactivation", async () => {
    const res = await request(app)
      .put(`/students/${studentId}`)
      .set("Authorization", authHeader(adminToken))
      .send({ isActive: true });
    expect(res.status).toBe(200);

    const user = await prisma.user.findFirstOrThrow({ where: { studentId } });
    expect(user.email).toBe(loginEmail);
    expect(user.isActive).toBe(true);
  });

  it("disables the login when deactivated through PUT", async () => {
    await request(app)
      .put(`/students/${studentId}`)
      .set("Authorization", authHeader(adminToken))
      .send({ isActive: false });

    const user = await prisma.user.findFirstOrThrow({ where: { studentId } });
    expect(user.isActive).toBe(false);
  });
});

// ─── #3: a student is never saved without its login ─────

describe("Student login account provisioning", () => {
  it("creates student and user atomically", async () => {
    const res = await request(app)
      .post("/students")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Atomic Student", sectionId: ctx.section.id });
    expect(res.status).toBe(201);

    const user = await prisma.user.findFirst({ where: { studentId: res.body.data.id } });
    expect(user).not.toBeNull();
    expect(user!.role).toBe("STUDENT");
  });

  it("rolls the student back when the login row cannot be written", async () => {
    // The generated address embeds a cuid suffix, so a collision can't be
    // arranged from outside the route. Drive the same transaction shape
    // directly instead: a student insert followed by a user insert that
    // violates the unique email index must leave no student behind.
    const taken = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    const before = await prisma.student.count();

    await expect(
      prisma.$transaction(async (tx) => {
        const student = await tx.student.create({
          data: { name: "Rollback Student", section: { connect: { id: ctx.section.id } } },
        });
        await tx.user.create({
          data: {
            email: taken.email, // already in use → P2002
            password: "x",
            role: "STUDENT",
            studentId: student.id,
            schoolId: ctx.school.id,
            isActive: true,
          },
        });
        return student;
      })
    ).rejects.toThrow();

    expect(await prisma.student.count()).toBe(before);
    expect(await prisma.student.findFirst({ where: { name: "Rollback Student" } })).toBeNull();
  });

  it("keeps a bulk import all-or-nothing across students and logins", async () => {
    const res = await request(app)
      .post("/students/bulk")
      .set("Authorization", authHeader(adminToken))
      .send({
        sectionId: ctx.section.id,
        students: [{ name: "Bulk One" }, { name: "Bulk Two" }, { name: "Bulk Three" }],
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(3);

    for (const student of res.body.data) {
      const user = await prisma.user.findFirst({ where: { studentId: student.id } });
      expect(user).not.toBeNull();
    }
  });

  it("leaves no student without a login account", async () => {
    const orphans = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) FROM students s
      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.student_id = s.id)
    `;
    // The seeded context student is created directly via Prisma, not the route.
    expect(Number(orphans[0].count)).toBeLessThanOrEqual(1);
  });
});

/**
 * X7 — enrollment used to report plain success even when the student's login
 * account was never created. The student record is deliberately still kept in
 * that case (rolling it back over a login problem is the worse outcome), but the
 * admin who enrolled them has to be told, or the divergence is only discovered
 * when a parent reports that the login does not work. That is exactly how a
 * production deployment ended up with 80 accountless students.
 */
describe("Enrollment reports whether the login account was created", () => {
  async function createApprovedAdmission(studentName: string) {
    return prisma.admission.create({
      data: {
        studentName,
        applyingForGradeId: ctx.grade.id,
        academicYearId: ctx.year.id,
        status: "APPROVED",
        appliedDate: "2081/01/01",
      },
    });
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reports accountCreated true and provisions a working login", async () => {
    const admission = await createApprovedAdmission("Enrolled With Login");

    const res = await request(app)
      .post(`/admissions/${admission.id}/enroll`)
      .set("Authorization", authHeader(adminToken))
      .send({ sectionId: ctx.section.id });

    expect(res.status).toBe(200);
    expect(res.body.data.accountCreated).toBe(true);
    expect(res.body.data.message).not.toMatch(/no login account/i);

    const user = await prisma.user.findFirst({ where: { studentId: res.body.data.studentId } });
    expect(user).not.toBeNull();
    expect(user!.role).toBe("STUDENT");
  });

  it("reports accountCreated false instead of plain success when provisioning fails", async () => {
    // The generated address embeds a cuid suffix, so a collision cannot be
    // arranged from outside the route. Force the same failure the production
    // incident hit: getStudentDefaultPassword() refusing to hand out a weak
    // fallback password.
    const studentPassword = require("../../utils/studentPassword");
    jest
      .spyOn(studentPassword, "getStudentDefaultPassword")
      .mockImplementation(() => {
        throw new AppError(
          "Cannot create student login account: DEFAULT_STUDENT_PASSWORD is not configured.",
          500
        );
      });

    const admission = await createApprovedAdmission("Enrolled Without Login");

    const res = await request(app)
      .post(`/admissions/${admission.id}/enroll`)
      .set("Authorization", authHeader(adminToken))
      .send({ sectionId: ctx.section.id });

    // The enrollment itself still succeeds — that is deliberate.
    expect(res.status).toBe(200);
    expect(res.body.data.studentId).toBeTruthy();
    const student = await prisma.student.findUnique({ where: { id: res.body.data.studentId } });
    expect(student).not.toBeNull();
    expect((await prisma.admission.findUniqueOrThrow({ where: { id: admission.id } })).status)
      .toBe("ENROLLED");

    // ...but it is no longer reported as unqualified success.
    expect(res.body.data.accountCreated).toBe(false);
    expect(res.body.data.message).toMatch(/no login account/i);
    expect(res.body.data.accountError).toBeTruthy();

    // And the account genuinely is absent, so the message is not merely cosmetic.
    expect(await prisma.user.findFirst({ where: { studentId: res.body.data.studentId } })).toBeNull();
  });

  it("does not leak the underlying driver error to the caller", async () => {
    const studentPassword = require("../../utils/studentPassword");
    jest
      .spyOn(studentPassword, "getStudentDefaultPassword")
      .mockImplementation(() => {
        throw new Error("connect ECONNREFUSED postgresql://postgres:hunter2@db:5432/app");
      });

    const admission = await createApprovedAdmission("Enrolled Opaque Error");

    const res = await request(app)
      .post(`/admissions/${admission.id}/enroll`)
      .set("Authorization", authHeader(adminToken))
      .send({ sectionId: ctx.section.id });

    expect(res.body.data.accountCreated).toBe(false);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/hunter2/);
    expect(body).not.toMatch(/ECONNREFUSED/);
  });
});
