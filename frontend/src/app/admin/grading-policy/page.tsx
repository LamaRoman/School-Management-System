"use client";
import { useState, useEffect, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Save } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { GRADING_SCALE } from "@/lib/gradingScale";
import { useGrades, useExamTypes } from "@/hooks/useReferenceData";

interface Policy { id: string; examTypeId: string; weightagePercent: number; examType: { name: string } }

export default function GradingPolicyPage() {
  const confirm = useConfirm();
  const { grades, loading: loadingGrades } = useGrades();
  const { examTypes, loading: loadingExamTypes } = useExamTypes();
  const loading = loadingGrades || loadingExamTypes;
  const [pickedGrade, setPickedGrade] = useState("");
  const [policies, setPolicies] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const selectedGrade = pickedGrade || grades[0]?.id || "";

  const policyKey = selectedGrade ? `/grading-policy?gradeId=${selectedGrade}` : null;
  const { data: savedPolicies } = useSWR<Policy[]>(policyKey);

  // The weightages are edited in place, so they are held as local state seeded
  // from the fetch. Switching grade empties them until that grade's own policy
  // arrives — previously the outgoing grade's numbers stayed on screen, and a
  // Save during that window wrote them to the grade now selected.
  //
  // Seeded once per *grade*, not on every change of `savedPolicies`: SWR hands
  // back a fresh array whenever it revalidates in the background, and reseeding
  // from that would discard weightages the admin had already typed.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (seededFor.current === policyKey) return;
    if (!savedPolicies) {
      seededFor.current = null;
      setPolicies({});
      return;
    }
    const map: Record<string, number> = {};
    savedPolicies.forEach((p) => { map[p.examTypeId] = p.weightagePercent; });
    setPolicies(map);
    seededFor.current = policyKey;
  }, [policyKey, savedPolicies]);

  // Both save paths can write policies for grades other than the selected one,
  // so they drop every cached grading policy rather than just this grade's.
  const { mutate: mutateCache } = useSWRConfig();
  const invalidatePolicies = () =>
    mutateCache((key) => typeof key === "string" && key.startsWith("/grading-policy"));

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
      invalidatePolicies();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const applyToAll = async () => {
    if (Math.abs(total - 100) > 0.01) return toast.error("Fix current grade first — total must be 100%");
    if (!await confirm({ title: "Apply to all grades", message: "This weightage will be applied to every grade in the active academic year.", confirmLabel: "Apply", variant: "warning" })) return;
    try {
      for (const g of grades) {
        await api.post("/grading-policy/bulk", {
          gradeId: g.id,
          policies: Object.entries(policies).map(([examTypeId, weightagePercent]) => ({ examTypeId, weightagePercent })),
        });
      }
      toast.success("Applied to all grades");
      invalidatePolicies();
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
          <button key={g.id} onClick={() => setPickedGrade(g.id)}
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

      {/* Official grading scale reference */}
      <div className="card p-6 mt-6">
        <h2 className="text-lg font-display font-bold text-primary">Grading Scale</h2>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          Every subject percentage is converted to a letter grade and grade point using this fixed scale.
          Grade sheets and report cards use it automatically — it isn&apos;t configurable per grade.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="bg-accent/10 text-left">
                <th className="p-2 border border-gray-200 font-semibold">Percentage Range</th>
                <th className="p-2 border border-gray-200 font-semibold">Letter Grade</th>
                <th className="p-2 border border-gray-200 font-semibold">Description</th>
                <th className="p-2 border border-gray-200 font-semibold">Grade Point (GP)</th>
              </tr>
            </thead>
            <tbody>
              {GRADING_SCALE.map((row) => (
                <tr key={row.grade}>
                  <td className="p-2 border border-gray-200">{row.range}</td>
                  <td className="p-2 border border-gray-200 font-bold text-primary">{row.grade}</td>
                  <td className="p-2 border border-gray-200 text-gray-600">{row.description}</td>
                  <td className="p-2 border border-gray-200">{row.gpa}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Overall GPA is the average of grade points across subjects — weighted by credit hour for classes using the
          credit-hour report style. Every band down to 0% carries a grade point, so no subject is left out of that
          average.
        </p>
      </div>
    </div>
  );
}
