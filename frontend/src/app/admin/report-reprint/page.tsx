"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { openReportCardPdf } from "@/lib/reportCardPdf";
import toast from "react-hot-toast";
import { History, Printer, Download, ChevronLeft } from "lucide-react";

interface AcademicYear { id: string; yearBS: string; isActive: boolean }
interface Section { id: string; name: string }
interface Grade { id: string; name: string; displayOrder: number; sections: Section[] }
interface ExamType { id: string; name: string; isFinal: boolean; displayOrder: number }
interface Student { id: string; name: string; nameNp?: string; rollNo?: number | null }

export default function ReportReprintPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loadingYears, setLoadingYears] = useState(true);

  const [selectedYear, setSelectedYear] = useState("");
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loadingGrades, setLoadingGrades] = useState(false);

  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedSection, setSelectedSection] = useState("");

  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const y = await api.get<AcademicYear[]>("/academic-years");
        setYears(y);
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setLoadingYears(false);
      }
    })();
  }, []);

  const handleYearChange = async (yearId: string) => {
    setSelectedYear(yearId);
    setSelectedGrade("");
    setSelectedSection("");
    setStudents([]);
    setSelectedStudent(null);
    setGrades([]);
    setExamTypes([]);
    if (!yearId) return;
    setLoadingGrades(true);
    try {
      const [g, et] = await Promise.all([
        api.get<Grade[]>(`/grades?academicYearId=${yearId}`),
        api.get<ExamType[]>(`/exam-types?academicYearId=${yearId}`),
      ]);
      setGrades(g);
      setExamTypes(et.sort((a, b) => a.displayOrder - b.displayOrder));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingGrades(false);
    }
  };

  const handleSectionSelect = async (gradeId: string, sectionId: string) => {
    setSelectedGrade(gradeId);
    setSelectedSection(sectionId);
    setSelectedStudent(null);
    setLoadingStudents(true);
    try {
      const s = await api.get<Student[]>(`/students?sectionId=${sectionId}`);
      setStudents(s.sort((a, b) => (a.rollNo ?? 999) - (b.rollNo ?? 999)));
    } catch (err: any) {
      toast.error(err.message);
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  };

  const openPdf = async (
    reportChoice: { examTypeId: string } | { final: true },
    pdfMode: "color" | "bw",
    action: "print" | "download"
  ) => {
    if (!selectedStudent) return;
    setDownloading(true);
    try {
      const path =
        "final" in reportChoice
          ? `/pdf/final/${selectedStudent.id}/${selectedYear}?mode=${pdfMode}`
          : `/pdf/term/${selectedStudent.id}/${reportChoice.examTypeId}?mode=${pdfMode}`;
      await openReportCardPdf(path, action);
    } catch (err: any) {
      toast.error(err.message || "Could not generate the PDF");
    } finally {
      setDownloading(false);
    }
  };

  const selectedGradeObj = grades.find((g) => g.id === selectedGrade);
  const selectedSectionObj = selectedGradeObj?.sections.find((s) => s.id === selectedSection);
  const selectedYearObj = years.find((y) => y.id === selectedYear);
  const termExamTypes = examTypes.filter((e) => !e.isFinal);
  const hasFinal = examTypes.some((e) => e.isFinal) || examTypes.length > 0;

  if (loadingYears) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-2">
          <History size={22} /> Reprint Past Report Card
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Look up any student from a past academic year and reprint their report card — for
          transfer certificates, records requests, or a lost copy.
        </p>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-primary mb-3">Step 1: Academic Year</h2>
        <select className="input max-w-xs" value={selectedYear} onChange={(e) => handleYearChange(e.target.value)}>
          <option value="">Select Year</option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.yearBS} B.S. {y.isActive ? "(Active)" : ""}
            </option>
          ))}
        </select>
      </div>

      {selectedYear && (
        <div className="card p-5 mb-6">
          <h2 className="font-semibold text-primary mb-3">Step 2: Grade & Section</h2>
          {loadingGrades ? (
            <p className="text-xs text-gray-400 animate-pulse">Loading grades...</p>
          ) : grades.length === 0 ? (
            <p className="text-xs text-gray-400">No grades found for this academic year.</p>
          ) : (
            <div className="space-y-3">
              {grades.map((g) => (
                <div key={g.id} className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-500 w-20 shrink-0">{g.name}</span>
                  {g.sections.length === 0 ? (
                    <span className="text-xs text-gray-300">No sections</span>
                  ) : (
                    g.sections.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleSectionSelect(g.id, s.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          selectedSection === s.id
                            ? "bg-primary text-white"
                            : "bg-white border border-gray-200 text-gray-600 hover:border-primary"
                        }`}
                      >
                        Section {s.name}
                      </button>
                    ))
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedSection && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-primary">
              Step 3: Student — {selectedGradeObj?.name} Section {selectedSectionObj?.name}
            </h2>
          </div>
          {loadingStudents ? (
            <p className="text-xs text-gray-400 animate-pulse">Loading students...</p>
          ) : students.length === 0 ? (
            <p className="text-xs text-gray-400">No students found in this section.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="text-left px-4 py-2">Roll</th>
                    <th className="text-left px-4 py-2">Student</th>
                    <th className="text-center px-4 py-2">Select</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr
                      key={s.id}
                      className={`border-t border-gray-100 hover:bg-surface transition-colors ${
                        selectedStudent?.id === s.id ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="px-4 py-2 text-gray-400">{s.rollNo ?? "—"}</td>
                      <td className="px-4 py-2 font-medium text-primary">{s.name}</td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => setSelectedStudent(s)}
                          className={`text-xs px-3 py-1 rounded-lg font-medium ${
                            selectedStudent?.id === s.id
                              ? "bg-primary text-white"
                              : "btn-outline"
                          }`}
                        >
                          {selectedStudent?.id === s.id ? "Selected" : "Select"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedStudent && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-primary">
                Step 4: {selectedStudent.name} — {selectedYearObj?.yearBS} B.S.
              </h2>
              <p className="text-xs text-gray-500 mt-1">Choose which report to print or download.</p>
            </div>
            <button onClick={() => setSelectedStudent(null)} className="btn-ghost text-xs">
              <ChevronLeft size={14} /> Change Student
            </button>
          </div>

          {examTypes.length === 0 ? (
            <p className="text-xs text-gray-400">No exam types found for this academic year.</p>
          ) : (
            <div className="space-y-4">
              {termExamTypes.map((et) => (
                <div key={et.id} className="flex items-center justify-between border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
                  <span className="text-sm font-medium text-gray-700">{et.name}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openPdf({ examTypeId: et.id }, "color", "print")}
                      disabled={downloading}
                      className="btn-outline text-xs"
                    >
                      <Printer size={14} /> Print
                    </button>
                    <button
                      onClick={() => openPdf({ examTypeId: et.id }, "color", "download")}
                      disabled={downloading}
                      className="btn-primary text-xs"
                    >
                      <Download size={14} /> Color
                    </button>
                    <button
                      onClick={() => openPdf({ examTypeId: et.id }, "bw", "download")}
                      disabled={downloading}
                      className="btn-ghost text-xs border border-gray-300"
                    >
                      <Download size={14} /> B&W
                    </button>
                  </div>
                </div>
              ))}

              {hasFinal && (
                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className="text-sm font-medium text-gray-700">Final Report (Annual)</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openPdf({ final: true }, "color", "print")}
                      disabled={downloading}
                      className="btn-outline text-xs"
                    >
                      <Printer size={14} /> Print
                    </button>
                    <button
                      onClick={() => openPdf({ final: true }, "color", "download")}
                      disabled={downloading}
                      className="btn-primary text-xs"
                    >
                      <Download size={14} /> Color
                    </button>
                    <button
                      onClick={() => openPdf({ final: true }, "bw", "download")}
                      disabled={downloading}
                      className="btn-ghost text-xs border border-gray-300"
                    >
                      <Download size={14} /> B&W
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
