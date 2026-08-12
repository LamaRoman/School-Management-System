/**
 * Grading Scale Tests
 *
 * The scale is the single source of truth for every grade and GPA in the
 * system, so these lock it to the school's printed grade sheet. It is
 * duplicated in frontend/src/lib/gradingScale.ts — change both together.
 *
 * The headline behaviour change these cover: the scale no longer has an NG
 * band. Every interval down to 0% carries a grade point, which means no
 * subject is ever dropped from a GPA average any more.
 */

import {
  GRADING_SCALE,
  FAILING_GRADES,
  isPassingGrade,
  getGradeFromPercentage,
  calculateOverallGpa,
  calculateOverallGpaWeighted,
} from "../../services/grading.service";

describe("Grading scale", () => {
  it("matches the printed grade sheet exactly", () => {
    expect(
      GRADING_SCALE.map((e) => [e.range, e.grade, e.description, e.gpa]),
    ).toEqual([
      ["90% to 100%", "A+", "Outstanding", 4.0],
      ["80% to Below 90%", "A", "Excellent", 3.6],
      ["70% to Below 80%", "B+", "Very Good", 3.2],
      ["60% to Below 70%", "B", "Good", 2.8],
      ["50% to Below 60%", "C+", "Satisfactory", 2.4],
      ["40% to Below 50%", "C", "Acceptable", 2.0],
      ["30% to Below 40%", "D+", "Partially Acceptable", 1.6],
      ["20% to Below 30%", "D", "Insufficient", 1.2],
      ["0 to Below 20%", "E", "Very Insufficient", 0.8],
    ]);
  });

  it("gives every band a grade point — there is no NG", () => {
    expect(GRADING_SCALE.map((e) => e.grade)).not.toContain("NG");
    for (const entry of GRADING_SCALE) {
      expect(entry.gpa).not.toBeNull();
    }
  });

  describe("percentage to grade", () => {
    const cases: [number, string, number][] = [
      [100, "A+", 4.0],
      [90, "A+", 4.0],
      [89.9, "A", 3.6],
      [80, "A", 3.6],
      [70, "B+", 3.2],
      [60, "B", 2.8],
      [50, "C+", 2.4],
      [40, "C", 2.0],
      [39.9, "D+", 1.6],
      [35, "D+", 1.6], // used to be D; the 35% boundary no longer exists
      [30, "D+", 1.6],
      [29.9, "D", 1.2],
      [20, "D", 1.2],
      [19.9, "E", 0.8],
      [0, "E", 0.8],
    ];
    it.each(cases)("%s%% -> %s (%s)", (pct, grade, gpa) => {
      const result = getGradeFromPercentage(pct);
      expect(result.grade).toBe(grade);
      expect(result.gpa).toBe(gpa);
    });

    it("clamps out-of-range percentages", () => {
      expect(getGradeFromPercentage(150).grade).toBe("A+");
      expect(getGradeFromPercentage(-10).grade).toBe("E");
    });
  });

  describe("pass and fail", () => {
    it("fails only the Insufficient bands", () => {
      expect(FAILING_GRADES).toEqual(["D", "E"]);
      for (const grade of ["A+", "A", "B+", "B", "C+", "C", "D+"]) {
        expect(isPassingGrade(grade)).toBe(true);
      }
      for (const grade of ["D", "E"]) {
        expect(isPassingGrade(grade)).toBe(false);
      }
    });
  });

  describe("GPA averaging", () => {
    // Reproduces a real printed sheet: 7 subjects at equal credit hours,
    // which that sheet totals as a GPA of 2.69.
    const printedSheetGrades = ["B+", "C+", "B+", "C+", "B", "B", "C"];
    const gpaFor = (g: string) => GRADING_SCALE.find((e) => e.grade === g)!.gpa;

    it("reproduces the GPA printed on a real sheet", () => {
      const gpas = printedSheetGrades.map(gpaFor);
      expect(calculateOverallGpa(gpas)).toBe(2.69);
    });

    it("matches the unweighted average when all credit hours are equal", () => {
      const subjects = printedSheetGrades.map((g) => ({ gpa: gpaFor(g), creditHour: 4 }));
      expect(calculateOverallGpaWeighted(subjects)).toBe(2.69);
    });

    it("weights by credit hour when they differ", () => {
      // (4.0*5 + 2.0*1) / 6 = 3.67
      expect(
        calculateOverallGpaWeighted([
          { gpa: 4.0, creditHour: 5 },
          { gpa: 2.0, creditHour: 1 },
        ]),
      ).toBe(3.67);
    });

    it("counts weak subjects instead of dropping them", () => {
      // Previously a sub-35% subject was NG with a null grade point and was
      // skipped, inflating the average. It now scores 0.8 and counts.
      const withWeakSubject = [getGradeFromPercentage(85).gpa, getGradeFromPercentage(10).gpa];
      expect(withWeakSubject).toEqual([3.6, 0.8]);
      expect(calculateOverallGpa(withWeakSubject)).toBe(2.2);
    });
  });
});
