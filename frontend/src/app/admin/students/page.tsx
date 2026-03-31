"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, Edit2, X, Save, Search } from "lucide-react";
import BSDatePicker from "@/components/ui/BSDatePicker";

interface Student {
  id: string; name: string; nameNp?: string; rollNo?: number;
  dateOfBirth?: string; gender?: string; fatherName?: string; motherName?: string;
  guardianPhone?: string; address?: string; isActive: boolean;
  section: { name: string; grade: { name: string } };
}
interface Grade { id: string; name: string; sections: { id: string; name: string }[] }

const emptyForm = { name: "", nameNp: "", rollNo: undefined as number | undefined, dateOfBirth: "", gender: "", fatherName: "", motherName: "", guardianPhone: "", address: "", sectionId: "" };

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const year = await api.get<any>("/academic-years/active");
      if (year) {
        const g = await api.get<any[]>(`/grades?academicYearId=${year.id}`);
        setGrades(g);
        if (g.length > 0) {
          setSelectedGrade(g[0].id);
          if (g[0].sections?.length > 0) setSelectedSection(g[0].sections[0].id);
        }
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedSection) return;
    api.get<Student[]>(`/students?sectionId=${selectedSection}`).then(setStudents).catch(() => {});
  }, [selectedSection]);

  const currentGrade = grades.find((g) => g.id === selectedGrade);
  const sections = currentGrade?.sections || [];

  const handleGradeChange = (gId: string) => {
    setSelectedGrade(gId);
    const g = grades.find((gr) => gr.id === gId);
    if (g?.sections?.length) setSelectedSection(g.sections[0].id);
    else setSelectedSection("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...form, sectionId: selectedSection, rollNo: form.rollNo || undefined };
      if (editId) {
        await api.put(`/students/${editId}`, payload);
        toast.success("Student updated");
      } else {
        await api.post("/students", payload);
        toast.success("Student added");
      }
      setShowForm(false); setEditId(null); setForm(emptyForm);
      api.get<Student[]>(`/students?sectionId=${selectedSection}`).then(setStudents);
    } catch (err: any) { toast.error(err.message); }
  };

  const startEdit = (s: Student) => {
    setForm({ name: s.name, nameNp: s.nameNp || "", rollNo: s.rollNo, dateOfBirth: s.dateOfBirth || "", gender: s.gender || "", fatherName: s.fatherName || "", motherName: s.motherName || "", guardianPhone: s.guardianPhone || "", address: s.address || "", sectionId: selectedSection });
    setEditId(s.id); setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deactivate this student?")) return;
    try { await api.delete(`/students/${id}`); toast.success("Student deactivated"); api.get<Student[]>(`/students?sectionId=${selectedSection}`).then(setStudents); } catch (err: any) { toast.error(err.message); }
  };

  const filtered = students.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Students</h1>
          <p className="text-sm text-gray-500 mt-1">Manage student records by class and section</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(emptyForm); }} className="btn-primary">
          <Plus size={16} /> Add Student
        </button>
      </div>

      {/* Grade + Section selector */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="flex gap-2 flex-wrap">
          {grades.map((g) => (
            <button key={g.id} onClick={() => handleGradeChange(g.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedGrade === g.id ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
              {g.name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {sections.map((sec: any) => (
          <button key={sec.id} onClick={() => setSelectedSection(sec.id)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${selectedSection === sec.id ? "bg-accent text-white" : "bg-white border border-gray-200 text-gray-500 hover:border-accent"}`}>
            Section {sec.name}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-primary">{editId ? "Edit Student" : "Add Student"}</h3>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><label className="label">Full Name *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><label className="label">Name (Nepali)</label><input className="input" value={form.nameNp} onChange={(e) => setForm({ ...form, nameNp: e.target.value })} /></div>
            <div><label className="label">Roll No</label><input type="number" className="input" value={form.rollNo || ""} onChange={(e) => setForm({ ...form, rollNo: parseInt(e.target.value) || undefined })} /></div>
            <div><label className="label">Date of Birth (BS)</label><BSDatePicker value={form.dateOfBirth} onChange={(date) => setForm({ ...form, dateOfBirth: date })} placeholder="2068/03/15" /></div>
            <div>
              <label className="label">Gender</label>
              <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
              </select>
            </div>
            <div><label className="label">Father's Name</label><input className="input" value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} /></div>
            <div><label className="label">Mother's Name</label><input className="input" value={form.motherName} onChange={(e) => setForm({ ...form, motherName: e.target.value })} /></div>
            <div><label className="label">Guardian Phone</label><input className="input" value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} /></div>
            <div><label className="label">Address</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="col-span-full flex justify-end"><button type="submit" className="btn-primary"><Save size={16} /> {editId ? "Update" : "Save"}</button></div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-9" placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header">
              <th className="text-left px-5 py-3">Roll</th>
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-5 py-3">DOB</th>
              <th className="text-left px-5 py-3">Gender</th>
              <th className="text-left px-5 py-3">Guardian</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">{selectedSection ? "No students in this section" : "Select a grade and section"}</td></tr>
            ) : filtered.map((s) => (
              <tr key={s.id} className="border-t border-gray-100 hover:bg-surface transition-colors">
                <td className="px-5 py-3 text-gray-400 font-medium">{s.rollNo || "—"}</td>
                <td className="px-5 py-3">
                  <div className="font-medium text-primary">{s.name}</div>
                  {s.nameNp && <div className="text-xs text-gray-400">{s.nameNp}</div>}
                </td>
                <td className="px-5 py-3 text-gray-500">{s.dateOfBirth || "—"}</td>
                <td className="px-5 py-3 text-gray-500">{s.gender || "—"}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{s.guardianPhone || "—"}</td>
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