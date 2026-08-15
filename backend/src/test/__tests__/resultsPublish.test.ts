/**
 * Results publish workflow (W1)
 *
 * The failure this exists to prevent is specific: a parent opens the portal on
 * day one of marks entry and sees a percentage, GPA and rank computed from one
 * subject, with nothing distinguishing it from a finished result. So the tests
 * that matter most are the ones asserting what a PARENT and a STUDENT can see
 * at each stage — including through the PDF route, which would otherwise be a
 * one-URL bypass of the whole thing.
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

let adminToken: string;
let classTeacherToken: string;
let otherTeacherToken: string;
let studentToken: string;
let parentToken: string;

let yearId: string;
let gradeId: string;
let sectionId: string;
let otherSectionId: string;
let firstTermId: string;
let finalExamId: string;
let mathsId: string;
let scienceId: string;
let studentId: string;
let classmateId: string;

const setStatus = (body: Record<string, unknown>, path: string, token: string) =>
  request(app).post(`/result-status/${path}`).set("Authorization", authHeader(token)).send(body);

const termReport = (token: string, sid = studentId, eid = firstTermId) =>
  request(app).get(`/reports/term/${sid}/${eid}`).set("Authorization", authHeader(token));

const finalReport = (token: string) =>
  request(app).get(`/reports/final/${studentId}/${yearId}`).set("Authorization", authHeader(token));

async function publishFirstTerm() {
  await setStatus({ examTypeId: firstTermId, all: true, notify: false }, "publish", adminToken).expect(200);
}

async function resetStatuses() {
  await prisma.examResultStatus.deleteMany({});
}

beforeAll(async () => {
  await cleanDatabase();

  const school = await createTestSchool({ name: "Publish School", code: "PUB" });
  const year = await createTestAcademicYear(school.id, { yearBS: "2081" });
  yearId = year.id;

  const grade = await createTestGrade(year.id, { name: "Grade I", displayOrder: 1 });
  gradeId = grade.id;
  sectionId = (await createTestSection(grade.id, { name: "A" })).id;
  otherSectionId = (await createTestSection(grade.id, { name: "B" })).id;

  studentId = (await createTestStudent(sectionId, { name: "Aarav Sharma", rollNo: 1 })).id;
  classmateId = (await createTestStudent(sectionId, { name: "Bina Rai", rollNo: 2 })).id;

  mathsId = (
    await prisma.subject.create({
      data: { name: "Maths", gradeId: grade.id, fullTheoryMarks: 100, fullPracticalMarks: 0, passMarks: 40, displayOrder: 1 },
    })
  ).id;
  scienceId = (
    await prisma.subject.create({
      data: { name: "Science", gradeId: grade.id, fullTheoryMarks: 100, fullPracticalMarks: 0, passMarks: 40, displayOrder: 2 },
    })
  ).id;

  firstTermId = (
    await prisma.examType.create({ data: { name: "First Terminal", academicYearId: year.id, displayOrder: 1 } })
  ).id;
  finalExamId = (
    await prisma.examType.create({ data: { name: "Final", academicYearId: year.id, displayOrder: 2, isFinal: true } })
  ).id;

  await prisma.gradingPolicy.createMany({
    data: [
      { examTypeId: firstTermId, gradeId: grade.id, weightagePercent: 50 },
      { examTypeId: finalExamId, gradeId: grade.id, weightagePercent: 50 },
    ],
  });

  // Only Maths entered so far — the half-entered state this feature is about.
  for (const sid of [studentId, classmateId]) {
    for (const examTypeId of [firstTermId, finalExamId]) {
      await prisma.mark.create({
        data: { studentId: sid, subjectId: mathsId, examTypeId, academicYearId: year.id, theoryMarks: 80 },
      });
    }
  }

  await createTestUser(school.id, "ADMIN", { email: "admin@publish.test", password: "Test@123" });
  adminToken = (await loginAs("admin@publish.test")).token;

  const classTeacher = await prisma.teacher.create({ data: { name: "Kiran Thapa", schoolId: school.id } });
  await prisma.teacherAssignment.create({
    data: { teacherId: classTeacher.id, sectionId, isClassTeacher: true },
  });
  await createTestUser(school.id, "TEACHER", {
    email: "class@publish.test",
    password: "Test@123",
    teacherId: classTeacher.id,
  });
  classTeacherToken = (await loginAs("class@publish.test")).token;

  const otherTeacher = await prisma.teacher.create({ data: { name: "Sita Gurung", schoolId: school.id } });
  await prisma.teacherAssignment.create({
    data: { teacherId: otherTeacher.id, sectionId: otherSectionId, isClassTeacher: true },
  });
  await createTestUser(school.id, "TEACHER", {
    email: "other@publish.test",
    password: "Test@123",
    teacherId: otherTeacher.id,
  });
  otherTeacherToken = (await loginAs("other@publish.test")).token;

  await createTestUser(school.id, "STUDENT", {
    email: "student@publish.test",
    password: "Test@123",
    studentId,
  });
  studentToken = (await loginAs("student@publish.test")).token;

  const parent = await createTestUser(school.id, "PARENT", {
    email: "parent@publish.test",
    password: "Test@123",
  });
  await prisma.parentStudent.create({ data: { parentId: parent.id, studentId } });
  parentToken = (await loginAs("parent@publish.test")).token;
});

afterEach(async () => {
  await resetStatuses();
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

describe("what a family sees before results are published (W1e)", () => {
  it("gives a parent an explicit pending state, not a number and not an error", async () => {
    const res = await termReport(parentToken).expect(200);

    expect(res.body.data.pending).toBe(true);
    expect(res.body.data.examName).toBe("First Terminal");
    expect(res.body.data.message).toMatch(/not been published/i);
    // The thing this whole feature exists to stop reaching a family. Field
    // names taken from the real payload — `percentage`/`gpa` are undefined on
    // a *finished* report too, so asserting those would prove nothing.
    expect(res.body.data.overallPercentage).toBeUndefined();
    expect(res.body.data.overallGpa).toBeUndefined();
    expect(res.body.data.rank).toBeUndefined();
    expect(res.body.data.subjects).toBeUndefined();
  });

  it("gives a student the same pending state", async () => {
    const res = await termReport(studentToken).expect(200);
    expect(res.body.data.pending).toBe(true);
  });

  it("refuses the PDF too, so the portal gate is not one URL away from useless", async () => {
    await request(app)
      .get(`/pdf/term/${studentId}/${firstTermId}`)
      .set("Authorization", authHeader(studentToken))
      .expect(403);
  });

  it("leaves admins and teachers seeing everything, exactly as before (W1g)", async () => {
    for (const token of [adminToken, classTeacherToken, otherTeacherToken]) {
      const res = await termReport(token).expect(200);
      expect(res.body.data.pending).toBeUndefined();
      expect(res.body.data.subjects.length).toBeGreaterThan(0);
    }
  });

  it("keeps results pending while the class teacher has only marked them READY", async () => {
    await setStatus({ sectionId, examTypeId: firstTermId }, "ready", classTeacherToken).expect(200);

    // READY is a hand-off to the admin, not a release to families.
    expect((await termReport(parentToken).expect(200)).body.data.pending).toBe(true);
  });
});

describe("what a family sees once published", () => {
  it("returns the real report to a parent and a student", async () => {
    await publishFirstTerm();

    for (const token of [parentToken, studentToken]) {
      const res = await termReport(token).expect(200);
      expect(res.body.data.pending).toBeUndefined();
      expect(res.body.data.subjects.length).toBe(2);
      expect(res.body.data.overallPercentage).toBeGreaterThan(0);
      expect(res.body.data.overallGpa).toBeGreaterThan(0);
    }
  });

  it("publishes one section without publishing another", async () => {
    const classmateInB = await createTestStudent(otherSectionId, { name: "Chetan B", rollNo: 1 });
    await prisma.mark.create({
      data: { studentId: classmateInB.id, subjectId: mathsId, examTypeId: firstTermId, academicYearId: yearId, theoryMarks: 70 },
    });

    await setStatus(
      { examTypeId: firstTermId, sectionIds: [sectionId], notify: false },
      "publish",
      adminToken
    ).expect(200);

    expect((await termReport(parentToken).expect(200)).body.data.pending).toBeUndefined();

    const other = await prisma.examResultStatus.findUnique({
      where: { examTypeId_sectionId: { examTypeId: firstTermId, sectionId: otherSectionId } },
    });
    expect(other).toBeNull();

    await prisma.student.delete({ where: { id: classmateInB.id } });
  });

  it("goes back to pending when an admin unpublishes", async () => {
    await publishFirstTerm();
    await setStatus({ examTypeId: firstTermId, sectionIds: [sectionId] }, "unpublish", adminToken).expect(200);

    expect((await termReport(parentToken).expect(200)).body.data.pending).toBe(true);
    // Withdrawing the release doesn't unsay "entry is finished".
    const row = await prisma.examResultStatus.findUniqueOrThrow({
      where: { examTypeId_sectionId: { examTypeId: firstTermId, sectionId } },
    });
    expect(row.status).toBe("READY");
  });
});

describe("the annual result is gated by its terms, not published separately", () => {
  it("stays pending while any weighted term is unpublished, and names which", async () => {
    await publishFirstTerm();

    const res = await finalReport(parentToken).expect(200);
    expect(res.body.data.pending).toBe(true);
    expect(res.body.data.pendingTerms).toEqual(["Final"]);
  });

  it("appears once every weighted term is out", async () => {
    await publishFirstTerm();
    await setStatus({ examTypeId: finalExamId, all: true, notify: false }, "publish", adminToken).expect(200);

    const res = await finalReport(parentToken).expect(200);
    expect(res.body.data.pending).toBeUndefined();
    expect(res.body.data.subjects.length).toBe(2);
  });

  it("ignores a term carrying no weight in this grade's policy", async () => {
    const makeup = await prisma.examType.create({
      data: { name: "Makeup", academicYearId: yearId, displayOrder: 3 },
    });
    await prisma.gradingPolicy.create({
      data: { examTypeId: makeup.id, gradeId, weightagePercent: 0 },
    });

    await publishFirstTerm();
    await setStatus({ examTypeId: finalExamId, all: true, notify: false }, "publish", adminToken).expect(200);

    // Makeup is never published, but it weights 0, so it holds nothing back.
    expect((await finalReport(parentToken).expect(200)).body.data.pending).toBeUndefined();

    await prisma.gradingPolicy.deleteMany({ where: { examTypeId: makeup.id } });
    await prisma.examType.delete({ where: { id: makeup.id } });
  });
});

describe("who may mark a section's results complete (W1a)", () => {
  it("lets the section's class teacher do it", async () => {
    const res = await setStatus({ sectionId, examTypeId: firstTermId }, "ready", classTeacherToken).expect(200);
    expect(res.body.data.status).toBe("READY");
  });

  it("refuses a teacher who is class teacher of a different section", async () => {
    await setStatus({ sectionId, examTypeId: firstTermId }, "ready", otherTeacherToken).expect(403);
  });

  it("refuses a student outright", async () => {
    await setStatus({ sectionId, examTypeId: firstTermId }, "ready", studentToken).expect(403);
  });

  it("refuses to publish as a teacher — that is the admin's act (W1d)", async () => {
    await setStatus({ examTypeId: firstTermId, all: true }, "publish", classTeacherToken).expect(403);
  });

  it("will not re-open results that are already published", async () => {
    await publishFirstTerm();
    await setStatus({ sectionId, examTypeId: firstTermId }, "reopen", classTeacherToken).expect(400);
  });
});

describe("the soft gate names what is missing (W1b)", () => {
  it("reports the specific empty cells without blocking", async () => {
    const res = await request(app)
      .get(`/result-status/section/${sectionId}/${firstTermId}`)
      .set("Authorization", authHeader(classTeacherToken))
      .expect(200);

    const { completeness } = res.body.data;
    expect(res.body.data.status).toBe("DRAFT");
    expect(completeness.totalSubjects).toBe(2);
    // Maths entered for both students; Science entered for neither.
    expect(completeness.subjectsComplete).toBe(1);
    expect(completeness.missingCount).toBe(2);

    const science = completeness.bySubject.find((s: { subjectName: string }) => s.subjectName === "Science");
    expect(science.missingStudents.map((s: { name: string }) => s.name).sort()).toEqual([
      "Aarav Sharma",
      "Bina Rai",
    ]);
  });

  it("still lets the teacher proceed, and says how much was missing", async () => {
    const res = await setStatus({ sectionId, examTypeId: firstTermId }, "ready", classTeacherToken).expect(200);
    expect(res.body.data.status).toBe("READY");
    expect(res.body.data.missingCount).toBe(2);
  });

  it("does not count an elective against students who do not take it", async () => {
    const music = await prisma.subject.create({
      data: { name: "Music", gradeId, fullTheoryMarks: 100, fullPracticalMarks: 0, passMarks: 40, isOptional: true, displayOrder: 3 },
    });
    await prisma.studentOptionalSubject.create({ data: { studentId, subjectId: music.id } });

    const res = await request(app)
      .get(`/result-status/section/${sectionId}/${firstTermId}`)
      .set("Authorization", authHeader(classTeacherToken))
      .expect(200);

    const musicRow = res.body.data.completeness.bySubject.find(
      (s: { subjectName: string }) => s.subjectName === "Music"
    );
    // Only the enrolled student is expected to have a mark, not the whole class.
    expect(musicRow.expected).toBe(1);
    expect(musicRow.missingStudents).toHaveLength(1);
    expect(musicRow.missingStudents[0].name).toBe("Aarav Sharma");

    await prisma.studentOptionalSubject.deleteMany({ where: { subjectId: music.id } });
    await prisma.subject.delete({ where: { id: music.id } });
  });
});

describe("admin overview (W1c) and the publish notice (W1f)", () => {
  it("shows every section's state for one exam in a single call", async () => {
    await setStatus({ sectionId, examTypeId: firstTermId }, "ready", classTeacherToken).expect(200);

    const res = await request(app)
      .get(`/result-status/overview?academicYearId=${yearId}&examTypeId=${firstTermId}`)
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    const gradeRow = res.body.data.find((g: { gradeName: string }) => g.gradeName === "Grade I");
    const a = gradeRow.sections.find((s: { sectionName: string }) => s.sectionName === "A");
    const b = gradeRow.sections.find((s: { sectionName: string }) => s.sectionName === "B");

    expect(a.status).toBe("READY");
    expect(a.markedReadyBy).toBe("Kiran Thapa");
    expect(a.entryStarted).toBe(true);
    expect(b.status).toBe("DRAFT");
    expect(b.entryStarted).toBe(false);
  });

  it("writes a notice when publishing, and skips it when asked not to", async () => {
    await setStatus({ examTypeId: firstTermId, all: true }, "publish", adminToken).expect(200);

    const notice = await prisma.notice.findFirstOrThrow({
      where: { type: "EXAM", title: { contains: "First Terminal" } },
    });
    expect(notice.title).toBe("First Terminal results published");
    expect(notice.isPublished).toBe(true);

    await prisma.notice.deleteMany({});
    await resetStatuses();

    await setStatus({ examTypeId: firstTermId, all: true, notify: false }, "publish", adminToken).expect(200);
    expect(await prisma.notice.count()).toBe(0);
  });

  it("refuses to publish sections from another academic year", async () => {
    const otherYear = await createTestAcademicYear(
      (await prisma.school.findFirstOrThrow({ where: { code: "PUB" } })).id,
      { yearBS: "2082", isActive: false }
    );
    const otherGrade = await createTestGrade(otherYear.id, { name: "Grade I", displayOrder: 1 });
    const foreignSection = await createTestSection(otherGrade.id, { name: "A" });

    await setStatus(
      { examTypeId: firstTermId, sectionIds: [foreignSection.id], notify: false },
      "publish",
      adminToken
    ).expect(404);

    await prisma.academicYear.delete({ where: { id: otherYear.id } });
  });
});

// ─── W3b: section-scoped teacher access ─────────────────────────────────────

describe("grade sheets and observation grading belong to the class teacher (W3b)", () => {
  const gradeSheet = (token: string, sid = sectionId) =>
    request(app)
      .get(`/grade-sheet/term?sectionId=${sid}&examTypeId=${firstTermId}&academicYearId=${yearId}`)
      .set("Authorization", authHeader(token));

  it("lets the section's own class teacher pull its mark sheet", async () => {
    await gradeSheet(classTeacherToken).expect(200);
  });

  it("refuses a teacher who is class teacher of a different section", async () => {
    // Before W3b this was `authorize("ADMIN", "TEACHER")` and nothing else, so
    // any teacher in the building could read any section's marks.
    await gradeSheet(otherTeacherToken).expect(403);
  });

  it("leaves admins able to pull any section — the page moved, not the authority", async () => {
    await gradeSheet(adminToken).expect(200);
  });

  it("refuses observation grading for a section the teacher does not own", async () => {
    const category = await prisma.observationCategory.create({
      data: { name: "Punctuality", gradeId },
    });

    await request(app)
      .post("/observations/results/bulk")
      .set("Authorization", authHeader(otherTeacherToken))
      .send({
        examTypeId: firstTermId,
        academicYearId: yearId,
        entries: [{ studentId, categoryId: category.id, grade: "A" }],
      })
      .expect(403);

    expect(await prisma.observationResult.count({ where: { studentId } })).toBe(0);

    // ...and still allows the section's own class teacher.
    await request(app)
      .post("/observations/results/bulk")
      .set("Authorization", authHeader(classTeacherToken))
      .send({
        examTypeId: firstTermId,
        academicYearId: yearId,
        entries: [{ studentId, categoryId: category.id, grade: "A" }],
      })
      .expect(200);

    await prisma.observationResult.deleteMany({ where: { categoryId: category.id } });
    await prisma.observationCategory.delete({ where: { id: category.id } });
  });
});
