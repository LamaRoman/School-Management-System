import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding teacher + students...\n");

  // Find active year
  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) { console.log("❌ No active year"); return; }
  console.log(`✅ Active year: ${activeYear.yearBS}`);

  // Find Class VIII Section A
  const grade8 = await prisma.grade.findFirst({
    where: { name: "VIII", academicYearId: activeYear.id },
    include: { sections: true, subjects: true },
  });
  if (!grade8) { console.log("❌ No Class VIII"); return; }
  const sectionA = grade8.sections.find((s) => s.name === "A");
  if (!sectionA) { console.log("❌ No Section A"); return; }
  console.log(`✅ Grade: ${grade8.name}, Section: ${sectionA.name}`);
  console.log(`✅ Subjects: ${grade8.subjects.map((s) => s.name).join(", ")}`);

  // ─── Create Teacher ───────────────────────────────
  const hashedTeacherPw = await bcrypt.hash("teacher123", 10);

  const teacher = await prisma.teacher.upsert({
    where: { id: "teacher-ram" },
    update: {},
    create: {
      id: "teacher-ram",
      name: "Ram Sharma",
      nameNp: "राम शर्मा",
      email: "ram.sharma@school.edu.np",
      phone: "98XXXXXXXX",
    },
  });
  console.log(`✅ Teacher: ${teacher.name}`);

  // Create teacher user account
  await prisma.user.upsert({
    where: { email: "ram.sharma@school.edu.np" },
    update: {},
    create: {
      email: "ram.sharma@school.edu.np",
      password: hashedTeacherPw,
      role: "TEACHER",
      teacherId: teacher.id,
    },
  });
  console.log(`✅ Teacher login: ram.sharma@school.edu.np / teacher123`);

  // Assign teacher as class teacher for VIII-A
  const existingCT = await prisma.teacherAssignment.findFirst({
    where: { sectionId: sectionA.id, isClassTeacher: true },
  });
  if (!existingCT) {
    await prisma.teacherAssignment.create({
      data: {
        teacherId: teacher.id,
        sectionId: sectionA.id,
        subjectId: null,
        isClassTeacher: true,
      },
    });
  }

  // Assign teacher to all subjects in VIII-A
  for (const subject of grade8.subjects) {
    try {
      await prisma.teacherAssignment.upsert({
        where: {
          teacherId_sectionId_subjectId: {
            teacherId: teacher.id,
            sectionId: sectionA.id,
            subjectId: subject.id,
          },
        },
        update: {},
        create: {
          teacherId: teacher.id,
          sectionId: sectionA.id,
          subjectId: subject.id,
          isClassTeacher: false,
        },
      });
    } catch {}
  }
  console.log(`✅ Teacher assigned to VIII-A (class teacher + all subjects)`);

  // ─── Create Students ──────────────────────────────
  const hashedStudentPw = await bcrypt.hash("student123", 10);
  const studentNames = [
    { name: "Aarav Sharma", nameNp: "आरव शर्मा" },
    { name: "Bipasha Thapa", nameNp: "बिपाशा थापा" },
    { name: "Chirag Basnet", nameNp: "चिराग बस्नेत" },
    { name: "Diksha Adhikari", nameNp: "दिक्षा अधिकारी" },
    { name: "Eshan Gurung", nameNp: "एशान गुरुङ" },
    { name: "Fumika Rai", nameNp: "फुमिका राई" },
    { name: "Gaurav Pandey", nameNp: "गौरव पाण्डे" },
    { name: "Hima Tamang", nameNp: "हिमा तामाङ" },
    { name: "Ishan Shrestha", nameNp: "इशान श्रेष्ठ" },
    { name: "Jyoti Magar", nameNp: "ज्योती मगर" },
    { name: "Kiran Karki", nameNp: "किरण कार्की" },
    { name: "Laxmi Bhandari", nameNp: "लक्ष्मी भण्डारी" },
    { name: "Manish Poudel", nameNp: "मनिष पौडेल" },
    { name: "Nisha KC", nameNp: "निशा केसी" },
    { name: "Om Prakash Yadav", nameNp: "ओम प्रकाश यादव" },
    { name: "Priya Maharjan", nameNp: "प्रिया महर्जन" },
    { name: "Rohan Dahal", nameNp: "रोहन दाहाल" },
    { name: "Sarika Limbu", nameNp: "सरिका लिम्बू" },
    { name: "Tilak Rijal", nameNp: "तिलक रिजाल" },
    { name: "Usha Ghimire", nameNp: "उषा घिमिरे" },
    { name: "Vivek Chhetri", nameNp: "विवेक क्षेत्री" },
    { name: "Yamuna Dangol", nameNp: "यमुना डंगोल" },
  ];

  let created = 0;
  for (let i = 0; i < studentNames.length; i++) {
    const s = studentNames[i];
    const email = `${s.name.toLowerCase().replace(/\s+/g, ".")}@school.edu.np`;

    try {
      const student = await prisma.student.create({
        data: {
          name: s.name,
          nameNp: s.nameNp,
          rollNo: i + 1,
          sectionId: sectionA.id,
          dateOfBirth: `206${5 + (i % 5)}/0${(i % 9) + 1}/1${i % 28 + 1}`,
          gender: i % 2 === 0 ? "Male" : "Female",
          guardianName: `Guardian of ${s.name}`,
          guardianPhone: `98${String(41000000 + i * 111111).slice(0, 8)}`,
          status: "ACTIVE",
        },
      });

      // Create student user account
      await prisma.user.create({
        data: {
          email,
          password: hashedStudentPw,
          role: "STUDENT",
          studentId: student.id,
        },
      });
      created++;
    } catch (e: any) {
      console.log(`  ⚠️  ${s.name}: ${e.message?.slice(0, 50)}`);
    }
  }
  console.log(`✅ Students created: ${created}`);
  console.log(`✅ Student login example: aarav.sharma@school.edu.np / student123`);

  // ─── Create SYSTEM_ADMIN ──────────────────────────
  const hashedSysPw = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "sysadmin@system.com" },
    update: {},
    create: {
      email: "sysadmin@system.com",
      password: hashedSysPw,
      role: "SYSTEM_ADMIN",
    },
  });
  console.log(`✅ System Admin: sysadmin@system.com / admin123`);

  console.log("\n🎉 Done! Test credentials:");
  console.log("   SYSTEM_ADMIN: sysadmin@system.com / admin123");
  console.log("   ADMIN: admin@school.edu.np / admin123");
  console.log("   TEACHER: ram.sharma@school.edu.np / teacher123");
  console.log("   STUDENT: aarav.sharma@school.edu.np / student123");
}

main()
  .catch((e) => console.error("❌ Error:", e))
  .finally(() => prisma.$disconnect());