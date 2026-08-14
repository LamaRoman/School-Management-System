/**
 * Health check tests (X2)
 *
 * The endpoint has to fail when Postgres is unreachable — a bare "ok" meant an
 * instance with a dead database still reported healthy and kept receiving traffic.
 */

import request from "supertest";
import { app, prisma, disconnectDatabase } from "../helpers";

afterAll(async () => {
  await disconnectDatabase();
});

describe("GET /health", () => {
  it("reports ok when the database answers", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toMatchObject({ status: "ok", database: "ok" });
    expect(res.body.timestamp).toEqual(expect.any(String));
  });

  it("reports 503 when the database is unreachable", async () => {
    const spy = jest
      .spyOn(prisma, "$queryRaw")
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const res = await request(app).get("/health").expect(503);
    expect(res.body).toMatchObject({ status: "error", database: "unreachable" });

    spy.mockRestore();
  });

  it("does not leak the driver error — the endpoint is unauthenticated", async () => {
    const spy = jest
      .spyOn(prisma, "$queryRaw")
      .mockRejectedValueOnce(
        new Error("Authentication failed against database server at `localhost`, user `postgres`, password `hunter2`"),
      );

    const res = await request(app).get("/health").expect(503);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("hunter2");
    expect(body).not.toContain("postgres");

    spy.mockRestore();
  });

  it("recovers once the database answers again", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body.database).toBe("ok");
  });
});
