"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { School, Users, GraduationCap, Building } from "lucide-react";

interface Stats {
  totalSchools: number;
  activeSchools: number;
  totalUsers: number;
  totalStudents: number;
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Stats>("/super-admin/stats").then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="animate-pulse text-gray-400 text-center py-20">Loading dashboard...</div>;
  }

  const cards = [
    { label: "Total Schools", value: stats?.totalSchools ?? 0, icon: Building, color: "bg-blue-500" },
    { label: "Active Schools", value: stats?.activeSchools ?? 0, icon: School, color: "bg-green-500" },
    { label: "Total Users", value: stats?.totalUsers ?? 0, icon: Users, color: "bg-purple-500" },
    { label: "Total Students", value: stats?.totalStudents ?? 0, icon: GraduationCap, color: "bg-amber-500" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-gray-800 mb-6">Super Admin Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${card.color} flex items-center justify-center`}>
                <card.icon size={22} className="text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{card.value}</p>
                <p className="text-xs text-gray-500">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
