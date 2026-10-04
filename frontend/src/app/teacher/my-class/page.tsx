"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { formatGradeSection } from "@/lib/bsDate";
import { openReportCardPdf } from "@/lib/reportCardPdf";
import toast from "react-hot-toast";
import { Printer, Download, ChevronLeft, Users } from "lucide-react";
import ReportCardPreview from "@/components/ui/ReportCardPreview";

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

// ─── MAIN PAGE ──────────────────────────────────────────

export default function TeacherMyClassPage() {
  const [sections, setSections] = useState<ClassTeacherSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<ClassTeacherSection | null>(null);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamType | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [mode, setMode] = useState<"color" | "bw">("color");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<any>("/teacher-assignments/my");
        setSections(data.classTeacherSections || []);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  const handleSectionSelect = async (section: ClassTeacherSection) => {
    setSelectedSection(section);
    setSelectedExam(null);
    setSelectedStudent(null);
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
  };

  // Teachers always see results (no publish gate), so the card is fetched directly: one
  // request, and the preview itself shows "Loading…" or the reason there is no card.
  const handleStudentSelect = (student: Student) => {
    if (!selectedExam || !selectedSection) return;
    setSelectedStudent(student);
  };

  const openPdf = async (pdfMode: "color" | "bw", action: "print" | "download") => {
    if (!selectedStudent || !selectedExam || !selectedSection) return;
    setDownloading(true);
    try {
      let path: string;
      if (selectedExam.isFinal) {
        path = `/pdf/final/${selectedStudent.id}/${selectedSection.academicYearId}?mode=${pdfMode}`;
      } else {
        path = `/pdf/term/${selectedStudent.id}/${selectedExam.id}?mode=${pdfMode}`;
      }

      await openReportCardPdf(path, action);
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
      let path: string;
      if (selectedExam.isFinal) {
        path = `/pdf/class/final/${selectedSection.sectionId}/${selectedSection.academicYearId}?mode=${pdfMode}`;
      } else {
        path = `/pdf/class/term/${selectedSection.sectionId}/${selectedExam.id}?mode=${pdfMode}`;
      }

      const res = await api.fetchRaw(path);
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
    return <div className="max-w-6xl mx-auto p-4 sm:p-6"><div className="card p-8 text-center text-gray-400">You are not assigned as a class teacher for any section.</div></div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      {/* Section selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {sections.map((sec) => (
          <button key={sec.sectionId} onClick={() => handleSectionSelect(sec)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedSection?.sectionId === sec.sectionId ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
            {formatGradeSection(sec.gradeName, sec.sectionName)}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
            <button onClick={() => setSelectedStudent(null)}
              className="btn-ghost text-xs self-start whitespace-nowrap">
              <ChevronLeft size={14} /> Back to Student List
            </button>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setMode(mode === "color" ? "bw" : "color")}
                className="btn-ghost text-xs">{mode === "color" ? "🖨️ B&W" : "🎨 Color"}</button>
              <button onClick={() => openPdf(mode, "print")} disabled={downloading} className="btn-outline text-xs">
                <Printer size={14} /> {downloading ? "..." : `Print (${selectedExam?.paperSize || "A4"})`}
              </button>
              <button onClick={() => openPdf("color", "download")} disabled={downloading} className="btn-primary text-xs">
                <Download size={14} /> {downloading ? "Generating..." : "PDF (Color)"}
              </button>
              <button onClick={() => openPdf("bw", "download")} disabled={downloading} className="btn-ghost text-xs border border-gray-300">
                <Download size={14} /> {downloading ? "..." : "PDF (B&W)"}
              </button>
            </div>
          </div>

          <ReportCardPreview
            mode={mode}
            path={selectedExam?.isFinal
              ? `/pdf/final/${selectedStudent.id}/${selectedSection?.academicYearId}`
              : `/pdf/term/${selectedStudent.id}/${selectedExam?.id}`}
          />
        </div>
      )}
    </div>
  );
}