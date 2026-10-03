/**
 * Closed days for attendance: weekly days off, school HOLIDAY events and national
 * (master calendar) holidays — the weekday maths, the per-school setting and its
 * validation, the day-status endpoint, the staff calendar view, and tenancy isolation.
 *
 * Known anchors used throughout (BS -> AD):
 *   2083/06/17 = Sat 3 Oct 2026   2083/06/18 = Sun 4 Oct 2026   2083/06/16 = Fri 2 Oct 2026
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
  loginAs,
  authHeader,
} from "../helpers";
// After ../helpers: that import loads the app (and express-async-errors) first.
import {
  bsWeekday,
  buildDayStatus,
  isAllowedWeeklyOff,
} from "../../services/schoolDay.service";

let schoolA: { id: string };
let schoolB: { id: string };
let adminA: { id: string };
let adminAToken: string;
let teacherAToken: string;
let accountantAToken: string;
let teacherBToken: string;

beforeAll(async () => {
  await cleanDatabase();
  schoolA = await createTestSchool({ name: "School A", code: "SDA" });
  schoolB = await createTestSchool({ name: "School B", code: "SDB" });
  adminA = await createTestUser(schoolA.id, "ADMIN", { email: "admin@sda.test", password: "Test@123" });
  await createTestUser(schoolA.id, "TEACHER", { email: "teacher@sda.test", password: "Test@123" });
  await createTestUser(schoolA.id, "ACCOUNTANT", { email: "acct@sda.test", password: "Test@123" });
  await createTestUser(schoolB.id, "TEACHER", { email: "teacher@sdb.test", password: "Test@123" });
  adminAToken = (await loginAs("admin@sda.test")).token;
  teacherAToken = (await loginAs("teacher@sda.test")).token;
  accountantAToken = (await loginAs("acct@sda.test")).token;
  teacherBToken = (await loginAs("teacher@sdb.test")).token;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

describe("weekday of a BS date", () => {
  it("matches known dates", () => {
    expect(bsWeekday("2083/06/17")).toBe(6); // Saturday
    expect(bsWeekday("2083/06/18")).toBe(0); // Sunday
    expect(bsWeekday("2083/06/16")).toBe(5); // Friday
  });

  it("does not depend on the server timezone", () => {
    const saved = process.env.TZ;
    try {
      for (const tz of ["UTC", "Asia/Kathmandu", "America/Los_Angeles", "Pacific/Kiritimati"]) {
        process.env.TZ = tz;
        expect(bsWeekday("2083/06/17")).toBe(6);
      }
    } finally {
      if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
    }
  });

  it("rejects malformed dates", () => {
    expect(() => bsWeekday("2083-06-17")).toThrow();
    expect(() => bsWeekday("17/06/2083")).toThrow();
    expect(() => bsWeekday("")).toThrow();
  });
});

describe("buildDayStatus (pure rule)", () => {
  it("Saturday-only week: Saturday closed, Sunday open", () => {
    const sat = buildDayStatus("2083/06/17", [6], [], []);
    expect(sat.closed).toBe(true);
    expect(sat.reasons).toEqual([{ kind: "WEEKLY_OFF", title: "Saturday" }]);
    expect(buildDayStatus("2083/06/18", [6], [], []).closed).toBe(false);
  });

  it("Saturday + Sunday week closes both", () => {
    expect(buildDayStatus("2083/06/18", [0, 6], [], []).reasons).toEqual([{ kind: "WEEKLY_OFF", title: "Sunday" }]);
  });

  it("holidays add reasons and can stack with a weekly day off", () => {
    const d = buildDayStatus("2083/06/17", [6], ["Sports day off"], ["Dashain"]);
    expect(d.closed).toBe(true);
    expect(d.reasons.map((r) => r.kind)).toEqual(["WEEKLY_OFF", "SCHOOL_HOLIDAY", "NATIONAL_HOLIDAY"]);
    const weekday = buildDayStatus("2083/06/16", [6], [], ["Dashain"]);
    expect(weekday.reasons).toEqual([{ kind: "NATIONAL_HOLIDAY", title: "Dashain" }]);
  });

  it("an ordinary weekday is open", () => {
    const d = buildDayStatus("2083/06/16", [6], [], []);
    expect(d.closed).toBe(false);
    expect(d.reasons).toEqual([]);
  });
});

describe("allowed week patterns", () => {
  it("only Saturday, or Saturday + Sunday", () => {
    expect(isAllowedWeeklyOff([6])).toBe(true);
    expect(isAllowedWeeklyOff([0, 6])).toBe(true);
    expect(isAllowedWeeklyOff([6, 0])).toBe(true);
    expect(isAllowedWeeklyOff([6, 6])).toBe(true); // duplicates collapse to Saturday only
    expect(isAllowedWeeklyOff([])).toBe(false);
    expect(isAllowedWeeklyOff([0])).toBe(false);
    expect(isAllowedWeeklyOff([5, 6])).toBe(false);
    expect(isAllowedWeeklyOff([0, 5, 6])).toBe(false);
  });
});

describe("GET /daily-attendance/day", () => {
  it("defaults to Saturday closed for a new school", async () => {
    const sat = await request(app).get("/daily-attendance/day?date=2083/06/17").set("Authorization", authHeader(teacherAToken)).expect(200);
    expect(sat.body.data.closed).toBe(true);
    expect(sat.body.data.reasons[0]).toEqual({ kind: "WEEKLY_OFF", title: "Saturday" });
    const fri = await request(app).get("/daily-attendance/day?date=2083/06/16").set("Authorization", authHeader(teacherAToken)).expect(200);
    expect(fri.body.data.closed).toBe(false);
  });

  it("validates the date", async () => {
    await request(app).get("/daily-attendance/day?date=nope").set("Authorization", authHeader(teacherAToken)).expect(400);
    await request(app).get("/daily-attendance/day").set("Authorization", authHeader(teacherAToken)).expect(400);
  });

  it("requires a teacher or admin (accountants and anonymous are refused)", async () => {
    await request(app).get("/daily-attendance/day?date=2083/06/16").expect(401);
    await request(app).get("/daily-attendance/day?date=2083/06/16").set("Authorization", authHeader(accountantAToken)).expect(403);
  });

  it("a school HOLIDAY event closes that day, but a non-HOLIDAY event does not", async () => {
    await prisma.calendarEvent.createMany({
      data: [
        { schoolId: schoolA.id, title: "Founders' Day", date: "2083/06/16", type: "HOLIDAY", createdById: adminA.id },
        { schoolId: schoolA.id, title: "Parents meeting", date: "2083/06/15", type: "MEETING", createdById: adminA.id },
      ],
    });
    const hol = await request(app).get("/daily-attendance/day?date=2083/06/16").set("Authorization", authHeader(teacherAToken)).expect(200);
    expect(hol.body.data.closed).toBe(true);
    expect(hol.body.data.reasons).toEqual([{ kind: "SCHOOL_HOLIDAY", title: "Founders' Day" }]);
    const meeting = await request(app).get("/daily-attendance/day?date=2083/06/15").set("Authorization", authHeader(teacherAToken)).expect(200);
    expect(meeting.body.data.closed).toBe(false);
  });

  it("a national (master calendar) holiday closes the day for every school", async () => {
    await prisma.masterCalendarEvent.create({
      data: { title: "Dashain Tika", date: "2083/06/14", type: "HOLIDAY", source: "MANUAL", createdById: adminA.id },
    });
    for (const token of [teacherAToken, teacherBToken]) {
      const r = await request(app).get("/daily-attendance/day?date=2083/06/14").set("Authorization", authHeader(token)).expect(200);
      expect(r.body.data.closed).toBe(true);
      expect(r.body.data.reasons).toEqual([{ kind: "NATIONAL_HOLIDAY", title: "Dashain Tika" }]);
    }
  });

  it("one school's holiday never closes another school's day (tenancy)", async () => {
    const b = await request(app).get("/daily-attendance/day?date=2083/06/16").set("Authorization", authHeader(teacherBToken)).expect(200);
    expect(b.body.data.closed).toBe(false); // School A's "Founders' Day" is not School B's
  });
});

describe("PUT /school/week", () => {
  it("lets an admin choose Saturday + Sunday, and the day status follows", async () => {
    const put = await request(app).put("/school/week").set("Authorization", authHeader(adminAToken)).send({ weeklyOffDays: [6, 0] }).expect(200);
    expect(put.body.data.weeklyOffDays).toEqual([0, 6]);
    const sun = await request(app).get("/daily-attendance/day?date=2083/06/18").set("Authorization", authHeader(teacherAToken)).expect(200);
    expect(sun.body.data.closed).toBe(true);
    expect(sun.body.data.reasons[0]).toEqual({ kind: "WEEKLY_OFF", title: "Sunday" });
  });

  it("is per school: School B still has only Saturday off", async () => {
    const sunB = await request(app).get("/daily-attendance/day?date=2083/06/18").set("Authorization", authHeader(teacherBToken)).expect(200);
    expect(sunB.body.data.closed).toBe(false);
    const b = await prisma.school.findUnique({ where: { id: schoolB.id }, select: { weeklyOffDays: true } });
    expect(b?.weeklyOffDays).toEqual([6]);
  });

  it("can go back to Saturday only", async () => {
    await request(app).put("/school/week").set("Authorization", authHeader(adminAToken)).send({ weeklyOffDays: [6] }).expect(200);
    const sun = await request(app).get("/daily-attendance/day?date=2083/06/18").set("Authorization", authHeader(teacherAToken)).expect(200);
    expect(sun.body.data.closed).toBe(false);
  });

  it("rejects other patterns and bad input", async () => {
    for (const bad of [[], [0], [5], [5, 6], [0, 5, 6], [7], ["6"], "6"]) {
      await request(app).put("/school/week").set("Authorization", authHeader(adminAToken)).send({ weeklyOffDays: bad }).expect(400);
    }
    await request(app).put("/school/week").set("Authorization", authHeader(adminAToken)).send({}).expect(400);
  });

  it("is admin-only", async () => {
    await request(app).put("/school/week").send({ weeklyOffDays: [6] }).expect(401);
    await request(app).put("/school/week").set("Authorization", authHeader(teacherAToken)).send({ weeklyOffDays: [6] }).expect(403);
  });

  it("changing the week never touches the school profile", async () => {
    const before = await prisma.school.findUnique({ where: { id: schoolA.id } });
    await request(app).put("/school/week").set("Authorization", authHeader(adminAToken)).send({ weeklyOffDays: [0, 6] }).expect(200);
    const after = await prisma.school.findUnique({ where: { id: schoolA.id } });
    expect(after?.name).toBe(before?.name);
    expect(after?.code).toBe(before?.code);
    expect(after?.address).toBe(before?.address);
    await request(app).put("/school/week").set("Authorization", authHeader(adminAToken)).send({ weeklyOffDays: [6] }).expect(200);
  });
});

describe("GET /calendar-events/view (staff calendar)", () => {
  it("teachers and accountants can read the merged calendar plus the weekly days off", async () => {
    for (const token of [teacherAToken, accountantAToken, adminAToken]) {
      const r = await request(app).get("/calendar-events/view?year=2083").set("Authorization", authHeader(token)).expect(200);
      expect(r.body.data.weeklyOffDays).toEqual([6]);
      const titles = r.body.data.events.map((e: any) => e.title);
      expect(titles).toContain("Founders' Day");  // this school's own event
      expect(titles).toContain("Dashain Tika");   // national, read-only
      const nat = r.body.data.events.find((e: any) => e.title === "Dashain Tika");
      expect(nat.isMaster).toBe(true);
    }
  });

  it("does not expose who created an event", async () => {
    const r = await request(app).get("/calendar-events/view?year=2083").set("Authorization", authHeader(teacherAToken)).expect(200);
    for (const e of r.body.data.events) {
      expect(e).not.toHaveProperty("createdBy");
      expect(e).not.toHaveProperty("createdById");
    }
  });

  it("another school sees national holidays but not School A's events", async () => {
    const r = await request(app).get("/calendar-events/view?year=2083").set("Authorization", authHeader(teacherBToken)).expect(200);
    const titles = r.body.data.events.map((e: any) => e.title);
    expect(titles).toContain("Dashain Tika");
    expect(titles).not.toContain("Founders' Day");
  });

  it("requires a BS year and a login", async () => {
    await request(app).get("/calendar-events/view").set("Authorization", authHeader(teacherAToken)).expect(400);
    await request(app).get("/calendar-events/view?year=83").set("Authorization", authHeader(teacherAToken)).expect(400);
    await request(app).get("/calendar-events/view?year=2083").expect(401);
  });

  it("the admin-only list is unchanged (teachers still cannot use it)", async () => {
    await request(app).get("/calendar-events?year=2083").set("Authorization", authHeader(teacherAToken)).expect(403);
    await request(app).get("/calendar-events?year=2083").set("Authorization", authHeader(adminAToken)).expect(200);
  });
});

describe("GET /analytics/dashboard — today's closed status", () => {
  it("reports today as closed on a Saturday and open on a weekday", async () => {
    // The dashboard needs an academic year to exist.
    await createTestAcademicYear(schoolA.id, { yearBS: "2083" });
    const sat = await request(app).get("/analytics/dashboard?todayBS=2083/06/17").set("Authorization", authHeader(adminAToken)).expect(200);
    expect(sat.body.data.summary.todayStatus).toEqual({ closed: true, reasons: [{ kind: "WEEKLY_OFF", title: "Saturday" }] });
    const fri = await request(app).get("/analytics/dashboard?todayBS=2083/06/15").set("Authorization", authHeader(adminAToken)).expect(200);
    expect(fri.body.data.summary.todayStatus.closed).toBe(false);
  });

  it("a malformed todayBS does not break the dashboard", async () => {
    const r = await request(app).get("/analytics/dashboard?todayBS=garbage").set("Authorization", authHeader(adminAToken)).expect(200);
    expect(r.body.data.summary.todayStatus).toBeNull();
  });
});
