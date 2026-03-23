"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Printer } from "lucide-react";

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

export default function StudentExamRoutinePage() {
  const { user } = useAuth();
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [entries, setEntries] = useState<RoutineEntry[]>([]);
  const [gradeId, setGradeId] = useState("");
  const [gradeName, setGradeName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Get student's grade info from their report data or section
        const year = await api.get<any>("/academic-years/active");
        if (year) {
          const et = await api.get<ExamType[]>(`/exam-types?academicYearId=${year.id}`);
          setExamTypes(et);
        }

        // Get student's section and grade
        if (user?.student?.id) {
          const student = await api.get<any>(`/students/${user.student.id}`);
          if (student?.section?.grade) {
            setGradeId(student.section.grade.id);
            setGradeName(student.section.grade.name);
          }
        }
      } catch {} finally { setLoading(false); }
    })();
  }, [user]);

  const handleExamSelect = async (examTypeId: string) => {
    if (!gradeId) return;
    setSelectedExam(examTypeId);
    try {
      const data = await api.get<RoutineEntry[]>(
        `/exam-routine?examTypeId=${examTypeId}&gradeId=${gradeId}`
      );
      setEntries(data);
    } catch { setEntries([]); }
  };

  const selectedExamName = examTypes.find((e) => e.id === selectedExam)?.name || "";

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-primary">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 no-print">
          <div>
            <h1 className="text-2xl font-display font-bold text-primary">Exam Routine</h1>
            <p className="text-sm text-gray-500 mt-1">{gradeName}</p>
          </div>
          {entries.length > 0 && (
            <button onClick={() => window.print()} className="btn-outline text-xs">
              <Printer size={14} /> Print
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-6 no-print">
          {examTypes.map((et) => (
            <button key={et.id} onClick={() => handleExamSelect(et.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedExam === et.id ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
              {et.name}
            </button>
          ))}
        </div>

        {/* Printable header */}
        {entries.length > 0 && (
          <div className="hidden print:block text-center mb-4">
            <h2 className="text-lg font-bold">{selectedExamName} — Exam Routine</h2>
            <p className="text-sm">{gradeName}</p>
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
            No exam routine available for this exam.
          </div>
        )}

        {!selectedExam && (
          <div className="card p-8 text-center text-gray-400">
            Select an exam to view the routine.
          </div>
        )}
      </div>
    </div>
  );
}