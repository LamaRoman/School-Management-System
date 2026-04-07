"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Receipt, Users, AlertTriangle, TrendingUp, Search, FileText, ChevronRight } from "lucide-react";
import { getTodayBS, formatBSDateLong, getCurrentBSMonthName } from "@/lib/bsDate";
import { printReceipt } from "@/lib/feePrintUtils";
import toast from "react-hot-toast";

interface Defaulter {
  studentId: string;
  studentName: string;
  className: string;
  section: string;
  balance: number;
  monthsPending: number;
}

interface ReceiptGroup {
  receiptNumber: string;
  studentName: string;
  className: string;
  section: string;
  rollNo: number | null;
  paymentMethod: string | null;
  items: { category: string; amount: number; paidMonth: string | null }[];
  total: number;
}

interface RecentPayment {
  id: string;
  receiptNumber: string;
  studentName: string;
  className: string;
  section: string;
  rollNo: number | null;
  category: string;
  amount: number;
  paidMonth: string | null;
  paymentDate: string;
  paymentMethod: string;
}

function groupPaymentsToReceipts(payments: RecentPayment[]): ReceiptGroup[] {
  const map = new Map<string, ReceiptGroup>();
  for (const p of payments) {
    const key = p.receiptNumber;
    if (!map.has(key)) {
      map.set(key, {
        receiptNumber: key,
        studentName: p.studentName,
        className: p.className,
        section: p.section,
        rollNo: p.rollNo,
        paymentMethod: p.paymentMethod,
        items: [],
        total: 0,
      });
    }
    const entry = map.get(key)!;
    entry.items.push({ category: p.category, amount: p.amount, paidMonth: p.paidMonth });
    entry.total += p.amount;
  }
  return Array.from(map.values());
}

export default function AccountantDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [todayTotal, setTodayTotal] = useState(0);
  const [todayReceipts, setTodayReceipts] = useState(0);
  const [monthCollected, setMonthCollected] = useState(0);
  const [monthExpected, setMonthExpected] = useState(0);
  const [currentMonth, setCurrentMonth] = useState("");
  const [totalDefaulters, setTotalDefaulters] = useState(0);
  const [totalDue, setTotalDue] = useState(0);
  const [defaultersList, setDefaultersList] = useState<Defaulter[]>([]);
  const [recentReceipts, setRecentReceipts] = useState<ReceiptGroup[]>([]);
  const [receiptSearch, setReceiptSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ReceiptGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeYearId, setActiveYearId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const year = await api.get<any>("/academic-years/active").catch(() => null);
        if (!year) { setLoading(false); return; }
        setActiveYearId(year.id);

        const monthName = getCurrentBSMonthName();
        setCurrentMonth(monthName);

        const [cashbook, defData, summaryData, recentData] = await Promise.all([
          api.get<any>(`/accountant-reports/daily-cashbook?date=${encodeURIComponent(getTodayBS())}&academicYearId=${year.id}`).catch(() => null),
          api.get<any>(`/accountant-reports/defaulters?academicYearId=${year.id}&currentMonth=${monthName}`).catch(() => null),
          api.get<any>(`/accountant-reports/monthly-summary?academicYearId=${year.id}&month=${monthName}`).catch(() => null),
          api.get<any>(`/accountant-reports/payment-history?academicYearId=${year.id}&limit=20`).catch(() => null),
        ]);

        // Today's collection
        setTodayTotal(cashbook?.grandTotal ?? 0);
        setTodayReceipts(cashbook?.totalReceipts ?? 0);

        // Defaulters
        if (defData?.summary) {
          setTotalDefaulters(defData.summary.totalDefaulters ?? 0);
          setTotalDue(defData.summary.totalDue ?? 0);
        }
        if (Array.isArray(defData?.defaulters)) {
          setDefaultersList(defData.defaulters);
        }

        // Monthly progress
        if (summaryData?.months) {
          const entry = summaryData.months.find((m: any) => m.month === monthName);
          if (entry) {
            setMonthCollected(entry.collected ?? 0);
            setMonthExpected(entry.expected ?? 0);
          }
        }

        // Recent transactions
        if (Array.isArray(recentData?.payments)) {
          setRecentReceipts(groupPaymentsToReceipts(recentData.payments));
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Receipt search
  useEffect(() => {
    if (!receiptSearch.trim() || receiptSearch.trim().length < 2 || !activeYearId) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.get<any>(`/accountant-reports/payment-history?academicYearId=${activeYearId}&search=${encodeURIComponent(receiptSearch.trim())}&limit=50`);
        if (Array.isArray(data?.payments)) {
          setSearchResults(groupPaymentsToReceipts(data.payments));
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [receiptSearch, activeYearId]);

  const handlePrintReceipt = async (receiptNumber: string) => {
    try {
      const data = await api.get<any>(`/fees/receipt/${receiptNumber}`);
      printReceipt(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to print receipt");
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="card p-8 text-center text-gray-400 animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  const monthPct = monthExpected > 0 ? Math.min(100, (monthCollected / monthExpected) * 100) : 0;
  const monthRemaining = Math.max(0, monthExpected - monthCollected);
  const pctColor = monthPct >= 80 ? "bg-emerald-500" : monthPct >= 50 ? "bg-amber-500" : "bg-red-500";
  const pctTextColor = monthPct >= 80 ? "text-emerald-600" : monthPct >= 50 ? "text-amber-600" : "text-red-600";

  const criticalDefaulters = defaultersList.filter(d => d.monthsPending >= 3);
  const moderateDefaulters = defaultersList.filter(d => d.monthsPending >= 1 && d.monthsPending < 3);
  const criticalDue = criticalDefaulters.reduce((s, d) => s + d.balance, 0);
  const moderateDue = moderateDefaulters.reduce((s, d) => s + d.balance, 0);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-primary">Accountant Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">{formatBSDateLong(getTodayBS())}</p>
      </div>

      {/* ── Today's Collection ── */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <Receipt size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">Rs {todayTotal.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Today&apos;s Collection</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <FileText size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{todayReceipts}</p>
              <p className="text-xs text-gray-500">Receipts Today</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Monthly Progress ── */}
      {monthExpected > 0 && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-primary flex items-center gap-2">
              <TrendingUp size={16} /> {currentMonth} Collection
            </h2>
            <span className={`text-lg font-bold ${pctTextColor}`}>{Math.round(monthPct)}%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
            <div className={`h-full rounded-full transition-all duration-500 ${pctColor}`} style={{ width: `${monthPct}%` }} />
          </div>
          <div className="grid grid-cols-3 text-center text-sm">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Collected</p>
              <p className="font-bold text-emerald-600">Rs {monthCollected.toLocaleString()}</p>
            </div>
            <div className="border-x border-gray-200">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Remaining</p>
              <p className={`font-bold ${monthRemaining > 0 ? "text-red-600" : "text-emerald-600"}`}>Rs {monthRemaining.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Expected</p>
              <p className="font-bold text-gray-800">Rs {monthExpected.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Defaulters Summary ── */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-primary flex items-center gap-2">
            <AlertTriangle size={16} /> Fee Defaulters
          </h2>
          <span className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded-full font-semibold">
            {totalDefaulters} students
          </span>
        </div>

        {totalDefaulters > 0 ? (
          <>
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
              <span className="text-sm text-gray-500">Total Outstanding</span>
              <span className="text-xl font-bold text-red-600">Rs {totalDue.toLocaleString()}</span>
            </div>

            <div className="space-y-2">
              {criticalDefaulters.length > 0 && (
                <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                  <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-700">Critical (3+ months)</p>
                    <p className="text-xs text-gray-500">{criticalDefaulters.length} students · Rs {criticalDue.toLocaleString()}</p>
                  </div>
                </div>
              )}
              {moderateDefaulters.length > 0 && (
                <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg">
                  <div className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-700">Moderate (1–2 months)</p>
                    <p className="text-xs text-gray-500">{moderateDefaulters.length} students · Rs {moderateDue.toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>

            <Link href="/accountant/reports" className="block text-center text-sm text-primary font-medium mt-3 hover:underline">
              View full defaulter report →
            </Link>
          </>
        ) : (
          <p className="text-center text-emerald-600 font-semibold py-2">All fees up to date!</p>
        )}
      </div>

      {/* ── Recent Transactions ── */}
      <div className="card overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-primary">Recent Transactions</h2>
        </div>
        {recentReceipts.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left px-5 py-2">Receipt</th>
                <th className="text-left px-5 py-2">Student</th>
                <th className="text-left px-5 py-2">Class</th>
                <th className="text-right px-5 py-2">Amount</th>
                <th className="text-right px-5 py-2">Reprint</th>
              </tr>
            </thead>
            <tbody>
              {recentReceipts.slice(0, 10).map((r) => (
                <tr key={r.receiptNumber} className="border-t border-gray-50 hover:bg-surface transition-colors">
                  <td className="px-5 py-2">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono font-semibold">{r.receiptNumber}</span>
                  </td>
                  <td className="px-5 py-2 font-medium text-gray-800">{r.studentName}</td>
                  <td className="px-5 py-2 text-gray-500">{r.className} {r.section}</td>
                  <td className="px-5 py-2 text-right font-semibold text-emerald-600">Rs {r.total.toLocaleString()}</td>
                  <td className="px-5 py-2 text-right">
                    <button
                      onClick={() => handlePrintReceipt(r.receiptNumber)}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Print
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-400">No recent transactions.</div>
        )}
      </div>

      {/* ── Receipt Search ── */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-primary flex items-center gap-2 mb-3">
          <Search size={16} /> Find Receipt
        </h2>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search by receipt number (e.g. RCP-00012) or student name..."
            value={receiptSearch}
            onChange={(e) => setReceiptSearch(e.target.value)}
          />
          {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 animate-pulse">Searching...</div>}
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {searchResults.map((r) => (
                  <tr key={r.receiptNumber} className="border-t first:border-t-0 border-gray-100 hover:bg-surface transition-colors">
                    <td className="px-4 py-2">
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono font-semibold">{r.receiptNumber}</span>
                    </td>
                    <td className="px-4 py-2 font-medium">{r.studentName}</td>
                    <td className="px-4 py-2 text-gray-500">{r.className} {r.section}</td>
                    <td className="px-4 py-2 text-right font-semibold text-emerald-600">Rs {r.total.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => handlePrintReceipt(r.receiptNumber)} className="text-xs text-primary hover:underline font-medium">Print</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {receiptSearch.trim().length >= 2 && !searching && searchResults.length === 0 && (
          <p className="mt-3 text-sm text-gray-400 text-center">No receipts found for &quot;{receiptSearch}&quot;</p>
        )}
      </div>

      {/* ── Quick Actions ── */}
      <div className="card p-5">
        <h2 className="font-semibold text-primary mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/accountant/fees" className="p-4 bg-surface rounded-lg text-center hover:bg-gray-100 transition-colors">
            <Receipt size={24} className="mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium text-gray-700">Collect Fee</p>
          </Link>
          <Link href="/accountant/admissions" className="p-4 bg-surface rounded-lg text-center hover:bg-gray-100 transition-colors">
            <Users size={24} className="mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium text-gray-700">New Admission</p>
          </Link>
          <Link href="/accountant/students" className="p-4 bg-surface rounded-lg text-center hover:bg-gray-100 transition-colors">
            <Search size={24} className="mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium text-gray-700">Find Student</p>
          </Link>
          <Link href="/accountant/reports" className="p-4 bg-surface rounded-lg text-center hover:bg-gray-100 transition-colors">
            <FileText size={24} className="mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium text-gray-700">Reports</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
