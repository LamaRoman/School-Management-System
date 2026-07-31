/**
 * backfill-missing-student-accounts.ts
 *
 * One-time repair for students that exist with no linked login account.
 *
 * Root cause in this deployment: DEFAULT_STUDENT_PASSWORD was never set in
 * production. getStudentDefaultPassword() (src/utils/studentPassword.ts)
 * deliberately refuses to fall back to a hardcoded password in production —
 * that refusal is what silently skipped account creation for every student
 * added before the variable was set, since the enrollment endpoint just
 * logged the failure and moved on. Setting the variable fixes new students
 * going forward; it does nothing for ones already saved without an account.
 * This script creates the missing accounts for those.
 *
 * Safe to re-run: only students with no linked user are touched, so a
 * second run finds nothing left to do.
 *
 * Usage — review locally first, against the test database, never production:
 *   dotenv -e .env.test -- npx tsx prisma/backfill-missing-student-accounts.ts
 *
 * Usage — production, only after DEFAULT_STUDENT_PASSWORD is set on Railway:
 *   railway run npx tsx prisma/backfill-missing-student-accounts.ts
 */

// Type-only imports are erased at compile time, so nothing is loaded here.
import type { PrismaClient as PrismaClientCtor } from "@prisma/client";

// Captured BEFORE @prisma/client is loaded. Loading that package reads .env
// from disk, so any later read of this variable could be satisfied by a
// developer's local .env while the script is pointed at production — it would
// then create real accounts using a dev password. Real env vars always win
// over .env (dotenv never overrides an existing value), so capturing first is
// what makes the guard below mean anything.
const DEFAULT_STUDENT_PASSWORD = process.env.DEFAULT_STUDENT_PASSWORD;

/* eslint-disable @typescript-eslint/no-var-requires */
const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
const bcrypt = require("bcryptjs") as typeof import("bcryptjs");
/* eslint-enable @typescript-eslint/no-var-requires */

const prisma: PrismaClientCtor = new PrismaClient();

// Mirrors studentLoginEmail() in src/routes/student.routes.ts. Duplicated
// rather than imported so this script has no dependency on the route module —
// keep the two in sync if the email scheme ever changes.
function studentLoginEmail(studentId: string, studentName: string): string {
  const baseName = studentName.toLowerCase().trim().replace(/\s+/g, ".");
  return `${baseName}.${studentId.slice(-6)}@school.edu.np`;
}

async function main() {
  const defaultPassword = DEFAULT_STUDENT_PASSWORD;
  if (!defaultPassword) {
    console.error(
      "DEFAULT_STUDENT_PASSWORD is not set in this environment. Set it first — " +
        "this script deliberately refuses to fall back to a hardcoded password."
    );
    process.exit(1);
  }

  const orphans = await prisma.$queryRaw<{ id: string; name: string }[]>`
    SELECT s.id, s.name
    FROM students s
    WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.student_id = s.id)
    ORDER BY s.created_at
  `;

  if (orphans.length === 0) {
    console.log("No students without a login account. Nothing to do.");
    return;
  }

  console.log(`Found ${orphans.length} student(s) with no login account.\n`);

  const hashedPassword = await bcrypt.hash(defaultPassword, 10);
  const created: { name: string; email: string }[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const orphan of orphans) {
    const email = studentLoginEmail(orphan.id, orphan.name);

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      skipped.push({
        name: orphan.name,
        reason: `generated email ${email} is already used by another account — needs a manually assigned, distinct address`,
      });
      continue;
    }

    const student = await prisma.student.findUniqueOrThrow({
      where: { id: orphan.id },
      include: { section: { include: { grade: { include: { academicYear: true } } } } },
    });
    const schoolId = student.section.grade.academicYear.schoolId;

    try {
      await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          role: "STUDENT",
          studentId: student.id,
          schoolId,
          // Mirrors the student's own status — a deactivated student must not
          // gain a working login as a side effect of this repair.
          isActive: student.isActive,
        },
      });
      created.push({ name: orphan.name, email });
    } catch (err) {
      skipped.push({ name: orphan.name, reason: (err as Error).message });
    }
  }

  console.log(`Created ${created.length} account(s):`);
  for (const c of created) console.log(`  ${c.name.padEnd(30)} ${c.email}`);

  if (skipped.length > 0) {
    console.log(`\nSkipped ${skipped.length} — needs manual review:`);
    for (const s of skipped) console.log(`  ${s.name.padEnd(30)} ${s.reason}`);
  }

  console.log(`\nAll created accounts share the DEFAULT_STUDENT_PASSWORD value. Share the emails above with parents/students and encourage a password change.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
