"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { openReportCardPdf } from "@/lib/reportCardPdf";
import { useAuth } from "@/hooks/useAuth";
import { Printer, Download } from "lucide-react";
import ReportCardPreview from "@/components/ui/ReportCardPreview";
import ResultsPending from "@/components/ui/ResultsPending";
import { useExamTypes } from "@/hooks/useReferenceData";

export default function StudentReportPage() {
  const { user } = useAuth();
  const [reportData, setReportData] = useState<any>(null);
  const [mode, setMode] = useState<"color" | "bw">("color");
  const [downloading, setDownloading] = useState(false);
  const { activeYear, examTypes, loading } = useExamTypes();
  const [selectedExam, setSelectedExam] = useState("");

  const loadReport = async (examTypeId: string) => {
    if (!user?.student?.id) return;
    setSelectedExam(examTypeId);
    const et = examTypes.find((e) => e.id === examTypeId);
    try {
      let data: any;
      if (et?.isFinal) {
        if (!activeYear) return;
        data = await api.get(`/reports/final/${user.student.id}/${activeYear.id}`);
      } else {
        data = await api.get(`/reports/term/${user.student.id}/${examTypeId}`);
      }
      setReportData(data);
    } catch {
      setReportData(null);
    }
  };

  const openPdf = async (pdfMode: "color" | "bw", action: "print" | "download") => {
    if (!user?.student?.id || !selectedExam) return;
    setDownloading(true);
    try {
      const et = examTypes.find((e) => e.id === selectedExam);
      let path: string;

      if (et?.isFinal) {
        if (!activeYear) return;
        path = `/pdf/final/${user.student.id}/${activeYear.id}?mode=${pdfMode}`;
      } else {
        path = `/pdf/term/${user.student.id}/${selectedExam}?mode=${pdfMode}`;
      }

      await openReportCardPdf(path, action);
    } catch {
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-primary">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-surface p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6 no-print">
          <h1 className="text-2xl font-display font-bold text-primary">My Report Card</h1>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setMode(mode === "color" ? "bw" : "color")}
              className="btn-ghost text-xs">{mode === "color" ? "🖨️ B&W" : "🎨 Color"}</button>
            {reportData && !reportData.pending && (
              <>
                <button onClick={() => openPdf(mode, "print")} disabled={downloading} className="btn-outline text-xs">
                  <Printer size={14} /> {downloading ? "..." : `Print (${reportData.paperSize || "A4"})`}
                </button>
                <button onClick={() => openPdf("color", "download")} disabled={downloading} className="btn-primary text-xs">
                  <Download size={14} /> {downloading ? "Generating..." : "PDF (Color)"}
                </button>
                <button onClick={() => openPdf("bw", "download")} disabled={downloading} className="btn-ghost text-xs border border-gray-300">
                  <Download size={14} /> {downloading ? "..." : "PDF (B&W)"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-6 no-print">
          {examTypes.map((et) => (
            <button key={et.id} onClick={() => loadReport(et.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedExam === et.id ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"}`}>
              {et.name}
              <span className="ml-1 text-xs opacity-60">({et.paperSize})</span>
            </button>
          ))}
        </div>

        {!reportData && selectedExam && (
          <div className="card p-8 text-center text-gray-400">No report data available for this exam.</div>
        )}

        {reportData?.pending && (
          <ResultsPending
            examName={reportData.examName}
            pendingTerms={reportData.pendingTerms}
            message={reportData.message}
          />
        )}

        {reportData && !reportData.pending && selectedExam && (
          <ReportCardPreview
            mode={mode}
            path={examTypes.find((e) => e.id === selectedExam)?.isFinal
              ? `/pdf/final/${user?.student?.id}/${activeYear?.id}`
              : `/pdf/term/${user?.student?.id}/${selectedExam}`}
          />
        )}
      </div>
    </div>
  );
}