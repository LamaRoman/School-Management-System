/**
 * Short-lived report card download links (opened in the phone's browser).
 *
 * The point of the design is that a link is NOT a login: it is signed with a different key,
 * it names exactly one PDF, it lasts 90 s, and when opened it runs through the normal PDF
 * route as the user who asked — so school scope, teacher ownership and deactivation all
 * still apply. These tests pin each of those.
 */

import request from "supertest";
import jwt from "jsonwebtoken";
import { createHmac } from "crypto";
import {
  app,
  prisma,
  cleanDatabase,
  disconnectDatabase,
  seedSchoolContext,
  createTestSchool,
  createTestUser,
  createTestTeacher,
  loginAs,
  authHeader,
} from "../helpers";
// After ../helpers (it loads the app, and express-async-errors, first).
import * as pdfService from "../../services/pdf.service";

let ctx: Awaited<ReturnType<typeof seedSchoolContext>>;
let examId: string;
let teacherAToken: string;
let teacherAEmail: string;
let teacherAUserId: string;
let outsiderToken: string; // teacher in the same school, not assigned to the section
let teacherBToken: string; // teacher of another school
let teacherBCookies: string; // a clean "name=value; name=value" Cookie header

const termPath = (mode = "color") => `/pdf/term/${ctx.student.id}/${examId}?mode=${mode}`;
const linkFor = (token: string, path: string) =>
  request(app).post("/pdf/link").set("Authorization", authHeader(token)).send({ path });
const linkSecret = () => createHmac("sha256", process.env.JWT_SECRET!).update("pdf-link-v1").digest("hex");

let htmlModes: string[] = [];
beforeAll(async () => {
  await cleanDatabase();
  ctx = await seedSchoolContext({ schoolName: "Link School A", schoolCode: "LKA", yearBS: "2082", gradeName: "Grade X" });

  const exam = await prisma.examType.create({
    data: { name: "First Terminal", academicYearId: ctx.year.id, displayOrder: 1, paperSize: "A4" },
  });
  examId = exam.id;
  const subject = await prisma.subject.create({
    data: { name: "Maths", fullTheoryMarks: 100, fullPracticalMarks: 0, passMarks: 35, creditHour: 4, displayOrder: 0, gradeId: ctx.grade.id },
  });
  await prisma.mark.create({
    data: { studentId: ctx.student.id, subjectId: subject.id, examTypeId: examId, academicYearId: ctx.year.id, theoryMarks: 80, practicalMarks: 0 },
  });

  const mk = async (schoolId: string, email: string, assignTo?: string) => {
    const t = await createTestTeacher(schoolId, { name: email });
    const u = await createTestUser(schoolId, "TEACHER", { email, password: "Test@123", teacherId: t.id });
    if (assignTo) await prisma.teacherAssignment.create({ data: { teacherId: t.id, sectionId: assignTo, isClassTeacher: true } as any });
    return u;
  };
  teacherAEmail = "teacher@lka.test";
  teacherAUserId = (await mk(ctx.school.id, teacherAEmail, ctx.section.id)).id;
  await mk(ctx.school.id, "outsider@lka.test");
  const schoolB = await createTestSchool({ name: "Link School B", code: "LKB" });
  await mk(schoolB.id, "teacher@lkb.test");

  teacherAToken = (await loginAs(teacherAEmail)).token;
  outsiderToken = (await loginAs("outsider@lka.test")).token;
  const b = await loginAs("teacher@lkb.test");
  teacherBToken = b.token;
  // Login first clears any old cookie, then sets the fresh one: keep the last value per name.
  const jar = new Map<string, string>();
  for (const c of (b as any).cookies as string[]) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (pair.slice(i + 1)) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  teacherBCookies = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  // Don't launch a browser: hand back a stub PDF, and record which mode the HTML was built in.
  jest.spyOn(pdfService, "generatePdf").mockImplementation(async () => Buffer.from("%PDF-stub"));
  const real = pdfService.buildReportCardHtml;
  jest.spyOn(pdfService, "buildReportCardHtml").mockImplementation(((d: any, mode: any, c: any, o: any) => {
    htmlModes.push(mode);
    return real(d, mode, c, o);
  }) as any);
}, 60000);

afterAll(async () => {
  jest.restoreAllMocks();
  await disconnectDatabase();
});

describe("creating and opening a link", () => {
  it("an assigned teacher gets a link that downloads the PDF with no Authorization header", async () => {
    const res = await linkFor(teacherAToken, termPath("bw")).expect(200);
    expect(res.body.data.expiresInSeconds).toBe(90);
    expect(res.body.data.url).toMatch(/^\/pdf\/dl\/.+/);

    htmlModes = [];
    const dl = await request(app).get(res.body.data.url).expect(200); // note: no auth header
    expect(dl.headers["content-type"]).toBe("application/pdf");
    expect(dl.headers["content-disposition"]).toMatch(/attachment/);
    expect(dl.headers["cache-control"]).toBe("no-store");
    expect(dl.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(htmlModes).toEqual(["bw"]); // the mode in the link reached the real route
  });

  it("colour is the default", async () => {
    const res = await linkFor(teacherAToken, `/pdf/term/${ctx.student.id}/${examId}`).expect(200);
    htmlModes = [];
    await request(app).get(res.body.data.url).expect(200);
    expect(htmlModes).toEqual(["color"]);
  });

  it("a class link is created for an assigned teacher", async () => {
    await linkFor(teacherAToken, `/pdf/class/term/${ctx.section.id}/${examId}?mode=color`).expect(200);
  });
});

describe("only report card PDFs can be linked", () => {
  it.each([
    "/students",
    "/auth/login",
    "/pdf/../auth/login",
    `/pdf/term/${"a".repeat(65)}/b`,
    "/pdf/term/a/b/c",
    "/pdf/term/a/b?mode=evil",
    "/pdf/term/a/b?mode=color&x=1",
    "/pdf/term/a b/c",
    "",
  ])("rejects %j", async (path) => {
    await linkFor(teacherAToken, path).expect(400);
  });

  it("rejects a missing or non-string path", async () => {
    await request(app).post("/pdf/link").set("Authorization", authHeader(teacherAToken)).send({}).expect(400);
    await request(app).post("/pdf/link").set("Authorization", authHeader(teacherAToken)).send({ path: { a: 1 } }).expect(400);
  });

  it("needs a login to create a link", async () => {
    await request(app).post("/pdf/link").send({ path: termPath() }).expect(401);
  });
});

describe("a link is not a login", () => {
  it("a link token is refused as a Bearer token everywhere else", async () => {
    const url = (await linkFor(teacherAToken, termPath()).expect(200)).body.data.url as string;
    const token = url.split("/pdf/dl/")[1];
    await request(app).get("/students").set("Authorization", `Bearer ${token}`).expect(401);
    await request(app).get("/teacher-assignments/my").set("Authorization", `Bearer ${token}`).expect(401);
  });

  it("an ordinary access token is refused as a link", async () => {
    await request(app).get(`/pdf/dl/${teacherAToken}`).expect(401);
  });

  it("an expired, tampered or wrong-purpose link is refused", async () => {
    const claims = { purpose: "pdf-link", uid: teacherAUserId, route: `/term/${ctx.student.id}/${examId}`, mode: "color" };
    const expired = jwt.sign(claims, linkSecret(), { algorithm: "HS256", expiresIn: -10 });
    await request(app).get(`/pdf/dl/${expired}`).expect(401);

    const fresh = jwt.sign(claims, linkSecret(), { algorithm: "HS256", expiresIn: 60 });
    await request(app).get(`/pdf/dl/${fresh}`).expect(200); // sanity: the hand-made one is valid
    await request(app).get(`/pdf/dl/${fresh.slice(0, -3)}xyz`).expect(401);

    const wrongPurpose = jwt.sign({ ...claims, purpose: "other" }, linkSecret(), { algorithm: "HS256", expiresIn: 60 });
    await request(app).get(`/pdf/dl/${wrongPurpose}`).expect(401);

    const wrongKey = jwt.sign(claims, process.env.JWT_SECRET!, { algorithm: "HS256", expiresIn: 60 });
    await request(app).get(`/pdf/dl/${wrongKey}`).expect(401);
  });

  it("a link whose route has been tampered into something else is refused", async () => {
    const claims = { purpose: "pdf-link", uid: teacherAUserId, route: "/../students", mode: "color" };
    const t = jwt.sign(claims, linkSecret(), { algorithm: "HS256", expiresIn: 60 });
    await request(app).get(`/pdf/dl/${t}`).expect(401);
  });
});

describe("the normal permission rules still apply", () => {
  it("a teacher of another school cannot get a link to this school's student", async () => {
    await linkFor(teacherBToken, termPath()).expect(404);
  });

  it("a teacher not assigned to the section cannot get a link (student or class)", async () => {
    await linkFor(outsiderToken, termPath()).expect(403);
    await linkFor(outsiderToken, `/pdf/class/term/${ctx.section.id}/${examId}`).expect(403);
  });

  it("opening the link uses the link's user, not whoever else is signed in in that browser", async () => {
    const url = (await linkFor(teacherAToken, termPath()).expect(200)).body.data.url as string;
    // Another school's teacher has a login cookie in the same browser. If that identity were
    // used, this would be a 404 (student not in their school).
    // Control: that cookie really is another school's login (it is refused on the normal route).
    await request(app).get(termPath()).set("Cookie", teacherBCookies).expect(404);
    await request(app).get(url).set("Cookie", teacherBCookies).expect(200);
  });

  it("a link stops working once the user is deactivated", async () => {
    const t = await createTestTeacher(ctx.school.id, { name: "Leaver" });
    const u = await createTestUser(ctx.school.id, "TEACHER", { email: "leaver@lka.test", teacherId: t.id });
    await prisma.teacherAssignment.create({ data: { teacherId: t.id, sectionId: ctx.section.id } as any });
    const token = (await loginAs("leaver@lka.test")).token;
    const url = (await linkFor(token, termPath()).expect(200)).body.data.url as string;
    await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
    await request(app).get(url).expect(401);
  });
});
