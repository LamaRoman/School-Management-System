"use client";
import ChangePasswordModal from "@/components/ui/ChangePasswordModal";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import {
  CalendarDays,
  Layers,
  LayoutGrid,
  BookOpen,
  ClipboardList,
  Settings,
  Users,
  LogOut,
  GraduationCap,
  UserCheck,
  Table,
  Receipt,
  Megaphone,
  UserPlus,
  Users2,
  KeyRound,
} from "lucide-react";

const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutGrid },
    ],
  },
  {
    label: "Academic",
    items: [
      { href: "/admin/academic-years", label: "Academic Years", icon: CalendarDays },
      { href: "/admin/grades", label: "Grades & Sections", icon: Layers },
      { href: "/admin/subjects", label: "Subjects", icon: BookOpen },
      { href: "/admin/exam-types", label: "Exam Types", icon: ClipboardList },
      { href: "/admin/grading-policy", label: "Grading Policy", icon: Settings },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/students", label: "Students", icon: Users },
      { href: "/admin/teachers", label: "Teachers", icon: UserCheck },
      { href: "/admin/teacher-assignments", label: "Teacher Assignments", icon: UserCheck },
      { href: "/admin/admissions", label: "Admissions", icon: UserPlus },
      { href: "/admin/parents", label: "Parents", icon: Users2 },
    ],
  },
  {
    label: "Results",
    items: [
      { href: "/admin/observations", label: "Observations", icon: ClipboardList },
      { href: "/admin/grade-sheet", label: "Grade Sheet", icon: Table },
      { href: "/admin/report-settings", label: "Report Card Settings", icon: Settings },
      { href: "/admin/promotion", label: "Promotion", icon: GraduationCap },
    ],
  },
  {
    label: "Exams",
    items: [
      { href: "/admin/exam-routine", label: "Exam Routine", icon: CalendarDays },
      { href: "/admin/seating", label: "Exam Seating", icon: LayoutGrid },
    ],
  },
  {
    label: "Finance & Comms",
    items: [
      { href: "/admin/fees", label: "Fee Management", icon: Receipt },
      { href: "/admin/notices", label: "Notice Board", icon: Megaphone },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [showChangePassword, setShowChangePassword] = useState(false);
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user && user.role !== "ADMIN") router.replace("/");
  }, [user, loading, router]);

  if (loading || !user || user.role !== "ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-pulse text-primary font-display text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-surface">
      <aside className="w-64 bg-primary text-white flex flex-col shadow-xl shrink-0">
        {/* Logo */}
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <GraduationCap size={22} className="text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-sm leading-tight">Report Card</h1>
              <p className="text-[10px] text-white/50 uppercase tracking-widest">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Grouped nav */}
        <nav className="flex-1 py-3 px-3 overflow-y-auto space-y-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest px-3 mb-1">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/admin" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                        isActive
                          ? "bg-white/15 text-white font-semibold"
                          : "text-white/65 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <item.icon size={16} className="shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="text-xs min-w-0">
              <p className="text-white/90 font-medium truncate">{user.email}</p>
              <p className="text-white/40 uppercase text-[10px]">{user.role}</p>
            </div>
            <button onClick={() => setShowChangePassword(true)} className="p-2 hover:bg-white/10 rounded-lg" title="Change password"><KeyRound size={16} className="text-white/60" /></button>
            <button
              onClick={logout}
              className="p-2 hover:bg-white/10 rounded-lg transition-all shrink-0"
              title="Logout"
            >
              <LogOut size={16} className="text-white/60" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto min-w-0">
        <div className="max-w-6xl mx-auto p-6">
          {children}
        </div>
      </main>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}