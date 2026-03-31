"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { ArrowRight, Copy, GraduationCap, ArrowLeftRight } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface AcademicYear { id: string; yearBS: string; isActive: boolean }
interface Grade { id: string; name: string; displayOrder: number; sections: Section[] }
interface Section { id: string; name: string }
interface StudentPromotion {
  id: string;
  name: string;
  nameNp?: string;
  rollNo?: number;
  sectionName: string;
  sectionId: string;
  promoted: boolean;
  totalPercentage: number | null;
  remarks: string | null;
  action: "PROMOTE" | "RETAIN" | "GRADUATE";
  targetSectionId?: string;
}

function getMaxDisplayOrder(grades: Grade[]): number {
  if (grades.length === 0) return -1;
  return Math.max(...grades.map((g) => g.displayOrder));
}

export default function PromotionPage() {
  const confirm = useConfirm();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [sourceYear, setSourceYear] = useState("");
  const [targetYear, setTargetYear] = useState("");
  const [grades, setGrades] = useState<Grade[]>([]);
  const [targetGrades, setTargetGrades] = useState<Grade[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [students, setStudents] = useState<StudentPromotion[]>([]);
  const [gradeName, setGradeName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [step, setStep] = useState<"setup" | "promote">("setup");

  const [showTransfer, setShowTransfer] = useState(false);
  const [transferStudentId, setTransferStudentId] = useState("");
  const [transferSectionId, setTransferSectionId] = useState("");
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [allSections, setAllSections] = useState<Section[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const y = await api.get<AcademicYear[]>("/academic-years");
        setYears(y);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  const handleSourceYearChange = async (yearId: string) => {
    setSourceYear(yearId);
    setSelectedGrade("");
    setStudents([]);
    setStep("setup");
    try {
      const g = await api.get<Grade[]>(`/grades?academicYearId=${yearId}`);
      setGrades(g);
    } catch { setGrades([]); }
  };

  const handleTargetYearChange = async (yearId: string) => {
    setTargetYear(yearId);
    try {
      const g = await api.get<Grade[]>(`/grades?academicYearId=${yearId}`);
      setTargetGrades(g);
    } catch { setTargetGrades([]); }
  };

  const handleCopyStructure = async () => {
    if (!sourceYear || !targetYear) return;
    if (!await confirm({ title: "Copy academic structure", message: "This will copy all grades, sections, subjects, exam types, and grading policies to the target year.", confirmLabel: "Copy", variant: "warning" })) return;
    setCopying(true);
    try {
      const result = await api.post<any>("/promotion/copy-structure", { sourceYearId: sourceYear, targetYearId: targetYear });
      toast.success(result.message);
      handleTargetYearChange(targetYear);
    } catch (err: any) {
      toast.error(err.message);
    } finally { setCopying(false); }
  };

  const handleGradeSelect = async (gradeId: string) => {
    setSelectedGrade(gradeId);
    const grade = grades.find((g) => g.id === gradeId);
    setGradeName(grade?.name || "");
    setLoadingStudents(true);
    try {
      const data = await api.get<any>(`/promotion/students?sourceYearId=${sourceYear}&gradeId=${gradeId}`);
      const maxOrder = getMaxDisplayOrder(grades);
      const isLast = grade?.displayOrder === maxOrder;
      const mapped: StudentPromotion[] = data.students.map((s: any) => ({
        ...s,
        action: isLast ? (s.promoted ? "GRADUATE" : "RETAIN") : (s.promoted ? "PROMOTE" : "RETAIN"),
      }));
      setStudents(mapped);
      setStep("promote");
    } catch (err: any) {
      toast.error(err.message);
      setStudents([]);
      setStep("promote");
    } finally { setLoadingStudents(false); }
  };

  const handleActionChange = (studentId: string, action: "PROMOTE" | "RETAIN" | "GRADUATE") => {
    setStudents((prev) => prev.map((s) => s.id === studentId ? { ...s, action } : s));
  };

  const handleTargetSectionChange = (studentId: string, sectionId: string) => {
    setStudents((prev) => prev.map((s) => s.id === studentId ? { ...s, targetSectionId: sectionId } : s));
  };

  const handlePromoteAll = () => {
    const maxOrder = getMaxDisplayOrder(grades);
    const isLast = grades.find((g) => g.id === selectedGrade)?.displayOrder === maxOrder;
    setStudents((prev) => prev.map((s) => ({
      ...s,
      action: isLast ? "GRADUATE" : "PROMOTE",
    })));
  };

  const handleSubmitPromotion = async () => {
    if (!sourceYear || !targetYear || !selectedGrade || students.length === 0) return;
    if (targetGrades.length === 0) {
      toast.error("Target year has no grades. Copy structure first.");
      return;
    }
    if (!await confirm({ title: "Confirm promotion", message: `This will promote, retain, or graduate ${students.length} students. This action cannot be easily undone.`, confirmLabel: "Proceed", variant: "warning" })) return;

    setPromoting(true);
    try {
      const result = await api.post<any>("/promotion/promote", {
        sourceYearId: sourceYear,
        targetYearId: targetYear,
        sourceGradeId: selectedGrade,
        promotions: students.map((s) => ({
          studentId: s.id,
          action: s.action,
          targetSectionId: s.targetSectionId || undefined,
        })),
      });
      toast.success(result.message);
      setStep("setup");
      setSelectedGrade("");
      setStudents([]);
    } catch (err: any) {
      toast.error(err.message);
    } finally { setPromoting(false); }
  };

  const handleOpenTransfer = async () => {
    setShowTransfer(true);
    try {
      const s = await api.get<any[]>("/students");
      setAllStudents(s);
      const year = years.find((y) => y.isActive);
      if (year) {
        const g = await api.get<Grade[]>(`/grades?academicYearId=${year.id}`);
        const secs: Section[] = [];
        g.forEach((grade) => {
          (grade.sections || []).forEach((sec: any) => {
            secs.push({ id: sec.id, name: `${grade.name} — Section ${sec.name}` });
          });
        });
        setAllSections(secs);
      }
    } catch (err) { console.error(err); }
  };

  const handleTransfer = async () => {
    if (!transferStudentId || !transferSectionId) return;
    try {
      const result = await api.post<any>("/promotion/transfer", {
        studentId: transferStudentId,
        newSectionId: transferSectionId,
      });
      toast.success(result.message);
      setShowTransfer(false);
      setTransferStudentId("");
      setTransferSectionId("");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const selectedGradeObj = grades.find((g) => g.id === selectedGrade);
  const maxOrder = getMaxDisplayOrder(grades);
  const isLastGrade = grades.length > 0 && selectedGradeObj?.displayOrder === maxOrder;
  const nextGrade = targetGrades.find((g) => g.displayOrder === (selectedGradeObj?.displayOrder || 0) + 1);
  const nextGradeSections = nextGrade?.sections || [];
  const sameGradeSections = targetGrades.find((g) => g.displayOrder === selectedGradeObj?.displayOrder)?.sections || [];

  const promoteCount = students.filter((s) => s.action === "PROMOTE").length;
  const retainCount = students.filter((s) => s.action === "RETAIN").length;
  const graduateCount = students.filter((s) => s.action === "GRADUATE").length;

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Year-end Promotion</h1>
          <p className="text-sm text-gray-500 mt-1">Promote students to the next grade, retain, or graduate Class X students</p>
        </div>
        <button onClick={handleOpenTransfer} className="btn-outline text-xs">
          <ArrowLeftRight size={14} /> Section Transfer
        </button>
      </div>

      {showTransfer && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-primary">Transfer Student to Different Section</h3>
            <button onClick={() => setShowTransfer(false)} className="text-gray-400 hover:text-gray-600 text-xs">Close</button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Student</label>
              <select className="input" value={transferStudentId} onChange={(e) => setTransferStudentId(e.target.value)}>
                <option value="">Select Student</option>
                {allStudents.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} (Roll {s.rollNo})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Move to Section</label>
              <select className="input" value={transferSectionId} onChange={(e) => setTransferSectionId(e.target.value)}>
                <option value="">Select Section</option>
                {allSections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={handleTransfer} className="btn-primary text-xs">
                <ArrowLeftRight size={14} /> Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-primary mb-3">Step 1: Select Academic Years</h2>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="label">Source Year (promoting FROM)</label>
            <select className="input" value={sourceYear} onChange={(e) => handleSourceYearChange(e.target.value)}>
              <option value="">Select Year</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>{y.yearBS} B.S. {y.isActive ? "(Active)" : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Target Year (promoting TO)</label>
            <select className="input" value={targetYear} onChange={(e) => handleTargetYearChange(e.target.value)}>
              <option value="">Select Year</option>
              {years.filter((y) => y.id !== sourceYear).map((y) => (
                <option key={y.id} value={y.id}>{y.yearBS} B.S. {y.isActive ? "(Active)" : ""}</option>
              ))}
            </select>
          </div>
        </div>

        {sourceYear && targetYear && targetGrades.length === 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-700 mb-2">The target year has no grades or sections yet. Copy the structure from the source year first.</p>
            <button onClick={handleCopyStructure} disabled={copying} className="btn-primary text-xs">
              <Copy size={14} /> {copying ? "Copying..." : "Copy Structure from Source Year"}
            </button>
          </div>
        )}

        {targetGrades.length > 0 && (
          <p className="mt-3 text-xs text-emerald-600">✓ Target year has {targetGrades.length} grades ready</p>
        )}
      </div>

      {sourceYear && targetYear && targetGrades.length > 0 && step === "setup" && (
        <div className="card p-5 mb-6">
          <h2 className="font-semibold text-primary mb-3">Step 2: Select Grade to Promote</h2>
          <div className="flex flex-wrap gap-2">
            {grades.map((g) => (
              <button key={g.id} onClick={() => handleGradeSelect(g.id)} disabled={loadingStudents}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedGrade === g.id ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
                {g.name}
              </button>
            ))}
          </div>
          {loadingStudents && (
            <p className="mt-3 text-xs text-gray-400 animate-pulse">Loading students...</p>
          )}
        </div>
      )}

      {step === "promote" && !loadingStudents && students.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-primary">
                Step 3: {gradeName} — {students.length} Students
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                {isLastGrade
                  ? "Graduating class — passed students will be marked as Graduated"
                  : `Promoting to ${nextGrade?.name || "next grade"}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setStep("setup"); setSelectedGrade(""); setStudents([]); }} className="btn-ghost text-xs">
                ← Back
              </button>
              <button onClick={handlePromoteAll} className="btn-outline text-xs">
                {isLastGrade ? "Graduate All Passed" : "Promote All"}
              </button>
            </div>
          </div>

          <div className="flex gap-4 mb-4 text-xs">
            {!isLastGrade && (
              <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full font-semibold">
                {promoteCount} Promote
              </span>
            )}
            <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full font-semibold">
              {retainCount} Retain
            </span>
            {graduateCount > 0 && (
              <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full font-semibold">
                {graduateCount} Graduate
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="text-left px-4 py-2">Roll</th>
                  <th className="text-left px-4 py-2">Student</th>
                  <th className="text-left px-4 py-2">Section</th>
                  <th className="text-center px-4 py-2">%</th>
                  <th className="text-center px-4 py-2">Status</th>
                  <th className="text-center px-4 py-2">Action</th>
                  <th className="text-left px-4 py-2">Target Section</th>
                </tr>
              </thead>
              <tbody>
                {students.map((stu) => (
                  <tr key={stu.id} className="border-t border-gray-100 hover:bg-surface transition-colors">
                    <td className="px-4 py-2 text-gray-400">{stu.rollNo || "—"}</td>
                    <td className="px-4 py-2">
                      <span className="font-medium text-primary">{stu.name}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{stu.sectionName}</td>
                    <td className="px-4 py-2 text-center">
                      {stu.totalPercentage != null ? (
                        <span className={`font-semibold ${stu.totalPercentage >= 40 ? "text-emerald-600" : "text-red-600"}`}>
                          {stu.totalPercentage}%
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${stu.promoted ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                        {stu.promoted ? "Passed" : "Failed"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <select
                        value={stu.action}
                        onChange={(e) => handleActionChange(stu.id, e.target.value as any)}
                        className={`text-xs px-2 py-1 border rounded text-center font-semibold ${
                          stu.action === "PROMOTE" ? "border-emerald-300 text-emerald-700 bg-emerald-50" :
                          stu.action === "GRADUATE" ? "border-blue-300 text-blue-700 bg-blue-50" :
                          "border-amber-300 text-amber-700 bg-amber-50"
                        }`}
                      >
                        {!isLastGrade && <option value="PROMOTE">Promote</option>}
                        <option value="RETAIN">Retain</option>
                        <option value="GRADUATE">Graduate</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      {stu.action === "PROMOTE" && nextGradeSections.length > 0 && (
                        <select
                          value={stu.targetSectionId || ""}
                          onChange={(e) => handleTargetSectionChange(stu.id, e.target.value)}
                          className="text-xs px-2 py-1 border border-gray-200 rounded"
                        >
                          <option value="">Default (A)</option>
                          {nextGradeSections.map((sec) => (
                            <option key={sec.id} value={sec.id}>Section {sec.name}</option>
                          ))}
                        </select>
                      )}
                      {stu.action === "RETAIN" && sameGradeSections.length > 0 && (
                        <select
                          value={stu.targetSectionId || ""}
                          onChange={(e) => handleTargetSectionChange(stu.id, e.target.value)}
                          className="text-xs px-2 py-1 border border-gray-200 rounded"
                        >
                          <option value="">Default (A)</option>
                          {sameGradeSections.map((sec) => (
                            <option key={sec.id} value={sec.id}>Section {sec.name}</option>
                          ))}
                        </select>
                      )}
                      {stu.action === "GRADUATE" && (
                        <span className="text-xs text-gray-400">
                          <GraduationCap size={12} className="inline mr-1" /> Leaves school
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => { setStep("setup"); setSelectedGrade(""); setStudents([]); }} className="btn-ghost text-sm">
              Cancel
            </button>
            <button onClick={handleSubmitPromotion} disabled={promoting} className="btn-primary text-sm">
              <ArrowRight size={16} /> {promoting ? "Processing..." : `Confirm Promotion (${students.length} students)`}
            </button>
          </div>
        </div>
      )}

      {step === "promote" && !loadingStudents && students.length === 0 && (
        <div className="card p-8 text-center text-gray-400">
          <p>No active students found in {gradeName}.</p>
          <p className="text-xs mt-1">Students may have already been promoted or there are none enrolled in this grade.</p>
          <button onClick={() => { setStep("setup"); setSelectedGrade(""); }} className="btn-ghost text-xs mt-3">
            ← Back to Grade Selection
          </button>
        </div>
      )}
    </div>
  );
}