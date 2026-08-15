"use client";
import { useState } from "react";
import useSWR from "swr";
import { formatGradeSection } from "@/lib/bsDate";
import GradeSheet from "@/components/ui/GradeSheet";
import { useMyAssignments, type ClassTeacherSection } from "@/hooks/useReferenceData";

interface ExamType { id: string; name: string; isFinal: boolean }

export default function TeacherGradeSheetPage() {
  const { classTeacherSections: mySections, loading } = useMyAssignments();
  const [pickedSection, setPickedSection] = useState<ClassTeacherSection | null>(null);
  const selectedSection = pickedSection ?? mySections[0] ?? null;

  const { data: examTypesData } = useSWR<ExamType[]>(
    selectedSection ? `/exam-types?academicYearId=${selectedSection.academicYearId}` : null
  );
  const examTypes = examTypesData ?? [];

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
            {selectedSection ? formatGradeSection(selectedSection.gradeName, selectedSection.sectionName) : ""}
          </p>
        </div>
        {mySections.length > 1 && (
          <select
            className="input w-auto"
            value={selectedSection?.assignmentId || ""}
            onChange={(e) => {
              const sec = mySections.find((s) => s.assignmentId === e.target.value);
              if (sec) setPickedSection(sec);
            }}
          >
            {mySections.map((s) => (
              <option key={s.assignmentId} value={s.assignmentId}>
                {formatGradeSection(s.gradeName, s.sectionName)}
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