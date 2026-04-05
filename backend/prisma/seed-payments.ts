/**
 * seed-payments.ts
 * Seeds realistic fee payments across ALL grades.
 *
 * Payment patterns (per student):
 *   ~30% — paid all months up to current month (good students)
 *   ~30% — paid up to 2 months behind
 *   ~20% — paid up to 5 months behind
 *   ~10% — paid only first month
 *   ~10% — never paid (complete defaulter)
 *
 * Also seeds a few payments dated TODAY so "Today's Collection" shows data.
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

function getCurrentMonthIndex(): number {
  const parts = getTodayBS().split("/");
  return parts.length >= 2 ? parseInt(parts[1], 10) - 1 : 0;
}

async function main() {
  console.log("🌱 Seeding fee payments for all grades...\n");

  const today = getTodayBS();
  const currentMonthIdx = getCurrentMonthIndex();
  const currentMonthName = nepaliMonths[currentMonthIdx];
  console.log(`📅 Today: ${today} (${currentMonthName})\n`);

  const year = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!year) { console.error("❌ No active year. Run seed.ts first."); process.exit(1); }

  // Clear existing payments to avoid duplicates
  const deleted = await prisma.feePayment.deleteMany({ where: { academicYearId: year.id } });
  console.log(`🗑️  Cleared ${deleted.count} existing payments\n`);

  const grades = await prisma.grade.findMany({
    where: { academicYearId: year.id },
    include: {
      sections: {
        include: {
          students: {
            where: { isActive: true, status: "ACTIVE" },
            orderBy: { rollNo: "asc" },
          },
        },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  let receiptCounter = 0;
  let totalPayments = 0;
  let todayPayments = 0;

  for (const grade of grades) {
    const structures = await prisma.feeStructure.findMany({
      where: { gradeId: grade.id, academicYearId: year.id },
      include: { feeCategory: true, examType: true },
    });

    if (structures.length === 0) {
      console.log(`  ⚠️  ${grade.name}: No fee structure, skipping`);
      continue;
    }

    const monthlyStructures = structures.filter(s => s.frequency === "MONTHLY");
    const annualStructures = structures.filter(s => s.frequency === "ANNUAL" || s.frequency === "ONE_TIME");

    let gradeStudents = 0;
    let gradePayments = 0;

    for (const section of grade.sections) {
      for (let si = 0; si < section.students.length; si++) {
        const student = section.students[si];
        gradeStudents++;

        // Determine payment pattern based on student position
        const ratio = si / Math.max(section.students.length, 1);
        let paidUpToMonth: number;
        let paidAnnual: boolean;

        if (ratio < 0.3) {
          // Group 1: Fully paid up to current month
          paidUpToMonth = currentMonthIdx + 1;
          paidAnnual = true;
        } else if (ratio < 0.6) {
          // Group 2: 2 months behind
          paidUpToMonth = Math.max(0, currentMonthIdx - 1);
          paidAnnual = true;
        } else if (ratio < 0.8) {
          // Group 3: 5 months behind
          paidUpToMonth = Math.max(0, currentMonthIdx - 4);
          paidAnnual = false;
        } else if (ratio < 0.9) {
          // Group 4: Only first month
          paidUpToMonth = 1;
          paidAnnual = false;
        } else {
          // Group 5: Never paid
          paidUpToMonth = 0;
          paidAnnual = false;
        }

        // Create monthly payments
        for (let m = 0; m < paidUpToMonth; m++) {
          receiptCounter++;
          const receiptNumber = `RCP-${String(receiptCounter).padStart(5, "0")}`;
          const paymentDate = `${year.yearBS}/${String(m + 1).padStart(2, "0")}/05`;

          for (const s of monthlyStructures) {
            await prisma.feePayment.create({
              data: {
                studentId: student.id,
                feeCategoryId: s.feeCategoryId,
                academicYearId: year.id,
                amount: s.amount,
                paidMonth: nepaliMonths[m],
                receiptNumber,
                paymentDate,
                paymentMethod: m % 3 === 0 ? "BANK" : "CASH",
              },
            });
            totalPayments++;
            gradePayments++;
          }
        }

        // Create annual/one-time payments
        if (paidAnnual && annualStructures.length > 0) {
          receiptCounter++;
          const receiptNumber = `RCP-${String(receiptCounter).padStart(5, "0")}`;
          for (const s of annualStructures) {
            await prisma.feePayment.create({
              data: {
                studentId: student.id,
                feeCategoryId: s.feeCategoryId,
                academicYearId: year.id,
                amount: s.amount,
                receiptNumber,
                paymentDate: `${year.yearBS}/01/05`,
                paymentMethod: "CASH",
              },
            });
            totalPayments++;
            gradePayments++;
          }
        }
      }
    }

    console.log(`✅ ${grade.name}: ${gradeStudents} students, ${gradePayments} payments`);
  }

  // ─── Seed a few payments dated TODAY for "Today's Collection" ───
  const unpaidStudents = await prisma.student.findMany({
    where: {
      isActive: true,
      status: "ACTIVE",
      section: { grade: { academicYearId: year.id } },
    },
    include: { section: { include: { grade: true } } },
    take: 50,
  });

  let todayCount = 0;
  for (const student of unpaidStudents) {
    const gradeStructures = await prisma.feeStructure.findMany({
      where: { gradeId: student.section.gradeId, academicYearId: year.id, frequency: "MONTHLY" },
      include: { feeCategory: true },
    });

    if (gradeStructures.length === 0) continue;

    // Check if already paid this month
    const existing = await prisma.feePayment.findFirst({
      where: {
        studentId: student.id,
        academicYearId: year.id,
        paidMonth: currentMonthName,
      },
    });
    if (existing) continue;

    receiptCounter++;
    const receiptNumber = `RCP-${String(receiptCounter).padStart(5, "0")}`;

    for (const s of gradeStructures) {
      await prisma.feePayment.create({
        data: {
          studentId: student.id,
          feeCategoryId: s.feeCategoryId,
          academicYearId: year.id,
          amount: s.amount,
          paidMonth: currentMonthName,
          receiptNumber,
          paymentDate: today,
          paymentMethod: "CASH",
        },
      });
      totalPayments++;
      todayPayments++;
    }
    todayCount++;
    if (todayCount >= 5) break;
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Total payments: ${totalPayments}`);
  console.log(`   Total receipts: ${receiptCounter}`);
  console.log(`   Today's payments: ${todayPayments} (${todayCount} students)`);
  console.log(`   Current month: ${currentMonthName}`);
  console.log(`\n💰 Payment distribution per grade:`);
  console.log(`   ~30% students: Paid up to ${currentMonthName}`);
  console.log(`   ~30% students: 2 months behind`);
  console.log(`   ~20% students: 5 months behind`);
  console.log(`   ~10% students: Only Baisakh`);
  console.log(`   ~10% students: Never paid`);
  console.log(`\n🎉 Payment seed complete!`);
}

main()
  .catch(e => { console.error("❌ Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
