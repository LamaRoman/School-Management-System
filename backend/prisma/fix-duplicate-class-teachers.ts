/**
 * Cleanup: Remove duplicate class teacher assignments.
 * 
 * Run with: npx tsx prisma/fix-duplicate-class-teachers.ts
 * 
 * This script:
 * 1. Finds all class teacher assignments grouped by teacherId + sectionId
 * 2. If duplicates exist, keeps the first one and deletes the rest
 * 3. Ensures kept record has subjectId = null (class teacher shouldn't have a subject)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find all class teacher assignments
  const classTeacherRecords = await prisma.teacherAssignment.findMany({
    where: { isClassTeacher: true },
    orderBy: { createdAt: "asc" },
  });

  // Group by teacherId + sectionId
  const groups = new Map<string, typeof classTeacherRecords>();
  for (const r of classTeacherRecords) {
    const key = `${r.teacherId}::${r.sectionId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  let deletedCount = 0;
  let fixedCount = 0;

  for (const [key, records] of groups) {
    if (records.length > 1) {
      // Keep the first, delete the rest
      const [keep, ...duplicates] = records;
      for (const dup of duplicates) {
        await prisma.teacherAssignment.delete({ where: { id: dup.id } });
        deletedCount++;
      }
      console.log(`Deleted ${duplicates.length} duplicate(s) for ${key}`);

      // Ensure kept record has subjectId = null
      if (keep.subjectId !== null) {
        await prisma.teacherAssignment.update({
          where: { id: keep.id },
          data: { subjectId: null },
        });
        fixedCount++;
        console.log(`  Fixed subjectId → null for ${key}`);
      }
    } else if (records.length === 1 && records[0].subjectId !== null) {
      // Single record but has subjectId — fix it
      await prisma.teacherAssignment.update({
        where: { id: records[0].id },
        data: { subjectId: null },
      });
      fixedCount++;
      console.log(`Fixed subjectId → null for ${key}`);
    }
  }

  // Also check for sections with multiple different class teachers
  const sectionGroups = new Map<string, typeof classTeacherRecords>();
  const remaining = await prisma.teacherAssignment.findMany({
    where: { isClassTeacher: true },
    include: { teacher: { select: { name: true } }, section: { include: { grade: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  for (const r of remaining) {
    const key = r.sectionId;
    if (!sectionGroups.has(key)) sectionGroups.set(key, []);
    sectionGroups.get(key)!.push(r);
  }

  for (const [sectionId, records] of sectionGroups) {
    if (records.length > 1) {
      const first = records[0] as any;
      console.log(`⚠️  Section ${first.section.grade.name}-${first.section.name} has ${records.length} class teachers:`);
      for (const r of records) {
        console.log(`   - ${(r as any).teacher.name} (${r.id})`);
      }
      console.log(`   Keeping first, removing rest...`);
      for (let i = 1; i < records.length; i++) {
        await prisma.teacherAssignment.delete({ where: { id: records[i].id } });
        deletedCount++;
      }
    }
  }

  console.log(`\nDone. Deleted ${deletedCount} duplicate(s), fixed ${fixedCount} subjectId(s).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
