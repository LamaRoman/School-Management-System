/**
 * Attendance on the report card (examAttendance.service)
 *
 * A term card shows only that term's days; the annual card shows the whole year. Both are
 * frozen when the admin publishes the exam, so a card reprinted later — after more days of
 * attendance have been taken — still shows the numbers it was released with.
 */

import request from "supertest";
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
let firstId: string;
let secondId: string;
let finalId: string;
let day = 0;

/** Take `present` + `absent` more days of attendance for the student, after the last one. */
async function takeDays(present: number, absent: number) {
  const rows = [];
  for (let i = 0; i < present + absent; i++) {
    day++;
    rows.push({
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      date: `2081/01/${String(day).padStart(3, "0")}`,
      status: i < present ? ("PRESENT" as const) : ("ABSENT" as const),
    });
  }
  await prisma.dailyAttendance.createMany({ data: rows });
}

const publish = (examTypeId: string) =>
  request(app)
    .post("/result-status/publish")
    .set("Authorization", authHeader(adminToken))
    .send({ examTypeId, sectionIds: [ctx.section.id], notify: false })
    .expect(200);

const termAttendance = async (examTypeId: string) =>
  (await request(app)
    .get(`/reports/term/${ctx.student.id}/${examTypeId}`)
    .set("Authorization", authHeader(adminToken))
    .expect(200)).body.data.attendance;

const yearAttendance = async () =>
  (await request(app)
    .get(`/reports/final/${ctx.student.id}/${ctx.year.id}`)
    .set("Authorization", authHeader(adminToken))
    .expect(200)).body.data.attendance;

beforeAll(async () => {
  await cleanDatabase();
  ctx = await seedSchoolContext({ schoolName: "Attendance Card School", schoolCode: "ACS", yearBS: "2081" });
  adminToken = (await loginAs(ctx.admin.email, ctx.adminPassword)).token;

  const exam = (name: string, displayOrder: number, isFinal = false) =>
    prisma.examType.create({ data: { name, academicYearId: ctx.year.id, displayOrder, isFinal } });
  [firstId, secondId, finalId] = (await Promise.all([
    exam("First Terminal", 1), exam("Second Terminal", 2), exam("Final", 3, true),
  ])).map((e) => e.id);

  const subject = await prisma.subject.create({
    data: { name: "English", fullTheoryMarks: 50, creditHour: 4, gradeId: ctx.grade.id },
  });
  for (const examTypeId of [firstId, secondId, finalId]) {
    await prisma.mark.create({
      data: { studentId: ctx.student.id, subjectId: subject.id, examTypeId, academicYearId: ctx.year.id, theoryMarks: 40 },
    });
    await prisma.gradingPolicy.create({ data: { examTypeId, gradeId: ctx.grade.id, weightagePercent: examTypeId === finalId ? 50 : 25 } });
  }
}, 60000);

afterAll(async () => {
  await disconnectDatabase();
});

describe("attendance on the report card", () => {
  it("shows the live count before the exam is published", async () => {
    await takeDays(54, 4);
    expect(await termAttendance(firstId)).toEqual({ presentDays: 54, totalDays: 58 });
  });

  it("freezes it when the exam is published, so a reprint shows the same numbers", async () => {
    await publish(firstId);
    await takeDays(58, 4); // the second term goes on
    expect(await termAttendance(firstId)).toEqual({ presentDays: 54, totalDays: 58 });
  });

  it("gives the next term only its own days", async () => {
    // Year to date is 112/120; the first term already covered 54/58.
    expect(await termAttendance(secondId)).toEqual({ presentDays: 58, totalDays: 62 });
    await publish(secondId);
    await takeDays(10, 0);
    expect(await termAttendance(secondId)).toEqual({ presentDays: 58, totalDays: 62 });
  });

  it("publishing again for another section does not re-freeze one already out", async () => {
    await publish(firstId);
    expect(await termAttendance(firstId)).toEqual({ presentDays: 54, totalDays: 58 });
  });

  it("shows the whole year on the annual card, frozen when the Final is published", async () => {
    expect(await yearAttendance()).toEqual({ presentDays: 122, totalDays: 130 });
    await publish(finalId);
    await takeDays(5, 0);
    expect(await yearAttendance()).toEqual({ presentDays: 122, totalDays: 130 });
    // The Final's own term card: the days after the Second Terminal.
    expect(await termAttendance(finalId)).toEqual({ presentDays: 10, totalDays: 10 });
  });

  it("re-freezes after an unpublish and publish, to pick up a correction", async () => {
    await request(app)
      .post("/result-status/unpublish")
      .set("Authorization", authHeader(adminToken))
      .send({ examTypeId: finalId, sectionIds: [ctx.section.id] })
      .expect(200);
    await publish(finalId);
    expect(await yearAttendance()).toEqual({ presentDays: 127, totalDays: 135 });
  });

  it("prints it on the card as present / total next to the GPA", async () => {
    const res = await request(app)
      .get(`/pdf/term/${ctx.student.id}/${firstId}?format=html`)
      .set("Authorization", authHeader(adminToken))
      .expect(200);
    expect(res.body.data.html).toMatch(/Attendance: <b[^>]*>54\/58</);
  });
});
