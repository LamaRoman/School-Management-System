"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, Users, Layers, X } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface Section { id: string; name: string; _count: { students: number } }
interface Grade { id: string; name: string; displayOrder: number; sections: Section[]; _count: { subjects: number; sections: number } }

export default function GradesPage() {
  const confirm = useConfirm();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [activeYear, setActiveYear] = useState<any>(null);
  const [showGradeForm, setShowGradeForm] = useState(false);
  const [gradeForm, setGradeForm] = useState({ name: "", displayOrder: 0 });
  const [addingSectionFor, setAddingSectionFor] = useState<string | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const year = await api.get<any>("/academic-years/active");
      setActiveYear(year);
      if (year) {
        const g = await api.get<Grade[]>(`/grades?academicYearId=${year.id}`);
        setGrades(g);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const addGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeYear) return toast.error("Create an academic year first");
    try {
      await api.post("/grades", { ...gradeForm, academicYearId: activeYear.id });
      toast.success("Grade added");
      setShowGradeForm(false);
      setGradeForm({ name: "", displayOrder: grades.length });
      fetchData();
    } catch (err: any) { toast.error(err.message); }
  };

  const addSection = async (gradeId: string) => {
    if (!sectionName.trim()) return;
    try {
      await api.post("/sections", { name: sectionName.trim().toUpperCase(), gradeId });
      toast.success("Section added");
      setAddingSectionFor(null);
      setSectionName("");
      fetchData();
    } catch (err: any) { toast.error(err.message); }
  };

  const deleteGrade = async (id: string) => {
    if (!await confirm({ title: "Delete grade", message: "This grade and all its sections, subjects, and student data will be permanently removed.", confirmLabel: "Delete", variant: "danger" })) return;
    try { await api.delete(`/grades/${id}`); toast.success("Deleted"); fetchData(); } catch (err: any) { toast.error(err.message); }
  };

  const deleteSection = async (id: string) => {
    if (!await confirm({ title: "Delete section", message: "This section and all its students will be permanently removed.", confirmLabel: "Delete", variant: "danger" })) return;
    try { await api.delete(`/sections/${id}`); toast.success("Deleted"); fetchData(); } catch (err: any) { toast.error(err.message); }
  };

  const seedAllGrades = async () => {
    if (!activeYear) return toast.error("Create an academic year first");
    const gradeNames = ["Nursery", "LKG", "UKG", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
    try {
      for (let i = 0; i < gradeNames.length; i++) {
        await api.post("/grades", { name: gradeNames[i], displayOrder: i, academicYearId: activeYear.id });
      }
      toast.success("All grades created (Nursery–X)");
      fetchData();
    } catch (err: any) { toast.error(err.message); }
  };

  const totalSections = grades.reduce((s, g) => s + g.sections.length, 0);
  const totalStudents = grades.reduce((s, g) => s + g.sections.reduce((s2, sec) => s2 + (sec._count?.students ?? 0), 0), 0);

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Grades & Sections</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeYear ? `Academic Year: ${activeYear.yearBS} B.S.` : "No active academic year"}
          </p>
        </div>
        <div className="flex gap-2">
          {grades.length === 0 && activeYear && (
            <button onClick={seedAllGrades} className="btn-outline text-xs">Quick: Add Nursery–X</button>
          )}
          <button onClick={() => { setShowGradeForm(!showGradeForm); setGradeForm({ name: "", displayOrder: grades.length }); }} className="btn-primary">
            <Plus size={16} /> Add Grade
          </button>
        </div>
      </div>

      {/* Summary */}
      {grades.length > 0 && (
        <div className="flex gap-4 mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Layers size={14} className="text-primary" />
            <span><span className="font-semibold text-gray-800">{grades.length}</span> grades</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Layers size={14} className="text-primary" />
            <span><span className="font-semibold text-gray-800">{totalSections}</span> sections</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Users size={14} className="text-primary" />
            <span><span className="font-semibold text-gray-800">{totalStudents}</span> students</span>
          </div>
        </div>
      )}

      {/* Add Grade Form */}
      {showGradeForm && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-semibold text-primary mb-3">New Grade</h3>
          <form onSubmit={addGrade} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="label">Grade Name</label>
              <input className="input" placeholder="e.g. Nursery, I, II..." value={gradeForm.name} onChange={(e) => setGradeForm({ ...gradeForm, name: e.target.value })} required autoFocus />
            </div>
            <div className="w-28">
              <label className="label">Order</label>
              <input type="number" className="input" value={gradeForm.displayOrder} onChange={(e) => setGradeForm({ ...gradeForm, displayOrder: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary text-sm">Save</button>
              <button type="button" onClick={() => setShowGradeForm(false)} className="btn-ghost text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Empty State */}
      {grades.length === 0 && (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mx-auto mb-4">
            <Layers size={28} className="text-primary/40" />
          </div>
          <p className="text-gray-500 text-sm mb-1">No grades yet</p>
          <p className="text-gray-400 text-xs">Add grades above or use the quick seed to create Nursery through X.</p>
        </div>
      )}

      {/* Grade Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {grades.map((grade) => {
          const studentCount = grade.sections.reduce((s, sec) => s + (sec._count?.students ?? 0), 0);

          return (
            <div key={grade.id} className="card overflow-hidden">
              {/* Grade Header */}
              <div className="flex items-center justify-between px-5 py-3 bg-surface/50 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">{grade.displayOrder + 1}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-primary text-sm">{grade.name}</h3>
                    <p className="text-[10px] text-gray-400">
                      {grade._count.subjects} subject{grade._count.subjects !== 1 ? "s" : ""} · {studentCount} student{studentCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => deleteGrade(grade.id)}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-all"
                  title="Delete grade"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Sections */}
              <div className="px-5 py-3">
                {grade.sections.length === 0 ? (
                  <p className="text-xs text-gray-400 italic mb-2">No sections added</p>
                ) : (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {grade.sections.map((sec) => (
                      <div key={sec.id} className="group inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:border-primary/30 transition-all">
                        <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-primary">{sec.name}</span>
                        </div>
                        <span className="text-xs text-gray-500">{sec._count?.students ?? 0}</span>
                        <button
                          onClick={() => deleteSection(sec.id)}
                          className="text-gray-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete section"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Section */}
                {addingSectionFor === grade.id ? (
                  <div className="flex gap-2 items-center">
                    <input
                      className="input text-xs py-1.5 w-24"
                      placeholder="e.g. A"
                      value={sectionName}
                      onChange={(e) => setSectionName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSection(grade.id); } }}
                      autoFocus
                    />
                    <button onClick={() => addSection(grade.id)} className="btn-primary text-xs py-1.5 px-3">Add</button>
                    <button onClick={() => { setAddingSectionFor(null); setSectionName(""); }} className="text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingSectionFor(grade.id); setSectionName(""); }}
                    className="text-xs text-primary hover:text-primary-dark font-medium flex items-center gap-1 transition-colors"
                  >
                    <Plus size={12} /> Add Section
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
