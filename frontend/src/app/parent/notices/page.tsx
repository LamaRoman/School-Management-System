"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Pin } from "lucide-react";

interface Notice {
  id: string;
  title: string;
  content: string;
  type: string;
  priority: string;
  publishDate: string;
  isPinned: boolean;
  grade?: { name: string };
}

const typeColors: Record<string, string> = {
  GENERAL: "bg-blue-50 text-blue-700",
  EXAM: "bg-purple-50 text-purple-700",
  EVENT: "bg-emerald-50 text-emerald-700",
  HOLIDAY: "bg-amber-50 text-amber-700",
  FEE: "bg-red-50 text-red-700",
};

const priorityBorder: Record<string, string> = {
  IMPORTANT: "border-l-4 border-l-amber-400",
  URGENT: "border-l-4 border-l-red-500",
};

export default function ParentNoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<Notice[]>("/notices");
        setNotices(data);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-primary">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-display font-bold text-primary mb-6">Notices</h1>

        {notices.length === 0 && (
          <div className="card p-8 text-center text-gray-400">No notices at this time.</div>
        )}

        <div className="space-y-3">
          {notices.map((notice) => (
            <div key={notice.id} className={`card p-4 ${priorityBorder[notice.priority] || ""}`}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {notice.isPinned && <Pin size={14} className="text-primary" />}
                <h3 className="font-semibold text-primary">{notice.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[notice.type] || "bg-gray-100 text-gray-600"}`}>
                  {notice.type}
                </span>
                {notice.priority === "URGENT" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">URGENT</span>
                )}
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">{notice.content}</p>
              <div className="flex gap-4 text-xs text-gray-400">
                <span>{notice.publishDate}</span>
                {notice.grade && <span>{notice.grade.name}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}