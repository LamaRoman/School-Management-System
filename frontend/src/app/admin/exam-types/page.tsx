"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";

interface ExamType { id: string; name: string; displayOrder: number; paperSize: string; showRank: boolean }

export default function ExamTypesPage() {
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [activeYear, setActiveYear] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", displayOrder: 0, paperSize: "A5", showRank: true });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const year = await api.get<any>("/academic-years/active");
      setActiveYear(year);
      if (year) {
        const et = await api.get<ExamType[]>(`/exam-types?academicYearId=${year.id}`);
        setExamTypes(et);
      }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeYear) return toast.error("Create an academic year first");
    try {
      await api.post("/exam-types", { ...form, academicYearId: activeYear.id });
      toast.success("Exam type created");
      setShowForm(false);
      setForm({ name: "", displayOrder: examTypes.length + 1, paperSize: "A5", showRank: true });
      fetchData();
    } catch (err: any) { toast.error(err.message); }
  };

  const updateField = async (id: string, field: string, value: any) => {
    try {
      await api.put(`/exam-types/${id}`, { [field]: value });
      toast.success("Updated");
      fetchData();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this exam type?")) return;
    try { await api.delete(`/exam-types/${id}`); toast.success("Deleted"); fetchData(); } catch (err: any) { toast.error(err.message); }
  };

  const seedDefaults = async () => {
    if (!activeYear) return toast.error("Create an academic year first");
    const defaults = [
      { name: "First Terminal", displayOrder: 1, paperSize: "A5", showRank: true },
      { name: "Second Terminal", displayOrder: 2, paperSize: "A5", showRank: true },
      { name: "Final", displayOrder: 3, paperSize: "A4", showRank: true },
    ];
    try {
      for (const d of defaults) await api.post("/exam-types", { ...d, academicYearId: activeYear.id });
      toast.success("Default exam types created");
      fetchData();
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Exam Types</h1>
          <p className="text-sm text-gray-500 mt-1">Configure terminal exams, paper sizes, and rank display</p>
        </div>
        <div className="flex gap-2">
          {examTypes.length === 0 && activeYear && (
            <button onClick={seedDefaults} className="btn-outline text-xs">Quick: Add Defaults</button>
          )}
          <button onClick={() => setShowForm(!showForm)} className="btn-primary"><Plus size={16} /> Add Exam</button>
        </div>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <form onSubmit={handleCreate} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="label">Exam Name</label>
              <input className="input" placeholder="e.g. First Terminal" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="w-28">
              <label className="label">Order</label>
              <input type="number" className="input" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="w-32">
              <label className="label">Paper Size</label>
              <select className="input" value={form.paperSize} onChange={(e) => setForm({ ...form, paperSize: e.target.value })}>
                <option value="A5">A5</option>
                <option value="A4">A4</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer mt-6">
                <input type="checkbox" checked={form.showRank} onChange={(e) => setForm({ ...form, showRank: e.target.checked })} className="rounded" />
                Show Rank
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Save</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header">
              <th className="text-left px-5 py-3">Order</th>
              <th className="text-left px-5 py-3">Exam Name</th>
              <th className="text-center px-5 py-3">Paper Size</th>
              <th className="text-center px-5 py-3">Show Rank</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : examTypes.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No exam types yet</td></tr>
            ) : examTypes.map((et) => (
              <tr key={et.id} className="border-t border-gray-100 hover:bg-surface transition-colors">
                <td className="px-5 py-3 text-gray-400">{et.displayOrder}</td>
                <td className="px-5 py-3 font-semibold text-primary">{et.name}</td>
                <td className="px-5 py-3 text-center">
                  <select value={et.paperSize} onChange={(e) => updateField(et.id, "paperSize", e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white cursor-pointer">
                    <option value="A5">A5</option>
                    <option value="A4">A4</option>
                  </select>
                </td>
                <td className="px-5 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={et.showRank}
                    onChange={(e) => updateField(et.id, "showRank", e.target.checked)}
                    className="rounded cursor-pointer"
                  />
                </td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => handleDelete(et.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}