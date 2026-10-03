/**
 * Multi-day calendar entries — a vacation is ONE entry with a first and last day.
 *
 * Covers the BS date maths (month and year boundaries), the closed-day rule across a range,
 * the admin create / edit / clear flow and its validation, year overlap, per-school
 * isolation, and — importantly — that the public website feed keeps its old shape (one date
 * per entry): ranges are expanded on the server so no website has to change.
 *
 * Anchors: 2083/06/17 = Sat; 2083/06/18 = Sun.
 */

import request from "supertest";
import {
  app,
  prisma,
  cleanDatabase,
  disconnectDatabase,
  createTestSchool,
  createTestUser,
  loginAs,
  authHeader,
} from "../helpers";
// After ../helpers (it loads the app, and express-async-errors, first).
import {
  addDaysBS,
  expandRange,
  coversDate,
  normalizeRange,
  MAX_RANGE_DAYS,
} from "../../services/bsRange.service";

let schoolA: { id: string };
let schoolB: { id: string };
let adminAToken: string;
let teacherAToken: string;
let teacherBToken: string;

const dayOf = async (token: string, date: string) =>
  (await request(app).get(`/daily-attendance/day?date=${date}`).set("Authorization", authHeader(token)).expect(200)).body.data;

beforeAll(async () => {
  await cleanDatabase();
  schoolA = await createTestSchool({ name: "Range A", code: "RGA" });
  schoolB = await createTestSchool({ name: "Range B", code: "RGB" });
  await prisma.school.update({ where: { id: schoolA.id }, data: { websiteUrl: "https://range-a.example.test" } });
  await createTestUser(schoolA.id, "ADMIN", { email: "admin@rga.test", password: "Test@123" });
  await createTestUser(schoolA.id, "TEACHER", { email: "teacher@rga.test", password: "Test@123" });
  await createTestUser(schoolB.id, "TEACHER", { email: "teacher@rgb.test", password: "Test@123" });
  adminAToken = (await loginAs("admin@rga.test")).token;
  teacherAToken = (await loginAs("teacher@rga.test")).token;
  teacherBToken = (await loginAs("teacher@rgb.test")).token;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

describe("BS date range maths", () => {
  it("addDaysBS crosses month and year boundaries both ways", () => {
    const newYear = "2084/01/01";
    const lastOfChaitra = addDaysBS(newYear, -1);
    expect(lastOfChaitra.startsWith("2083/12/")).toBe(true);
    expect(addDaysBS(lastOfChaitra, 1)).toBe(newYear);
    // a month boundary mid-year
    const firstOfAshwin = "2083/06/01";
    expect(addDaysBS(addDaysBS(firstOfAshwin, -1), 1)).toBe(firstOfAshwin);
    expect(addDaysBS(firstOfAshwin, -1).startsWith("2083/05/")).toBe(true);
  });

  it("expandRange is inclusive, ordered, and one entry per real day", () => {
    expect(expandRange("2083/06/10", "2083/06/10")).toEqual(["2083/06/10"]);
    const week = expandRange("2083/06/10", "2083/06/16");
    expect(week).toHaveLength(7);
    expect(week[0]).toBe("2083/06/10");
    expect(week[6]).toBe("2083/06/16");
    // across a month boundary: no skipped or repeated day
    const across = expandRange(addDaysBS("2083/06/01", -3), addDaysBS("2083/06/01", 3));
    expect(across).toHaveLength(7);
    expect(new Set(across).size).toBe(7);
    expect(across[3]).toBe("2083/06/01");
  });

  it("coversDate treats a missing end date as a single day", () => {
    expect(coversDate({ date: "2083/06/10" }, "2083/06/10")).toBe(true);
    expect(coversDate({ date: "2083/06/10" }, "2083/06/11")).toBe(false);
    expect(coversDate({ date: "2083/06/10", endDate: null }, "2083/06/11")).toBe(false);
    const r = { date: "2083/06/10", endDate: "2083/06/20" };
    expect([coversDate(r, "2083/06/09"), coversDate(r, "2083/06/10"), coversDate(r, "2083/06/15"), coversDate(r, "2083/06/20"), coversDate(r, "2083/06/21")])
      .toEqual([false, true, true, true, false]);
  });

  it("normalizeRange: single day -> null, valid range kept, bad input rejected", () => {
    expect(normalizeRange("2083/06/10", null)).toBeNull();
    expect(normalizeRange("2083/06/10", undefined)).toBeNull();
    expect(normalizeRange("2083/06/10", "")).toBeNull();
    expect(normalizeRange("2083/06/10", "2083/06/10")).toBeNull();
    expect(normalizeRange("2083/06/10", "2083/06/20")).toBe("2083/06/20");
    expect(() => normalizeRange("2083/06/10", "2083/06/09")).toThrow();
    expect(() => normalizeRange("2083/06/10", "not-a-date")).toThrow();
    expect(() => normalizeRange("2083/06/10", addDaysBS("2083/06/10", MAX_RANGE_DAYS))).toThrow(); // MAX+1 days
    expect(normalizeRange("2083/06/10", addDaysBS("2083/06/10", MAX_RANGE_DAYS - 1))).not.toBeNull(); // exactly MAX days
  });
});

describe("a holiday range closes every day in it", () => {
  let breakId: string;
  // Sun 2083/06/18 .. Sat 2083/06/24 is a clean week; 06/24 is a Saturday (weekly off) too.
  const FIRST = "2083/06/18";
  const LAST = "2083/06/24";

  it("an admin creates ONE named holiday with a first and last day", async () => {
    const r = await request(app).post("/calendar-events").set("Authorization", authHeader(adminAToken))
      .send({ title: "Summer Holiday", date: FIRST, endDate: LAST, type: "HOLIDAY" }).expect(201);
    expect(r.body.data).toMatchObject({ title: "Summer Holiday", date: FIRST, endDate: LAST, type: "HOLIDAY" });
    breakId = r.body.data.id;
    expect(await prisma.calendarEvent.count({ where: { schoolId: schoolA.id } })).toBe(1); // one entry, not seven
  });

  it("attendance sees every day of it as closed, with the holiday's own name", async () => {
    for (const d of expandRange(FIRST, LAST)) {
      const day = await dayOf(teacherAToken, d);
      expect(day.closed).toBe(true);
      expect(day.reasons.map((x: any) => x.title)).toContain("Summer Holiday");
    }
  });

  it("the day before and the day after are ordinary (06/17 is only the Saturday)", async () => {
    const after = await dayOf(teacherAToken, "2083/06/25");
    expect(after).toMatchObject({ closed: false, reasons: [] });
    const before = await dayOf(teacherAToken, "2083/06/16"); // a Friday
    expect(before).toMatchObject({ closed: false, reasons: [] });
  });

  it("a Saturday inside the break shows BOTH reasons", async () => {
    const sat = await dayOf(teacherAToken, LAST);
    expect(sat.reasons.map((x: any) => x.kind).sort()).toEqual(["SCHOOL_HOLIDAY", "WEEKLY_OFF"]);
  });

  it("another school is unaffected (tenancy)", async () => {
    expect((await dayOf(teacherBToken, "2083/06/20")).closed).toBe(false);
  });

  it("a range of a non-holiday type (e.g. exam week) does NOT close attendance", async () => {
    await request(app).post("/calendar-events").set("Authorization", authHeader(adminAToken))
      .send({ title: "Terminal exams", date: "2083/07/02", endDate: "2083/07/06", type: "EXAM" }).expect(201);
    expect((await dayOf(teacherAToken, "2083/07/04")).closed).toBe(false);
  });

  it("the admin list and the staff calendar both carry the end date", async () => {
    const admin = await request(app).get("/calendar-events?year=2083").set("Authorization", authHeader(adminAToken)).expect(200);
    expect(admin.body.data.find((e: any) => e.id === breakId)).toMatchObject({ date: FIRST, endDate: LAST });
    const staff = await request(app).get("/calendar-events/view?year=2083").set("Authorization", authHeader(teacherAToken)).expect(200);
    expect(staff.body.data.events.find((e: any) => e.id === breakId)).toMatchObject({ date: FIRST, endDate: LAST });
  });

  it("editing: change the last day, clear it, and moving the first day past the end is rejected", async () => {
    const put = (body: object) => request(app).put(`/calendar-events/${breakId}`).set("Authorization", authHeader(adminAToken)).send(body);
    await put({ endDate: "2083/06/26" }).expect(200);
    expect((await dayOf(teacherAToken, "2083/06/26")).closed).toBe(true);
    // omitting endDate leaves the range alone
    await put({ title: "Summer Holiday (renamed)" }).expect(200);
    expect((await dayOf(teacherAToken, "2083/06/22")).reasons.map((x: any) => x.title)).toContain("Summer Holiday (renamed)");
    // moving the first day past the stored last day is invalid
    await put({ date: "2083/06/30" }).expect(400);
    // null clears the range: back to the first day only
    await put({ endDate: null }).expect(200);
    expect((await dayOf(teacherAToken, FIRST)).closed).toBe(true);
    expect((await dayOf(teacherAToken, "2083/06/20")).closed).toBe(false);
    await put({ endDate: LAST }).expect(200); // restore for the later tests
  });

  it("validation: end before start, malformed, and over-long ranges are refused", async () => {
    const post = (body: object) => request(app).post("/calendar-events").set("Authorization", authHeader(adminAToken)).send({ title: "x", type: "HOLIDAY", ...body });
    await post({ date: "2083/06/10", endDate: "2083/06/09" }).expect(400);
    await post({ date: "2083/06/10", endDate: "2083-06-20" }).expect(400);
    await post({ date: "2083/06/10", endDate: addDaysBS("2083/06/10", MAX_RANGE_DAYS) }).expect(400);
    // a same-day end date is just a single day
    const one = await post({ date: "2083/06/11", endDate: "2083/06/11" }).expect(201);
    expect(one.body.data.endDate).toBeNull();
  });

  it("only an admin can create or edit", async () => {
    await request(app).post("/calendar-events").set("Authorization", authHeader(teacherAToken)).send({ title: "x", date: "2083/06/10", endDate: "2083/06/12", type: "HOLIDAY" }).expect(403);
    await request(app).put(`/calendar-events/${breakId}`).set("Authorization", authHeader(teacherAToken)).send({ endDate: null }).expect(403);
  });
});

describe("a range that crosses the BS new year", () => {
  it("shows up in both years' lists, and closes days on both sides", async () => {
    const r = await request(app).post("/calendar-events").set("Authorization", authHeader(adminAToken))
      .send({ title: "New Year Break", date: "2083/12/28", endDate: "2084/01/03", type: "HOLIDAY" }).expect(201);
    for (const year of ["2083", "2084"]) {
      const admin = await request(app).get(`/calendar-events?year=${year}`).set("Authorization", authHeader(adminAToken)).expect(200);
      expect(admin.body.data.map((e: any) => e.id)).toContain(r.body.data.id);
      const staff = await request(app).get(`/calendar-events/view?year=${year}`).set("Authorization", authHeader(teacherAToken)).expect(200);
      expect(staff.body.data.events.map((e: any) => e.id)).toContain(r.body.data.id);
    }
    expect((await dayOf(teacherAToken, "2084/01/02")).closed).toBe(true);
    expect((await dayOf(teacherAToken, "2083/12/29")).closed).toBe(true);
  });
});

describe("the public website feed keeps its old shape", () => {
  it("hands out one entry per day, with no end date, and unique ids", async () => {
    const res = await request(app).get(`/public/calendar/${schoolA.id}`).expect(200);
    const summer = res.body.data.filter((e: any) => /Summer Holiday/.test(e.title));
    expect(summer).toHaveLength(7); // 06/18 .. 06/24
    expect(summer.map((e: any) => e.date)).toEqual(expandRange("2083/06/18", "2083/06/24"));
    for (const e of res.body.data) {
      expect(e).not.toHaveProperty("endDate"); // exactly the fields it always had
      expect(Object.keys(e).sort()).toEqual(["date", "description", "id", "isMaster", "title", "type"]);
    }
    const ids = res.body.data.map((e: any) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    // the first day keeps the entry's own id
    const original = await prisma.calendarEvent.findFirst({ where: { schoolId: schoolA.id, title: { startsWith: "Summer Holiday" } } });
    expect(summer[0].id).toBe(original!.id);
  });

  it("single-day entries and non-public types behave as before (exam week is not published)", async () => {
    const res = await request(app).get(`/public/calendar/${schoolA.id}`).expect(200);
    expect(res.body.data.some((e: any) => e.title === "Terminal exams")).toBe(false);
    const one = res.body.data.filter((e: any) => e.date === "2083/06/11" && e.title === "x");
    expect(one).toHaveLength(1);
  });
});
