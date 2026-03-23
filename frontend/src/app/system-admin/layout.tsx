"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, Shield } from "lucide-react";

export default function SystemAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user && user.role !== "SYSTEM_ADMIN") router.replace("/");
  }, [user, loading, router]);

  if (loading || !user || user.role !== "SYSTEM_ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-pulse text-primary font-display text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-primary text-white shadow-md">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={22} />
            <span className="font-display font-bold">Report Card System</span>
            <span className="text-xs bg-purple-400/30 px-2 py-0.5 rounded">System Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/70">{user.email}</span>
            <button onClick={logout} className="p-2 hover:bg-white/10 rounded-lg">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}