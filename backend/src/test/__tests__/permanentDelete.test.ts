/**
 * Deactivated lists and permanent delete (students and teachers)
 *
 * Permanent delete is irreversible, so it is pinned tightly: only an admin, only a
 * deactivated record, only with the typed phrase. A student takes everything attached with
 * them — including fee payments, by the owner's decision — plus their login and the login of
 * a parent left with no children. A teacher's login is kept (disabled), because homework and
 * notices they posted belong to it.
 */

import request from "supertest";
import {
  app,
  prisma,
  cleanDatabase,
  disconnectDatabase,
  seedSchoolContext,
  createTestStudent,
  createTestUser,
  createTestFeeCategory,
  createTestTeacher,
  loginAs,
  authHeader,
} from "../helpers";

let ctx: Awaited<ReturnType<typeof seedSchoolContext>>;
let adminToken: string;

const del = (path: string, confirm?: string) =>
  request(app).delete(path).set("Authorization", authHeader(adminToken)).send(confirm === undefined ? {} : { confirm });
const deactivated = () =>
  request(app).get("/students?status=deactivated").set("Authorization", authHeader(adminToken)).expect(200);

beforeAll(async () => {
  await cleanDatabase();
  ctx = await seedSchoolContext({ schoolName: "Delete Test School", schoolCode: "DTS" });
  adminToken = (await loginAs(ctx.admin.email, ctx.adminPassword)).token;
}, 60000);

afterAll(async () => {
  await disconnectDatabase();
});

describe("students", () => {
  let gone: { id: string };
  let sibling: { id: string };
  let soleParentId: string;
  let sharedParentId: string;
  let studentLoginId: string;

  beforeAll(async () => {
    gone = await createTestStudent(ctx.section.id, { name: "Leaving Student", rollNo: 2 });
    sibling = await createTestStudent(ctx.section.id, { name: "Sibling", rollNo: 3 });
    studentLoginId = (await createTestUser(ctx.school.id, "STUDENT", { studentId: gone.id })).id;
    // One parent has only this child; the other also has the sibling.
    soleParentId = (await createTestUser(ctx.school.id, "PARENT")).id;
    sharedParentId = (await createTestUser(ctx.school.id, "PARENT")).id;
    await prisma.parentStudent.createMany({
      data: [
        { parentId: soleParentId, studentId: gone.id },
        { parentId: sharedParentId, studentId: gone.id },
        { parentId: sharedParentId, studentId: sibling.id },
      ],
    });
    const category = await createTestFeeCategory(ctx.school.id);
    await prisma.feePayment.create({
      data: { studentId: gone.id, feeCategoryId: category.id, academicYearId: ctx.year.id, amount: 1500, paymentDate: "2081/01/05" },
    });
  });

  it("lists deactivated students only for an admin, and only once deactivated", async () => {
    expect((await deactivated()).body.data.map((s: any) => s.id)).not.toContain(gone.id);
    await del(`/students/${gone.id}`).expect(200); // deactivate
    expect((await deactivated()).body.data.map((s: any) => s.id)).toContain(gone.id);

    const teacherUser = await createTestUser(ctx.school.id, "TEACHER");
    const teacherToken = (await loginAs(teacherUser.email)).token;
    await request(app).get("/students?status=deactivated").set("Authorization", authHeader(teacherToken)).expect(403);
  });

  it("reports what would be erased", async () => {
    const res = await request(app).get(`/students/${gone.id}/delete-impact`).set("Authorization", authHeader(adminToken)).expect(200);
    expect(res.body.data).toMatchObject({ feePayments: 1, feeAmount: 1500, parentLoginsRemoved: 1 });
  });

  it("refuses without the typed phrase, and refuses an active student", async () => {
    await del(`/students/${gone.id}/permanent`).expect(400);
    await del(`/students/${gone.id}/permanent`, "delete").expect(400);
    await del(`/students/${sibling.id}/permanent`, "delete permanently").expect(400);
    expect(await prisma.student.findUnique({ where: { id: sibling.id } })).not.toBeNull();
  });

  it("deletes the student, everything attached, their login and a parent left with no children", async () => {
    await del(`/students/${gone.id}/permanent`, "  Delete Permanently ").expect(200);

    expect(await prisma.student.findUnique({ where: { id: gone.id } })).toBeNull();
    expect(await prisma.feePayment.count({ where: { studentId: gone.id } })).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: studentLoginId } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: soleParentId } })).toBeNull();
    // The parent with another child keeps their login and that child.
    expect(await prisma.user.findUnique({ where: { id: sharedParentId } })).not.toBeNull();
    expect(await prisma.parentStudent.count({ where: { parentId: sharedParentId } })).toBe(1);
  });

  it("does not delete another school's student", async () => {
    const other = await seedSchoolContext({ schoolName: "Other School", schoolCode: "OTH2", adminEmail: "admin-oth2@test.com" });
    await prisma.student.update({ where: { id: other.student.id }, data: { isActive: false } });
    await del(`/students/${other.student.id}/permanent`, "delete permanently").expect(404);
    expect(await prisma.student.findUnique({ where: { id: other.student.id } })).not.toBeNull();
  });
});

describe("teachers", () => {
  it("deletes a deactivated teacher and their assignments, but keeps their posts and a locked login", async () => {
    const teacher = await createTestTeacher(ctx.school.id, { name: "Leaving Teacher" });
    const login = await createTestUser(ctx.school.id, "TEACHER", { teacherId: teacher.id });
    const subject = await prisma.subject.create({ data: { name: "Maths", fullTheoryMarks: 50, gradeId: ctx.grade.id } });
    await prisma.teacherAssignment.create({ data: { teacherId: teacher.id, sectionId: ctx.section.id, subjectId: subject.id } });
    const homework = await prisma.homework.create({
      data: { title: "Exercise 1", subjectId: subject.id, sectionId: ctx.section.id, academicYearId: ctx.year.id, assignedById: login.id, assignedDate: "2081/01/05" },
    });

    await del(`/teachers/${teacher.id}/permanent`, "delete permanently").expect(400); // still active
    await del(`/teachers/${teacher.id}`).expect(200); // deactivate
    await del(`/teachers/${teacher.id}/permanent`, "nope").expect(400);
    await del(`/teachers/${teacher.id}/permanent`, "delete permanently").expect(200);

    expect(await prisma.teacher.findUnique({ where: { id: teacher.id } })).toBeNull();
    expect(await prisma.teacherAssignment.count({ where: { teacherId: teacher.id } })).toBe(0);
    expect(await prisma.homework.findUnique({ where: { id: homework.id } })).not.toBeNull();
    const kept = await prisma.user.findUniqueOrThrow({ where: { id: login.id } });
    expect(kept.isActive).toBe(false);
    expect(kept.teacherId).toBeNull();
  });

  it("leaves every report card unchanged: marks belong to the student, not the teacher who entered them", async () => {
    const teacher = await createTestTeacher(ctx.school.id, { name: "Marks Teacher" });
    const subject = await prisma.subject.create({ data: { name: "Science", fullTheoryMarks: 50, creditHour: 4, gradeId: ctx.grade.id } });
    await prisma.teacherAssignment.create({ data: { teacherId: teacher.id, sectionId: ctx.section.id, subjectId: subject.id } });
    const exam = await prisma.examType.create({ data: { name: "Term With Teacher", academicYearId: ctx.year.id, displayOrder: 9 } });
    await prisma.mark.create({
      data: { studentId: ctx.student.id, subjectId: subject.id, examTypeId: exam.id, academicYearId: ctx.year.id, theoryMarks: 41 },
    });
    const card = async () =>
      (await request(app).get(`/reports/term/${ctx.student.id}/${exam.id}`).set("Authorization", authHeader(adminToken)).expect(200)).body.data;

    const before = await card();
    await del(`/teachers/${teacher.id}`).expect(200);
    await del(`/teachers/${teacher.id}/permanent`, "delete permanently").expect(200);
    const after = await card();

    expect(after.subjects).toEqual(before.subjects);
    expect(after.overallGpa).toBe(before.overallGpa);
    expect(after.subjects.find((s: any) => s.subjectName === "Science")).toMatchObject({ finalGrade: "A", gradePoint: 3.6 });
  });
});
