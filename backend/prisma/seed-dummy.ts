import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Helper: random int between min and max (inclusive)
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  console.log("🌱 Seeding dummy data for MVP demo...\n");

  // ─── Fetch existing data from base seed ─────────────
  const academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!academicYear) throw new Error("Run the base seed.ts first!");

  const gradeVIII = await prisma.grade.findFirst({
    where: { name: "VIII", academicYearId: academicYear.id },
    include: { sections: true },
  });
  if (!gradeVIII) throw new Error("Grade VIII not found. Run base seed first!");

  const sectionA = gradeVIII.sections.find((s) => s.name === "A");
  const sectionB = gradeVIII.sections.find((s) => s.name === "B");
  if (!sectionA || !sectionB) throw new Error("Sections not found!");

  const subjects = await prisma.subject.findMany({
    where: { gradeId: gradeVIII.id },
    orderBy: { displayOrder: "asc" },
  });

  const examTypes = await prisma.examType.findMany({
    where: { academicYearId: academicYear.id },
    orderBy: { displayOrder: "asc" },
  });

  const firstTerminal = examTypes.find((e) => e.name === "First Terminal")!;
  const secondTerminal = examTypes.find((e) => e.name === "Second Terminal")!;
  const finalExam = examTypes.find((e) => e.name === "Final")!;

  console.log(`📚 Found: ${subjects.length} subjects, ${examTypes.length} exam types`);

  // ─── Create Students for Section A ──────────────────
  const sectionAStudents = [
    { name: "Aarav Sharma", nameNp: "आरव शर्मा", dob: "2068/03/15", gender: "Male", father: "Ramesh Sharma", mother: "Sita Sharma", phone: "9841000001", address: "Kathmandu" },
    { name: "Bipasha Thapa", nameNp: "बिपाशा थापा", dob: "2068/05/22", gender: "Female", father: "Bikram Thapa", mother: "Mina Thapa", phone: "9841000002", address: "Lalitpur" },
    { name: "Chirag Basnet", nameNp: "चिराग बस्नेत", dob: "2068/01/10", gender: "Male", father: "Deepak Basnet", mother: "Kamala Basnet", phone: "9841000003", address: "Bhaktapur" },
    { name: "Diksha Adhikari", nameNp: "दिक्षा अधिकारी", dob: "2068/07/08", gender: "Female", father: "Ganesh Adhikari", mother: "Laxmi Adhikari", phone: "9841000004", address: "Kathmandu" },
    { name: "Eshan Gurung", nameNp: "एशान गुरुङ", dob: "2068/09/25", gender: "Male", father: "Hari Gurung", mother: "Parbati Gurung", phone: "9841000005", address: "Pokhara" },
    { name: "Fumika Rai", nameNp: "फुमिका राई", dob: "2068/02/18", gender: "Female", father: "Indra Rai", mother: "Sarita Rai", phone: "9841000006", address: "Dharan" },
    { name: "Gaurav Pandey", nameNp: "गौरव पाण्डे", dob: "2068/11/05", gender: "Male", father: "Janak Pandey", mother: "Durga Pandey", phone: "9841000007", address: "Kathmandu" },
    { name: "Hima Tamang", nameNp: "हिमा तामाङ", dob: "2068/04/30", gender: "Female", father: "Krishna Tamang", mother: "Rita Tamang", phone: "9841000008", address: "Kathmandu" },
    { name: "Ishan Shrestha", nameNp: "इशान श्रेष्ठ", dob: "2068/06/12", gender: "Male", father: "Laxman Shrestha", mother: "Nirmala Shrestha", phone: "9841000009", address: "Bhaktapur" },
    { name: "Jyoti Magar", nameNp: "ज्योती मगर", dob: "2068/08/20", gender: "Female", father: "Man Bahadur Magar", mother: "Devi Magar", phone: "9841000010", address: "Butwal" },
    { name: "Kiran Karki", nameNp: "किरण कार्की", dob: "2068/10/14", gender: "Male", father: "Narayan Karki", mother: "Ganga Karki", phone: "9841000011", address: "Kathmandu" },
    { name: "Laxmi Bhandari", nameNp: "लक्ष्मी भण्डारी", dob: "2068/12/03", gender: "Female", father: "Om Bhandari", mother: "Tulsi Bhandari", phone: "9841000012", address: "Lalitpur" },
  ];

  const sectionBStudents = [
    { name: "Manish Poudel", nameNp: "मनिष पौडेल", dob: "2068/01/28", gender: "Male", father: "Purna Poudel", mother: "Sabita Poudel", phone: "9841000013", address: "Chitwan" },
    { name: "Nisha KC", nameNp: "निशा केसी", dob: "2068/03/09", gender: "Female", father: "Raju KC", mother: "Anita KC", phone: "9841000014", address: "Kathmandu" },
    { name: "Om Prakash Yadav", nameNp: "ओम प्रकाश यादव", dob: "2068/05/17", gender: "Male", father: "Shyam Yadav", mother: "Sunita Yadav", phone: "9841000015", address: "Janakpur" },
    { name: "Priya Maharjan", nameNp: "प्रिया महर्जन", dob: "2068/07/21", gender: "Female", father: "Tej Maharjan", mother: "Uma Maharjan", phone: "9841000016", address: "Lalitpur" },
    { name: "Rohan Dahal", nameNp: "रोहन दाहाल", dob: "2068/09/04", gender: "Male", father: "Uttam Dahal", mother: "Bimala Dahal", phone: "9841000017", address: "Kathmandu" },
    { name: "Sarika Limbu", nameNp: "सरिका लिम्बू", dob: "2068/11/15", gender: "Female", father: "Vishnu Limbu", mother: "Anju Limbu", phone: "9841000018", address: "Dhankuta" },
    { name: "Tilak Rijal", nameNp: "तिलक रिजाल", dob: "2068/02/07", gender: "Male", father: "Waman Rijal", mother: "Radha Rijal", phone: "9841000019", address: "Kathmandu" },
    { name: "Usha Ghimire", nameNp: "उषा घिमिरे", dob: "2068/04/19", gender: "Female", father: "Yogesh Ghimire", mother: "Kalpana Ghimire", phone: "9841000020", address: "Pokhara" },
    { name: "Vivek Chhetri", nameNp: "विवेक क्षेत्री", dob: "2068/06/28", gender: "Male", father: "Arjun Chhetri", mother: "Bhawani Chhetri", phone: "9841000021", address: "Kathmandu" },
    { name: "Yamuna Dangol", nameNp: "यमुना डंगोल", dob: "2068/08/11", gender: "Female", father: "Binod Dangol", mother: "Chandra Dangol", phone: "9841000022", address: "Bhaktapur" },
  ];

  // Create Section A students
  const createdStudentsA: string[] = [];
  for (let i = 0; i < sectionAStudents.length; i++) {
    const s = sectionAStudents[i];
    const student = await prisma.student.upsert({
      where: { rollNo_sectionId: { rollNo: i + 1, sectionId: sectionA.id } },
      update: {},
      create: {
        name: s.name, nameNp: s.nameNp, dateOfBirth: s.dob, rollNo: i + 1,
        gender: s.gender, fatherName: s.father, motherName: s.mother,
        guardianPhone: s.phone, address: s.address, sectionId: sectionA.id,
      },
    });
    createdStudentsA.push(student.id);
  }
  console.log(`✅ Section A: ${createdStudentsA.length} students`);

  // Create Section B students
  const createdStudentsB: string[] = [];
  for (let i = 0; i < sectionBStudents.length; i++) {
    const s = sectionBStudents[i];
    const student = await prisma.student.upsert({
      where: { rollNo_sectionId: { rollNo: i + 1, sectionId: sectionB.id } },
      update: {},
      create: {
        name: s.name, nameNp: s.nameNp, dateOfBirth: s.dob, rollNo: i + 1,
        gender: s.gender, fatherName: s.father, motherName: s.mother,
        guardianPhone: s.phone, address: s.address, sectionId: sectionB.id,
      },
    });
    createdStudentsB.push(student.id);
  }
  console.log(`✅ Section B: ${createdStudentsB.length} students`);

  const allStudentIds = [...createdStudentsA, ...createdStudentsB];

  // ─── Create Teachers ────────────────────────────────
  const teacherData = [
    { name: "Ram Prasad Sharma", nameNp: "राम प्रसाद शर्मा", phone: "9851000001", email: "ram.sharma@school.edu.np" },
    { name: "Sushila Devi Thapa", nameNp: "सुशिला देवी थापा", phone: "9851000002", email: "sushila.thapa@school.edu.np" },
    { name: "Gopal Krishna Joshi", nameNp: "गोपाल कृष्ण जोशी", phone: "9851000003", email: "gopal.joshi@school.edu.np" },
  ];

  const hashedTeacherPw = await bcrypt.hash("teacher123", 10);
  const teacherIds: string[] = [];

  for (const td of teacherData) {
    const teacher = await prisma.teacher.upsert({
      where: { id: `teacher-${td.email}` },
      update: {},
      create: {
        id: `teacher-${td.email}`,
        name: td.name, nameNp: td.nameNp, phone: td.phone, email: td.email,
      },
    });
    teacherIds.push(teacher.id);

    await prisma.user.upsert({
      where: { email: td.email },
      update: {},
      create: {
        email: td.email, password: hashedTeacherPw, role: "TEACHER", teacherId: teacher.id,
      },
    });
  }
  console.log(`✅ Teachers: ${teacherData.length} (password: teacher123)`);

  // Assign teacher 1 as class teacher for Section A
  await prisma.teacherAssignment.upsert({
    where: { teacherId_sectionId_subjectId: { teacherId: teacherIds[0], sectionId: sectionA.id, subjectId: subjects[0].id } },
    update: {},
    create: { teacherId: teacherIds[0], sectionId: sectionA.id, subjectId: subjects[0].id, isClassTeacher: true },
  });

  // ─── Create Student User (for demo login) ──────────
  const hashedStudentPw = await bcrypt.hash("student123", 10);
  await prisma.user.upsert({
    where: { email: "aarav@school.edu.np" },
    update: {},
    create: {
      email: "aarav@school.edu.np",
      password: hashedStudentPw,
      role: "STUDENT",
      studentId: createdStudentsA[0],
    },
  });
  console.log(`✅ Student login: aarav@school.edu.np / student123`);

  // ─── Generate Marks for All Students, All Subjects, All 3 Terms ───
  let markCount = 0;

  for (const studentId of allStudentIds) {
    for (const subject of subjects) {
      const fullMarks = subject.fullTheoryMarks + subject.fullPracticalMarks;
      const hasPractical = subject.fullPracticalMarks > 0;

      for (const exam of [firstTerminal, secondTerminal, finalExam]) {
        // Generate realistic marks — generally improving across terms
        const termBonus = exam.name === "First Terminal" ? 0 : exam.name === "Second Terminal" ? 3 : 6;
        const baseTheory = rand(
          Math.floor(subject.fullTheoryMarks * 0.35),
          Math.floor(subject.fullTheoryMarks * 0.92)
        ) + termBonus;
        const theoryMarks = Math.min(baseTheory, subject.fullTheoryMarks);

        let practicalMarks = 0;
        if (hasPractical) {
          const basePractical = rand(
            Math.floor(subject.fullPracticalMarks * 0.5),
            Math.floor(subject.fullPracticalMarks * 0.95)
          );
          practicalMarks = Math.min(basePractical + termBonus, subject.fullPracticalMarks);
        }

        await prisma.mark.upsert({
          where: {
            studentId_subjectId_examTypeId_academicYearId: {
              studentId, subjectId: subject.id, examTypeId: exam.id, academicYearId: academicYear.id,
            },
          },
          update: { theoryMarks, practicalMarks },
          create: {
            studentId, subjectId: subject.id, examTypeId: exam.id,
            academicYearId: academicYear.id, theoryMarks, practicalMarks, isAbsent: false,
          },
        });
        markCount++;
      }
    }
  }
  console.log(`✅ Marks: ${markCount} entries (${allStudentIds.length} students × ${subjects.length} subjects × 3 terms)`);

  // ─── Attendance for All Students ────────────────────
  for (const studentId of allStudentIds) {
    const totalDays = 210;
    const absentDays = rand(3, 20);
    await prisma.attendance.upsert({
      where: { studentId_academicYearId: { studentId, academicYearId: academicYear.id } },
      update: {},
      create: {
        studentId, academicYearId: academicYear.id,
        totalDays, presentDays: totalDays - absentDays, absentDays,
      },
    });
  }
  console.log(`✅ Attendance: ${allStudentIds.length} records`);

  // ─── Consolidated Results ───────────────────────────
  const gradingPolicies = await prisma.gradingPolicy.findMany({
    where: { gradeId: gradeVIII.id },
    include: { examType: true },
  });

  const remarks = [
    "Excellent performance. Keep it up!",
    "Very good student. Consistent effort.",
    "Good progress throughout the year.",
    "Hardworking and disciplined student.",
    "Satisfactory performance. Can improve in Math.",
    "Shows great potential. Needs to focus more.",
    "Active participant in class activities.",
    "Steady improvement across all terms.",
    "Well-behaved and attentive student.",
    "Good effort. Should practice more at home.",
  ];

  for (let i = 0; i < allStudentIds.length; i++) {
    const studentId = allStudentIds[i];
    const studentMarks = await prisma.mark.findMany({
      where: { studentId, academicYearId: academicYear.id },
      include: { subject: true, examType: true },
    });

    let totalWeightedPct = 0;
    let subjectCount = 0;

    for (const subject of subjects) {
      const fullMarks = subject.fullTheoryMarks + subject.fullPracticalMarks;
      let weightedPct = 0;

      for (const policy of gradingPolicies) {
        const mark = studentMarks.find(
          (m) => m.subjectId === subject.id && m.examTypeId === policy.examTypeId
        );
        const total = mark ? (mark.theoryMarks || 0) + (mark.practicalMarks || 0) : 0;
        const pct = (total / fullMarks) * 100;
        weightedPct += pct * (policy.weightagePercent / 100);
      }

      totalWeightedPct += weightedPct;
      subjectCount++;
    }

    const overallPct = totalWeightedPct / subjectCount;
    const gpa = overallPct >= 90 ? 4.0 : overallPct >= 80 ? 3.6 : overallPct >= 70 ? 3.2
      : overallPct >= 60 ? 2.8 : overallPct >= 50 ? 2.4 : overallPct >= 40 ? 2.0
      : overallPct >= 30 ? 1.6 : overallPct >= 20 ? 1.2 : 0.8;

    await prisma.consolidatedResult.upsert({
      where: { studentId_academicYearId: { studentId, academicYearId: academicYear.id } },
      update: { totalGpa: parseFloat(gpa.toFixed(2)), totalPercentage: parseFloat(overallPct.toFixed(1)), rank: i + 1 },
      create: {
        studentId, academicYearId: academicYear.id, gradeId: gradeVIII.id,
        totalGpa: parseFloat(gpa.toFixed(2)),
        totalPercentage: parseFloat(overallPct.toFixed(1)),
        rank: i + 1,
        promoted: overallPct >= 32,
        promotedTo: overallPct >= 32 ? "Class IX" : undefined,
        remarks: remarks[i % remarks.length],
      },
    });
  }

  // Re-rank by actual percentage (descending)
  const results = await prisma.consolidatedResult.findMany({
    where: { academicYearId: academicYear.id, gradeId: gradeVIII.id },
    orderBy: { totalPercentage: "desc" },
  });
  for (let i = 0; i < results.length; i++) {
    await prisma.consolidatedResult.update({
      where: { id: results[i].id },
      data: { rank: i + 1 },
    });
  }
  console.log(`✅ Consolidated results: ${allStudentIds.length} students (ranked)`);

  // ─── Summary ────────────────────────────────────────
  console.log("\n🎉 Dummy data seeding complete!");
  console.log("\n📋 Login credentials:");
  console.log("   Admin:   admin@school.edu.np / admin123");
  console.log("   Teacher: ram.sharma@school.edu.np / teacher123");
  console.log("   Student: aarav@school.edu.np / student123");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });