"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, Edit2, X, Save } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface Subject {
  id: string; name: string; nameNp?: string;
  fullTheoryMarks: number; fullPracticalMarks: number; passMarks: number;
  isOptional: boolean; displayOrder: number;
  grade: { name: string };
}
interface Grade { id: string; name: string; displayOrder: number }

const emptyForm = { name: "", nameNp: "", fullTheoryMarks: 100, fullPracticalMarks: 0, passMarks: 40, isOptional: false, displayOrder: 0, gradeId: "" };

export default function SubjectsPage() {
  const confirm = useConfirm();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchGrades = async () => {
    const year = await api.get<any>("/academic-years/active");
    if (year) {
      const g = await api.get<Grade[]>(`/grades?academicYearId=${year.id}`);
      setGrades(g);
      if (g.length > 0 && !selectedGrade) setSelectedGrade(g[0].id);
    }
    setLoading(false);
  };

  const fetchSubjects = () => {
    if (!selectedGrade) return;
    api.get<Subject[]>(`/subjects?gradeId=${selectedGrade}`).then(setSubjects).catch(() => {});
  };

  useEffect(() => { fetchGrades(); }, []);
  useEffect(() => { fetchSubjects(); }, [selectedGrade]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.put(`/subjects/${editId}`, form);
        toast.success("Subject updated");
      } else {
        await api.post("/subjects", { ...form, gradeId: selectedGrade });
        toast.success("Subject added");
      }
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
      fetchSubjects();
    } catch (err: any) { toast.error(err.message); }
  };

  const startEdit = (s: Subject) => {
    setForm({ name: s.name, nameNp: s.nameNp || "", fullTheoryMarks: s.fullTheoryMarks, fullPracticalMarks: s.fullPracticalMarks, passMarks: s.passMarks, isOptional: s.isOptional, displayOrder: s.displayOrder, gradeId: selectedGrade });
    setEditId(s.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!await confirm({ title: "Delete subject", message: "This subject and all related marks will be removed.", confirmLabel: "Delete", variant: "danger" })) return;
    try { await api.delete(`/subjects/${id}`); toast.success("Deleted"); fetchSubjects(); } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Subjects</h1>
          <p className="text-sm text-gray-500 mt-1">Configure subjects per grade with marks</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ ...emptyForm, gradeId: selectedGrade }); }} className="btn-primary">
          <Plus size={16} /> Add Subject
        </button>
      </div>

      {/* Grade selector */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {grades.map((g) => (
          <button key={g.id} onClick={() => setSelectedGrade(g.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedGrade === g.id ? "bg-primary text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
            {g.name}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-primary">{editId ? "Edit Subject" : "Add Subject"}</h3>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="label">Subject Name</label>
              <input className="input" placeholder="e.g. Mathematics" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="col-span-2">
              <label className="label">Name (Nepali)</label>
              <input className="input" placeholder="e.g. गणित" value={form.nameNp} onChange={(e) => setForm({ ...form, nameNp: e.target.value })} />
            </div>
            <div>
              <label className="label">Theory Full Marks</label>
              <input type="number" className="input" value={form.fullTheoryMarks} onChange={(e) => setForm({ ...form, fullTheoryMarks: parseInt(e.target.value) || 0 })} required />
            </div>
            <div>
              <label className="label">Practical Full Marks</label>
              <input type="number" className="input" value={form.fullPracticalMarks} onChange={(e) => setForm({ ...form, fullPracticalMarks: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="label">Pass Marks</label>
              <input type="number" className="input" value={form.passMarks} onChange={(e) => setForm({ ...form, passMarks: parseInt(e.target.value) || 0 })} required />
            </div>
            <div>
              <label className="label">Order</label>
              <input type="number" className="input" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="col-span-2 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isOptional} onChange={(e) => setForm({ ...form, isOptional: e.target.checked })} className="rounded" />
                Optional Subject
              </label>
              <div className="flex-1" />
              <button type="submit" className="btn-primary"><Save size={16} /> {editId ? "Update" : "Save"}</button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header">
              <th className="text-left px-5 py-3">#</th>
              <th className="text-left px-5 py-3">Subject</th>
              <th className="text-center px-5 py-3">Theory</th>
              <th className="text-center px-5 py-3">Practical</th>
              <th className="text-center px-5 py-3">Full Marks</th>
              <th className="text-center px-5 py-3">Pass Marks</th>
              <th className="text-center px-5 py-3">Type</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {subjects.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">{selectedGrade ? "No subjects for this grade" : "Select a grade"}</td></tr>
            ) : subjects.map((s, i) => (
              <tr key={s.id} className="border-t border-gray-100 hover:bg-surface transition-colors">
                <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                <td className="px-5 py-3">
                  <div className="font-medium text-primary">{s.name}</div>
                  {s.nameNp && <div className="text-xs text-gray-400">{s.nameNp}</div>}
                </td>
                <td className="px-5 py-3 text-center">{s.fullTheoryMarks}</td>
                <td className="px-5 py-3 text-center">{s.fullPracticalMarks || "—"}</td>
                <td className="px-5 py-3 text-center font-semibold">{s.fullTheoryMarks + s.fullPracticalMarks}</td>
                <td className="px-5 py-3 text-center">{s.passMarks}</td>
                <td className="px-5 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${s.isOptional ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                    {s.isOptional ? "Optional" : "Compulsory"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => startEdit(s)} className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600 transition-all"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(s.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
