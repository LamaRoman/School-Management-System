"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { getTodayBS } from "@/lib/bsDate";
import {
  Users, GraduationCap, TrendingUp,
  Award, AlertTriangle, CalendarCheck,
  UserCheck, UserX, X, ChevronRight,
} from "lucide-react";

interface Analytics {
  summary: {
    totalStudents: number;
    totalTeachers: number;
    todayPresent: number;
    todayAbsent: number;
    overallAttendanceRate: number;
  };
  classAverages: { gradeName: string; avgGpa: number; avgPct: number; studentCount: number }[];
  topPerformers: { rank: number; studentName: string; gradeName: string; sectionName: string; gpa: number; percentage: number }[];
  subjectStats: { subjectName: string; gradeName: string; totalStudents: number; passed: number; failed: number; passRate: number }[];
  attendanceOverview: { overallRate: number; gradeWise: { gradeName: string; rate: number }[] };
  termComparison: { examName: string; avgPercentage: number; studentCount: number }[];
}

interface AbsentGroup {
  gradeId: string;
  gradeName: string;
  sections: {
    sectionId: string;
    sectionName: string;
    students: { id: string; name: string; rollNo: number | null }[];
  }[];
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

  // Absent panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [absentGroups, setAbsentGroups] = useState<AbsentGroup[]>([]);
  const [absentLoading, setAbsentLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const todayBS = getTodayBS();

  useEffect(() => {
    (async () => {
      try {
        const [schoolData, analyticsData] = await Promise.all([
          api.get<any>("/school"),
          api.get<Analytics>(`/analytics/dashboard?todayBS=${encodeURIComponent(todayBS)}`),
        ]);
        setSchool(schoolData);
        setAnalytics(analyticsData);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [panelOpen]);

  // Lock body scroll when panel open
  useEffect(() => {
    document.body.style.overflow = panelOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [panelOpen]);

  const openAbsentPanel = async () => {
    setPanelOpen(true);
    if (absentGroups.length > 0) return; // already loaded
    setAbsentLoading(true);
    try {
      const data = await api.get<AbsentGroup[]>(
        `/analytics/absent-students?date=${encodeURIComponent(todayBS)}`
      );
      setAbsentGroups(data ?? []);
    } catch {
      setAbsentGroups([]);
    } finally {
      setAbsentLoading(false);
    }
  };

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
  const totalToday = s.todayPresent + s.todayAbsent;

  // Find subjects with lowest pass rates
  const lowPassSubjects = [...analytics.subjectStats]
    .filter((ss) => ss.totalStudents > 0)
    .sort((a, b) => a.passRate - b.passRate)
    .slice(0, 5);

  // Filter class averages to only those with students
  const activeClassAverages = analytics.classAverages.filter((c) => c.studentCount > 0);

  // Total absent count for panel badge
  const totalAbsentCount = absentGroups.reduce(
    (sum, g) => sum + g.sections.reduce((s2, sec) => s2 + sec.students.length, 0),
    0
  );

  return (
    <div>
      {/* Overlay */}
      {panelOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 transition-opacity" />
      )}

      {/* Absent Students Slide Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          panelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-display font-bold text-primary text-base">Absent Today</h2>
            <p className="text-xs text-gray-400 mt-0.5">{todayBS}</p>
          </div>
          <button
            onClick={() => setPanelOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Panel Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {absentLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-pulse text-sm text-gray-400">Loading...</div>
            </div>
          ) : absentGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <UserCheck size={24} className="text-emerald-500" />
              </div>
              <p className="text-sm font-medium text-gray-700">No absences today</p>
              <p className="text-xs text-gray-400 mt-1">All attendance marked present</p>
            </div>
          ) : (
            <div className="space-y-5">
              {absentGroups.map((group) => (
                <div key={group.gradeId}>
                  {/* Grade label */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">
                      Grade {group.gradeName}
                    </span>
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-xs text-gray-400">
                      {group.sections.reduce((s, sec) => s + sec.students.length, 0)} absent
                    </span>
                  </div>

                  {group.sections.map((section) => (
                    <div key={section.sectionId} className="mb-3">
                      {/* Section label — only show if multiple sections */}
                      {group.sections.length > 1 && (
                        <p className="text-[11px] text-gray-400 font-medium mb-1 ml-1">
                          Section {section.sectionName}
                        </p>
                      )}
                      <div className="space-y-1">
                        {section.students.map((student) => (
                          <div
                            key={student.id}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-50 border border-red-100"
                          >
                            <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-bold text-red-500">
                                {student.rollNo ?? "—"}
                              </span>
                            </div>
                            <span className="text-sm text-gray-700 font-medium">{student.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel Footer */}
        {!absentLoading && absentGroups.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 shrink-0">
            <p className="text-xs text-gray-400 text-center">
              {totalAbsentCount} student{totalAbsentCount !== 1 ? "s" : ""} absent across{" "}
              {absentGroups.length} grade{absentGroups.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-primary">{school?.name || "Dashboard"}</h1>
        {school?.nameNp && <p className="text-sm text-gray-500 mt-1">{school.nameNp}</p>}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {/* Students */}
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50 text-blue-700">
              <Users size={18} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">{s.totalStudents}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Students</p>
            </div>
          </div>
        </div>

        {/* Teachers */}
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-50 text-purple-700">
              <GraduationCap size={18} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">{s.totalTeachers}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Teachers</p>
            </div>
          </div>
        </div>

        {/* Present Today */}
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-700">
              <UserCheck size={18} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">
                {totalToday > 0 ? s.todayPresent : "—"}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Present Today</p>
            </div>
          </div>
        </div>

        {/* Absent Today — clickable */}
        <button
          onClick={openAbsentPanel}
          className="card p-4 text-left hover:shadow-md hover:border-red-200 transition-all group w-full"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-50 text-red-600 group-hover:bg-red-100 transition-colors">
              <UserX size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold text-gray-800">
                {totalToday > 0 ? s.todayAbsent : "—"}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Absent Today</p>
            </div>
            {totalToday > 0 && s.todayAbsent > 0 && (
              <ChevronRight size={14} className="text-gray-300 group-hover:text-red-400 transition-colors shrink-0" />
            )}
          </div>
        </button>

        {/* Attendance Rate */}
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-rose-50 text-rose-700">
              <CalendarCheck size={18} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">{s.overallAttendanceRate}%</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Attendance</p>
            </div>
          </div>
        </div>
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
              <CalendarCheck size={16} /> Term Comparison (Avg %)
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