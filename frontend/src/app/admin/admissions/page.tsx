"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Check, X, UserPlus, Trash2 } from "lucide-react";
import BSDatePicker from "@/components/ui/BSDatePicker";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface Grade { id: string; name: string; sections?: { id: string; name: string }[] }
interface Admission {
  id: string;
  studentName: string;
  studentNameNp?: string;
  dateOfBirth?: string;
  gender?: string;
  fatherName?: string;
  motherName?: string;
  guardianName?: string;
  guardianPhone?: string;
  address?: string;
  previousSchool?: string;
  status: string;
  remarks?: string;
  appliedDate: string;
  reviewedDate?: string;
  applyingForGrade: { id: string; name: string };
  academicYear: { yearBS: string };
  reviewedBy?: { email: string };
}

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-blue-50 text-blue-700",
  REJECTED: "bg-red-50 text-red-600",
  ENROLLED: "bg-emerald-50 text-emerald-700",
};

export default function AdmissionPage() {
  const confirm = useConfirm();
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [activeYear, setActiveYear] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [enrollSectionId, setEnrollSectionId] = useState("");
  const [enrollGradeId, setEnrollGradeId] = useState("");

  const [form, setForm] = useState({
    studentName: "", studentNameNp: "", dateOfBirth: "", gender: "",
    fatherName: "", motherName: "", guardianName: "", guardianPhone: "",
    address: "", previousSchool: "", applyingForGradeId: "", appliedDate: "", remarks: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const year = await api.get<any>("/academic-years/active");
        setActiveYear(year);
        if (year) {
          const g = await api.get<Grade[]>(`/grades?academicYearId=${year.id}`);
          setGrades(g);
          await fetchAdmissions(year.id, "");
        }
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  const fetchAdmissions = async (yearId: string, status: string) => {
    try {
      let url = `/admissions?academicYearId=${yearId}`;
      if (status) url += `&status=${status}`;
      const data = await api.get<Admission[]>(url);
      setAdmissions(data);
    } catch { setAdmissions([]); }
  };

  const handleFilterChange = (status: string) => {
    setFilterStatus(status);
    if (activeYear) fetchAdmissions(activeYear.id, status);
  };

  const resetForm = () => {
    setForm({
      studentName: "", studentNameNp: "", dateOfBirth: "", gender: "",
      fatherName: "", motherName: "", guardianName: "", guardianPhone: "",
      address: "", previousSchool: "", applyingForGradeId: "", appliedDate: "", remarks: "",
    });
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!form.studentName.trim() || !form.applyingForGradeId || !form.appliedDate || !activeYear) {
      toast.error("Student name, grade, and applied date are required");
      return;
    }
    try {
      await api.post("/admissions", {
        studentName: form.studentName.trim(),
        studentNameNp: form.studentNameNp.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        fatherName: form.fatherName.trim() || undefined,
        motherName: form.motherName.trim() || undefined,
        guardianName: form.guardianName.trim() || undefined,
        guardianPhone: form.guardianPhone.trim() || undefined,
        address: form.address.trim() || undefined,
        previousSchool: form.previousSchool.trim() || undefined,
        applyingForGradeId: form.applyingForGradeId,
        academicYearId: activeYear.id,
        appliedDate: form.appliedDate,
        remarks: form.remarks.trim() || undefined,
      });
      toast.success("Admission application created");
      resetForm();
      await fetchAdmissions(activeYear.id, filterStatus);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.post(`/admissions/${id}/approve`, {
        reviewedDate: new Date().toISOString().split("T")[0],
      });
      toast.success("Admission approved");
      if (activeYear) await fetchAdmissions(activeYear.id, filterStatus);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleReject = async (id: string) => {
    const remarks = prompt("Reason for rejection (optional):");
    try {
      await api.post(`/admissions/${id}/reject`, {
        reviewedDate: new Date().toISOString().split("T")[0],
        remarks: remarks || undefined,
      });
      toast.success("Admission rejected");
      if (activeYear) await fetchAdmissions(activeYear.id, filterStatus);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleStartEnroll = (admission: Admission) => {
    setEnrollingId(admission.id);
    setEnrollGradeId(admission.applyingForGrade.id);
    setEnrollSectionId("");
    // Fetch sections for the grade
    const grade = grades.find((g) => g.id === admission.applyingForGrade.id);
    if (!grade?.sections) {
      // Fetch fresh grade data with sections
      api.get<Grade[]>(`/grades?academicYearId=${activeYear?.id}`).then((g) => setGrades(g));
    }
  };

  const handleEnroll = async () => {
    if (!enrollingId || !enrollSectionId) {
      toast.error("Select a section");
      return;
    }
    try {
      const result = await api.post<any>(`/admissions/${enrollingId}/enroll`, {
        sectionId: enrollSectionId,
      });
      toast.success(result.message);
      setEnrollingId(null);
      setEnrollSectionId("");
      if (activeYear) await fetchAdmissions(activeYear.id, filterStatus);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (id: string) => {
    if (!await confirm({ title: "Delete application", message: "This admission application will be permanently deleted.", confirmLabel: "Delete", variant: "danger" })) return;
    try {
      await api.delete(`/admissions/${id}`);
      toast.success("Deleted");
      if (activeYear) await fetchAdmissions(activeYear.id, filterStatus);
    } catch (err: any) { toast.error(err.message); }
  };

  const enrollGradeSections = grades.find((g) => g.id === enrollGradeId)?.sections || [];
  const counts = {
    all: admissions.length,
    pending: admissions.filter((a) => a.status === "PENDING").length,
    approved: admissions.filter((a) => a.status === "APPROVED").length,
    enrolled: admissions.filter((a) => a.status === "ENROLLED").length,
    rejected: admissions.filter((a) => a.status === "REJECTED").length,
  };

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Admissions</h1>
          <p className="text-sm text-gray-500 mt-1">Manage new student admission applications</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs">
          <Plus size={14} /> New Application
        </button>
      </div>

      {/* Application Form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary">New Admission Application</h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Student Name (English) *</label>
              <input className="input" value={form.studentName} onChange={(e) => setForm({ ...form, studentName: e.target.value })} />
            </div>
            <div>
              <label className="label">Student Name (Nepali)</label>
              <input className="input" value={form.studentNameNp} onChange={(e) => setForm({ ...form, studentNameNp: e.target.value })} />
            </div>
            <div>
              <label className="label">Date of Birth</label>
              <BSDatePicker value={form.dateOfBirth} onChange={(date) => setForm({ ...form, dateOfBirth: date })} placeholder="2068/05/15" />
            </div>
            <div>
              <label className="label">Gender</label>
              <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Father&apos;s Name</label>
              <input className="input" value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} />
            </div>
            <div>
              <label className="label">Mother&apos;s Name</label>
              <input className="input" value={form.motherName} onChange={(e) => setForm({ ...form, motherName: e.target.value })} />
            </div>
            <div>
              <label className="label">Guardian Name</label>
              <input className="input" value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
            </div>
            <div>
              <label className="label">Guardian Phone</label>
              <input className="input" value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className="label">Previous School</label>
              <input className="input" value={form.previousSchool} onChange={(e) => setForm({ ...form, previousSchool: e.target.value })} />
            </div>
            <div>
              <label className="label">Applying for Grade *</label>
              <select className="input" value={form.applyingForGradeId} onChange={(e) => setForm({ ...form, applyingForGradeId: e.target.value })}>
                <option value="">Select Grade</option>
                {grades.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
              </select>
            </div>
            <div>
              <label className="label">Applied Date (BS) *</label>
              <BSDatePicker value={form.appliedDate} onChange={(date) => setForm({ ...form, appliedDate: date })} placeholder="2082/01/05" />
            </div>
          </div>
          <div className="mt-3">
            <label className="label">Remarks</label>
            <textarea className="input" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Optional notes" />
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={handleSubmit} className="btn-primary text-sm">Submit Application</button>
          </div>
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-2 mb-4">
        {[
          { key: "", label: `All (${counts.all})` },
          { key: "PENDING", label: `Pending (${counts.pending})` },
          { key: "APPROVED", label: `Approved (${counts.approved})` },
          { key: "ENROLLED", label: `Enrolled (${counts.enrolled})` },
          { key: "REJECTED", label: `Rejected (${counts.rejected})` },
        ].map((f) => (
          <button key={f.key} onClick={() => handleFilterChange(f.key)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${filterStatus === f.key ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Enroll modal */}
      {enrollingId && (
        <div className="card p-4 mb-4 border-2 border-primary">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-primary">Enroll Student — Select Section</h3>
            <button onClick={() => setEnrollingId(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="label">Section</label>
              <select className="input" value={enrollSectionId} onChange={(e) => setEnrollSectionId(e.target.value)}>
                <option value="">Select Section</option>
                {enrollGradeSections.map((s: any) => (
                  <option key={s.id} value={s.id}>Section {s.name}</option>
                ))}
              </select>
            </div>
            <button onClick={handleEnroll} disabled={!enrollSectionId} className="btn-primary text-xs">
              <UserPlus size={14} /> Enroll
            </button>
          </div>
        </div>
      )}

      {/* Admissions list */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header">
              <th className="text-left px-4 py-2">Student Name</th>
              <th className="text-left px-4 py-2">Grade</th>
              <th className="text-left px-4 py-2">Guardian</th>
              <th className="text-left px-4 py-2">Phone</th>
              <th className="text-left px-4 py-2">Applied</th>
              <th className="text-center px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admissions.map((adm) => (
              <tr key={adm.id} className="border-t border-gray-100 hover:bg-surface transition-colors">
                <td className="px-4 py-2">
                  <span className="font-medium text-primary">{adm.studentName}</span>
                  {adm.studentNameNp && <span className="text-xs text-gray-400 ml-1">({adm.studentNameNp})</span>}
                </td>
                <td className="px-4 py-2">{adm.applyingForGrade.name}</td>
                <td className="px-4 py-2 text-gray-500">{adm.guardianName || adm.fatherName || "—"}</td>
                <td className="px-4 py-2 text-gray-500">{adm.guardianPhone || "—"}</td>
                <td className="px-4 py-2 text-gray-500">{adm.appliedDate}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[adm.status] || ""}`}>
                    {adm.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    {adm.status === "PENDING" && (
                      <>
                        <button onClick={() => handleApprove(adm.id)} className="p-1.5 rounded hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-all" title="Approve">
                          <Check size={14} />
                        </button>
                        <button onClick={() => handleReject(adm.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all" title="Reject">
                          <X size={14} />
                        </button>
                      </>
                    )}
                    {adm.status === "APPROVED" && (
                      <button onClick={() => handleStartEnroll(adm)} className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-all" title="Enroll">
                        <UserPlus size={14} />
                      </button>
                    )}
                    {adm.status !== "ENROLLED" && (
                      <button onClick={() => handleDelete(adm.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {admissions.length === 0 && (
          <div className="p-8 text-center text-gray-400 text-sm">No admission applications found.</div>
        )}
      </div>
    </div>
  );
}