// Run: npx tsx prisma/seed-test-data.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  console.log("🌱 Seeding test data for Class IX, Year 2082...\n");

  // 1. Find active year (2082)
  const year = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!year) { console.log("❌ No active academic year"); return; }
  console.log(`✅ Active year: ${year.yearBS}`);

  // 2. Find Class IX
  const grade = await prisma.grade.findFirst({
    where: { name: { contains: "IX" }, academicYearId: year.id },
    include: { sections: true },
  });
  if (!grade) { console.log("❌ Class IX not found for year " + year.yearBS); return; }
  console.log(`✅ Grade: ${grade.name}`);

  const section = grade.sections.find((s) => s.name === "A");
  if (!section) { console.log("❌ Section A not found"); return; }
  console.log(`✅ Section: ${section.name}`);

  // 3. Get exam types
  const examTypes = await prisma.examType.findMany({
    where: { academicYearId: year.id },
    orderBy: { displayOrder: "asc" },
  });
  if (examTypes.length === 0) {
    console.log("❌ No exam types found. Creating...");
    const etData = [
      { name: "First Terminal", displayOrder: 1, paperSize: "A5" },
      { name: "Second Terminal", displayOrder: 2, paperSize: "A5" },
      { name: "Final", displayOrder: 3, paperSize: "A4" },
    ];
    for (const et of etData) {
      await prisma.examType.create({
        data: { name: et.name, displayOrder: et.displayOrder, paperSize: et.paperSize, academicYearId: year.id },
      });
    }
    console.log("✅ Exam types created");
  }
  const allExamTypes = await prisma.examType.findMany({ where: { academicYearId: year.id }, orderBy: { displayOrder: "asc" } });
  console.log(`✅ Exam types: ${allExamTypes.map((e) => e.name).join(", ")}`);

  // 4. Create subjects for Class IX if they don't exist
  let subjects = await prisma.subject.findMany({ where: { gradeId: grade.id }, orderBy: { displayOrder: "asc" } });

  if (subjects.length === 0) {
    console.log("⚠️  No subjects for Class IX. Creating...");
    const subjectData = [
      { name: "English", nameNp: "अंग्रेजी", fullTheory: 75, fullPractical: 25, passMarks: 40, order: 1 },
      { name: "Nepali", nameNp: "नेपाली", fullTheory: 75, fullPractical: 25, passMarks: 40, order: 2 },
      { name: "Mathematics", nameNp: "गणित", fullTheory: 100, fullPractical: 0, passMarks: 40, order: 3 },
      { name: "Science", nameNp: "विज्ञान", fullTheory: 75, fullPractical: 25, passMarks: 40, order: 4 },
      { name: "Social Studies", nameNp: "सामाजिक अध्ययन", fullTheory: 100, fullPractical: 0, passMarks: 40, order: 5 },
      { name: "Opt. Math", nameNp: "ऐच्छिक गणित", fullTheory: 100, fullPractical: 0, passMarks: 40, order: 6, optional: true },
      { name: "Computer", nameNp: "कम्प्युटर", fullTheory: 50, fullPractical: 50, passMarks: 40, order: 7 },
      { name: "HPE", nameNp: "स्वास्थ्य तथा शारीरिक शिक्षा", fullTheory: 75, fullPractical: 25, passMarks: 30, order: 8 },
    ];
    for (const sub of subjectData) {
      await prisma.subject.create({
        data: {
          name: sub.name, nameNp: sub.nameNp,
          fullTheoryMarks: sub.fullTheory, fullPracticalMarks: sub.fullPractical,
          passMarks: sub.passMarks, isOptional: sub.optional || false,
          displayOrder: sub.order, gradeId: grade.id,
        },
      });
    }
    subjects = await prisma.subject.findMany({ where: { gradeId: grade.id }, orderBy: { displayOrder: "asc" } });
    console.log(`✅ Subjects created: ${subjects.length}`);
  }
  console.log(`✅ Subjects: ${subjects.map((s) => s.name).join(", ")}`);

  // 5. Create grading policy if not exists
  const policies = await prisma.gradingPolicy.findMany({ where: { gradeId: grade.id } });
  if (policies.length === 0) {
    console.log("⚠️  No grading policy. Creating 20/30/50...");
    const weightages = [
      { examName: "First Terminal", weightage: 20 },
      { examName: "Second Terminal", weightage: 30 },
      { examName: "Final", weightage: 50 },
    ];
    for (const w of weightages) {
      const et = allExamTypes.find((e) => e.name === w.examName);
      if (et) {
        await prisma.gradingPolicy.create({
          data: { examTypeId: et.id, gradeId: grade.id, weightagePercent: w.weightage },
        });
      }
    }
    console.log("✅ Grading policy: 20/30/50");
  }

  // 6. Get students
  const students = await prisma.student.findMany({
    where: { sectionId: section.id, isActive: true },
    orderBy: { rollNo: "asc" },
  });
  console.log(`✅ Students: ${students.length}`);

  if (students.length === 0) { console.log("❌ No students in Class IX Section A"); return; }

  // ─── EXAM ROUTINES ────────────────────────────────
  // First Terminal: Bhadra 2082 (month 5) - PAST
  // Second Terminal: Mangsir 2082 (month 8) - PAST
  // Final: Chaitra 2082 (month 12) - FUTURE (hasn't happened)

  const routineConfig = [
    { examName: "First Terminal", monthNum: "05", monthName: "Bhadra" },
    { examName: "Second Terminal", monthNum: "08", monthName: "Mangsir" },
    { examName: "Final", monthNum: "12", monthName: "Chaitra" },
  ];

  for (const cfg of routineConfig) {
    const examType = allExamTypes.find((e) => e.name === cfg.examName);
    if (!examType) continue;

    await prisma.examRoutine.deleteMany({ where: { examTypeId: examType.id, gradeId: grade.id } });

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    for (let i = 0; i < subjects.length; i++) {
      await prisma.examRoutine.create({
        data: {
          examTypeId: examType.id, gradeId: grade.id, subjectId: subjects[i].id,
          examDate: `${year.yearBS}/${cfg.monthNum}/${String(i * 2 + 1).padStart(2, "0")}`,
          dayName: days[i % 7],
          startTime: "11:00 AM", endTime: "2:00 PM",
        },
      });
    }
    console.log(`📅 Exam routine: ${cfg.examName} — ${cfg.monthName} ${year.yearBS} (${subjects.length} subjects)`);
  }

  // ─── MARKS ────────────────────────────────────────
  // First Terminal + Second Terminal: filled with marks
  // Final: NO marks (exam hasn't happened)

  const pastExams = allExamTypes.filter((e) => e.name !== "Final");

  for (const examType of pastExams) {
    await prisma.mark.deleteMany({ where: { examTypeId: examType.id, academicYearId: year.id } });

    for (const student of students) {
      for (const subject of subjects) {
        const theoryMax = subject.fullTheoryMarks;
        const pracMax = subject.fullPracticalMarks;
        const theoryMarks = Math.min(rand(Math.floor(theoryMax * 0.35), Math.floor(theoryMax * 0.95)), theoryMax);
        const practicalMarks = pracMax > 0 ? Math.min(rand(Math.floor(pracMax * 0.5), Math.floor(pracMax * 0.95)), pracMax) : 0;

        await prisma.mark.create({
          data: {
            studentId: student.id, subjectId: subject.id, examTypeId: examType.id,
            academicYearId: year.id, theoryMarks, practicalMarks,
          },
        });
      }
    }
    console.log(`📝 Marks: ${examType.name} — ${students.length} students × ${subjects.length} subjects`);
  }

  // ─── ATTENDANCE ───────────────────────────────────
  for (const student of students) {
    const totalDays = 200;
    const absentDays = rand(2, 20);
    await prisma.attendance.upsert({
      where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
      update: { totalDays, presentDays: totalDays - absentDays, absentDays },
      create: { studentId: student.id, academicYearId: year.id, totalDays, presentDays: totalDays - absentDays, absentDays },
    });
  }
  console.log(`📋 Attendance: ${students.length} students`);

  // ─── SUMMARY ──────────────────────────────────────
  console.log("\n✅ Seed complete!");
  console.log("\n📊 What was created:");
  console.log(`   Subjects: ${subjects.length} for Class IX`);
  console.log(`   Grading Policy: 20/30/50`);
  console.log(`   Exam Routines: First Terminal (Bhadra/PAST), Second Terminal (Mangsir/PAST), Final (Chaitra/FUTURE)`);
  console.log(`   Marks: First Terminal + Second Terminal filled, Final empty`);
  console.log(`   Attendance: ${students.length} students, 200 working days`);
  console.log("\n🧪 Test scenario:");
  console.log("   Current month: Magh (month 10)");
  console.log("   First Terminal exam fee → should show (Bhadra already passed)");
  console.log("   Second Terminal exam fee → should show (Mangsir already passed)");
  console.log("   Final exam fee → should NOT show (Chaitra hasn't come yet)");
}

main()
  .catch((e) => { console.error("❌ Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());