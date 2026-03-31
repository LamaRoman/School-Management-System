"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { GraduationCap, Calendar, Receipt, Megaphone, Pin } from "lucide-react";

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
  const [tab, setTab] = useState<"report" | "attendance" | "fees" | "notices">("report");
  const [notices, setNotices] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<Child[]>("/parents/my-children");
        setChildren(data);
        if (data.length > 0) {
          setSelectedChild(data[0]);
        }
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (selectedChild) {
      loadChildData(selectedChild.id);
    }
  }, [selectedChild]);

  const loadChildData = async (studentId: string) => {
    try {
      const [feeData, attData, year, noticeData] = await Promise.all([
        api.get<FeeData>(`/parents/child/${studentId}/fees`),
        api.get<AttendanceData>(`/parents/child/${studentId}/attendance`),
        api.get<any>("/academic-years/active"),
        api.get<any[]>("/notices").catch(() => []),
      ]);
      setFees(feeData);
      setAttendance(attData);
      setNotices(Array.isArray(noticeData) ? noticeData : []);

      if (year) {
        const et = await api.get<ExamType[]>(`/exam-types?academicYearId=${year.id}`);
        setExamTypes(et);
      }
    } catch (err) { console.error(err); }
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
                { key: "notices", label: "Notices", icon: Megaphone },
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
                {attendance ? (() => {
                  const rate = attendance.totalDays > 0
                    ? Math.round((attendance.presentDays / attendance.totalDays) * 100)
                    : 0;
                  const color = rate >= 90 ? "#16a34a" : rate >= 75 ? "#d97706" : "#dc2626";
                  const circumference = 2 * Math.PI * 40;
                  const dash = (rate / 100) * circumference;
                  return (
                    <div className="card p-6">
                      {/* Ring + stats */}
                      <div className="flex items-center gap-8">
                        {/* SVG ring */}
                        <div className="shrink-0">
                          <svg width="100" height="100" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#f3f4f6" strokeWidth="10" />
                            <circle
                              cx="50" cy="50" r="40" fill="none"
                              stroke={color} strokeWidth="10"
                              strokeLinecap="round"
                              strokeDasharray={`${dash} ${circumference}`}
                              transform="rotate(-90 50 50)"
                              style={{ transition: "stroke-dasharray 0.6s ease" }}
                            />
                            <text x="50" y="46" textAnchor="middle" fontSize="18" fontWeight="700" fill={color}>{rate}%</text>
                            <text x="50" y="60" textAnchor="middle" fontSize="9" fill="#9ca3af">attendance</text>
                          </svg>
                        </div>
                        {/* Stats */}
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Total working days</span>
                            <span className="text-sm font-bold text-gray-800">{attendance.totalDays}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Present</span>
                            <span className="text-sm font-bold text-emerald-600">{attendance.presentDays} days</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Absent</span>
                            <span className="text-sm font-bold text-red-500">{attendance.absentDays} days</span>
                          </div>
                          <div className="pt-2 border-t border-gray-100">
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${rate}%`, backgroundColor: color }} />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                              {rate >= 90 ? "Excellent attendance" : rate >= 75 ? "Satisfactory attendance" : "Attendance needs improvement"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <div className="card p-8 text-center text-gray-400">No attendance data available.</div>
                )}
              </div>
            )}

            {/* Notices Tab */}
            {tab === "notices" && (
              <div className="space-y-3">
                {notices.length === 0 ? (
                  <div className="card p-8 text-center text-gray-400">No notices at this time.</div>
                ) : notices.map((notice: any) => (
                  <div key={notice.id} className={`card p-4 ${notice.priority === "URGENT" ? "border-l-4 border-l-red-500" : notice.priority === "IMPORTANT" ? "border-l-4 border-l-amber-400" : ""}`}>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {notice.isPinned && <Pin size={14} className="text-primary" />}
                      <h3 className="font-semibold text-primary text-sm">{notice.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        notice.type === "EXAM" ? "bg-purple-50 text-purple-700" :
                        notice.type === "EVENT" ? "bg-emerald-50 text-emerald-700" :
                        notice.type === "HOLIDAY" ? "bg-amber-50 text-amber-700" :
                        notice.type === "FEE" ? "bg-red-50 text-red-700" :
                        "bg-blue-50 text-blue-700"
                      }`}>{notice.type}</span>
                      {notice.priority === "URGENT" && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">URGENT</span>}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">{notice.content}</p>
                    <p className="text-xs text-gray-400">{notice.publishDate}</p>
                  </div>
                ))}
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