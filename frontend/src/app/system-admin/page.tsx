"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Shield, Building, Users, X } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface Stats {
  schools: number;
  users: number;
  students: number;
  teachers: number;
  academicYears: number;
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface School {
  id: string;
  name: string;
  nameNp?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export default function SystemAdminPage() {
  const confirm = useConfirm();
  const [stats, setStats] = useState<Stats | null>(null);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  // Add admin form
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [adminForm, setAdminForm] = useState({ name: "", email: "", password: "" });

  // Add school form
  const [showAddSchool, setShowAddSchool] = useState(false);
  const [schoolForm, setSchoolForm] = useState({ name: "", nameNp: "", address: "", phone: "", email: "" });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [s, a, sc] = await Promise.all([
        api.get<Stats>("/system/stats"),
        api.get<AdminUser[]>("/system/admins"),
        api.get<School[]>("/system/schools"),
      ]);
      setStats(s);
      setAdmins(a);
      setSchools(sc);
    } catch (err: any) {
      toast.error(err.message || "Failed to load system data");
    } finally { setLoading(false); }
  };

  const handleAddAdmin = async () => {
    if (!adminForm.email || !adminForm.password || !adminForm.name) {
      toast.error("All fields are required");
      return;
    }
    try {
      await api.post("/system/admins", adminForm);
      toast.success("School admin created");
      setAdminForm({ name: "", email: "", password: "" });
      setShowAddAdmin(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleAdmin = async (id: string, isActive: boolean) => {
    const confirmed = await confirm({
      title: isActive ? "Deactivate admin" : "Activate admin",
      message: isActive
        ? "This admin will no longer be able to log in."
        : "This admin will be able to log in again.",
      confirmLabel: isActive ? "Deactivate" : "Activate",
      variant: isActive ? "warning" : "info",
    });
    if (!confirmed) return;
    try {
      await api.put(`/system/admins/${id}`, { isActive: !isActive });
      toast.success(isActive ? "Admin deactivated" : "Admin activated");
      fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddSchool = async () => {
    if (!schoolForm.name) {
      toast.error("School name is required");
      return;
    }
    try {
      await api.post("/system/schools", {
        name: schoolForm.name,
        nameNp: schoolForm.nameNp || undefined,
        address: schoolForm.address || undefined,
        phone: schoolForm.phone || undefined,
        email: schoolForm.email || undefined,
      });
      toast.success("School created");
      setSchoolForm({ name: "", nameNp: "", address: "", phone: "", email: "" });
      setShowAddSchool(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-primary">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-primary">System Administration</h1>
          <p className="text-sm text-gray-500 mt-1">Manage schools and organization admins</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-5 gap-4 mb-8">
            {[
              { label: "Schools", value: stats.schools, icon: Building },
              { label: "Users", value: stats.users, icon: Users },
              { label: "Students", value: stats.students, icon: Users },
              { label: "Teachers", value: stats.teachers, icon: Users },
              { label: "Academic Years", value: stats.academicYears, icon: Shield },
            ].map((s) => (
              <div key={s.label} className="card p-4 text-center">
                <s.icon size={20} className="mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold text-primary">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Schools Section */}
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-primary flex items-center gap-2">
              <Building size={18} /> Schools ({schools.length})
            </h2>
            <button onClick={() => { setShowAddSchool(!showAddSchool); setShowAddAdmin(false); }} className="btn-primary text-xs">
              <Plus size={14} /> Add School
            </button>
          </div>

          {showAddSchool && (
            <div className="bg-surface p-4 rounded-lg mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-primary">New School</h3>
                <button onClick={() => setShowAddSchool(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Name (English) *</label>
                  <input className="input" value={schoolForm.name} onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })} placeholder="ABC School" />
                </div>
                <div>
                  <label className="label">Name (Nepali)</label>
                  <input className="input" value={schoolForm.nameNp} onChange={(e) => setSchoolForm({ ...schoolForm, nameNp: e.target.value })} placeholder="एबीसी विद्यालय" />
                </div>
                <div>
                  <label className="label">Address</label>
                  <input className="input" value={schoolForm.address} onChange={(e) => setSchoolForm({ ...schoolForm, address: e.target.value })} />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={schoolForm.phone} onChange={(e) => setSchoolForm({ ...schoolForm, phone: e.target.value })} />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" value={schoolForm.email} onChange={(e) => setSchoolForm({ ...schoolForm, email: e.target.value })} />
                </div>
                <div className="flex items-end">
                  <button onClick={handleAddSchool} className="btn-primary text-xs">Create School</button>
                </div>
              </div>
            </div>
          )}

          {schools.length === 0 ? (
            <p className="text-sm text-gray-400">No schools yet.</p>
          ) : (
            <div className="space-y-2">
              {schools.map((school) => (
                <div key={school.id} className="flex items-center justify-between p-3 bg-surface rounded-lg">
                  <div>
                    <p className="font-medium text-primary">{school.name}</p>
                    {school.nameNp && <p className="text-xs text-gray-500">{school.nameNp}</p>}
                    <p className="text-xs text-gray-400">{[school.address, school.phone, school.email].filter(Boolean).join(" • ")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admins Section */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-primary flex items-center gap-2">
              <Shield size={18} /> Organization Admins ({admins.length})
            </h2>
            <button onClick={() => { setShowAddAdmin(!showAddAdmin); setShowAddSchool(false); }} className="btn-primary text-xs">
              <Plus size={14} /> Add Admin
            </button>
          </div>

          {showAddAdmin && (
            <div className="bg-surface p-4 rounded-lg mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-primary">New School Admin</h3>
                <button onClick={() => setShowAddAdmin(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Full Name *</label>
                  <input className="input" value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} placeholder="Ram Sharma" />
                </div>
                <div>
                  <label className="label">Email *</label>
                  <input className="input" type="email" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} placeholder="admin@school.edu.np" />
                </div>
                <div>
                  <label className="label">Password *</label>
                  <input className="input" type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} placeholder="Min 6 characters" />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button onClick={handleAddAdmin} className="btn-primary text-xs">Create Admin</button>
              </div>
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="text-left px-4 py-2">Email</th>
                <th className="text-left px-4 py-2">Role</th>
                <th className="text-center px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.id} className="border-t border-gray-100 hover:bg-surface transition-colors">
                  <td className="px-4 py-2 font-medium text-primary">{admin.email}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${admin.role === "SYSTEM_ADMIN" ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"}`}>
                      {admin.role === "SYSTEM_ADMIN" ? "System Admin" : "School Admin"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${admin.isActive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                      {admin.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {admin.role !== "SYSTEM_ADMIN" && (
                      <button onClick={() => handleToggleAdmin(admin.id, admin.isActive)}
                        className="text-xs text-primary hover:underline">
                        {admin.isActive ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}