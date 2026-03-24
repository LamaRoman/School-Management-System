// Run: npx tsx prisma/seed-payments.ts
// Seeds realistic fee payment data for Class IX Section A
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const nepaliMonths = ["Baisakh","Jestha","Ashadh","Shrawan","Bhadra","Ashwin","Kartik","Mangsir","Poush","Magh","Falgun","Chaitra"];

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function main() {
  console.log("🌱 Seeding fee payments...\n");

  const year = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!year) { console.log("❌ No active year"); return; }

  const grade = await prisma.grade.findFirst({
    where: { name: { contains: "IX" }, academicYearId: year.id },
    include: { sections: true },
  });
  if (!grade) { console.log("❌ Class IX not found"); return; }

  const section = grade.sections.find((s) => s.name === "A");
  if (!section) { console.log("❌ Section A not found"); return; }

  const students = await prisma.student.findMany({
    where: { sectionId: section.id, isActive: true },
    orderBy: { rollNo: "asc" },
  });

  const structures = await prisma.feeStructure.findMany({
    where: { gradeId: grade.id, academicYearId: year.id },
    include: { feeCategory: true, examType: true },
  });

  if (structures.length === 0) { console.log("❌ No fee structure for Class IX"); return; }

  console.log(`✅ Year: ${year.yearBS}, Grade: ${grade.name}, Students: ${students.length}`);
  console.log(`✅ Fee categories: ${structures.map((s) => `${s.feeCategory.name} (${s.frequency}${s.examType ? ' - ' + s.examType.name : ''})`).join(", ")}`);

  const monthlyStructures = structures.filter((s) => s.frequency === "MONTHLY");
  const annualStructures = structures.filter((s) => s.frequency === "ANNUAL" || s.frequency === "ONE_TIME");
  const examStructures = structures.filter((s) => s.frequency === "PER_EXAM");

  // Delete existing payments
  await prisma.feePayment.deleteMany({ where: { academicYearId: year.id } });
  console.log("🗑️  Cleared existing payments\n");

  let receiptCounter = 0;
  let totalPayments = 0;

  for (let si = 0; si < students.length; si++) {
    const student = students[si];

    // Different payment patterns:
    // Group 1 (30%): Fully paid up to Magh (month 10) — good students
    // Group 2 (30%): Paid up to Mangsir (month 8) — 2 months behind
    // Group 3 (20%): Paid up to Bhadra (month 5) — 5 months behind
    // Group 4 (10%): Paid only Baisakh (month 1) — big defaulter
    // Group 5 (10%): Never paid — complete defaulter

    let paidUpToMonth: number;
    let paidAnnual: boolean;
    let paidExams: string[];

    const roll = si / students.length;
    if (roll < 0.3) {
      paidUpToMonth = 10; // Up to Magh
      paidAnnual = true;
      paidExams = ["First Terminal", "Second Terminal"];
    } else if (roll < 0.6) {
      paidUpToMonth = 8; // Up to Mangsir
      paidAnnual = true;
      paidExams = ["First Terminal"];
    } else if (roll < 0.8) {
      paidUpToMonth = 5; // Up to Bhadra
      paidAnnual = false;
      paidExams = ["First Terminal"];
    } else if (roll < 0.9) {
      paidUpToMonth = 1; // Only Baisakh
      paidAnnual = false;
      paidExams = [];
    } else {
      paidUpToMonth = 0; // Never paid
      paidAnnual = false;
      paidExams = [];
    }

    // Pay monthly fees
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
      }
    }

    // Pay annual/one-time fees
    if (paidAnnual) {
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
      }
    }

    // Pay exam fees
    for (const examName of paidExams) {
      const examStructure = examStructures.find((s) => s.examType?.name === examName);
      if (examStructure) {
        receiptCounter++;
        const receiptNumber = `RCP-${String(receiptCounter).padStart(5, "0")}`;
        await prisma.feePayment.create({
          data: {
            studentId: student.id,
            feeCategoryId: examStructure.feeCategoryId,
            academicYearId: year.id,
            amount: examStructure.amount,
            receiptNumber,
            paymentDate: `${year.yearBS}/05/10`,
            paymentMethod: "CASH",
          },
        });
        totalPayments++;
      }
    }

    const status = paidUpToMonth === 0 ? "❌ Never paid" : paidUpToMonth >= 10 ? "✅ Up to date" : `⚠️  Paid up to ${nepaliMonths[paidUpToMonth - 1]}`;
    console.log(`  ${student.name} — ${status}`);
  }

  console.log(`\n✅ Seed complete! ${totalPayments} payment records, ${receiptCounter} receipts`);
  console.log("\n📊 Payment distribution:");
  console.log("   ~30% students: Fully paid up to Magh (current month)");
  console.log("   ~30% students: Paid up to Mangsir (2 months behind)");
  console.log("   ~20% students: Paid up to Bhadra (5 months behind)");
  console.log("   ~10% students: Paid only Baisakh (9 months behind)");
  console.log("   ~10% students: Never paid (complete defaulter)");
}

main()
  .catch((e) => { console.error("❌ Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());