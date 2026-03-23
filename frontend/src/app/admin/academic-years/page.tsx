"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, Star } from "lucide-react";

interface AcademicYear {
  id: string;
  yearBS: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  _count: { grades: number };
}

export default function AcademicYearsPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ yearBS: "", startDate: "", endDate: "" });
  const [loading, setLoading] = useState(true);

  const fetchYears = () => {
    api.get<AcademicYear[]>("/academic-years").then(setYears).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(fetchYears, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/academic-years", { ...form, isActive: years.length === 0 });
      toast.success("Academic year created");
      setShowForm(false);
      setForm({ yearBS: "", startDate: "", endDate: "" });
      fetchYears();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const setActive = async (id: string) => {
    try {
      await api.put(`/academic-years/${id}`, { isActive: true });
      toast.success("Active year updated");
      fetchYears();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this academic year? All related data will be removed.")) return;
    try {
      await api.delete(`/academic-years/${id}`);
      toast.success("Deleted");
      fetchYears();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Academic Years</h1>
          <p className="text-sm text-gray-500 mt-1">Manage Bikram Sambat academic years</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus size={16} /> Add Year
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <form onSubmit={handleCreate} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[140px]">
              <label className="label">Year (BS)</label>
              <input className="input" placeholder="e.g. 2082" value={form.yearBS} onChange={(e) => setForm({ ...form, yearBS: e.target.value })} required />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="label">Start Date</label>
              <input className="input" placeholder="2082/01/01" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="label">End Date</label>
              <input className="input" placeholder="2082/12/30" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
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
              <th className="text-left px-5 py-3">Year (BS)</th>
              <th className="text-left px-5 py-3">Period</th>
              <th className="text-center px-5 py-3">Grades</th>
              <th className="text-center px-5 py-3">Status</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : years.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No academic years yet</td></tr>
            ) : (
              years.map((y) => (
                <tr key={y.id} className="border-t border-gray-100 hover:bg-surface transition-colors">
                  <td className="px-5 py-3 font-semibold text-primary">{y.yearBS} B.S.</td>
                  <td className="px-5 py-3 text-gray-500">{y.startDate && y.endDate ? `${y.startDate} – ${y.endDate}` : "—"}</td>
                  <td className="px-5 py-3 text-center">{y._count.grades}</td>
                  <td className="px-5 py-3 text-center">
                    {y.isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                        <Star size={12} fill="currentColor" /> Active
                      </span>
                    ) : (
                      <button onClick={() => setActive(y.id)} className="text-xs text-gray-400 hover:text-primary transition-colors">
                        Set Active
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => handleDelete(y.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
