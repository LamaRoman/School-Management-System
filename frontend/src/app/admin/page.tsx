"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import {
  CalendarDays, Users, BookOpen, Layers, GraduationCap, TrendingUp,
  Award, AlertTriangle, CalendarCheck,
} from "lucide-react";

interface Analytics {
  summary: {
    totalStudents: number;
    totalTeachers: number;
    totalGrades: number;
    totalSubjects: number;
    overallAttendanceRate: number;
  };
  classAverages: { gradeName: string; avgGpa: number; avgPct: number; studentCount: number }[];
  topPerformers: { rank: number; studentName: string; gradeName: string; sectionName: string; gpa: number; percentage: number }[];
  subjectStats: { subjectName: string; gradeName: string; totalStudents: number; passed: number; failed: number; passRate: number }[];
  attendanceOverview: { overallRate: number; gradeWise: { gradeName: string; rate: number }[] };
  termComparison: { examName: string; avgPercentage: number; studentCount: number }[];
}

function BarChart({ data, valueKey, labelKey, color, maxValue }: {
  data: any[]; valueKey: string; labelKey: string; color: string; maxValue?: number;
}) {
  const max = maxValue || Math.max(...data.map((d) => d[valueKey] || 0), 1);
  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-16 text-right shrink-0">{item[labelKey]}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
            <div
              className="h-full rounded-full flex items-center px-2 transition-all duration-500"
              style={{ width: `${Math.max((item[valueKey] / max) * 100, 2)}%`, background: color }}
            >
              <span className="text-[10px] font-bold text-white">{item[valueKey]}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [school, setSchool] = useState<any>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [schoolData, analyticsData] = await Promise.all([
          api.get<any>("/school"),
          api.get<Analytics>("/analytics/dashboard"),
        ]);
        setSchool(schoolData);
        setAnalytics(analyticsData);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-primary font-display text-xl">Loading dashboard...</div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div>
        <h1 className="text-2xl font-display font-bold text-primary mb-4">{school?.name || "Dashboard"}</h1>
        <div className="card p-8 text-center text-gray-400">No data available. Set up academic year and add students first.</div>
      </div>
    );
  }

  const s = analytics.summary;

  // Find subjects with lowest pass rates
  const lowPassSubjects = [...analytics.subjectStats]
    .filter((ss) => ss.totalStudents > 0)
    .sort((a, b) => a.passRate - b.passRate)
    .slice(0, 5);

  // Filter class averages to only those with students
  const activeClassAverages = analytics.classAverages.filter((c) => c.studentCount > 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-primary">{school?.name || "Dashboard"}</h1>
        {school?.nameNp && <p className="text-sm text-gray-500 mt-1">{school.nameNp}</p>}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {[
          { label: "Students", value: s.totalStudents, icon: Users, color: "bg-blue-50 text-blue-700" },
          { label: "Teachers", value: s.totalTeachers, icon: GraduationCap, color: "bg-purple-50 text-purple-700" },
          { label: "Grades", value: s.totalGrades, icon: Layers, color: "bg-emerald-50 text-emerald-700" },
          { label: "Subjects", value: s.totalSubjects, icon: BookOpen, color: "bg-amber-50 text-amber-700" },
          { label: "Attendance", value: `${s.overallAttendanceRate}%`, icon: CalendarCheck, color: "bg-rose-50 text-rose-700" },
        ].map((stat) => (
          <div key={stat.label} className="card p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                <stat.icon size={18} />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-800">{stat.value}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Class-wise Average Performance */}
        {activeClassAverages.length > 0 && (
          <div className="card p-5">
            <h3 className="font-display font-bold text-primary mb-4 flex items-center gap-2">
              <TrendingUp size={16} /> Class-wise Average Percentage
            </h3>
            <BarChart
              data={activeClassAverages}
              valueKey="avgPct"
              labelKey="gradeName"
              color="#1a3a5c"
              maxValue={100}
            />
          </div>
        )}

        {/* Term Comparison */}
        {analytics.termComparison.length > 0 && (
          <div className="card p-5">
            <h3 className="font-display font-bold text-primary mb-4 flex items-center gap-2">
              <CalendarDays size={16} /> Term Comparison (Avg %)
            </h3>
            <BarChart
              data={analytics.termComparison.filter((t) => t.studentCount > 0)}
              valueKey="avgPercentage"
              labelKey="examName"
              color="#2d5f8a"
              maxValue={100}
            />
            <div className="mt-3 text-xs text-gray-400">
              {analytics.termComparison.map((t) =>
                t.studentCount > 0 ? `${t.examName}: ${t.studentCount} students` : null
              ).filter(Boolean).join(" · ")}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top Performers */}
        {analytics.topPerformers.length > 0 && (
          <div className="card p-5">
            <h3 className="font-display font-bold text-primary mb-4 flex items-center gap-2">
              <Award size={16} /> Top Performers
            </h3>
            <div className="space-y-2">
              {analytics.topPerformers.map((tp) => (
                <div key={tp.rank} className="flex items-center gap-3 text-sm">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    tp.rank <= 3 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {tp.rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{tp.studentName}</p>
                    <p className="text-[10px] text-gray-400">{tp.gradeName} - {tp.sectionName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-primary">{tp.percentage}%</p>
                    <p className="text-[10px] text-gray-400">GPA {tp.gpa}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Subjects Needing Attention */}
        {lowPassSubjects.length > 0 && (
          <div className="card p-5">
            <h3 className="font-display font-bold text-primary mb-4 flex items-center gap-2">
              <AlertTriangle size={16} /> Subjects Needing Attention
            </h3>
            <div className="space-y-3">
              {lowPassSubjects.map((ss, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700 truncate">{ss.subjectName}</span>
                      <span className="text-xs text-gray-400">{ss.gradeName}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${ss.passRate}%`,
                          background: ss.passRate >= 80 ? "#22c55e" : ss.passRate >= 50 ? "#f59e0b" : "#ef4444",
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-gray-400">{ss.passed} passed · {ss.failed} failed</span>
                      <span className={`text-[10px] font-bold ${
                        ss.passRate >= 80 ? "text-emerald-600" : ss.passRate >= 50 ? "text-amber-600" : "text-red-600"
                      }`}>
                        {ss.passRate}% pass rate
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Attendance by Grade */}
      {analytics.attendanceOverview.gradeWise.some((g) => g.rate > 0) && (
        <div className="card p-5">
          <h3 className="font-display font-bold text-primary mb-4 flex items-center gap-2">
            <CalendarCheck size={16} /> Attendance by Grade
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {analytics.attendanceOverview.gradeWise
              .filter((g) => g.rate > 0)
              .map((g) => (
                <div key={g.gradeName} className="text-center p-3 rounded-lg bg-gray-50">
                  <p className="text-xs text-gray-500 mb-1">{g.gradeName}</p>
                  <p className={`text-lg font-bold ${
                    g.rate >= 90 ? "text-emerald-600" : g.rate >= 75 ? "text-amber-600" : "text-red-600"
                  }`}>
                    {g.rate}%
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}