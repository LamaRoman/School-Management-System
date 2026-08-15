"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { CheckCircle2, Clock, Send, Undo2 } from "lucide-react";
import toast from "react-hot-toast";
import { useLatestRequest } from "@/hooks/useLatestRequest";

interface ExamType { id: string; name: string }

interface SectionRow {
  sectionId: string;
  sectionName: string;
  studentCount: number;
  status: "DRAFT" | "READY" | "PUBLISHED";
  markedReadyBy: string | null;
  markedReadyAt: string | null;
  publishedAt: string | null;
  entryStarted: boolean;
}

interface GradeRow {
  gradeId: string;
  gradeName: string;
  sections: SectionRow[];
}

const STATUS_LABEL: Record<SectionRow["status"], string> = {
  DRAFT: "Entry in progress",
  READY: "Ready to publish",
  PUBLISHED: "Published",
};

export default function AdminResultsPage() {
  const [activeYear, setActiveYear] = useState<any>(null);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notify, setNotify] = useState(true);
  const overviewRequest = useLatestRequest();

  useEffect(() => {
    (async () => {
      try {
        const year = await api.get<any>("/academic-years/active");
        setActiveYear(year);
        if (year) {
          const et = await api.get<ExamType[]>(`/exam-types?academicYearId=${year.id}`);
          setExamTypes(et);
          setSelectedExam(et[0]?.id ?? "");
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  const loadOverview = useCallback(() => {
    if (!activeYear || !selectedExam) return;
    // Publishing writes, so the same stale-response guard applies: a late
    // overview landing under a different exam would show one exam's readiness
    // while the buttons publish another.
    setGrades([]);
    setLoadingOverview(true);
    overviewRequest(
      () => api.get<GradeRow[]>(`/result-status/overview?academicYearId=${activeYear.id}&examTypeId=${selectedExam}`),
      (res) => { setGrades(res); setLoadingOverview(false); },
      () => setLoadingOverview(false),
    );
  }, [activeYear, selectedExam]);

  useEffect(loadOverview, [loadOverview]);

  const publish = async (body: Record<string, unknown>, label: string) => {
    setSaving(true);
    try {
      const res = await api.post<any>("/result-status/publish", {
        examTypeId: selectedExam, notify, ...body,
      });
      toast.success(`Published ${res.published} section${res.published === 1 ? "" : "s"} — ${label}`);
      loadOverview();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  const unpublish = async (sectionIds: string[]) => {
    setSaving(true);
    try {
      await api.post("/result-status/unpublish", { examTypeId: selectedExam, sectionIds });
      toast.success("Unpublished");
      loadOverview();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="max-w-5xl mx-auto p-6"><div className="card p-8 text-center text-gray-400">Loading...</div></div>;
  }

  const allSections = grades.flatMap((g) => g.sections);
  const readyCount = allSections.filter((s) => s.status === "READY").length;
  const publishedCount = allSections.filter((s) => s.status === "PUBLISHED").length;
  const everyoneReady = allSections.length > 0 && allSections.every((s) => s.status !== "DRAFT");

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-display font-bold text-primary mb-1">Publish Results</h1>
      <p className="text-sm text-gray-500 mb-6">
        Class teachers mark their section complete; publishing is what makes results visible to parents and students.
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {examTypes.map((et) => (
          <button key={et.id} onClick={() => setSelectedExam(et.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedExam === et.id ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
            {et.name}
          </button>
        ))}
      </div>

      {loadingOverview && <div className="card p-8 text-center text-gray-400">Loading...</div>}

      {!loadingOverview && allSections.length > 0 && (
        <>
          <div className="card p-5 mb-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm">
              <span className="font-semibold text-primary">{publishedCount}</span> published ·{" "}
              <span className="font-semibold text-blue-700">{readyCount}</span> ready ·{" "}
              <span className="font-semibold text-gray-500">
                {allSections.length - publishedCount - readyCount}
              </span>{" "}
              still in entry
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                Post a notice
              </label>
              <button
                onClick={() => publish({ all: true }, "whole school")}
                disabled={saving}
                className="btn-primary text-sm"
                title={everyoneReady ? undefined : "Some sections have not been marked complete yet"}
              >
                <Send size={14} /> {saving ? "..." : "Publish all"}
              </button>
            </div>
          </div>

          {!everyoneReady && (
            <p className="text-xs text-amber-600 mb-4">
              Some sections are still in entry. You can publish them anyway, or publish grade by grade below.
            </p>
          )}

          <div className="space-y-3">
            {grades.map((grade) => {
              const gradePublished = grade.sections.every((s) => s.status === "PUBLISHED");
              return (
                <div key={grade.gradeId} className="card p-4">
                  <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                    <h2 className="font-display font-bold text-primary text-sm">{grade.gradeName}</h2>
                    {grade.sections.length > 0 && (
                      gradePublished ? (
                        <button
                          onClick={() => unpublish(grade.sections.map((s) => s.sectionId))}
                          disabled={saving}
                          className="btn-ghost text-xs border border-gray-300"
                        >
                          <Undo2 size={13} /> Unpublish grade
                        </button>
                      ) : (
                        <button
                          onClick={() => publish({ gradeId: grade.gradeId }, grade.gradeName)}
                          disabled={saving}
                          className="btn-outline text-xs"
                        >
                          <Send size={13} /> Publish {grade.gradeName}
                        </button>
                      )
                    )}
                  </div>

                  {grade.sections.length === 0 && (
                    <p className="text-xs text-gray-400">No sections in this grade.</p>
                  )}

                  <div className="space-y-1.5">
                    {grade.sections.map((s) => (
                      <div key={s.sectionId} className="flex items-center justify-between gap-3 text-sm border-t pt-1.5">
                        <div className="min-w-0">
                          <span className="font-medium text-gray-700">Section {s.sectionName}</span>
                          <span className="text-xs text-gray-400 ml-2">{s.studentCount} students</span>
                          {s.markedReadyBy && s.status !== "PUBLISHED" && (
                            <p className="text-xs text-gray-500">Marked complete by {s.markedReadyBy}</p>
                          )}
                          {s.status === "DRAFT" && !s.entryStarted && (
                            <p className="text-xs text-gray-400">No marks entered yet</p>
                          )}
                        </div>
                        <span className={`text-xs font-semibold shrink-0 flex items-center gap-1 ${
                          s.status === "PUBLISHED" ? "text-emerald-600"
                            : s.status === "READY" ? "text-blue-600" : "text-gray-400"
                        }`}>
                          {s.status === "PUBLISHED" ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                          {STATUS_LABEL[s.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!loadingOverview && allSections.length === 0 && selectedExam && (
        <div className="card p-8 text-center text-gray-400">No sections found for this academic year.</div>
      )}
    </div>
  );
}
