/**
 * seed-rich-data.ts
 *
 * Adds rich realistic data on top of existing seed-dummy-full.ts data:
 *   1. More teachers — subject-specific + class teachers for Section B (upper grades)
 *   2. Marks — First Terminal (all), Second Terminal (most), Final (some)
 *   3. Fee payments — mix of fully paid / partial / arrears / advance
 *   4. Attendance — daily records + Attendance summary totals
 *
 * Run AFTER seed.ts and seed-dummy-full.ts:
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nepali_report_card?schema=public" npx tsx prisma/seed-rich-data.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import NepaliDate from "nepali-date-converter";

const prisma = new PrismaClient();

// ─── Constants ───────────────────────────────────────────

const NEPALI_MONTHS = [
  "Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
];

// Current BS date helper
function getTodayBS(): string {
  const nd = new NepaliDate(new Date());
  return `${nd.getYear()}/${String(nd.getMonth() + 1).padStart(2, "0")}/${String(nd.getDate()).padStart(2, "0")}`;
}

// BS date for a specific month index (0=Baisakh) in year 2082
function bsDateForMonth(monthIndex: number, day = 15): string {
  return `2082/${String(monthIndex + 1).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

// Random int between min and max (inclusive)
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate realistic theory marks given full marks
function randMarks(full: number, quality: "high" | "mid" | "low" | "absent"): number | null {
  if (quality === "absent") return null;
  const pass = Math.ceil(full * 0.4);
  if (quality === "high") return rand(Math.ceil(full * 0.75), full);
  if (quality === "mid")  return rand(pass, Math.ceil(full * 0.74));
  return rand(Math.ceil(full * 0.2), pass - 1); // low = failing
}

// Receipt counter (we'll increment as we go)
let receiptCounter = 10000;
function nextReceipt(): string {
  return `RCP-${String(++receiptCounter).padStart(5, "0")}`;
}

// ─── New Teachers ────────────────────────────────────────

const newTeachers = [
  // Subject specialists for Grades VI–X
  { id: "teacher-sita-rai",       name: "Sita Rai",        email: "sita.rai@school.edu.np",        phone: "9801111001" },
  { id: "teacher-dinesh-kc",      name: "Dinesh KC",        email: "dinesh.kc@school.edu.np",       phone: "9801111002" },
  { id: "teacher-poonam-thapa",   name: "Poonam Thapa",    email: "poonam.thapa@school.edu.np",    phone: "9801111003" },
  { id: "teacher-ashok-shrestha", name: "Ashok Shrestha",  email: "ashok.shrestha@school.edu.np",  phone: "9801111004" },
  { id: "teacher-sarita-karki",   name: "Sarita Karki",    email: "sarita.karki@school.edu.np",    phone: "9801111005" },
  // Class teachers for Section B upper grades
  { id: "teacher-naresh-poudel",  name: "Naresh Poudel",   email: "naresh.poudel@school.edu.np",   phone: "9801111006" },
  { id: "teacher-kamala-gurung",  name: "Kamala Gurung",   email: "kamala.gurung@school.edu.np",   phone: "9801111007" },
  { id: "teacher-tilak-dahal",    name: "Tilak Dahal",     email: "tilak.dahal@school.edu.np",     phone: "9801111008" },
  { id: "teacher-rekha-bhatt",    name: "Rekha Bhattarai", email: "rekha.bhattarai@school.edu.np", phone: "9801111009" },
  { id: "teacher-gopal-subedi",   name: "Gopal Subedi",    email: "gopal.subedi@school.edu.np",    phone: "9801111010" },
];

// ─── Main ────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding rich data...\n");

  const todayBS = getTodayBS();
  const hashedPw = await bcrypt.hash("teacher123", 10);

  // Fetch base data
  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) { console.error("❌ No active academic year. Run seed.ts first."); process.exit(1); }

  const examTypes = await prisma.examType.findMany({
    where: { academicYearId: activeYear.id },
    orderBy: { displayOrder: "asc" },
  });
  if (examTypes.length === 0) { console.error("❌ No exam types. Run seed.ts first."); process.exit(1); }
  console.log(`✅ Active year: ${activeYear.yearBS} | Exams: ${examTypes.map(e => e.name).join(", ")}`);

  const feeCategory = await prisma.feeCategory.findFirst({ where: { name: "Tuition Fee" } });
  if (!feeCategory) { console.error("❌ No Tuition Fee category. Run seed-dummy-full.ts first."); process.exit(1); }

  const upperGradeNames = ["VI", "VII", "VIII", "IX", "X"];
  const allGradeNames   = ["Nursery", "LKG", "UKG", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

  // ── 1. Create new teacher records & user accounts ────────
  console.log("\n📋 Creating new teachers...");
  for (const t of newTeachers) {
    await prisma.teacher.upsert({
      where: { id: t.id },
      update: {},
      create: { id: t.id, name: t.name, email: t.email, phone: t.phone },
    });
    await prisma.user.upsert({
      where: { email: t.email },
      update: {},
      create: { email: t.email, password: hashedPw, role: "TEACHER", teacherId: t.id, isActive: true },
    });
  }
  console.log(`  ✅ ${newTeachers.length} new teachers created`);

  // ── 2. Assign subject specialists + Section B class teachers ──
  console.log("\n📋 Assigning teachers to subjects and sections...");

  // Subject → teacher mapping for upper grades
  const subjectTeacherMap: Record<string, string> = {
    "English":       "teacher-sita-rai",
    "Mathematics":   "teacher-dinesh-kc",
    "Science":       "teacher-poonam-thapa",
    "Social Studies":"teacher-ashok-shrestha",
    "Computer":      "teacher-sarita-karki",
  };

  // Section B class teachers per grade
  const sectionBClassTeachers: Record<string, string> = {
    "VI":   "teacher-naresh-poudel",
    "VII":  "teacher-kamala-gurung",
    "VIII": "teacher-tilak-dahal",
    "IX":   "teacher-rekha-bhatt",
    "X":    "teacher-gopal-subedi",
  };

  for (const gradeName of upperGradeNames) {
    const grade = await prisma.grade.findFirst({
      where: { name: gradeName, academicYearId: activeYear.id },
      include: { sections: true, subjects: true },
    });
    if (!grade) continue;

    const sectionA = grade.sections.find(s => s.name === "A");
    const sectionB = grade.sections.find(s => s.name === "B");

    // Assign subject specialists to BOTH sections
    for (const subject of grade.subjects) {
      const teacherId = subjectTeacherMap[subject.name];
      if (!teacherId) continue;
      for (const section of [sectionA, sectionB].filter(Boolean) as typeof grade.sections) {
        try {
          await prisma.teacherAssignment.upsert({
            where: { teacherId_sectionId_subjectId: { teacherId, sectionId: section.id, subjectId: subject.id } },
            update: {},
            create: { teacherId, sectionId: section.id, subjectId: subject.id, isClassTeacher: false },
          });
        } catch (_) {}
      }
    }

    // Assign Section B class teacher
    if (sectionB) {
      const ctId = sectionBClassTeachers[gradeName];
      if (ctId) {
        // Check no existing class teacher for section B
        const existingCT = await prisma.teacherAssignment.findFirst({
          where: { sectionId: sectionB.id, isClassTeacher: true },
        });
        if (!existingCT) {
          await prisma.teacherAssignment.create({
            data: { teacherId: ctId, sectionId: sectionB.id, subjectId: null, isClassTeacher: true },
          });
          console.log(`  ✅ ${gradeName}-B class teacher: ${sectionBClassTeachers[gradeName]}`);
        }
      }
    }
  }

  // ── 3. Marks ─────────────────────────────────────────────
  console.log("\n📝 Seeding marks...");

  // Quality distribution per student index: creates realistic spread
  function studentQuality(studentIndex: number): "high" | "mid" | "low" {
    if (studentIndex % 5 === 0) return "high";   // 20% high achievers
    if (studentIndex % 5 === 4) return "low";    // 20% struggling
    return "mid";                                  // 60% average
  }

  let marksCount = 0;
  for (const gradeName of allGradeNames) {
    const grade = await prisma.grade.findFirst({
      where: { name: gradeName, academicYearId: activeYear.id },
      include: { sections: { include: { students: true } }, subjects: true },
    });
    if (!grade) continue;

    const firstTerm  = examTypes.find(e => e.name.includes("First"));
    const secondTerm = examTypes.find(e => e.name.includes("Second"));
    const finalTerm  = examTypes.find(e => e.name.includes("Final"));

    for (const section of grade.sections) {
      const students = section.students.sort((a, b) => (a.rollNo ?? 0) - (b.rollNo ?? 0));

      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const quality = studentQuality(i);

        for (const subject of grade.subjects) {
          // First Terminal — all students (some absent)
          if (firstTerm) {
            const absent = quality === "low" && i % 7 === 4; // ~3% absent
            await prisma.mark.upsert({
              where: { studentId_subjectId_examTypeId_academicYearId: {
                studentId: student.id, subjectId: subject.id,
                examTypeId: firstTerm.id, academicYearId: activeYear.id,
              }},
              update: {},
              create: {
                studentId: student.id, subjectId: subject.id,
                examTypeId: firstTerm.id, academicYearId: activeYear.id,
                theoryMarks: absent ? null : randMarks(subject.fullTheoryMarks, quality),
                practicalMarks: absent ? null : (subject.fullPracticalMarks > 0 ? randMarks(subject.fullPracticalMarks, quality) : 0),
                isAbsent: absent,
              },
            });
            marksCount++;
          }

          // Second Terminal — 85% of students (rest not yet entered)
          if (secondTerm && i % 6 !== 5) {
            const absent = quality === "low" && i % 9 === 3;
            await prisma.mark.upsert({
              where: { studentId_subjectId_examTypeId_academicYearId: {
                studentId: student.id, subjectId: subject.id,
                examTypeId: secondTerm.id, academicYearId: activeYear.id,
              }},
              update: {},
              create: {
                studentId: student.id, subjectId: subject.id,
                examTypeId: secondTerm.id, academicYearId: activeYear.id,
                theoryMarks: absent ? null : randMarks(subject.fullTheoryMarks, quality),
                practicalMarks: absent ? null : (subject.fullPracticalMarks > 0 ? randMarks(subject.fullPracticalMarks, quality) : 0),
                isAbsent: absent,
              },
            });
            marksCount++;
          }

          // Final — only 40% of students (exams not done yet for most)
          if (finalTerm && i % 3 === 0) {
            await prisma.mark.upsert({
              where: { studentId_subjectId_examTypeId_academicYearId: {
                studentId: student.id, subjectId: subject.id,
                examTypeId: finalTerm.id, academicYearId: activeYear.id,
              }},
              update: {},
              create: {
                studentId: student.id, subjectId: subject.id,
                examTypeId: finalTerm.id, academicYearId: activeYear.id,
                theoryMarks: randMarks(subject.fullTheoryMarks, quality),
                practicalMarks: subject.fullPracticalMarks > 0 ? randMarks(subject.fullPracticalMarks, quality) : 0,
                isAbsent: false,
              },
            });
            marksCount++;
          }
        }
      }
    }
    process.stdout.write(`  ✅ ${gradeName} marks done\n`);
  }
  console.log(`  Total marks records: ${marksCount}`);

  // ── 4. Fee Payments ───────────────────────────────────────
  console.log("\n💰 Seeding fee payments...");

  // Months paid per student index pattern:
  //   0,5   → fully paid Baisakh–Chaitra (12 months)
  //   1,6   → paid Baisakh–Mangsir (9 months, 3 arrears)
  //   2,7   → paid Baisakh–Ashadh (3 months, heavy arrears)
  //   3,8   → paid Baisakh–Chaitra + advance (paid extra)
  //   4,9   → paid nothing (full defaulter)

  function getMonthsToPay(studentIndex: number): { months: string[]; advance: number } {
    const pattern = studentIndex % 5;
    if (pattern === 0) return { months: NEPALI_MONTHS.slice(0, 12), advance: 0 };  // fully paid
    if (pattern === 1) return { months: NEPALI_MONTHS.slice(0, 9),  advance: 0 };  // 3 months due
    if (pattern === 2) return { months: NEPALI_MONTHS.slice(0, 3),  advance: 0 };  // heavy arrears
    if (pattern === 3) return { months: NEPALI_MONTHS.slice(0, 12), advance: 2 };  // advance paid
    return { months: [], advance: 0 };                                               // defaulter
  }

  let paymentCount = 0;
  for (const gradeName of allGradeNames) {
    const grade = await prisma.grade.findFirst({
      where: { name: gradeName, academicYearId: activeYear.id },
      include: { sections: { include: { students: true } }, feeStructures: true },
    });
    if (!grade) continue;

    const tuitionStructure = grade.feeStructures.find(f => f.feeCategoryId === feeCategory.id);
    if (!tuitionStructure) continue;
    const monthlyAmount = tuitionStructure.amount;

    for (const section of grade.sections) {
      const students = section.students.sort((a, b) => (a.rollNo ?? 0) - (b.rollNo ?? 0));

      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const { months, advance } = getMonthsToPay(i);

        // Check if already has payments
        const existing = await prisma.feePayment.count({
          where: { studentId: student.id, academicYearId: activeYear.id },
        });
        if (existing > 0) continue;

        for (let m = 0; m < months.length; m++) {
          const month = months[m];
          const monthIndex = NEPALI_MONTHS.indexOf(month);
          const payDay = rand(1, 25);
          const payDate = bsDateForMonth(monthIndex, payDay);

          await prisma.feePayment.create({
            data: {
              studentId: student.id,
              feeCategoryId: feeCategory.id,
              academicYearId: activeYear.id,
              amount: monthlyAmount,
              paidMonth: month,
              receiptNumber: nextReceipt(),
              paymentDate: payDate,
              paymentMethod: ["CASH", "BANK", "CASH", "ONLINE"][m % 4],
              remarks: null,
            },
          });
          paymentCount++;
        }

        // Advance months (next year months, stored as "Advance-Baisakh" etc.)
        for (let a = 0; a < advance; a++) {
          await prisma.feePayment.create({
            data: {
              studentId: student.id,
              feeCategoryId: feeCategory.id,
              academicYearId: activeYear.id,
              amount: monthlyAmount,
              paidMonth: `Advance-${NEPALI_MONTHS[a]}`,
              receiptNumber: nextReceipt(),
              paymentDate: todayBS,
              paymentMethod: "CASH",
              remarks: "Advance payment",
            },
          });
          paymentCount++;
        }
      }
    }
    process.stdout.write(`  ✅ ${gradeName} fees done\n`);
  }
  console.log(`  Total payment records: ${paymentCount}`);

  // ── 5. Attendance ─────────────────────────────────────────
  console.log("\n📅 Seeding attendance...");

  // We'll generate daily attendance for the past ~120 school days
  // School days: Mon–Fri, skip some for holidays
  // BS year 2082 started ~April 14 2025. We'll go Baisakh 1 through Falgun 30.

  // Generate school day BS dates for 2082 Baisakh–Falgun (~8 months, ~160 days, skip Sat/Sun)
  // We approximate: each BS month ~30 days, weekdays ~22 per month
  // Instead of real calendar, we'll just create date strings for weekdays in each month
  function generateSchoolDays(): string[] {
    const days: string[] = [];
    // Baisakh (1) through Falgun (11) = 11 months
    for (let month = 1; month <= 11; month++) {
      for (let day = 1; day <= 30; day++) {
        // Skip roughly Sat (every 7th day from day 5) — simple approximation
        const weekday = ((month - 1) * 30 + day) % 7;
        if (weekday === 0 || weekday === 6) continue; // skip "weekends"
        // Skip some holidays (Dashain = Ashwin/Kartik, Tihar = Kartik)
        if (month === 6 && day >= 15 && day <= 25) continue; // Dashain break ~Ashwin
        if (month === 7 && day >= 1  && day <= 10) continue;  // rest of Dashain
        if (month === 7 && day >= 20 && day <= 25) continue;  // Tihar
        days.push(`2082/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`);
      }
    }
    return days;
  }

  const schoolDays = generateSchoolDays();
  console.log(`  School days generated: ${schoolDays.length}`);

  // Attendance rate per student quality
  function isPresent(studentIndex: number, dayIndex: number): boolean {
    const quality = studentQuality(studentIndex);
    // High achievers: 95%+ attendance
    // Mid: 85%
    // Low: 72%
    const rate = quality === "high" ? 0.96 : quality === "mid" ? 0.87 : 0.72;
    // Use deterministic pseudo-random based on student+day
    const pseudo = Math.sin(studentIndex * 17 + dayIndex * 31) * 0.5 + 0.5;
    return pseudo < rate;
  }

  let dailyCount = 0;
  let summaryCount = 0;

  for (const gradeName of allGradeNames) {
    const grade = await prisma.grade.findFirst({
      where: { name: gradeName, academicYearId: activeYear.id },
      include: { sections: { include: { students: true } } },
    });
    if (!grade) continue;

    for (const section of grade.sections) {
      const students = section.students.sort((a, b) => (a.rollNo ?? 0) - (b.rollNo ?? 0));

      for (let i = 0; i < students.length; i++) {
        const student = students[i];

        // Check if daily attendance already exists
        const existingDaily = await prisma.dailyAttendance.count({
          where: { studentId: student.id, academicYearId: activeYear.id },
        });
        if (existingDaily > 0) continue;

        let presentCount = 0;

        // Create daily records in batches
        const records = schoolDays.map((date, dayIndex) => {
          const present = isPresent(i, dayIndex);
          if (present) presentCount++;
          return {
            studentId: student.id,
            date,
            status: present ? "PRESENT" as const : "ABSENT" as const,
            academicYearId: activeYear.id,
          };
        });

        // Insert daily records in chunks to avoid timeout
        for (let chunk = 0; chunk < records.length; chunk += 50) {
          await prisma.dailyAttendance.createMany({
            data: records.slice(chunk, chunk + 50),
            skipDuplicates: true,
          });
        }
        dailyCount += records.length;

        // Upsert attendance summary
        await prisma.attendance.upsert({
          where: { studentId_academicYearId: { studentId: student.id, academicYearId: activeYear.id } },
          update: {
            totalDays: schoolDays.length,
            presentDays: presentCount,
            absentDays: schoolDays.length - presentCount,
          },
          create: {
            studentId: student.id,
            academicYearId: activeYear.id,
            totalDays: schoolDays.length,
            presentDays: presentCount,
            absentDays: schoolDays.length - presentCount,
          },
        });
        summaryCount++;
      }
    }
    process.stdout.write(`  ✅ ${gradeName} attendance done\n`);
  }

  console.log(`  Daily records: ${dailyCount} | Summaries: ${summaryCount}`);

  // ── Summary ───────────────────────────────────────────────
  console.log(`
📊 Rich Data Seed Complete!
   New teachers    : ${newTeachers.length}
   Marks records   : ${marksCount}
   Fee payments    : ${paymentCount}
   Daily attendance: ${dailyCount}
   Attendance summ : ${summaryCount}
   School days     : ${schoolDays.length}

💡 Fee patterns seeded:
   Roll 1,6  → Fully paid (Baisakh–Chaitra)
   Roll 2,7  → 3 months due (paid Baisakh–Mangsir)
   Roll 3,8  → Heavy arrears (paid Baisakh–Ashadh only)
   Roll 4,9  → Advance paid (12 months + 2 advance)
   Roll 5,10 → Defaulter (nothing paid)

🎉 Done!
`);
}

main()
  .catch((e) => { console.error("❌ Seed error:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
