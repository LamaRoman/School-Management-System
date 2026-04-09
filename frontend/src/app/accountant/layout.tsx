"use client";
import ChangePasswordModal from "@/components/ui/ChangePasswordModal";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import {
  LogOut,
  Landmark,
  UserPlus,
  Receipt,
  Search,
  Megaphone,
  LayoutDashboard,
  FileBarChart,
  KeyRound,
} from "lucide-react";

const tabs = [
  { href: "/accountant", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accountant/admissions", label: "Admissions", icon: UserPlus },
  { href: "/accountant/fees", label: "Fee Collection", icon: Receipt },
  { href: "/accountant/students", label: "Student Search", icon: Search },
  { href: "/accountant/reports", label: "Reports", icon: FileBarChart },
  { href: "/accountant/notices", label: "Notices", icon: Megaphone },
];

const allowedRoles = ["ACCOUNTANT", "ADMIN"];

export default function AccountantLayout({ children }: { children: React.ReactNode }) {
  const [showChangePassword, setShowChangePassword] = useState(false);
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

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

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-primary text-white shadow-md">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Landmark size={22} />
            <span className="font-display font-bold">School Management System</span>
            <span className="text-xs bg-amber-400/30 px-2 py-0.5 rounded">Accountant</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/70">{user.email}</span>
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
                  tab.href === "/accountant"
                    ? pathname === "/accountant"
                      ? "bg-surface text-primary"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                    : pathname.startsWith(tab.href)
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