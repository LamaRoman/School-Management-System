# Testing Setup — Zentara Shikshya Backend

## What's in this tar.gz

### Fix: Refresh token files (were in `backend/backend/`, now in correct location)
- `backend/prisma/schema.prisma` — adds `RefreshToken` model + `refreshTokens` relation on `User`
- `backend/prisma/migrations/20260417010000_add_refresh_tokens/migration.sql` — delta migration (only adds the `refresh_tokens` table)
- `backend/src/routes/auth.routes.ts` — adds `POST /auth/refresh` endpoint, 15min access + 30-day refresh token
- `backend/src/middleware/auth.ts` — adds refresh token cleanup in hourly job

### Refactor: App/Server separation (required for supertest)
- `backend/src/app.ts` — Express app setup, exports `app` (NO `listen()`, NO `setInterval`, NO `process.exit`)
- `backend/src/server.ts` — **NEW** — imports app, validates env, starts intervals, calls `listen()`. This is now the entry point.

### Jest infrastructure
- `backend/package.json` — adds test deps (`jest`, `ts-jest`, `supertest`, `dotenv-cli`) + `test` scripts, points `dev`/`start` to `server.ts`
- `backend/jest.config.ts` — ts-jest preset, serial execution
- `backend/.env.test` — test database config (edit before use)
- `backend/src/test/helpers.ts` — factory functions, cleanup, auth utilities

### Test suites
- `backend/src/test/__tests__/auth.test.ts` — 25 tests: login, lockout, logout+revocation, refresh token rotation, /me, change-password, role auth
- `backend/src/test/__tests__/fee.test.ts` — 20 tests: category CRUD, structure, bulk payments, receipts, multi-tenancy isolation, role auth
- `backend/src/test/__tests__/student.test.ts` — 18 tests: CRUD, search, multi-tenancy isolation, teacher section access, role auth

---

## Setup steps

### 1. Extract the tar.gz
```bash
cd School-Management-System
tar -xzvf zentara-testing.tar.gz
```
This overwrites files in `backend/` with the corrected versions.

### 2. Delete the orphaned `backend/backend/` directory
```bash
rm -rf backend/backend
```

### 3. Create the test database
```bash
createdb nepali_report_card_test
```

### 4. Edit `.env.test`
Open `backend/.env.test` and set your local Postgres credentials:
```
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASS@localhost:5432/nepali_report_card_test"
```

### 5. Install new deps
```bash
cd backend
npm install
```

### 6. Generate Prisma client + apply migrations to test DB
```bash
npx prisma generate
dotenv -e .env.test -- npx prisma migrate deploy
```

### 7. Run tests
```bash
npm test
```

Or with watch mode for development:
```bash
npm run test:watch
```

---

## How it works

### Database strategy
Tests use a **dedicated test database** (`nepali_report_card_test`). Each test file calls `cleanDatabase()` in `beforeAll` to truncate all tables, then seeds the data it needs via factory functions. This ensures test isolation without the overhead of creating/dropping databases.

### Serial execution
Tests run with `--runInBand` (single thread) because they share one database. This prevents race conditions on shared tables like `receipt_counters`.

### Rate limiting
Rate limiters are **disabled** when `NODE_ENV=test` (set in `.env.test`). This is necessary because auth tests make many rapid requests that would otherwise hit the 20-request-per-15-min login limit.

### Factory functions (in `helpers.ts`)
- `seedSchoolContext()` — creates a full school chain: school → academic year → grade → section → student → admin user. Returns all IDs.
- `createTestUser(schoolId, role, overrides)` — creates a user with bcrypt hash (4 rounds for speed)
- `loginAs(email, password)` — hits `/auth/login` via supertest, returns `{ token, refreshToken, cookies }`
- `cleanDatabase()` — truncates ALL tables in correct FK order

### App/Server split
Before this change, `app.ts` both set up Express AND called `app.listen()`. Supertest can't work with a listening server (it manages its own port). Now:
- `app.ts` exports the Express app (used by both tests and production)
- `server.ts` imports it and starts listening (production entry point only)

---

## What's tested

| Suite | Tests | Covers |
|-------|-------|--------|
| Auth | 25 | Login success/failure, Zod validation (email format, password 72-char max), account lockout (5 fails → 429), HttpOnly cookies, refresh token issue/rotation/rejection, token revocation on logout, /me with valid/invalid/revoked tokens, change-password, role-based 403s |
| Fee | 20 | Category CRUD + soft-delete, fee structure creation + max(500k) validation, bulk payments + atomic receipt generation, receipt uniqueness, multi-item payments, items array max(50), payment soft-delete, multi-tenancy isolation (cross-school denied), ACCOUNTANT vs TEACHER vs ADMIN access, Nepali months endpoint |
| Student | 18 | Create + auto user account, Zod validation, cross-school section rejection, list with search + section filter, get single with includes, update, soft-delete, multi-tenancy isolation, teacher restricted to assigned sections, teacher denied create/delete, unauthenticated denied |

---

## Adding more tests

Follow the pattern in existing test files:
1. Import from `../helpers`
2. `beforeAll` → `cleanDatabase()` + seed what you need
3. `afterAll` → `cleanDatabase()` + `disconnectDatabase()`
4. Group related tests in `describe` blocks

Example skeleton:
```typescript
import request from "supertest";
import { app, prisma, cleanDatabase, disconnectDatabase, seedSchoolContext, loginAs, authHeader } from "../helpers";

let ctx: Awaited<ReturnType<typeof seedSchoolContext>>;
let adminToken: string;

beforeAll(async () => {
  await cleanDatabase();
  ctx = await seedSchoolContext({ adminEmail: "admin@newtest.com" });
  adminToken = (await loginAs("admin@newtest.com")).token;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

describe("GET /your-endpoint", () => {
  it("should do the thing", async () => {
    const res = await request(app)
      .get("/your-endpoint")
      .set("Authorization", authHeader(adminToken))
      .expect(200);
    expect(res.body.data).toBeDefined();
  });
});
```
