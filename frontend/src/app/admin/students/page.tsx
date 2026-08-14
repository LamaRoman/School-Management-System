"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import toast from "react-hot-toast";
import { Plus, Trash2, Edit2, X, Save, Search, Camera } from "lucide-react";
import BSDatePicker from "@/components/ui/BSDatePicker";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface Student {
  id: string; name: string; nameNp?: string; rollNo?: number;
  dateOfBirth?: string; gender?: string; fatherName?: string; motherName?: string;
  guardianPhone?: string; address?: string; isActive: boolean;
  section: { name: string; grade: { name: string } };
}
interface Grade { id: string; name: string; sections: { id: string; name: string }[] }

// `photo` is undefined until the existing photo has been loaded for an edit, so a
// save that happens before then omits the field and leaves the stored photo alone.
const emptyForm = { name: "", nameNp: "", rollNo: undefined as number | undefined, dateOfBirth: "", gender: "", fatherName: "", motherName: "", guardianPhone: "", address: "", sectionId: "", photo: "" as string | undefined };

export default function StudentsPage() {
  const confirm = useConfirm();
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const editIdRef = useRef<string | null>(null);
  const [search, setSearch] = useState("");
  // Without these the table renders "No students in this section" while the
  // roster is still in flight — which reads as an empty class rather than as
  // loading, and is the reason a tap here feels like it didn't register.
  const [loadingGrades, setLoadingGrades] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const runStudents = useLatestRequest();

  useEffect(() => {
    (async () => {
      try {
        const year = await api.get<any>("/academic-years/active");
        if (year) {
          const g = await api.get<any[]>(`/grades?academicYearId=${year.id}`);
          setGrades(g);
          if (g.length > 0) {
            setSelectedGrade(g[0].id);
            if (g[0].sections?.length > 0) setSelectedSection(g[0].sections[0].id);
          }
        }
      } finally {
        setLoadingGrades(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedSection) return;
    setStudents([]);
    setLoadingStudents(true);
    runStudents(
      () => api.get<Student[]>(`/students?sectionId=${selectedSection}`),
      (data) => {
        setStudents(data);
        setLoadingStudents(false);
      },
      () => setLoadingStudents(false)
    );
  }, [selectedSection, runStudents]);

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
        const created = await api.post<any>("/students", payload);
        if (created?.accountCreated === false) {
          // Student saved, but with no login account. Long-lived toast — the 3s
          // success one is easy to miss and reads as "all fine".
          toast.error("Student added, but no login account was created.", { duration: 12000 });
        } else {
          toast.success("Student added");
        }
      }
      setShowForm(false); setEditId(null); editIdRef.current = null; setForm(emptyForm);
      runStudents(() => api.get<Student[]>(`/students?sectionId=${selectedSection}`), setStudents);
    } catch (err: any) { toast.error(err.message); }
  };

  const startEdit = async (s: Student) => {
    setForm({ name: s.name, nameNp: s.nameNp || "", rollNo: s.rollNo, dateOfBirth: s.dateOfBirth || "", gender: s.gender || "", fatherName: s.fatherName || "", motherName: s.motherName || "", guardianPhone: s.guardianPhone || "", address: s.address || "", sectionId: selectedSection, photo: undefined });
    setEditId(s.id); setShowForm(true);
    editIdRef.current = s.id;
    try {
      const full = await api.get<{ photo?: string }>(`/students/${s.id}`);
      if (editIdRef.current !== s.id) return;
      setForm((f) => ({ ...f, photo: full.photo || "" }));
    } catch { /* leave photo undefined so a save doesn't clear it */ }
  };

  const handleDelete = async (id: string) => {
    if (!await confirm({ title: "Deactivate student", message: "The student will be deactivated and will not appear in active lists.", confirmLabel: "Deactivate", variant: "warning" })) return;
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
        <div className="flex items-center gap-3">
          {selectedSection && (
            <span className="text-sm text-gray-500">
              {filtered.length} student{filtered.length !== 1 ? "s" : ""}
              {search && students.length !== filtered.length ? ` of ${students.length}` : ""}
            </span>
          )}
          <button onClick={() => { setShowForm(!showForm); setEditId(null); editIdRef.current = null; setForm(emptyForm); }} className="btn-primary">
            <Plus size={16} /> Add Student
          </button>
        </div>
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
            <button onClick={() => { setShowForm(false); setEditId(null); editIdRef.current = null; }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
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
            <div className="col-span-full">
              <label className="label">Photo</label>
              <div className="flex items-center gap-3">
                {form.photo ? (
                  <img src={form.photo} alt="Student" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200">
                    <Camera size={20} className="text-gray-400" />
                  </div>
                )}
                <div className="flex-1">
                  <input type="file" accept="image/*" className="hidden" id="photo-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 500 * 1024) { alert("Photo must be under 500KB"); return; }
                      const reader = new FileReader();
                      reader.onload = (ev) => setForm({ ...form, photo: ev.target?.result as string });
                      reader.readAsDataURL(file);
                    }}
                  />
                  <label htmlFor="photo-upload" className="btn-outline text-xs cursor-pointer inline-flex items-center gap-2">
                    <Camera size={14} /> {form.photo ? "Change Photo" : "Upload Photo"}
                  </label>
                  {form.photo && (
                    <button type="button" onClick={() => setForm({ ...form, photo: "" })} className="ml-2 text-xs text-red-500 hover:underline">Remove</button>
                  )}
                  <p className="text-xs text-gray-400 mt-1">Max 500KB. JPG or PNG.</p>
                </div>
              </div>
            </div>
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
            {loadingGrades || loadingStudents ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400 animate-pulse">Loading students...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">{selectedSection ? "No students in this section" : "Select a grade and section"}</td></tr>
            ) : filtered.map((s) => (
              <tr
                key={s.id}
                onClick={() => router.push(`/admin/students/${s.id}`)}
                className="border-t border-gray-100 hover:bg-surface transition-colors cursor-pointer"
              >
                <td className="px-5 py-3 text-gray-400 font-medium">{s.rollNo || "—"}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-primary">{s.name[0]}</span>
                    </div>
                    <div>
                      <div className="font-medium text-primary">{s.name}</div>
                      {s.nameNp && <div className="text-xs text-gray-400">{s.nameNp}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-500">{s.dateOfBirth || "—"}</td>
                <td className="px-5 py-3 text-gray-500">{s.gender || "—"}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{s.guardianPhone || "—"}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={(e) => { e.stopPropagation(); startEdit(s); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600 transition-all"><Edit2 size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all"><Trash2 size={14} /></button>
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