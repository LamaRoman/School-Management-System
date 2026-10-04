/**
 * GET /teacher-assignments/my — one card per section.
 *
 * teacher_assignments is unique on (teacher, section, subject), and a class-teacher row has no
 * subject. Postgres treats NULLs as distinct, so a double-submitted "make class teacher" form
 * stores two identical rows, and the teacher's dashboard (web and phone) showed the section
 * twice. The endpoint now collapses repeats.
 */

import { readFileSync } from "fs";
import { join } from "path";
import request from "supertest";
import {
  app, prisma, cleanDatabase, disconnectDatabase, createTestSchool, createTestUser,
  createTestAcademicYear, createTestGrade, createTestSection, createTestTeacher, loginAs, authHeader,
} from "../helpers";

let token: string;
let sectionA: string;
let sectionB: string;
let teacherId: string;

const makeClassTeacher = (sectionId: string, tid = teacherId) =>
  prisma.teacherAssignment.create({ data: { teacherId: tid, sectionId, isClassTeacher: true } });

beforeAll(async () => {
  await cleanDatabase();
  const school = await createTestSchool();
  const year = await createTestAcademicYear(school.id);
  const grade = await createTestGrade(year.id, { name: "UKG", displayOrder: 1 });
  sectionA = (await createTestSection(grade.id, { name: "A" })).id;
  sectionB = (await createTestSection(grade.id, { name: "B" })).id;
  const teacher = await createTestTeacher(school.id, { email: "t@assign.test" });
  await createTestUser(school.id, "TEACHER", { email: "t@assign.test", password: "Test@123", teacherId: teacher.id });
  token = (await loginAs("t@assign.test")).token;

  teacherId = teacher.id;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

describe("the database refuses a repeated class teacher", () => {
  it("rejects the same teacher twice, and a second teacher, on one section", async () => {
    await makeClassTeacher(sectionA);
    await expect(makeClassTeacher(sectionA)).rejects.toMatchObject({ code: "P2002" });
    const other = await createTestTeacher((await prisma.teacher.findFirstOrThrow()).schoolId, { name: "Other" });
    await expect(makeClassTeacher(sectionA, other.id)).rejects.toMatchObject({ code: "P2002" });
  });

  it("two simultaneous 'make class teacher' requests give one row and no 500", async () => {
    const admin = await createTestUser((await prisma.teacher.findFirstOrThrow()).schoolId, "ADMIN", { email: "a@assign.test", password: "Test@123" });
    const adminToken = (await loginAs(admin.email)).token;
    const post = () => request(app).post("/teacher-assignments").set("Authorization", authHeader(adminToken))
      .send({ teacherId, sectionId: sectionB, isClassTeacher: true });
    const results = await Promise.all([post(), post()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await prisma.teacherAssignment.count({ where: { sectionId: sectionB, isClassTeacher: true } })).toBe(1);
  });
});

describe("legacy data that already has repeats (index absent)", () => {
  beforeAll(async () => {
    await prisma.teacherAssignment.deleteMany({});
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "teacher_assignments_one_class_teacher_per_section_key"`);
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "teacher_assignments_class_teacher_teacher_section_key"`);
    for (const sectionId of [sectionA, sectionA, sectionB]) await makeClassTeacher(sectionId);
  });
  afterAll(async () => {
    await prisma.teacherAssignment.deleteMany({});
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "teacher_assignments_one_class_teacher_per_section_key" ON teacher_assignments (section_id) WHERE is_class_teacher`);
  });

it("the migration's cleanup removes exact repeats and nothing else", async () => {
    const sql = readFileSync(join(__dirname, "../../../prisma/migrations/20261006000000_class_teacher_unique/migration.sql"), "utf8");
    const del = sql.slice(sql.indexOf("DELETE FROM"), sql.indexOf(";", sql.indexOf("DELETE FROM")) + 1);
    expect(await prisma.teacherAssignment.count()).toBe(3);
    await prisma.$executeRawUnsafe(del);
    const rows = await prisma.teacherAssignment.findMany({ orderBy: { sectionId: "asc" } });
    expect(rows.map((r) => r.sectionId).sort()).toEqual([sectionA, sectionB].sort());
  });

  it("lists each class-teacher section once, in order", async () => {
    await prisma.teacherAssignment.deleteMany({});
    for (const sectionId of [sectionA, sectionA, sectionB]) await makeClassTeacher(sectionId);
  const res = await request(app).get("/teacher-assignments/my").set("Authorization", authHeader(token)).expect(200);
  const sections = res.body.data.classTeacherSections as { sectionId: string; sectionName: string }[];
  expect(sections.map((s) => s.sectionName)).toEqual(["A", "B"]);
  expect(new Set(sections.map((s) => s.sectionId)).size).toBe(2);
});
});
