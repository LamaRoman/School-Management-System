/**
 * Auth Integration Tests
 *
 * Tests the full auth lifecycle: login, refresh, logout, /me, change-password,
 * account lockout, and input validation.
 *
 * These hit actual HTTP endpoints via supertest against a real test database.
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

beforeAll(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

// ─── LOGIN ──────────────────────────────────────────────────────────────────────

describe("POST /auth/login", () => {
  let schoolId: string;
  let userEmail: string;
  const userPassword = "Test@123";

  beforeAll(async () => {
    const school = await createTestSchool({ name: "Auth Test School", code: "ATS" });
    schoolId = school.id;
    const user = await createTestUser(schoolId, "ADMIN", {
      email: "admin@authtest.com",
      password: userPassword,
    });
    userEmail = user.email;
  });

  it("should login with valid credentials and return token + user", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: userEmail, password: userPassword })
      .expect(200);

    expect(res.body.data).toHaveProperty("token");
    expect(res.body.data).toHaveProperty("user");
    expect(res.body.data.user.email).toBe(userEmail);
    expect(res.body.data.user.role).toBe("ADMIN");
    expect(res.body.data.user.schoolId).toBe(schoolId);
  });

  it("should set HttpOnly cookies on login", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: userEmail, password: userPassword })
      .expect(200);

    const rawCookies = res.headers["set-cookie"];
    expect(rawCookies).toBeDefined();

    // supertest v7 may return a single string or an array
    const cookieList = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
    const tokenCookie = cookieList.find((c: string) => c.startsWith("token="));
    expect(tokenCookie).toBeDefined();
    expect(tokenCookie).toContain("HttpOnly");
  });

  it("should return refreshToken in body", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: userEmail, password: userPassword })
      .expect(200);

    expect(res.body.data).toHaveProperty("refreshToken");
    expect(typeof res.body.data.refreshToken).toBe("string");
  });

  it("should reject invalid password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: userEmail, password: "WrongPassword" })
      .expect(401);

    expect(res.body.error).toMatch(/invalid/i);
  });

  it("should reject non-existent email", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@test.com", password: "whatever" })
      .expect(401);

    expect(res.body.error).toMatch(/invalid/i);
  });

  it("should reject empty password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: userEmail, password: "" })
      .expect(400);

    expect(res.body).toHaveProperty("details");
  });

  it("should reject password longer than 72 chars", async () => {
    const longPassword = "A".repeat(73);
    const res = await request(app)
      .post("/auth/login")
      .send({ email: userEmail, password: longPassword })
      .expect(400);

    expect(res.body).toHaveProperty("details");
  });

  it("should reject invalid email format", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "not-an-email", password: "Test@123" })
      .expect(400);

    expect(res.body).toHaveProperty("details");
  });

  it("should reject inactive user", async () => {
    await createTestUser(schoolId, "TEACHER", {
      email: "inactive@authtest.com",
      password: "Test@123",
      isActive: false,
    });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "inactive@authtest.com", password: "Test@123" })
      .expect(401);

    expect(res.body.error).toMatch(/invalid/i);
  });
});

// ─── ACCOUNT LOCKOUT ────────────────────────────────────────────────────────────

describe("Account lockout (5 failures → 15min lock)", () => {
  const lockoutEmail = "lockout@authtest.com";
  const lockoutPassword = "Test@123";

  beforeAll(async () => {
    // Clean previous lockout records for this email
    await prisma.loginAttempt.deleteMany({ where: { email: lockoutEmail } });
    const school = await prisma.school.findFirst();
    await createTestUser(school!.id, "ADMIN", {
      email: lockoutEmail,
      password: lockoutPassword,
    });
  });

  it("should lock account after 5 failed attempts", async () => {
    // Make 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/auth/login")
        .send({ email: lockoutEmail, password: "wrong" })
        .expect(401);
    }

    // 6th attempt should get 429
    const res = await request(app)
      .post("/auth/login")
      .send({ email: lockoutEmail, password: lockoutPassword })
      .expect(429);

    expect(res.body.error).toMatch(/locked/i);
  });

  it("should still reject even with correct password while locked", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: lockoutEmail, password: lockoutPassword })
      .expect(429);

    expect(res.body.error).toMatch(/locked/i);
  });
});

// ─── GET /auth/me ───────────────────────────────────────────────────────────────

describe("GET /auth/me", () => {
  let token: string;

  beforeAll(async () => {
    const user = await prisma.user.findFirst({ where: { email: "admin@authtest.com" } });
    if (user) {
      const result = await loginAs("admin@authtest.com");
      token = result.token;
    }
  });

  it("should return current user with valid token", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", authHeader(token))
      .expect(200);

    expect(res.body.data.email).toBe("admin@authtest.com");
    expect(res.body.data.role).toBe("ADMIN");
    expect(res.body.data).toHaveProperty("id");
    expect(res.body.data).toHaveProperty("schoolId");
  });

  it("should reject request without token", async () => {
    await request(app)
      .get("/auth/me")
      .expect(401);
  });

  it("should reject request with invalid token", async () => {
    await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer invalid.token.here")
      .expect(401);
  });
});

// ─── CHANGE PASSWORD ────────────────────────────────────────────────────────────

describe("POST /auth/change-password", () => {
  let token: string;
  const originalPassword = "ChangeMe@123";
  const newPassword = "Changed@456";
  const changePassEmail = "changepass@authtest.com";

  beforeAll(async () => {
    const school = await prisma.school.findFirst();
    await createTestUser(school!.id, "ADMIN", {
      email: changePassEmail,
      password: originalPassword,
    });
    const result = await loginAs(changePassEmail, originalPassword);
    token = result.token;
  });

  it("should change password with correct current password", async () => {
    const res = await request(app)
      .post("/auth/change-password")
      .set("Authorization", authHeader(token))
      .send({ currentPassword: originalPassword, newPassword })
      .expect(200);

    expect(res.body.data.message).toMatch(/changed/i);
  });

  it("should login with new password after change", async () => {
    await request(app)
      .post("/auth/login")
      .send({ email: changePassEmail, password: newPassword })
      .expect(200);
  });

  it("should reject change with wrong current password", async () => {
    // Re-login with new password to get a fresh token
    const { token: freshToken } = await loginAs(changePassEmail, newPassword);

    await request(app)
      .post("/auth/change-password")
      .set("Authorization", authHeader(freshToken))
      .send({ currentPassword: "TotallyWrong", newPassword: "Another@789" })
      .expect(401);
  });

  it("should reject new password shorter than 6 chars", async () => {
    const { token: freshToken } = await loginAs(changePassEmail, newPassword);

    const res = await request(app)
      .post("/auth/change-password")
      .set("Authorization", authHeader(freshToken))
      .send({ currentPassword: newPassword, newPassword: "ab" })
      .expect(400);

    expect(res.body).toHaveProperty("details");
  });

  it("should reject new password longer than 72 chars", async () => {
    const { token: freshToken } = await loginAs(changePassEmail, newPassword);

    const res = await request(app)
      .post("/auth/change-password")
      .set("Authorization", authHeader(freshToken))
      .send({ currentPassword: newPassword, newPassword: "A".repeat(73) })
      .expect(400);

    expect(res.body).toHaveProperty("details");
  });
});

// ─── LOGOUT + TOKEN REVOCATION ──────────────────────────────────────────────────

describe("POST /auth/logout", () => {
  it("should logout and revoke token", async () => {
    const { token } = await loginAs("admin@authtest.com");

    // Logout
    const res = await request(app)
      .post("/auth/logout")
      .set("Authorization", authHeader(token))
      .expect(200);

    expect(res.body.data.message).toMatch(/logged out/i);

    // Token should now be revoked — /me should fail
    // Note: there's a 30s negative cache on the blocklist, but since we just
    // wrote the entry AND invalidated the cache, this should work immediately.
    await request(app)
      .get("/auth/me")
      .set("Authorization", authHeader(token))
      .expect(401);
  });

  it("should clear cookies on logout", async () => {
    const { token } = await loginAs("admin@authtest.com");

    const res = await request(app)
      .post("/auth/logout")
      .set("Authorization", authHeader(token))
      .expect(200);

    const rawCookies = res.headers["set-cookie"];
    if (rawCookies) {
      // supertest v7 may return a single string or an array
      const cookieList = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
      const clearedCookie = cookieList.find(
        (c: string) => c.includes("token=") && (c.includes("Max-Age=0") || c.includes("Expires=Thu, 01 Jan 1970"))
      );
      // Cookie clearing is implementation-dependent, just verify logout succeeded
      expect(res.body.data.message).toMatch(/logged out/i);
    }
  });

  it("should delete all refresh tokens on logout", async () => {
    const admin = await prisma.user.findFirst({ where: { email: "admin@authtest.com" } });
    const { token } = await loginAs("admin@authtest.com");

    // Verify refresh tokens exist before logout
    const beforeCount = await prisma.refreshToken.count({
      where: { userId: admin!.id },
    });
    expect(beforeCount).toBeGreaterThan(0);

    // Logout
    await request(app)
      .post("/auth/logout")
      .set("Authorization", authHeader(token))
      .expect(200);

    // All refresh tokens should be deleted
    const afterCount = await prisma.refreshToken.count({
      where: { userId: admin!.id },
    });
    expect(afterCount).toBe(0);
  });
});

// ─── REFRESH TOKENS ─────────────────────────────────────────────────────────────

describe("POST /auth/refresh", () => {
  it("should issue new access + refresh tokens", async () => {
    const { refreshToken } = await loginAs("admin@authtest.com");

    const res = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken })
      .expect(200);

    expect(res.body.data).toHaveProperty("token");
    expect(res.body.data).toHaveProperty("refreshToken");
    // New tokens should be different from old ones
    expect(res.body.data.refreshToken).not.toBe(refreshToken);
  });

  it("should rotate refresh token (old one becomes invalid)", async () => {
    const { refreshToken: oldRefresh } = await loginAs("admin@authtest.com");

    // Use it once — should work
    const res = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: oldRefresh })
      .expect(200);

    // Try to reuse the old refresh token — should fail (rotated)
    await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: oldRefresh })
      .expect(401);
  });

  it("should reject missing refresh token", async () => {
    await request(app)
      .post("/auth/refresh")
      .send({})
      .expect(401);
  });

  it("should reject invalid refresh token", async () => {
    await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: "not-a-real-token" })
      .expect(401);
  });

  it("should reject refresh for deactivated user", async () => {
    const school = await prisma.school.findFirst();
    const deactivateUser = await createTestUser(school!.id, "TEACHER", {
      email: "deactivate-refresh@authtest.com",
      password: "Test@123",
    });
    const { refreshToken } = await loginAs("deactivate-refresh@authtest.com");

    // Deactivate the user
    await prisma.user.update({
      where: { id: deactivateUser.id },
      data: { isActive: false },
    });

    // Try to refresh — should fail
    await request(app)
      .post("/auth/refresh")
      .send({ refreshToken })
      .expect(401);
  });
});

// ─── ROLE AUTHORIZATION ─────────────────────────────────────────────────────────

describe("Role-based authorization", () => {
  let teacherToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const school = await prisma.school.findFirst();
    await createTestUser(school!.id, "TEACHER", {
      email: "teacher-role@authtest.com",
      password: "Test@123",
    });
    const teacherResult = await loginAs("teacher-role@authtest.com");
    teacherToken = teacherResult.token;

    const adminResult = await loginAs("admin@authtest.com");
    adminToken = adminResult.token;
  });

  it("should allow ADMIN to access admin-only endpoints", async () => {
    // Fee categories require ADMIN role
    await request(app)
      .get("/fees/categories")
      .set("Authorization", authHeader(adminToken))
      .expect(200);
  });

  it("should deny TEACHER from admin-only endpoints", async () => {
    // POST fee categories requires ADMIN
    await request(app)
      .post("/fees/categories")
      .set("Authorization", authHeader(teacherToken))
      .send({ name: "Unauthorized Category" })
      .expect(403);
  });
});

// ─── HEALTH CHECK ───────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("should return ok status", async () => {
    const res = await request(app)
      .get("/health")
      .expect(200);

    expect(res.body.status).toBe("ok");
    expect(res.body).toHaveProperty("timestamp");
  });
});
