"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import toast from "react-hot-toast";
import { Plus, Trash2, Edit2, X, Save } from "lucide-react";

interface Assignment {
  sectionId: string;
  sectionName: string;
  gradeId: string;
  gradeName: string;
  academicYearId: string;
  subjectId: string;
  subjectName: string;
}

interface Homework {
  id: string;
  title: string;
  description?: string;
  assignedDate: string;
  dueDate?: string;
  subject: { id: string; name: string };
  section: { name: string; grade: { name: string } };
}

export default function TeacherHomeworkPage() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "", description: "", sectionId: "", subjectId: "",
    academicYearId: "", assignedDate: "", dueDate: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<any>("/teacher-assignments/my");
        setAssignments(data.subjectAssignments || []);
        const hw = await api.get<Homework[]>("/homework");
        setHomework(hw);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const fetchHomework = async () => {
    const hw = await api.get<Homework[]>("/homework");
    setHomework(hw);
  };

  const resetForm = () => {
    setForm({ title: "", description: "", sectionId: "", subjectId: "", academicYearId: "", assignedDate: "", dueDate: "" });
    setEditingId(null);
    setShowForm(false);
  };

  const handleAssignmentSelect = (assignmentKey: string) => {
    const a = assignments.find((a) => `${a.sectionId}-${a.subjectId}` === assignmentKey);
    if (a) {
      setForm({
        ...form,
        sectionId: a.sectionId,
        subjectId: a.subjectId,
        academicYearId: a.academicYearId,
      });
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.sectionId || !form.subjectId || !form.assignedDate) {
      toast.error("Title, class/subject, and assigned date are required");
      return;
    }

    try {
      if (editingId) {
        await api.put(`/homework/${editingId}`, {
          title: form.title.trim(),
          description: form.description.trim() || null,
          assignedDate: form.assignedDate,
          dueDate: form.dueDate || null,
        });
        toast.success("Homework updated");
      } else {
        await api.post("/homework", {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          subjectId: form.subjectId,
          sectionId: form.sectionId,
          academicYearId: form.academicYearId,
          assignedDate: form.assignedDate,
          dueDate: form.dueDate || undefined,
        });
        toast.success("Homework assigned");
      }
      resetForm();
      await fetchHomework();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleEdit = (hw: Homework) => {
    setForm({
      title: hw.title,
      description: hw.description || "",
      sectionId: "",
      subjectId: "",
      academicYearId: "",
      assignedDate: hw.assignedDate,
      dueDate: hw.dueDate || "",
    });
    setEditingId(hw.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this homework?")) return;
    try {
      await api.delete(`/homework/${id}`);
      toast.success("Homework removed");
      await fetchHomework();
    } catch (err: any) { toast.error(err.message); }
  };

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-display font-bold text-primary">Homework</h1>
          <p className="text-sm text-gray-500 mt-1">Assign and manage homework for your classes</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }} className="btn-primary text-xs">
          <Plus size={14} /> Assign Homework
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary">{editingId ? "Edit Homework" : "Assign Homework"}</h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>

          <div className="space-y-3">
            {!editingId && (
              <div>
                <label className="label">Class / Subject *</label>
                <select className="input" onChange={(e) => handleAssignmentSelect(e.target.value)}>
                  <option value="">Select class and subject</option>
                  {assignments.map((a) => (
                    <option key={`${a.sectionId}-${a.subjectId}`} value={`${a.sectionId}-${a.subjectId}`}>
                      {a.gradeName} Section {a.sectionName} — {a.subjectName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="label">Title *</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Chapter 5 Exercise 3" />
            </div>

            <div>
              <label className="label">Description / Instructions</label>
              <textarea className="input min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detailed instructions for students..." />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Assigned Date (BS) *</label>
                <input className="input" value={form.assignedDate} onChange={(e) => setForm({ ...form, assignedDate: e.target.value })} placeholder="2082/01/15" />
              </div>
              <div>
                <label className="label">Due Date (BS)</label>
                <input className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} placeholder="2082/01/20" />
              </div>
              <div className="flex items-end">
                <button onClick={handleSubmit} className="btn-primary text-sm w-full">
                  <Save size={16} /> {editingId ? "Update" : "Assign"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Homework List */}
      {homework.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          No homework assigned yet. Click &quot;Assign Homework&quot; to create one.
        </div>
      ) : (
        <div className="space-y-3">
          {homework.map((hw) => (
            <div key={hw.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-primary">{hw.title}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{hw.subject.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {hw.section.grade.name} — {hw.section.name}
                    </span>
                  </div>
                  {hw.description && (
                    <p className="text-sm text-gray-600 mb-2 whitespace-pre-wrap">{hw.description}</p>
                  )}
                  <div className="flex gap-4 text-xs text-gray-400">
                    <span>Assigned: {hw.assignedDate}</span>
                    {hw.dueDate && <span className="text-red-500 font-medium">Due: {hw.dueDate}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <button onClick={() => handleEdit(hw)} className="p-1.5 rounded hover:bg-surface text-gray-400 hover:text-primary transition-all">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(hw.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}