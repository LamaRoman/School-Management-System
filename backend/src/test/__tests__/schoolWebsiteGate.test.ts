/**
 * S6b — a school code is required before a public website can be connected.
 *
 * The public gallery/calendar routes accept a `code`-based identifier so a
 * school's website never has to embed the internal cuid. Requiring `code`
 * before `websiteUrl` closes the gap at the source: a school that has never
 * taken a payment gets a code-based identity from day one, so there is no
 * receipt-prefix discontinuity to introduce later either.
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

let superToken: string;

beforeAll(async () => {
  await cleanDatabase();
  await createTestUser(null, "SUPER_ADMIN", {
    email: "super@gate.test",
    password: "Test@123",
  });
  superToken = (await loginAs("super@gate.test")).token;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

describe("POST /super-admin/schools — code required with website", () => {
  it("rejects creating a school with a website but no code", async () => {
    const res = await request(app)
      .post("/super-admin/schools")
      .set("Authorization", authHeader(superToken))
      .send({
        name: "No Code Web School",
        websiteUrl: "https://nocode.example.test",
        adminEmail: "admin1@gate.test",
        adminPassword: "Test@123",
      });

    expect(res.status).toBe(400);
    expect(await prisma.school.count({ where: { name: "No Code Web School" } })).toBe(0);
  });

  it("allows a website when a code is supplied", async () => {
    const res = await request(app)
      .post("/super-admin/schools")
      .set("Authorization", authHeader(superToken))
      .send({
        name: "Coded Web School",
        code: "CWS",
        websiteUrl: "https://cws.example.test",
        adminEmail: "admin2@gate.test",
        adminPassword: "Test@123",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.school.code).toBe("CWS");
  });

  it("allows a school with no website and no code", async () => {
    const res = await request(app)
      .post("/super-admin/schools")
      .set("Authorization", authHeader(superToken))
      .send({
        name: "Plain School",
        adminEmail: "admin3@gate.test",
        adminPassword: "Test@123",
      });

    expect(res.status).toBe(201);
  });
});

describe("PUT /super-admin/schools/:id — code required with website", () => {
  it("rejects adding a website to a school that has no code", async () => {
    const school = await createTestSchool({ name: "Later Web School" });
    await prisma.school.update({ where: { id: school.id }, data: { code: null } });

    const res = await request(app)
      .put(`/super-admin/schools/${school.id}`)
      .set("Authorization", authHeader(superToken))
      .send({ websiteUrl: "https://later.example.test" });

    expect(res.status).toBe(400);
    const after = await prisma.school.findUnique({ where: { id: school.id } });
    expect(after?.websiteUrl).toBeNull();
  });

  it("accepts a website when the code already exists on the school", async () => {
    const school = await createTestSchool({ name: "Precoded School", code: "PCS" });

    const res = await request(app)
      .put(`/super-admin/schools/${school.id}`)
      .set("Authorization", authHeader(superToken))
      .send({ websiteUrl: "https://precoded.example.test" });

    expect(res.status).toBe(200);
    expect(res.body.data.websiteUrl).toBe("https://precoded.example.test");
  });

  it("accepts a code and website supplied together in one update", async () => {
    const school = await createTestSchool({ name: "Together School" });
    await prisma.school.update({ where: { id: school.id }, data: { code: null } });

    const res = await request(app)
      .put(`/super-admin/schools/${school.id}`)
      .set("Authorization", authHeader(superToken))
      .send({ code: "TGS", websiteUrl: "https://together.example.test" });

    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("TGS");
    expect(res.body.data.websiteUrl).toBe("https://together.example.test");
  });
});
