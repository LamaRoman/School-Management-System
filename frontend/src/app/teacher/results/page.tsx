"use client";
import { useState, useEffect } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { formatGradeSection } from "@/lib/bsDate";
import { useMyAssignments, type ClassTeacherSection } from "@/hooks/useReferenceData";
import { CheckCircle2, AlertTriangle, Clock, Undo2 } from "lucide-react";
import toast from "react-hot-toast";

interface ExamType { id: string; name: string }

interface MissingStudent { id: string; name: string; rollNo: number | null }

interface SubjectRow {
  subjectId: string;
  subjectName: string;
  isOptional: boolean;
  expected: number;
  entered: number;
  missingStudents: MissingStudent[];
}

interface StatusData {
  status: "DRAFT" | "READY" | "PUBLISHED";
  markedReadyAt: string | null;
  markedReadyBy: string | null;
  publishedAt: string | null;
  completeness: {
    totalStudents: number;
    totalSubjects: number;
    subjectsComplete: number;
    missingCount: number;
    bySubject: SubjectRow[];
  };
}

export default function TeacherResultsPage() {
  const [pickedSection, setPickedSection] = useState<ClassTeacherSection | null>(null);
  const [selectedExam, setSelectedExam] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { classTeacherSections: mySections, loading } = useMyAssignments();

  const selectedSection = pickedSection ?? mySections[0] ?? null;

  const { data: examTypesData } = useSWR<ExamType[]>(
    selectedSection ? `/exam-types?academicYearId=${selectedSection.academicYearId}` : null
  );
  const examTypes = examTypesData ?? [];

  useEffect(() => {
    setSelectedExam(examTypesData?.[0]?.id ?? "");
  }, [examTypesData]);

  // The buttons below write, so the status is keyed by the section and exam it
  // describes: a late response cannot land under a different selection and let
  // a teacher mark the wrong class complete (F4).
  const {
    data,
    isLoading: loadingStatus,
    mutate: loadStatus,
  } = useSWR<StatusData>(
    selectedSection && selectedExam
      ? `/result-status/section/${selectedSection.sectionId}/${selectedExam}`
      : null
  );

  const act = async (path: "ready" | "reopen") => {
    if (!selectedSection || !selectedExam) return;
    setSaving(true);
    try {
      await api.post(`/result-status/${path}`, {
        sectionId: selectedSection.sectionId,
        examTypeId: selectedExam,
      });
      toast.success(path === "ready" ? "Marked complete — sent to admin for publishing" : "Re-opened for entry");
      loadStatus();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="max-w-5xl mx-auto p-6"><div className="card p-8 text-center text-gray-400">Loading...</div></div>;
  }

  if (mySections.length === 0) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-display font-bold text-primary mb-6">Results</h1>
        <div className="card p-8 text-center text-gray-400">
          You are not a class teacher of any section.
        </div>
      </div>
    );
  }

  const c = data?.completeness;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-display font-bold text-primary mb-1">Results</h1>
      <p className="text-sm text-gray-500 mb-6">
        Mark an exam complete when marks entry is done. An admin publishes it to parents and students.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {mySections.map((s) => (
          <button key={s.assignmentId} onClick={() => setPickedSection(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedSection?.sectionId === s.sectionId ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
            {formatGradeSection(s.gradeName, s.sectionName)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {examTypes.map((et) => (
          <button key={et.id} onClick={() => setSelectedExam(et.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedExam === et.id ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
            {et.name}
          </button>
        ))}
      </div>

      {loadingStatus && <div className="card p-8 text-center text-gray-400">Loading...</div>}

      {!loadingStatus && data && c && (
        <>
          <div className="card p-5 mb-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {data.status === "PUBLISHED" ? (
                    <><CheckCircle2 size={18} className="text-emerald-600" /><span className="font-display font-bold text-emerald-700">Published</span></>
                  ) : data.status === "READY" ? (
                    <><Clock size={18} className="text-blue-600" /><span className="font-display font-bold text-blue-700">Marked complete</span></>
                  ) : (
                    <><Clock size={18} className="text-gray-400" /><span className="font-display font-bold text-gray-600">Entry in progress</span></>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {data.status === "PUBLISHED"
                    ? "Parents and students can see these results."
                    : data.status === "READY"
                      ? `Marked complete${data.markedReadyBy ? ` by ${data.markedReadyBy}` : ""}. Waiting for an admin to publish — families cannot see these yet.`
                      : "Families see a “not published yet” message until an admin publishes."}
                </p>
              </div>

              <div className="flex gap-2">
                {data.status === "DRAFT" && (
                  <button onClick={() => act("ready")} disabled={saving} className="btn-primary text-sm">
                    {saving ? "..." : "Mark complete"}
                  </button>
                )}
                {data.status === "READY" && (
                  <button onClick={() => act("reopen")} disabled={saving} className="btn-outline text-sm">
                    <Undo2 size={14} /> {saving ? "..." : "Re-open for entry"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* The running indicator W1b asks for — visible during entry, not
              only as a warning at the moment of marking complete. */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold text-primary text-sm">
                {c.subjectsComplete} of {c.totalSubjects} subjects fully entered
              </h2>
              <span className={`text-xs font-semibold ${c.missingCount === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                {c.missingCount === 0 ? "Nothing missing" : `${c.missingCount} marks missing`}
              </span>
            </div>

            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${c.totalSubjects > 0 ? (c.subjectsComplete / c.totalSubjects) * 100 : 0}%`,
                  background: c.subjectsComplete === c.totalSubjects ? "#22c55e" : "#f59e0b",
                }} />
            </div>

            {c.missingCount > 0 && (
              <p className="text-xs text-gray-500 mb-3 flex items-start gap-1.5">
                <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                You can still mark this complete — some gaps are legitimate, like a student who joined after the exam.
              </p>
            )}

            <div className="space-y-2">
              {c.bySubject.map((s) => (
                <div key={s.subjectId} className="flex items-start justify-between gap-3 text-sm border-t pt-2">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-700">{s.subjectName}</span>
                    {s.isOptional && <span className="ml-2 text-[10px] text-gray-400 uppercase">optional</span>}
                    {s.missingStudents.length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        No mark for{" "}
                        {s.missingStudents.slice(0, 4).map((m) => m.name).join(", ")}
                        {s.missingStudents.length > 4 && ` and ${s.missingStudents.length - 4} more`}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs font-semibold shrink-0 ${s.entered === s.expected ? "text-emerald-600" : "text-amber-600"}`}>
                    {s.entered}/{s.expected}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
