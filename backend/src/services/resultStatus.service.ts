/**
 * Results publish workflow (W1)
 *
 * Marks are entered subject by subject over days, so "partially entered" is
 * the normal state of every exam for as long as entry takes — not an edge
 * case. Before this existed, the parent/student portal returned a computed
 * percentage, GPA and rank the instant one mark was saved, with nothing on
 * screen to distinguish it from a finished result. A printed report card is at
 * least a deliberate act by someone who would notice a blank subject; the
 * portal has no human in the loop at all.
 *
 * The unit of progress is one (exam type × section), which is what a class
 * teacher owns. It moves DRAFT → READY → PUBLISHED, and only PUBLISHED is
 * visible to PARENT and STUDENT. Teachers and admins are unaffected (W1g).
 */

import prisma from "../utils/prisma";

/** A section's exam is pending unless a row says otherwise. */
export async function isSectionPublished(
  sectionId: string,
  examTypeId: string
): Promise<boolean> {
  const row = await prisma.examResultStatus.findUnique({
    where: { examTypeId_sectionId: { examTypeId, sectionId } },
    select: { status: true },
  });
  return row?.status === "PUBLISHED";
}

/**
 * The annual result is derived, not separately published: it is the weighted
 * combination of the terms, so it becomes visible exactly when every exam type
 * carrying weight in the grade's policy has been published for the section.
 * Returns the names of whatever is still holding it back, so the portal can
 * say which term is pending rather than just "not yet".
 */
export async function pendingTermsForAnnual(
  sectionId: string,
  gradeId: string
): Promise<string[]> {
  const policies = await prisma.gradingPolicy.findMany({
    where: { gradeId, weightagePercent: { gt: 0 } },
    select: { examTypeId: true, examType: { select: { name: true, displayOrder: true } } },
    orderBy: { examType: { displayOrder: "asc" } },
  });
  if (policies.length === 0) return [];

  const statuses = await prisma.examResultStatus.findMany({
    where: { sectionId, examTypeId: { in: policies.map((p) => p.examTypeId) } },
    select: { examTypeId: true, status: true },
  });
  const publishedIds = new Set(
    statuses.filter((s) => s.status === "PUBLISHED").map((s) => s.examTypeId)
  );

  return policies
    .filter((p) => !publishedIds.has(p.examTypeId))
    .map((p) => p.examType.name);
}

/** Only PARENT and STUDENT are gated — see W1g. */
export function isGatedRole(role: string): boolean {
  return role === "PARENT" || role === "STUDENT";
}

export type Completeness = {
  totalStudents: number;
  totalSubjects: number;
  /** Subjects where every student who takes the subject has a mark row. */
  subjectsComplete: number;
  missingCount: number;
  bySubject: {
    subjectId: string;
    subjectName: string;
    isOptional: boolean;
    expected: number;
    entered: number;
    missingStudents: { id: string; name: string; rollNo: number | null }[];
  }[];
};

/**
 * What is missing, named specifically (W1b). This is a soft gate: the class
 * teacher is shown exactly which cells are empty and may proceed anyway,
 * because some gaps are legitimate — a student who transferred in after the
 * exam, an elective nobody in the section takes. A hard block would break on
 * those and grow an override, which is more machinery than just reporting
 * honestly and trusting the person who knows the class.
 */
export async function getCompleteness(
  sectionId: string,
  examTypeId: string
): Promise<Completeness> {
  const section = await prisma.section.findUniqueOrThrow({
    where: { id: sectionId },
    select: { gradeId: true },
  });

  const [students, subjects, marks, optionalEnrolments] = await Promise.all([
    prisma.student.findMany({
      where: { sectionId, isActive: true },
      select: { id: true, name: true, rollNo: true },
      orderBy: { rollNo: "asc" },
    }),
    prisma.subject.findMany({
      where: { gradeId: section.gradeId },
      select: { id: true, name: true, isOptional: true },
      orderBy: { displayOrder: "asc" },
    }),
    prisma.mark.findMany({
      where: { examTypeId, student: { sectionId } },
      select: { studentId: true, subjectId: true },
    }),
    prisma.studentOptionalSubject.findMany({
      where: { student: { sectionId } },
      select: { studentId: true, subjectId: true },
    }),
  ]);

  const entered = new Set(marks.map((m) => `${m.studentId}::${m.subjectId}`));
  const enrolled = new Set(optionalEnrolments.map((e) => `${e.studentId}::${e.subjectId}`));

  let missingCount = 0;
  let subjectsComplete = 0;

  const bySubject = subjects.map((subject) => {
    // An elective counts only for the students who take it (R7a/R7b) —
    // otherwise every optional subject would look permanently incomplete.
    const takers = subject.isOptional
      ? students.filter((s) => enrolled.has(`${s.id}::${subject.id}`))
      : students;

    const missingStudents = takers.filter((s) => !entered.has(`${s.id}::${subject.id}`));
    missingCount += missingStudents.length;
    if (missingStudents.length === 0 && takers.length > 0) subjectsComplete++;

    return {
      subjectId: subject.id,
      subjectName: subject.name,
      isOptional: subject.isOptional,
      expected: takers.length,
      entered: takers.length - missingStudents.length,
      missingStudents,
    };
  });

  return {
    totalStudents: students.length,
    totalSubjects: subjects.length,
    subjectsComplete,
    missingCount,
    bySubject,
  };
}

/** Is this teacher the class teacher of this section? (W1a) */
export async function isClassTeacherOf(teacherId: string, sectionId: string): Promise<boolean> {
  const assignment = await prisma.teacherAssignment.findFirst({
    where: { teacherId, sectionId, isClassTeacher: true },
    select: { id: true },
  });
  return assignment !== null;
}
