import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...\n");

  // ─── School ───────────────────────────────────────
  const school = await prisma.school.upsert({
    where: { id: "default-school" },
    update: {},
    create: {
      id: "default-school",
      name: "Shree Himalayan Secondary School",
      nameNp: "श्री हिमालयन माध्यमिक विद्यालय",
      address: "Kathmandu, Nepal",
      phone: "01-4XXXXXX",
      estdYear: "2045",
      motto: "शिक्षा नै शक्ति हो",
    },
  });
  console.log(`✅ School: ${school.name}`);

  // ─── Academic Year ────────────────────────────────
  const academicYear = await prisma.academicYear.upsert({
    where: { yearBS: "2081" },
    update: {},
    create: {
      yearBS: "2081",
      startDate: "2081/01/01",
      endDate: "2081/12/30",
      isActive: true,
    },
  });
  console.log(`✅ Academic Year: ${academicYear.yearBS} B.S.`);

  // ─── Grades (Nursery to X) ────────────────────────
  const gradeNames = [
    "Nursery", "LKG", "UKG",
    "I", "II", "III", "IV", "V",
    "VI", "VII", "VIII", "IX", "X",
  ];

  const grades: Record<string, string> = {};
  for (let i = 0; i < gradeNames.length; i++) {
    const grade = await prisma.grade.upsert({
      where: { name_academicYearId: { name: gradeNames[i], academicYearId: academicYear.id } },
      update: {},
      create: {
        name: gradeNames[i],
        displayOrder: i,
        academicYearId: academicYear.id,
      },
    });
    grades[gradeNames[i]] = grade.id;
  }
  console.log(`✅ Grades: ${gradeNames.join(", ")}`);

  // ─── Sections for each grade ──────────────────────
  for (const gradeName of gradeNames) {
    for (const sectionName of ["A", "B"]) {
      await prisma.section.upsert({
        where: { name_gradeId: { name: sectionName, gradeId: grades[gradeName] } },
        update: {},
        create: {
          name: sectionName,
          gradeId: grades[gradeName],
        },
      });
    }
  }
  console.log(`✅ Sections: A, B for each grade`);

  // ─── Exam Types ───────────────────────────────────
  const examTypes = [
    { name: "First Terminal", displayOrder: 1, paperSize: "A5" },
    { name: "Second Terminal", displayOrder: 2, paperSize: "A5" },
    { name: "Final", displayOrder: 3, paperSize: "A4" },
  ];

  const examTypeIds: Record<string, string> = {};
  for (const et of examTypes) {
    const examType = await prisma.examType.upsert({
      where: { name_academicYearId: { name: et.name, academicYearId: academicYear.id } },
      update: {},
      create: {
        name: et.name,
        displayOrder: et.displayOrder,
        paperSize: et.paperSize,
        academicYearId: academicYear.id,
      },
    });
    examTypeIds[et.name] = examType.id;
  }
  console.log(`✅ Exam Types: ${examTypes.map((e) => `${e.name} (${e.paperSize})`).join(", ")}`);

  // ─── Subjects for Class VIII (sample) ─────────────
  const class8Subjects = [
    { name: "English", nameNp: "अंग्रेजी", fullTheory: 75, fullPractical: 25, passMarks: 40, order: 1 },
    { name: "Nepali", nameNp: "नेपाली", fullTheory: 75, fullPractical: 25, passMarks: 40, order: 2 },
    { name: "Mathematics", nameNp: "गणित", fullTheory: 100, fullPractical: 0, passMarks: 40, order: 3 },
    { name: "Science", nameNp: "विज्ञान", fullTheory: 75, fullPractical: 25, passMarks: 40, order: 4 },
    { name: "Social Studies", nameNp: "सामाजिक अध्ययन", fullTheory: 100, fullPractical: 0, passMarks: 40, order: 5 },
    { name: "Opt. Math", nameNp: "ऐच्छिक गणित", fullTheory: 100, fullPractical: 0, passMarks: 40, order: 6, optional: true },
    { name: "Computer", nameNp: "कम्प्युटर", fullTheory: 50, fullPractical: 50, passMarks: 40, order: 7 },
    { name: "HPE", nameNp: "स्वास्थ्य तथा शारीरिक शिक्षा", fullTheory: 75, fullPractical: 25, passMarks: 30, order: 8 },
  ];

  for (const sub of class8Subjects) {
    await prisma.subject.upsert({
      where: { name_gradeId: { name: sub.name, gradeId: grades["VIII"] } },
      update: {},
      create: {
        name: sub.name,
        nameNp: sub.nameNp,
        fullTheoryMarks: sub.fullTheory,
        fullPracticalMarks: sub.fullPractical,
        passMarks: sub.passMarks,
        isOptional: sub.optional || false,
        displayOrder: sub.order,
        gradeId: grades["VIII"],
      },
    });
  }
  console.log(`✅ Subjects for Class VIII: ${class8Subjects.length} subjects`);

  // ─── Default Grading Policy (20/30/50) for Class VIII ─
  const weightages = [
    { examName: "First Terminal", weightage: 20 },
    { examName: "Second Terminal", weightage: 30 },
    { examName: "Final", weightage: 50 },
  ];

  for (const w of weightages) {
    await prisma.gradingPolicy.upsert({
      where: { examTypeId_gradeId: { examTypeId: examTypeIds[w.examName], gradeId: grades["VIII"] } },
      update: {},
      create: {
        examTypeId: examTypeIds[w.examName],
        gradeId: grades["VIII"],
        weightagePercent: w.weightage,
      },
    });
  }
  console.log(`✅ Grading Policy for Class VIII: 20% / 30% / 50%`);

  // ─── Admin User ───────────────────────────────────
  const hashedPassword = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@school.edu.np" },
    update: {},
    create: {
      email: "admin@school.edu.np",
      password: hashedPassword,
      role: "ADMIN",
    },
  });
  console.log(`✅ Admin user: admin@school.edu.np / admin123`);

  console.log("\n🎉 Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
