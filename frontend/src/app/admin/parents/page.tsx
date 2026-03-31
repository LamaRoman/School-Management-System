"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Plus, X, UserPlus, Link2, Unlink, Search, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";

interface Student {
  id: string;
  name: string;
  rollNo?: number;
  section: { name: string; grade: { name: string } };
}

interface Grade {
  id: string;
  name: string;
  sections: { id: string; name: string }[];
}

interface ParentLink {
  student: {
    id: string;
    name: string;
    rollNo?: number;
    section: { name: string; grade: { name: string } };
  };
  relationship?: string;
}

interface Parent {
  id: string;
  email: string;
  isActive: boolean;
  parentLinks: ParentLink[];
}

const RELATIONSHIPS = ["Father", "Mother", "Guardian", "Other"];

export default function AdminParentsPage() {
  const confirm = useConfirm();
  const [parents, setParents] = useState<Parent[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create parent form
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    relationship: "Father",
    studentIds: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  // Link additional student
  const [linkingParentId, setLinkingParentId] = useState<string | null>(null);
  const [linkStudentId, setLinkStudentId] = useState("");
  const [linkRelationship, setLinkRelationship] = useState("Father");
  const [linkGradeId, setLinkGradeId] = useState("");
  const [linkSectionStudents, setLinkSectionStudents] = useState<Student[]>([]);

  // Student picker for create form
  const [pickerGradeId, setPickerGradeId] = useState("");
  const [pickerSectionId, setPickerSectionId] = useState("");
  const [pickerStudents, setPickerStudents] = useState<Student[]>([]);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [p, year] = await Promise.all([
        api.get<Parent[]>("/parents"),
        api.get<any>("/academic-years/active"),
      ]);
      setParents(p);
      if (year) {
        const g = await api.get<Grade[]>(`/grades?academicYearId=${year.id}`);
        setGrades(g);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  // Load students when picker grade/section changes (create form)
  useEffect(() => {
    if (!pickerSectionId) { setPickerStudents([]); return; }
    api.get<Student[]>(`/students?sectionId=${pickerSectionId}`)
      .then(setPickerStudents)
      .catch(() => setPickerStudents([]));
  }, [pickerSectionId]);

  // Load students when link section changes
  useEffect(() => {
    if (!linkGradeId) { setLinkSectionStudents([]); setLinkStudentId(""); return; }
    const grade = grades.find(g => g.id === linkGradeId);
    if (grade?.sections?.[0]) {
      api.get<Student[]>(`/students?gradeId=${linkGradeId}`)
        .then(setLinkSectionStudents)
        .catch(() => setLinkSectionStudents([]));
    }
  }, [linkGradeId]);

  const pickerGrade = grades.find(g => g.id === pickerGradeId);
  const pickerSections = pickerGrade?.sections || [];

  const toggleStudentPick = (studentId: string) => {
    setForm(f => ({
      ...f,
      studentIds: f.studentIds.includes(studentId)
        ? f.studentIds.filter(id => id !== studentId)
        : [...f.studentIds, studentId],
    }));
  };

  const handleCreate = async () => {
    if (!form.email || !form.password) { toast.error("Email and password are required"); return; }
    if (form.studentIds.length === 0) { toast.error("Select at least one student to link"); return; }
    setSaving(true);
    try {
      await api.post("/parents", {
        email: form.email,
        password: form.password,
        studentIds: form.studentIds,
        relationship: form.relationship,
      });
      toast.success("Parent account created");
      setForm({ email: "", password: "", relationship: "Father", studentIds: [] });
      setPickerGradeId(""); setPickerSectionId(""); setPickerStudents([]);
      setShowForm(false);
      fetchAll();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const handleLink = async (parentId: string) => {
    if (!linkStudentId) { toast.error("Select a student"); return; }
    setSaving(true);
    try {
      await api.post(`/parents/${parentId}/link`, {
        studentId: linkStudentId,
        relationship: linkRelationship,
      });
      toast.success("Student linked");
      setLinkingParentId(null);
      setLinkStudentId(""); setLinkGradeId(""); setLinkSectionStudents([]);
      fetchAll();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const handleUnlink = async (parentId: string, studentId: string, studentName: string) => {
    const ok = await confirm({
      title: "Unlink student",
      message: `${studentName} will be removed from this parent's account. The student record is not deleted.`,
      confirmLabel: "Unlink",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/parents/${parentId}/unlink/${studentId}`);
      toast.success("Student unlinked");
      fetchAll();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleToggleActive = async (parent: Parent) => {
    const ok = await confirm({
      title: parent.isActive ? "Deactivate parent" : "Activate parent",
      message: parent.isActive
        ? "This parent will not be able to log in."
        : "This parent will be able to log in again.",
      confirmLabel: parent.isActive ? "Deactivate" : "Activate",
      variant: parent.isActive ? "warning" : "info",
    });
    if (!ok) return;
    try {
      await api.put(`/parents/${parent.id}/toggle`, {});
      toast.success(parent.isActive ? "Parent deactivated" : "Parent activated");
      fetchAll();
    } catch (err: any) { toast.error(err.message); }
  };

  const filtered = parents.filter(p =>
    p.email.toLowerCase().includes(search.toLowerCase()) ||
    p.parentLinks.some(l => l.student.name.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Parents</h1>
          <p className="text-sm text-gray-500 mt-1">Create parent accounts and link them to their children</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); }} className="btn-primary">
          <UserPlus size={16} /> Add Parent
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-primary">New Parent Account</h3>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="label">Email *</label>
              <input className="input" type="email" placeholder="parent@example.com"
                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Password *</label>
              <div className="relative">
                <input className="input pr-10" type={showPassword ? "text" : "password"}
                  placeholder="Min 6 characters"
                  value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">Relationship</label>
              <select className="input" value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value })}>
                {RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Student picker */}
          <div className="mb-4">
            <label className="label mb-2">Link to Student(s) *</label>
            <div className="flex gap-3 mb-3">
              <select className="input flex-1" value={pickerGradeId} onChange={e => { setPickerGradeId(e.target.value); setPickerSectionId(""); setPickerStudents([]); }}>
                <option value="">Select Grade</option>
                {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <select className="input flex-1" value={pickerSectionId} onChange={e => setPickerSectionId(e.target.value)} disabled={!pickerGradeId}>
                <option value="">Select Section</option>
                {pickerSections.map((s: any) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
              </select>
            </div>

            {pickerStudents.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {pickerStudents.map(s => {
                  const selected = form.studentIds.includes(s.id);
                  return (
                    <button key={s.id} onClick={() => toggleStudentPick(s.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all text-left ${selected ? "bg-primary text-white border-primary" : "bg-white border-gray-200 text-gray-700 hover:border-primary"}`}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected ? "bg-white border-white" : "border-gray-300"}`}>
                        {selected && <div className="w-2 h-2 rounded-sm bg-primary" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate text-xs">{s.name}</p>
                        {s.rollNo && <p className={`text-[10px] ${selected ? "text-white/70" : "text-gray-400"}`}>Roll #{s.rollNo}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {form.studentIds.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {form.studentIds.map(id => {
                  const stu = pickerStudents.find(s => s.id === id);
                  if (!stu) return null;
                  return (
                    <span key={id} className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
                      {stu.name}
                      <button onClick={() => toggleStudentPick(id)} className="hover:text-red-500"><X size={12} /></button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="btn-ghost text-sm">Cancel</button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary text-sm">
              <Plus size={14} /> {saving ? "Creating..." : "Create Parent"}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-9" placeholder="Search by email or student name..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Stats row */}
      <div className="flex gap-4 mb-4 text-sm text-gray-500">
        <span>{parents.length} parent{parents.length !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{parents.reduce((sum, p) => sum + p.parentLinks.length, 0)} student links</span>
      </div>

      {/* Parents list */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          {search ? "No parents match your search." : "No parent accounts yet. Click 'Add Parent' to create one."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(parent => {
            const isExpanded = expandedId === parent.id;
            const isLinking = linkingParentId === parent.id;

            return (
              <div key={parent.id} className="card overflow-hidden">
                {/* Parent row */}
                <div className="flex items-center gap-4 px-5 py-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {parent.email[0].toUpperCase()}
                    </span>
                  </div>

                  {/* Email + children summary */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-primary truncate">{parent.email}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {parent.parentLinks.length === 0 ? (
                        <span className="text-xs text-gray-400">No children linked</span>
                      ) : parent.parentLinks.map((link, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                          {link.student.name}
                          <span className="text-blue-400 ml-1">
                            {link.student.section.grade.name}-{link.student.section.name}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Status + actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleToggleActive(parent)}
                      className={`text-xs px-2 py-0.5 rounded-full transition-all hover:opacity-80 ${parent.isActive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                      {parent.isActive ? "Active" : "Inactive"}
                    </button>
                    <button
                      onClick={() => { setLinkingParentId(isLinking ? null : parent.id); setExpandedId(parent.id); }}
                      className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600 transition-all"
                      title="Link student"
                    >
                      <Link2 size={14} />
                    </button>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : parent.id)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-all"
                      title={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Link student panel */}
                {isLinking && (
                  <div className="px-5 py-3 bg-blue-50 border-t border-blue-100">
                    <p className="text-xs font-semibold text-blue-800 mb-2">Link a student to this parent</p>
                    <div className="flex gap-2 flex-wrap items-end">
                      <div>
                        <label className="label text-xs">Grade</label>
                        <select className="input text-xs py-1.5" value={linkGradeId} onChange={e => { setLinkGradeId(e.target.value); setLinkStudentId(""); }}>
                          <option value="">Select Grade</option>
                          {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label text-xs">Student</label>
                        <select className="input text-xs py-1.5" value={linkStudentId} onChange={e => setLinkStudentId(e.target.value)} disabled={!linkGradeId}>
                          <option value="">Select Student</option>
                          {linkSectionStudents.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.section.grade.name}-{s.section.name}{s.rollNo ? ` · Roll ${s.rollNo}` : ""})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label text-xs">Relationship</label>
                        <select className="input text-xs py-1.5" value={linkRelationship} onChange={e => setLinkRelationship(e.target.value)}>
                          {RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
                        </select>
                      </div>
                      <button onClick={() => handleLink(parent.id)} disabled={saving || !linkStudentId}
                        className="btn-primary text-xs py-1.5">
                        <Link2 size={12} /> Link
                      </button>
                      <button onClick={() => { setLinkingParentId(null); setLinkGradeId(""); setLinkStudentId(""); setLinkSectionStudents([]); }}
                        className="btn-ghost text-xs py-1.5">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Expanded children detail */}
                {isExpanded && parent.parentLinks.length > 0 && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500">
                          <th className="text-left px-5 py-2">Student</th>
                          <th className="text-left px-5 py-2">Class</th>
                          <th className="text-left px-5 py-2">Relationship</th>
                          <th className="text-right px-5 py-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parent.parentLinks.map((link, i) => (
                          <tr key={i} className="border-t border-gray-100 hover:bg-surface transition-colors">
                            <td className="px-5 py-2 font-medium text-primary">{link.student.name}</td>
                            <td className="px-5 py-2 text-gray-500">
                              {link.student.section.grade.name} — Section {link.student.section.name}
                              {link.student.rollNo && <span className="text-gray-400 ml-1">· Roll #{link.student.rollNo}</span>}
                            </td>
                            <td className="px-5 py-2">
                              {link.relationship ? (
                                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{link.relationship}</span>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-5 py-2 text-right">
                              <button
                                onClick={() => handleUnlink(parent.id, link.student.id, link.student.name)}
                                className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all"
                                title="Unlink student"
                              >
                                <Unlink size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {isExpanded && parent.parentLinks.length === 0 && (
                  <div className="px-5 py-4 border-t border-gray-100 text-sm text-gray-400 text-center">
                    No children linked yet. Click the link icon to add one.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
