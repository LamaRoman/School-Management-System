/**
 * Import a class's marks from a JSON file into one section + exam.
 *
 *   # 1. DRY RUN (default): reads only, prints what would change
 *   npx tsx prisma/import-marks.ts --data <file.json> --section-id <id> --exam "First Terminal"
 *
 *   # 2. APPLY, after checking the dry run
 *   npx tsx prisma/import-marks.ts ... --apply
 *
 * Which database it talks to is whatever DATABASE_URL is in the environment (backend/.env by
 * default). To target production, set DATABASE_URL to the production URL for that one command.
 * The data file holds real students' names and marks: keep it OUT of git.
 *
 * Optional: --full-marks 50 (default 50).
 *
 * Data file shape:
 *   { "subjects": ["English", "Math"], "rows": [ { "rollNo": 1, "name": "A B", "marks": { "English": 18, "Math": 10 } } ] }
 *
 * Find a section id with:  npx tsx prisma/import-marks.ts --list-sections [--school-code XYZ]
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { applyPlan, buildPlan, type ImportData } from "../src/services/marksImport.service";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const prisma = new PrismaClient();
  try {
    const host = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/[/?].*$/, "");
    console.log(`Database: ${host || "(DATABASE_URL not set)"}`);

    if (flag("list-sections")) {
      const code = arg("school-code");
      const sections = await prisma.section.findMany({
        where: code ? { grade: { academicYear: { school: { code } } } } : {},
        include: {
          grade: { include: { academicYear: { include: { school: { select: { name: true, code: true } } } } } },
          teachers: { where: { isClassTeacher: true }, include: { teacher: { select: { name: true } } } },
          _count: { select: { students: true } },
        },
        orderBy: [{ grade: { displayOrder: "asc" } }, { name: "asc" }],
      });
      for (const s of sections) {
        console.log(`${s.id}  ${s.grade.academicYear.school.name} ${s.grade.academicYear.yearBS}${s.grade.academicYear.isActive ? "*" : ""}  ${s.grade.name}-${s.name}  (${s._count.students} students)  class teacher: ${[...new Set(s.teachers.map((t) => t.teacher.name))].join(", ") || "none"}`);
      }
      return;
    }

    const file = arg("data"), sectionId = arg("section-id"), exam = arg("exam");
    if (!file || !sectionId || !exam) {
      console.error('Usage: --data <file.json> --section-id <id> --exam "<exam name>" [--apply]   (or --list-sections)');
      process.exit(2);
    }
    const data: ImportData = JSON.parse(readFileSync(file, "utf8"));
    const opts = { fullMarks: Number(arg("full-marks") ?? 50) };
    const target = { sectionId, examName: exam };

    const plan = await buildPlan(prisma, target, data, opts);
    console.log(`\nSchool:        ${plan.section.school} (${plan.section.academicYear})`);
    console.log(`Class:         ${plan.section.label}`);
    console.log(`Class teacher: ${plan.classTeachers.join(", ") || "(none assigned)"}`);
    console.log(`Exam:          ${plan.exam.name}`);
    console.log(`\nSubjects (full marks ${opts.fullMarks}):`);
    for (const s of plan.subjects) console.log(`  ${s.sheet.padEnd(10)} -> ${s.action === "existing" ? `existing "${s.name}"` : `WILL CREATE "${s.name}"`}`);
    const count = (a: string) => plan.students.filter((s) => s.action === a).length;
    console.log(`\nStudents: ${plan.students.length} in sheet — ${count("create")} to create, ${count("exists")} already there, ${count("conflict")} conflicts`);
    console.log(`Marks:    ${plan.marks.create} to create, ${plan.marks.update} to change, ${plan.marks.unchanged} already identical`);
    if (plan.problems.length) {
      console.log(`\nPROBLEMS (${plan.problems.length}) — nothing can be applied until these are fixed:`);
      for (const p of plan.problems) console.log(`  - ${p}`);
      process.exit(1);
    }

    if (!flag("apply")) {
      console.log("\nDry run only — nothing was written. Re-run with --apply to write this.");
      return;
    }
    const done = await applyPlan(prisma, target, data, opts);
    console.log(`\nApplied: ${done.studentsCreated} students and ${done.subjectsCreated} subjects created, ${done.marksWritten} marks written.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
