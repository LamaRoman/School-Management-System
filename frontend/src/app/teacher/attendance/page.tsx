"use client";
import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useMyAssignments, type ClassTeacherSection } from "@/hooks/useReferenceData";
import toast from "react-hot-toast";
import { Save, ChevronLeft, ChevronRight, Check } from "lucide-react";
import {
  getTodayBS,
  getPreviousDayBS,
  getNextDayBS,
  isFutureBS,
  isTodayBS,
  formatBSDateLong,
  formatGradeSection,
} from "@/lib/bsDate";

interface AttendanceRecord {
  studentId: string;
  studentName: string;
  rollNo: number | null;
  status: "PRESENT" | "ABSENT" | null;
  remarks: string | null;
  isMarked: boolean;
}

export default function AttendancePage() {
  const { classTeacherSections: mySections, loading } = useMyAssignments();
  const [pickedSection, setPickedSection] = useState<ClassTeacherSection | null>(null);
  const [date, setDate] = useState(getTodayBS());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const selectedSection = pickedSection ?? mySections[0] ?? null;

  // Save posts `records` against the *currently* selected sectionId and date, so
  // the roster on screen has to belong to that pair. Keying the fetch on both
  // makes it so by construction — a response for the section or day the teacher
  // just left can only ever populate its own cache entry.
  const attendanceKey =
    selectedSection && date
      ? `/daily-attendance?sectionId=${selectedSection.sectionId}&date=${date}&academicYearId=${selectedSection.academicYearId}`
      : null;
  const {
    data: fetchedRecords,
    isLoading: loadingRecords,
    mutate: reloadAttendance,
  } = useSWR<AttendanceRecord[]>(attendanceKey);

  // The roster is toggled in place, so it is local state seeded from the fetch,
  // and seeded once per section+date rather than on every change of the fetched
  // array — a background revalidation would otherwise throw away the absences a
  // teacher had marked but not yet saved.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (seededFor.current === attendanceKey) return;
    if (!fetchedRecords) {
      seededFor.current = null;
      setRecords([]);
      setHasChanges(false);
      return;
    }
    // Default unmarked students to PRESENT
    setRecords(fetchedRecords.map((r) => ({ ...r, status: r.status || "PRESENT" })));
    setHasChanges(false);
    seededFor.current = attendanceKey;
  }, [attendanceKey, fetchedRecords]);

  const toggleStatus = (studentId: string) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.studentId === studentId
          ? { ...r, status: r.status === "PRESENT" ? "ABSENT" : "PRESENT" }
          : r
      )
    );
    setHasChanges(true);
  };

  const markAllPresent = () => {
    setRecords((prev) => prev.map((r) => ({ ...r, status: "PRESENT" as const })));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selectedSection || loadingRecords) return;

    // Prevent saving attendance for future dates
    if (isFutureBS(date)) {
      toast.error("Cannot save attendance for future dates");
      return;
    }

    setSaving(true);
    try {
      await api.post("/daily-attendance/bulk", {
        sectionId: selectedSection.sectionId,
        date,
        academicYearId: selectedSection.academicYearId,
        records: records.map((r) => ({
          studentId: r.studentId,
          status: r.status || "PRESENT",
          remarks: r.remarks,
        })),
      });
      toast.success("Attendance saved");
      setHasChanges(false);
      // Refresh the cache so a later visit to this day doesn't render what the
      // server held before the save. The grid itself is left alone — it already
      // shows exactly what was just written.
      reloadAttendance();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  const handlePreviousDay = () => {
    setDate(getPreviousDayBS(date));
  };

  const handleNextDay = () => {
    const nextDay = getNextDayBS(date);
    // Don't allow navigating to future dates
    if (isFutureBS(nextDay)) return;
    setDate(nextDay);
  };

  const isNextDisabled = isTodayBS(date) || isFutureBS(date);

  const presentCount = records.filter((r) => r.status === "PRESENT").length;
  const absentCount = records.filter((r) => r.status === "ABSENT").length;

  if (loading) {
    return (
      <div className="max-w-lg mx-auto p-4">
        <div className="card p-8 text-center text-gray-400">Loading...</div>
      </div>
    );
  }

  if (mySections.length === 0) {
    return (
      <div className="max-w-lg mx-auto p-4">
        <div className="card p-8 text-center text-gray-400">
          You are not assigned as a class teacher.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-display font-bold text-primary">Attendance</h1>
        <p className="text-sm text-gray-500">
          {selectedSection ? formatGradeSection(selectedSection.gradeName, selectedSection.sectionName) : ""}
        </p>
      </div>

      {/* Section Selector (if multiple) */}
      {mySections.length > 1 && (
        <select
          className="input mb-4"
          value={selectedSection?.assignmentId || ""}
          onChange={(e) => {
            const sec = mySections.find((s) => s.assignmentId === e.target.value);
            if (sec) setPickedSection(sec);
          }}
        >
          {mySections.map((s) => (
            <option key={s.assignmentId} value={s.assignmentId}>
              {formatGradeSection(s.gradeName, s.sectionName)}
            </option>
          ))}
        </select>
      )}

      {/* Date Selector */}
      <div className="card p-3 mb-4">
        <div className="flex items-center justify-between">
          <button
            onClick={handlePreviousDay}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <div className="text-center">
            <p className="font-semibold text-primary text-lg">{formatBSDateLong(date)}</p>
            <p className="text-xs text-gray-400">{date}</p>
            {isTodayBS(date) && (
              <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">Today</span>
            )}
          </div>
          <button
            onClick={handleNextDay}
            disabled={isNextDisabled}
            className={`p-2 rounded-lg ${isNextDisabled ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-100"}`}
          >
            <ChevronRight size={20} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* Future date warning */}
      {isFutureBS(date) && (
        <div className="card p-3 mb-4 border-amber-300 bg-amber-50 text-center text-sm text-amber-700">
          Cannot mark attendance for future dates.
        </div>
      )}

      {/* Stats Bar */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 card p-3 text-center">
          <p className="text-2xl font-bold text-emerald-600">{presentCount}</p>
          <p className="text-xs text-gray-500">Present</p>
        </div>
        <div className="flex-1 card p-3 text-center">
          <p className="text-2xl font-bold text-red-500">{absentCount}</p>
          <p className="text-xs text-gray-500">Absent</p>
        </div>
        <div className="flex-1 card p-3 text-center">
          <p className="text-2xl font-bold text-primary">{records.length}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 mb-4">
        <button onClick={markAllPresent} disabled={isFutureBS(date) || loadingRecords} className="btn-ghost text-xs flex-1">
          <Check size={14} /> All Present
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges || isFutureBS(date) || loadingRecords}
          className="btn-primary text-xs flex-1"
        >
          <Save size={14} /> {saving ? "Saving..." : "Save Attendance"}
        </button>
      </div>

      {/* Student List */}
      <div className="space-y-2">
        {loadingRecords ? (
          <div className="card p-8 text-center text-gray-400">Loading...</div>
        ) : records.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">No students found</div>
        ) : (
          records.map((r) => (
            <div
              key={r.studentId}
              onClick={() => !isFutureBS(date) && toggleStatus(r.studentId)}
              className={`card p-3 flex items-center justify-between transition-all select-none ${
                isFutureBS(date) ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-[0.98]"
              } ${
                r.status === "ABSENT" ? "border-red-200 bg-red-50/50" : "border-emerald-200 bg-emerald-50/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-6 text-right">{r.rollNo || "—"}</span>
                <span className="font-medium text-gray-800">{r.studentName}</span>
              </div>
              <div
                className={`w-20 py-2 rounded-lg text-center text-xs font-bold transition-all ${
                  r.status === "ABSENT"
                    ? "bg-red-500 text-white"
                    : "bg-emerald-500 text-white"
                }`}
              >
                {r.status === "ABSENT" ? "ABSENT" : "PRESENT"}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sticky Save Button for Mobile */}
      {hasChanges && !isFutureBS(date) && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full py-3 text-sm"
          >
            <Save size={16} /> {saving ? "Saving..." : `Save Attendance (${presentCount}P / ${absentCount}A)`}
          </button>
        </div>
      )}

      {/* Bottom spacer when sticky button is visible */}
      {hasChanges && !isFutureBS(date) && <div className="h-20" />}
    </div>
  );
}