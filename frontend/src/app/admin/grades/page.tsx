"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface Section { id: string; name: string; _count: { students: number } }
interface Grade { id: string; name: string; displayOrder: number; sections: Section[]; _count: { subjects: number; sections: number } }

export default function GradesPage() {
  const confirm = useConfirm();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [activeYear, setActiveYear] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showGradeForm, setShowGradeForm] = useState(false);
  const [gradeForm, setGradeForm] = useState({ name: "", displayOrder: 0 });
  const [sectionForm, setSectionForm] = useState({ gradeId: "", name: "" });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const year = await api.get<any>("/academic-years/active");
      setActiveYear(year);
      if (year) {
        const g = await api.get<Grade[]>(`/grades?academicYearId=${year.id}`);
        setGrades(g);
      }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

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
    const name = prompt("Section name (e.g. A, B, C):");
    if (!name) return;
    try {
      await api.post("/sections", { name: name.trim().toUpperCase(), gradeId });
      toast.success("Section added");
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Grades & Sections</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeYear ? `Academic Year: ${activeYear.yearBS} B.S.` : "No active academic year"}
          </p>
        </div>
        <div className="flex gap-2">
          {grades.length === 0 && activeYear && (
            <button onClick={seedAllGrades} className="btn-outline text-xs">
              Quick: Add Nursery–X
            </button>
          )}
          <button onClick={() => setShowGradeForm(!showGradeForm)} className="btn-primary">
            <Plus size={16} /> Add Grade
          </button>
        </div>
      </div>

      {showGradeForm && (
        <div className="card p-5 mb-6">
          <form onSubmit={addGrade} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="label">Grade Name</label>
              <input className="input" placeholder="e.g. Nursery, I, II..." value={gradeForm.name} onChange={(e) => setGradeForm({ ...gradeForm, name: e.target.value })} required />
            </div>
            <div className="w-32">
              <label className="label">Order</label>
              <input type="number" className="input" value={gradeForm.displayOrder} onChange={(e) => setGradeForm({ ...gradeForm, displayOrder: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Save</button>
              <button type="button" onClick={() => setShowGradeForm(false)} className="btn-ghost">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="card p-8 text-center text-gray-400">Loading...</div>
        ) : grades.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">No grades yet. Add them above or use the quick seed button.</div>
        ) : (
          grades.map((grade) => (
            <div key={grade.id} className="card overflow-hidden">
              <div
                className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-surface transition-colors"
                onClick={() => toggleExpand(grade.id)}
              >
                <div className="flex items-center gap-3">
                  {expanded.has(grade.id) ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                  <span className="font-semibold text-primary">{grade.name}</span>
                  <span className="text-xs text-gray-400">
                    {grade._count.sections} section{grade._count.sections !== 1 ? "s" : ""} · {grade._count.subjects} subject{grade._count.subjects !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); addSection(grade.id); }}
                    className="text-xs text-primary hover:underline"
                  >
                    + Section
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteGrade(grade.id); }}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {expanded.has(grade.id) && grade.sections.length > 0 && (
                <div className="border-t border-gray-100 bg-surface/50 px-5 py-3">
                  <div className="flex flex-wrap gap-2">
                    {grade.sections.map((sec) => (
                      <div key={sec.id} className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
                        <span className="font-medium">Section {sec.name}</span>
                       <span className="text-xs text-gray-400">{sec._count?.students ?? 0} students</span>
                        <button onClick={() => deleteSection(sec.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
