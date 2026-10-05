"use client";
import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { formatGradeSection } from "@/lib/bsDate";
import { Printer } from "lucide-react";
import { useMyAssignments } from "@/hooks/useReferenceData";

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

// The routine is set per grade, so a teacher picks a grade, not a section —
// every grade they teach in, as class teacher or as a subject teacher.
interface GradeOption { gradeId: string; gradeName: string; academicYearId: string; label: string }

export default function TeacherExamRoutinePage() {
  const { classTeacherSections, subjectAssignments, loading } = useMyAssignments();
  const [selectedGrade, setSelectedGrade] = useState<GradeOption | null>(null);
  const [selectedExam, setSelectedExam] = useState("");
  const [entries, setEntries] = useState<RoutineEntry[]>([]);

  const { data: examTypesData } = useSWR<ExamType[]>(
    selectedGrade ? `/exam-types?academicYearId=${selectedGrade.academicYearId}` : null
  );
  const examTypes = examTypesData ?? [];

  const sectionsByGrade = new Map<string, { gradeName: string; academicYearId: string; sections: Set<string> }>();
  for (const a of [...classTeacherSections, ...subjectAssignments]) {
    const g = sectionsByGrade.get(a.gradeId) ?? { gradeName: a.gradeName, academicYearId: a.academicYearId, sections: new Set<string>() };
    g.sections.add(formatGradeSection(a.gradeName, a.sectionName));
    sectionsByGrade.set(a.gradeId, g);
  }
  const grades: GradeOption[] = [...sectionsByGrade].map(([gradeId, g]) => ({
    gradeId, gradeName: g.gradeName, academicYearId: g.academicYearId, label: [...g.sections].join(", "),
  }));

  const handleGradeSelect = (grade: GradeOption) => {
    setSelectedGrade(grade);
    setSelectedExam("");
    setEntries([]);
  };

  const handleExamSelect = async (examTypeId: string) => {
    if (!selectedGrade) return;
    setSelectedExam(examTypeId);
    try {
      const data = await api.get<RoutineEntry[]>(
        `/exam-routine?examTypeId=${examTypeId}&gradeId=${selectedGrade.gradeId}`
      );
      setEntries(data);
    } catch { setEntries([]); }
  };

  const selectedExamName = examTypes.find((e) => e.id === selectedExam)?.name || "";

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  if (grades.length === 0) {
    return <div className="max-w-6xl mx-auto p-4 sm:p-6"><div className="card p-8 text-center text-gray-400">You have no class or subject assignments yet.</div></div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <h1 className="text-xl font-display font-bold text-primary">Exam Routine</h1>
          <p className="text-sm text-gray-500 mt-1">View exam schedule for the classes you teach</p>
        </div>
        {entries.length > 0 && (
          <button onClick={() => import("@/lib/printUtils").then(({ printExamRoutine }) => printExamRoutine(entries, selectedExamName, selectedGrade?.gradeName || ""))} className="btn-outline text-xs">
            <Printer size={14} /> Print
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 no-print">
        {grades.map((g) => (
          <button key={g.gradeId} onClick={() => handleGradeSelect(g)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedGrade?.gradeId === g.gradeId ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
            {g.label}
          </button>
        ))}
      </div>

      {selectedGrade && examTypes.length > 0 && (
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