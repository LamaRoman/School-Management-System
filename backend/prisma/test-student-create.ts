import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function test() {
  const year = await p.academicYear.findFirst({ where: { isActive: true } });
  if (!year) { console.log("No active year"); return; }

  const grade = await p.grade.findFirst({
    where: { name: "VIII", academicYearId: year.id },
    include: { sections: true },
  });
  if (!grade) { console.log("No grade VIII"); return; }

  const sec = grade.sections.find((s) => s.name === "A");
  if (!sec) { console.log("No section A"); return; }

  console.log("Section ID:", sec.id);

  try {
    const student = await p.student.create({
      data: {
        name: "Test Student",
        nameNp: "टेस्ट",
        sectionId: sec.id,
        rollNo: 999,
        dateOfBirth: "2065/01/01",
        gender: "Male",
        guardianName: "Test Guardian",
        guardianPhone: "9800000000",
        status: "ACTIVE",
      },
    });
    console.log("SUCCESS — created student:", student.id);
    // Clean up
    await p.student.delete({ where: { id: student.id } });
    console.log("Cleaned up test student");
  } catch (e: any) {
    console.log("FULL ERROR:");
    console.log(e.message);
  }

  await p.$disconnect();
}

test();