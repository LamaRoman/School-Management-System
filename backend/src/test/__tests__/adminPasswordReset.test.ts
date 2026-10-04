/**
 * Admin resets a staff password — the "forgot my password" path.
 *
 * Someone who forgot their password has usually failed to sign in a few times already, and five
 * failures lock the email for 15 minutes. The reset used to store the new hash and nothing else,
 * so the fresh password was refused ("temporarily locked") until the lock ran out, and sessions
 * opened with the old password stayed alive. Both reset routes now clear both.
 */

import request from "supertest";
import {
  app, prisma, cleanDatabase, disconnectDatabase, createTestSchool, createTestUser,
  createTestTeacher, loginAs, authHeader,
} from "../helpers";

let adminToken: string;
let teacherId: string;
let accountantUserId: string;

const login = (email: string, password: string) =>
  request(app).post("/auth/login").send({ email, password });

async function lockOut(email: string) {
  for (let i = 0; i < 5; i++) await login(email, "wrong-password").expect(401);
  await login(email, "Test@123").expect(429); // locked, even with the right password
}

beforeAll(async () => {
  await cleanDatabase();
  const school = await createTestSchool();
  await createTestUser(school.id, "ADMIN", { email: "admin@reset.test", password: "Test@123" });
  adminToken = (await loginAs("admin@reset.test")).token;

  const teacher = await createTestTeacher(school.id, { email: "teacher@reset.test" });
  teacherId = teacher.id;
  await createTestUser(school.id, "TEACHER", { email: "teacher@reset.test", password: "Test@123", teacherId: teacher.id });

  accountantUserId = (await createTestUser(school.id, "ACCOUNTANT", { email: "acc@reset.test", password: "Test@123" })).id;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

it("teacher: reset lifts the lockout, the new password works, old sessions are revoked", async () => {
  const old = await loginAs("teacher@reset.test");
  await lockOut("teacher@reset.test");

  await request(app).post(`/teachers/${teacherId}/reset-password`).set("Authorization", authHeader(adminToken))
    .send({ newPassword: "fresh-pass-1" }).expect(200);

  await login("teacher@reset.test", "fresh-pass-1").expect(200);
  await request(app).post("/auth/refresh").send({ refreshToken: old.refreshToken }).expect(401);
});

it("accountant: reset lifts the lockout, the new password works, old sessions are revoked", async () => {
  const old = await loginAs("acc@reset.test");
  await lockOut("acc@reset.test");

  await request(app).put(`/staff/${accountantUserId}/reset-password`).set("Authorization", authHeader(adminToken))
    .send({ password: "fresh-pass-2" }).expect(200);

  await login("acc@reset.test", "fresh-pass-2").expect(200);
  await request(app).post("/auth/refresh").send({ refreshToken: old.refreshToken }).expect(401);
});

it("only an admin can reset", async () => {
  const teacherToken = (await loginAs("teacher@reset.test", "fresh-pass-1")).token;
  await request(app).put(`/staff/${accountantUserId}/reset-password`).set("Authorization", authHeader(teacherToken))
    .send({ password: "nope-nope" }).expect(403);
});
