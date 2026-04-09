"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, Printer, Copy, Save } from "lucide-react";
import BSDatePicker from "@/components/ui/BSDatePicker";

interface Grade { id: string; name: string; displayOrder: number }
interface ExamType { id: string; name: string }
interface Subject { id: string; name: string; nameNp?: string }
interface RoutineEntry {
  id?: string;
  subjectId: string;
  subjectName?: string;
  examDate: string;
  dayName: string;
  startTime: string;
  endTime: string;
}

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function ExamRoutinePage() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedExam, setSelectedExam] = useState("");
  const [entries, setEntries] = useState<RoutineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [copyTargetGrade, setCopyTargetGrade] = useState("");
  const [school, setSchool] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const year = await api.get<any>("/academic-years/active");
        const schoolData = await api.get<any>("/school").catch(() => null);
        setSchool(schoolData);
        if (year) {
          const [g, et] = await Promise.all([
            api.get<Grade[]>(`/grades?academicYearId=${year.id}`),
            api.get<ExamType[]>(`/exam-types?academicYearId=${year.id}`),
          ]);
          setGrades(g);
          setExamTypes(et);
        }
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  const handleGradeChange = async (gradeId: string) => {
    setSelectedGrade(gradeId);
    setEntries([]);
    try {
      const subs = await api.get<Subject[]>(`/subjects?gradeId=${gradeId}`);
      setSubjects(subs);
      if (selectedExam) {
        await fetchRoutine(selectedExam, gradeId);
      }
    } catch { setSubjects([]); }
  };

  const handleExamChange = async (examTypeId: string) => {
    setSelectedExam(examTypeId);
    if (selectedGrade) {
      await fetchRoutine(examTypeId, selectedGrade);
    }
  };

  const fetchRoutine = async (examTypeId: string, gradeId: string) => {
    try {
      const data = await api.get<any[]>(`/exam-routine?examTypeId=${examTypeId}&gradeId=${gradeId}`);
      if (data.length > 0) {
        setEntries(data.map((r) => ({
          id: r.id,
          subjectId: r.subject.id,
          subjectName: r.subject.name,
          examDate: r.examDate,
          dayName: r.dayName || "",
          startTime: r.startTime || "",
          endTime: r.endTime || "",
        })));
      } else {
        setEntries(subjects.map((s) => ({
          subjectId: s.id,
          subjectName: s.name,
          examDate: "",
          dayName: "",
          startTime: "",
          endTime: "",
        })));
      }
    } catch {
      setEntries([]);
    }
  };

  const handleEntryChange = (index: number, field: keyof RoutineEntry, value: string) => {
    setEntries((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddEntry = () => {
    setEntries((prev) => [...prev, {
      subjectId: "",
      examDate: "",
      dayName: "",
      startTime: "",
      endTime: "",
    }]);
  };

  const handleRemoveEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!selectedExam || !selectedGrade) return;
    const validEntries = entries.filter((e) => e.subjectId && e.examDate);
    if (validEntries.length === 0) {
      toast.error("Add at least one entry with subject and date");
      return;
    }
    setSaving(true);
    try {
      await api.post("/exam-routine/bulk", {
        examTypeId: selectedExam,
        gradeId: selectedGrade,
        entries: validEntries.map((e) => ({
          subjectId: e.subjectId,
          examDate: e.examDate,
          dayName: e.dayName || undefined,
          startTime: e.startTime || undefined,
          endTime: e.endTime || undefined,
        })),
      });
      toast.success("Exam routine saved");
      await fetchRoutine(selectedExam, selectedGrade);
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  const handleCopy = async () => {
    if (!selectedExam || !selectedGrade || !copyTargetGrade) return;
    try {
      const result = await api.post<any>("/exam-routine/copy", {
        examTypeId: selectedExam,
        sourceGradeId: selectedGrade,
        targetGradeId: copyTargetGrade,
      });
      toast.success(result.message);
      setShowCopy(false);
      setCopyTargetGrade("");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handlePrint = () => {
    const validEntries = entries.filter((e) => e.subjectId && e.examDate);
    if (validEntries.length === 0) return;

    const rows = validEntries.map((e, i) => {
      const subjectName = e.subjectName || subjects.find((s) => s.id === e.subjectId)?.name || "—";
      return `<tr>
        <td>${i + 1}</td>
        <td>${subjectName}</td>
        <td>${e.examDate}</td>
        <td>${e.dayName || "—"}</td>
        <td>${e.startTime || "—"}</td>
        <td>${e.endTime || "—"}</td>
      </tr>`;
    }).join("");

    const schoolName = school?.name || school?.nameNp || "School";
    const schoolAddr = school?.address || "";
    const schoolPhone = school?.phone ? ` • ${school.phone}` : "";

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Exam Routine — ${selectedExamName} — ${selectedGradeName}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #222; max-width: 700px; margin: 0 auto; padding: 20px; }
  .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 16px; }
  .header h1 { font-size: 16px; margin-bottom: 2px; }
  .header h2 { font-size: 13px; font-weight: 400; color: #555; margin-bottom: 2px; }
  .header p { font-size: 10px; color: #777; }
  .title { text-align: center; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 12px 0 4px; }
  .subtitle { text-align: center; font-size: 12px; color: #555; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; font-size: 12px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  .footer { text-align: center; margin-top: 30px; font-size: 9px; color: #999; }
  .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
  .sig { text-align: center; font-size: 10px; }
  .sig-line { width: 100px; border-top: 1px solid #555; margin: 0 auto 3px; }
  @page { size: A4; margin: 15mm; }
</style></head><body>
<div class="header">
  <h1>${schoolName}</h1>
  <h2>${school?.name || ""}</h2>
  <p>${schoolAddr}${schoolPhone}</p>
</div>
<div class="title">${selectedExamName} — Exam Routine</div>
<div class="subtitle">Class: ${selectedGradeName}</div>
<table>
  <thead><tr><th>SN</th><th>Subject</th><th>Date (BS)</th><th>Day</th><th>Start Time</th><th>End Time</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="signatures">
  <div class="sig"><div class="sig-line"></div>Exam Coordinator</div>
  <div class="sig"><div class="sig-line"></div>Principal</div>
</div>
<div class="footer">Computer generated document</div>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) { alert("Please allow popups to print."); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  };

  const selectedGradeName = grades.find((g) => g.id === selectedGrade)?.name || "";
  const selectedExamName = examTypes.find((e) => e.id === selectedExam)?.name || "";

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Exam Routine</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage exam schedules per grade</p>
        </div>
        <div className="flex gap-2">
          {entries.length > 0 && entries.some((e) => e.examDate) && (
            <>
              <button onClick={() => setShowCopy(!showCopy)} className="btn-ghost text-xs">
                <Copy size={14} /> Copy to Grade
              </button>
              <button onClick={handlePrint} className="btn-outline text-xs">
                <Printer size={14} /> Print
              </button>
            </>
          )}
        </div>
      </div>

      {/* Selectors */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1">
          <label className="label">Exam Type</label>
          <select className="input" value={selectedExam} onChange={(e) => handleExamChange(e.target.value)}>
            <option value="">Select Exam</option>
            {examTypes.map((et) => (
              <option key={et.id} value={et.id}>{et.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="label">Grade</label>
          <select className="input" value={selectedGrade} onChange={(e) => handleGradeChange(e.target.value)}>
            <option value="">Select Grade</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Copy to grade */}
      {showCopy && (
        <div className="card p-4 mb-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-primary">Copy routine to:</span>
            <select className="input w-48" value={copyTargetGrade} onChange={(e) => setCopyTargetGrade(e.target.value)}>
              <option value="">Select Grade</option>
              {grades.filter((g) => g.id !== selectedGrade).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button onClick={handleCopy} disabled={!copyTargetGrade} className="btn-primary text-xs">Copy</button>
            <button onClick={() => { setShowCopy(false); setCopyTargetGrade(""); }} className="btn-ghost text-xs">Cancel</button>
          </div>
          <p className="text-xs text-gray-500 mt-2">This copies dates and times. Subjects are matched by name — only matching subjects will be copied.</p>
        </div>
      )}

      {/* Routine table */}
      {selectedExam && selectedGrade && (
        <>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2 min-w-[140px]">Subject</th>
                  <th className="text-left px-3 py-2 min-w-[120px]">Date (BS)</th>
                  <th className="text-left px-3 py-2 min-w-[100px]">Day</th>
                  <th className="text-left px-3 py-2 min-w-[90px]">Start Time</th>
                  <th className="text-left px-3 py-2 min-w-[90px]">End Time</th>
                  <th className="text-center px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-surface transition-colors">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <select
                        value={entry.subjectId}
                        onChange={(e) => handleEntryChange(i, "subjectId", e.target.value)}
                        className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30"
                      >
                        <option value="">Select</option>
                        {subjects.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <BSDatePicker
                        value={entry.examDate}
                        onChange={(date) => handleEntryChange(i, "examDate", date)}
                        placeholder="2081/09/15"
                        className="w-full"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={entry.dayName}
                        onChange={(e) => handleEntryChange(i, "dayName", e.target.value)}
                        className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30"
                      >
                        <option value="">—</option>
                        {dayNames.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={entry.startTime}
                        onChange={(e) => handleEntryChange(i, "startTime", e.target.value)}
                        placeholder="11:00 AM"
                        className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={entry.endTime}
                        onChange={(e) => handleEntryChange(i, "endTime", e.target.value)}
                        placeholder="2:00 PM"
                        className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => handleRemoveEntry(i)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-all">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {entries.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">
                No routine entries. Select an exam type and grade, then add entries.
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between mt-4">
            <button onClick={handleAddEntry} className="btn-ghost text-xs">
              <Plus size={14} /> Add Row
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              <Save size={16} /> {saving ? "Saving..." : "Save Routine"}
            </button>
          </div>
        </>
      )}

      {(!selectedExam || !selectedGrade) && (
        <div className="card p-8 text-center text-gray-400">
          Select an exam type and grade to manage the exam routine.
        </div>
      )}
    </div>
  );
}