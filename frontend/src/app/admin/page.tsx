"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { getTodayBS, getCurrentBSMonthName, formatBSDateLong } from "@/lib/bsDate";
import Link from "next/link";
import {
  Users, GraduationCap, TrendingUp,
  Award, AlertTriangle, CalendarCheck,
  UserCheck, UserX, X, ChevronRight,
  ChevronDown, ChevronUp,
  Receipt, Megaphone,
  LayoutGrid,
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

// ─── Collapsible List ─────────────────────────────────────────────────────────

function CollapsibleList({ children, limit = 3 }: { children: React.ReactNode[]; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  const items = expanded ? children : children.slice(0, limit);
  const hasMore = children.length > limit;

  return (
    <>
      {items}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary-dark font-medium mt-2 transition-colors"
        >
          {expanded ? (
            <><ChevronUp size={14} /> Show less</>
          ) : (
            <><ChevronDown size={14} /> Show all {children.length}</>
          )}
        </button>
      )}
    </>
  );
}

// ─── Mini Bar ─────────────────────────────────────────────────────────────────

function MiniBar({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-20 text-right shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
        <div
          className="h-full rounded-full flex items-center px-2 transition-all duration-500"
          style={{ width: `${Math.max((value / max) * 100, 4)}%`, background: color }}
        >
          <span className="text-[10px] font-bold text-white whitespace-nowrap">{value}%</span>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [school, setSchool] = useState<any>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"attendance" | "academics">("attendance");

  // Absent panel
  const [panelOpen, setPanelOpen] = useState(false);
  const [absentGroups, setAbsentGroups] = useState<AbsentGroup[]>([]);
  const [absentLoading, setAbsentLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const todayBS = getTodayBS();
  const monthName = getCurrentBSMonthName();

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

  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setPanelOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [panelOpen]);

  useEffect(() => {
    document.body.style.overflow = panelOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [panelOpen]);

  const openAbsentPanel = async () => {
    setPanelOpen(true);
    if (absentGroups.length > 0) return;
    setAbsentLoading(true);
    try {
      const data = await api.get<AbsentGroup[]>(`/analytics/absent-students?date=${encodeURIComponent(todayBS)}`);
      setAbsentGroups(data ?? []);
    } catch { setAbsentGroups([]); }
    finally { setAbsentLoading(false); }
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

  const lowPassSubjects = [...analytics.subjectStats]
    .filter((ss) => ss.totalStudents > 0)
    .sort((a, b) => a.passRate - b.passRate)
    .slice(0, 8);

  const activeClassAverages = analytics.classAverages.filter((c) => c.studentCount > 0);
  const activeGradeAttendance = analytics.attendanceOverview.gradeWise.filter((g) => g.rate > 0);

  const totalAbsentCount = absentGroups.reduce(
    (sum, g) => sum + g.sections.reduce((s2, sec) => s2 + sec.students.length, 0), 0
  );

  return (
    <div>
      {/* ── Overlay ── */}
      {panelOpen && <div className="fixed inset-0 bg-black/30 z-40 transition-opacity" />}

      {/* ── Absent Students Slide Panel ── */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${panelOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-display font-bold text-primary text-base">Absent Today</h2>
            <p className="text-xs text-gray-400 mt-0.5">{formatBSDateLong(todayBS)}</p>
          </div>
          <button onClick={() => setPanelOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <X size={16} />
          </button>
        </div>
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
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">Grade {group.gradeName}</span>
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-xs text-gray-400">{group.sections.reduce((s, sec) => s + sec.students.length, 0)} absent</span>
                  </div>
                  {group.sections.map((section) => (
                    <div key={section.sectionId} className="mb-3">
                      {group.sections.length > 1 && (
                        <p className="text-[11px] text-gray-400 font-medium mb-1 ml-1">Section {section.sectionName}</p>
                      )}
                      <div className="space-y-1">
                        {section.students.map((student) => (
                          <div key={student.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                            <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-bold text-red-500">{student.rollNo ?? "—"}</span>
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
        {!absentLoading && absentGroups.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 shrink-0">
            <p className="text-xs text-gray-400 text-center">
              {totalAbsentCount} student{totalAbsentCount !== 1 ? "s" : ""} absent across {absentGroups.length} grade{absentGroups.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>

      {/* ── Welcome Banner ── */}
      <div className="bg-gradient-to-r from-primary to-primary-light rounded-xl p-5 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-bold">{school?.name || "Dashboard"}</h1>
            {school?.nameNp && <p className="text-sm text-white/70 mt-0.5">{school.nameNp}</p>}
            <p className="text-xs text-white/50 mt-2">{formatBSDateLong(todayBS)} · {monthName}</p>
          </div>
          <div className="text-right hidden sm:flex gap-6">
            <div>
              <p className="text-2xl font-bold">{s.totalStudents}</p>
              <p className="text-xs text-white/60">students</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{s.totalTeachers}</p>
              <p className="text-xs text-white/60">teachers</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { href: "/admin/students", label: "Students", icon: Users, color: "bg-blue-50 text-blue-700" },
          { href: "/admin/teachers", label: "Teachers", icon: GraduationCap, color: "bg-purple-50 text-purple-700" },
          { href: "/admin/fees", label: "Fee Management", icon: Receipt, color: "bg-emerald-50 text-emerald-700" },
          { href: "/admin/notices", label: "Notices", icon: Megaphone, color: "bg-amber-50 text-amber-700" },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="card p-3 flex items-center gap-3 hover:shadow-md hover:border-primary/20 transition-all group"
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${action.color} shrink-0`}>
              <action.icon size={16} />
            </div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-primary transition-colors">{action.label}</span>
            <ChevronRight size={14} className="text-gray-300 ml-auto shrink-0" />
          </Link>
        ))}
      </div>

      {/* ── Tabbed Analytics ── */}
      <div className="mb-6">
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
          {([
            { key: "attendance", label: "Attendance", icon: CalendarCheck },
            { key: "academics", label: "Academics", icon: Award },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-white text-primary shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Attendance Tab ── */}
        {activeTab === "attendance" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Overall Attendance Rate */}
            <div className="card p-5">
              <h3 className="font-display font-bold text-primary text-sm mb-3 flex items-center gap-2">
                <CalendarCheck size={15} /> Overall Attendance
              </h3>
              <div className="flex items-center gap-4 mb-4">
                <div className="relative w-20 h-20">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#f3f4f6" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="14" fill="none"
                      stroke={s.overallAttendanceRate >= 90 ? "#22c55e" : s.overallAttendanceRate >= 75 ? "#f59e0b" : "#ef4444"}
                      strokeWidth="3"
                      strokeDasharray={`${(s.overallAttendanceRate / 100) * 87.96} 87.96`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-gray-800">{s.overallAttendanceRate}%</span>
                  </div>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Present today: <span className="font-semibold text-gray-700">{totalToday > 0 ? s.todayPresent : "—"}</span></p>
                  <p>
                    Absent today:{" "}
                    {totalToday > 0 && s.todayAbsent > 0 ? (
                      <button onClick={openAbsentPanel} className="font-semibold text-red-600 hover:text-red-700 hover:underline transition-colors">
                        {s.todayAbsent} →
                      </button>
                    ) : (
                      <span className="font-semibold text-gray-700">{totalToday > 0 ? s.todayAbsent : "—"}</span>
                    )}
                  </p>
                  <p>Total students: <span className="font-semibold text-gray-700">{s.totalStudents}</span></p>
                </div>
              </div>
            </div>

            {/* Attendance by Grade */}
            {activeGradeAttendance.length > 0 && (
              <div className="card p-5">
                <h3 className="font-display font-bold text-primary text-sm mb-3 flex items-center gap-2">
                  <LayoutGrid size={15} /> Attendance by Grade
                </h3>
                <div className="space-y-2">
                  <CollapsibleList limit={4}>
                    {activeGradeAttendance.map((g) => (
                      <div key={g.gradeName} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-20 text-right shrink-0 truncate">{g.gradeName}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                          <div
                            className="h-full rounded-full flex items-center px-2 transition-all duration-500"
                            style={{
                              width: `${Math.max(g.rate, 4)}%`,
                              background: g.rate >= 90 ? "#22c55e" : g.rate >= 75 ? "#f59e0b" : "#ef4444",
                            }}
                          >
                            <span className="text-[10px] font-bold text-white whitespace-nowrap">{g.rate}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CollapsibleList>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Academics Tab ── */}
        {activeTab === "academics" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Class-wise Average */}
            {activeClassAverages.length > 0 && (
              <div className="card p-5">
                <h3 className="font-display font-bold text-primary text-sm mb-3 flex items-center gap-2">
                  <TrendingUp size={15} /> Class-wise Average %
                </h3>
                <div className="space-y-2">
                  <CollapsibleList limit={4}>
                    {activeClassAverages.map((c) => (
                      <MiniBar key={c.gradeName} label={c.gradeName} value={c.avgPct} color="#1a3a5c" />
                    ))}
                  </CollapsibleList>
                </div>
              </div>
            )}

            {/* Term Comparison */}
            {analytics.termComparison.length > 0 && (
              <div className="card p-5">
                <h3 className="font-display font-bold text-primary text-sm mb-3 flex items-center gap-2">
                  <CalendarCheck size={15} /> Term Comparison
                </h3>
                <div className="space-y-2">
                  {analytics.termComparison
                    .filter((t) => t.studentCount > 0)
                    .map((t) => (
                      <MiniBar key={t.examName} label={t.examName} value={t.avgPercentage} color="#2d5f8a" />
                    ))}
                  <p className="text-[10px] text-gray-400 mt-2">
                    {analytics.termComparison.map((t) =>
                      t.studentCount > 0 ? `${t.examName}: ${t.studentCount} students` : null
                    ).filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
            )}

            {/* Top Performers */}
            {analytics.topPerformers.length > 0 && (
              <div className="card p-5">
                <h3 className="font-display font-bold text-primary text-sm mb-3 flex items-center gap-2">
                  <Award size={15} /> Top Performers
                </h3>
                <div className="space-y-2">
                  <CollapsibleList limit={4}>
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
                  </CollapsibleList>
                </div>
              </div>
            )}

            {/* Subjects Needing Attention */}
            {lowPassSubjects.length > 0 && (
              <div className="card p-5">
                <h3 className="font-display font-bold text-primary text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle size={15} /> Subjects Needing Attention
                </h3>
                <div className="space-y-3">
                  <CollapsibleList limit={3}>
                    {lowPassSubjects.map((ss, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-700 truncate">{ss.subjectName}</span>
                            <span className="text-xs text-gray-400 shrink-0 ml-2">{ss.gradeName}</span>
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
                  </CollapsibleList>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
