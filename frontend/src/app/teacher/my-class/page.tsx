"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { formatGradeSection } from "@/lib/bsDate";
import toast from "react-hot-toast";
import { Printer, Download, ChevronLeft, Users } from "lucide-react";

interface ClassTeacherSection {
  assignmentId: string;
  sectionId: string;
  sectionName: string;
  gradeId: string;
  gradeName: string;
  academicYearId: string;
}

interface Student { id: string; name: string; rollNo?: number }
interface ExamType { id: string; name: string; isFinal: boolean; paperSize: string }

interface ColumnSettings {
  showPassMarks: boolean;
  showTheoryPrac: boolean;
  showPercentage: boolean;
  showGrade: boolean;
  showGpa: boolean;
  showRank: boolean;
  showAttendance: boolean;
  showRemarks: boolean;
  showPromotion: boolean;
  showNepaliName: boolean;
  logoPosition: "left" | "center" | "right";
  logoSize: "small" | "medium" | "large";
}

const defaultSettings: ColumnSettings = {
  showPassMarks: true,
  showTheoryPrac: true,
  showPercentage: false,
  showGrade: true,
  showGpa: true,
  showRank: true,
  showAttendance: true,
  showRemarks: true,
  showPromotion: true,
  showNepaliName: false,
  logoPosition: "center",
  logoSize: "medium",
};

function getDivision(pct: number): { division: string; result: string } {
  if (pct >= 80) return { division: "Distinction", result: "Pass" };
  if (pct >= 60) return { division: "1st Division", result: "Pass" };
  if (pct >= 40) return { division: "2nd Division", result: "Pass" };
  if (pct >= 20) return { division: "3rd Division", result: "Pass" };
  return { division: "—", result: "Fail" };
}

const gradingScale = [
  { grades: "A/A+", division: "Distinction", range: "80%–100%" },
  { grades: "B/B+", division: "1st Division", range: "60%–79%" },
  { grades: "C/C+", division: "2nd Division", range: "40%–59%" },
  { grades: "D", division: "3rd Division", range: "20%–39%" },
  { grades: "E", division: "Fail", range: "0%–19%" },
];

// ─── REPORT CARD COMPONENT ─────────────────────────────

function ReportCard({
  reportData,
  mode,
  cols,
  observations,
}: {
  reportData: any;
  mode: "color" | "bw";
  cols: ColumnSettings;
  observations: any[] | null;
}) {
  if (!reportData) return null;

  const isBW = mode === "bw";
  const t = {
    primary: isBW ? "#444" : "#1a3a5c",
    accent: isBW ? "#444" : "#c8102e",
    headerBg: isBW ? "#555" : "#2d5f8a",
    altRow: isBW ? "#f5f7f9" : "#f5f8fc",
    border: isBW ? "#aaa" : "#ddd",
    pct: isBW ? "#666" : "#666",
  };

  const hasPractical = reportData.hasPractical && cols.showTheoryPrac;
  const divResult = getDivision(reportData.overallPercentage);

  return (
    <div className="bg-white border-2 rounded" style={{ borderColor: t.primary }}>
      {/* Header */}
      <div className="p-4 border-b-2 text-center" style={{ borderColor: t.primary }}>
        {(() => {
          const logo = reportData.school?.logo;
          const sizeMap = { small: "w-9 h-9", medium: "w-14 h-14", large: "w-[75px] h-[75px]" };
          const sizeClass = sizeMap[cols.logoSize as keyof typeof sizeMap] || sizeMap.medium;
          const pos = cols.logoPosition || "center";
          const nameBlock = (align?: string) => (
            <div style={align ? { textAlign: align as any } : undefined}>
              <h2 className="text-lg font-bold" style={{ color: t.primary }}>{reportData.school?.name}</h2>
              {cols.showNepaliName && reportData.school?.nameNp && (
                <p className="text-sm" style={{ color: t.primary }}>{reportData.school.nameNp}</p>
              )}
              <p className="text-xs text-gray-500">{reportData.school?.address}</p>
            </div>
          );
          const logoImg = <img src={logo} alt="" className={`${sizeClass} object-contain rounded`} />;

          if (!logo) return nameBlock();
          if (pos === "center") return <>{<div className="mb-1">{logoImg}</div>}{nameBlock()}</>;
          if (pos === "left") return <div className="flex items-center gap-3 mb-1">{logoImg}{nameBlock("left")}</div>;
          return <div className="flex items-center gap-3 mb-1"><div className="flex-1" style={{ textAlign: "right" }}>{nameBlock("right")}</div>{logoImg}</div>;
        })()}
        <div className="inline-block mt-2 px-4 py-1 text-white text-xs font-bold uppercase tracking-wider rounded" style={{ background: t.accent }}>
          {reportData.examType} — {reportData.academicYear} B.S.
        </div>
      </div>

      {/* Student Info */}
      <div className="grid grid-cols-2 gap-2 p-4 text-xs bg-gray-50 border-b" style={{ borderColor: t.border }}>
        {[
          ["Student", reportData.student?.name],
          ["Class / Section", `${reportData.student?.className} / ${reportData.student?.section}`],
          ["Roll No.", reportData.student?.rollNo],
          ["DOB", reportData.student?.dateOfBirth],
          ["Examination", reportData.examType],
        ].map(([l, v]: any, i: number) => (
          <div key={i} className="flex gap-2"><span className="text-gray-500 w-24">{l}:</span><span className="font-semibold" style={{ color: t.primary }}>{v || "—"}</span></div>
        ))}
      </div>

      {/* Marks Table */}
      <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: t.primary, color: "#fff" }}>
            <th className="text-left p-2 border" style={{ borderColor: t.primary }}>Subject</th>
            <th className="text-center p-2 border" style={{ borderColor: t.primary }}>Full</th>
            {cols.showPassMarks && <th className="text-center p-2 border" style={{ borderColor: t.primary }}>Pass</th>}
            {reportData.isTermReport ? (
              <>
                {hasPractical && <th className="text-center p-2 border" style={{ borderColor: t.primary, background: t.headerBg }}>Theory</th>}
                {hasPractical && <th className="text-center p-2 border" style={{ borderColor: t.primary, background: t.headerBg }}>Prac.</th>}
                <th className="text-center p-2 border" style={{ borderColor: t.primary }}>{hasPractical ? "Total" : "Obtained"}</th>
              </>
            ) : (
              reportData.subjects?.[0]?.terms?.map((term: any, i: number) => (
                <th key={i} className="text-center p-2 border" style={{ borderColor: t.primary, background: t.headerBg }}>
                  {term.examTypeName.replace("Terminal", "Term")} ({term.weightage}%)
                </th>
              ))
            )}
            {cols.showPercentage && <th className="text-center p-2 border" style={{ borderColor: t.primary, background: t.accent }}>%</th>}
            {cols.showGrade && <th className="text-center p-2 border" style={{ borderColor: t.primary, background: t.accent }}>Grade</th>}
            {cols.showGpa && <th className="text-center p-2 border" style={{ borderColor: t.primary, background: t.accent }}>GPA</th>}
          </tr>
        </thead>
        <tbody>
          {reportData.subjects?.map((s: any, i: number) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : t.altRow }}>
              <td className="p-2 border font-medium" style={{ borderColor: t.border }}>{s.subjectName}</td>
              <td className="p-2 border text-center" style={{ borderColor: t.border }}>{s.fullMarks}</td>
              {cols.showPassMarks && <td className="p-2 border text-center" style={{ borderColor: t.border, color: t.pct }}>{s.passMarks}</td>}
              {reportData.isTermReport ? (
                <>
                  {hasPractical && <td className="p-2 border text-center" style={{ borderColor: t.border }}>{s.theoryMarks}</td>}
                  {hasPractical && <td className="p-2 border text-center" style={{ borderColor: t.border }}>{s.practicalMarks || "—"}</td>}
                  <td className="p-2 border text-center font-semibold" style={{ borderColor: t.border }}>{s.totalMarks}</td>
                </>
              ) : (
                s.terms?.map((term: any, j: number) => (
                  <td key={j} className="p-2 border text-center" style={{ borderColor: t.border }}>{term.totalMarks}</td>
                ))
              )}
              {cols.showPercentage && (
                <td className="p-2 border text-center font-bold" style={{ borderColor: t.border, color: t.primary }}>
                  {reportData.isTermReport ? s.percentage : s.weightedPercentage}
                </td>
              )}
              {cols.showGrade && <td className="p-2 border text-center font-bold" style={{ borderColor: t.border, color: t.primary }}>{s.grade}</td>}
              {cols.showGpa && <td className="p-2 border text-center" style={{ borderColor: t.border }}>{s.gpa}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Bottom Section */}
      <div className="p-4 border-t-2" style={{ borderColor: t.primary }}>
        {/* Rank + Attendance */}
        <div className="flex gap-6 text-xs mb-3 p-2 bg-gray-50 rounded flex-wrap">
          {cols.showRank && reportData.showRank && reportData.rank && (
            <>
              <span className="font-semibold" style={{ color: t.accent }}>
                Rank: {reportData.rank} out of {reportData.totalStudents}
              </span>
              <span className="text-gray-300">|</span>
            </>
          )}
          {cols.showAttendance && reportData.attendance && (
            <>
              <span className="font-semibold" style={{ color: t.primary }}>Attendance:</span>
              <span>Total: <b>{reportData.attendance.totalDays}</b></span>
              <span>Present: <b>{reportData.attendance.presentDays}</b></span>
              <span>Absent: <b>{reportData.attendance.absentDays}</b></span>
            </>
          )}
        </div>

        {/* Observations + Result Summary + Grading Scale */}
        <div className="flex gap-6 flex-wrap mb-3">
          {/* General Observation */}
          {observations && observations.length > 0 && (
            <div>
              <p className="text-xs font-bold mb-1" style={{ color: t.primary }}>General Observation</p>
              <table className="text-xs" style={{ borderCollapse: "collapse" }}>
                <tbody>
                  {observations.map((obs: any, i: number) => (
                    <tr key={i}>
                      <td className="border px-2 py-1" style={{ borderColor: t.border }}>{obs.categoryName}</td>
                      <td className="border px-2 py-1 font-bold text-center" style={{ borderColor: t.border, color: t.primary }}>{obs.grade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Result Summary */}
          <div>
            <p className="text-xs font-bold mb-1" style={{ color: t.primary }}>Result</p>
            <table className="text-xs" style={{ borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td className="border px-2 py-1 font-semibold" style={{ borderColor: t.border }}>Percentage</td>
                  <td className="border px-2 py-1 font-bold" style={{ borderColor: t.border, color: t.primary }}>{reportData.overallPercentage}%</td>
                </tr>
                <tr>
                  <td className="border px-2 py-1 font-semibold" style={{ borderColor: t.border }}>Division</td>
                  <td className="border px-2 py-1 font-bold" style={{ borderColor: t.border, color: t.primary }}>{divResult.division}</td>
                </tr>
                {cols.showGrade && (
                  <tr>
                    <td className="border px-2 py-1 font-semibold" style={{ borderColor: t.border }}>Grade</td>
                    <td className="border px-2 py-1 font-bold" style={{ borderColor: t.border, color: t.primary }}>{reportData.overallGrade}</td>
                  </tr>
                )}
                {cols.showGpa && (
                  <tr>
                    <td className="border px-2 py-1 font-semibold" style={{ borderColor: t.border }}>GPA</td>
                    <td className="border px-2 py-1 font-bold" style={{ borderColor: t.border, color: t.primary }}>{reportData.overallGpa}</td>
                  </tr>
                )}
                <tr>
                  <td className="border px-2 py-1 font-semibold" style={{ borderColor: t.border }}>Result</td>
                  <td className="border px-2 py-1 font-bold" style={{ borderColor: t.border, color: divResult.result === "Pass" ? "#15803d" : t.accent }}>{divResult.result}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Grading Scale */}
          <div>
            <p className="text-xs font-bold mb-1" style={{ color: t.primary }}>Grading and Marking System</p>
            <table className="text-xs" style={{ borderCollapse: "collapse" }}>
              <tbody>
                {gradingScale.map((row, i) => (
                  <tr key={i}>
                    <td className="border px-2 py-1 font-semibold" style={{ borderColor: t.border }}>{row.grades}</td>
                    <td className="border px-2 py-1 font-bold" style={{ borderColor: t.border }}>{row.division}</td>
                    <td className="border px-2 py-1" style={{ borderColor: t.border }}>{row.range}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Comments */}
        {cols.showRemarks && reportData.remarks && (
          <div className="mb-3 p-2 bg-gray-50 rounded">
            <span className="text-xs font-bold" style={{ color: t.primary }}>Comments: </span>
            <span className="text-xs font-bold">{reportData.remarks}</span>
          </div>
        )}

        {cols.showPromotion && reportData.promoted && (
          <div className="text-center p-2 bg-green-50 border border-green-200 rounded text-xs font-bold text-green-700 mb-4">
            ✓ {reportData.promotedTo || "Promoted"}
          </div>
        )}

        {/* Signatures */}
        <div className="flex justify-between mt-14 text-xs">
          {["Class Teacher", "Exam Coordinator", "Principal"].map((r) => (
            <div key={r} className="text-center min-w-[120px]">
              <div className="border-b border-gray-400 mb-1 h-6" />
              <span className="font-semibold">{r}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────────

export default function TeacherMyClassPage() {
  const { user } = useAuth();
  const [sections, setSections] = useState<ClassTeacherSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<ClassTeacherSection | null>(null);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamType | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [observations, setObservations] = useState<any[] | null>(null);
  const [mode, setMode] = useState<"color" | "bw">("color");
  const [cols, setCols] = useState<ColumnSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [data, settings] = await Promise.all([
          api.get<any>("/teacher-assignments/my"),
          api.get<ColumnSettings>("/report-card-settings").catch(() => defaultSettings),
        ]);
        setSections(data.classTeacherSections || []);
        if (settings) setCols(settings);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  const handleSectionSelect = async (section: ClassTeacherSection) => {
    setSelectedSection(section);
    setSelectedExam(null);
    setSelectedStudent(null);
    setReportData(null);
    setObservations(null);
    try {
      const [studentList, etList] = await Promise.all([
        api.get<Student[]>(`/students?sectionId=${section.sectionId}`),
        api.get<ExamType[]>(`/exam-types?academicYearId=${section.academicYearId}`),
      ]);
      setStudents(studentList);
      setExamTypes(etList);
    } catch {
      setStudents([]);
      setExamTypes([]);
    }
  };

  const handleExamSelect = (et: ExamType) => {
    setSelectedExam(et);
    setSelectedStudent(null);
    setReportData(null);
    setObservations(null);
  };

  const handleStudentSelect = async (student: Student) => {
    if (!selectedExam || !selectedSection) return;
    setSelectedStudent(student);
    setObservations(null);
    try {
      let data: any;
      if (selectedExam.isFinal) {
        data = await api.get(`/reports/final/${student.id}/${selectedSection.academicYearId}`);
      } else {
        data = await api.get(`/reports/term/${student.id}/${selectedExam.id}`);
      }
      setReportData(data);

      try {
        const obs = await api.get<any[]>(`/observations/student/${student.id}/${selectedExam.id}`);
        setObservations(obs);
      } catch {
        setObservations(null);
      }
    } catch {
      setReportData(null);
      toast.error("No report data found for this student");
    }
  };

  const openPdf = async (pdfMode: "color" | "bw", action: "print" | "download") => {
    if (!selectedStudent || !selectedExam || !selectedSection) return;
    setDownloading(true);
    try {
      let url: string;
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
      if (selectedExam.isFinal) {
        url = `${API_BASE}/pdf/final/${selectedStudent.id}/${selectedSection.academicYearId}?mode=${pdfMode}`;
      } else {
        url = `${API_BASE}/pdf/term/${selectedStudent.id}/${selectedExam.id}?mode=${pdfMode}`;
      }

      const res = await fetch(url, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("PDF generation failed");

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      if (action === "print") {
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = blobUrl;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
            window.URL.revokeObjectURL(blobUrl);
          }, 60000);
        };
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        const disposition = res.headers.get("Content-Disposition");
        const filenameMatch = disposition?.match(/filename="(.+)"/);
        a.download = filenameMatch ? filenameMatch[1] : "report-card.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 5000);
      }
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  };

  const downloadBatchPdf = async (pdfMode: "color" | "bw") => {
    if (!selectedSection || !selectedExam) return;
    setDownloading(true);
    try {
      let url: string;
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
      if (selectedExam.isFinal) {
        url = `${API_BASE}/pdf/class/final/${selectedSection.sectionId}/${selectedSection.academicYearId}?mode=${pdfMode}`;
      } else {
        url = `${API_BASE}/pdf/class/term/${selectedSection.sectionId}/${selectedExam.id}?mode=${pdfMode}`;
      }

      const res = await fetch(url, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Batch PDF generation failed");

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      a.download = filenameMatch ? filenameMatch[1] : "class-report-cards.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 5000);
      toast.success("Batch PDF downloaded");
    } catch {
      toast.error("Failed to generate batch PDF");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  if (sections.length === 0) {
    return <div className="card p-8 text-center text-gray-400">You are not assigned as a class teacher for any section.</div>;
  }

  return (
    <div>
      {/* Section selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {sections.map((sec) => (
          <button key={sec.sectionId} onClick={() => handleSectionSelect(sec)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedSection?.sectionId === sec.sectionId ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
            {formatGradeSection(sec.gradeName, sec.sectionName, sections)}
          </button>
        ))}
      </div>

      {/* Exam selector */}
      {selectedSection && examTypes.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {examTypes.map((et) => (
            <button key={et.id} onClick={() => handleExamSelect(et)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${selectedExam?.id === et.id ? "bg-accent text-white" : "bg-white border border-gray-200 text-gray-500 hover:border-accent"}`}>
              {et.name} ({et.paperSize})
            </button>
          ))}
        </div>
      )}

      {/* Batch download buttons */}
      {selectedExam && students.length > 0 && !selectedStudent && (
        <div className="flex gap-2 mb-4">
          <button onClick={() => downloadBatchPdf("color")} disabled={downloading} className="btn-primary text-xs">
            <Download size={14} /> {downloading ? "Generating..." : `Download All — ${selectedExam.name} (Color)`}
          </button>
          <button onClick={() => downloadBatchPdf("bw")} disabled={downloading} className="btn-ghost text-xs border border-gray-300">
            <Download size={14} /> {downloading ? "..." : "Download All (B&W)"}
          </button>
        </div>
      )}

      {/* Student list */}
      {selectedExam && !selectedStudent && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <Users size={16} className="text-primary" />
            <span className="font-semibold text-sm text-primary">{students.length} Students</span>
          </div>
          <div className="divide-y divide-gray-100">
            {students.map((stu) => (
              <button key={stu.id} onClick={() => handleStudentSelect(stu)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-surface transition-colors text-left">
                <div>
                  <span className="text-sm font-medium text-primary">{stu.name}</span>
                  {stu.rollNo && <span className="ml-2 text-xs text-gray-400">Roll #{stu.rollNo}</span>}
                </div>
                <span className="text-xs text-primary">View Report →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Individual report card view */}
      {selectedStudent && (
        <div>
          {/* Back + action buttons */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => { setSelectedStudent(null); setReportData(null); setObservations(null); }}
              className="btn-ghost text-xs">
              <ChevronLeft size={14} /> Back to Student List
            </button>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setMode(mode === "color" ? "bw" : "color")}
                className="btn-ghost text-xs">{mode === "color" ? "🖨️ B&W" : "🎨 Color"}</button>
              {reportData && (
                <>
                  <button onClick={() => openPdf(mode, "print")} disabled={downloading} className="btn-outline text-xs">
                    <Printer size={14} /> {downloading ? "..." : `Print (${selectedExam?.paperSize || "A4"})`}
                  </button>
                  <button onClick={() => openPdf("color", "download")} disabled={downloading} className="btn-primary text-xs">
                    <Download size={14} /> {downloading ? "Generating..." : "PDF (Color)"}
                  </button>
                  <button onClick={() => openPdf("bw", "download")} disabled={downloading} className="btn-ghost text-xs border border-gray-300">
                    <Download size={14} /> {downloading ? "..." : "PDF (B&W)"}
                  </button>
                </>
              )}
            </div>
          </div>

          {reportData ? (
            <ReportCard reportData={reportData} mode={mode} cols={cols} observations={observations} />
          ) : (
            <div className="card p-8 text-center text-gray-400">No report data available for this student.</div>
          )}
        </div>
      )}
    </div>
  );
}