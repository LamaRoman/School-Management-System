"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { BookOpen } from "lucide-react";

interface Homework {
  id: string;
  title: string;
  description?: string;
  assignedDate: string;
  dueDate?: string;
  subject: { name: string };
  section: { name: string; grade: { name: string } };
  assignedBy: { email: string };
}

export default function StudentHomeworkPage() {
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<Homework[]>("/homework");
        setHomework(data);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-primary">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <BookOpen size={22} className="text-primary" />
          <h1 className="text-2xl font-display font-bold text-primary">Homework</h1>
        </div>

        {homework.length === 0 && (
          <div className="card p-8 text-center text-gray-400">No homework assigned at this time.</div>
        )}

        <div className="space-y-3">
          {homework.map((hw) => (
            <div key={hw.id} className={`card p-4 ${hw.dueDate ? "border-l-4 border-l-red-400" : ""}`}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold text-primary">{hw.title}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{hw.subject.name}</span>
              </div>
              {hw.description && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{hw.description}</p>
              )}
              <div className="flex gap-4 text-xs text-gray-400">
                <span>Assigned: {hw.assignedDate}</span>
                {hw.dueDate && <span className="text-red-500 font-semibold">Due: {hw.dueDate}</span>}
                <span>By: {hw.assignedBy.email}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}