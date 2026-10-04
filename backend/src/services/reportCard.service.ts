/**
 * The data behind a report card — one implementation for the printed PDF, its on-screen
 * preview and the portal / parent-app JSON (`/api/reports/...`), so none of them can show a
 * different grade or GPA from the others.
 *
 * The report card is the credit-hour / grade-point design (SEE/NEB style): each subject
 * prints its credit hours, a Theory and a Practical grade, a Final Grade and its Grade
 * Point; the Grade Points Average is weighted by credit hours.
 */
import prisma from "../utils/prisma";
import {
  getGradeFromPercentage,
  calculatePercentage,
  calculateWeightedPercentage,
  calculateOverallGpaWeighted,
} from "./grading.service";

export interface ReportSubject {
  subjectName: string;
  creditHour: number;
  theoryGrade: string;
  /** null for a theory-only subject (no practical component). */
  practicalGrade: string | null;
  finalGrade: string;
  gradePoint: number | null;
  isAbsent: boolean;
  /** No mark row yet — scores 0 like an absence but prints "—", not "Ab". */
  notEntered: boolean;
}

/**
 * Everything a term report needs that a *bulk* caller can fetch once for the whole
 * class instead of once per student.
 *
 * Printing a class set used to issue roughly ten queries per student — and four of
 * them (`examType`, `academicYear`, `school`, the grade's subjects) return the
 * identical row every time, because every student in the batch shares a section. The
 * rest are per-student but can be fetched for the whole roster in one query each.
 * That is the remainder of **P3**: a 40-student class went from ~400 sequential round
 * trips to a handful, on a connection pool capped at 5.
 *
 * Deliberately optional rather than a second builder function. A separate bulk path
 * would be a second copy of the composition logic below, and two copies drifting apart
 * is the exact failure **R7** just finished cleaning up.
 */
export interface TermReportBatch {
  examType: any;
  academicYear: any;
  school: any;
  gradeSubjects: any[];
  studentsById: Map<string, any>;
  marksByStudent: Map<string, any[]>;
  optionalByStudent: Map<string, Set<string>>;
  attendanceByStudent: Map<string, any>;
}

/**
 * Gather one section's term-report data in a fixed number of queries, regardless of
 * class size. Pass the result to `buildTermReportData` for each student.
 */
export async function loadTermReportBatch(
  sectionId: string,
  examTypeId: string,
  schoolId: string
): Promise<TermReportBatch> {
  const [section, examType, school] = await Promise.all([
    prisma.section.findUniqueOrThrow({
      where: { id: sectionId },
      include: { grade: true },
    }),
    // S5 — same scoping as the single-student builder below.
    prisma.examType.findFirstOrThrow({ where: { id: examTypeId, academicYear: { schoolId } } }),
    prisma.school.findUnique({ where: { id: schoolId } }),
  ]);

  const [academicYear, students, gradeSubjects] = await Promise.all([
    prisma.academicYear.findUniqueOrThrow({ where: { id: examType.academicYearId } }),
    prisma.student.findMany({
      where: { sectionId, isActive: true },
      include: { section: { include: { grade: true } } },
    }),
    prisma.subject.findMany({
      where: { gradeId: section.gradeId },
      orderBy: { displayOrder: "asc" },
    }),
  ]);

  const studentIds = students.map((s) => s.id);
  const [marks, optional, attendances] = await Promise.all([
    prisma.mark.findMany({
      where: { studentId: { in: studentIds }, examTypeId },
      include: { subject: true },
      orderBy: { subject: { displayOrder: "asc" } },
    }),
    prisma.studentOptionalSubject.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, subjectId: true },
    }),
    prisma.attendance.findMany({
      where: { studentId: { in: studentIds }, academicYearId: examType.academicYearId },
    }),
  ]);

  const marksByStudent = new Map<string, any[]>();
  for (const m of marks) {
    const list = marksByStudent.get(m.studentId);
    if (list) list.push(m);
    else marksByStudent.set(m.studentId, [m]);
  }

  const optionalByStudent = new Map<string, Set<string>>();
  for (const o of optional) {
    let set = optionalByStudent.get(o.studentId);
    if (!set) {
      set = new Set();
      optionalByStudent.set(o.studentId, set);
    }
    set.add(o.subjectId);
  }

  return {
    examType,
    academicYear,
    school,
    gradeSubjects,
    studentsById: new Map(students.map((s) => [s.id, s])),
    marksByStudent,
    optionalByStudent,
    attendanceByStudent: new Map(attendances.map((a) => [a.studentId, a])),
  };
}

/**
 * One student's term report. `batch` lets a bulk caller supply data already fetched for
 * the whole class; without it this fetches everything itself, which is what the
 * single-student routes want. Returns null when the student has no marks for the exam.
 */
export async function buildTermReportData(
  studentId: string,
  examTypeId: string,
  schoolId: string,
  batch?: TermReportBatch
) {
  const student =
    batch?.studentsById.get(studentId) ??
    (await prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { section: { include: { grade: true } } },
    }));

  // S5 — scoped to the school rather than looked up by bare id. Not currently
  // exploitable (the marks query is scoped by student, so a foreign exam type
  // returns nothing and 404s), but it is an unguarded hole in a boundary this
  // codebase is otherwise rigorous about, and it is one refactor away from
  // mattering.
  const examType =
    batch?.examType ??
    (await prisma.examType.findFirstOrThrow({
      where: { id: examTypeId, academicYear: { schoolId } },
    }));

  const academicYear =
    batch?.academicYear ??
    (await prisma.academicYear.findUniqueOrThrow({
      where: { id: examType.academicYearId },
    }));

  const marks =
    batch?.marksByStudent.get(studentId) ??
    (batch
      ? []
      : await prisma.mark.findMany({
          where: { studentId, examTypeId },
          include: { subject: true },
          orderBy: { subject: { displayOrder: "asc" } },
        }));

  if (marks.length === 0) return null;

  // Every subject in the grade, not just the ones this student has a mark row for.
  // A subject whose marks have not been entered yet still counts as 0 toward the
  // GPA (R7), so it has to appear on the card — otherwise the printed rows do not
  // add up to the printed GPA, which is precisely the hand-checkability R4 was about.
  const markBySubjectId = new Map(marks.map((m: any) => [m.subjectId, m]));
  // With a batch, a student missing from the map takes no electives — that is an
  // answer, not a cache miss. Falling through to a query on `undefined` would put a
  // round trip back on every student who has no optional subjects, which is most of
  // them, and quietly undo the batching.
  const takesOptional = batch
    ? batch.optionalByStudent.get(studentId) ?? new Set<string>()
    : new Set(
        (
          await prisma.studentOptionalSubject.findMany({
            where: { studentId },
            select: { subjectId: true },
          })
        ).map((e) => e.subjectId)
      );
  const gradeSubjects = (
    batch?.gradeSubjects ??
    (await prisma.subject.findMany({
      where: { gradeId: student.section.gradeId },
      orderBy: { displayOrder: "asc" },
    }))
  ).filter(
    // An optional subject appears on this card only if the student is enrolled in it
    // (R7a). Once it does appear it behaves like any other subject: a missing mark
    // means "not entered yet" and scores 0, rather than quietly vanishing.
    (subject: any) => !subject.isOptional || takesOptional.has(subject.id)
  );

  const school =
    batch !== undefined
      ? batch.school
      : await prisma.school.findUnique({ where: { id: schoolId } });

  // Theory and Practical are each graded on their own full marks, then a Final Grade is
  // derived from the combined percentage — algebraically the same as weighting the two
  // component grade points by their share of full marks.
  const subjects: ReportSubject[] = gradeSubjects.map((subject: any) => {
    const m = markBySubjectId.get(subject.id);
    const hasPracticalComponent = subject.fullPracticalMarks > 0;
    // An absent subject deliberately falls through to the normal path below. Its marks
    // are null, so `|| 0` scores it 0%, which the scale grades as E / 0.8 — and that
    // grade point then counts toward the credit-weighted GPA like any other subject.
    //
    // Do NOT reintroduce a short-circuit returning gradePoint: null here.
    // calculateOverallGpaWeighted filters nulls, so a null drops the subject (and its
    // credit hours) out of the average entirely, so skipping an exam would raise a
    // student's GPA. The card prints "Ab" for the row and "—" for the GPA while any
    // paper is missing (pdf.service.ts), so the absence stays visible.
    const theoryResult = getGradeFromPercentage(
      calculatePercentage(m?.theoryMarks || 0, subject.fullTheoryMarks)
    );
    const practicalResult = hasPracticalComponent
      ? getGradeFromPercentage(calculatePercentage(m?.practicalMarks || 0, subject.fullPracticalMarks))
      : null;

    const fullMarks = subject.fullTheoryMarks + subject.fullPracticalMarks;
    const total = (m?.theoryMarks || 0) + (m?.practicalMarks || 0);
    const finalResult = getGradeFromPercentage(calculatePercentage(total, fullMarks));

    return {
      subjectName: subject.name,
      creditHour: subject.creditHour,
      theoryGrade: theoryResult.grade,
      practicalGrade: practicalResult?.grade ?? null,
      finalGrade: finalResult.grade,
      gradePoint: finalResult.gpa,
      isAbsent: m?.isAbsent ?? false,
      notEntered: !m,
    };
  });

  const attendance = batch
    ? batch.attendanceByStudent.get(studentId) ?? null
    : await prisma.attendance.findUnique({
        where: { studentId_academicYearId: { studentId, academicYearId: examType.academicYearId } },
      });

  return {
    _studentId: studentId,
    _gradeId: student.section.gradeId as string,
    school: school || {},
    student: {
      name: student.name,
      className: student.section.grade.name,
      section: student.section.name,
      rollNo: student.rollNo,
      dateOfBirth: student.dateOfBirth,
    },
    academicYear: academicYear.yearBS,
    examType: examType.name,
    paperSize: examType.paperSize,
    isTermReport: true,
    subjects,
    overallGpa: calculateOverallGpaWeighted(
      subjects.map((s) => ({ gpa: s.gradePoint, creditHour: s.creditHour }))
    ),
    // A paper absent or not yet entered: the GPA counts it as 0, so screens show "—" for it.
    incomplete: subjects.some((s) => s.isAbsent || s.notEntered),
    attendance: attendance
      ? { totalDays: attendance.totalDays, presentDays: attendance.presentDays, absentDays: attendance.absentDays }
      : undefined,
    _observations: null as any[] | null,
  };
}

/**
 * One student's annual report: each subject's terms combined with the grade's
 * GradingPolicy weightages, then graded once. Returns null when the grade has no policy.
 */
export async function buildFinalReportData(
  studentId: string,
  academicYearId: string,
  schoolId: string
) {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { section: { include: { grade: true } } },
  });

  const gradeId = student.section.grade.id;

  const academicYear = await prisma.academicYear.findUniqueOrThrow({
    where: { id: academicYearId },
  });

  const policies = await prisma.gradingPolicy.findMany({
    where: { gradeId },
    include: { examType: true },
    orderBy: { examType: { displayOrder: "asc" } },
  });

  if (policies.length === 0) return null;

  const gradeSubjects = await prisma.subject.findMany({
    where: { gradeId },
    orderBy: { displayOrder: "asc" },
  });

  const allMarks = await prisma.mark.findMany({
    where: { studentId, academicYearId },
  });

  const school = await prisma.school.findUnique({ where: { id: schoolId } });

  // Grades are derived weighted-marks-first: each component's term marks are combined
  // using the grading policy's weightages, and the resulting percentage is graded once.
  const weightedPct = (subjectId: string, obtainedOf: (m: (typeof allMarks)[number] | undefined) => number, fullMarks: number) =>
    calculateWeightedPercentage(
      policies.map((policy) => {
        const mark = allMarks.find((m) => m.subjectId === subjectId && m.examTypeId === policy.examTypeId);
        return { obtained: obtainedOf(mark), fullMarks, weightage: policy.weightagePercent };
      })
    );

  const subjects: ReportSubject[] = gradeSubjects.map((subject) => {
    const hasPracticalComponent = subject.fullPracticalMarks > 0;
    const theoryPct = weightedPct(subject.id, (m) => m?.theoryMarks || 0, subject.fullTheoryMarks);
    const practicalPct = hasPracticalComponent
      ? weightedPct(subject.id, (m) => m?.practicalMarks || 0, subject.fullPracticalMarks)
      : null;
    const final = getGradeFromPercentage(
      weightedPct(
        subject.id,
        (m) => (m ? (m.theoryMarks || 0) + (m.practicalMarks || 0) : 0),
        subject.fullTheoryMarks + subject.fullPracticalMarks
      )
    );

    // Absent is graded, not skipped — the weighted percentages above read null marks
    // as 0, so the subject scores E / 0.8 and its credit hours stay in the denominator
    // of the weighted GPA. Absent in *some* terms already weighs those terms in as 0;
    // only absence in every term marks the subject absent.
    const subjectMarks = allMarks.filter((m) => m.subjectId === subject.id);
    const allAbsent = subjectMarks.length > 0 && subjectMarks.every((m) => m.isAbsent);

    return {
      subjectName: subject.name,
      creditHour: subject.creditHour,
      theoryGrade: getGradeFromPercentage(theoryPct).grade,
      practicalGrade: practicalPct === null ? null : getGradeFromPercentage(practicalPct).grade,
      finalGrade: final.grade,
      gradePoint: final.gpa,
      isAbsent: allAbsent,
      notEntered: false,
    };
  });

  const attendance = await prisma.attendance.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
  });

  const consolidated = await prisma.consolidatedResult.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
  });

  const finalExamType = await prisma.examType.findFirst({
    where: { isFinal: true, academicYearId },
  });

  return {
    _studentId: studentId,
    _gradeId: gradeId,
    _examTypeId: finalExamType?.id || "",
    school: school || {},
    student: {
      name: student.name,
      className: student.section.grade.name,
      section: student.section.name,
      rollNo: student.rollNo,
      dateOfBirth: student.dateOfBirth,
    },
    academicYear: academicYear.yearBS,
    examType: finalExamType?.name || "Final",
    paperSize: finalExamType?.paperSize || "A4",
    isTermReport: false,
    subjects,
    overallGpa: calculateOverallGpaWeighted(
      subjects.map((s) => ({ gpa: s.gradePoint, creditHour: s.creditHour }))
    ),
    // A paper absent or not yet entered: the GPA counts it as 0, so screens show "—" for it.
    incomplete: subjects.some((s) => s.isAbsent || s.notEntered),
    attendance: attendance
      ? { totalDays: attendance.totalDays, presentDays: attendance.presentDays, absentDays: attendance.absentDays }
      : undefined,
    remarks: consolidated?.remarks,
    promoted: consolidated?.promoted,
    promotedTo: consolidated?.promotedTo,
    _observations: null as any[] | null,
  };
}

/** The report as the portal and the parent app receive it: no internal `_` fields. */
export function toPortalReport(report: Record<string, any>) {
  return Object.fromEntries(Object.entries(report).filter(([k]) => !k.startsWith("_")));
}
