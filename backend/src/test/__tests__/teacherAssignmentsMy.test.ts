/**
 * GET /teacher-assignments/my — one card per section.
 *
 * teacher_assignments is unique on (teacher, section, subject), and a class-teacher row has no
 * subject. Postgres treats NULLs as distinct, so a double-submitted "make class teacher" form
 * stores two identical rows, and the teacher's dashboard (web and phone) showed the section
 * twice. The endpoint now collapses repeats.
 */

import request from "supertest";
import {
  app, prisma, cleanDatabase, disconnectDatabase, createTestSchool, createTestUser,
  createTestAcademicYear, createTestGrade, createTestSection, createTestTeacher, loginAs, authHeader,
} from "../helpers";

let token: string;
let sectionA: string;
let sectionB: string;

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

  // Two identical class-teacher rows for A (the bug), one for B.
  for (const sectionId of [sectionA, sectionA, sectionB]) {
    await prisma.teacherAssignment.create({ data: { teacherId: teacher.id, sectionId, isClassTeacher: true } });
  }
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

it("lists each class-teacher section once, in order", async () => {
  const res = await request(app).get("/teacher-assignments/my").set("Authorization", authHeader(token)).expect(200);
  const sections = res.body.data.classTeacherSections as { sectionId: string; sectionName: string }[];
  expect(sections.map((s) => s.sectionName)).toEqual(["A", "B"]);
  expect(new Set(sections.map((s) => s.sectionId)).size).toBe(2);
});
