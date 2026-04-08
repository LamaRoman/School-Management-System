"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { Search, User } from "lucide-react";

interface Grade { id: string; name: string; sections?: { id: string; name: string }[] }
interface Student {
  id: string; name: string; nameNp?: string; rollNo?: number;
  dateOfBirth?: string; gender?: string; guardianName?: string; guardianPhone?: string;
  address?: string; status: string;
  section: { name: string; grade: { name: string } };
}

export default function AccountantStudentSearchPage() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [sections, setSections] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Global search
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalResults, setGlobalResults] = useState<Student[]>([]);
  const [globalSearching, setGlobalSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const year = await api.get<any>("/academic-years/active");
        if (year) {
          const g = await api.get<Grade[]>(`/grades?academicYearId=${year.id}`);
          setGrades(g);
        }
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  // Global search effect
  useEffect(() => {
    if (globalQuery.trim().length < 2) {
      setGlobalResults([]);
      setGlobalSearching(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setGlobalSearching(true);
      try {
        const data = await api.get<Student[]>("/students", { search: globalQuery.trim() });
        setGlobalResults(Array.isArray(data) ? data : []);
      } catch {
        setGlobalResults([]);
      } finally {
        setGlobalSearching(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [globalQuery]);

  const handleGradeChange = (gradeId: string) => {
    setSelectedGrade(gradeId);
    setSelectedSection("");
    setStudents([]);
    setSelectedStudent(null);
    const grade = grades.find((g) => g.id === gradeId);
    setSections(grade?.sections || []);
  };

  const handleSectionChange = async (sectionId: string) => {
    setSelectedSection(sectionId);
    setSelectedStudent(null);
    try {
      const data = await api.get<Student[]>(`/students?sectionId=${sectionId}`);
      setStudents(data);
    } catch { setStudents([]); }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto p-6"><div className="card p-8 text-center text-gray-400">Loading...</div></div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-display font-bold text-primary mb-6">Student Search</h1>

      {/* Global Search */}
      <div className="card p-5 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 text-base"
            placeholder="Type student name to search across all grades..."
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            autoFocus
          />
          {globalSearching && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 animate-pulse">Searching...</div>}
        </div>
        {globalResults.length > 0 && (
          <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
            {globalResults.map((s) => (
              <div
                key={s.id}
                onClick={() => { setSelectedStudent(s); setGlobalQuery(""); setGlobalResults([]); }}
                className={`flex items-center justify-between px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-surface transition-colors ${selectedStudent?.id === s.id ? "bg-primary/5" : ""}`}
              >
                <div>
                  <p className="font-medium text-primary">{s.name}</p>
                  {s.nameNp && <p className="text-xs text-gray-400">{s.nameNp}</p>}
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold px-2 py-0.5 bg-primary/10 text-primary rounded">
                    {s.section.grade.name} - {s.section.name}
                  </span>
                  {s.rollNo != null && <p className="text-[10px] text-gray-400 mt-1">Roll #{s.rollNo}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
        {globalQuery.trim().length >= 2 && !globalSearching && globalResults.length === 0 && (
          <p className="mt-3 text-sm text-gray-400 text-center">No students found</p>
        )}
      </div>

      {/* Student Detail */}
      {selectedStudent && (
        <div className="card p-5 mb-4 border-2 border-primary/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <User size={24} className="text-primary" />
              </div>
              <div>
                <h2 className="font-display font-bold text-primary text-lg">{selectedStudent.name}</h2>
                {selectedStudent.nameNp && <p className="text-sm text-gray-500">{selectedStudent.nameNp}</p>}
              </div>
            </div>
            <button onClick={() => setSelectedStudent(null)} className="btn-ghost text-xs">Close</button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Class:</span> <b>{selectedStudent.section.grade.name} — Section {selectedStudent.section.name}</b></div>
            <div><span className="text-gray-500">Roll No:</span> <b>{selectedStudent.rollNo || "—"}</b></div>
            <div><span className="text-gray-500">DOB:</span> <b>{selectedStudent.dateOfBirth || "—"}</b></div>
            <div><span className="text-gray-500">Gender:</span> <b>{selectedStudent.gender || "—"}</b></div>
            <div><span className="text-gray-500">Guardian:</span> <b>{selectedStudent.guardianName || "—"}</b></div>
            <div><span className="text-gray-500">Phone:</span> <b>{selectedStudent.guardianPhone || "—"}</b></div>
            <div className="col-span-2"><span className="text-gray-500">Address:</span> <b>{selectedStudent.address || "—"}</b></div>
            <div><span className="text-gray-500">Status:</span> <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${selectedStudent.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{selectedStudent.status}</span></div>
          </div>
        </div>
      )}

      {/* Browse by Grade/Section */}
      <div className="border-t border-gray-200 pt-6 mt-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Or browse by grade</h2>
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <select className="input" value={selectedGrade} onChange={(e) => handleGradeChange(e.target.value)}>
              <option value="">Select Grade</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <select className="input" value={selectedSection} onChange={(e) => handleSectionChange(e.target.value)}>
              <option value="">Select Section</option>
              {sections.map((s: any) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Student List from Section */}
      {students.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="text-left px-4 py-2">Roll</th>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Guardian</th>
                <th className="text-left px-4 py-2">Phone</th>
                <th className="text-left px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelectedStudent(s)}
                  className={`border-t border-gray-100 cursor-pointer transition-colors ${selectedStudent?.id === s.id ? "bg-primary/5" : "hover:bg-surface"}`}
                >
                  <td className="px-4 py-2 text-gray-400">{s.rollNo || "—"}</td>
                  <td className="px-4 py-2 font-medium text-primary">{s.name}</td>
                  <td className="px-4 py-2 text-gray-600">{s.guardianName || "—"}</td>
                  <td className="px-4 py-2 text-gray-600">{s.guardianPhone || "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedSection && students.length === 0 && (
        <div className="card p-8 text-center text-gray-400">No students in this section.</div>
      )}
    </div>
  );
}