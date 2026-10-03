import type { PrismaClient } from "@prisma/client";

// Import a class's marks from a sheet (roll no, name, one column per subject) into one
// section and one exam. Used by prisma/import-marks.ts, which is run by hand against a
// chosen database — so it is built to be safe to point at production:
//   - buildPlan() only READS and reports exactly what would change; applying is a separate step
//   - anything ambiguous (a roll number that belongs to a different student, a subject whose
//     full marks differ, a mark above full marks) is a "problem" and blocks applying
//   - applying is one transaction and idempotent: running it twice changes nothing the second time
//   - it never deletes anything

export interface ImportRow { rollNo: number; name: string; marks: Record<string, number | null> }
export interface ImportData { subjects: string[]; rows: ImportRow[] }
export interface ImportOptions { fullMarks: number; passMarks: number }

type Db = Pick<PrismaClient, "section" | "examType" | "subject" | "student" | "mark" | "$transaction">;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// Sheet headings are usually shortened ("Math", "Social").
const ALIASES: Record<string, string[]> = {
  math: ["mathematics", "maths"],
  maths: ["mathematics", "math"],
  social: ["socialstudies", "socialscience"],
  sst: ["socialstudies"],
  sci: ["science"],
};
// What a subject is called when the import has to create it (instead of the sheet's shorthand).
const CANONICAL: Record<string, string> = { math: "Mathematics", maths: "Mathematics", social: "Social Studies", sst: "Social Studies", sci: "Science" };
function candidates(sheetName: string): string[] {
  const n = norm(sheetName);
  return [n, ...(ALIASES[n] ?? [])];
}

export interface Plan {
  section: { id: string; label: string; school: string; academicYear: string };
  exam: { id: string; name: string };
  classTeachers: string[];
  subjects: { sheet: string; name: string; action: "existing" | "create"; fullMarks: number }[];
  students: { rollNo: number; name: string; action: "create" | "exists" | "conflict"; note?: string }[];
  marks: { create: number; update: number; unchanged: number };
  problems: string[];
}

export interface Target { sectionId: string; examName: string }

export async function buildPlan(db: Db, target: Target, data: ImportData, opts: ImportOptions): Promise<Plan> {
  const problems: string[] = [];

  const section = await db.section.findUnique({
    where: { id: target.sectionId },
    include: {
      grade: { include: { academicYear: { include: { school: { select: { name: true } } } }, subjects: true } },
      students: { select: { id: true, name: true, rollNo: true } },
      teachers: { where: { isClassTeacher: true }, include: { teacher: { select: { name: true } } } },
    },
  });
  if (!section) throw new Error(`No section with id ${target.sectionId}`);
  const year = section.grade.academicYear;

  const exam = await db.examType.findFirst({ where: { academicYearId: year.id, name: target.examName } });
  if (!exam) throw new Error(`No exam called "${target.examName}" in ${year.school.name} ${year.yearBS}`);

  // Subjects: match each sheet column to an existing subject of this grade, else plan to create it.
  const subjects: Plan["subjects"] = [];
  for (const sheet of data.subjects) {
    const wanted = candidates(sheet);
    const found = section.grade.subjects.find((s) => wanted.includes(norm(s.name)));
    if (found) {
      subjects.push({ sheet, name: found.name, action: "existing", fullMarks: found.fullTheoryMarks });
      if (found.fullTheoryMarks !== opts.fullMarks) {
        problems.push(`Subject "${found.name}" has full marks ${found.fullTheoryMarks} in the database but the sheet is out of ${opts.fullMarks}. Fix the subject first.`);
      }
      if (found.fullPracticalMarks > 0) problems.push(`Subject "${found.name}" has practical marks; this import only writes theory marks.`);
    } else {
      subjects.push({ sheet, name: CANONICAL[norm(sheet)] ?? sheet, action: "create", fullMarks: opts.fullMarks });
    }
  }

  // Students: by roll number within the section.
  const byRoll = new Map(section.students.filter((s) => s.rollNo != null).map((s) => [s.rollNo as number, s]));
  const byName = new Map(section.students.map((s) => [norm(s.name), s]));
  const seenRolls = new Set<number>();
  const students: Plan["students"] = data.rows.map((r) => {
    if (seenRolls.has(r.rollNo)) problems.push(`Roll number ${r.rollNo} appears twice in the sheet.`);
    seenRolls.add(r.rollNo);
    const atRoll = byRoll.get(r.rollNo);
    if (atRoll) {
      if (norm(atRoll.name) === norm(r.name)) return { rollNo: r.rollNo, name: r.name, action: "exists" as const };
      const note = `Roll ${r.rollNo} is already "${atRoll.name}" in this section`;
      problems.push(`${note}; the sheet says "${r.name}".`);
      return { rollNo: r.rollNo, name: r.name, action: "conflict" as const, note };
    }
    const sameName = byName.get(norm(r.name));
    if (sameName) {
      const note = `"${r.name}" is already in this section with roll ${sameName.rollNo ?? "none"}`;
      problems.push(`${note}; the sheet says roll ${r.rollNo}.`);
      return { rollNo: r.rollNo, name: r.name, action: "conflict" as const, note };
    }
    return { rollNo: r.rollNo, name: r.name, action: "create" as const };
  });

  // Marks: validate, then compare with what is stored.
  for (const r of data.rows) {
    for (const col of data.subjects) {
      const v = r.marks[col];
      if (v == null) continue;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) problems.push(`${r.name} / ${col}: "${v}" is not a valid mark.`);
      else if (v > opts.fullMarks) problems.push(`${r.name} / ${col}: ${v} is above full marks ${opts.fullMarks}.`);
    }
  }
  const existingMarks = await db.mark.findMany({
    where: { examTypeId: exam.id, academicYearId: year.id, studentId: { in: section.students.map((s) => s.id) } },
    select: { studentId: true, subjectId: true, theoryMarks: true },
  });
  const stored = new Map(existingMarks.map((m) => [`${m.studentId}|${m.subjectId}`, m.theoryMarks]));
  const marks = { create: 0, update: 0, unchanged: 0 };
  for (const r of data.rows) {
    const st = students.find((s) => s.rollNo === r.rollNo)!;
    const existingStudent = st.action === "exists" ? byRoll.get(r.rollNo)! : null;
    for (const col of data.subjects) {
      const v = r.marks[col];
      if (v == null) continue;
      const subj = subjects.find((s) => s.sheet === col)!;
      const subjectRow = section.grade.subjects.find((s) => s.name === subj.name);
      const key = existingStudent && subjectRow ? `${existingStudent.id}|${subjectRow.id}` : null;
      if (key && stored.has(key)) (stored.get(key) === v ? marks.unchanged++ : marks.update++);
      else marks.create++;
    }
  }

  return {
    section: { id: section.id, label: `${section.grade.name}-${section.name}`, school: year.school.name, academicYear: year.yearBS },
    exam: { id: exam.id, name: exam.name },
    classTeachers: [...new Set(section.teachers.map((t) => t.teacher.name))],
    subjects, students, marks, problems,
  };
}

/** Writes the plan. Refuses if it has problems. Returns what was written. */
export async function applyPlan(db: Db, target: Target, data: ImportData, opts: ImportOptions) {
  const plan = await buildPlan(db, target, data, opts);
  if (plan.problems.length > 0) throw new Error(`Not applying: ${plan.problems.length} problem(s). Run a dry run to see them.`);

  const section = await db.section.findUniqueOrThrow({ where: { id: target.sectionId }, include: { grade: true } });
  const yearId = section.grade.academicYearId;

  return db.$transaction(async (tx: any) => {
    let subjectsCreated = 0, studentsCreated = 0;

    const subjectIds = new Map<string, string>();
    const gradeSubjects = await tx.subject.findMany({ where: { gradeId: section.gradeId } });
    const maxOrder = gradeSubjects.reduce((m: number, s: any) => Math.max(m, s.displayOrder), -1);
    for (const s of plan.subjects) {
      const existing = gradeSubjects.find((g: any) => g.name === s.name);
      if (existing) { subjectIds.set(s.sheet, existing.id); continue; }
      const created = await tx.subject.create({
        data: { name: s.name, fullTheoryMarks: opts.fullMarks, fullPracticalMarks: 0, passMarks: opts.passMarks, gradeId: section.gradeId, displayOrder: maxOrder + 1 + subjectsCreated },
      });
      subjectIds.set(s.sheet, created.id);
      subjectsCreated++;
    }

    for (const row of data.rows) {
      const planned = plan.students.find((s) => s.rollNo === row.rollNo)!;
      let studentId: string;
      if (planned.action === "create") {
        studentId = (await tx.student.create({ data: { name: row.name, rollNo: row.rollNo, sectionId: section.id } })).id;
        studentsCreated++;
      } else {
        studentId = (await tx.student.findFirstOrThrow({ where: { sectionId: section.id, rollNo: row.rollNo } })).id;
      }
      for (const col of data.subjects) {
        const v = row.marks[col];
        if (v == null) continue;
        const subjectId = subjectIds.get(col)!;
        await tx.mark.upsert({
          where: { studentId_subjectId_examTypeId_academicYearId: { studentId, subjectId, examTypeId: plan.exam.id, academicYearId: yearId } },
          update: { theoryMarks: v, practicalMarks: 0, isAbsent: false },
          create: { studentId, subjectId, examTypeId: plan.exam.id, academicYearId: yearId, theoryMarks: v, practicalMarks: 0 },
        });
      }
    }
    // Upserts of identical values change nothing, so report only what actually changed.
    return { subjectsCreated, studentsCreated, marksWritten: plan.marks.create + plan.marks.update };
  }, { timeout: 60_000 });
}
