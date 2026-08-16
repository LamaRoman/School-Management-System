/**
 * Unauthenticated /public/* surface (S5, S6a, S6c, S6e, S8)
 *
 * The data these serve is genuinely low-sensitivity — gallery photos and
 * EVENT/HOLIDAY entries, all intended to be public. The finding was never
 * "this leaks"; it was that **CORS was doing the work a query should do**.
 * `isAllowedPublicOrigin` returns true when there is no `Origin` header, by
 * design, so `curl` reaches these regardless. A suspended school's content kept
 * being served, and the code read as though CORS were preventing that.
 *
 * So the tests here send no Origin at all — the way curl, a server-rendered
 * site, or anyone who knows a school id would.
 */

import request from "supertest";
import {
  app,
  prisma,
  cleanDatabase,
  disconnectDatabase,
  createTestSchool,
  createTestUser,
  createTestAcademicYear,
  createTestGrade,
  createTestSection,
  createTestStudent,
  loginAs,
  authHeader,
} from "../helpers";

let liveSchoolId: string;
let suspendedSchoolId: string;
let noWebsiteSchoolId: string;
let adminToken: string;
let sectionId: string;

/** Gallery photos and calendar events both require an author. */
async function addPublicContent(schoolId: string, createdById: string) {
  await prisma.galleryPhoto.create({
    data: {
      schoolId,
      createdById,
      url: "https://example.test/a.webp",
      storageType: "s3",
      caption: "Sports day",
      displayOrder: 1,
    },
  });
  await prisma.calendarEvent.create({
    data: { schoolId, createdById, title: "Annual Day", date: "2081/05/05", type: "EVENT" },
  });
}

beforeAll(async () => {
  await cleanDatabase();

  // Active, with a website — the only one that should be served.
  const live = await createTestSchool({ name: "Live School", code: "LIV" });
  liveSchoolId = live.id;
  await prisma.school.update({
    where: { id: live.id },
    data: { websiteUrl: "https://live.example.test" },
  });
  const liveAdmin = await createTestUser(live.id, "ADMIN", {
    email: "admin@public.test",
    password: "Test@123",
  });
  adminToken = (await loginAs("admin@public.test")).token;
  await addPublicContent(live.id, liveAdmin.id);

  // Suspended, but still has a website and content.
  const suspended = await createTestSchool({ name: "Suspended School", code: "SUS" });
  suspendedSchoolId = suspended.id;
  const suspendedAdmin = await createTestUser(suspended.id, "ADMIN", {
    email: "admin@suspended.test",
    password: "Test@123",
  });
  await addPublicContent(suspended.id, suspendedAdmin.id);
  await prisma.school.update({
    where: { id: suspended.id },
    data: { websiteUrl: "https://suspended.example.test", isActive: false },
  });

  // Active, but never registered a website.
  const noWebsite = await createTestSchool({ name: "No Website School", code: "NWS" });
  noWebsiteSchoolId = noWebsite.id;
  const noWebsiteAdmin = await createTestUser(noWebsite.id, "ADMIN", {
    email: "admin@nowebsite.test",
    password: "Test@123",
  });
  await addPublicContent(noWebsite.id, noWebsiteAdmin.id);

  // Internal event types must stay private regardless of any of the above.
  await prisma.calendarEvent.create({
    data: {
      schoolId: live.id,
      createdById: liveAdmin.id,
      title: "Staff meeting",
      date: "2081/05/06",
      type: "MEETING",
    },
  });

  // For S5 / S8, a normal school context.
  const year = await createTestAcademicYear(live.id, { yearBS: "2081" });
  const grade = await createTestGrade(year.id, { name: "Grade I", displayOrder: 1 });
  sectionId = (await createTestSection(grade.id, { name: "A" })).id;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

describe("S6a — only an active school with a website is served publicly", () => {
  it("serves a live school's gallery and calendar", async () => {
    const gallery = await request(app).get(`/public/gallery/${liveSchoolId}`).expect(200);
    expect(gallery.body.data).toHaveLength(1);

    const calendar = await request(app).get(`/public/calendar/${liveSchoolId}`).expect(200);
    expect(calendar.body.data.map((e: { title: string }) => e.title)).toContain("Annual Day");
  });

  it("stops serving a suspended school, even though its content still exists", async () => {
    expect((await request(app).get(`/public/gallery/${suspendedSchoolId}`).expect(200)).body.data)
      .toEqual([]);
    expect((await request(app).get(`/public/calendar/${suspendedSchoolId}`).expect(200)).body.data)
      .toEqual([]);

    // The rows are still there — this is a serving decision, not a deletion.
    expect(await prisma.galleryPhoto.count({ where: { schoolId: suspendedSchoolId } })).toBe(1);
  });

  it("does not serve a school that never registered a website", async () => {
    expect((await request(app).get(`/public/gallery/${noWebsiteSchoolId}`).expect(200)).body.data)
      .toEqual([]);
    expect((await request(app).get(`/public/calendar/${noWebsiteSchoolId}`).expect(200)).body.data)
      .toEqual([]);
  });

  it("keeps internal event types private on a school that IS served", async () => {
    const res = await request(app).get(`/public/calendar/${liveSchoolId}`).expect(200);
    const titles = res.body.data.map((e: { title: string }) => e.title);
    expect(titles).not.toContain("Staff meeting");
  });
});

describe("S6b — public routes accept the school code as an alternative to the raw id", () => {
  it("serves the same gallery whether keyed on the id or the code", async () => {
    const byId = await request(app).get(`/public/gallery/${liveSchoolId}`).expect(200);
    const byCode = await request(app).get(`/public/gallery/LIV`).expect(200);
    expect(byCode.body.data).toEqual(byId.body.data);
    expect(byCode.body.data).toHaveLength(1);
  });

  it("serves the same calendar whether keyed on the id or the code", async () => {
    const byId = await request(app).get(`/public/calendar/${liveSchoolId}`).expect(200);
    const byCode = await request(app).get(`/public/calendar/LIV`).expect(200);
    expect(byCode.body.data).toEqual(byId.body.data);
  });

  it("matches the code case-insensitively", async () => {
    const res = await request(app).get(`/public/gallery/liv`).expect(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("still refuses a suspended school by its code", async () => {
    expect((await request(app).get(`/public/gallery/SUS`).expect(200)).body.data).toEqual([]);
    expect((await request(app).get(`/public/calendar/SUS`).expect(200)).body.data).toEqual([]);
  });

  it("returns nothing for an unknown identifier", async () => {
    expect((await request(app).get(`/public/gallery/ZZZ`).expect(200)).body.data).toEqual([]);
  });
});

describe("S6e — public responses are cacheable", () => {
  it("sets Cache-Control on both endpoints", async () => {
    for (const path of [`/public/gallery/${liveSchoolId}`, `/public/calendar/${liveSchoolId}`]) {
      const res = await request(app).get(path).expect(200);
      expect(res.headers["cache-control"]).toMatch(/public/);
      expect(res.headers["cache-control"]).toMatch(/max-age=\d+/);
    }
  });
});

describe("S5 — exam types are school-scoped in the PDF builders", () => {
  it("refuses because the exam type is not ours, not because no marks turned up", async () => {
    const foreignSchool = await createTestSchool({ name: "Foreign PDF School", code: "FPD" });
    const foreignYear = await createTestAcademicYear(foreignSchool.id, { yearBS: "2081" });
    const foreignExam = await prisma.examType.create({
      data: { name: "First Terminal", academicYearId: foreignYear.id, displayOrder: 1 },
    });
    const student = await createTestStudent(sectionId, { name: "Local Student", rollNo: 1 });

    const res = await request(app)
      .get(`/pdf/term/${student.id}/${foreignExam.id}`)
      .set("Authorization", authHeader(adminToken));

    expect(res.status).toBe(404);
    // The distinction is the whole finding. Unscoped, this request also 404s —
    // but only incidentally, because the marks query is scoped by student and
    // happens to come back empty ("No marks found for this student and exam").
    // That is the "one refactor away from mattering" the audit describes: change
    // how marks are fetched and the 404 quietly becomes a 200 carrying another
    // school's exam name. Now it is refused at the lookup instead.
    expect(res.body.error).not.toMatch(/no marks found/i);

    await prisma.student.delete({ where: { id: student.id } });
    await prisma.academicYear.delete({ where: { id: foreignYear.id } });
    await prisma.school.delete({ where: { id: foreignSchool.id } });
  });
});

describe("S8 — student photos have a server-side size cap", () => {
  it("rejects a photo far larger than the browser would ever send", async () => {
    // The browser check is 500KB and lives only in admin/students/page.tsx, so
    // the effective server cap was express.json's 5mb.
    const oversized = "data:image/png;base64," + "A".repeat(900_000);

    const res = await request(app)
      .post("/students")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Oversized Photo", sectionId, photo: oversized });

    expect(res.status).toBe(400);
    expect(await prisma.student.count({ where: { name: "Oversized Photo" } })).toBe(0);
  });

  it("still accepts a photo the size the UI actually produces", async () => {
    const realistic = "data:image/png;base64," + "A".repeat(400_000);

    const res = await request(app)
      .post("/students")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Normal Photo", sectionId, photo: realistic });

    expect(res.status).toBeLessThan(300);
    await prisma.student.deleteMany({ where: { name: "Normal Photo" } });
  });
});
