"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Plus, UserCheck, Trash2 } from "lucide-react";
import Link from "next/link";

interface SchoolDetail {
  id: string;
  name: string;
  nameNp?: string;
  address?: string;
  phone?: string;
  email?: string;
  estdYear?: string;
  motto?: string;
  isActive: boolean;
  _count: { users: number; teachers: number; academicYears: number };
}

interface Admin {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export default function SchoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [adminForm, setAdminForm] = useState({ email: "", password: "", role: "ADMIN" as "ADMIN" | "ACCOUNTANT" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", address: "", phone: "", email: "" });

  const fetchData = async () => {
    try {
      const [s, a] = await Promise.all([
        api.get<SchoolDetail>(`/super-admin/schools/${id}`),
        api.get<Admin[]>(`/super-admin/schools/${id}/admins`),
      ]);
      setSchool(s);
      setAdmins(a);
      setEditForm({ name: s.name, address: s.address || "", phone: s.phone || "", email: s.email || "" });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post(`/super-admin/schools/${id}/admins`, adminForm);
      setAdminForm({ email: "", password: "", role: "ADMIN" });
      setShowAddAdmin(false);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!school) return;
    const msg = school.isActive
      ? "Deactivate this school? All users will be locked out."
      : "Reactivate this school?";
    if (!confirm(msg)) return;
    try {
      if (school.isActive) {
        await api.delete(`/super-admin/schools/${id}`);
      } else {
        await api.put(`/super-admin/schools/${id}`, { isActive: true });
      }
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await api.put(`/super-admin/schools/${id}`, editForm);
      setEditing(false);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-gray-400 text-center py-20">Loading...</div>;
  if (!school) return <div className="text-red-500 text-center py-20">School not found</div>;

  return (
    <div>
      <Link href="/super-admin/schools" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={14} /> Back to Schools
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-800">{school.name}</h1>
            {school.nameNp && <p className="text-gray-500">{school.nameNp}</p>}
            <div className="flex gap-4 mt-2 text-sm text-gray-500">
              {school.address && <span>{school.address}</span>}
              {school.phone && <span>{school.phone}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(!editing)} className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              {editing ? "Cancel" : "Edit"}
            </button>
            <button
              onClick={handleToggleActive}
              className={`px-3 py-1.5 rounded-lg text-sm text-white ${school.isActive ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}`}
            >
              {school.isActive ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        </div>

        {editing && (
          <div className="border-t pt-4 mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} placeholder="Address" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Phone" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="Email" className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <button onClick={handleSaveEdit} disabled={saving} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}

        <div className="flex gap-6 mt-4 text-sm">
          <span className="text-gray-500">Users: <strong className="text-gray-800">{school._count.users}</strong></span>
          <span className="text-gray-500">Teachers: <strong className="text-gray-800">{school._count.teachers}</strong></span>
          <span className="text-gray-500">Academic Years: <strong className="text-gray-800">{school._count.academicYears}</strong></span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${school.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
            {school.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* Admins Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Admins & Accountants</h2>
          <button onClick={() => setShowAddAdmin(!showAddAdmin)} className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800">
            <Plus size={14} /> Add
          </button>
        </div>

        {showAddAdmin && (
          <form onSubmit={handleAddAdmin} className="border rounded-lg p-4 mb-4 space-y-3 bg-gray-50">
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input required placeholder="Email" type="email" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
              <input required placeholder="Password" type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
              <select value={adminForm.role} onChange={(e) => setAdminForm({ ...adminForm, role: e.target.value as "ADMIN" | "ACCOUNTANT" })} className="border rounded-lg px-3 py-2 text-sm">
                <option value="ADMIN">Admin</option>
                <option value="ACCOUNTANT">Accountant</option>
              </select>
            </div>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-50">
              {saving ? "Adding..." : "Add User"}
            </button>
          </form>
        )}

        {admins.length === 0 ? (
          <p className="text-gray-400 text-sm">No admins found.</p>
        ) : (
          <div className="space-y-2">
            {admins.map((admin) => (
              <div key={admin.id} className="flex items-center justify-between border rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <UserCheck size={16} className="text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{admin.email}</p>
                    <p className="text-xs text-gray-400">{admin.role} · {admin.isActive ? "Active" : "Inactive"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
