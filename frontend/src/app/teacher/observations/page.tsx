"use client";
import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { formatGradeSection } from "@/lib/bsDate";
import { useMyAssignments, type ClassTeacherSection } from "@/hooks/useReferenceData";
import toast from "react-hot-toast";
import { Save } from "lucide-react";

interface Category { id: string; name: string; nameNp?: string }
interface StudentObs { id: string; name: string; rollNo: number; grades: Record<string, string> }

const gradeOptions = ["A+", "A", "B+", "B", "C+", "C", "D+", "D", "E"];

export default function TeacherObservationsPage() {
  const { classTeacherSections: sections, loading } = useMyAssignments();
  const [selectedSection, setSelectedSection] = useState<ClassTeacherSection | null>(null);
  const [selectedExam, setSelectedExam] = useState("");
  const [editedGrades, setEditedGrades] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  const { data: examTypesData } = useSWR<{ id: string; name: string }[]>(
    selectedSection ? `/exam-types?academicYearId=${selectedSection.academicYearId}` : null
  );
  const examTypes = examTypesData ?? [];

  // Save posts `editedGrades` under the *currently* selected exam, so grades
  // seeded from a superseded response would be written against the wrong exam.
  // Keying the fetch on the section and exam makes that impossible: a response
  // can only ever populate the selection it was requested for.
  const resultsKey =
    selectedSection && selectedExam
      ? `/observations/results?sectionId=${selectedSection.sectionId}&examTypeId=${selectedExam}`
      : null;
  const { data: results, isLoading: loadingResults } = useSWR<{
    categories: Category[];
    students: StudentObs[];
  }>(resultsKey);
  const categories = results?.categories ?? [];
  const students = results?.students ?? [];

  // The grid is edited in place, so the grades are local state seeded from the
  // fetch. Changing section or exam empties them until that selection's own
  // results arrive.
  //
  // Seeded once per *selection*, not on every change of `results`: SWR hands
  // back a fresh object whenever it revalidates in the background, and reseeding
  // from that would silently discard whatever the teacher had typed since. The
  // ref records which key the grid currently holds edits for.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (seededFor.current === resultsKey) return;
    if (!results) {
      // Selection changed and its results are still in flight.
      seededFor.current = null;
      setEditedGrades({});
      return;
    }
    const initial: Record<string, Record<string, string>> = {};
    for (const stu of results.students) {
      initial[stu.id] = { ...stu.grades };
    }
    setEditedGrades(initial);
    seededFor.current = resultsKey;
  }, [resultsKey, results]);

  const handleSectionSelect = (section: ClassTeacherSection) => {
    setSelectedSection(section);
    setSelectedExam("");
  };

  const handleGradeChange = (studentId: string, categoryId: string, grade: string) => {
    setEditedGrades((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [categoryId]: grade,
      },
    }));
  };

  const handleSave = async () => {
    if (!selectedSection || !selectedExam || loadingResults) return;
    setSaving(true);

    try {
      const entries: { studentId: string; categoryId: string; grade: string }[] = [];

      for (const [studentId, catGrades] of Object.entries(editedGrades)) {
        for (const [categoryId, grade] of Object.entries(catGrades)) {
          if (grade && grade !== "—") {
            entries.push({ studentId, categoryId, grade });
          }
        }
      }

      if (entries.length === 0) {
        toast.error("No grades to save");
        return;
      }

      await api.post("/observations/results/bulk", {
        examTypeId: selectedExam,
        academicYearId: selectedSection.academicYearId,
        entries,
      });

      toast.success(`${entries.length} observations saved`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  if (sections.length === 0) {
    return (
      <div className="card p-8 text-center text-gray-400">
        You are not assigned as a class teacher for any section.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-display font-bold text-primary">Observations</h1>
          <p className="text-sm text-gray-500 mt-1">Grade students on general observation categories</p>
        </div>
        {categories.length > 0 && students.length > 0 && (
          <button onClick={handleSave} disabled={saving || loadingResults} className="btn-primary text-sm">
            <Save size={16} /> {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>

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
        <div className="flex flex-wrap gap-2 mb-6">
          {examTypes.map((et) => (
            <button key={et.id} onClick={() => setSelectedExam(et.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${selectedExam === et.id ? "bg-accent text-white" : "bg-white border border-gray-200 text-gray-500 hover:border-accent"}`}>
              {et.name}
            </button>
          ))}
        </div>
      )}

      {/* Loading the grid — takes priority over the empty state below, which would
          otherwise read as an authoritative "no categories" while the fetch is in flight. */}
      {loadingResults && (
        <div className="card p-8 text-center text-gray-400">Loading...</div>
      )}

      {/* No categories message */}
      {selectedExam && !loadingResults && categories.length === 0 && (
        <div className="card p-8 text-center text-gray-400">
          <p>No observation categories defined for this grade.</p>
          <p className="text-xs mt-1">Ask the admin to set up categories in Admin → Observations.</p>
        </div>
      )}

      {/* Observation grid */}
      {categories.length > 0 && students.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="text-left px-3 py-2 sticky left-0 bg-primary z-10">#</th>
                <th className="text-left px-3 py-2 sticky left-0 bg-primary z-10 min-w-[140px]">Student</th>
                {categories.map((cat) => (
                  <th key={cat.id} className="text-center px-2 py-2 min-w-[90px]">{cat.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((stu) => (
                <tr key={stu.id} className="border-t border-gray-100 hover:bg-surface transition-colors">
                  <td className="px-3 py-2 text-gray-400">{stu.rollNo}</td>
                  <td className="px-3 py-2 font-medium text-primary">{stu.name}</td>
                  {categories.map((cat) => (
                    <td key={cat.id} className="px-1 py-1 text-center">
                      <select
                        value={editedGrades[stu.id]?.[cat.id] || ""}
                        onChange={(e) => handleGradeChange(stu.id, cat.id, e.target.value)}
                        className="w-full text-xs px-1 py-1.5 border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary"
                      >
                        <option value="">—</option>
                        {gradeOptions.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}