/**
 * Emails are case-insensitive for sign-in and stored lower-case.
 *
 * The phone apps lower-case what is typed, and a person (or a keyboard that capitalises the first
 * letter) can type capitals anywhere; the server used to compare emails exactly, so an account
 * created as "Sita@Gmail.com" could be signed in to on the web but never from a phone.
 */

import request from "supertest";
import {
  app,
  prisma,
  cleanDatabase,
  disconnectDatabase,
  seedSchoolContext,
  createTestUser,
  authHeader,
} from "../helpers";

let ctx: Awaited<ReturnType<typeof seedSchoolContext>>;
let adminToken: string;
const PASSWORD = "Test@123";

const login = (email: string, password = PASSWORD) => request(app).post("/auth/login").send({ email, password });

beforeAll(async () => {
  await cleanDatabase();
  ctx = await seedSchoolContext({ schoolName: "Email Case School", schoolCode: "ECS", adminEmail: "admin@ecs.test" });
  adminToken = (await login("admin@ecs.test").expect(200)).body.data.token;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

describe("sign-in ignores case and surrounding spaces", () => {
  it("a lower-case account signs in however the address is typed", async () => {
    for (const typed of ["admin@ecs.test", "Admin@ECS.test", "ADMIN@ECS.TEST", "  admin@ecs.test  "]) {
      const res = await login(typed).expect(200);
      expect(res.body.data.user.email).toBe("admin@ecs.test");
    }
  });

  it("an older account stored with capitals still signs in, typed in any case", async () => {
    await createTestUser(ctx.school.id, "PARENT", { email: "Sita.Sharma@Example.com", password: PASSWORD });
    for (const typed of ["Sita.Sharma@Example.com", "sita.sharma@example.com", "SITA.SHARMA@EXAMPLE.COM"]) {
      const res = await login(typed).expect(200);
      expect(res.body.data.user.email).toBe("Sita.Sharma@Example.com"); // untouched; only matching is loose
    }
  });

  it("wrong password and unknown address are still 401", async () => {
    await login("Admin@ECS.test", "wrong").expect(401);
    await login("nobody@ecs.test").expect(401);
  });

  it("two accounts that differ only by case: the exact lower-case one wins, otherwise nobody is guessed", async () => {
    await createTestUser(ctx.school.id, "TEACHER", { email: "Pat@Twin.com", password: PASSWORD });
    await createTestUser(ctx.school.id, "TEACHER", { email: "pAT@twin.com", password: "Other@123" });
    // Neither is exactly lower-case, so "pat@twin.com" is ambiguous: refuse rather than pick one.
    await login("pat@twin.com").expect(401);
    // Once one of them is exactly lower-case, it is unambiguous.
    await createTestUser(ctx.school.id, "TEACHER", { email: "pat@twin.com", password: "Third@123" });
    await login("PAT@twin.com", "Third@123").expect(200);
  });

  it("failed attempts count against the account whatever case is typed (lock-out cannot be dodged)", async () => {
    await createTestUser(ctx.school.id, "ACCOUNTANT", { email: "lock@ecs.test", password: PASSWORD });
    const variants = ["lock@ecs.test", "Lock@ecs.test", "LOCK@ECS.TEST", "lOCK@ecs.test", "lock@ECS.test"];
    for (const v of variants) await login(v, "wrong").expect(401);
    const locked = await login("lock@ecs.test").expect(429);
    expect(locked.body.error).toMatch(/locked/i);
  });
});

describe("new accounts are stored lower-case", () => {
  it("an accountant created with capitals is stored lower-case and signs in", async () => {
    const res = await request(app).post("/staff").set("Authorization", authHeader(adminToken))
      .send({ email: "  New.Accountant@Example.COM ", password: PASSWORD }).expect(201);
    expect(res.body.data.email).toBe("new.accountant@example.com");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: res.body.data.id } })).email).toBe("new.accountant@example.com");
    await login("NEW.ACCOUNTANT@example.com").expect(200);
  });

  it("the same address in a different case is recognised as taken", async () => {
    await request(app).post("/staff").set("Authorization", authHeader(adminToken))
      .send({ email: "NEW.ACCOUNTANT@EXAMPLE.COM", password: PASSWORD }).expect(409);
  });

  it("a teacher login is stored lower-case", async () => {
    const res = await request(app).post("/teachers").set("Authorization", authHeader(adminToken))
      .send({ name: "Case Teacher", email: "Case.Teacher@School.Edu.NP", password: PASSWORD }).expect(201);
    const user = await prisma.user.findFirstOrThrow({ where: { teacherId: res.body.data.id } });
    expect(user.email).toBe("case.teacher@school.edu.np");
    await login("Case.Teacher@school.edu.np").expect(200);
  });

  it("a parent login is stored lower-case", async () => {
    const res = await request(app).post("/parents").set("Authorization", authHeader(adminToken))
      .send({ email: "Parent.One@Example.com", password: PASSWORD, studentIds: [ctx.student.id] }).expect(201);
    expect(res.body.data.user.email).toBe("parent.one@example.com");
    await login("PARENT.ONE@example.com").expect(200);
  });

  it("an invalid address is still rejected", async () => {
    await request(app).post("/staff").set("Authorization", authHeader(adminToken))
      .send({ email: "not-an-email", password: PASSWORD }).expect(400);
  });
});
