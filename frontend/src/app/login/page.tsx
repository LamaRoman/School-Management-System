"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import toast from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { user, loading, login } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [user, loading, router]);
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
  if (loading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-pulse text-primary font-display text-xl">Loading...</div>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4 relative">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-primary">Zentara <span className="text-accent">शिक्षा</span></h1>
          <p className="text-gray-500 text-base font-medium mt-2">A complete digital solution for modern schools</p>
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
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="input pr-10"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full py-3">
              {submitting ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
      {/* Bottom-center branding */}
      <p className="absolute bottom-4 left-0 right-0 text-center text-gray-400 text-xs">A product of Zentara Labs Pvt Ltd</p>
    </div>
  );
}