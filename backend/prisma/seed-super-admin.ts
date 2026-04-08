/**
 * Seed: Create Super Admin account
 *
 * Run with: npx tsx prisma/seed-super-admin.ts
 *
 * Creates a SUPER_ADMIN user with no schoolId (can manage all schools).
 * Safe to run multiple times — skips if email already exists.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "superadmin@zentaralabs.com";
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "superadmin123";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: SUPER_ADMIN_EMAIL } });

  if (existing) {
    if (existing.role === "SUPER_ADMIN") {
      console.log(`✅ Super admin already exists: ${SUPER_ADMIN_EMAIL}`);
    } else {
      // Upgrade existing user to SUPER_ADMIN and detach from school
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: "SUPER_ADMIN", schoolId: null },
      });
      console.log(`⬆️  Upgraded ${SUPER_ADMIN_EMAIL} to SUPER_ADMIN`);
    }
    return;
  }

  const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);

  await prisma.user.create({
    data: {
      email: SUPER_ADMIN_EMAIL,
      password: hashedPassword,
      role: "SUPER_ADMIN",
      schoolId: null,
      isActive: true,
    },
  });

  console.log(`✅ Super admin created: ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);
  console.log(`⚠️  Change the password after first login!`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
