/**
 * seed-dummy-full.ts
 * Seeds comprehensive dummy data across all grades:
 *  - Subjects for every grade (Nursery → X)
 *  - Grading policies for all grades
 *  - 1 teacher per grade (class teacher + all subjects)
 *  - 10 students per section (A & B) = 20 per grade = 260 total
 *  - Parent accounts — one parent per 2 students (siblings share a parent)
 *  - Fee structure for all grades
 *  - Accountant user
 *
 * Run: DATABASE_URL="..." npx tsx prisma/seed-dummy-full.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import NepaliDate from "nepali-date-converter";

const prisma = new PrismaClient();

// ─── Helpers ────────────────────────────────────────────

function getTodayBS(): string {
  const nd = new NepaliDate(new Date());
  return `${nd.getYear()}/${String(nd.getMonth() + 1).padStart(2, "0")}/${String(nd.getDate()).padStart(2, "0")}`;
}

function randomBSDate(yearFrom: number, yearTo: number): string {
  const year = yearFrom + Math.floor(Math.random() * (yearTo - yearFrom + 1));
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

// ─── Data definitions ────────────────────────────────────

// Subjects per grade group
const subjectSets: Record<string, { name: string; nameNp: string; fullTheory: number; fullPractical: number; passMarks: number }[]> = {
  nursery: [
    { name: "English", nameNp: "अंग्रेजी", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "Nepali", nameNp: "नेपाली", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "Mathematics", nameNp: "गणित", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "Creative Arts", nameNp: "सिर्जनात्मक कला", fullTheory: 50, fullPractical: 0, passMarks: 20 },
  ],
  lower: [ // LKG, UKG
    { name: "English", nameNp: "अंग्रेजी", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "Nepali", nameNp: "नेपाली", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "Mathematics", nameNp: "गणित", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "Creative Arts", nameNp: "सिर्जनात्मक कला", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "EVS", nameNp: "वातावरण शिक्षा", fullTheory: 50, fullPractical: 0, passMarks: 20 },
  ],
  primary: [ // I–V
    { name: "English", nameNp: "अंग्रेजी", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Nepali", nameNp: "नेपाली", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Mathematics", nameNp: "गणित", fullTheory: 100, fullPractical: 0, passMarks: 40 },
    { name: "Science", nameNp: "विज्ञान", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Social Studies", nameNp: "सामाजिक अध्ययन", fullTheory: 100, fullPractical: 0, passMarks: 40 },
    { name: "Moral Education", nameNp: "नैतिक शिक्षा", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "HPE", nameNp: "शारीरिक शिक्षा", fullTheory: 50, fullPractical: 50, passMarks: 30 },
  ],
  middle: [ // VI–VIII
    { name: "English", nameNp: "अंग्रेजी", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Nepali", nameNp: "नेपाली", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Mathematics", nameNp: "गणित", fullTheory: 100, fullPractical: 0, passMarks: 40 },
    { name: "Science", nameNp: "विज्ञान", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Social Studies", nameNp: "सामाजिक अध्ययन", fullTheory: 100, fullPractical: 0, passMarks: 40 },
    { name: "Computer", nameNp: "कम्प्युटर", fullTheory: 50, fullPractical: 50, passMarks: 40 },
    { name: "HPE", nameNp: "शारीरिक शिक्षा", fullTheory: 75, fullPractical: 25, passMarks: 30 },
    { name: "Opt. Math", nameNp: "ऐच्छिक गणित", fullTheory: 100, fullPractical: 0, passMarks: 40 },
  ],
  secondary: [ // IX–X
    { name: "English", nameNp: "अंग्रेजी", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Nepali", nameNp: "नेपाली", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Mathematics", nameNp: "गणित", fullTheory: 100, fullPractical: 0, passMarks: 40 },
    { name: "Science", nameNp: "विज्ञान", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Social Studies", nameNp: "सामाजिक अध्ययन", fullTheory: 100, fullPractical: 0, passMarks: 40 },
    { name: "Computer", nameNp: "कम्प्युटर", fullTheory: 50, fullPractical: 50, passMarks: 40 },
    { name: "Account", nameNp: "लेखा", fullTheory: 100, fullPractical: 0, passMarks: 40 },
    { name: "HPE", nameNp: "शारीरिक शिक्षा", fullTheory: 75, fullPractical: 25, passMarks: 30 },
    { name: "Opt. Math", nameNp: "ऐच्छिक गणित", fullTheory: 100, fullPractical: 0, passMarks: 40 },
  ],
};

function getSubjectSet(gradeName: string) {
  if (gradeName === "Nursery") return subjectSets.nursery;
  if (["LKG", "UKG"].includes(gradeName)) return subjectSets.lower;
  if (["I", "II", "III", "IV", "V"].includes(gradeName)) return subjectSets.primary;
  if (["VI", "VII", "VIII"].includes(gradeName)) return subjectSets.middle;
  return subjectSets.secondary;
}

// Nepali student names
const maleFirstNames = ["Aarav", "Bibek", "Chirag", "Dipesh", "Eshan", "Firoj", "Ganesh", "Hari", "Ishan", "Janak", "Kamal", "Lokesh", "Manish", "Nabin", "Om", "Prakash", "Rajesh", "Santosh", "Tilak", "Umesh"];
const femaleFirstNames = ["Aasha", "Bipasha", "Chanda", "Deepa", "Elina", "Fulkumari", "Gita", "Hema", "Indira", "Jyoti", "Kamala", "Laxmi", "Maya", "Nisha", "Oja", "Puja", "Rita", "Sunita", "Tara", "Uma"];
const lastNames = ["Sharma", "Thapa", "Basnet", "Karki", "Gurung", "Tamang", "Shrestha", "Rai", "Limbu", "Magar", "Poudel", "Adhikari", "Bhattarai", "Koirala", "Dahal", "Ghimire", "Subedi", "Tiwari", "Regmi", "Khadka"];

const fatherNames = ["Ram", "Shyam", "Hari", "Krishna", "Gopal", "Mohan", "Bishnu", "Ganesh", "Indra", "Surya"];
const motherNames = ["Sita", "Gita", "Maya", "Laxmi", "Durga", "Parvati", "Saraswati", "Kamala", "Radha", "Sumitra"];

function makeName(index: number, gender: "Male" | "Female"): { name: string; nameNp: string; fatherName: string; motherName: string } {
  const first = gender === "Male"
    ? maleFirstNames[index % maleFirstNames.length]
    : femaleFirstNames[index % femaleFirstNames.length];
  const last = lastNames[index % lastNames.length];
  const father = fatherNames[index % fatherNames.length] + " " + last;
  const mother = motherNames[index % motherNames.length] + " " + last;
  return {
    name: `${first} ${last}`,
    nameNp: `${first} ${last}`,
    fatherName: father,
    motherName: mother,
  };
}

// Teacher names per grade
const teacherData = [
  { name: "Sunita Pandey", email: "sunita.pandey@school.edu.np", gradeName: "Nursery" },
  { name: "Ramesh Bhandari", email: "ramesh.bhandari@school.edu.np", gradeName: "LKG" },
  { name: "Mina Karki", email: "mina.karki@school.edu.np", gradeName: "UKG" },
  { name: "Kiran Thapa", email: "kiran.thapa@school.edu.np", gradeName: "I" },
  { name: "Sujata Shrestha", email: "sujata.shrestha@school.edu.np", gradeName: "II" },
  { name: "Deepak Adhikari", email: "deepak.adhikari@school.edu.np", gradeName: "III" },
  { name: "Anita Gurung", email: "anita.gurung@school.edu.np", gradeName: "IV" },
  { name: "Bikash Tamang", email: "bikash.tamang@school.edu.np", gradeName: "V" },
  { name: "Priya Rai", email: "priya.rai@school.edu.np", gradeName: "VI" },
  { name: "Suresh Magar", email: "suresh.magar@school.edu.np", gradeName: "VII" },
  { name: "Ram Sharma", email: "ram.sharma@school.edu.np", gradeName: "VIII" },
  { name: "Nirmala Poudel", email: "nirmala.poudel@school.edu.np", gradeName: "IX" },
  { name: "Bijaya Koirala", email: "bijaya.koirala@school.edu.np", gradeName: "X" },
];

const gradeNames = ["Nursery", "LKG", "UKG", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// ─── Main ────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding full dummy data...\n");
  const todayBS = getTodayBS();

  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) { console.error("❌ No active academic year. Run seed.ts first."); process.exit(1); }
  console.log(`✅ Active year: ${activeYear.yearBS}`);

  const examTypes = await prisma.examType.findMany({ where: { academicYearId: activeYear.id } });
  if (examTypes.length === 0) { console.error("❌ No exam types. Run seed.ts first."); process.exit(1); }
  console.log(`✅ Exam types: ${examTypes.map(e => e.name).join(", ")}`);

  const hashedTeacherPw = await bcrypt.hash("teacher123", 10);
  const hashedStudentPw = await bcrypt.hash("student123", 10);
  const hashedParentPw = await bcrypt.hash("parent123", 10);

  let totalStudents = 0;
  let totalTeachers = 0;
  let totalParents = 0;

  for (const gradeName of gradeNames) {
    // Find grade
    const grade = await prisma.grade.findFirst({
      where: { name: gradeName, academicYearId: activeYear.id },
      include: { sections: true },
    });
    if (!grade) { console.log(`  ⚠️  Grade ${gradeName} not found, skipping`); continue; }

    // ─── Subjects ─────────────────────────────────
    const subjects = getSubjectSet(gradeName);
    const createdSubjects = [];
    for (let i = 0; i < subjects.length; i++) {
      const sub = subjects[i];
      const created = await prisma.subject.upsert({
        where: { name_gradeId: { name: sub.name, gradeId: grade.id } },
        update: {},
        create: {
          name: sub.name,
          nameNp: sub.nameNp,
          fullTheoryMarks: sub.fullTheory,
          fullPracticalMarks: sub.fullPractical,
          passMarks: sub.passMarks,
          displayOrder: i + 1,
          gradeId: grade.id,
        },
      });
      createdSubjects.push(created);
    }

    // ─── Grading policy ───────────────────────────
    for (const et of examTypes) {
      const weightage = et.name === "Final" ? 50 : et.name.includes("Second") ? 30 : 20;
      await prisma.gradingPolicy.upsert({
        where: { examTypeId_gradeId: { examTypeId: et.id, gradeId: grade.id } },
        update: {},
        create: { examTypeId: et.id, gradeId: grade.id, weightagePercent: weightage },
      });
    }

    // ─── Teacher ──────────────────────────────────
    const tData = teacherData.find(t => t.gradeName === gradeName);
    if (tData) {
      const teacherId = `teacher-${tData.email.split("@")[0]}`;
      const teacher = await prisma.teacher.upsert({
        where: { id: teacherId },
        update: {},
        create: { id: teacherId, name: tData.name, email: tData.email, phone: "98XXXXXXXX" },
      });

      await prisma.user.upsert({
        where: { email: tData.email },
        update: {},
        create: {
          email: tData.email,
          password: hashedTeacherPw,
          role: "TEACHER",
          teacherId: teacher.id,
          isActive: true,
        },
      });

      // Assign as class teacher + all subjects for Section A
      const sectionA = grade.sections.find(s => s.name === "A");
      if (sectionA) {
        // Class teacher assignment
        await prisma.teacherAssignment.upsert({
          where: { teacherId_sectionId_subjectId: { teacherId: teacher.id, sectionId: sectionA.id, subjectId: createdSubjects[0]?.id || "" } },
          update: {},
          create: { teacherId: teacher.id, sectionId: sectionA.id, subjectId: createdSubjects[0]?.id || null, isClassTeacher: true },
        });
        // All subject assignments
        for (const sub of createdSubjects) {
          try {
            await prisma.teacherAssignment.upsert({
              where: { teacherId_sectionId_subjectId: { teacherId: teacher.id, sectionId: sectionA.id, subjectId: sub.id } },
              update: {},
              create: { teacherId: teacher.id, sectionId: sectionA.id, subjectId: sub.id, isClassTeacher: false },
            });
          } catch (err) { /* skip duplicate */ }
        }
      }
      totalTeachers++;
    }

    // ─── Students (10 per section) ─────────────────
    const dobYearFrom = 2082 - gradeNames.indexOf(gradeName) - 6;
    const dobYearTo = dobYearFrom + 1;

    for (const section of grade.sections) {
      for (let i = 0; i < 10; i++) {
        const gender: "Male" | "Female" = i % 2 === 0 ? "Male" : "Female";
        const nameData = makeName(gradeNames.indexOf(gradeName) * 20 + (section.name === "B" ? 10 : 0) + i, gender);
        const email = `${nameData.name.toLowerCase().replace(/\s+/g, ".")}.${gradeName.toLowerCase()}.${section.name.toLowerCase()}@school.edu.np`;

        // Create student
        const student = await prisma.student.upsert({
          where: { id: `student-${gradeName}-${section.name}-${i}` },
          update: {},
          create: {
            id: `student-${gradeName}-${section.name}-${i}`,
            name: nameData.name,
            nameNp: nameData.nameNp,
            rollNo: i + 1,
            gender,
            dateOfBirth: randomBSDate(dobYearFrom, dobYearTo),
            fatherName: nameData.fatherName,
            motherName: nameData.motherName,
            guardianPhone: `98${String(Math.floor(10000000 + Math.random() * 90000000))}`,
            address: "Kathmandu, Nepal",
            sectionId: section.id,
            isActive: true,
            status: "ACTIVE",
          },
        });

        // Student login
        const userEmail = `${nameData.name.toLowerCase().replace(/\s+/g, ".")}.${student.id.slice(-6)}@school.edu.np`;
        await prisma.user.upsert({
          where: { email: userEmail },
          update: {},
          create: {
            email: userEmail,
            password: hashedStudentPw,
            role: "STUDENT",
            studentId: student.id,
            isActive: true,
          },
        });

        // Auto admission record
        await prisma.admission.upsert({
          where: { id: `adm-${student.id}` },
          update: {},
          create: {
            id: `adm-${student.id}`,
            studentName: student.name,
            studentNameNp: student.nameNp,
            dateOfBirth: student.dateOfBirth,
            gender: student.gender,
            fatherName: student.fatherName,
            motherName: student.motherName,
            guardianPhone: student.guardianPhone,
            address: student.address,
            applyingForGradeId: grade.id,
            academicYearId: activeYear.id,
            status: "ENROLLED",
            appliedDate: todayBS,
            reviewedDate: todayBS,
            remarks: "Seeded",
          },
        });

        totalStudents++;

        // ─── Parent (every 2 students share a parent) ─
        if (i % 2 === 0) {
          const parentEmail = `parent.${gradeName.toLowerCase()}.${section.name.toLowerCase()}.${Math.floor(i / 2) + 1}@school.edu.np`;
          const parentUser = await prisma.user.upsert({
            where: { email: parentEmail },
            update: {},
            create: {
              email: parentEmail,
              password: hashedParentPw,
              role: "PARENT",
              isActive: true,
            },
          });

          // Link this student
          await prisma.parentStudent.upsert({
            where: { parentId_studentId: { parentId: parentUser.id, studentId: student.id } },
            update: {},
            create: { parentId: parentUser.id, studentId: student.id, relationship: "Father" },
          });
          totalParents++;
        } else {
          // Link to previous student's parent (sibling)
          const siblingId = `student-${gradeName}-${section.name}-${i - 1}`;
          const sibling = await prisma.student.findUnique({ where: { id: siblingId } });
          if (sibling) {
            const siblingLink = await prisma.parentStudent.findFirst({ where: { studentId: sibling.id } });
            if (siblingLink) {
              await prisma.parentStudent.upsert({
                where: { parentId_studentId: { parentId: siblingLink.parentId, studentId: student.id } },
                update: {},
                create: { parentId: siblingLink.parentId, studentId: student.id, relationship: "Mother" },
              });
            }
          }
        }
      }
    }

    console.log(`✅ ${gradeName}: ${createdSubjects.length} subjects, 20 students, 1 teacher`);
  }

  // ─── Fee structure for all grades ─────────────────
  const feeCategory = await prisma.feeCategory.upsert({
    where: { id: "fee-cat-tuition" },
    update: {},
    create: { id: "fee-cat-tuition", name: "Tuition Fee", description: "Monthly tuition fee" },
  });

  const admissionFeeCategory = await prisma.feeCategory.upsert({
    where: { id: "fee-cat-admission" },
    update: {},
    create: { id: "fee-cat-admission", name: "Admission Fee", description: "One-time admission fee" },
  });

  const feeAmounts: Record<string, number> = {
    Nursery: 1500, LKG: 1500, UKG: 1500,
    I: 2000, II: 2000, III: 2000, IV: 2000, V: 2000,
    VI: 2500, VII: 2500, VIII: 2500,
    IX: 3000, X: 3000,
  };

  for (const gradeName of gradeNames) {
    const grade = await prisma.grade.findFirst({ where: { name: gradeName, academicYearId: activeYear.id } });
    if (!grade) continue;

    // Monthly tuition
    await prisma.feeStructure.upsert({
      where: { id: `fee-struct-tuition-${gradeName}` },
      update: {},
      create: {
        id: `fee-struct-tuition-${gradeName}`,
        gradeId: grade.id,
        feeCategoryId: feeCategory.id,
        amount: feeAmounts[gradeName] || 2000,
        frequency: "MONTHLY",
        academicYearId: activeYear.id,
      },
    });

    // One-time admission fee
    await prisma.feeStructure.upsert({
      where: { id: `fee-struct-admission-${gradeName}` },
      update: {},
      create: {
        id: `fee-struct-admission-${gradeName}`,
        gradeId: grade.id,
        feeCategoryId: admissionFeeCategory.id,
        amount: 5000,
        frequency: "ONE_TIME",
        academicYearId: activeYear.id,
      },
    });
  }
  console.log(`✅ Fee structure: Tuition + Admission for all grades`);

  // ─── Accountant user ──────────────────────────────
  const hashedAccPw = await bcrypt.hash("accountant123", 10);
  await prisma.user.upsert({
    where: { email: "accountant@school.edu.np" },
    update: {},
    create: {
      email: "accountant@school.edu.np",
      password: hashedAccPw,
      role: "ACCOUNTANT",
      isActive: true,
    },
  });
  console.log(`✅ Accountant: accountant@school.edu.np / accountant123`);

  console.log(`\n📊 Summary:`);
  console.log(`   Students : ${totalStudents}`);
  console.log(`   Teachers : ${totalTeachers}`);
  console.log(`   Parents  : ${totalParents} (siblings share one account)`);
  console.log(`\n🎉 Full dummy seed complete!`);
}

main()
  .catch((e) => { console.error("❌ Seed error:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
