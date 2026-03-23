"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { GraduationCap, Calendar, Receipt } from "lucide-react";

interface Child {
  id: string;
  name: string;
  rollNo?: number;
  className: string;
  section: string;
  relationship?: string;
}

interface FeeData {
  student: { name: string; className: string; section: string };
  payments: { category: string; amount: number; paidMonth?: string; paymentDate: string; receiptNumber?: string }[];
  totalPaid: number;
}

interface AttendanceData {
  totalDays: number;
  presentDays: number;
  absentDays: number;
}

interface ExamType { id: string; name: string }

export default function ParentDashboard() {
  const { user } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [fees, setFees] = useState<FeeData | null>(null);
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [reportData, setReportData] = useState<any>(null);
  const [selectedExam, setSelectedExam] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"report" | "attendance" | "fees">("report");

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<Child[]>("/parents/my-children");
        setChildren(data);
        if (data.length > 0) {
          setSelectedChild(data[0]);
        }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (selectedChild) {
      loadChildData(selectedChild.id);
    }
  }, [selectedChild]);

  const loadChildData = async (studentId: string) => {
    try {
      const [feeData, attData, year] = await Promise.all([
        api.get<FeeData>(`/parents/child/${studentId}/fees`),
        api.get<AttendanceData>(`/parents/child/${studentId}/attendance`),
        api.get<any>("/academic-years/active"),
      ]);
      setFees(feeData);
      setAttendance(attData);

      if (year) {
        const et = await api.get<ExamType[]>(`/exam-types?academicYearId=${year.id}`);
        setExamTypes(et);
      }
    } catch {}
  };

  const loadReport = async (examTypeId: string) => {
    if (!selectedChild) return;
    setSelectedExam(examTypeId);
    try {
      const et = examTypes.find((e) => e.id === examTypeId);
      if (et?.name === "Final") {
        const year = await api.get<any>("/academic-years/active");
        const data = await api.get(`/reports/final/${selectedChild.id}/${year.id}`);
        setReportData(data);
      } else {
        const data = await api.get(`/reports/term/${selectedChild.id}/${examTypeId}`);
        setReportData(data);
      }
    } catch {
      setReportData(null);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-primary">Loading...</div></div>;

  if (children.length === 0) {
    return (
      <div className="min-h-screen bg-surface p-6">
        <div className="max-w-3xl mx-auto card p-8 text-center text-gray-400">
          No children linked to your account. Please contact the school administration.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="max-w-4xl mx-auto">
        {/* Child selector */}
        {children.length > 1 && (
          <div className="flex gap-2 mb-6">
            {children.map((child) => (
              <button key={child.id} onClick={() => setSelectedChild(child)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedChild?.id === child.id ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
                {child.name}
                <span className="text-xs ml-1 opacity-60">({child.className} — {child.section})</span>
              </button>
            ))}
          </div>
        )}

        {selectedChild && (
          <>
            {/* Child info card */}
            <div className="card p-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <GraduationCap size={24} className="text-primary" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-primary text-lg">{selectedChild.name}</h2>
                  <p className="text-sm text-gray-500">
                    {selectedChild.className} — Section {selectedChild.section}
                    {selectedChild.rollNo && ` • Roll #${selectedChild.rollNo}`}
                  </p>
                </div>
                {attendance && (
                  <div className="ml-auto text-right">
                    <p className="text-xs text-gray-500">Attendance</p>
                    <p className="text-sm font-semibold text-primary">
                      {attendance.presentDays}/{attendance.totalDays} days
                      <span className="text-xs text-gray-400 ml-1">({attendance.totalDays > 0 ? Math.round((attendance.presentDays / attendance.totalDays) * 100) : 0}%)</span>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b">
              {([
                { key: "report", label: "Report Card", icon: GraduationCap },
                { key: "attendance", label: "Attendance", icon: Calendar },
                { key: "fees", label: "Fee Status", icon: Receipt },
              ] as { key: typeof tab; label: string; icon: any }[]).map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all border-b-2 ${tab === t.key ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-primary"}`}>
                  <t.icon size={16} />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Report Card Tab */}
            {tab === "report" && (
              <div>
                <div className="flex gap-2 mb-4">
                  {examTypes.map((et) => (
                    <button key={et.id} onClick={() => loadReport(et.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedExam === et.id ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
                      {et.name}
                    </button>
                  ))}
                </div>

                {reportData ? (
                  <div className="card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="table-header">
                          <th className="text-left px-4 py-2">Subject</th>
                          <th className="text-center px-4 py-2">Full Marks</th>
                          <th className="text-center px-4 py-2">Obtained</th>
                          <th className="text-center px-4 py-2">Grade</th>
                          <th className="text-center px-4 py-2">GPA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.subjects?.map((s: any, i: number) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-4 py-2 font-medium text-primary">{s.subjectName}</td>
                            <td className="px-4 py-2 text-center">{s.fullMarks}</td>
                            <td className="px-4 py-2 text-center font-semibold">{s.totalMarks || s.weightedPercentage}</td>
                            <td className="px-4 py-2 text-center font-bold text-primary">{s.grade}</td>
                            <td className="px-4 py-2 text-center">{s.gpa}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-primary bg-gray-50">
                          <td colSpan={3} className="px-4 py-2 text-right font-bold">Overall</td>
                          <td className="px-4 py-2 text-center font-bold text-primary">{reportData.overallGrade}</td>
                          <td className="px-4 py-2 text-center font-bold">{reportData.overallGpa}</td>
                        </tr>
                      </tfoot>
                    </table>
                    <div className="p-4 text-sm text-gray-600">
                      <span className="font-semibold text-primary">Percentage: </span>{reportData.overallPercentage}%
                      {reportData.rank && (
                        <span className="ml-4"><span className="font-semibold text-primary">Rank: </span>{reportData.rank} of {reportData.totalStudents}</span>
                      )}
                    </div>
                  </div>
                ) : selectedExam ? (
                  <div className="card p-8 text-center text-gray-400">No report data available.</div>
                ) : (
                  <div className="card p-8 text-center text-gray-400">Select an exam to view results.</div>
                )}
              </div>
            )}

            {/* Attendance Tab */}
            {tab === "attendance" && (
              <div>
                {attendance ? (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="card p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{attendance.totalDays}</p>
                      <p className="text-xs text-gray-500">Total Working Days</p>
                    </div>
                    <div className="card p-4 text-center">
                      <p className="text-2xl font-bold text-emerald-600">{attendance.presentDays}</p>
                      <p className="text-xs text-gray-500">Present Days</p>
                    </div>
                    <div className="card p-4 text-center">
                      <p className="text-2xl font-bold text-red-600">{attendance.absentDays}</p>
                      <p className="text-xs text-gray-500">Absent Days</p>
                    </div>
                  </div>
                ) : (
                  <div className="card p-8 text-center text-gray-400">No attendance data available.</div>
                )}
              </div>
            )}

            {/* Fees Tab */}
            {tab === "fees" && (
              <div>
                {fees && fees.payments.length > 0 ? (
                  <>
                    <div className="card p-3 mb-4 text-center">
                      <p className="text-xs text-gray-500">Total Paid This Year</p>
                      <p className="text-xl font-bold text-emerald-600">Rs {fees.totalPaid.toLocaleString()}</p>
                    </div>
                    <div className="card overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="table-header">
                            <th className="text-left px-4 py-2">Category</th>
                            <th className="text-left px-4 py-2">Month</th>
                            <th className="text-right px-4 py-2">Amount</th>
                            <th className="text-left px-4 py-2">Date</th>
                            <th className="text-left px-4 py-2">Receipt</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fees.payments.map((p, i) => (
                            <tr key={i} className="border-t border-gray-100">
                              <td className="px-4 py-2 font-medium">{p.category}</td>
                              <td className="px-4 py-2 text-gray-500">{p.paidMonth || "—"}</td>
                              <td className="px-4 py-2 text-right">Rs {p.amount.toLocaleString()}</td>
                              <td className="px-4 py-2 text-gray-500">{p.paymentDate}</td>
                              <td className="px-4 py-2 text-gray-400">{p.receiptNumber || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="card p-8 text-center text-gray-400">No fee payments recorded yet.</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}