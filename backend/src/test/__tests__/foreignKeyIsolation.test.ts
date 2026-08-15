/**
 * Foreign-key isolation across every write endpoint (S4, S4a, S4b)
 *
 * S4b is the point of this file. Four separate endpoints accepted a `subjectId`
 * without checking it, because each was written on its own and nothing was
 * looking at the class of bug. Patching the four does not stop a fifth. This
 * walks every write endpoint, feeds a foreign id for each foreign key it
 * accepts, and asserts it is refused.
 *
 * Two different mistakes are covered, and the second is the one school-scoped
 * checks miss:
 *
 *   - **cross-school** — an id belonging to another school entirely.
 *   - **cross-parent** — an id that is perfectly valid *in this school* but
 *     hangs off the wrong parent: a Grade I subject on a Grade II section, a
 *     2081 exam type on a 2082 grade. Every school check passes and the write
 *     is still wrong.
 *
 * Adding an endpoint that takes a foreign key means adding a case here.
 */

import request from "supertest";
import {
  app,
  prisma,
  cleanDatabase,
  disconnectDatabase,
  createTestSchool,
  createTestUser,
  createTestAcademicYear,
  createTestGrade,
  createTestSection,
  createTestStudent,
  loginAs,
  authHeader,
} from "../helpers";

type Ids = {
  yearId: string;
  gradeOneId: string;
  gradeTwoId: string;
  sectionOneId: string;
  sectionTwoId: string;
  subjectOneId: string; // belongs to grade one
  subjectTwoId: string; // belongs to grade two
  teacherId: string;
  studentOneId: string;
  examTypeId: string;
  otherYearId: string;
  otherYearGradeId: string;
  otherYearExamTypeId: string;
};

const mine = {} as Ids;
const foreign = {} as Ids;

let adminToken: string;

async function seedSchool(name: string, code: string, into: Ids): Promise<string> {
  const school = await createTestSchool({ name, code });
  const year = await createTestAcademicYear(school.id, { yearBS: "2081" });
  into.yearId = year.id;

  const gradeOne = await createTestGrade(year.id, { name: "Grade I", displayOrder: 1 });
  const gradeTwo = await createTestGrade(year.id, { name: "Grade II", displayOrder: 2 });
  into.gradeOneId = gradeOne.id;
  into.gradeTwoId = gradeTwo.id;

  into.sectionOneId = (await createTestSection(gradeOne.id, { name: "A" })).id;
  into.sectionTwoId = (await createTestSection(gradeTwo.id, { name: "A" })).id;
  into.studentOneId = (await createTestStudent(into.sectionOneId, { name: "Student", rollNo: 1 })).id;

  into.subjectOneId = (
    await prisma.subject.create({
      data: { name: "Maths", gradeId: gradeOne.id, fullTheoryMarks: 100, fullPracticalMarks: 0, passMarks: 40 },
    })
  ).id;
  into.subjectTwoId = (
    await prisma.subject.create({
      data: { name: "Maths", gradeId: gradeTwo.id, fullTheoryMarks: 100, fullPracticalMarks: 0, passMarks: 40 },
    })
  ).id;

  into.examTypeId = (
    await prisma.examType.create({
      data: { name: "First Terminal", academicYearId: year.id, displayOrder: 1 },
    })
  ).id;

  into.teacherId = (
    await prisma.teacher.create({ data: { name: `${code} Teacher`, schoolId: school.id } })
  ).id;

  // A second year in the same school — the cross-parent case that has nothing
  // to do with tenancy.
  const otherYear = await createTestAcademicYear(school.id, { yearBS: "2082", isActive: false });
  into.otherYearId = otherYear.id;
  into.otherYearGradeId = (
    await createTestGrade(otherYear.id, { name: "Grade I", displayOrder: 1 })
  ).id;
  into.otherYearExamTypeId = (
    await prisma.examType.create({
      data: { name: "First Terminal", academicYearId: otherYear.id, displayOrder: 1 },
    })
  ).id;

  return school.id;
}

beforeAll(async () => {
  await cleanDatabase();

  const mySchoolId = await seedSchool("FK School", "FKA", mine);
  await seedSchool("FK Foreign School", "FKB", foreign);

  await createTestUser(mySchoolId, "ADMIN", { email: "admin@fk.test", password: "Test@123" });
  adminToken = (await loginAs("admin@fk.test")).token;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

type Case = {
  /** What is wrong with the request. */
  name: string;
  method: "post" | "put";
  path: string;
  body: () => Record<string, unknown>;
};

/** A request that must succeed, proving each case fails for its stated reason. */
type Endpoint = {
  endpoint: string;
  valid: () => Record<string, unknown>;
  method: "post" | "put";
  path: string;
  cases: Case[];
};

const endpoints: Endpoint[] = [
  {
    endpoint: "POST /teacher-assignments",
    method: "post",
    path: "/teacher-assignments",
    valid: () => ({
      teacherId: mine.teacherId,
      sectionId: mine.sectionOneId,
      subjectId: mine.subjectOneId,
    }),
    cases: [
      {
        name: "another school's subject",
        method: "post",
        path: "/teacher-assignments",
        body: () => ({
          teacherId: mine.teacherId,
          sectionId: mine.sectionOneId,
          subjectId: foreign.subjectOneId,
        }),
      },
      {
        name: "a subject from a different grade in the same school",
        method: "post",
        path: "/teacher-assignments",
        body: () => ({
          teacherId: mine.teacherId,
          sectionId: mine.sectionOneId,
          subjectId: mine.subjectTwoId,
        }),
      },
      {
        name: "another school's teacher",
        method: "post",
        path: "/teacher-assignments",
        body: () => ({
          teacherId: foreign.teacherId,
          sectionId: mine.sectionOneId,
          subjectId: mine.subjectOneId,
        }),
      },
      {
        name: "another school's section",
        method: "post",
        path: "/teacher-assignments",
        body: () => ({
          teacherId: mine.teacherId,
          sectionId: foreign.sectionOneId,
          subjectId: mine.subjectOneId,
        }),
      },
    ],
  },
  {
    endpoint: "POST /homework",
    method: "post",
    path: "/homework",
    valid: () => ({
      title: "Read chapter 1",
      subjectId: mine.subjectOneId,
      sectionId: mine.sectionOneId,
      academicYearId: mine.yearId,
      assignedDate: "2081/01/01",
    }),
    cases: [
      {
        name: "another school's subject",
        method: "post",
        path: "/homework",
        body: () => ({
          title: "x",
          subjectId: foreign.subjectOneId,
          sectionId: mine.sectionOneId,
          academicYearId: mine.yearId,
          assignedDate: "2081/01/01",
        }),
      },
      {
        name: "a subject the section does not study",
        method: "post",
        path: "/homework",
        body: () => ({
          title: "x",
          subjectId: mine.subjectTwoId,
          sectionId: mine.sectionOneId,
          academicYearId: mine.yearId,
          assignedDate: "2081/01/01",
        }),
      },
      {
        name: "another school's section",
        method: "post",
        path: "/homework",
        body: () => ({
          title: "x",
          subjectId: mine.subjectOneId,
          sectionId: foreign.sectionOneId,
          academicYearId: mine.yearId,
          assignedDate: "2081/01/01",
        }),
      },
    ],
  },
  {
    endpoint: "POST /exam-routine",
    method: "post",
    path: "/exam-routine",
    valid: () => ({
      examTypeId: mine.examTypeId,
      gradeId: mine.gradeOneId,
      subjectId: mine.subjectOneId,
      examDate: "2081/01/10",
    }),
    cases: [
      {
        name: "another school's subject",
        method: "post",
        path: "/exam-routine",
        body: () => ({
          examTypeId: mine.examTypeId,
          gradeId: mine.gradeOneId,
          subjectId: foreign.subjectOneId,
          examDate: "2081/01/10",
        }),
      },
      {
        name: "a subject from another grade in the same school",
        method: "post",
        path: "/exam-routine",
        body: () => ({
          examTypeId: mine.examTypeId,
          gradeId: mine.gradeOneId,
          subjectId: mine.subjectTwoId,
          examDate: "2081/01/10",
        }),
      },
      {
        name: "an exam type from a different academic year",
        method: "post",
        path: "/exam-routine",
        body: () => ({
          examTypeId: mine.otherYearExamTypeId,
          gradeId: mine.gradeOneId,
          subjectId: mine.subjectOneId,
          examDate: "2081/01/10",
        }),
      },
      {
        name: "another school's grade",
        method: "post",
        path: "/exam-routine",
        body: () => ({
          examTypeId: mine.examTypeId,
          gradeId: foreign.gradeOneId,
          subjectId: mine.subjectOneId,
          examDate: "2081/01/10",
        }),
      },
    ],
  },
  {
    endpoint: "POST /exam-routine/bulk",
    method: "post",
    path: "/exam-routine/bulk",
    valid: () => ({
      examTypeId: mine.examTypeId,
      gradeId: mine.gradeOneId,
      entries: [{ subjectId: mine.subjectOneId, examDate: "2081/01/10" }],
    }),
    cases: [
      {
        name: "another school's subject anywhere in the batch",
        method: "post",
        path: "/exam-routine/bulk",
        body: () => ({
          examTypeId: mine.examTypeId,
          gradeId: mine.gradeOneId,
          entries: [
            { subjectId: mine.subjectOneId, examDate: "2081/01/10" },
            { subjectId: foreign.subjectOneId, examDate: "2081/01/11" },
          ],
        }),
      },
      {
        name: "a subject from another grade anywhere in the batch",
        method: "post",
        path: "/exam-routine/bulk",
        body: () => ({
          examTypeId: mine.examTypeId,
          gradeId: mine.gradeOneId,
          entries: [
            { subjectId: mine.subjectOneId, examDate: "2081/01/10" },
            { subjectId: mine.subjectTwoId, examDate: "2081/01/11" },
          ],
        }),
      },
      {
        name: "an exam type from a different academic year",
        method: "post",
        path: "/exam-routine/bulk",
        body: () => ({
          examTypeId: mine.otherYearExamTypeId,
          gradeId: mine.gradeOneId,
          entries: [{ subjectId: mine.subjectOneId, examDate: "2081/01/10" }],
        }),
      },
    ],
  },
  {
    endpoint: "POST /grading-policy/bulk",
    method: "post",
    path: "/grading-policy/bulk",
    valid: () => ({
      gradeId: mine.gradeOneId,
      policies: [{ examTypeId: mine.examTypeId, weightagePercent: 100 }],
    }),
    cases: [
      {
        name: "another school's exam type",
        method: "post",
        path: "/grading-policy/bulk",
        body: () => ({
          gradeId: mine.gradeOneId,
          policies: [{ examTypeId: foreign.examTypeId, weightagePercent: 100 }],
        }),
      },
      {
        name: "an exam type from a different academic year (S4a)",
        method: "post",
        path: "/grading-policy/bulk",
        body: () => ({
          gradeId: mine.gradeOneId,
          policies: [{ examTypeId: mine.otherYearExamTypeId, weightagePercent: 100 }],
        }),
      },
      {
        name: "another school's grade",
        method: "post",
        path: "/grading-policy/bulk",
        body: () => ({
          gradeId: foreign.gradeOneId,
          policies: [{ examTypeId: mine.examTypeId, weightagePercent: 100 }],
        }),
      },
    ],
  },
];

describe.each(endpoints)("$endpoint", ({ endpoint, method, path, valid, cases }) => {
  it.each(cases)("refuses $name", async ({ method: m, path: p, body }) => {
    const res = await request(app)[m](p).set("Authorization", authHeader(adminToken)).send(body());

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("still accepts a request where everything lines up", async () => {
    const res = await request(app)[method](path)
      .set("Authorization", authHeader(adminToken))
      .send(valid());

    expect(res.status).toBeLessThan(300);
    // Clean up so repeated runs and the unique constraints stay happy.
    if (endpoint.startsWith("POST /teacher-assignments")) {
      await prisma.teacherAssignment.deleteMany({ where: { sectionId: mine.sectionOneId } });
    }
    if (endpoint.startsWith("POST /homework")) {
      await prisma.homework.deleteMany({ where: { sectionId: mine.sectionOneId } });
    }
    if (endpoint.startsWith("POST /exam-routine")) {
      await prisma.examRoutine.deleteMany({ where: { gradeId: mine.gradeOneId } });
    }
    if (endpoint.startsWith("POST /grading-policy")) {
      await prisma.gradingPolicy.deleteMany({ where: { gradeId: mine.gradeOneId } });
    }
  });
});

// ─── By-id handlers: found while doing S4, not in the original finding ──────

describe("exam routine by-id handlers are school-scoped", () => {
  let foreignRoutineId: string;

  beforeAll(async () => {
    foreignRoutineId = (
      await prisma.examRoutine.create({
        data: {
          examTypeId: foreign.examTypeId,
          gradeId: foreign.gradeOneId,
          subjectId: foreign.subjectOneId,
          examDate: "2081/01/10",
        },
      })
    ).id;
  });

  it("refuses to edit another school's routine entry", async () => {
    await request(app)
      .put(`/exam-routine/${foreignRoutineId}`)
      .set("Authorization", authHeader(adminToken))
      .send({ examDate: "2081/12/31" })
      .expect(404);

    const untouched = await prisma.examRoutine.findUniqueOrThrow({ where: { id: foreignRoutineId } });
    expect(untouched.examDate).toBe("2081/01/10");
  });

  it("refuses to delete another school's routine entry", async () => {
    await request(app)
      .delete(`/exam-routine/${foreignRoutineId}`)
      .set("Authorization", authHeader(adminToken))
      .expect(404);

    expect(
      await prisma.examRoutine.count({ where: { id: foreignRoutineId } })
    ).toBe(1);
  });

  it("still edits and deletes its own school's entry", async () => {
    const own = await prisma.examRoutine.create({
      data: {
        examTypeId: mine.examTypeId,
        gradeId: mine.gradeOneId,
        subjectId: mine.subjectOneId,
        examDate: "2081/01/10",
      },
    });

    await request(app)
      .put(`/exam-routine/${own.id}`)
      .set("Authorization", authHeader(adminToken))
      .send({ examDate: "2081/02/11" })
      .expect(200);

    expect(
      (await prisma.examRoutine.findUniqueOrThrow({ where: { id: own.id } })).examDate
    ).toBe("2081/02/11");

    await request(app)
      .delete(`/exam-routine/${own.id}`)
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    expect(await prisma.examRoutine.count({ where: { id: own.id } })).toBe(0);
  });
});
