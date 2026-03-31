"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Receipt, UserPlus, Users, AlertTriangle } from "lucide-react";
import { getTodayBS, formatBSDateLong } from "@/lib/bsDate";

interface DashboardStats {
  todayCollections: number;
  todayReceipts: number;
  pendingAdmissions: number;
  totalActiveStudents: number;
  totalDefaulters: number;
}

export default function AccountantDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const year = await api.get<any>("/academic-years/active").catch(() => null);

        const [admissions, cashbook, defaulters] = await Promise.all([
          year ? api.get<any[]>(`/admissions?academicYearId=${year.id}`).catch(() => []) : Promise.resolve([]),
          year ? api.get<any>(`/accountant-reports/daily-cashbook?date=${encodeURIComponent(getTodayBS())}&academicYearId=${year.id}`).catch(() => null) : Promise.resolve(null),
          year ? api.get<any>(`/accountant-reports/defaulters?academicYearId=${year.id}`).catch(() => null) : Promise.resolve(null),
        ]);

        const pendingAdmissions = Array.isArray(admissions)
          ? admissions.filter((a: any) => a.status === "PENDING").length
          : 0;

        setStats({
          todayCollections: cashbook?.grandTotal ?? 0,
          todayReceipts: cashbook?.totalReceipts ?? 0,
          pendingAdmissions,
          totalActiveStudents: defaulters?.summary?.totalStudents ?? 0,
          totalDefaulters: defaulters?.summary?.totalDefaulters ?? 0,
        });
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="card p-8 text-center text-gray-400 animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-primary">Accountant Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">{formatBSDateLong(getTodayBS())}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <Receipt size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">Rs {stats?.todayCollections?.toLocaleString() || 0}</p>
              <p className="text-xs text-gray-500">Today's Collection</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg">
              <UserPlus size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{stats?.pendingAdmissions || 0}</p>
              <p className="text-xs text-gray-500">Pending Admissions</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Users size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{stats?.totalActiveStudents || 0}</p>
              <p className="text-xs text-gray-500">Active Students</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{stats?.totalDefaulters || 0}</p>
              <p className="text-xs text-gray-500">Fee Defaulters</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-5">
        <h2 className="font-semibold text-primary mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/accountant/admissions" className="p-4 bg-surface rounded-lg text-center hover:bg-gray-100 transition-colors">
            <UserPlus size={24} className="mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium text-gray-700">New Admission</p>
          </Link>
          <Link href="/accountant/fees" className="p-4 bg-surface rounded-lg text-center hover:bg-gray-100 transition-colors">
            <Receipt size={24} className="mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium text-gray-700">Collect Fee</p>
          </Link>
          <Link href="/accountant/students" className="p-4 bg-surface rounded-lg text-center hover:bg-gray-100 transition-colors">
            <Users size={24} className="mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium text-gray-700">Find Student</p>
          </Link>
          <Link href="/accountant/reports" className="p-4 bg-surface rounded-lg text-center hover:bg-gray-100 transition-colors">
            <Receipt size={24} className="mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium text-gray-700">Reports</p>
          </Link>
        </div>
      </div>
    </div>
  );
}