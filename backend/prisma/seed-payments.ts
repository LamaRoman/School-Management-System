/**
 * seed-payments.ts — Minimal payment seed
 * Seeds fee payments for 5 students per grade (varied payment patterns).
 * Also seeds 3 payments dated TODAY for "Today's Collection".
 *
 * Run: DATABASE_URL="..." npx tsx prisma/seed-payments.ts
 */
import { PrismaClient } from "@prisma/client";
import NepaliDate from "nepali-date-converter";

const prisma = new PrismaClient();

const nepaliMonths = [
  "Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
];

function getTodayBS(): string {
  return new NepaliDate().format("YYYY/MM/DD");
}

async function main() {
  const today = getTodayBS();
  const currentMonthIdx = parseInt(today.split("/")[1], 10) - 1;
  const currentMonth = nepaliMonths[currentMonthIdx];
  console.log("🌱 Seeding minimal fee payments...");
  console.log(`📅 Today: ${today} (${currentMonth})\n`);

  const year = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!year) { console.error("❌ No active year"); process.exit(1); }

  await prisma.feePayment.deleteMany({ where: { academicYearId: year.id } });
  console.log("🗑️  Cleared existing payments\n");

  const grades = await prisma.grade.findMany({
    where: { academicYearId: year.id },
    include: {
      sections: {
        include: {
          students: {
            where: { isActive: true, status: "ACTIVE" },
            orderBy: { rollNo: "asc" },
            take: 5,
          },
        },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  let rcpt = 0;
  let total = 0;

  // Payment patterns for 5 students:
  // [0] fully paid, [1] 2 months behind, [2] 4 months behind, [3] only Baisakh, [4] never paid
  const paidUpTo = (idx: number) => {
    if (idx === 0) return currentMonthIdx + 1;
    if (idx === 1) return Math.max(0, currentMonthIdx - 1);
    if (idx === 2) return Math.max(0, currentMonthIdx - 3);
    if (idx === 3) return 1;
    return 0;
  };

  for (const grade of grades) {
    const structures = await prisma.feeStructure.findMany({
      where: { gradeId: grade.id, academicYearId: year.id },
      include: { feeCategory: true },
    });
    if (structures.length === 0) continue;

    const monthly = structures.filter(s => s.frequency === "MONTHLY");
    const annual = structures.filter(s => s.frequency === "ANNUAL" || s.frequency === "ONE_TIME");
    let count = 0;

    for (const section of grade.sections) {
      for (let i = 0; i < section.students.length; i++) {
        const student = section.students[i];
        const months = paidUpTo(i);

        // Monthly payments
        for (let m = 0; m < months; m++) {
          rcpt++;
          const rn = `RCP-${String(rcpt).padStart(5, "0")}`;
          for (const s of monthly) {
            await prisma.feePayment.create({
              data: {
                studentId: student.id, feeCategoryId: s.feeCategoryId,
                academicYearId: year.id, amount: s.amount,
                paidMonth: nepaliMonths[m], receiptNumber: rn,
                paymentDate: `${year.yearBS}/${String(m + 1).padStart(2, "0")}/05`,
                paymentMethod: m % 2 === 0 ? "CASH" : "BANK",
              },
            });
            total++;
          }
        }

        // Annual fees for students who paid > 3 months
        if (months > 3 && annual.length > 0) {
          rcpt++;
          const rn = `RCP-${String(rcpt).padStart(5, "0")}`;
          for (const s of annual) {
            await prisma.feePayment.create({
              data: {
                studentId: student.id, feeCategoryId: s.feeCategoryId,
                academicYearId: year.id, amount: s.amount,
                receiptNumber: rn, paymentDate: `${year.yearBS}/01/05`,
                paymentMethod: "CASH",
              },
            });
            total++;
          }
        }
        count++;
      }
    }
    console.log(`✅ ${grade.name}: ${count} students seeded`);
  }

  // 3 payments dated TODAY
  const unpaid = await prisma.student.findMany({
    where: {
      isActive: true, status: "ACTIVE",
      section: { grade: { academicYearId: year.id } },
      feePayments: { none: { paidMonth: currentMonth, academicYearId: year.id } },
    },
    include: { section: { include: { grade: true } } },
    take: 3,
  });

  for (const student of unpaid) {
    const monthly = await prisma.feeStructure.findMany({
      where: { gradeId: student.section.gradeId, academicYearId: year.id, frequency: "MONTHLY" },
    });
    if (monthly.length === 0) continue;
    rcpt++;
    const rn = `RCP-${String(rcpt).padStart(5, "0")}`;
    for (const s of monthly) {
      await prisma.feePayment.create({
        data: {
          studentId: student.id, feeCategoryId: s.feeCategoryId,
          academicYearId: year.id, amount: s.amount,
          paidMonth: currentMonth, receiptNumber: rn,
          paymentDate: today, paymentMethod: "CASH",
        },
      });
      total++;
    }
  }

  console.log(`\n🎉 Done! ${total} payments, ${rcpt} receipts, ${unpaid.length} today's collections`);
}

main()
  .catch(e => { console.error("❌", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
