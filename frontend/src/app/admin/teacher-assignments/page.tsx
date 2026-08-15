"use client";
import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, Clock, Shield, BookOpen, X } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useGrades } from "@/hooks/useReferenceData";

interface Teacher { id: string; name: string; nameNp?: string; email?: string; phone?: string }
interface Subject { id: string; name: string }
interface Assignment {
    id: string;
    isClassTeacher: boolean;
    isTemporary: boolean;
    expiresAt?: string;
    teacher: { id: string; name: string; nameNp?: string; email?: string };
    section: { id: string; name: string; grade: { id: string; name: string } };
    subject?: { id: string; name: string } | null;
}

export default function TeacherAssignmentsPage() {
  const confirm = useConfirm();
    const { grades, loading: loadingGrades } = useGrades();
    const { data: teachersData } = useSWR<Teacher[]>("/teachers");
    const teachers = teachersData ?? [];
    const [selectedGrade, setSelectedGrade] = useState("");
    const [selectedSection, setSelectedSection] = useState("");
    const [showForm, setShowForm] = useState(false);

    const [form, setForm] = useState({
        teacherId: "",
        sectionId: "",
        subjectId: "",
        isClassTeacher: false,
        isTemporary: false,
        expiresAt: "",
    });

    const assignmentParams = selectedSection
        ? `?sectionId=${selectedSection}`
        : selectedGrade
            ? `?gradeId=${selectedGrade}`
            : "";
    const {
        data: assignmentsData,
        isLoading: loadingAssignments,
        mutate: fetchAssignments,
    } = useSWR<Assignment[]>(`/teacher-assignments${assignmentParams}`);
    const assignments = assignmentsData ?? [];
    const loading = loadingGrades || loadingAssignments;

    // A superseded subject list is not just a confusing dropdown: the form posts
    // whichever subjectId is picked from it, so a stale list is a route to a
    // cross-grade assignment — which then gates who may enter marks for what.
    // (The server refuses one since S4; this keeps it from being offered.)
    const subjectsGradeId =
        selectedGrade ||
        grades.find((g) => g.sections.some((s) => s.id === form.sectionId))?.id ||
        "";
    const { data: subjectsData } = useSWR<Subject[]>(
        subjectsGradeId ? `/subjects?gradeId=${subjectsGradeId}` : null
    );
    const subjects = subjectsData ?? [];

    const currentGrade = grades.find((g) => g.id === selectedGrade);
    const sections = currentGrade?.sections || [];

    const handleGradeChange = (gId: string) => {
        setSelectedGrade(gId);
        setSelectedSection("");
        const g = grades.find((gr) => gr.id === gId);
        if (g?.sections?.length) setSelectedSection(g.sections[0].id);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post("/teacher-assignments", {
                teacherId: form.teacherId,
                sectionId: form.sectionId || selectedSection,
                subjectId: form.isClassTeacher ? null : (form.subjectId || null),
                isClassTeacher: form.isClassTeacher,
                isTemporary: form.isTemporary,
                expiresAt: form.isTemporary && form.expiresAt ? form.expiresAt : null,
            });
            toast.success(form.isClassTeacher ? "Class teacher assigned" : "Subject teacher assigned");
            setShowForm(false);
            setForm({ teacherId: "", sectionId: "", subjectId: "", isClassTeacher: false, isTemporary: false, expiresAt: "" });
            fetchAssignments();
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const handleDelete = async (id: string, isTemp: boolean) => {
        const confirmed = await confirm({ title: isTemp ? "Revoke temporary access" : "Remove assignment", message: isTemp ? "This teacher's temporary access will be revoked." : "This teacher assignment will be removed.", confirmLabel: isTemp ? "Revoke" : "Remove", variant: "danger" });
        if (!confirmed) return;
        try {
            if (isTemp) {
                await api.post(`/teacher-assignments/${id}/revoke`, {});
            } else {
                await api.delete(`/teacher-assignments/${id}`);
            }
            toast.success("Removed");
            fetchAssignments();
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const classTeacherAssignments = assignments.filter((a) => a.isClassTeacher);
    const subjectAssignments = assignments.filter((a) => !a.isClassTeacher);

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-display font-bold text-primary">Teacher Assignments</h1>
                    <p className="text-sm text-gray-500 mt-1">Assign class teachers and subject teachers to sections</p>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="btn-primary">
                    <Plus size={16} /> Assign Teacher
                </button>
            </div>

            {/* Grade + Section selector */}
            <div className="flex flex-wrap gap-2 mb-4">
                {grades.map((g) => (
                    <button key={g.id} onClick={() => handleGradeChange(g.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedGrade === g.id ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
                        {g.name}
                    </button>
                ))}
            </div>
            {sections.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                    {sections.map((sec: any) => (
                        <button key={sec.id} onClick={() => setSelectedSection(sec.id)}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${selectedSection === sec.id ? "bg-accent text-white" : "bg-white border border-gray-200 text-gray-500 hover:border-accent"}`}>
                            Section {sec.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Assignment Form */}
            {showForm && (
                <div className="card p-5 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-primary">Assign Teacher</h3>
                        <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                    </div>
                    <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <label className="label">Teacher</label>
                            <select className="input" value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} required>
                                <option value="">Select Teacher</option>
                                {teachers.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label">Section</label>
                            <select className="input" value={form.sectionId || selectedSection} onChange={(e) => setForm({ ...form, sectionId: e.target.value })} required>
                                <option value="">Select Section</option>
                                {grades.flatMap((g) =>
                                    (g.sections || []).map((s: any) => (
                                        <option key={s.id} value={s.id}>{g.name} - Section {s.name}</option>
                                    ))
                                )}
                            </select>
                        </div>
                        <div>
                            <label className="label">Assignment Type</label>
                            <select className="input" value={form.isClassTeacher ? "class" : "subject"}
                                onChange={(e) => setForm({ ...form, isClassTeacher: e.target.value === "class", subjectId: "" })}>
                                <option value="subject">Subject Teacher</option>
                                <option value="class">Class Teacher</option>
                            </select>
                        </div>
                        {!form.isClassTeacher && (
                            <div>
                                <label className="label">Subject</label>
                                <select className="input" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} required={!form.isClassTeacher}>
                                    <option value="">Select Subject</option>
                                    {subjects.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div>
                            <label className="flex items-center gap-2 text-sm cursor-pointer mt-6">
                                <input type="checkbox" checked={form.isTemporary} onChange={(e) => setForm({ ...form, isTemporary: e.target.checked })} className="rounded" />
                                Temporary / Relief
                            </label>
                        </div>
                        {form.isTemporary && (
                            <div>
                                <label className="label">Expires On</label>
                                <input type="date" className="input" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
                            </div>
                        )}
                        <div className="col-span-full flex justify-end">
                            <button type="submit" className="btn-primary">Assign</button>
                        </div>
                    </form>
                </div>
            )}

            {loading ? (
                <div className="card p-8 text-center text-gray-400">Loading...</div>
            ) : (
                <>
                    {/* Class Teachers */}
                    <div className="mb-6">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Shield size={14} /> Class Teachers
                        </h3>
                        {classTeacherAssignments.length === 0 ? (
                            <div className="card p-5 text-center text-sm text-gray-400">No class teachers assigned{selectedSection ? " for this section" : ""}</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {classTeacherAssignments.map((a) => (
                                    <div key={a.id} className={`card p-4 ${a.isTemporary ? "border-amber-300 bg-amber-50/30" : ""}`}>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-semibold text-primary">{a.teacher.name}</p>
                                                {a.teacher.email && <p className="text-xs text-gray-400">{a.teacher.email}</p>}
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Class Teacher — {a.section.grade.name}, Section {a.section.name}
                                                </p>
                                                {a.isTemporary && (
                                                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full mt-1">
                                                        <Clock size={10} /> Temporary{a.expiresAt ? ` · Until ${new Date(a.expiresAt).toLocaleDateString()}` : ""}
                                                    </span>
                                                )}
                                            </div>
                                            <button onClick={() => handleDelete(a.id, a.isTemporary)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Subject Teachers */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <BookOpen size={14} /> Subject Teachers
                        </h3>
                        {subjectAssignments.length === 0 ? (
                            <div className="card p-5 text-center text-sm text-gray-400">No subject teachers assigned{selectedSection ? " for this section" : ""}</div>
                        ) : (
                            <div className="card overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="table-header">
                                            <th className="text-left px-5 py-3">Teacher</th>
                                            <th className="text-left px-5 py-3">Grade & Section</th>
                                            <th className="text-left px-5 py-3">Subject</th>
                                            <th className="text-center px-5 py-3">Status</th>
                                            <th className="text-right px-5 py-3">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {subjectAssignments.map((a) => (
                                            <tr key={a.id} className={`border-t border-gray-100 hover:bg-surface transition-colors ${a.isTemporary ? "bg-amber-50/30" : ""}`}>
                                                <td className="px-5 py-3">
                                                    <p className="font-medium text-primary">{a.teacher.name}</p>
                                                    {a.teacher.email && <p className="text-xs text-gray-400">{a.teacher.email}</p>}
                                                </td>
                                                <td className="px-5 py-3 text-gray-600">{a.section.grade.name} - {a.section.name}</td>
                                                <td className="px-5 py-3 font-medium">{a.subject?.name || "—"}</td>
                                                <td className="px-5 py-3 text-center">
                                                    {a.isTemporary ? (
                                                        <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                                            <Clock size={10} /> Temp{a.expiresAt ? ` · ${new Date(a.expiresAt).toLocaleDateString()}` : ""}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Permanent</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3 text-right">
                                                    <button onClick={() => handleDelete(a.id, a.isTemporary)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}