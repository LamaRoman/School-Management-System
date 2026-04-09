"use client";
import ChangePasswordModal from "@/components/ui/ChangePasswordModal";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, Users, LayoutDashboard, Megaphone, KeyRound } from "lucide-react";

const navItems = [
  { href: "/parent", label: "Dashboard", icon: LayoutDashboard },
  { href: "/parent/notices", label: "Notices", icon: Megaphone },
];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const [showChangePassword, setShowChangePassword] = useState(false);
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user && user.role !== "PARENT") router.replace("/");
  }, [user, loading, router]);

  if (loading || !user || user.role !== "PARENT") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-pulse text-primary font-display text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-primary text-white shadow-md no-print">
        {/* Top bar */}
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users size={22} />
            <span className="font-display font-bold">School Management System</span>
            <span className="text-xs bg-white/10 px-2 py-0.5 rounded">Parent</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/70">{user.email}</span>
            <button onClick={() => setShowChangePassword(true)} className="p-2 hover:bg-white/10 rounded-lg" title="Change password"><KeyRound size={16} className="text-white/60" /></button>
            <button onClick={logout} className="p-2 hover:bg-white/10 rounded-lg">
              <LogOut size={16} />
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-4xl mx-auto px-6 overflow-x-auto">
          <div className="flex gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap ${
                  pathname === item.href
                    ? "bg-surface text-primary"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                <item.icon size={16} />
                {item.label}
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