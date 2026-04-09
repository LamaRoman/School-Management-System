"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, UserCheck, ShieldOff, Shield, KeyRound } from "lucide-react";

interface StaffUser {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");

  const fetchStaff = () => {
    api.get<StaffUser[]>("/staff").then(setStaff).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchStaff(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/staff", form);
      setForm({ email: "", password: "" });
      setShowCreate(false);
      fetchStaff();
    } catch (err: any) {
      setError(err.message || "Failed to create account");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await api.put(`/staff/${id}/toggle`, {});
      fetchStaff();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResetPassword = async (id: string) => {
    if (!resetPw || resetPw.length < 6) { alert("Password must be at least 6 characters"); return; }
    try {
      await api.put(`/staff/${id}/reset-password`, { password: resetPw });
      setResetId(null);
      setResetPw("");
      alert("Password reset successfully");
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-800">Staff Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">Manage accountant login accounts for your school</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} /> Add Accountant
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Create Accountant Account</h2>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              required
              placeholder="Email address"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
            <input
              required
              placeholder="Password (min 6 characters)"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Creating..." : "Create Account"}
            </button>
            <button type="button" onClick={() => { setShowCreate(false); setError(""); }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-gray-400 text-center py-10">Loading...</div>
      ) : staff.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <UserCheck size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No accountant accounts yet.</p>
          <p className="text-sm text-gray-400 mt-1">Click "Add Accountant" to create one.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y">
          {staff.map((user) => (
            <div key={user.id} className="px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${user.isActive ? "bg-green-100" : "bg-gray-100"}`}>
                    <UserCheck size={16} className={user.isActive ? "text-green-600" : "text-gray-400"} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{user.email}</p>
                    <p className="text-xs text-gray-400">
                      Accountant · {user.isActive ? "Active" : "Inactive"} · Created {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setResetId(resetId === user.id ? null : user.id); setResetPw(""); }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Reset password"
                  >
                    <KeyRound size={15} className="text-gray-400" />
                  </button>
                  <button
                    onClick={() => handleToggle(user.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      user.isActive
                        ? "text-red-600 hover:bg-red-50 border border-red-200"
                        : "text-green-600 hover:bg-green-50 border border-green-200"
                    }`}
                  >
                    {user.isActive ? <><ShieldOff size={13} /> Deactivate</> : <><Shield size={13} /> Activate</>}
                  </button>
                </div>
              </div>
              {resetId === user.id && (
                <div className="mt-3 flex items-center gap-2 pl-12">
                  <input
                    type="password"
                    placeholder="New password"
                    value={resetPw}
                    onChange={(e) => setResetPw(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-60"
                  />
                  <button
                    onClick={() => handleResetPassword(user.id)}
                    className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs hover:bg-primary/90"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
