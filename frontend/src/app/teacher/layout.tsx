"use client";
import ChangePasswordModal from "@/components/ui/ChangePasswordModal";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useMyAssignments } from "@/hooks/useReferenceData";
import { LogOut, GraduationCap, ClipboardList, CalendarCheck,
  ClipboardCheck, Users, CalendarDays, BookOpen, Megaphone, KeyRound, LayoutDashboard } from "lucide-react";

const allowedRoles = ["TEACHER", "ADMIN"];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const [showChangePassword, setShowChangePassword] = useState(false);
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { classTeacherSections } = useMyAssignments();
  const isClassTeacher = classTeacherSections.length > 0;

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user && !allowedRoles.includes(user.role)) router.replace("/");
  }, [user, loading, router]);

  if (loading || !user || !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-pulse text-primary font-display text-xl">Loading...</div>
      </div>
    );
  }

  const tabs = [
    // ── All teachers ──
    { href: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/teacher/marks", label: "Marks Entry", icon: ClipboardList },
    { href: "/teacher/homework", label: "Homework", icon: BookOpen },
    { href: "/teacher/exam-routine", label: "Exam Routine", icon: CalendarDays },
    { href: "/teacher/notices", label: "Notices", icon: Megaphone },
    // ── Class teachers only ──
    // Report Card, Grade Sheet, and Observations are termly/occasional
    // actions now reachable from the Dashboard's class card, so they don't
    // need a permanent tab. Attendance stays — it's a daily action, and
    // detouring through Dashboard every time would add friction to the
    // most frequent thing a class teacher does.
    ...(isClassTeacher
      ? [
          { href: "/teacher/students", label: "My Students", icon: Users },
          { href: "/teacher/attendance", label: "Attendance", icon: CalendarCheck },
          // Results gets a permanent tab despite being termly: it is the
          // hand-off that decides whether families see anything at all, and
          // the running "6 of 8 subjects entered" indicator is meant to be
          // glanceable *during* entry, not found only at the end.
          { href: "/teacher/results", label: "Results", icon: ClipboardCheck },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-primary text-white shadow-md">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GraduationCap size={22} />
            <span className="font-display font-bold">Zentara <span className="text-accent-light">शिक्षा</span></span>
            <span className="text-xs bg-white/10 px-2 py-0.5 rounded">Teacher</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/70">{user.teacher?.name || user.email}</span>
            <button onClick={() => setShowChangePassword(true)} className="p-2 hover:bg-white/10 rounded-lg" title="Change password"><KeyRound size={16} className="text-white/60" /></button>
            <button onClick={logout} className="p-2 hover:bg-white/10 rounded-lg">
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 overflow-x-auto">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap ${
                  pathname.startsWith(tab.href)
                    ? "bg-surface text-primary"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
      </header>
      {children}
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}