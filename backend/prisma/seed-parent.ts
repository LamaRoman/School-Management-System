import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🔗 Seeding Parent user...\n");

  // Find two students to link — Aarav Sharma (roll 1) and Bipasha Thapa (roll 2)
  const aarav = await prisma.student.findFirst({
    where: { name: { contains: "Aarav" } },
    include: { section: { include: { grade: true } } },
  });

  const bipasha = await prisma.student.findFirst({
    where: { name: { contains: "Bipasha" } },
    include: { section: { include: { grade: true } } },
  });

  if (!aarav) {
    console.log("❌ Could not find student Aarav. Run seed-users.ts first.");
    return;
  }

  console.log(`  Found student: ${aarav.name} (${aarav.section.grade.name} - ${aarav.section.name})`);
  if (bipasha) {
    console.log(`  Found student: ${bipasha.name} (${bipasha.section.grade.name} - ${bipasha.section.name})`);
  }

  const parentEmail = "parent@school.edu.np";
  const parentPassword = "parent123";
  const hashedPw = await bcrypt.hash(parentPassword, 10);

  // Upsert parent user
  const parentUser = await prisma.user.upsert({
    where: { email: parentEmail },
    update: { password: hashedPw, role: "PARENT", isActive: true },
    create: {
      email: parentEmail,
      password: hashedPw,
      role: "PARENT",
      isActive: true,
    },
  });
  console.log(`\n✅ Parent user created/updated: ${parentUser.email}`);

  // Link to Aarav
  await prisma.parentStudent.upsert({
    where: {
      parentId_studentId: { parentId: parentUser.id, studentId: aarav.id },
    },
    update: { relationship: "FATHER" },
    create: {
      parentId: parentUser.id,
      studentId: aarav.id,
      relationship: "FATHER",
    },
  });
  console.log(`  ✅ Linked to ${aarav.name} (FATHER)`);

  // Link to Bipasha (sibling scenario)
  if (bipasha) {
    await prisma.parentStudent.upsert({
      where: {
        parentId_studentId: { parentId: parentUser.id, studentId: bipasha.id },
      },
      update: { relationship: "FATHER" },
      create: {
        parentId: parentUser.id,
        studentId: bipasha.id,
        relationship: "FATHER",
      },
    });
    console.log(`  ✅ Linked to ${bipasha.name} (FATHER)`);
  }

  console.log(`\n🎉 Parent Portal ready!`);
  console.log(`   Login: ${parentEmail} / ${parentPassword}`);
  console.log(`   URL:   http://localhost:3000/parent`);
}

main()
  .catch((e) => console.error("❌ Error:", e))
  .finally(() => prisma.$disconnect());