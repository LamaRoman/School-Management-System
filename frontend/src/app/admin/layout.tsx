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
  ChevronDown,
  ChevronRight,
  Wrench,
  Eye,
} from "lucide-react";

interface NavItem { href: string; label: string; icon: any }
interface NavGroup { label: string; items: NavItem[]; collapsible?: boolean }

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutGrid },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/students", label: "Students", icon: Users },
      { href: "/admin/staff", label: "Staff Accounts", icon: KeyRound },
      { href: "/admin/admissions", label: "Admissions", icon: UserPlus },
      { href: "/admin/parents", label: "Parents", icon: Users2 },
    ],
  },
  {
    label: "Academics",
    items: [
      { href: "/admin/grades", label: "Grades & Sections", icon: Layers },
      { href: "/admin/subjects", label: "Subjects", icon: BookOpen },
      { href: "/admin/exam-routine", label: "Exam Routine", icon: CalendarDays },
      { href: "/admin/seating", label: "Exam Seating", icon: LayoutGrid },
    ],
  },
  {
    label: "Results",
    items: [
      { href: "/admin/grade-sheet", label: "Grade Sheet", icon: Table },
      { href: "/admin/observations", label: "Observations", icon: Eye },
      { href: "/admin/promotion", label: "Promotion", icon: GraduationCap },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/admin/fees", label: "Fee Management", icon: Receipt },
      { href: "/admin/notices", label: "Notice Board", icon: Megaphone },
    ],
  },
  {
    label: "Setup",
    collapsible: true,
    items: [
      { href: "/admin/academic-years", label: "Academic Years", icon: CalendarDays },
      { href: "/admin/teacher-assignments", label: "Teacher Assignments", icon: UserCheck },
      { href: "/admin/exam-types", label: "Exam Types", icon: ClipboardList },
      { href: "/admin/grading-policy", label: "Grading Policy", icon: Settings },
      { href: "/admin/report-settings", label: "Report Card Settings", icon: Settings },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Auto-expand Setup if a setup page is active
  const setupHrefs = navGroups.find((g) => g.collapsible)?.items.map((i) => i.href) || [];
  const isSetupActive = setupHrefs.some((href) => pathname === href || pathname.startsWith(href + "/"));

  useEffect(() => {
    if (isSetupActive) setSetupOpen(true);
  }, [isSetupActive]);

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

        {/* Nav */}
        <nav className="flex-1 py-3 px-3 overflow-y-auto space-y-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              {group.collapsible ? (
                <button
                  onClick={() => setSetupOpen(!setupOpen)}
                  className="flex items-center justify-between w-full px-3 mb-1 group"
                >
                  <div className="flex items-center gap-1.5">
                    <Wrench size={10} className="text-white/30" />
                    <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest group-hover:text-white/50 transition-colors">
                      {group.label}
                    </p>
                  </div>
                  {setupOpen ? (
                    <ChevronDown size={12} className="text-white/30" />
                  ) : (
                    <ChevronRight size={12} className="text-white/30" />
                  )}
                </button>
              ) : (
                <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest px-3 mb-1">
                  {group.label}
                </p>
              )}

              {(!group.collapsible || setupOpen) && (
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
              )}
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
