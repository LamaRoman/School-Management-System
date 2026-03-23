"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Save } from "lucide-react";

interface ExamType { id: string; name: string; displayOrder: number }
interface Grade { id: string; name: string; displayOrder: number }
interface Policy { id: string; examTypeId: string; weightagePercent: number; examType: { name: string } }

export default function GradingPolicyPage() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [policies, setPolicies] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const year = await api.get<any>("/academic-years/active");
        if (year) {
          const [g, et] = await Promise.all([
            api.get<Grade[]>(`/grades?academicYearId=${year.id}`),
            api.get<ExamType[]>(`/exam-types?academicYearId=${year.id}`),
          ]);
          setGrades(g);
          setExamTypes(et);
          if (g.length > 0) setSelectedGrade(g[0].id);
        }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!selectedGrade) return;
    api.get<Policy[]>(`/grading-policy?gradeId=${selectedGrade}`).then((p) => {
      const map: Record<string, number> = {};
      p.forEach((pol) => { map[pol.examTypeId] = pol.weightagePercent; });
      setPolicies(map);
    }).catch(() => {});
  }, [selectedGrade]);

  const total = Object.values(policies).reduce((a, b) => a + b, 0);

  const handleSave = async () => {
    if (Math.abs(total - 100) > 0.01) return toast.error("Weightages must total 100%");
    setSaving(true);
    try {
      await api.post("/grading-policy/bulk", {
        gradeId: selectedGrade,
        policies: Object.entries(policies).map(([examTypeId, weightagePercent]) => ({ examTypeId, weightagePercent })),
      });
      toast.success("Grading policy saved");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const applyToAll = async () => {
    if (Math.abs(total - 100) > 0.01) return toast.error("Fix current grade first — total must be 100%");
    if (!confirm("Apply this weightage to ALL grades?")) return;
    try {
      for (const g of grades) {
        await api.post("/grading-policy/bulk", {
          gradeId: g.id,
          policies: Object.entries(policies).map(([examTypeId, weightagePercent]) => ({ examTypeId, weightagePercent })),
        });
      }
      toast.success("Applied to all grades");
    } catch (err: any) { toast.error(err.message); }
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-primary">Grading Policy</h1>
        <p className="text-sm text-gray-500 mt-1">Set weightage for each exam type per grade (must total 100%)</p>
      </div>

      {/* Grade selector */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {grades.map((g) => (
          <button key={g.id} onClick={() => setSelectedGrade(g.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedGrade === g.id ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
            {g.name}
          </button>
        ))}
      </div>

      {examTypes.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">Create exam types first</div>
      ) : (
        <div className="card p-6">
          <div className="space-y-4 max-w-md">
            {examTypes.map((et) => (
              <div key={et.id} className="flex items-center gap-4">
                <label className="w-40 text-sm font-medium text-gray-700">{et.name}</label>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="number"
                    className="input w-24 text-center"
                    min={0} max={100} step={5}
                    value={policies[et.id] || 0}
                    onChange={(e) => setPolicies({ ...policies, [et.id]: parseFloat(e.target.value) || 0 })}
                  />
                  <span className="text-sm text-gray-400">%</span>
                </div>
              </div>
            ))}

            <div className="border-t border-gray-200 pt-4 flex items-center gap-4">
              <span className="w-40 text-sm font-bold text-gray-700">Total</span>
              <span className={`text-lg font-bold ${Math.abs(total - 100) < 0.01 ? "text-emerald-600" : "text-red-600"}`}>
                {total}%
              </span>
              {Math.abs(total - 100) > 0.01 && (
                <span className="text-xs text-red-500">Must be 100%</span>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving || Math.abs(total - 100) > 0.01} className="btn-primary">
                <Save size={16} /> {saving ? "Saving..." : "Save Policy"}
              </button>
              <button onClick={applyToAll} disabled={Math.abs(total - 100) > 0.01} className="btn-outline text-xs">
                Apply to All Grades
              </button>
            </div>
          </div>

          {/* Visual */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-3">Weightage Preview</p>
            <div className="flex h-8 rounded-lg overflow-hidden">
              {examTypes.map((et, i) => {
                const pct = policies[et.id] || 0;
                const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500"];
                return pct > 0 ? (
                  <div key={et.id} className={`${colors[i % colors.length]} flex items-center justify-center text-white text-xs font-semibold`}
                    style={{ width: `${pct}%` }}>
                    {pct}%
                  </div>
                ) : null;
              })}
            </div>
            <div className="flex gap-4 mt-2">
              {examTypes.map((et, i) => {
                const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500"];
                return (
                  <div key={et.id} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <div className={`w-2.5 h-2.5 rounded-sm ${colors[i % colors.length]}`} />
                    {et.name}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
