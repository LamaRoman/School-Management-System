/**
 * create-super-admin.ts — creates exactly one SUPER_ADMIN user, nothing else.
 *
 * Unlike seed-all.ts (which generates a full fake demo school), this is
 * meant to bootstrap a real, empty production database with the one
 * account needed to log in and start creating real schools from the
 * super-admin panel.
 *
 * Usage:
 *   SUPER_ADMIN_EMAIL="you@yourdomain.com" npx tsx prisma/create-super-admin.ts
 *
 * If SUPER_ADMIN_EMAIL is omitted, defaults to admin@sms.local.
 * A random password is always generated and printed once — it is not
 * recoverable afterward, so save it immediately.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

function generatePassword(): string {
  return crypto.randomBytes(12).toString("base64url");
}

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL || "admin@sms.local";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`A user with email "${email}" already exists (role: ${existing.role}). Aborting — nothing changed.`);
    process.exit(1);
  }

  const password = generatePassword();
  const hashed = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: { email, password: hashed, role: "SUPER_ADMIN", schoolId: null },
  });

  console.log("Super Admin created. Save these credentials now — the password is not stored anywhere else:");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
