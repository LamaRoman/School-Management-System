"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Printer, FileSpreadsheet } from "lucide-react";
import toast from "react-hot-toast";
import { printGradeSheet } from "@/lib/printUtils";
import type { SheetData } from "@/lib/gradeSheetExcel";

interface GradeSheetProps {
  sectionId: string;
  academicYearId: string;
  examTypes: { id: string; name: string; isFinal: boolean }[];
}

export default function GradeSheet({ sectionId, academicYearId, examTypes }: GradeSheetProps) {
  const [selectedExam, setSelectedExam] = useState("");
  const [data, setData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // exceljs is pulled in on click, not at page load — see gradeSheetExcel.ts.
  const downloadExcel = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const { exportGradeSheetToExcel } = await import("@/lib/gradeSheetExcel");
      await exportGradeSheetToExcel(data);
    } catch (err) {
      console.error(err);
      toast.error("Could not build the Excel file");
    } finally {
      setExporting(false);
    }
  };

  const loadSheet = async (examTypeId: string) => {
    setSelectedExam(examTypeId);
    setLoading(true);
    setData(null);

    const et = examTypes.find((e) => e.id === examTypeId);
    try {
      if (et?.isFinal) {
        const result = await api.get<SheetData>(
          `/grade-sheet/final?sectionId=${sectionId}&academicYearId=${academicYearId}`
        );
        setData(result);
      } else {
        const result = await api.get<SheetData>(
          `/grade-sheet/term?sectionId=${sectionId}&examTypeId=${examTypeId}&academicYearId=${academicYearId}`
        );
        setData(result);
      }
    } catch {
      setData(null);
    } finally { setLoading(false); }
  };

  const isFinal = data?.isFinal ?? false;

  return (
    <div>
      {/* Exam selector */}
      <div className="flex items-center gap-2 mb-4 no-print flex-wrap">
        {examTypes.map((et) => (
          <button
            key={et.id}
            onClick={() => loadSheet(et.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedExam === et.id
                ? "bg-primary text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-primary"
            }`}
          >
            {et.name}
          </button>
        ))}
        {data && (
          <div className="flex gap-2 ml-auto">
            <button onClick={downloadExcel} disabled={exporting} className="btn-outline text-xs">
              <FileSpreadsheet size={14} /> {exporting ? "Building..." : "Excel"}
            </button>
            <button onClick={() => printGradeSheet(data)} className="btn-primary text-xs">
              <Printer size={14} /> Print
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="card p-8 text-center text-gray-400">Loading grade sheet...</div>
      )}

      {!loading && selectedExam && !data && (
        <div className="card p-8 text-center text-gray-400">No data available for this exam.</div>
      )}

      {data && (
        <>
          {/* Title */}
          <div className="text-center mb-4">
            <h2 className="text-lg font-display font-bold text-primary">
              {data.gradeName} — Section {data.sectionName}
            </h2>
            <p className="text-sm text-gray-500">{data.examType} · {data.totalStudents} students</p>
          </div>

          {/* Table */}
          <div className="card overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: "collapse", minWidth: "800px" }}>
              <thead>
                <tr className="bg-primary text-white">
                  {data.showRank && <th className="p-2 border border-primary text-center w-10">Rank</th>}
                  <th className="p-2 border border-primary text-center w-10">Roll</th>
                  <th className="p-2 border border-primary text-left min-w-[120px]">Student Name</th>
                  {data.subjects.map((s) => (
                    <th key={s.id} className="p-2 border border-primary text-center min-w-[60px]">
                      <div>{s.name}</div>
                      <div className="text-[10px] font-normal opacity-70">({s.fullMarks})</div>
                    </th>
                  ))}
                  <th className="p-2 border border-primary text-center bg-accent min-w-[50px]">%</th>
                  <th className="p-2 border border-primary text-center bg-accent min-w-[50px]">GPA</th>
                  <th className="p-2 border border-primary text-center bg-accent min-w-[50px]">Grade</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={row.studentId} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    {data.showRank && (
                      <td className="p-2 border border-gray-200 text-center font-bold text-primary">{row.rank}</td>
                    )}
                    <td className="p-2 border border-gray-200 text-center text-gray-400">{row.rollNo || "—"}</td>
                    <td className="p-2 border border-gray-200 font-medium">{row.studentName}</td>
                    {row.subjects.map((s, j) => {
                      const value = isFinal ? s.weightedPercentage : s.obtained;
                      return (
                        <td
                          key={j}
                          className={`p-2 border border-gray-200 text-center ${
                            !s.passed ? "text-red-600 font-bold" : ""
                          }`}
                        >
                          {s.isAbsent ? "Ab" : (value ?? "—")}
                        </td>
                      );
                    })}
                    <td className="p-2 border border-gray-200 text-center font-bold text-accent">{row.percentage}</td>
                    <td className="p-2 border border-gray-200 text-center font-semibold">{row.gpa ?? "—"}</td>
                    <td className="p-2 border border-gray-200 text-center font-bold text-primary">{row.grade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-3 text-xs text-gray-400 no-print">
            <span className="text-red-600 font-bold">Red</span> = below pass marks
            {isFinal && " · Values show weighted percentage per subject"}
          </div>
        </>
      )}
    </div>
  );
}