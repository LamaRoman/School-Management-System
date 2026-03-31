"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { formatGradeSection } from "@/lib/bsDate";
import { useAuth } from "@/hooks/useAuth";
import toast from "react-hot-toast";
import { Plus, Save, X, Hash, UserPlus } from "lucide-react";

interface ClassTeacherSection {
  sectionId: string;
  sectionName: string;
  gradeId: string;
  gradeName: string;
  academicYearId: string;
}

interface Student {
  id: string;
  name: string;
  nameNp?: string;
  dateOfBirth?: string;
  rollNo?: number | null;
  gender?: string;
  fatherName?: string;
  motherName?: string;
  guardianName?: string;
  guardianPhone?: string;
  address?: string;
}

export default function TeacherStudentsPage() {
  const { user } = useAuth();
  const [sections, setSections] = useState<ClassTeacherSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<ClassTeacherSection | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add student form
  const [showAdd, setShowAdd] = useState(false);
  const [newStudent, setNewStudent] = useState({
    name: "", nameNp: "", dateOfBirth: "", gender: "",
    fatherName: "", motherName: "", guardianName: "", guardianPhone: "", address: "",
  });

  // Edit student
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Student>>({});

  // Roll number assignment
  const [showRolls, setShowRolls] = useState(false);
  const [rollAssignments, setRollAssignments] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<any>("/teacher-assignments/my");
        setSections(data.classTeacherSections || []);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  const handleSectionSelect = async (section: ClassTeacherSection) => {
    setSelectedSection(section);
    setShowAdd(false);
    setEditingId(null);
    setShowRolls(false);
    await fetchStudents(section.sectionId);
  };

  const fetchStudents = async (sectionId: string) => {
    try {
      const data = await api.get<Student[]>(`/students?sectionId=${sectionId}`);
      setStudents(data);
    } catch {
      setStudents([]);
    }
  };

  // Add student
  const handleAdd = async () => {
    if (!newStudent.name.trim() || !selectedSection) return;
    setSaving(true);
    try {
      await api.post("/students", {
        ...newStudent,
        name: newStudent.name.trim(),
        nameNp: newStudent.nameNp.trim() || undefined,
        dateOfBirth: newStudent.dateOfBirth || undefined,
        gender: newStudent.gender || undefined,
        fatherName: newStudent.fatherName.trim() || undefined,
        motherName: newStudent.motherName.trim() || undefined,
        guardianName: newStudent.guardianName.trim() || undefined,
        guardianPhone: newStudent.guardianPhone.trim() || undefined,
        address: newStudent.address.trim() || undefined,
        sectionId: selectedSection.sectionId,
      });
      toast.success("Student added");
      setNewStudent({ name: "", nameNp: "", dateOfBirth: "", gender: "", fatherName: "", motherName: "", guardianName: "", guardianPhone: "", address: "" });
      setShowAdd(false);
      await fetchStudents(selectedSection.sectionId);
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  // Edit student
  const handleStartEdit = (student: Student) => {
    setEditingId(student.id);
    setEditData({
      name: student.name,
      nameNp: student.nameNp || "",
      dateOfBirth: student.dateOfBirth || "",
      gender: student.gender || "",
      fatherName: student.fatherName || "",
      motherName: student.motherName || "",
      guardianName: student.guardianName || "",
      guardianPhone: student.guardianPhone || "",
      address: student.address || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !selectedSection) return;
    setSaving(true);
    try {
      await api.put(`/students/${editingId}`, {
        name: editData.name?.trim(),
        nameNp: editData.nameNp?.trim() || undefined,
        dateOfBirth: editData.dateOfBirth || undefined,
        gender: editData.gender || undefined,
        fatherName: editData.fatherName?.trim() || undefined,
        motherName: editData.motherName?.trim() || undefined,
        guardianName: editData.guardianName?.trim() || undefined,
        guardianPhone: editData.guardianPhone?.trim() || undefined,
        address: editData.address?.trim() || undefined,
      });
      toast.success("Student updated");
      setEditingId(null);
      await fetchStudents(selectedSection.sectionId);
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  // Roll number assignment
  const handleOpenRolls = () => {
    setShowRolls(true);
    setShowAdd(false);
    setEditingId(null);
    const initial: Record<string, number> = {};
    students.forEach((s, i) => {
      initial[s.id] = s.rollNo || i + 1;
    });
    setRollAssignments(initial);
  };

  const handleAutoAssign = () => {
    const sorted = [...students].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const auto: Record<string, number> = {};
    sorted.forEach((s, i) => {
      auto[s.id] = i + 1;
    });
    setRollAssignments(auto);
  };

  const handleSaveRolls = async () => {
    if (!selectedSection) return;
    const assignments = Object.entries(rollAssignments)
      .filter(([_, rollNo]) => rollNo > 0)
      .map(([studentId, rollNo]) => ({ studentId, rollNo }));

    if (assignments.length === 0) {
      toast.error("No roll numbers to assign");
      return;
    }

    setSaving(true);
    try {
      await api.post("/students/assign-rolls", {
        sectionId: selectedSection.sectionId,
        assignments,
      });
      toast.success("Roll numbers assigned");
      setShowRolls(false);
      await fetchStudents(selectedSection.sectionId);
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  if (sections.length === 0) {
    return <div className="card p-8 text-center text-gray-400">You are not assigned as a class teacher for any section.</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-display font-bold text-primary">My Students</h1>
          <p className="text-sm text-gray-500 mt-1">Add, edit, and assign roll numbers to students in your section</p>
        </div>
      </div>

      {/* Section selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {sections.map((sec) => (
          <button key={sec.sectionId} onClick={() => handleSectionSelect(sec)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedSection?.sectionId === sec.sectionId ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
            {formatGradeSection(sec.gradeName, sec.sectionName, sections)}
          </button>
        ))}
      </div>

      {selectedSection && (
        <>
          {/* Action buttons */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => { setShowAdd(!showAdd); setShowRolls(false); setEditingId(null); }}
              className={`btn-${showAdd ? "primary" : "outline"} text-xs`}>
              <UserPlus size={14} /> Add Student
            </button>
            <button onClick={handleOpenRolls}
              className={`btn-${showRolls ? "primary" : "outline"} text-xs`}>
              <Hash size={14} /> Assign Roll Numbers
            </button>
          </div>

          {/* Add student form */}
          {showAdd && (
            <div className="card p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-primary">Add New Student</h3>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Name (English) *</label>
                  <input className="input" value={newStudent.name} onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })} placeholder="Full name" />
                </div>
                <div>
                  <label className="label">Name (Nepali)</label>
                  <input className="input" value={newStudent.nameNp} onChange={(e) => setNewStudent({ ...newStudent, nameNp: e.target.value })} placeholder="पूरा नाम" />
                </div>
                <div>
                  <label className="label">Date of Birth</label>
                  <input className="input" value={newStudent.dateOfBirth} onChange={(e) => setNewStudent({ ...newStudent, dateOfBirth: e.target.value })} placeholder="2068/05/15" />
                </div>
                <div>
                  <label className="label">Gender</label>
                  <select className="input" value={newStudent.gender} onChange={(e) => setNewStudent({ ...newStudent, gender: e.target.value })}>
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="label">Father&apos;s Name</label>
                  <input className="input" value={newStudent.fatherName} onChange={(e) => setNewStudent({ ...newStudent, fatherName: e.target.value })} />
                </div>
                <div>
                  <label className="label">Mother&apos;s Name</label>
                  <input className="input" value={newStudent.motherName} onChange={(e) => setNewStudent({ ...newStudent, motherName: e.target.value })} />
                </div>
                <div>
                  <label className="label">Guardian Name</label>
                  <input className="input" value={newStudent.guardianName} onChange={(e) => setNewStudent({ ...newStudent, guardianName: e.target.value })} />
                </div>
                <div>
                  <label className="label">Guardian Phone</label>
                  <input className="input" value={newStudent.guardianPhone} onChange={(e) => setNewStudent({ ...newStudent, guardianPhone: e.target.value })} placeholder="98XXXXXXXX" />
                </div>
                <div>
                  <label className="label">Address</label>
                  <input className="input" value={newStudent.address} onChange={(e) => setNewStudent({ ...newStudent, address: e.target.value })} />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button onClick={handleAdd} disabled={saving || !newStudent.name.trim()} className="btn-primary text-xs">
                  <Plus size={14} /> {saving ? "Adding..." : "Add Student"}
                </button>
              </div>
            </div>
          )}

          {/* Roll number assignment mode */}
          {showRolls && (
            <div className="card p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-primary">Assign Roll Numbers</h3>
                <div className="flex gap-2">
                  <button onClick={handleAutoAssign} className="btn-ghost text-xs">Auto (A-Z)</button>
                  <button onClick={() => setShowRolls(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {students.map((stu) => (
                  <div key={stu.id} className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={rollAssignments[stu.id] || ""}
                      onChange={(e) => setRollAssignments({ ...rollAssignments, [stu.id]: parseInt(e.target.value) || 0 })}
                      className="w-16 text-xs px-2 py-1.5 border border-gray-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <span className="text-xs text-gray-700 truncate">{stu.name}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button onClick={handleSaveRolls} disabled={saving} className="btn-primary text-xs">
                  <Save size={14} /> {saving ? "Saving..." : "Save Roll Numbers"}
                </button>
              </div>
            </div>
          )}

          {/* Student list */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-primary">
              {formatGradeSection(selectedSection.gradeName, selectedSection.sectionName, sections)} ({students.length} students)
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="text-left px-4 py-2">Roll</th>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">DOB</th>
                  <th className="text-left px-4 py-2">Gender</th>
                  <th className="text-left px-4 py-2">Guardian</th>
                  <th className="text-left px-4 py-2">Phone</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((stu) => (
                  <tr key={stu.id} className="border-t border-gray-100 hover:bg-surface transition-colors">
                    {editingId === stu.id ? (
                      <>
                        <td className="px-4 py-2 text-gray-400">{stu.rollNo || "—"}</td>
                        <td className="px-4 py-2">
                          <input className="input text-xs py-1" value={editData.name || ""} onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
                        </td>
                        <td className="px-4 py-2">
                          <input className="input text-xs py-1" value={editData.dateOfBirth || ""} onChange={(e) => setEditData({ ...editData, dateOfBirth: e.target.value })} />
                        </td>
                        <td className="px-4 py-2">
                          <select className="input text-xs py-1" value={editData.gender || ""} onChange={(e) => setEditData({ ...editData, gender: e.target.value })}>
                            <option value="">—</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input className="input text-xs py-1" value={editData.guardianName || ""} onChange={(e) => setEditData({ ...editData, guardianName: e.target.value })} />
                        </td>
                        <td className="px-4 py-2">
                          <input className="input text-xs py-1" value={editData.guardianPhone || ""} onChange={(e) => setEditData({ ...editData, guardianPhone: e.target.value })} />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={handleSaveEdit} disabled={saving} className="btn-primary text-xs py-1 px-2">
                              <Save size={12} /> Save
                            </button>
                            <button onClick={() => setEditingId(null)} className="btn-ghost text-xs py-1 px-2">Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-gray-400">{stu.rollNo || "—"}</td>
                        <td className="px-4 py-2">
                          <span className="font-medium text-primary">{stu.name}</span>
                          {stu.nameNp && <span className="text-xs text-gray-400 ml-1">({stu.nameNp})</span>}
                        </td>
                        <td className="px-4 py-2 text-gray-500">{stu.dateOfBirth || "—"}</td>
                        <td className="px-4 py-2 text-gray-500">{stu.gender || "—"}</td>
                        <td className="px-4 py-2 text-gray-500">{stu.guardianName || "—"}</td>
                        <td className="px-4 py-2 text-gray-500">{stu.guardianPhone || "—"}</td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => handleStartEdit(stu)} className="text-xs text-primary hover:underline">Edit</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No students in this section yet. Click &quot;Add Student&quot; to start.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}