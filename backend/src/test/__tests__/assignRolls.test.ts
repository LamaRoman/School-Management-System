/**
 * Assign Roll Numbers (POST /students/assign-rolls)
 *
 * Roll numbers are unique within a section, and a teacher's save usually reshuffles them
 * among the same students. Written one by one, a swap (1↔2) collided halfway and the whole
 * save failed with "A record with this data already exists" — the bug these tests pin.
 */

import request from "supertest";
import {
  app,
  prisma,
  cleanDatabase,
  disconnectDatabase,
  seedSchoolContext,
  createTestStudent,
  loginAs,
  authHeader,
} from "../helpers";

let ctx: Awaited<ReturnType<typeof seedSchoolContext>>;
let adminToken: string;
let ids: string[];

const assign = (assignments: { studentId: string; rollNo: number }[], sectionId = ctx.section.id) =>
  request(app).post("/students/assign-rolls").set("Authorization", authHeader(adminToken)).send({ sectionId, assignments });
const rolls = async () =>
  Object.fromEntries(
    (await prisma.student.findMany({ where: { id: { in: ids } }, select: { id: true, rollNo: true } })).map((s) => [s.id, s.rollNo])
  );

beforeAll(async () => {
  await cleanDatabase();
  ctx = await seedSchoolContext({ schoolName: "Roll School", schoolCode: "RLS", studentName: "Student A" });
  adminToken = (await loginAs(ctx.admin.email, ctx.adminPassword)).token;
  await prisma.student.update({ where: { id: ctx.student.id }, data: { rollNo: 1 } });
  const b = await createTestStudent(ctx.section.id, { name: "Student B", rollNo: 2 });
  const c = await createTestStudent(ctx.section.id, { name: "Student C", rollNo: 3 });
  ids = [ctx.student.id, b.id, c.id];
}, 60000);

afterAll(async () => {
  await disconnectDatabase();
});

describe("assign roll numbers", () => {
  it("swaps two students' numbers in one save", async () => {
    await assign([{ studentId: ids[0], rollNo: 2 }, { studentId: ids[1], rollNo: 1 }, { studentId: ids[2], rollNo: 3 }]).expect(200);
    expect(await rolls()).toEqual({ [ids[0]]: 2, [ids[1]]: 1, [ids[2]]: 3 });
  });

  it("applies a full reshuffle", async () => {
    await assign([{ studentId: ids[0], rollNo: 3 }, { studentId: ids[1], rollNo: 2 }, { studentId: ids[2], rollNo: 1 }]).expect(200);
    expect(await rolls()).toEqual({ [ids[0]]: 3, [ids[1]]: 2, [ids[2]]: 1 });
  });

  it("names the students when the form gives two of them the same number, and changes nothing", async () => {
    const res = await assign([{ studentId: ids[0], rollNo: 5 }, { studentId: ids[1], rollNo: 5 }, { studentId: ids[2], rollNo: 6 }]).expect(400);
    expect(res.body.error).toMatch(/Roll 5 is given to more than one student: Student A, Student B/);
    expect(await rolls()).toEqual({ [ids[0]]: 3, [ids[1]]: 2, [ids[2]]: 1 });
  });

  it("releases a number held by a deactivated student", async () => {
    const gone = await createTestStudent(ctx.section.id, { name: "Left School", rollNo: 9 });
    await prisma.student.update({ where: { id: gone.id }, data: { isActive: false } });
    await assign([{ studentId: ids[0], rollNo: 9 }, { studentId: ids[1], rollNo: 2 }, { studentId: ids[2], rollNo: 1 }]).expect(200);
    expect((await rolls())[ids[0]]).toBe(9);
    expect((await prisma.student.findUniqueOrThrow({ where: { id: gone.id } })).rollNo).toBeNull();
  });

  it("refuses to take a number from an active student who is not in the list", async () => {
    await createTestStudent(ctx.section.id, { name: "Not In Form", rollNo: 7 });
    const res = await assign([{ studentId: ids[0], rollNo: 7 }]).expect(400);
    expect(res.body.error).toMatch(/Roll 7 already belongs to Not In Form/);
  });

  it("will not touch another school's student", async () => {
    const other = await seedSchoolContext({ schoolName: "Other Roll School", schoolCode: "ORS", adminEmail: "admin-ors@test.com" });
    const res = await assign([{ studentId: other.student.id, rollNo: 1 }, { studentId: ids[0], rollNo: 1 }]);
    expect(res.status).toBe(400);
    expect(res.body.error).not.toMatch(/Other|Test Student/);
  });
});
