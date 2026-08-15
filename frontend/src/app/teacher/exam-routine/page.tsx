"use client";
import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { formatGradeSection } from "@/lib/bsDate";
import { Printer } from "lucide-react";
import { useMyAssignments, type ClassTeacherSection } from "@/hooks/useReferenceData";

interface ExamType { id: string; name: string }
interface RoutineEntry {
  id: string;
  examDate: string;
  dayName?: string;
  startTime?: string;
  endTime?: string;
  subject: { name: string };
  grade: { name: string };
}

export default function TeacherExamRoutinePage() {
  const { classTeacherSections: sections, loading } = useMyAssignments();
  const [selectedSection, setSelectedSection] = useState<ClassTeacherSection | null>(null);
  const [selectedExam, setSelectedExam] = useState("");
  const [entries, setEntries] = useState<RoutineEntry[]>([]);

  const { data: examTypesData } = useSWR<ExamType[]>(
    selectedSection ? `/exam-types?academicYearId=${selectedSection.academicYearId}` : null
  );
  const examTypes = examTypesData ?? [];

  const handleSectionSelect = (section: ClassTeacherSection) => {
    setSelectedSection(section);
    setSelectedExam("");
    setEntries([]);
  };

  const handleExamSelect = async (examTypeId: string) => {
    if (!selectedSection) return;
    setSelectedExam(examTypeId);
    try {
      const data = await api.get<RoutineEntry[]>(
        `/exam-routine?examTypeId=${examTypeId}&gradeId=${selectedSection.gradeId}`
      );
      setEntries(data);
    } catch { setEntries([]); }
  };

  const selectedExamName = examTypes.find((e) => e.id === selectedExam)?.name || "";

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  if (sections.length === 0) {
    return <div className="card p-8 text-center text-gray-400">You are not assigned as a class teacher for any section.</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <h1 className="text-xl font-display font-bold text-primary">Exam Routine</h1>
          <p className="text-sm text-gray-500 mt-1">View exam schedule for your class</p>
        </div>
        {entries.length > 0 && (
          <button onClick={() => import("@/lib/printUtils").then(({ printExamRoutine }) => printExamRoutine(entries, selectedExamName, selectedSection?.gradeName || ""))} className="btn-outline text-xs">
            <Printer size={14} /> Print
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 no-print">
        {sections.map((sec) => (
          <button key={sec.sectionId} onClick={() => handleSectionSelect(sec)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedSection?.sectionId === sec.sectionId ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
            {formatGradeSection(sec.gradeName, sec.sectionName)}
          </button>
        ))}
      </div>

      {selectedSection && examTypes.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6 no-print">
          {examTypes.map((et) => (
            <button key={et.id} onClick={() => handleExamSelect(et.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${selectedExam === et.id ? "bg-accent text-white" : "bg-white border border-gray-200 text-gray-500 hover:border-accent"}`}>
              {et.name}
            </button>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="text-left px-4 py-2">#</th>
                <th className="text-left px-4 py-2">Subject</th>
                <th className="text-left px-4 py-2">Date (BS)</th>
                <th className="text-left px-4 py-2">Day</th>
                <th className="text-left px-4 py-2">Start</th>
                <th className="text-left px-4 py-2">End</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={entry.id} className="border-t border-gray-100 hover:bg-surface transition-colors">
                  <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-primary">{entry.subject.name}</td>
                  <td className="px-4 py-2">{entry.examDate}</td>
                  <td className="px-4 py-2 text-gray-500">{entry.dayName || "—"}</td>
                  <td className="px-4 py-2">{entry.startTime || "—"}</td>
                  <td className="px-4 py-2">{entry.endTime || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedExam && entries.length === 0 && (
        <div className="card p-8 text-center text-gray-400">
          No exam routine found for this exam and grade.
        </div>
      )}
    </div>
  );
}