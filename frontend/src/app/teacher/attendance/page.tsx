"use client";
import { useState, useEffect } from "react";
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

interface DayReason { kind: "WEEKLY_OFF" | "SCHOOL_HOLIDAY" | "NATIONAL_HOLIDAY"; title: string }
interface DayStatus { date: string; closed: boolean; reasons: DayReason[] }

function reasonText(r: DayReason): string {
  if (r.kind === "WEEKLY_OFF") return `${r.title} (weekly day off)`;
  if (r.kind === "SCHOOL_HOLIDAY") return `${r.title} (school holiday)`;
  return `${r.title} (public holiday)`;
}

export default function AttendancePage() {
  const { classTeacherSections: mySections, loading } = useMyAssignments();
  const [pickedSection, setPickedSection] = useState<ClassTeacherSection | null>(null);
  const [date, setDate] = useState(getTodayBS());
  const [saving, setSaving] = useState(false);
  // What the server holds is `fetchedRecords`; the teacher's unsaved taps are laid over it in
  // `edits`. What is shown is derived from both plus the kind of day, so nothing has to be
  // re-seeded when the day status arrives, and a background revalidation can never throw
  // away taps that have not been saved yet.
  const [edits, setEdits] = useState<Record<string, "PRESENT" | "ABSENT">>({});
  const hasChanges = Object.keys(edits).length > 0;

  const selectedSection = pickedSection ?? mySections[0] ?? null;

  // Weekly day off / school holiday / public holiday? On a closed day the list is shown GREY
  // (nothing recorded, nobody assumed present) and the teacher can press All Present or tap
  // students individually. Informational only: nothing is blocked or confirmed.
  const { data: dayStatus, isLoading: dayLoading } = useSWR<DayStatus>(date ? `/daily-attendance/day?date=${date}` : null);
  const closed = !!dayStatus?.closed;

  // Save posts the roster against the *currently* selected sectionId and date, so what is
  // on screen has to belong to that pair. Keying the fetch on both makes it so by
  // construction — a response for the section or day the teacher just left can only ever
  // populate its own cache entry.
  const attendanceKey =
    selectedSection && date
      ? `/daily-attendance?sectionId=${selectedSection.sectionId}&date=${date}&academicYearId=${selectedSection.academicYearId}`
      : null;
  const {
    data: fetchedRecords,
    isLoading: loadingRecords,
    mutate: reloadAttendance,
  } = useSWR<AttendanceRecord[]>(attendanceKey);

  // Unsaved taps belong to one section + day.
  useEffect(() => { setEdits({}); }, [attendanceKey]);

  const showRecords = (raw: AttendanceRecord[], e: Record<string, "PRESENT" | "ABSENT">): AttendanceRecord[] =>
    raw.map((r) => ({ ...r, status: e[r.studentId] ?? r.status ?? (closed ? null : "PRESENT") }));
  const records = showRecords(fetchedRecords ?? [], edits);

  const toggleStatus = (studentId: string) => {
    const current = records.find((r) => r.studentId === studentId)?.status ?? null;
    // First tap on a grey student marks them present; after that a tap flips present/absent.
    setEdits((prev) => ({ ...prev, [studentId]: current === "PRESENT" ? "ABSENT" : "PRESENT" }));
  };

  const markAllPresent = () => {
    setEdits(Object.fromEntries((fetchedRecords ?? []).map((r) => [r.studentId, "PRESENT" as const])));
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
        // Only students that have a status are sent: on a closed day, grey students are left out.
        records: records
          .filter((r) => r.status !== null)
          .map((r) => ({ studentId: r.studentId, status: r.status, remarks: r.remarks })),
      });
      // Read it back: report what the server now holds, not what we think we sent.
      const fresh = await reloadAttendance();
      setEdits({});
      const stored = showRecords(fresh ?? [], {});
      const present = stored.filter((r) => r.status === "PRESENT").length;
      const absent = stored.filter((r) => r.status === "ABSENT").length;
      toast.success(`Saved: ${present} present, ${absent} absent`);
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
  // An ordinary day nobody has saved shows every student as present by default. That default
  // is not a record, so say so — and let it be saved without having to tap something first.
  // A closed day never nags: nothing is saved there unless the teacher marks something.
  const unsavedDay = (fetchedRecords ?? []).length > 0 && (fetchedRecords ?? []).some((r) => !r.isMarked);
  const canSave =
    (fetchedRecords ?? []).length > 0 &&
    (closed ? hasChanges : hasChanges || unsavedDay) &&
    !isFutureBS(date) &&
    !dayLoading;

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

      {/* Closed day: informational. The list below is grey — nothing recorded, nobody assumed present. */}
      {closed && !isFutureBS(date) && !dayLoading && (
        <div className="card p-4 mb-4 border-slate-300 bg-slate-50">
          <p className="font-semibold text-slate-700">Closed: {(dayStatus?.reasons ?? []).map(reasonText).join(", ")}</p>
          <p className="text-sm text-slate-600 mt-1">
            Attendance isn&apos;t normally taken on this day. Press All Present, or click students individually, only if school was held.
          </p>
        </div>
      )}

      {dayLoading ? null : (<>
      {/* Unsaved-day notice */}
      {!closed && unsavedDay && !isFutureBS(date) && !loadingRecords && (
        <div className="card p-3 mb-4 border-amber-300 bg-amber-50 text-sm text-amber-800">
          Not saved yet. Everyone is shown present — click a student to mark them absent, then Save.
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
          disabled={saving || !canSave || loadingRecords}
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
                r.status === "ABSENT"
                  ? "border-red-200 bg-red-50/50"
                  : r.status === "PRESENT"
                  ? "border-emerald-200 bg-emerald-50/30"
                  : "border-gray-200 bg-gray-100 opacity-80"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-6 text-right">{r.rollNo || "—"}</span>
                <span className={`font-medium ${r.status === null ? "text-gray-500" : "text-gray-800"}`}>{r.studentName}</span>
              </div>
              <div
                className={`w-20 py-2 rounded-lg text-center text-xs font-bold transition-all ${
                  r.status === "ABSENT"
                    ? "bg-red-500 text-white"
                    : r.status === "PRESENT"
                    ? "bg-emerald-500 text-white"
                    : "bg-gray-300 text-gray-600"
                }`}
              >
                {r.status === "ABSENT" ? "ABSENT" : r.status === "PRESENT" ? "PRESENT" : "—"}
              </div>
            </div>
          ))
        )}
      </div>

      </>)}

      {/* Sticky Save Button for Mobile */}
      {canSave && (
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
      {canSave && <div className="h-20" />}
    </div>
  );
}