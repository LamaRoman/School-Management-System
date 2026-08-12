/**
 * Report Card Integration Tests
 *
 * Covers PDF generation for both report styles (Grade.gradingStyle):
 *   - MARKS_BASED        — the original full-marks / pass-marks report
 *   - CREDIT_GRADE_BASED — the credit-hour / grade-point (SEE/NEB) report
 *
 * The case that matters most here is that a grade set to CREDIT_GRADE_BASED
 * gets the credit-grade template for BOTH its term report and its annual
 * report. Those are built by two separate functions (buildTermReportData and
 * buildFinalReportData), and an earlier revision wired the style through only
 * the term one — so a school would have seen a SEE-style term report and a
 * marks-style annual report for the same class.
 */

import request from "supertest";
import {
  app,
  prisma,
  cleanDatabase,
  disconnectDatabase,
  seedSchoolContext,
  createTestStudent,
  loginAs,
  authHeader,
} from "../helpers";
import * as pdfService from "../../services/pdf.service";
import { closeBrowser } from "../../services/pdf.service";

/**
 * Capture the HTML handed to the PDF renderer for the next request, so a test
 * can assert which template was chosen. Asserting only "a PDF came back" would
 * pass even if the wrong template rendered.
 */
function captureHtml() {
  const captured: string[] = [];
  const spy = jest
    .spyOn(pdfService, "generatePdf")
    .mockImplementation(async (opts: any) => {
      captured.push(opts.html);
      return Buffer.from("%PDF-stub");
    });
  return { captured, restore: () => spy.mockRestore() };
}

// Markers unique to each template's table header.
const CREDIT_MARKERS = ["Credit Hr.", "Grade Point", "Grade Points Average"];
const MARKS_MARKERS = ["Pass", "Full"];

/**
 * Rendered page count. The card is stretched to a fixed min-height so the
 * blocks below the subject table sit at the same place on every sheet; if that
 * height ever overshoots the printable area, a class batch gains a blank page
 * between every student. These assertions are the guard for that.
 */
function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
}

let ctx: Awaited<ReturnType<typeof seedSchoolContext>>;
let adminToken: string;
let firstTermId: string;
let finalTermId: string;

const PDF_MAGIC = "%PDF-";

/** Attach two weighted terms, subjects and marks to an existing grade. */
async function seedMarksFor(gradeId: string, studentId: string, yearId: string) {
  const subjects = await Promise.all(
    [
      { name: "Mathematics", theory: 75, practical: 25, credit: 4 },
      { name: "Social Studies", theory: 100, practical: 0, credit: 3 },
    ].map((s, i) =>
      prisma.subject.create({
        data: {
          name: s.name,
          fullTheoryMarks: s.theory,
          fullPracticalMarks: s.practical,
          passMarks: 35,
          creditHour: s.credit,
          displayOrder: i,
          gradeId,
        },
      }),
    ),
  );

  // Two terms, 50/50 weightage.
  for (const examTypeId of [firstTermId, finalTermId]) {
    await prisma.gradingPolicy.create({
      data: { examTypeId, gradeId, weightagePercent: 50 },
    });
    for (const subject of subjects) {
      await prisma.mark.create({
        data: {
          studentId,
          subjectId: subject.id,
          examTypeId,
          academicYearId: yearId,
          theoryMarks: subject.fullPracticalMarks > 0 ? 60 : 82,
          practicalMarks: subject.fullPracticalMarks > 0 ? 20 : 0,
        },
      });
    }
  }
  return subjects;
}

beforeAll(async () => {
  await cleanDatabase();
  ctx = await seedSchoolContext({
    schoolName: "Report Card Test School",
    schoolCode: "RCTS",
    yearBS: "2081",
    gradeName: "Grade X",
  });
  adminToken = (await loginAs(ctx.admin.email, ctx.adminPassword)).token;

  const first = await prisma.examType.create({
    data: { name: "First Terminal", academicYearId: ctx.year.id, displayOrder: 1, paperSize: "A4" },
  });
  const final = await prisma.examType.create({
    data: {
      name: "Final Examination",
      academicYearId: ctx.year.id,
      displayOrder: 2,
      isFinal: true,
      paperSize: "A4",
    },
  });
  firstTermId = first.id;
  finalTermId = final.id;

  await seedMarksFor(ctx.grade.id, ctx.student.id, ctx.year.id);
}, 60000);

afterAll(async () => {
  await closeBrowser();
  await disconnectDatabase();
});

async function setStyle(style: "MARKS_BASED" | "CREDIT_GRADE_BASED") {
  await prisma.grade.update({ where: { id: ctx.grade.id }, data: { gradingStyle: style } });
}

describe("Report card PDF generation", () => {
  describe("MARKS_BASED (default, existing behaviour)", () => {
    beforeAll(() => setStyle("MARKS_BASED"));

    it("generates a term report", async () => {
      const res = await request(app)
        .get(`/pdf/term/${ctx.student.id}/${firstTermId}`)
        .set("Authorization", authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.body.subarray(0, 5).toString()).toBe(PDF_MAGIC);
    }, 30000);

    it("generates an annual report", async () => {
      const res = await request(app)
        .get(`/pdf/final/${ctx.student.id}/${ctx.year.id}`)
        .set("Authorization", authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.subarray(0, 5).toString()).toBe(PDF_MAGIC);
    }, 30000);
  });

  describe("CREDIT_GRADE_BASED", () => {
    beforeAll(() => setStyle("CREDIT_GRADE_BASED"));

    it("generates a term report", async () => {
      const res = await request(app)
        .get(`/pdf/term/${ctx.student.id}/${firstTermId}`)
        .set("Authorization", authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.subarray(0, 5).toString()).toBe(PDF_MAGIC);
    }, 30000);

    // The regression this suite exists for.
    it("generates an annual report through the credit-grade template", async () => {
      const res = await request(app)
        .get(`/pdf/final/${ctx.student.id}/${ctx.year.id}`)
        .set("Authorization", authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.subarray(0, 5).toString()).toBe(PDF_MAGIC);
    }, 30000);

    it("renders the annual report with credit-grade columns, not marks columns", async () => {
      const { captured, restore } = captureHtml();
      try {
        await request(app)
          .get(`/pdf/final/${ctx.student.id}/${ctx.year.id}`)
          .set("Authorization", authHeader(adminToken))
          .expect(200);
      } finally {
        restore();
      }

      expect(captured).toHaveLength(1);
      const html = captured[0];
      for (const marker of CREDIT_MARKERS) expect(html).toContain(marker);
      // The marks-based template's Full/Pass Marks columns must be absent.
      for (const marker of MARKS_MARKERS) expect(html).not.toContain(`>${marker}</th>`);
      // Credit hours and grade points must actually be populated, not blank
      // cells — passing gradingStyle through without reshaping the subjects
      // would render the credit template with empty columns.
      expect(html).toMatch(/>4</); // Mathematics credit hour
      expect(html).toMatch(/>3</); // Social Studies credit hour
    }, 30000);

    it("weights the overall GPA by credit hour", async () => {
      const { captured, restore } = captureHtml();
      try {
        await request(app)
          .get(`/pdf/final/${ctx.student.id}/${ctx.year.id}`)
          .set("Authorization", authHeader(adminToken))
          .expect(200);
      } finally {
        restore();
      }

      // Maths: (60+20)/100 = 80% -> A (3.6), credit 4
      // Social: 82/100 = 82%     -> A (3.6), credit 3
      // Both terms are identical and 50/50 weighted, so the weighted annual
      // percentage equals the per-term percentage.
      // GPA = (3.6*4 + 3.6*3) / 7 = 3.6
      expect(captured[0]).toContain("3.6");
    }, 30000);

    it("rejects a practical-only subject", async () => {
      // Practical is an optional component on top of theory, never a subject
      // on its own — so fullTheoryMarks = 0 must not be creatable.
      const res = await request(app)
        .post("/subjects")
        .set("Authorization", authHeader(adminToken))
        .send({
          name: "Practical Only",
          fullTheoryMarks: 0,
          fullPracticalMarks: 50,
          passMarks: 20,
          gradeId: ctx.grade.id,
        });

      expect(res.status).toBe(400);
    });

    it("still accepts a theory-only subject", async () => {
      const res = await request(app)
        .post("/subjects")
        .set("Authorization", authHeader(adminToken))
        .send({
          name: "Theory Only",
          fullTheoryMarks: 100,
          fullPracticalMarks: 0,
          passMarks: 35,
          gradeId: ctx.grade.id,
        });

      expect(res.status).toBe(201);
      await prisma.subject.delete({ where: { id: res.body.data.id } });
    });

    it("generates a whole-class annual report", async () => {
      const res = await request(app)
        .get(`/pdf/class/final/${ctx.section.id}/${ctx.year.id}`)
        .set("Authorization", authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.subarray(0, 5).toString()).toBe(PDF_MAGIC);
    }, 60000);
  });

  describe("page layout", () => {
    beforeAll(() => setStyle("MARKS_BASED"));

    it("fits a term report on exactly one page", async () => {
      const res = await request(app)
        .get(`/pdf/term/${ctx.student.id}/${firstTermId}`)
        .set("Authorization", authHeader(adminToken))
        .expect(200);

      expect(pdfPageCount(res.body)).toBe(1);
    }, 30000);

    it("fits an A5 term report on exactly one page", async () => {
      await prisma.examType.update({ where: { id: firstTermId }, data: { paperSize: "A5" } });
      try {
        const res = await request(app)
          .get(`/pdf/term/${ctx.student.id}/${firstTermId}`)
          .set("Authorization", authHeader(adminToken))
          .expect(200);

        expect(pdfPageCount(res.body)).toBe(1);
      } finally {
        await prisma.examType.update({ where: { id: firstTermId }, data: { paperSize: "A4" } });
      }
    }, 30000);

    it("emits one page per student in a class batch, with no blank pages", async () => {
      // Two students in the section — the batch must be exactly 2 pages. A
      // card that overshoots the printable height would yield 4.
      const second = await createTestStudent(ctx.section.id, { name: "Second Student", rollNo: 2 });
      try {
        for (const subject of await prisma.subject.findMany({ where: { gradeId: ctx.grade.id } })) {
          for (const examTypeId of [firstTermId, finalTermId]) {
            await prisma.mark.create({
              data: {
                studentId: second.id, subjectId: subject.id, examTypeId,
                academicYearId: ctx.year.id, theoryMarks: 55, practicalMarks: subject.fullPracticalMarks > 0 ? 18 : 0,
              },
            });
          }
        }

        const res = await request(app)
          .get(`/pdf/class/term/${ctx.section.id}/${firstTermId}`)
          .set("Authorization", authHeader(adminToken))
          .expect(200);

        expect(pdfPageCount(res.body)).toBe(2);
      } finally {
        await prisma.mark.deleteMany({ where: { studentId: second.id } });
        await prisma.student.delete({ where: { id: second.id } });
      }
    }, 60000);

    it("includes an S.N. column and an issue date", async () => {
      const { captured, restore } = captureHtml();
      try {
        await request(app)
          .get(`/pdf/term/${ctx.student.id}/${firstTermId}`)
          .set("Authorization", authHeader(adminToken))
          .expect(200);
      } finally {
        restore();
      }

      expect(captured[0]).toContain("S.N.");
      expect(captured[0]).toContain("Date of Issue:");
    }, 30000);
  });

  describe("ink-friendly B&W mode", () => {
    beforeAll(() => setStyle("MARKS_BASED"));

    it("renders no solid fills, so a printed class set stays cheap", async () => {
      const { captured, restore } = captureHtml();
      try {
        await request(app)
          .get(`/pdf/term/${ctx.student.id}/${firstTermId}?mode=bw`)
          .set("Authorization", authHeader(adminToken))
          .expect(200);
      } finally {
        restore();
      }

      const html = captured[0];
      // None of the colour palette's fills may appear in B&W.
      for (const fill of ["#1a3a5c", "#2d5f8a", "#c8102e", "#f5f8fc", "#f9fafb", "#f0fdf4"]) {
        expect(html).not.toContain(fill);
      }
      // ...and every background that IS declared must be white.
      const backgrounds = html.match(/background:(#[0-9a-fA-F]{3,6})/g) || [];
      expect(backgrounds.length).toBeGreaterThan(0);
      for (const bg of backgrounds) expect(bg.toLowerCase()).toBe("background:#ffffff");
    }, 30000);

    it("still fills backgrounds in colour mode", async () => {
      const { captured, restore } = captureHtml();
      try {
        await request(app)
          .get(`/pdf/term/${ctx.student.id}/${firstTermId}?mode=color`)
          .set("Authorization", authHeader(adminToken))
          .expect(200);
      } finally {
        restore();
      }

      expect(captured[0]).toContain("#1a3a5c");
      expect(captured[0]).toContain("#c8102e");
    }, 30000);
  });
});
