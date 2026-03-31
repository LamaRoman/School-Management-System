"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { formatGradeSection } from "@/lib/bsDate";
import GradeSheet from "@/components/ui/GradeSheet";

interface ClassTeacherSection {
  assignmentId: string;
  sectionId: string;
  sectionName: string;
  gradeId: string;
  gradeName: string;
  academicYearId: string;
}

interface ExamType { id: string; name: string }

export default function TeacherGradeSheetPage() {
  const [mySections, setMySections] = useState<ClassTeacherSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<ClassTeacherSection | null>(null);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<any>("/teacher-assignments/my");
        const sections = data.classTeacherSections || [];
        setMySections(sections);
        if (sections.length > 0) {
          setSelectedSection(sections[0]);
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (selectedSection) {
      api.get<ExamType[]>(`/exam-types?academicYearId=${selectedSection.academicYearId}`)
        .then(setExamTypes)
        .catch(() => setExamTypes([]));
    }
  }, [selectedSection]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="card p-8 text-center text-gray-400">Loading...</div>
      </div>
    );
  }

  if (mySections.length === 0) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-display font-bold text-primary">Grade Sheet</h1>
        </div>
        <div className="card p-8 text-center text-gray-400">
          You are not assigned as a class teacher.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Grade Sheet</h1>
          <p className="text-sm text-gray-500">
            {selectedSection ? formatGradeSection(selectedSection.gradeName, selectedSection.sectionName, mySections) : ""}
          </p>
        </div>
        {mySections.length > 1 && (
          <select
            className="input w-auto"
            value={selectedSection?.assignmentId || ""}
            onChange={(e) => {
              const sec = mySections.find((s) => s.assignmentId === e.target.value);
              if (sec) setSelectedSection(sec);
            }}
          >
            {mySections.map((s) => (
              <option key={s.assignmentId} value={s.assignmentId}>
                {formatGradeSection(s.gradeName, s.sectionName, mySections)}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedSection && examTypes.length > 0 && (
        <GradeSheet
          sectionId={selectedSection.sectionId}
          academicYearId={selectedSection.academicYearId}
          examTypes={examTypes}
        />
      )}
    </div>
  );
}