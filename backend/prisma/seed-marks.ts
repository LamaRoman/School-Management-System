/**
 * Seed ONLY marks for existing students in production.
 * Uses existing students, subjects, exam types, and academic year.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randMarks(full: number, quality: "high" | "mid" | "low"): number {
  const pass = Math.ceil(full * 0.4);
  if (quality === "high") return rand(Math.ceil(full * 0.75), full);
  if (quality === "mid") return rand(pass, Math.ceil(full * 0.74));
  return rand(Math.ceil(full * 0.2), pass - 1);
}

function studentQuality(i: number): "high" | "mid" | "low" {
  if (i % 5 === 0) return "high";
  if (i % 5 === 4) return "low";
  return "mid";
}

async function main() {
  console.log("📝 Seeding marks for existing students...\n");

  // Get the active academic year
  const year = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!year) { console.error("❌ No active academic year found"); return; }
  console.log(`Academic year: ${year.yearBs} (${year.id})`);

  // Get exam types
  const examTypes = await prisma.examType.findMany({ where: { academicYearId: year.id } });
  const firstTerm = examTypes.find(e => e.name.includes("First"));
  const secondTerm = examTypes.find(e => e.name.includes("Second"));
  const finalTerm = examTypes.find(e => e.name === "Final");
  console.log(`Exam types: ${examTypes.map(e => e.name).join(", ")}`);

  if (!firstTerm && !secondTerm && !finalTerm) {
    console.error("❌ No exam types found");
    return;
  }

  // Get all grades with sections and students
  const grades = await prisma.grade.findMany({
    where: { academicYearId: year.id },
    include: {
      sections: {
        include: {
          students: { where: { isActive: true }, orderBy: { rollNo: "asc" } },
        },
      },
      subjects: true,
    },
  });

  let marksCount = 0;
  let skipped = 0;

  for (const grade of grades) {
    const subjects = grade.subjects;
    if (subjects.length === 0) {
      console.log(`  ${grade.name}: no subjects, skipping`);
      continue;
    }

    for (const section of grade.sections) {
      for (let i = 0; i < section.students.length; i++) {
        const student = section.students[i];
        const q = studentQuality(i);

        for (const sub of subjects) {
          // First Terminal — all students
          if (firstTerm) {
            const absent = q === "low" && i % 7 === 4;
            try {
              await prisma.mark.upsert({
                where: { studentId_subjectId_examTypeId_academicYearId: { studentId: student.id, subjectId: sub.id, examTypeId: firstTerm.id, academicYearId: year.id } },
                update: {},
                create: { studentId: student.id, subjectId: sub.id, examTypeId: firstTerm.id, academicYearId: year.id, theoryMarks: absent ? null : randMarks(sub.fullTheoryMarks, q), practicalMarks: absent ? null : (sub.fullPracticalMarks > 0 ? randMarks(sub.fullPracticalMarks, q) : 0), isAbsent: absent },
              });
              marksCount++;
            } catch { skipped++; }
          }

          // Second Terminal — 85% of students
          if (secondTerm && i % 6 !== 5) {
            const absent = q === "low" && i % 9 === 3;
            try {
              await prisma.mark.upsert({
                where: { studentId_subjectId_examTypeId_academicYearId: { studentId: student.id, subjectId: sub.id, examTypeId: secondTerm.id, academicYearId: year.id } },
                update: {},
                create: { studentId: student.id, subjectId: sub.id, examTypeId: secondTerm.id, academicYearId: year.id, theoryMarks: absent ? null : randMarks(sub.fullTheoryMarks, q), practicalMarks: absent ? null : (sub.fullPracticalMarks > 0 ? randMarks(sub.fullPracticalMarks, q) : 0), isAbsent: absent },
              });
              marksCount++;
            } catch { skipped++; }
          }

          // Final — 40% of students
          if (finalTerm && i % 3 === 0) {
            try {
              await prisma.mark.upsert({
                where: { studentId_subjectId_examTypeId_academicYearId: { studentId: student.id, subjectId: sub.id, examTypeId: finalTerm.id, academicYearId: year.id } },
                update: {},
                create: { studentId: student.id, subjectId: sub.id, examTypeId: finalTerm.id, academicYearId: year.id, theoryMarks: randMarks(sub.fullTheoryMarks, q), practicalMarks: sub.fullPracticalMarks > 0 ? randMarks(sub.fullPracticalMarks, q) : 0, isAbsent: false },
              });
              marksCount++;
            } catch { skipped++; }
          }
        }
      }
    }
    console.log(`  ${grade.name} ✓ (${grade.sections.reduce((s, sec) => s + sec.students.length, 0)} students × ${subjects.length} subjects)`);
  }

  console.log(`\n✅ Done! ${marksCount} marks created, ${skipped} skipped (duplicates)`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
