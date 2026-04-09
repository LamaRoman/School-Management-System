/**
 * seed-all.ts — ONE seed to rule them all
 *
 * Creates everything from scratch:
 *   1. Super Admin (no schoolId)
 *   2. School + Admin + Accountant + Report Card Settings
 *   3. Academic Year (2081) + Exam Types (First/Second/Final)
 *   4. Grades (Nursery–X) with Sections A & B
 *   5. Subjects per grade (Nepali curriculum)
 *   6. Grading Policies (20/30/50 weightage)
 *   7. Exam Rooms
 *   8. Teachers (13 class teachers + 10 subject specialists + 5 Section B class teachers)
 *   9. Students (10 per section = 260 total) + User accounts + Admissions
 *  10. Parents (1 per 2 students, siblings share)
 *  11. Fee Categories + Fee Structures
 *  12. Marks (First Terminal all, Second 85%, Final 40%)
 *  13. Fee Payments (mixed patterns: fully paid / partial / defaulter)
 *  14. Daily Attendance + Summaries (~120 school days)
 *
 * Run: npx tsx prisma/seed-all.ts
 */

import { PrismaClient, AttendanceStatus } from "@prisma/client";
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

function bsDateForMonth(monthIndex: number, day = 15): string {
  return `2082/${String(monthIndex + 1).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

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

let receiptCounter = 10000;
function nextReceipt(): string { return `RCP-${String(++receiptCounter).padStart(5, "0")}`; }

const NEPALI_MONTHS = ["Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];
const gradeNames = ["Nursery", "LKG", "UKG", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// ─── Subject definitions ────────────────────────────────

const subjectSets: Record<string, { name: string; nameNp: string; fullTheory: number; fullPractical: number; passMarks: number }[]> = {
  nursery: [
    { name: "English", nameNp: "अंग्रेजी", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "Nepali", nameNp: "नेपाली", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "Mathematics", nameNp: "गणित", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "Creative Arts", nameNp: "सिर्जनात्मक कला", fullTheory: 50, fullPractical: 0, passMarks: 20 },
  ],
  lower: [
    { name: "English", nameNp: "अंग्रेजी", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "Nepali", nameNp: "नेपाली", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "Mathematics", nameNp: "गणित", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "Creative Arts", nameNp: "सिर्जनात्मक कला", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "EVS", nameNp: "वातावरण शिक्षा", fullTheory: 50, fullPractical: 0, passMarks: 20 },
  ],
  primary: [
    { name: "English", nameNp: "अंग्रेजी", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Nepali", nameNp: "नेपाली", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Mathematics", nameNp: "गणित", fullTheory: 100, fullPractical: 0, passMarks: 40 },
    { name: "Science", nameNp: "विज्ञान", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Social Studies", nameNp: "सामाजिक अध्ययन", fullTheory: 100, fullPractical: 0, passMarks: 40 },
    { name: "Moral Education", nameNp: "नैतिक शिक्षा", fullTheory: 50, fullPractical: 0, passMarks: 20 },
    { name: "HPE", nameNp: "शारीरिक शिक्षा", fullTheory: 50, fullPractical: 50, passMarks: 30 },
  ],
  middle: [
    { name: "English", nameNp: "अंग्रेजी", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Nepali", nameNp: "नेपाली", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Mathematics", nameNp: "गणित", fullTheory: 100, fullPractical: 0, passMarks: 40 },
    { name: "Science", nameNp: "विज्ञान", fullTheory: 75, fullPractical: 25, passMarks: 40 },
    { name: "Social Studies", nameNp: "सामाजिक अध्ययन", fullTheory: 100, fullPractical: 0, passMarks: 40 },
    { name: "Computer", nameNp: "कम्प्युटर", fullTheory: 50, fullPractical: 50, passMarks: 40 },
    { name: "HPE", nameNp: "शारीरिक शिक्षा", fullTheory: 75, fullPractical: 25, passMarks: 30 },
    { name: "Opt. Math", nameNp: "ऐच्छिक गणित", fullTheory: 100, fullPractical: 0, passMarks: 40 },
  ],
  secondary: [
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

function getSubjectSet(g: string) {
  if (g === "Nursery") return subjectSets.nursery;
  if (["LKG", "UKG"].includes(g)) return subjectSets.lower;
  if (["I", "II", "III", "IV", "V"].includes(g)) return subjectSets.primary;
  if (["VI", "VII", "VIII"].includes(g)) return subjectSets.middle;
  return subjectSets.secondary;
}

// ─── Name generators ────────────────────────────────────

const maleFirst: [string, string][] = [["Aarav","आरव"],["Bibek","विवेक"],["Chirag","चिराग"],["Dipesh","दिपेश"],["Eshan","एशान"],["Firoj","फिरोज"],["Ganesh","गणेश"],["Hari","हरि"],["Ishan","इशान"],["Janak","जनक"],["Kamal","कमल"],["Lokesh","लोकेश"],["Manish","मनिष"],["Nabin","नबिन"],["Om","ओम"],["Prakash","प्रकाश"],["Rajesh","राजेश"],["Santosh","सन्तोष"],["Tilak","तिलक"],["Umesh","उमेश"]];
const femaleFirst: [string, string][] = [["Aasha","आशा"],["Bipasha","बिपाशा"],["Chanda","चन्दा"],["Deepa","दीपा"],["Elina","एलिना"],["Fulkumari","फूलकुमारी"],["Gita","गीता"],["Hema","हेमा"],["Indira","इन्दिरा"],["Jyoti","ज्योती"],["Kamala","कमला"],["Laxmi","लक्ष्मी"],["Maya","माया"],["Nisha","निशा"],["Oja","ओजा"],["Puja","पूजा"],["Rita","रिता"],["Sunita","सुनिता"],["Tara","तारा"],["Uma","उमा"]];
const lastN: [string, string][] = [["Sharma","शर्मा"],["Thapa","थापा"],["Basnet","बस्नेत"],["Karki","कार्की"],["Gurung","गुरुङ"],["Tamang","तामाङ"],["Shrestha","श्रेष्ठ"],["Rai","राई"],["Limbu","लिम्बू"],["Magar","मगर"],["Poudel","पौडेल"],["Adhikari","अधिकारी"],["Bhattarai","भट्टराई"],["Koirala","कोइराला"],["Dahal","दाहाल"],["Ghimire","घिमिरे"],["Subedi","सुवेदी"],["Tiwari","तिवारी"],["Regmi","रेग्मी"],["Khadka","खड्का"]];
const fatherFirst: [string, string][] = [["Ram","राम"],["Shyam","श्याम"],["Hari","हरि"],["Krishna","कृष्ण"],["Gopal","गोपाल"],["Mohan","मोहन"],["Bishnu","विष्णु"],["Ganesh","गणेश"],["Indra","इन्द्र"],["Surya","सूर्य"]];
const motherFirst: [string, string][] = [["Sita","सीता"],["Gita","गीता"],["Maya","माया"],["Laxmi","लक्ष्मी"],["Durga","दुर्गा"],["Parvati","पार्वती"],["Saraswati","सरस्वती"],["Kamala","कमला"],["Radha","राधा"],["Sumitra","सुमित्रा"]];

function makeName(idx: number, gender: "Male" | "Female") {
  const f = gender === "Male" ? maleFirst[idx % maleFirst.length] : femaleFirst[idx % femaleFirst.length];
  const l = lastN[idx % lastN.length];
  return { name: `${f[0]} ${l[0]}`, nameNp: `${f[1]} ${l[1]}`, fatherName: `${fatherFirst[idx % fatherFirst.length][0]} ${l[0]}`, motherName: `${motherFirst[idx % motherFirst.length][0]} ${l[0]}` };
}

// ─── Teacher data ───────────────────────────────────────

const classTeachers = [
  { name: "Sunita Pandey", nameNp: "सुनिता पाण्डे", email: "sunita.pandey@school.edu.np", grade: "Nursery" },
  { name: "Ramesh Bhandari", nameNp: "रमेश भण्डारी", email: "ramesh.bhandari@school.edu.np", grade: "LKG" },
  { name: "Mina Karki", nameNp: "मिना कार्की", email: "mina.karki@school.edu.np", grade: "UKG" },
  { name: "Kiran Thapa", nameNp: "किरण थापा", email: "kiran.thapa@school.edu.np", grade: "I" },
  { name: "Sujata Shrestha", nameNp: "सुजाता श्रेष्ठ", email: "sujata.shrestha@school.edu.np", grade: "II" },
  { name: "Deepak Adhikari", nameNp: "दीपक अधिकारी", email: "deepak.adhikari@school.edu.np", grade: "III" },
  { name: "Anita Gurung", nameNp: "अनिता गुरुङ", email: "anita.gurung@school.edu.np", grade: "IV" },
  { name: "Bikash Tamang", nameNp: "विकास तामाङ", email: "bikash.tamang@school.edu.np", grade: "V" },
  { name: "Priya Rai", nameNp: "प्रिया राई", email: "priya.rai@school.edu.np", grade: "VI" },
  { name: "Suresh Magar", nameNp: "सुरेश मगर", email: "suresh.magar@school.edu.np", grade: "VII" },
  { name: "Ram Sharma", nameNp: "राम शर्मा", email: "ram.sharma@school.edu.np", grade: "VIII" },
  { name: "Nirmala Poudel", nameNp: "निर्मला पौडेल", email: "nirmala.poudel@school.edu.np", grade: "IX" },
  { name: "Bijaya Koirala", nameNp: "विजय कोइराला", email: "bijaya.koirala@school.edu.np", grade: "X" },
];

const subjectSpecialists = [
  { name: "Sita Rai", email: "sita.rai@school.edu.np", subject: "English" },
  { name: "Dinesh KC", email: "dinesh.kc@school.edu.np", subject: "Mathematics" },
  { name: "Poonam Thapa", email: "poonam.thapa@school.edu.np", subject: "Science" },
  { name: "Ashok Shrestha", email: "ashok.shrestha@school.edu.np", subject: "Social Studies" },
  { name: "Sarita Karki", email: "sarita.karki@school.edu.np", subject: "Computer" },
];

const sectionBTeachers = [
  { name: "Naresh Poudel", email: "naresh.poudel@school.edu.np", grade: "VI" },
  { name: "Kamala Gurung", email: "kamala.gurung@school.edu.np", grade: "VII" },
  { name: "Tilak Dahal", email: "tilak.dahal@school.edu.np", grade: "VIII" },
  { name: "Rekha Bhattarai", email: "rekha.bhattarai@school.edu.np", grade: "IX" },
  { name: "Gopal Subedi", email: "gopal.subedi@school.edu.np", grade: "X" },
];

// ─── Main ───────────────────────────────────────────────

async function main() {
  console.log("🌱 UNIFIED SEED — Creating everything from scratch...\n");
  const todayBS = getTodayBS();
  const pw = async (p: string) => bcrypt.hash(p, 10);

  // ══════════════════════════════════════════════════════
  // 1. SUPER ADMIN
  // ══════════════════════════════════════════════════════
  await prisma.user.upsert({
    where: { email: "superadmin@zentaralabs.com" },
    update: { role: "SUPER_ADMIN", schoolId: null },
    create: { email: "superadmin@zentaralabs.com", password: await pw("superadmin123"), role: "SUPER_ADMIN", schoolId: null, isActive: true },
  });
  console.log("✅ Super Admin: superadmin@zentaralabs.com / superadmin123");

  // ══════════════════════════════════════════════════════
  // 2. SCHOOL + ADMIN + ACCOUNTANT
  // ══════════════════════════════════════════════════════
  const school = await prisma.school.upsert({
    where: { id: "default-school" },
    update: {},
    create: { id: "default-school", name: "Shree Himalayan Secondary School", nameNp: "श्री हिमालयन माध्यमिक विद्यालय", address: "Kathmandu, Nepal", phone: "01-4XXXXXX", estdYear: "2045", motto: "शिक्षा नै शक्ति हो", isActive: true },
  });

  await prisma.reportCardSettings.upsert({
    where: { schoolId: school.id },
    update: {},
    create: { schoolId: school.id },
  });

  await prisma.user.upsert({
    where: { email: "admin@school.edu.np" },
    update: {},
    create: { email: "admin@school.edu.np", password: await pw("admin123"), role: "ADMIN", schoolId: school.id, isActive: true },
  });

  await prisma.user.upsert({
    where: { email: "accountant@school.edu.np" },
    update: {},
    create: { email: "accountant@school.edu.np", password: await pw("accountant123"), role: "ACCOUNTANT", schoolId: school.id, isActive: true },
  });
  console.log(`✅ School: ${school.name}`);
  console.log("✅ Admin: admin@school.edu.np / admin123");
  console.log("✅ Accountant: accountant@school.edu.np / accountant123");

  // ══════════════════════════════════════════════════════
  // 3. ACADEMIC YEAR + EXAM TYPES
  // ══════════════════════════════════════════════════════
  const year = await prisma.academicYear.upsert({
    where: { yearBS_schoolId: { yearBS: "2081", schoolId: school.id } },
    update: {},
    create: { yearBS: "2081", startDate: "2081/01/01", endDate: "2081/12/30", isActive: true, schoolId: school.id },
  });

  const examTypeData = [
    { name: "First Terminal", displayOrder: 1 },
    { name: "Second Terminal", displayOrder: 2 },
    { name: "Final", displayOrder: 3 },
  ];
  const examTypes: any[] = [];
  for (const et of examTypeData) {
    const created = await prisma.examType.upsert({
      where: { name_academicYearId: { name: et.name, academicYearId: year.id } },
      update: {},
      create: { name: et.name, displayOrder: et.displayOrder, academicYearId: year.id },
    });
    examTypes.push(created);
  }
  console.log(`✅ Academic Year: ${year.yearBS} | Exams: ${examTypes.map(e => e.name).join(", ")}`);

  // ══════════════════════════════════════════════════════
  // 4. GRADES + SECTIONS + 5. SUBJECTS + 6. GRADING POLICIES
  // ══════════════════════════════════════════════════════
  const gradeMap: Record<string, any> = {};
  const subjectMap: Record<string, any[]> = {};

  for (let i = 0; i < gradeNames.length; i++) {
    const gn = gradeNames[i];
    const grade = await prisma.grade.upsert({
      where: { name_academicYearId: { name: gn, academicYearId: year.id } },
      update: {},
      create: { name: gn, displayOrder: i, academicYearId: year.id },
    });
    gradeMap[gn] = grade;

    // Sections A & B
    for (const sn of ["A", "B"]) {
      await prisma.section.upsert({
        where: { name_gradeId: { name: sn, gradeId: grade.id } },
        update: {},
        create: { name: sn, gradeId: grade.id },
      });
    }

    // Subjects
    const subs = getSubjectSet(gn);
    subjectMap[gn] = [];
    for (let j = 0; j < subs.length; j++) {
      const s = subs[j];
      const sub = await prisma.subject.upsert({
        where: { name_gradeId: { name: s.name, gradeId: grade.id } },
        update: {},
        create: { name: s.name, nameNp: s.nameNp, fullTheoryMarks: s.fullTheory, fullPracticalMarks: s.fullPractical, passMarks: s.passMarks, displayOrder: j + 1, gradeId: grade.id },
      });
      subjectMap[gn].push(sub);
    }

    // Grading policy
    for (const et of examTypes) {
      const w = et.name === "Final" ? 50 : et.name.includes("Second") ? 30 : 20;
      await prisma.gradingPolicy.upsert({
        where: { examTypeId_gradeId: { examTypeId: et.id, gradeId: grade.id } },
        update: {},
        create: { examTypeId: et.id, gradeId: grade.id, weightagePercent: w },
      });
    }
  }
  console.log(`✅ ${gradeNames.length} grades with sections, subjects, grading policies`);

  // ══════════════════════════════════════════════════════
  // 7. EXAM ROOMS
  // ══════════════════════════════════════════════════════
  const roomNames = ["Hall A", "Hall B", "Room 101", "Room 102"];
  for (let i = 0; i < roomNames.length; i++) {
    await prisma.examRoom.upsert({
      where: { id: `room-${i}` },
      update: {},
      create: { id: `room-${i}`, name: roomNames[i], capacity: 40, displayOrder: i, schoolId: school.id },
    });
  }
  console.log("✅ 4 exam rooms");

  // ══════════════════════════════════════════════════════
  // 8. TEACHERS
  // ══════════════════════════════════════════════════════
  const hashedTeacherPw = await pw("teacher123");

  // Helper to create teacher + user + assignments
  async function createTeacher(data: { name: string; nameNp?: string; email: string }, id: string) {
    const teacher = await prisma.teacher.upsert({
      where: { id },
      update: {},
      create: { id, name: data.name, nameNp: data.nameNp, email: data.email, phone: "98XXXXXXXX", schoolId: school.id },
    });
    await prisma.user.upsert({
      where: { email: data.email },
      update: {},
      create: { email: data.email, password: hashedTeacherPw, role: "TEACHER", teacherId: teacher.id, schoolId: school.id, isActive: true },
    });
    return teacher;
  }

  // Class teachers (Section A)
  for (const ct of classTeachers) {
    const tid = `teacher-${ct.email.split("@")[0]}`;
    const teacher = await createTeacher(ct, tid);
    const grade = gradeMap[ct.grade];
    const sectionA = await prisma.section.findFirst({ where: { name: "A", gradeId: grade.id } });
    if (sectionA) {
      // Class teacher assignment
      const existing = await prisma.teacherAssignment.findFirst({ where: { sectionId: sectionA.id, isClassTeacher: true } });
      if (!existing) {
        await prisma.teacherAssignment.create({ data: { teacherId: teacher.id, sectionId: sectionA.id, subjectId: null, isClassTeacher: true } });
      }
      // Subject assignments
      for (const sub of subjectMap[ct.grade]) {
        try {
          await prisma.teacherAssignment.upsert({
            where: { teacherId_sectionId_subjectId: { teacherId: teacher.id, sectionId: sectionA.id, subjectId: sub.id } },
            update: {},
            create: { teacherId: teacher.id, sectionId: sectionA.id, subjectId: sub.id, isClassTeacher: false },
          });
        } catch (_) {}
      }
    }
  }

  // Subject specialists (upper grades, both sections)
  for (const sp of subjectSpecialists) {
    const tid = `teacher-${sp.email.split("@")[0]}`;
    const teacher = await createTeacher(sp, tid);
    for (const gn of ["VI", "VII", "VIII", "IX", "X"]) {
      const grade = gradeMap[gn];
      const sections = await prisma.section.findMany({ where: { gradeId: grade.id } });
      const sub = subjectMap[gn].find((s: any) => s.name === sp.subject);
      if (!sub) continue;
      for (const sec of sections) {
        try {
          await prisma.teacherAssignment.upsert({
            where: { teacherId_sectionId_subjectId: { teacherId: teacher.id, sectionId: sec.id, subjectId: sub.id } },
            update: {},
            create: { teacherId: teacher.id, sectionId: sec.id, subjectId: sub.id, isClassTeacher: false },
          });
        } catch (_) {}
      }
    }
  }

  // Section B class teachers
  for (const bt of sectionBTeachers) {
    const tid = `teacher-${bt.email.split("@")[0]}`;
    const teacher = await createTeacher(bt, tid);
    const grade = gradeMap[bt.grade];
    const sectionB = await prisma.section.findFirst({ where: { name: "B", gradeId: grade.id } });
    if (sectionB) {
      const existing = await prisma.teacherAssignment.findFirst({ where: { sectionId: sectionB.id, isClassTeacher: true } });
      if (!existing) {
        await prisma.teacherAssignment.create({ data: { teacherId: teacher.id, sectionId: sectionB.id, subjectId: null, isClassTeacher: true } });
      }
    }
  }
  console.log(`✅ ${classTeachers.length + subjectSpecialists.length + sectionBTeachers.length} teachers with assignments`);

  // ══════════════════════════════════════════════════════
  // 9. STUDENTS + 10. PARENTS
  // ══════════════════════════════════════════════════════
  const hashedStudentPw = await pw("student123");
  const hashedParentPw = await pw("parent123");
  let totalStudents = 0, totalParents = 0;

  for (const gn of gradeNames) {
    const grade = gradeMap[gn];
    const sections = await prisma.section.findMany({ where: { gradeId: grade.id }, orderBy: { name: "asc" } });
    const dobFrom = 2082 - gradeNames.indexOf(gn) - 6;

    for (const section of sections) {
      for (let i = 0; i < 10; i++) {
        const gender: "Male" | "Female" = i % 2 === 0 ? "Male" : "Female";
        const nd = makeName(gradeNames.indexOf(gn) * 20 + (section.name === "B" ? 10 : 0) + i, gender);
        const sid = `student-${gn}-${section.name}-${i}`;

        const student = await prisma.student.upsert({
          where: { id: sid },
          update: {},
          create: { id: sid, name: nd.name, nameNp: nd.nameNp, rollNo: i + 1, gender, dateOfBirth: randomBSDate(dobFrom, dobFrom + 1), fatherName: nd.fatherName, motherName: nd.motherName, guardianPhone: `98${String(Math.floor(10000000 + Math.random() * 90000000))}`, address: "Kathmandu, Nepal", sectionId: section.id, isActive: true, status: "ACTIVE" },
        });

        // Student user
        const userEmail = `${nd.name.toLowerCase().replace(/\s+/g, ".")}.${sid.slice(-6)}@school.edu.np`;
        await prisma.user.upsert({
          where: { email: userEmail },
          update: {},
          create: { email: userEmail, password: hashedStudentPw, role: "STUDENT", studentId: student.id, schoolId: school.id, isActive: true },
        });

        // Admission record
        await prisma.admission.upsert({
          where: { id: `adm-${sid}` },
          update: {},
          create: { id: `adm-${sid}`, studentName: student.name, studentNameNp: student.nameNp, dateOfBirth: student.dateOfBirth, gender: student.gender, fatherName: student.fatherName, motherName: student.motherName, guardianPhone: student.guardianPhone, address: student.address, applyingForGradeId: grade.id, academicYearId: year.id, status: "ENROLLED", appliedDate: todayBS, reviewedDate: todayBS, remarks: "Seeded" },
        });

        totalStudents++;

        // Parent (every 2 students share)
        if (i % 2 === 0) {
          const parentEmail = `parent.${gn.toLowerCase()}.${section.name.toLowerCase()}.${Math.floor(i / 2)}@school.edu.np`;
          const parentUser = await prisma.user.upsert({
            where: { email: parentEmail },
            update: {},
            create: { email: parentEmail, password: hashedParentPw, role: "PARENT", schoolId: school.id, isActive: true },
          });
          await prisma.parentStudent.upsert({
            where: { parentId_studentId: { parentId: parentUser.id, studentId: student.id } },
            update: {},
            create: { parentId: parentUser.id, studentId: student.id, relationship: "Father" },
          });
          totalParents++;
        } else {
          const siblingId = `student-${gn}-${section.name}-${i - 1}`;
          const sibLink = await prisma.parentStudent.findFirst({ where: { studentId: siblingId } });
          if (sibLink) {
            await prisma.parentStudent.upsert({
              where: { parentId_studentId: { parentId: sibLink.parentId, studentId: student.id } },
              update: {},
              create: { parentId: sibLink.parentId, studentId: student.id, relationship: "Mother" },
            });
          }
        }
      }
    }
  }
  console.log(`✅ ${totalStudents} students, ${totalParents} parent accounts`);

  // ══════════════════════════════════════════════════════
  // 11. FEE CATEGORIES + STRUCTURES
  // ══════════════════════════════════════════════════════
  const tuitionCat = await prisma.feeCategory.upsert({
    where: { name_schoolId: { name: "Tuition Fee", schoolId: school.id } },
    update: {},
    create: { name: "Tuition Fee", description: "Monthly tuition fee", schoolId: school.id },
  });
  const admissionCat = await prisma.feeCategory.upsert({
    where: { name_schoolId: { name: "Admission Fee", schoolId: school.id } },
    update: {},
    create: { name: "Admission Fee", description: "One-time admission fee", schoolId: school.id },
  });

  const feeAmounts: Record<string, number> = { Nursery: 1500, LKG: 1500, UKG: 1500, I: 2000, II: 2000, III: 2000, IV: 2000, V: 2000, VI: 2500, VII: 2500, VIII: 2500, IX: 3000, X: 3000 };

  for (const gn of gradeNames) {
    const grade = gradeMap[gn];
    await prisma.feeStructure.upsert({
      where: { feeCategoryId_gradeId_academicYearId_examTypeId: { feeCategoryId: tuitionCat.id, gradeId: grade.id, academicYearId: year.id, examTypeId: "" } },
      update: {},
      create: { feeCategoryId: tuitionCat.id, gradeId: grade.id, academicYearId: year.id, amount: feeAmounts[gn] || 2000, frequency: "MONTHLY" },
    }).catch(async () => {
      // Unique constraint might fail with empty examTypeId, use findFirst + create
      const existing = await prisma.feeStructure.findFirst({ where: { feeCategoryId: tuitionCat.id, gradeId: grade.id, academicYearId: year.id, examTypeId: null } });
      if (!existing) {
        await prisma.feeStructure.create({ data: { feeCategoryId: tuitionCat.id, gradeId: grade.id, academicYearId: year.id, amount: feeAmounts[gn] || 2000, frequency: "MONTHLY" } });
      }
    });
    const existingAdm = await prisma.feeStructure.findFirst({ where: { feeCategoryId: admissionCat.id, gradeId: grade.id, academicYearId: year.id } });
    if (!existingAdm) {
      await prisma.feeStructure.create({ data: { feeCategoryId: admissionCat.id, gradeId: grade.id, academicYearId: year.id, amount: 5000, frequency: "ONE_TIME" } });
    }
  }
  console.log("✅ Fee categories + structures for all grades");

  // ══════════════════════════════════════════════════════
  // 12. MARKS
  // ══════════════════════════════════════════════════════
  console.log("\n📝 Seeding marks...");
  let marksCount = 0;
  const firstTerm = examTypes.find((e: any) => e.name.includes("First"));
  const secondTerm = examTypes.find((e: any) => e.name.includes("Second"));
  const finalTerm = examTypes.find((e: any) => e.name === "Final");

  for (const gn of gradeNames) {
    const grade = gradeMap[gn];
    const sections = await prisma.section.findMany({ where: { gradeId: grade.id }, include: { students: { where: { isActive: true }, orderBy: { rollNo: "asc" } } } });

    for (const section of sections) {
      for (let i = 0; i < section.students.length; i++) {
        const student = section.students[i];
        const q = studentQuality(i);

        for (const sub of subjectMap[gn]) {
          // First Terminal — all
          if (firstTerm) {
            const absent = q === "low" && i % 7 === 4;
            await prisma.mark.upsert({
              where: { studentId_subjectId_examTypeId_academicYearId: { studentId: student.id, subjectId: sub.id, examTypeId: firstTerm.id, academicYearId: year.id } },
              update: {},
              create: { studentId: student.id, subjectId: sub.id, examTypeId: firstTerm.id, academicYearId: year.id, theoryMarks: absent ? null : randMarks(sub.fullTheoryMarks, q), practicalMarks: absent ? null : (sub.fullPracticalMarks > 0 ? randMarks(sub.fullPracticalMarks, q) : 0), isAbsent: absent },
            });
            marksCount++;
          }
          // Second Terminal — 85%
          if (secondTerm && i % 6 !== 5) {
            const absent = q === "low" && i % 9 === 3;
            await prisma.mark.upsert({
              where: { studentId_subjectId_examTypeId_academicYearId: { studentId: student.id, subjectId: sub.id, examTypeId: secondTerm.id, academicYearId: year.id } },
              update: {},
              create: { studentId: student.id, subjectId: sub.id, examTypeId: secondTerm.id, academicYearId: year.id, theoryMarks: absent ? null : randMarks(sub.fullTheoryMarks, q), practicalMarks: absent ? null : (sub.fullPracticalMarks > 0 ? randMarks(sub.fullPracticalMarks, q) : 0), isAbsent: absent },
            });
            marksCount++;
          }
          // Final — 40%
          if (finalTerm && i % 3 === 0) {
            await prisma.mark.upsert({
              where: { studentId_subjectId_examTypeId_academicYearId: { studentId: student.id, subjectId: sub.id, examTypeId: finalTerm.id, academicYearId: year.id } },
              update: {},
              create: { studentId: student.id, subjectId: sub.id, examTypeId: finalTerm.id, academicYearId: year.id, theoryMarks: randMarks(sub.fullTheoryMarks, q), practicalMarks: sub.fullPracticalMarks > 0 ? randMarks(sub.fullPracticalMarks, q) : 0, isAbsent: false },
            });
            marksCount++;
          }
        }
      }
    }
    process.stdout.write(`  ${gn} ✓ `);
  }
  console.log(`\n✅ ${marksCount} mark records`);

  // ══════════════════════════════════════════════════════
  // 13. FEE PAYMENTS
  // ══════════════════════════════════════════════════════
  console.log("\n💰 Seeding fee payments...");
  let paymentCount = 0;

  for (const gn of gradeNames) {
    const grade = gradeMap[gn];
    const sections = await prisma.section.findMany({ where: { gradeId: grade.id }, include: { students: { where: { isActive: true }, orderBy: { rollNo: "asc" } } } });
    const amount = feeAmounts[gn] || 2000;

    for (const section of sections) {
      for (let i = 0; i < section.students.length; i++) {
        const student = section.students[i];
        const pattern = i % 5;
        let monthsToPay: string[] = [];
        if (pattern === 0) monthsToPay = NEPALI_MONTHS.slice(0, 12);      // fully paid
        else if (pattern === 1) monthsToPay = NEPALI_MONTHS.slice(0, 9);  // 3 arrears
        else if (pattern === 2) monthsToPay = NEPALI_MONTHS.slice(0, 3);  // heavy arrears
        else if (pattern === 3) monthsToPay = NEPALI_MONTHS.slice(0, 12); // fully paid + advance
        // pattern 4 = defaulter

        for (let m = 0; m < monthsToPay.length; m++) {
          const mi = NEPALI_MONTHS.indexOf(monthsToPay[m]);
          await prisma.feePayment.create({
            data: { studentId: student.id, feeCategoryId: tuitionCat.id, academicYearId: year.id, amount, paidMonth: monthsToPay[m], receiptNumber: nextReceipt(), paymentDate: bsDateForMonth(mi, rand(1, 25)), paymentMethod: ["CASH", "BANK", "CASH", "ONLINE"][m % 4] },
          });
          paymentCount++;
        }
      }
    }
    process.stdout.write(`  ${gn} ✓ `);
  }
  console.log(`\n✅ ${paymentCount} payment records`);

  // ══════════════════════════════════════════════════════
  // 14. ATTENDANCE
  // ══════════════════════════════════════════════════════
  console.log("\n📅 Seeding attendance...");

  // Generate ~200 school days for BS 2082
  const schoolDays: string[] = [];
  for (let month = 1; month <= 11; month++) {
    for (let day = 1; day <= 30; day++) {
      const wd = ((month - 1) * 30 + day) % 7;
      if (wd === 0 || wd === 6) continue;
      if (month === 6 && day >= 15 && day <= 25) continue; // Dashain
      if (month === 7 && day >= 1 && day <= 10) continue;
      if (month === 7 && day >= 20 && day <= 25) continue; // Tihar
      schoolDays.push(`2082/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`);
    }
  }

  let dailyCount = 0;
  for (const gn of gradeNames) {
    const grade = gradeMap[gn];
    const sections = await prisma.section.findMany({ where: { gradeId: grade.id }, include: { students: { where: { isActive: true }, orderBy: { rollNo: "asc" } } } });

    for (const section of sections) {
      for (let i = 0; i < section.students.length; i++) {
        const student = section.students[i];
        const rate = studentQuality(i) === "high" ? 0.96 : studentQuality(i) === "mid" ? 0.87 : 0.72;
        let presentCount = 0;

        const records = schoolDays.map((date, di) => {
          const pseudo = Math.sin(i * 17 + di * 31) * 0.5 + 0.5;
          const present = pseudo < rate;
          if (present) presentCount++;
          return { studentId: student.id, date, status: (present ? "PRESENT" : "ABSENT") as AttendanceStatus, academicYearId: year.id };
        });

        // Batch insert
        for (let c = 0; c < records.length; c += 50) {
          await prisma.dailyAttendance.createMany({ data: records.slice(c, c + 50), skipDuplicates: true });
        }
        dailyCount += records.length;

        // Summary
        await prisma.attendance.upsert({
          where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
          update: { totalDays: schoolDays.length, presentDays: presentCount, absentDays: schoolDays.length - presentCount },
          create: { studentId: student.id, academicYearId: year.id, totalDays: schoolDays.length, presentDays: presentCount, absentDays: schoolDays.length - presentCount },
        });
      }
    }
    process.stdout.write(`  ${gn} ✓ `);
  }
  console.log(`\n✅ ${dailyCount} daily attendance records, ${totalStudents} summaries`);

  // ══════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════
  console.log(`
╔══════════════════════════════════════════╗
║          🎉  SEED COMPLETE!             ║
╠══════════════════════════════════════════╣
║  Super Admin : superadmin@zentaralabs.com║
║  Admin       : admin@school.edu.np       ║
║  Accountant  : accountant@school.edu.np  ║
║  Teacher     : ram.sharma@school.edu.np  ║
║  Student     : aarav.sharma.*@school...  ║
║  Parent      : parent.nursery.a.0@...    ║
║  All passwords: [role]123                ║
╠══════════════════════════════════════════╣
║  School      : ${school.name.padEnd(24)}║
║  Students    : ${String(totalStudents).padEnd(24)}║
║  Teachers    : ${String(classTeachers.length + subjectSpecialists.length + sectionBTeachers.length).padEnd(24)}║
║  Parents     : ${String(totalParents).padEnd(24)}║
║  Marks       : ${String(marksCount).padEnd(24)}║
║  Payments    : ${String(paymentCount).padEnd(24)}║
║  Attendance  : ${String(dailyCount).padEnd(24)}║
╚══════════════════════════════════════════╝
`);
}

main()
  .catch((e) => { console.error("❌ Seed error:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
