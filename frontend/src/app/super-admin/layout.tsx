"use client";
import ChangePasswordModal from "@/components/ui/ChangePasswordModal";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutGrid,
  School,
  LogOut,
  KeyRound,
} from "lucide-react";

const navItems = [
  { href: "/super-admin", label: "Dashboard", icon: LayoutGrid },
  { href: "/super-admin/schools", label: "Schools", icon: School },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const [showChangePassword, setShowChangePassword] = useState(false);
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user && user.role !== "SUPER_ADMIN") router.replace("/");
  }, [user, loading, router]);

  if (loading || !user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-pulse text-primary font-display text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-surface">
      <aside className="w-64 bg-gray-900 text-white flex flex-col shadow-xl shrink-0">
        <div className="p-5 border-b border-white/10">
          <div>
            <h1 className="font-display font-bold text-sm leading-tight">Zentara <span style={{color: '#e8384f'}}>शिक्षा</span></h1>
            <p className="text-[10px] text-white/50 uppercase tracking-widest mt-1">Super Admin</p>
          </div>
        </div>

        <nav className="flex-1 py-3 px-3 overflow-y-auto space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/super-admin" && pathname.startsWith(item.href));
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
        </nav>

        {/* Brand footer */}
        <div className="px-4 py-2 text-center">
          <p className="text-[9px] text-white/30 tracking-wide">A product of Zentara Labs Pvt Ltd</p>
        </div>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="text-xs min-w-0">
              <p className="text-white/90 font-medium truncate">{user.email}</p>
              <p className="text-white/40 uppercase text-[10px]">Super Admin</p>
            </div>
            <button onClick={() => setShowChangePassword(true)} className="p-2 hover:bg-white/10 rounded-lg" title="Change password">
              <KeyRound size={16} className="text-white/60" />
            </button>
            <button onClick={logout} className="p-2 hover:bg-white/10 rounded-lg transition-all shrink-0" title="Logout">
              <LogOut size={16} className="text-white/60" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto min-w-0">
        <div className="max-w-6xl mx-auto p-6">{children}</div>
      </main>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
