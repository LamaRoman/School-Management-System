/**
 * seed-credit-grade-demo.ts — standalone demo data for the credit-hour /
 * grade-point report card (ReportCardSettings.gradingStyle = CREDIT_GRADE_BASED).
 *
 * Deliberately separate from seed-all.ts / seed-dev.ts — doesn't touch or
 * depend on either. Adopts the existing school if one is present (from a
 * prior seed-all.ts run), otherwise creates a "Demo School".
 *
 * gradingStyle is a school-wide setting (not per grade), so this switches the
 * WHOLE adopted school to the credit-grade design — every grade's report card
 * renders through that template after this runs, not just Grade "X".
 *
 * Creates, all under a freshly-activated "current" BS academic year:
 *   - Grade "X"
 *   - Section "A"
 *   - 7 subjects matching the Asian Public School sample report
 *     (75 theory / 25 practical / credit hour 4 each)
 *   - 1 class teacher (login included)
 *   - 1 student, roll no. 22 (login included), with a parent account linked
 *   - "First Terminal Examination" with marks for all 7 subjects, spanning
 *     a range of grades (A+ down to D) so the report is worth looking at
 *   - an attendance record (56/60, same shape as the sample report)
 *
 * Idempotent — safe to re-run; upserts everything by its natural unique key.
 * Does NOT deactivate or touch any other school's data, and only changes
 * isActive on academic years belonging to THIS school.
 *
 * Run: npx tsx prisma/seed-credit-grade-demo.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import NepaliDate from "nepali-date-converter";

const prisma = new PrismaClient();
const pw = async (p: string) => bcrypt.hash(p, 10);

async function main() {
  // ── School ──
  // Deliberately NOT "adopt whatever findFirst() returns" — if your DB has
  // more than one School row (e.g. from an earlier seed-all.ts run plus
  // other test data), findFirst() picks an arbitrary one, which may not be
  // the school your admin login actually belongs to, and the seeded data
  // would then be invisible in your UI (every list here is scoped by your
  // logged-in schoolId).
  //
  // Pass the email of the admin account you actually log in with, so the
  // data lands in the exact right school:
  //   ADMIN_EMAIL=you@yourschool.com npx tsx prisma/seed-credit-grade-demo.ts
  const adminEmail = process.env.ADMIN_EMAIL;
  let school;
  if (adminEmail) {
    const adminUser = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: { schoolId: true },
    });
    if (!adminUser?.schoolId) {
      throw new Error(
        `No user found with email "${adminEmail}", or that user has no schoolId. ` +
          `Double-check the email you log into the admin UI with.`
      );
    }
    school = await prisma.school.findUniqueOrThrow({ where: { id: adminUser.schoolId } });
  } else {
    const existingSchool = await prisma.school.findFirst();
    school = existingSchool
      ? existingSchool
      : await prisma.school.create({
          data: { name: "Demo School", code: "DEMO", address: "Kathmandu, Nepal", phone: "01-5555555" },
        });
    console.log(
      `⚠️  No ADMIN_EMAIL given — adopted "${school.name}" (first school found). ` +
        `If that's not the school you log into, re-run with:\n` +
        `   ADMIN_EMAIL=your-admin-login@email.com npx tsx prisma/seed-credit-grade-demo.ts\n`
    );
  }

  // ── Current BS academic year, made active ──
  const nd = new NepaliDate(new Date());
  const yearBS = String(nd.getYear());

  await prisma.academicYear.updateMany({
    where: { schoolId: school.id, isActive: true },
    data: { isActive: false },
  });

  const academicYear = await prisma.academicYear.upsert({
    where: { yearBS_schoolId: { yearBS, schoolId: school.id } },
    update: { isActive: true },
    create: {
      schoolId: school.id,
      yearBS,
      startDate: `${yearBS}/01/01`,
      endDate: `${yearBS}/12/30`,
      isActive: true,
    },
  });

  // ── Exam type ──
  const examType = await prisma.examType.upsert({
    where: { name_academicYearId: { name: "First Terminal Examination", academicYearId: academicYear.id } },
    update: {},
    create: {
      name: "First Terminal Examination",
      academicYearId: academicYear.id,
      isFinal: false,
      displayOrder: 1,
      paperSize: "A4",
      showRank: true,
    },
  });

  // gradingStyle is school-wide, not per grade — this switches every grade in
  // the adopted school to the credit-grade report design, not just "X" below.
  await prisma.reportCardSettings.upsert({
    where: { schoolId: school.id },
    update: { gradingStyle: "CREDIT_GRADE_BASED" },
    create: { schoolId: school.id, gradingStyle: "CREDIT_GRADE_BASED" },
  });

  // ── Grade + Section ──
  const grade = await prisma.grade.upsert({
    where: { name_academicYearId: { name: "X", academicYearId: academicYear.id } },
    update: {},
    create: {
      name: "X",
      academicYearId: academicYear.id,
      displayOrder: 9,
    },
  });

  const section = await prisma.section.upsert({
    where: { name_gradeId: { name: "A", gradeId: grade.id } },
    update: {},
    create: { name: "A", gradeId: grade.id },
  });

  await prisma.gradingPolicy.upsert({
    where: { examTypeId_gradeId: { examTypeId: examType.id, gradeId: grade.id } },
    update: { weightagePercent: 100 },
    create: { examTypeId: examType.id, gradeId: grade.id, weightagePercent: 100 },
  });

  // ── Subjects (all 75 theory / 25 practical / credit hour 4, matching
  // the Asian Public School sample) ──
  const subjectDefs = [
    { name: "Compulsory English", nameNp: "अनिवार्य अंग्रेजी" },
    { name: "Compulsory Mathematics", nameNp: "अनिवार्य गणित" },
    { name: "Computer Science", nameNp: "कम्प्युटर विज्ञान" },
    { name: "Nepali", nameNp: "नेपाली" },
    { name: "Optional Mathematics", nameNp: "वैकल्पिक गणित" },
    { name: "Science", nameNp: "विज्ञान" },
    { name: "Social Studies", nameNp: "सामाजिक अध्ययन" },
  ];

  const subjects = [];
  for (let i = 0; i < subjectDefs.length; i++) {
    const s = await prisma.subject.upsert({
      where: { name_gradeId: { name: subjectDefs[i].name, gradeId: grade.id } },
      update: { creditHour: 4, fullTheoryMarks: 75, fullPracticalMarks: 25, passMarks: 35 },
      create: {
        name: subjectDefs[i].name,
        nameNp: subjectDefs[i].nameNp,
        gradeId: grade.id,
        fullTheoryMarks: 75,
        fullPracticalMarks: 25,
        passMarks: 35,
        creditHour: 4,
        displayOrder: i + 1,
      },
    });
    subjects.push(s);
  }

  // ── Teacher (class teacher for Section A) ──
  const teacher = await prisma.teacher.upsert({
    where: { id: "demo-credit-grade-teacher" },
    update: {},
    create: {
      id: "demo-credit-grade-teacher",
      schoolId: school.id,
      name: "Sunita Gurung",
      phone: "9800000001",
      email: "sunita.gurung@demo.local",
    },
  });

  await prisma.user.upsert({
    where: { email: "sunita.gurung@demo.local" },
    update: { password: await pw("demo1234"), role: "TEACHER", teacherId: teacher.id, schoolId: school.id, isActive: true },
    create: { email: "sunita.gurung@demo.local", password: await pw("demo1234"), role: "TEACHER", teacherId: teacher.id, schoolId: school.id, isActive: true },
  });

  const existingAssignment = await prisma.teacherAssignment.findFirst({
    where: { teacherId: teacher.id, sectionId: section.id, subjectId: null },
  });
  if (existingAssignment) {
    await prisma.teacherAssignment.update({
      where: { id: existingAssignment.id },
      data: { isClassTeacher: true },
    });
  } else {
    await prisma.teacherAssignment.create({
      data: { teacherId: teacher.id, sectionId: section.id, subjectId: null, isClassTeacher: true },
    });
  }

  // ── Student (roll no. 22, same as the sample report) ──
  const student = await prisma.student.upsert({
    where: { rollNo_sectionId: { rollNo: 22, sectionId: section.id } },
    update: { name: "Subani Devkota", isActive: true, status: "ACTIVE" },
    create: {
      name: "Subani Devkota",
      rollNo: 22,
      gender: "Female",
      dateOfBirth: `${parseInt(yearBS) - 16}/03/14`,
      fatherName: "Ram Devkota",
      motherName: "Sita Devkota",
      guardianPhone: "9841000022",
      address: "Anamnagar, Kathmandu",
      sectionId: section.id,
      isActive: true,
      status: "ACTIVE",
    },
  });

  await prisma.user.upsert({
    where: { email: "subani.devkota@demo.local" },
    update: { password: await pw("demo1234"), role: "STUDENT", studentId: student.id, schoolId: school.id, isActive: true },
    create: { email: "subani.devkota@demo.local", password: await pw("demo1234"), role: "STUDENT", studentId: student.id, schoolId: school.id, isActive: true },
  });

  // ── Parent, linked to the student ──
  const parentUser = await prisma.user.upsert({
    where: { email: "ram.devkota@demo.local" },
    update: { password: await pw("demo1234"), role: "PARENT", schoolId: school.id, isActive: true },
    create: { email: "ram.devkota@demo.local", password: await pw("demo1234"), role: "PARENT", schoolId: school.id, isActive: true },
  });
  await prisma.parentStudent.upsert({
    where: { parentId_studentId: { parentId: parentUser.id, studentId: student.id } },
    update: {},
    create: { parentId: parentUser.id, studentId: student.id },
  });

  // ── Marks — a deliberate spread from A+ down to D so the report shows
  // off every grade band, not just one flat performance level ──
  const markPlan: Record<string, { theory: number; practical: number }> = {
    "Compulsory English": { theory: 60, practical: 20 }, // 80% -> A
    "Compulsory Mathematics": { theory: 45, practical: 15 }, // 60% -> B
    "Computer Science": { theory: 55, practical: 22 }, // 77% -> B+
    "Nepali": { theory: 65, practical: 24 }, // 89% -> A
    "Optional Mathematics": { theory: 38, practical: 12 }, // 50% -> C+
    "Science": { theory: 70, practical: 24 }, // 94% -> A+
    "Social Studies": { theory: 28, practical: 9 }, // 37% -> D
  };

  for (const subject of subjects) {
    const plan = markPlan[subject.name];
    if (!plan) continue;
    await prisma.mark.upsert({
      where: {
        studentId_subjectId_examTypeId_academicYearId: {
          studentId: student.id,
          subjectId: subject.id,
          examTypeId: examType.id,
          academicYearId: academicYear.id,
        },
      },
      update: { theoryMarks: plan.theory, practicalMarks: plan.practical, isAbsent: false },
      create: {
        studentId: student.id,
        subjectId: subject.id,
        examTypeId: examType.id,
        academicYearId: academicYear.id,
        theoryMarks: plan.theory,
        practicalMarks: plan.practical,
        isAbsent: false,
      },
    });
  }

  // ── Attendance (56/60, same shape as the sample report) ──
  await prisma.attendance.upsert({
    where: { studentId_academicYearId: { studentId: student.id, academicYearId: academicYear.id } },
    update: { totalDays: 60, presentDays: 56, absentDays: 4 },
    create: { studentId: student.id, academicYearId: academicYear.id, totalDays: 60, presentDays: 56, absentDays: 4 },
  });

  console.log("✅ Credit-grade demo data ready.\n");
  console.log(`School:        ${school.name}`);
  console.log(`Academic Year: ${academicYear.yearBS} B.S. (now active)`);
  console.log(`Grade/Section: X / A`);
  console.log(`Report design: CREDIT_GRADE_BASED (school-wide)`);
  console.log(`Exam:          ${examType.name}\n`);
  console.log("Logins (all password: demo1234):");
  console.log(`  Teacher: sunita.gurung@demo.local`);
  console.log(`  Student: subani.devkota@demo.local`);
  console.log(`  Parent:  ram.devkota@demo.local\n`);
  console.log("Direct PDF test URL:");
  console.log(`  GET /api/pdf/term/${student.id}/${examType.id}\n`);
  console.log(`studentId:  ${student.id}`);
  console.log(`examTypeId: ${examType.id}`);
  console.log(`gradeId:    ${grade.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
