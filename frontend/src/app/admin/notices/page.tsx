"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Pin, Trash2, Edit2, X, Megaphone } from "lucide-react";
import BSDatePicker from "@/components/ui/BSDatePicker";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface Grade { id: string; name: string }
interface Notice {
  id: string;
  title: string;
  content: string;
  type: string;
  priority: string;
  targetAudience: string;
  gradeId?: string;
  grade?: { id: string; name: string };
  publishDate: string;
  expiryDate?: string;
  isPublished: boolean;
  isPinned: boolean;
  createdBy: { email: string; role: string };
  createdAt: string;
}

const noticeTypes = ["GENERAL", "EXAM", "EVENT", "HOLIDAY", "FEE"];
const priorities = ["NORMAL", "IMPORTANT", "URGENT"];
const audiences = ["ALL", "TEACHERS", "STUDENTS", "PARENTS"];

const typeColors: Record<string, string> = {
  GENERAL: "bg-blue-50 text-blue-700",
  EXAM: "bg-purple-50 text-purple-700",
  EVENT: "bg-emerald-50 text-emerald-700",
  HOLIDAY: "bg-amber-50 text-amber-700",
  FEE: "bg-red-50 text-red-700",
};

const priorityColors: Record<string, string> = {
  NORMAL: "bg-gray-100 text-gray-600",
  IMPORTANT: "bg-amber-100 text-amber-700",
  URGENT: "bg-red-100 text-red-700",
};

export default function NoticeBoardPage() {
  const confirm = useConfirm();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "", content: "", type: "GENERAL", priority: "NORMAL",
    targetAudience: "ALL", gradeId: "", publishDate: "", expiryDate: "",
    isPublished: true, isPinned: false,
  });

  useEffect(() => {
    (async () => {
      try {
        const [n, year] = await Promise.all([
          api.get<Notice[]>("/notices"),
          api.get<any>("/academic-years/active"),
        ]);
        setNotices(n);
        if (year) {
          const g = await api.get<Grade[]>(`/grades?academicYearId=${year.id}`);
          setGrades(g);
        }
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  const fetchNotices = async () => {
    const data = await api.get<Notice[]>("/notices");
    setNotices(data);
  };

  const resetForm = () => {
    setForm({
      title: "", content: "", type: "GENERAL", priority: "NORMAL",
      targetAudience: "ALL", gradeId: "", publishDate: "", expiryDate: "",
      isPublished: true, isPinned: false,
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (notice: Notice) => {
    setForm({
      title: notice.title,
      content: notice.content,
      type: notice.type,
      priority: notice.priority,
      targetAudience: notice.targetAudience,
      gradeId: notice.gradeId || "",
      publishDate: notice.publishDate,
      expiryDate: notice.expiryDate || "",
      isPublished: notice.isPublished,
      isPinned: notice.isPinned,
    });
    setEditingId(notice.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.content.trim() || !form.publishDate) {
      toast.error("Title, content, and publish date are required");
      return;
    }

    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        type: form.type,
        priority: form.priority,
        targetAudience: form.targetAudience,
        gradeId: form.gradeId || undefined,
        publishDate: form.publishDate,
        expiryDate: form.expiryDate || undefined,
        isPublished: form.isPublished,
        isPinned: form.isPinned,
      };

      if (editingId) {
        await api.put(`/notices/${editingId}`, payload);
        toast.success("Notice updated");
      } else {
        await api.post("/notices", payload);
        toast.success("Notice published");
      }
      resetForm();
      await fetchNotices();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirm({ title: "Delete notice", message: "This notice will be permanently removed.", confirmLabel: "Delete", variant: "danger" })) return;
    try {
      await api.delete(`/notices/${id}`);
      toast.success("Notice deleted");
      await fetchNotices();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleTogglePin = async (notice: Notice) => {
    try {
      await api.put(`/notices/${notice.id}`, { isPinned: !notice.isPinned });
      toast.success(notice.isPinned ? "Unpinned" : "Pinned");
      await fetchNotices();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleTogglePublish = async (notice: Notice) => {
    try {
      await api.put(`/notices/${notice.id}`, { isPublished: !notice.isPublished });
      toast.success(notice.isPublished ? "Unpublished" : "Published");
      await fetchNotices();
    } catch (err: any) { toast.error(err.message); }
  };

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Notice Board</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage announcements for students, teachers, and parents</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }} className="btn-primary text-xs">
          <Plus size={14} /> New Notice
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary">{editingId ? "Edit Notice" : "New Notice"}</h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="label">Title *</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Notice title" />
            </div>
            <div>
              <label className="label">Content *</label>
              <textarea className="input min-h-[100px]" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Notice content..." />
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="label">Type</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {noticeTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
              <div>
                <label className="label">Priority</label>
                <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {priorities.map((p) => (<option key={p} value={p}>{p}</option>))}
                </select>
              </div>
              <div>
                <label className="label">Target Audience</label>
                <select className="input" value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}>
                  {audiences.map((a) => (<option key={a} value={a}>{a}</option>))}
                </select>
              </div>
              <div>
                <label className="label">Specific Grade (optional)</label>
                <select className="input" value={form.gradeId} onChange={(e) => setForm({ ...form, gradeId: e.target.value })}>
                  <option value="">All Grades</option>
                  {grades.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="label">Publish Date (BS) *</label>
                <BSDatePicker value={form.publishDate} onChange={(date) => setForm({ ...form, publishDate: date })} placeholder="2082/01/15" />
              </div>
              <div>
                <label className="label">Expiry Date (BS)</label>
                <BSDatePicker value={form.expiryDate} onChange={(date) => setForm({ ...form, expiryDate: date })} placeholder="Optional" />
              </div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.isPinned} onChange={(e) => setForm({ ...form, isPinned: e.target.checked })} className="rounded" />
                  Pin to top
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} className="rounded" />
                  Published
                </label>
              </div>
              <div className="flex items-end justify-end">
                <button onClick={handleSubmit} className="btn-primary text-sm">
                  {editingId ? "Update Notice" : "Publish Notice"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notices List */}
      <div className="space-y-3">
        {notices.map((notice) => (
          <div key={notice.id} className={`card p-4 ${notice.isPinned ? "border-l-4 border-l-primary" : ""} ${!notice.isPublished ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {notice.isPinned && <Pin size={14} className="text-primary" />}
                  <h3 className="font-semibold text-primary">{notice.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[notice.type] || "bg-gray-100 text-gray-600"}`}>
                    {notice.type}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[notice.priority] || ""}`}>
                    {notice.priority}
                  </span>
                  {!notice.isPublished && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Draft</span>
                  )}
                </div>
                <p className="text-sm text-gray-700 mb-2 whitespace-pre-wrap">{notice.content}</p>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>To: {notice.targetAudience}{notice.grade ? ` (${notice.grade.name})` : ""}</span>
                  <span>Date: {notice.publishDate}</span>
                  {notice.expiryDate && <span>Expires: {notice.expiryDate}</span>}
                  <span>By: {notice.createdBy.email}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 ml-4">
                <button onClick={() => handleTogglePin(notice)} className={`p-1.5 rounded hover:bg-surface transition-all ${notice.isPinned ? "text-primary" : "text-gray-300"}`} title={notice.isPinned ? "Unpin" : "Pin"}>
                  <Pin size={14} />
                </button>
                <button onClick={() => handleTogglePublish(notice)} className="p-1.5 rounded hover:bg-surface text-gray-400 hover:text-primary transition-all" title={notice.isPublished ? "Unpublish" : "Publish"}>
                  <Megaphone size={14} />
                </button>
                <button onClick={() => handleEdit(notice)} className="p-1.5 rounded hover:bg-surface text-gray-400 hover:text-primary transition-all">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => handleDelete(notice.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {notices.length === 0 && (
          <div className="card p-8 text-center text-gray-400">
            No notices yet. Click &quot;New Notice&quot; to create one.
          </div>
        )}
      </div>
    </div>
  );
}