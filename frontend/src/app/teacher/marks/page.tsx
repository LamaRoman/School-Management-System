"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { formatGradeSection } from "@/lib/bsDate";
import toast from "react-hot-toast";
import { Save } from "lucide-react";

interface SubjectAssignment {
  assignmentId: string;
  sectionId: string;
  sectionName: string;
  gradeId: string;
  gradeName: string;
  academicYearId: string;
  subjectId: string;
  subjectName: string;
  fullTheoryMarks: number;
  fullPracticalMarks: number;
  isTemporary: boolean;
}

interface Student { id: string; name: string; rollNo?: number }
interface ExamType { id: string; name: string }
interface MarkEntry { studentId: string; theoryMarks: number | null; practicalMarks: number | null; isAbsent: boolean }

export default function MarksEntryPage() {
  const { user, loading: authLoading } = useAuth();
  const [myAssignments, setMyAssignments] = useState<SubjectAssignment[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [selectedExam, setSelectedExam] = useState("");

  const [marks, setMarks] = useState<Record<string, MarkEntry>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<any>("/teacher-assignments/my");
        setMyAssignments(data.subjectAssignments || []);

        if (data.subjectAssignments?.length > 0) {
          const yearId = data.subjectAssignments[0].academicYearId;
          const et = await api.get<ExamType[]>(`/exam-types?academicYearId=${yearId}`);
          setExamTypes(et);
        }
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  const currentAssignment = myAssignments.find((a) => a.assignmentId === selectedAssignment);

  useEffect(() => {
    if (currentAssignment) {
      api.get<Student[]>(`/students?sectionId=${currentAssignment.sectionId}`).then(setStudents).catch(() => setStudents([]));
    } else {
      setStudents([]);
    }
  }, [selectedAssignment]);

  // Load existing marks
  useEffect(() => {
    if (!currentAssignment || !selectedExam || students.length === 0) return;
    api.get<any[]>(`/marks?sectionId=${currentAssignment.sectionId}&subjectId=${currentAssignment.subjectId}&examTypeId=${selectedExam}`)
      .then((existing) => {
        const map: Record<string, MarkEntry> = {};
        students.forEach((s) => {
          const found = existing.find((m) => m.student.id === s.id);
          map[s.id] = found
            ? { studentId: s.id, theoryMarks: found.theoryMarks, practicalMarks: found.practicalMarks, isAbsent: found.isAbsent }
            : { studentId: s.id, theoryMarks: null, practicalMarks: null, isAbsent: false };
        });
        setMarks(map);
      }).catch(() => {});
  }, [currentAssignment, selectedExam, students]);

  const hasPractical = currentAssignment ? currentAssignment.fullPracticalMarks > 0 : false;

  const updateMark = (studentId: string, field: keyof MarkEntry, value: any) => {
    setMarks((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!currentAssignment || !selectedExam) return;
    setSaving(true);
    try {
      const marksArray = Object.values(marks).map((m) => ({
        studentId: m.studentId,
        theoryMarks: m.isAbsent ? null : m.theoryMarks,
        practicalMarks: m.isAbsent ? null : m.practicalMarks,
        isAbsent: m.isAbsent,
      }));
      await api.post("/marks/bulk", {
        subjectId: currentAssignment.subjectId,
        examTypeId: selectedExam,
        academicYearId: currentAssignment.academicYearId,
        marks: marksArray,
      });
      toast.success("Marks saved successfully");
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  const allSelected = selectedAssignment && selectedExam;

  if (authLoading || loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="card p-8 text-center text-gray-400">Loading your assignments...</div>
      </div>
    );
  }

  if (myAssignments.length === 0) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-display font-bold text-primary">Marks Entry</h1>
        </div>
        <div className="card p-8 text-center text-gray-400">
          No subject assignments found. Contact admin to assign you to sections and subjects.
        </div>
      </div>
    );
  }

  // Group assignments by grade for display
  const groupedByGrade = myAssignments.reduce<Record<string, SubjectAssignment[]>>((acc, a) => {
    const key = formatGradeSection(a.gradeName, a.sectionName, myAssignments);
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-primary">Marks Entry</h1>
        <p className="text-sm text-gray-500 mt-1">Enter marks for your assigned subjects</p>
      </div>

      {/* Selectors */}
      <div className="card p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Class & Subject</label>
            <select className="input" value={selectedAssignment} onChange={(e) => setSelectedAssignment(e.target.value)}>
              <option value="">Select Class & Subject</option>
              {Object.entries(groupedByGrade).map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map((a) => (
                    <option key={a.assignmentId} value={a.assignmentId}>
                      {a.subjectName}{a.isTemporary ? " (Temporary)" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Exam</label>
            <select className="input" value={selectedExam} onChange={(e) => setSelectedExam(e.target.value)}>
              <option value="">Select Exam</option>
              {examTypes.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
        </div>
        {currentAssignment && (
          <div className="mt-3 text-sm text-gray-500">
            {formatGradeSection(currentAssignment.gradeName, currentAssignment.sectionName, myAssignments)} · {currentAssignment.subjectName}: Theory ({currentAssignment.fullTheoryMarks})
            {hasPractical && ` + Practical (${currentAssignment.fullPracticalMarks})`}
            {" "}= Full Marks ({currentAssignment.fullTheoryMarks + currentAssignment.fullPracticalMarks})
            {currentAssignment.isTemporary && (
              <span className="ml-2 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Temporary Access</span>
            )}
          </div>
        )}
      </div>

      {allSelected && students.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-500">
              {students.length} students
            </div>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              <Save size={16} /> {saving ? "Saving..." : "Save Marks"}
            </button>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="text-left px-4 py-3 w-12">Roll</th>
                  <th className="text-left px-4 py-3">Student Name</th>
                  <th className="text-center px-4 py-3 w-28">Theory (/{currentAssignment?.fullTheoryMarks})</th>
                  {hasPractical && <th className="text-center px-4 py-3 w-28">Practical (/{currentAssignment?.fullPracticalMarks})</th>}
                  <th className="text-center px-4 py-3 w-20">Total</th>
                  <th className="text-center px-4 py-3 w-20">Absent</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const m = marks[s.id] || { studentId: s.id, theoryMarks: null, practicalMarks: null, isAbsent: false };
                  const total = (m.theoryMarks || 0) + (m.practicalMarks || 0);
                  return (
                    <tr key={s.id} className={`border-t border-gray-100 ${m.isAbsent ? "bg-red-50/50" : "hover:bg-surface"} transition-colors`}>
                      <td className="px-4 py-2 text-gray-400">{s.rollNo || "—"}</td>
                      <td className="px-4 py-2 font-medium text-gray-700">{s.name}</td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number" min={0} max={currentAssignment?.fullTheoryMarks}
                          className="input w-20 text-center py-1 mx-auto"
                          value={m.theoryMarks ?? ""}
                          disabled={m.isAbsent}
                          onChange={(e) => updateMark(s.id, "theoryMarks", e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </td>
                      {hasPractical && (
                        <td className="px-4 py-2 text-center">
                          <input
                            type="number" min={0} max={currentAssignment?.fullPracticalMarks}
                            className="input w-20 text-center py-1 mx-auto"
                            value={m.practicalMarks ?? ""}
                            disabled={m.isAbsent}
                            onChange={(e) => updateMark(s.id, "practicalMarks", e.target.value ? parseFloat(e.target.value) : null)}
                          />
                        </td>
                      )}
                      <td className="px-4 py-2 text-center font-semibold text-primary">
                        {m.isAbsent ? "—" : total || "—"}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input type="checkbox" checked={m.isAbsent}
                          onChange={(e) => updateMark(s.id, "isAbsent", e.target.checked)}
                          className="rounded cursor-pointer"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {allSelected && students.length === 0 && (
        <div className="card p-8 text-center text-gray-400">No students in this section</div>
      )}
    </div>
  );
}