"use client";
import { useEffect, useState, Fragment } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { BS_MONTH_NAMES, formatBSDateLong } from "@/lib/bsDate";
import {
  ArrowLeft, User, CalendarCheck, GraduationCap, Receipt, Eye, Phone, MapPin, ChevronDown, ChevronRight,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────
interface Subject { id: string; name: string; fullTheoryMarks: number; fullPracticalMarks: number; passMarks: number; displayOrder: number }
interface ExamTypeRef { id: string; name: string; isFinal: boolean; displayOrder: number }
interface Mark { theoryMarks: number | null; practicalMarks: number | null; isAbsent: boolean; academicYearId: string; subject: Subject; examType: ExamTypeRef }
interface AttendanceRow { academicYearId: string; totalDays: number; presentDays: number; absentDays: number }
interface ResultRow { academicYearId: string; totalGpa: number | null; totalPercentage: number | null; rank: number | null; promoted: boolean; promotedTo: string | null; remarks: string | null }
interface StudentDetail {
  id: string; name: string; nameNp?: string; dateOfBirth?: string; rollNo?: number; symbolNumber?: string;
  gender?: string; fatherName?: string; motherName?: string; guardianName?: string; guardianPhone?: string;
  address?: string; photo?: string; status: string; isActive: boolean;
  section: { name: string; grade: { name: string } };
  marks: Mark[]; attendances: AttendanceRow[]; results: ResultRow[];
}
interface ExamType { id: string; name: string; isFinal: boolean; displayOrder: number }
interface LedgerMonth { month: string; totalDue: number; totalPaid: number; status: string }
interface FixedFee { categoryName: string; frequency: string; amount: number; paid: number; status: string }
interface Payment { id: string; category: string; amount: number; paidMonth: string | null; paymentDate: string; receiptNumber: string | null; paymentMethod: string | null }
interface Ledger { monthGrid: LedgerMonth[]; fixedFees: FixedFee[]; recentPayments: Payment[] }
interface Observation { categoryName: string; categoryNameNp?: string; grade: string }
interface MonthAttendance { month: number; present: number; absent: number; total: number; absentDates: string[] }

// ─── Helpers ────────────────────────────────────────────
function markValue(m: Mark | undefined): string {
  if (!m) return "—";
  if (m.isAbsent) return "Ab";
  const total = (m.theoryMarks ?? 0) + (m.practicalMarks ?? 0);
  return String(total);
}
function isFail(m: Mark | undefined): boolean {
  if (!m || m.isAbsent) return false;
  const total = (m.theoryMarks ?? 0) + (m.practicalMarks ?? 0);
  return total < m.subject.passMarks;
}

export default function StudentProfilePage() {
  const params = useParams();
  const studentId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [yearBS, setYearBS] = useState<string>("");
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [observations, setObservations] = useState<{ examTypeId: string; items: Observation[] }[]>([]);
  const [monthlyAttendance, setMonthlyAttendance] = useState<MonthAttendance[]>([]);
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const year = await api.get<any>("/academic-years/active");
        setYearBS(year?.yearBS || "");
        const yearId = year?.id as string | undefined;

        const [s, ets] = await Promise.all([
          api.get<StudentDetail>(`/students/${studentId}`),
          yearId ? api.get<ExamType[]>(`/exam-types?academicYearId=${yearId}`) : Promise.resolve([]),
        ]);

        // Keep only the active year's records so multi-year data doesn't pile up.
        if (yearId) {
          s.marks = s.marks.filter((m) => m.academicYearId === yearId);
          s.attendances = s.attendances.filter((a) => a.academicYearId === yearId);
          s.results = s.results.filter((r) => r.academicYearId === yearId);
        }
        setStudent(s);
        const sortedEts = [...ets].sort((a, b) => a.displayOrder - b.displayOrder);
        setExamTypes(sortedEts);

        // Fees + monthly attendance + observations are best-effort; a failure in
        // one shouldn't blank the page.
        if (yearId) {
          api.get<Ledger>(`/fees/student-ledger/${studentId}?academicYearId=${yearId}`)
            .then(setLedger).catch(() => setLedger(null));
          api.get<MonthAttendance[]>(`/daily-attendance/student/${studentId}?academicYearId=${yearId}`)
            .then(setMonthlyAttendance).catch(() => setMonthlyAttendance([]));
        }
        Promise.all(
          sortedEts.map((et) =>
            api.get<Observation[] | null>(`/observations/student/${studentId}/${et.id}`)
              .then((items) => ({ examTypeId: et.id, items: items || [] }))
              .catch(() => ({ examTypeId: et.id, items: [] as Observation[] }))
          )
        ).then(setObservations).catch(() => setObservations([]));
      } catch (err) {
        console.error(err);
        setStudent(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId]);

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading profile...</div>;
  if (!student) return (
    <div className="card p-8 text-center text-gray-400">
      Student not found. <Link href="/admin/students" className="text-primary underline">Back to students</Link>
    </div>
  );

  const att = student.attendances[0];
  const attPct = att && att.totalDays > 0 ? Math.round((att.presentDays / att.totalDays) * 100) : null;
  const result = student.results[0];

  // Exam matrix: rows = subjects, cols = exam types
  const subjectMap = new Map<string, Subject>();
  for (const m of student.marks) if (!subjectMap.has(m.subject.id)) subjectMap.set(m.subject.id, m.subject);
  const subjects = [...subjectMap.values()].sort((a, b) => a.displayOrder - b.displayOrder);
  const markAt = (subjectId: string, examTypeId: string) =>
    student.marks.find((m) => m.subject.id === subjectId && m.examType.id === examTypeId);

  // Fees totals
  const feeTotalDue = ledger
    ? ledger.monthGrid.reduce((s, m) => s + m.totalDue, 0) + ledger.fixedFees.reduce((s, f) => s + f.amount, 0)
    : 0;
  const feeTotalPaid = ledger
    ? ledger.monthGrid.reduce((s, m) => s + m.totalPaid, 0) + ledger.fixedFees.reduce((s, f) => s + f.paid, 0)
    : 0;
  const feeBalance = feeTotalDue - feeTotalPaid;

  // Observations that actually have any recorded grade
  const obsCategories = observations[0]?.items.map((i) => i.categoryName) ?? [];
  const hasAnyObservation = observations.some((o) => o.items.some((i) => i.grade && i.grade !== "—"));

  return (
    <div>
      {/* Back link */}
      <Link href="/admin/students" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary mb-4">
        <ArrowLeft size={15} /> Back to Students
      </Link>

      {/* Header */}
      <div className="card p-5 mb-6">
        <div className="flex items-start gap-4">
          {student.photo ? (
            <img src={student.photo} alt={student.name} className="w-20 h-20 rounded-xl object-cover border border-gray-200 shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-primary">{student.name[0]}</span>
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-display font-bold text-primary">{student.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full ${student.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-200 text-gray-500"}`}>
                {student.status}
              </span>
            </div>
            {student.nameNp && <p className="text-gray-500">{student.nameNp}</p>}
            <p className="text-sm text-gray-500 mt-1">
              {student.section.grade.name} — Section {student.section.name}
              {student.rollNo ? ` · Roll ${student.rollNo}` : ""}
              {yearBS ? ` · ${yearBS} B.S.` : ""}
            </p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <Stat label="Attendance" value={attPct !== null ? `${attPct}%` : "—"} />
          <Stat label="Overall GPA" value={result?.totalGpa != null ? result.totalGpa.toFixed(2) : "—"} />
          <Stat label="Overall %" value={result?.totalPercentage != null ? `${result.totalPercentage.toFixed(1)}%` : "—"} />
          <Stat label="Fee Balance" value={ledger ? `Rs. ${feeBalance.toLocaleString()}` : "—"}
            tone={ledger && feeBalance > 0 ? "warn" : "ok"} />
        </div>
      </div>

      {/* Details */}
      <Section icon={<User size={16} />} title="Details">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <Field label="Date of Birth" value={student.dateOfBirth} />
          <Field label="Gender" value={student.gender} />
          <Field label="Symbol Number" value={student.symbolNumber} />
          <Field label="Father's Name" value={student.fatherName} />
          <Field label="Mother's Name" value={student.motherName} />
          <Field label="Guardian" value={student.guardianName} />
          <Field label="Guardian Phone" value={student.guardianPhone} icon={<Phone size={12} />} />
          <Field label="Address" value={student.address} icon={<MapPin size={12} />} />
        </div>
      </Section>

      {/* Attendance */}
      <Section icon={<CalendarCheck size={16} />} title="Attendance">
        {att ? (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Stat label="Present" value={String(att.presentDays)} tone="ok" />
              <Stat label="Absent" value={String(att.absentDays)} tone="warn" />
              <Stat label="Total Days" value={String(att.totalDays)} />
            </div>
            {attPct !== null && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Attendance rate</span><span className="font-semibold">{attPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full ${attPct >= 85 ? "bg-emerald-500" : attPct >= 70 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${attPct}%` }} />
                </div>
              </div>
            )}

            {monthlyAttendance.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-medium text-gray-500 mb-2">Monthly breakdown</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="py-2 pr-4 font-medium">Month</th>
                        <th className="py-2 px-3 font-medium text-center">Present</th>
                        <th className="py-2 px-3 font-medium text-center">Absent</th>
                        <th className="py-2 px-3 font-medium text-center">Total</th>
                        <th className="py-2 pl-3 font-medium text-right">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyAttendance.map((m) => {
                        const rate = m.total > 0 ? Math.round((m.present / m.total) * 100) : 0;
                        const expandable = m.absent > 0;
                        const isOpen = expandedMonth === m.month;
                        return (
                          <Fragment key={m.month}>
                            <tr
                              onClick={() => expandable && setExpandedMonth(isOpen ? null : m.month)}
                              className={`border-t border-gray-100 ${expandable ? "cursor-pointer hover:bg-surface" : ""}`}
                            >
                              <td className="py-2 pr-4 font-medium text-gray-700">
                                <span className="inline-flex items-center gap-1">
                                  {expandable ? (isOpen ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />) : <span className="w-[13px]" />}
                                  {BS_MONTH_NAMES[m.month - 1] || `Month ${m.month}`}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center text-emerald-600 font-medium">{m.present}</td>
                              <td className="py-2 px-3 text-center text-amber-600 font-medium">{m.absent}</td>
                              <td className="py-2 px-3 text-center text-gray-500">{m.total}</td>
                              <td className={`py-2 pl-3 text-right font-semibold ${rate >= 85 ? "text-emerald-600" : rate >= 70 ? "text-amber-600" : "text-red-600"}`}>{rate}%</td>
                            </tr>
                            {isOpen && (
                              <tr className="bg-surface/60">
                                <td colSpan={5} className="py-2 px-4">
                                  <div className="text-xs text-gray-500 mb-1.5">Absent on {m.absent} day{m.absent !== 1 ? "s" : ""}:</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {m.absentDates.map((d) => (
                                      <span key={d} className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-xs">
                                        {formatBSDateLong(d)}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Empty>No attendance recorded for this year.</Empty>
        )}
      </Section>

      {/* Exams */}
      <Section icon={<GraduationCap size={16} />} title="Exams">
        {subjects.length > 0 && examTypes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-2 pr-4 font-medium">Subject</th>
                  {examTypes.map((et) => (
                    <th key={et.id} className="py-2 px-3 text-center font-medium">{et.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subjects.map((sub) => (
                  <tr key={sub.id} className="border-t border-gray-100">
                    <td className="py-2 pr-4">
                      <span className="font-medium text-gray-700">{sub.name}</span>
                      <span className="text-xs text-gray-400 ml-1">/ {sub.fullTheoryMarks + sub.fullPracticalMarks}</span>
                    </td>
                    {examTypes.map((et) => {
                      const m = markAt(sub.id, et.id);
                      return (
                        <td key={et.id} className={`py-2 px-3 text-center ${isFail(m) ? "text-red-600 font-semibold" : "text-gray-700"}`}>
                          {markValue(m)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {result && (
              <div className="flex flex-wrap gap-4 mt-4 text-sm">
                {result.totalPercentage != null && <Pill label="Year %" value={`${result.totalPercentage.toFixed(1)}%`} />}
                {result.totalGpa != null && <Pill label="Year GPA" value={result.totalGpa.toFixed(2)} />}
                {result.rank != null && <Pill label="Rank" value={String(result.rank)} />}
                {result.promoted && <Pill label="Promotion" value={result.promotedTo ? `→ ${result.promotedTo}` : "Promoted"} />}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-3"><span className="text-red-600 font-semibold">Red</span> = below pass marks · &quot;Ab&quot; = absent</p>
          </div>
        ) : (
          <Empty>No exam marks recorded for this year.</Empty>
        )}
      </Section>

      {/* Fees */}
      <Section icon={<Receipt size={16} />} title="Fees">
        {ledger ? (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Stat label="Total Due" value={`Rs. ${feeTotalDue.toLocaleString()}`} />
              <Stat label="Total Paid" value={`Rs. ${feeTotalPaid.toLocaleString()}`} tone="ok" />
              <Stat label="Balance" value={`Rs. ${feeBalance.toLocaleString()}`} tone={feeBalance > 0 ? "warn" : "ok"} />
            </div>
            {ledger.recentPayments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr className="text-left text-xs text-gray-500">
                      <th className="py-2 pr-4 font-medium">Date</th>
                      <th className="py-2 pr-4 font-medium">Category</th>
                      <th className="py-2 pr-4 font-medium">Month</th>
                      <th className="py-2 pr-4 font-medium text-right">Amount</th>
                      <th className="py-2 pr-4 font-medium">Method</th>
                      <th className="py-2 font-medium">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.recentPayments.map((p) => (
                      <tr key={p.id} className="border-t border-gray-100">
                        <td className="py-2 pr-4 text-gray-600">{p.paymentDate}</td>
                        <td className="py-2 pr-4 text-gray-700">{p.category}</td>
                        <td className="py-2 pr-4 text-gray-500">{p.paidMonth || "—"}</td>
                        <td className="py-2 pr-4 text-right font-medium text-gray-700">Rs. {p.amount.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-gray-500">{p.paymentMethod || "—"}</td>
                        <td className="py-2 text-gray-400 text-xs">{p.receiptNumber || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No payments recorded yet.</Empty>
            )}
          </div>
        ) : (
          <Empty>Fee information is not available.</Empty>
        )}
      </Section>

      {/* Observations */}
      <Section icon={<Eye size={16} />} title="Observations">
        {hasAnyObservation ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-2 pr-4 font-medium">Category</th>
                  {examTypes.map((et) => (
                    <th key={et.id} className="py-2 px-3 text-center font-medium">{et.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {obsCategories.map((cat) => (
                  <tr key={cat} className="border-t border-gray-100">
                    <td className="py-2 pr-4 font-medium text-gray-700">{cat}</td>
                    {examTypes.map((et) => {
                      const found = observations.find((o) => o.examTypeId === et.id);
                      const item = found?.items.find((i) => i.categoryName === cat);
                      return <td key={et.id} className="py-2 px-3 text-center text-gray-700">{item?.grade || "—"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No observations recorded for this year.</Empty>
        )}
      </Section>
    </div>
  );
}

// ─── Small presentational helpers ───────────────────────
function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const color = tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-primary";
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-4 py-3">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center gap-2 mb-4 text-primary">
        {icon}
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-gray-700 flex items-center gap-1">{icon}{value || "—"}</div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-3 py-1 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-primary">{value}</span>
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-gray-400 text-sm py-6">{children}</div>;
}
