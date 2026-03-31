"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import GradeSheet from "@/components/ui/GradeSheet";

interface Grade { id: string; name: string; displayOrder: number; sections: { id: string; name: string }[] }
interface ExamType { id: string; name: string }

export default function AdminGradeSheetPage() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const year = await api.get<any>("/academic-years/active");
        if (year) {
          setAcademicYearId(year.id);
          const [g, et] = await Promise.all([
            api.get<Grade[]>(`/grades?academicYearId=${year.id}`),
            api.get<ExamType[]>(`/exam-types?academicYearId=${year.id}`),
          ]);
          setGrades(g);
          setExamTypes(et);
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  const currentGrade = grades.find((g) => g.id === selectedGrade);
  const sections = currentGrade?.sections || [];

  const handleGradeChange = (gId: string) => {
    setSelectedGrade(gId);
    const g = grades.find((gr) => gr.id === gId);
    if (g?.sections?.length) {
      setSelectedSection(g.sections[0].id);
    } else {
      setSelectedSection("");
    }
  };

  if (loading) {
    return <div className="card p-8 text-center text-gray-400">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-primary">Grade Sheet</h1>
        <p className="text-sm text-gray-500 mt-1">View class-wide results for any grade and section</p>
      </div>

      {/* Grade selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {grades.map((g) => (
          <button
            key={g.id}
            onClick={() => handleGradeChange(g.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedGrade === g.id
                ? "bg-primary text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-primary"
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* Section selector */}
      {sections.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {sections.map((sec: any) => (
            <button
              key={sec.id}
              onClick={() => setSelectedSection(sec.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                selectedSection === sec.id
                  ? "bg-accent text-white"
                  : "bg-white border border-gray-200 text-gray-500 hover:border-accent"
              }`}
            >
              Section {sec.name}
            </button>
          ))}
        </div>
      )}

      {selectedSection && academicYearId && examTypes.length > 0 ? (
        <GradeSheet
          sectionId={selectedSection}
          academicYearId={academicYearId}
          examTypes={examTypes}
        />
      ) : (
        <div className="card p-8 text-center text-gray-400">
          Select a grade and section to view the grade sheet
        </div>
      )}
    </div>
  );
}