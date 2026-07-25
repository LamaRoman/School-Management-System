/**
 * seed-dev.ts — lightweight LOCAL DEV seed for eyeballing UI changes.
 *
 * Unlike seed-all.ts (a full fake school with 260 students) this only sets up
 * what's needed to log in and view the calendar/dashboard with realistic data:
 *   - one school (adopts the existing one if present, else creates "Demo School")
 *   - a SUPER_ADMIN and an ADMIN login (both password: demo1234)
 *   - master (national) calendar events + school activities anchored to the
 *     CURRENT BS month so they show up immediately in the grid and sidebar
 *
 * Idempotent: re-running wipes and recreates the demo calendar data.
 * DO NOT run against production — it deletes all master calendar events.
 *
 * Run: npx tsx prisma/seed-dev.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import NepaliDate from "nepali-date-converter";

const prisma = new PrismaClient();

function bs(year: number, month: number, day: number): string {
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

// Clamp a month offset into the same BS year (keeps dates simple/valid).
function monthIn(base: number, offset: number): number {
  return Math.min(12, Math.max(1, base + offset));
}

async function main() {
  const nd = new NepaliDate(new Date());
  const year = nd.getYear();
  const m = nd.getMonth() + 1; // current BS month, 1-12

  const password = await bcrypt.hash("demo1234", 10);

  // ── School (adopt existing if any, else create) ──
  const existing = await prisma.school.findFirst();
  const school = existing
    ? await prisma.school.update({
        where: { id: existing.id },
        data: { name: "Demo School", code: existing.code ?? "DEMO", address: "Kathmandu", phone: "01-5555555" },
      })
    : await prisma.school.create({
        data: { name: "Demo School", code: "DEMO", address: "Kathmandu", phone: "01-5555555" },
      });

  // report card settings — harmless to have, some admin screens expect it
  await prisma.reportCardSettings.upsert({
    where: { schoolId: school.id },
    update: {},
    create: { schoolId: school.id },
  });

  // ── Logins ──
  const superAdmin = await prisma.user.upsert({
    where: { email: "superadmin@demo.local" },
    update: { password, role: "SUPER_ADMIN", schoolId: null },
    create: { email: "superadmin@demo.local", password, role: "SUPER_ADMIN", schoolId: null },
  });
  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.local" },
    update: { password, role: "ADMIN", schoolId: school.id },
    create: { email: "admin@demo.local", password, role: "ADMIN", schoolId: school.id },
  });

  // ── Reset demo calendar data (idempotent) ──
  await prisma.calendarEvent.deleteMany({ where: { schoolId: school.id } });
  await prisma.masterCalendarEvent.deleteMany({});

  // ── Master (national) events — several in the current month + neighbours ──
  const masterEvents: { title: string; date: string; type: string }[] = [
    { title: "Constitution Day", date: bs(year, m, 3), type: "HOLIDAY" },
    { title: "Teej Festival", date: bs(year, m, 9), type: "HOLIDAY" },
    { title: "Rishi Panchami", date: bs(year, m, 11), type: "HOLIDAY" },
    { title: "Indra Jatra", date: bs(year, m, 25), type: "HOLIDAY" },
    { title: "Ghatasthapana (Dashain begins)", date: bs(year, monthIn(m, 1), 8), type: "HOLIDAY" },
    { title: "Phulpati", date: bs(year, monthIn(m, 1), 14), type: "HOLIDAY" },
    { title: "Vijaya Dashami", date: bs(year, monthIn(m, 1), 18), type: "HOLIDAY" },
    { title: "Laxmi Puja (Tihar)", date: bs(year, monthIn(m, 2), 5), type: "HOLIDAY" },
    { title: "Bhai Tika", date: bs(year, monthIn(m, 2), 8), type: "HOLIDAY" },
    { title: "Labour Day", date: bs(year, monthIn(m, -1), 18), type: "HOLIDAY" },
  ];
  await prisma.masterCalendarEvent.createMany({
    data: masterEvents.map((e) => ({ ...e, source: "MANUAL", createdById: superAdmin.id })),
  });

  // ── School activities — current month + next ──
  const schoolEvents: { title: string; description?: string; date: string; type: string }[] = [
    { title: "First Terminal Exam Begins", description: "All grades", date: bs(year, m, 5), type: "EXAM" },
    { title: "Parent-Teacher Meeting", date: bs(year, m, 12), type: "MEETING" },
    { title: "Inter-house Sports Day", date: bs(year, m, 20), type: "EVENT" },
    { title: "Annual Function Rehearsal", date: bs(year, m, 27), type: "EVENT" },
    { title: "Second Terminal Exam Begins", date: bs(year, monthIn(m, 1), 22), type: "EXAM" },
    { title: "Founder's Day", date: bs(year, monthIn(m, 1), 2), type: "EVENT" },
  ];
  await prisma.calendarEvent.createMany({
    data: schoolEvents.map((e) => ({
      schoolId: school.id,
      title: e.title,
      description: e.description ?? null,
      date: e.date,
      type: e.type,
      createdById: admin.id,
    })),
  });

  console.log("Dev seed complete.");
  console.log(`  Current BS month: ${BS_MONTHS[m - 1]} ${year}`);
  console.log(`  Super Admin: superadmin@demo.local / demo1234`);
  console.log(`  Admin:       admin@demo.local / demo1234`);
  console.log(`  ${masterEvents.length} master events, ${schoolEvents.length} school activities.`);
}

const BS_MONTHS = ["Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
