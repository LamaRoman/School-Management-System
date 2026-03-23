"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import toast from "react-hot-toast";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success("Welcome!");
      router.push("/");
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-alt px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-white font-display text-2xl font-bold mb-4 shadow-lg">
            श्री
          </div>
          <h1 className="font-display text-2xl font-bold text-primary">Report Card System</h1>
          <p className="text-gray-500 text-sm mt-1">Nepali School Management</p>
        </div>

        {/* Form */}
        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                placeholder="admin@school.edu.np"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full py-3">
              {submitting ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-6 p-3 bg-surface rounded-lg text-xs text-gray-500">
            <p className="font-semibold mb-1">Default Admin:</p>
            <p>Email: admin@school.edu.np</p>
            <p>Password: admin123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
