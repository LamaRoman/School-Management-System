# Testing — Zentara Shikshya Backend

The backend uses Jest + Supertest, talking to a dedicated Postgres test database.

## Setup

### 1. Create the test database

```bash
createdb nepali_report_card_test
```

### 2. Configure `.env.test`

In `backend/.env.test`, set your local Postgres credentials:

```
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASS@localhost:5432/nepali_report_card_test"
NODE_ENV=test
JWT_SECRET=any-non-empty-string-for-tests
```

### 3. Apply migrations to the test DB

```bash
cd backend
npx prisma generate
npx dotenv -e .env.test -- npx prisma migrate deploy
```

### 4. Run the tests

```bash
npm test            # one-shot run
npm run test:watch  # watch mode
npm run test:verbose
```

## How it works

### Database strategy

Tests use a single dedicated test database. Each suite calls `cleanDatabase()` in `beforeAll` to truncate every table in FK order, then seeds the data it needs via the factory functions in `src/test/helpers.ts`. No per-test database creation, no migrations between tests — fast, isolated, deterministic.

### Serial execution

Tests run with `--runInBand` (single thread) because they share one database. This prevents race conditions on tables like `receipt_counters`.

### Rate limiting

The rate limiters in `app.ts` are disabled when `NODE_ENV=test`. Auth tests need to make many rapid requests, which would otherwise hit the 20-per-15-minutes login limit.

### App / Server split

`src/app.ts` builds and exports the Express app (no `listen`, no `setInterval`, no `process.exit`). `src/server.ts` imports it, validates env, starts the cleanup interval, and calls `listen`. Supertest binds to the exported app directly, so tests don't need a real port.

### Factory helpers (`src/test/helpers.ts`)

- `seedSchoolContext()` — creates a full chain: school → academic year → grade → section → student → admin user. Returns all IDs.
- `createTestUser(schoolId, role, overrides)` — creates a user with a bcrypt hash (4 rounds for speed).
- `loginAs(email, password)` — hits `/auth/login` via supertest, returns `{ token, refreshToken, cookies }`.
- `cleanDatabase()` — truncates all tables in the correct FK order.
- `disconnectDatabase()` — disconnects the Prisma client.
- `authHeader(token)` — returns the `Bearer …` string.

## What's covered

| Suite | Tests | Covers |
|-------|-------|--------|
| `auth.test.ts` | 25 | Login success/failure, Zod validation (email format, 72-char password max), lockout (5 fails → 429), HttpOnly cookies, refresh token issue/rotation/rejection, token revocation on logout, `/me` with valid/invalid/revoked tokens, change-password, role-based 403s |
| `fee.test.ts` | 20 | Category CRUD + soft-delete, fee structure creation + 500k cap, bulk payments + atomic receipt generation, receipt uniqueness, multi-item payments, 50-item array max, payment soft-delete, multi-tenancy isolation, ACCOUNTANT/TEACHER/ADMIN access matrix, Nepali months endpoint |
| `student.test.ts` | 18 | Create + auto user account, Zod validation, cross-school rejection, list/search/filter, get-with-includes, update, soft-delete, multi-tenancy isolation, teacher restricted to assigned sections, teacher denied create/delete, unauthenticated denied |

## Adding new tests

Follow the pattern of the existing files:

1. Import from `../helpers`.
2. `beforeAll` → `cleanDatabase()` and seed what you need.
3. `afterAll` → `cleanDatabase()` and `disconnectDatabase()`.
4. Group related tests in `describe` blocks.

Skeleton:

```typescript
import request from "supertest";
import {
  app,
  cleanDatabase,
  disconnectDatabase,
  seedSchoolContext,
  loginAs,
  authHeader,
} from "../helpers";

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
  it("returns the thing", async () => {
    const res = await request(app)
      .get("/your-endpoint")
      .set("Authorization", authHeader(adminToken))
      .expect(200);
    expect(res.body.data).toBeDefined();
  });
});
```
