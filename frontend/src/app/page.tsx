"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (user.role === "ADMIN") {
      router.replace("/admin");
    } else if (user.role === "ACCOUNTANT") {
      router.replace("/accountant");
    } else if (user.role === "TEACHER") {
      router.replace("/teacher/marks");
    } else if (user.role === "PARENT") {
      router.replace("/parent");
    } else {
      router.replace("/student/report");
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="animate-pulse text-primary font-display text-xl">Loading...</div>
    </div>
  );
}