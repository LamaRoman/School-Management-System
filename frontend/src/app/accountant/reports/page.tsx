"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { getTodayBS, formatBSDateLong, BS_MONTH_NAMES, getCurrentBSMonthName, getPreviousDayBS, getNextDayBS, isFutureBS, isTodayBS } from "@/lib/bsDate";
import { printReceipt } from "@/lib/feePrintUtils";
import toast from "react-hot-toast";
import { ChevronLeft, ChevronRight, Printer, Search, AlertTriangle, BookOpen, FileBarChart, Users, Calendar, Receipt } from "lucide-react";

type ReportView = "menu" | "daily-cashbook" | "payment-history" | "defaulters" | "discounts" | "monthly-summary" | "student-count";

export default function AccountantReportsPage() {
  const [view, setView] = useState<ReportView>("menu");
  const [activeYear, setActiveYear] = useState<any>(null);

  useEffect(() => {
    api.get<any>("/academic-years/active").then(setActiveYear).catch(() => {});
  }, []);

  if (!activeYear) return <div className="max-w-5xl mx-auto p-6"><div className="card p-8 text-center text-gray-400">Loading...</div></div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      {view === "menu" && <ReportMenu onSelect={setView} />}
      {view === "daily-cashbook" && <DailyCashBook activeYear={activeYear} onBack={() => setView("menu")} />}
      {view === "payment-history" && <PaymentHistory activeYear={activeYear} onBack={() => setView("menu")} />}
      {view === "defaulters" && <DefaulterReport activeYear={activeYear} onBack={() => setView("menu")} />}
      {view === "discounts" && <DiscountReport activeYear={activeYear} onBack={() => setView("menu")} />}
      {view === "monthly-summary" && <MonthlySummary activeYear={activeYear} onBack={() => setView("menu")} />}
      {view === "student-count" && <StudentCount activeYear={activeYear} onBack={() => setView("menu")} />}
    </div>
  );
}

// ─── REPORT MENU ────────────────────────────────────────

function ReportMenu({ onSelect }: { onSelect: (v: ReportView) => void }) {
  const reports: { key: ReportView; title: string; description: string; icon: any }[] = [
    { key: "daily-cashbook", title: "Daily Cash Book", description: "Today's collections summary for principal's signature", icon: Calendar },
    { key: "payment-history", title: "Payment History", description: "Search by receipt number, student, or date range", icon: Receipt },
    { key: "defaulters", title: "Fee Defaulter Report", description: "Students with overdue fees by grade/section", icon: AlertTriangle },
    { key: "discounts", title: "Fee Discount Report", description: "All scholarships and discounts applied", icon: BookOpen },
    { key: "monthly-summary", title: "Monthly Summary", description: "Total collected vs expected, by fee category", icon: FileBarChart },
    { key: "student-count", title: "Student Count", description: "Grade-wise enrollment for government reporting", icon: Users },
  ];

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-primary mb-6">Reports</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((r) => (
          <div key={r.key} onClick={() => onSelect(r.key)} className="card p-5 hover:shadow-md cursor-pointer transition-all">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-primary/10 rounded-lg"><r.icon size={22} className="text-primary" /></div>
              <div><h3 className="font-semibold text-primary">{r.title}</h3><p className="text-sm text-gray-500 mt-1">{r.description}</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DAILY CASH BOOK ────────────────────────────────────

function DailyCashBook({ activeYear, onBack }: { activeYear: any; onBack: () => void }) {
  const [date, setDate] = useState(getTodayBS());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async (d: string) => {
    setLoading(true);
    try {
      const result = await api.get<any>(`/accountant-reports/daily-cashbook?date=${d}&academicYearId=${activeYear.id}`);
      setData(result);
    } catch { setData(null); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(date); }, [date]);

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cash Book — ${date}</title>
    <style>body{font-family:-apple-system,sans-serif;font-size:12px;max-width:700px;margin:0 auto;padding:20px}
    h1{font-size:16px;text-align:center;margin-bottom:2px} h2{font-size:13px;text-align:center;color:#555;margin-bottom:4px}
    .date{text-align:center;font-size:11px;color:#888;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px} th,td{border:1px solid #ddd;padding:5px 8px;font-size:11px}
    th{background:#f5f5f5;font-weight:600;text-align:left} .text-right{text-align:right} .bold{font-weight:700}
    .summary{display:flex;justify-content:space-between;margin-top:24px} .sig{text-align:center;min-width:120px}
    .sig-line{border-top:1px solid #555;margin-top:40px;padding-top:4px;font-size:10px}
    @page{size:A4;margin:15mm}</style></head><body>
    <h1>${data?.school || "School"}</h1><h2>Daily Cash Book</h2>
    <div class="date">${formatBSDateLong(date)}</div>
    <table><thead><tr><th>SN</th><th>Receipt</th><th>Student</th><th>Class</th><th>Method</th><th class="text-right">Amount</th></tr></thead>
    <tbody>${data?.receipts?.map((r: any, i: number) => `<tr><td>${i + 1}</td><td>${r.receiptNumber}</td><td>${r.studentName}</td><td>${r.className} ${r.section}</td><td>${r.paymentMethod || "Cash"}</td><td class="text-right">Rs ${r.total.toLocaleString()}</td></tr>`).join("") || ""}</tbody>
    <tfoot><tr class="bold"><td colspan="5" class="text-right">Grand Total</td><td class="text-right">Rs ${data?.grandTotal?.toLocaleString() || 0}</td></tr></tfoot></table>
    <p class="bold">Summary by Category:</p>
    <table><tbody>${data?.categorySummary?.map((c: any) => `<tr><td>${c.name}</td><td class="text-right">Rs ${c.amount.toLocaleString()}</td></tr>`).join("") || ""}</tbody></table>
    <div class="summary"><div class="sig"><div class="sig-line">Prepared By</div></div><div class="sig"><div class="sig-line">Accountant</div></div><div class="sig"><div class="sig-line">Principal</div></div></div>
    </body></html>`);
    win.document.close();
    win.onload = () => win.print();
  };

  const isNextDisabled = isTodayBS(date) || isFutureBS(date);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-sm text-primary hover:underline">← Back to Reports</button>
        {data && data.receipts?.length > 0 && <button onClick={handlePrint} className="btn-outline text-xs"><Printer size={14} /> Print Cash Book</button>}
      </div>
      <h1 className="text-2xl font-display font-bold text-primary mb-4">Daily Cash Book</h1>

      <div className="card p-3 mb-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setDate(getPreviousDayBS(date))} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
          <div className="text-center">
            <p className="font-semibold text-primary text-lg">{formatBSDateLong(date)}</p>
            {isTodayBS(date) && <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full">Today</span>}
          </div>
          <button onClick={() => { const next = getNextDayBS(date); if (!isFutureBS(next)) setDate(next); }} disabled={isNextDisabled} className={`p-2 rounded-lg ${isNextDisabled ? "opacity-30" : "hover:bg-gray-100"}`}><ChevronRight size={20} /></button>
        </div>
      </div>

      {loading && <div className="card p-8 text-center text-gray-400 animate-pulse">Loading...</div>}

      {!loading && data && (
        <>
          <div className="flex gap-4 mb-4">
            <div className="card p-3 flex-1 text-center"><p className="text-2xl font-bold text-emerald-600">Rs {data.grandTotal?.toLocaleString()}</p><p className="text-xs text-gray-500">Total Collected</p></div>
            <div className="card p-3 flex-1 text-center"><p className="text-2xl font-bold text-primary">{data.totalReceipts}</p><p className="text-xs text-gray-500">Receipts</p></div>
          </div>

          {data.receipts?.length > 0 ? (
            <div className="card overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead><tr className="table-header"><th className="text-left px-4 py-2">SN</th><th className="text-left px-4 py-2">Receipt</th><th className="text-left px-4 py-2">Student</th><th className="text-left px-4 py-2">Class</th><th className="text-left px-4 py-2">Method</th><th className="text-right px-4 py-2">Amount</th></tr></thead>
                <tbody>{data.receipts.map((r: any, i: number) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-surface">
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{r.receiptNumber}</td>
                    <td className="px-4 py-2 font-medium text-primary">{r.studentName}</td>
                    <td className="px-4 py-2 text-gray-600">{r.className} {r.section}</td>
                    <td className="px-4 py-2"><span className="text-xs px-2 py-0.5 bg-gray-100 rounded">{r.paymentMethod || "Cash"}</span></td>
                    <td className="px-4 py-2 text-right font-semibold">Rs {r.total.toLocaleString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <div className="card p-8 text-center text-gray-400">No collections on this date.</div>
          )}

          {data.categorySummary?.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-2">Summary by Category</h3>
              {data.categorySummary.map((c: any) => (
                <div key={c.name} className="flex justify-between py-1 border-b border-gray-100 text-sm">
                  <span className="text-gray-600">{c.name}</span>
                  <span className="font-semibold">Rs {c.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── PAYMENT HISTORY ────────────────────────────────────

function PaymentHistory({ activeYear, onBack }: { activeYear: any; onBack: () => void }) {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [payments, setPayments] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `/accountant-reports/payment-history?academicYearId=${activeYear.id}&page=${page}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (dateFrom) url += `&dateFrom=${dateFrom}`;
      if (dateTo) url += `&dateTo=${dateTo}`;
      const result = await api.get<any>(url);
      setPayments(result.payments || []);
      setTotal(result.total || 0);
      setPages(result.pages || 1);
    } catch { setPayments([]); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [page]);

  return (
    <div>
      <button onClick={onBack} className="text-sm text-primary hover:underline mb-4">← Back to Reports</button>
      <h1 className="text-2xl font-display font-bold text-primary mb-4">Payment History</h1>

      <div className="card p-4 mb-4">
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]"><label className="label">Search (name or receipt)</label>
            <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Student name or RCP-..." /></div></div>
          <div><label className="label">From (BS)</label><input className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="2082/01/01" /></div>
          <div><label className="label">To (BS)</label><input className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="2082/12/30" /></div>
          <button onClick={() => { setPage(1); fetchData(); }} className="btn-primary text-sm"><Search size={14} /> Search</button>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-2">{total} payment{total !== 1 ? "s" : ""} found</p>

      {loading ? <div className="card p-8 text-center text-gray-400 animate-pulse">Searching...</div> : (
        <div className="card overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="table-header"><th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Receipt</th><th className="text-left px-3 py-2">Student</th><th className="text-left px-3 py-2">Class</th><th className="text-left px-3 py-2">Category</th><th className="text-left px-3 py-2">Month</th><th className="text-left px-3 py-2">Method</th><th className="text-right px-3 py-2">Amount</th></tr></thead>
            <tbody>{payments.map((p: any) => (
              <tr key={p.id} className="border-t border-gray-100 hover:bg-surface">
                <td className="px-3 py-2">{p.paymentDate}</td>
                <td className="px-3 py-2 text-gray-500">{p.receiptNumber}</td>
                <td className="px-3 py-2 font-medium text-primary">{p.studentName}</td>
                <td className="px-3 py-2">{p.className} {p.section}</td>
                <td className="px-3 py-2">{p.category}</td>
                <td className="px-3 py-2 text-gray-500">{p.paidMonth || "—"}</td>
                <td className="px-3 py-2"><span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">{p.paymentMethod}</span></td>
                <td className="px-3 py-2 text-right font-semibold">Rs {p.amount.toLocaleString()}</td>
              </tr>
            ))}</tbody>
          </table>
          {payments.length === 0 && <div className="p-6 text-center text-gray-400">No payments found.</div>}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="btn-ghost text-xs">Previous</button>
          <span className="text-sm text-gray-500">Page {page} of {pages}</span>
          <button onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages} className="btn-ghost text-xs">Next</button>
        </div>
      )}
    </div>
  );
}

// ─── DEFAULTER REPORT ───────────────────────────────────

function DefaulterReport({ activeYear, onBack }: { activeYear: any; onBack: () => void }) {
  const [grades, setGrades] = useState<any[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [currentMonth, setCurrentMonth] = useState(getCurrentBSMonthName());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get<any[]>(`/grades?academicYearId=${activeYear.id}`).then(setGrades).catch(() => {}); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `/accountant-reports/defaulters?academicYearId=${activeYear.id}&currentMonth=${currentMonth}`;
      if (selectedGrade) url += `&gradeId=${selectedGrade}`;
      const result = await api.get<any>(url);
      setData(result);
    } catch { setData(null); } finally { setLoading(false); }
  };

  return (
    <div>
      <button onClick={onBack} className="text-sm text-primary hover:underline mb-4">← Back to Reports</button>
      <h1 className="text-2xl font-display font-bold text-primary mb-4">Fee Defaulter Report</h1>

      <div className="card p-4 mb-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1"><label className="label">Grade (optional)</label><select className="input" value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)}><option value="">All Grades</option>{grades.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
          <div className="flex-1"><label className="label">Up To Month</label><select className="input" value={currentMonth} onChange={(e) => setCurrentMonth(e.target.value)}>{BS_MONTH_NAMES.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          <button onClick={fetchData} className="btn-primary text-sm">Generate</button>
        </div>
      </div>

      {loading && <div className="card p-8 text-center text-gray-400 animate-pulse">Generating...</div>}

      {!loading && data && (
        <>
          <div className="flex gap-4 mb-4">
            <div className="card p-3 flex-1 text-center"><p className="text-2xl font-bold text-red-600">{data.summary?.totalDefaulters}</p><p className="text-xs text-gray-500">Defaulters</p></div>
            <div className="card p-3 flex-1 text-center"><p className="text-2xl font-bold text-red-600">Rs {data.summary?.totalDue?.toLocaleString()}</p><p className="text-xs text-gray-500">Total Due</p></div>
            <div className="card p-3 flex-1 text-center"><p className="text-2xl font-bold text-primary">{data.summary?.totalStudents}</p><p className="text-xs text-gray-500">Total Students</p></div>
          </div>

          {data.defaulters?.length > 0 ? (
            <div className="card overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="table-header"><th className="text-left px-3 py-2">Student</th><th className="text-left px-3 py-2">Class</th><th className="text-left px-3 py-2">Phone</th><th className="text-right px-3 py-2">Expected</th><th className="text-right px-3 py-2">Paid</th><th className="text-right px-3 py-2">Balance</th><th className="text-center px-3 py-2">Months</th></tr></thead>
                <tbody>{data.defaulters.map((d: any) => (
                  <tr key={d.studentId} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-primary">{d.studentName}</td>
                    <td className="px-3 py-2">{d.className} {d.section}</td>
                    <td className="px-3 py-2 text-gray-500">{d.guardianPhone}</td>
                    <td className="px-3 py-2 text-right">Rs {d.expectedUpTo.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">Rs {d.totalPaid.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-bold text-red-600">Rs {d.balance.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center"><span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full">{d.monthsPending}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div className="card p-8 text-center text-emerald-600 font-semibold">No defaulters! All fees are up to date.</div>}
        </>
      )}
    </div>
  );
}

// ─── DISCOUNT REPORT ────────────────────────────────────

function DiscountReport({ activeYear, onBack }: { activeYear: any; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>(`/accountant-reports/discounts?academicYearId=${activeYear.id}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card p-8 text-center text-gray-400 animate-pulse">Loading...</div>;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-primary hover:underline mb-4">← Back to Reports</button>
      <h1 className="text-2xl font-display font-bold text-primary mb-4">Fee Discount Report</h1>

      <div className="card p-3 mb-4 text-center"><p className="text-2xl font-bold text-primary">{data?.summary?.totalDiscounts || 0}</p><p className="text-xs text-gray-500">Total Discounts Applied</p></div>

      {data?.discounts?.length > 0 ? (
        <div className="card overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="table-header"><th className="text-left px-3 py-2">Student</th><th className="text-left px-3 py-2">Class</th><th className="text-left px-3 py-2">Category</th><th className="text-center px-3 py-2">Type</th><th className="text-center px-3 py-2">Discount</th><th className="text-left px-3 py-2">Reason</th></tr></thead>
            <tbody>{data.discounts.map((d: any) => (
              <tr key={d.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium text-primary">{d.studentName}</td>
                <td className="px-3 py-2">{d.className} {d.section}</td>
                <td className="px-3 py-2">{d.category}</td>
                <td className="px-3 py-2 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${d.discountType === "PERCENTAGE" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{d.discountType}</span></td>
                <td className="px-3 py-2 text-center font-semibold">{d.discountType === "PERCENTAGE" ? `${d.discountPercent}%` : `Rs ${d.overrideAmount}`}</td>
                <td className="px-3 py-2 text-gray-500">{d.reason}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className="card p-8 text-center text-gray-400">No discounts applied.</div>}
    </div>
  );
}

// ─── MONTHLY SUMMARY ────────────────────────────────────

function MonthlySummary({ activeYear, onBack }: { activeYear: any; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>(`/accountant-reports/monthly-summary?academicYearId=${activeYear.id}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card p-8 text-center text-gray-400 animate-pulse">Loading...</div>;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-primary hover:underline mb-4">← Back to Reports</button>
      <h1 className="text-2xl font-display font-bold text-primary mb-4">Monthly Financial Summary</h1>

      <div className="flex gap-4 mb-4">
        <div className="card p-3 flex-1 text-center"><p className="text-2xl font-bold text-emerald-600">Rs {data?.totalCollected?.toLocaleString() || 0}</p><p className="text-xs text-gray-500">Total Collected</p></div>
        <div className="card p-3 flex-1 text-center"><p className="text-2xl font-bold text-primary">{data?.studentCount || 0}</p><p className="text-xs text-gray-500">Active Students</p></div>
      </div>

      {data?.months && (
        <div className="card overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead><tr className="table-header"><th className="text-left px-4 py-2">Month</th><th className="text-right px-4 py-2">Collected</th><th className="text-right px-4 py-2">Receipts</th></tr></thead>
            <tbody>{data.months.map((m: any) => (
              <tr key={m.month} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{m.month}</td>
                <td className="px-4 py-2 text-right font-semibold text-emerald-600">{m.collected > 0 ? `Rs ${m.collected.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-2 text-right text-gray-500">{m.receiptCount || "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {data?.byCategory?.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-primary mb-2">Collection by Category</h3>
          {data.byCategory.map((c: any) => (
            <div key={c.name} className="flex justify-between py-1 border-b border-gray-100 text-sm">
              <span className="text-gray-600">{c.name}</span><span className="font-semibold">Rs {c.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── STUDENT COUNT ──────────────────────────────────────

function StudentCount({ activeYear, onBack }: { activeYear: any; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>(`/accountant-reports/student-count?academicYearId=${activeYear.id}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card p-8 text-center text-gray-400 animate-pulse">Loading...</div>;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-primary hover:underline mb-4">← Back to Reports</button>
      <h1 className="text-2xl font-display font-bold text-primary mb-4">Student Count Report</h1>

      <div className="flex gap-4 mb-4">
        <div className="card p-3 flex-1 text-center"><p className="text-2xl font-bold text-primary">{data?.grand?.total || 0}</p><p className="text-xs text-gray-500">Total Students</p></div>
        <div className="card p-3 flex-1 text-center"><p className="text-2xl font-bold text-blue-600">{data?.grand?.male || 0}</p><p className="text-xs text-gray-500">Male</p></div>
        <div className="card p-3 flex-1 text-center"><p className="text-2xl font-bold text-pink-600">{data?.grand?.female || 0}</p><p className="text-xs text-gray-500">Female</p></div>
      </div>

      {data?.grades && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="table-header"><th className="text-left px-4 py-2">Grade</th><th className="text-right px-4 py-2">Male</th><th className="text-right px-4 py-2">Female</th><th className="text-right px-4 py-2">Other</th><th className="text-right px-4 py-2 font-bold">Total</th></tr></thead>
            <tbody>{data.grades.map((g: any) => (
              <tr key={g.gradeName} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium text-primary">{g.gradeName}</td>
                <td className="px-4 py-2 text-right">{g.male}</td>
                <td className="px-4 py-2 text-right">{g.female}</td>
                <td className="px-4 py-2 text-right">{g.other}</td>
                <td className="px-4 py-2 text-right font-bold">{g.total}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr className="border-t-2 border-primary"><td className="px-4 py-2 font-bold text-primary">Grand Total</td><td className="px-4 py-2 text-right font-bold">{data.grand.male}</td><td className="px-4 py-2 text-right font-bold">{data.grand.female}</td><td className="px-4 py-2 text-right font-bold">{data.grand.other}</td><td className="px-4 py-2 text-right font-bold text-primary">{data.grand.total}</td></tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}