"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Edit2, Trash2, X, KeyRound, UserCheck, UserX } from "lucide-react";

interface Assignment {
  id: string;
  isClassTeacher: boolean;
  section: { name: string; grade: { name: string } };
  subject: { name: string } | null;
}

interface Teacher {
  id: string;
  name: string;
  nameNp?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  assignments: Assignment[];
  user?: { id: string; email: string; isActive: boolean };
}

// Groups assignments by section and returns formatted summary lines
// e.g. ["VIII-A  Class Teacher · 5 subjects", "VII-B  3 subjects"]
function buildAssignmentSummary(assignments: Assignment[]): string[] {
  if (!assignments || assignments.length === 0) return [];

  // Group by "GradeName-SectionName"
  const sectionMap = new Map<
    string,
    { label: string; isClassTeacher: boolean; subjectCount: number }
  >();

  for (const a of assignments) {
    const key = `${a.section.grade.name}-${a.section.name}`;
    const label = `${a.section.grade.name}-${a.section.name}`;
    const existing = sectionMap.get(key);

    if (existing) {
      if (a.isClassTeacher) existing.isClassTeacher = true;
      if (a.subject) existing.subjectCount++;
    } else {
      sectionMap.set(key, {
        label,
        isClassTeacher: a.isClassTeacher,
        subjectCount: a.subject ? 1 : 0,
      });
    }
  }

  return Array.from(sectionMap.values()).map((s) => {
    const parts: string[] = [];
    if (s.isClassTeacher) parts.push("Class Teacher");
    if (s.subjectCount > 0) parts.push(`${s.subjectCount} subject${s.subjectCount !== 1 ? "s" : ""}`);
    return `${s.label}  ${parts.join(" · ")}`;
  });
}

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const [form, setForm] = useState({
    name: "", nameNp: "", phone: "", email: "", password: "",
  });

  const fetchTeachers = async () => {
    try {
      const url = showInactive ? "/teachers/all" : "/teachers";
      const data = await api.get<Teacher[]>(url);
      setTeachers(data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchTeachers(); }, [showInactive]);

  const resetForm = () => {
    setForm({ name: "", nameNp: "", phone: "", email: "", password: "" });
    setShowForm(false);
    setEditingId(null);
  };

  const handleAdd = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error("Name, email, and password are required");
      return;
    }
    try {
      await api.post("/teachers", {
        name: form.name.trim(),
        nameNp: form.nameNp.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim(),
        password: form.password,
      });
      toast.success("Teacher added with login account");
      resetForm();
      fetchTeachers();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleStartEdit = (t: Teacher) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      nameNp: t.nameNp || "",
      phone: t.phone || "",
      email: t.email || t.user?.email || "",
      password: "",
    });
    setShowForm(true);
  };

  const handleUpdate = async () => {
    if (!editingId || !form.name.trim()) return;
    try {
      await api.put(`/teachers/${editingId}`, {
        name: form.name.trim(),
        nameNp: form.nameNp.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || undefined,
      });
      toast.success("Updated");
      resetForm();
      fetchTeachers();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDeactivate = async (id: string, name: string) => {
    if (!confirm(`Deactivate ${name}? They will not be able to login.`)) return;
    try {
      await api.delete(`/teachers/${id}`);
      toast.success(`${name} deactivated`);
      fetchTeachers();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleReactivate = async (id: string) => {
    try {
      await api.put(`/teachers/${id}`, { isActive: true });
      toast.success("Reactivated");
      fetchTeachers();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordId || !newPassword.trim()) return;
    try {
      await api.post(`/teachers/${resetPasswordId}/reset-password`, { newPassword: newPassword.trim() });
      toast.success("Password reset");
      setResetPasswordId(null);
      setNewPassword("");
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Teachers</h1>
          <p className="text-sm text-gray-500 mt-1">{teachers.length} teacher{teachers.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
            Show inactive
          </label>
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary text-sm">
            <Plus size={16} /> Add Teacher
          </button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="font-semibold text-primary mb-3">{editingId ? "Edit Teacher" : "Add New Teacher"}</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            </div>
            <div>
              <label className="label">Name (Nepali)</label>
              <input className="input" value={form.nameNp} onChange={(e) => setForm({ ...form, nameNp: e.target.value })} placeholder="पूरा नाम" />
            </div>
            <div>
              <label className="label">Email * (used for login)</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="teacher@school.edu.np" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98XXXXXXXX" />
            </div>
            {!editingId && (
              <div>
                <label className="label">Password * (min 6 chars)</label>
                <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Login password" />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={editingId ? handleUpdate : handleAdd} className="btn-primary text-sm">
              {editingId ? "Save Changes" : "Add Teacher"}
            </button>
            <button onClick={resetForm} className="btn-ghost text-sm"><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordId && (
        <div className="card p-5 mb-6 border-2 border-amber-300 bg-amber-50">
          <h3 className="font-semibold text-amber-800 mb-3">Reset Password</h3>
          <p className="text-sm text-amber-700 mb-3">
            Resetting password for: <b>{teachers.find((t) => t.id === resetPasswordId)?.name}</b>
          </p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="label">New Password (min 6 chars)</label>
              <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" />
            </div>
            <button onClick={handleResetPassword} className="btn-primary text-sm">Reset</button>
            <button onClick={() => { setResetPasswordId(null); setNewPassword(""); }} className="btn-ghost text-sm"><X size={14} /></button>
          </div>
        </div>
      )}

      {/* Teachers Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header">
              <th className="text-left px-5 py-3">#</th>
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-5 py-3">Login Email</th>
              <th className="text-left px-5 py-3">Phone</th>
              <th className="text-left px-5 py-3">Assignments</th>
              <th className="text-center px-5 py-3">Status</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t, i) => {
              const summary = buildAssignmentSummary(t.assignments);
              return (
                <tr key={t.id} className={`border-t border-gray-100 ${!t.isActive ? "opacity-50" : "hover:bg-surface"}`}>
                  <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-5 py-3">
                    <div>
                      <span className="font-medium text-primary">{t.name}</span>
                      {t.nameNp && <span className="text-xs text-gray-400 ml-2">{t.nameNp}</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{t.user?.email || t.email || "—"}</td>
                  <td className="px-5 py-3 text-gray-600">{t.phone || "—"}</td>
                  <td className="px-5 py-3">
                    {summary.length === 0 ? (
                      <span className="text-xs text-gray-400">No assignments</span>
                    ) : (
                      <div className="space-y-1">
                        {summary.map((line, idx) => {
                          // Split label from detail: "VIII-A  Class Teacher · 5 subjects"
                          const [sectionLabel, ...rest] = line.split("  ");
                          const detail = rest.join("  ");
                          return (
                            <div key={idx} className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                                {sectionLabel}
                              </span>
                              {detail && (
                                <span className="text-xs text-gray-500">{detail}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${t.isActive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                      {t.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleStartEdit(t)} className="p-1.5 hover:bg-surface rounded text-gray-400 hover:text-primary" title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => { setResetPasswordId(t.id); setNewPassword(""); }} className="p-1.5 hover:bg-amber-50 rounded text-gray-400 hover:text-amber-600" title="Reset Password">
                        <KeyRound size={14} />
                      </button>
                      {t.isActive ? (
                        <button onClick={() => handleDeactivate(t.id, t.name)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600" title="Deactivate">
                          <UserX size={14} />
                        </button>
                      ) : (
                        <button onClick={() => handleReactivate(t.id)} className="p-1.5 hover:bg-emerald-50 rounded text-gray-400 hover:text-emerald-600" title="Reactivate">
                          <UserCheck size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {teachers.length === 0 && <div className="p-8 text-center text-gray-400">No teachers. Add one above.</div>}
      </div>
    </div>
  );
}