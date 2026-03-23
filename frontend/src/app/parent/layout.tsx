"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, Users } from "lucide-react";

const navItems = [
  { href: "/parent", label: "Dashboard" },
  { href: "/parent/notices", label: "Notices" },
];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
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
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users size={22} />
            <span className="font-display font-bold">Report Card System</span>
            <span className="text-xs bg-white/10 px-2 py-0.5 rounded">Parent</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/70">{user.email}</span>
            <button onClick={logout} className="p-2 hover:bg-white/10 rounded-lg"><LogOut size={16} /></button>
          </div>
        </div>
      </header>
      <nav className="bg-white border-b no-print">
        <div className="max-w-4xl mx-auto px-6 flex gap-1">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`px-4 py-2 text-sm font-medium transition-all ${
                pathname === item.href
                  ? "text-primary border-b-2 border-primary"
                  : "text-gray-500 hover:text-primary hover:bg-surface"
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>
      {children}
    </div>
  );
}