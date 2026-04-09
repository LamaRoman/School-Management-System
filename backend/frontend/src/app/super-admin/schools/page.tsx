"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import { Plus, School, Users, GraduationCap, ChevronRight } from "lucide-react";

interface SchoolItem {
  id: string;
  name: string;
  nameNp?: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  studentCount: number;
  _count: { users: number; teachers: number; academicYears: number };
}

export default function SchoolsPage() {
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", nameNp: "", address: "", phone: "", email: "", estdYear: "", motto: "",
    adminEmail: "", adminPassword: "",
  });

  const fetchSchools = () => {
    api.get<SchoolItem[]>("/super-admin/schools").then(setSchools).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchSchools(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await api.post("/super-admin/schools", form);
      setForm({ name: "", nameNp: "", address: "", phone: "", email: "", estdYear: "", motto: "", adminEmail: "", adminPassword: "" });
      setShowCreate(false);
      fetchSchools();
    } catch (err: any) {
      setError(err.message || "Failed to create school");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-gray-800">Schools</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} /> Add School
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 space-y-4">
          <h2 className="font-semibold text-gray-800 mb-2">Create New School</h2>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input required placeholder="School Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Name (Nepali)" value={form.nameNp} onChange={(e) => setForm({ ...form, nameNp: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Established Year" value={form.estdYear} onChange={(e) => setForm({ ...form, estdYear: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <hr className="my-2" />
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Admin Account</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input required placeholder="Admin Email *" type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <input required placeholder="Admin Password *" type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={creating} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50">
              {creating ? "Creating..." : "Create School"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-gray-400 text-center py-10">Loading schools...</div>
      ) : schools.length === 0 ? (
        <div className="text-gray-400 text-center py-10">No schools yet. Create one above.</div>
      ) : (
        <div className="space-y-3">
          {schools.map((school) => (
            <Link
              key={school.id}
              href={`/super-admin/schools/${school.id}`}
              className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${school.isActive ? "bg-blue-500" : "bg-gray-400"}`}>
                  <School size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{school.name}</h3>
                  <p className="text-xs text-gray-500">{school.address || "No address"}</p>
                  {!school.isActive && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Inactive</span>}
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <GraduationCap size={14} /> {school.studentCount}
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Users size={14} /> {school._count.users}
                </div>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
