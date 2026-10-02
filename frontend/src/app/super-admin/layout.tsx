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
  CalendarDays,
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { href: "/super-admin", label: "Dashboard", icon: LayoutGrid },
  { href: "/super-admin/schools", label: "Schools", icon: School },
  { href: "/super-admin/calendar", label: "Calendar", icon: CalendarDays },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Close the mobile drawer after navigating.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user && user.role !== "SUPER_ADMIN") router.replace("/");
  }, [user, loading, router]);

  const authorized = !loading && !!user && user.role === "SUPER_ADMIN";

  return (
    <div className="min-h-screen flex bg-surface">
      {navOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-primary text-white flex flex-col shadow-xl shrink-0 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-5 border-b border-white/10 flex items-start justify-between">
          <div>
            <h1 className="font-display font-bold text-sm leading-tight">Zentara <span style={{color: '#e8384f'}}>शिक्षा</span></h1>
            <p className="text-[10px] text-white/50 uppercase tracking-widest mt-1">Super Admin</p>
          </div>
          <button onClick={() => setNavOpen(false)} className="p-1 -m-1 hover:bg-white/10 rounded-lg lg:hidden" aria-label="Close menu">
            <X size={18} />
          </button>
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
              <p className="text-white/90 font-medium truncate">{user?.email}</p>
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
        <div className="sticky top-0 z-20 flex items-center gap-3 bg-primary px-4 py-3 text-white shadow lg:hidden">
          <button onClick={() => setNavOpen(true)} className="p-1 -m-1 hover:bg-white/10 rounded-lg" aria-label="Open menu">
            <Menu size={22} />
          </button>
          <span className="font-display font-bold text-sm">Zentara <span className="text-accent-light">शिक्षा</span></span>
        </div>
        <div className="max-w-6xl mx-auto p-4 sm:p-6">
          {authorized ? children : (
            <div className="flex items-center justify-center py-24">
              <div className="animate-pulse text-primary font-display text-xl">Loading...</div>
            </div>
          )}
        </div>
      </main>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
