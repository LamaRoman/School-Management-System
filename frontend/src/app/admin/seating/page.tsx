"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, Printer, Shuffle, X } from "lucide-react";

interface ExamType { id: string; name: string }
interface Grade { id: string; name: string; displayOrder: number }
interface Room { id: string; name: string; capacity: number; displayOrder: number }
interface RoomAllocation {
  room: { id: string; name: string; capacity: number };
  students: {
    id: string;
    name: string;
    nameNp?: string;
    rollNo?: number;
    className: string;
    section: string;
    seatNumber?: number;
  }[];
  filled: number;
}

export default function SeatingPage() {
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [method, setMethod] = useState<"alternating" | "sequential" | "random">("alternating");
  const [allocations, setAllocations] = useState<RoomAllocation[]>([]);
  const [activeYear, setActiveYear] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Room form
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomCapacity, setRoomCapacity] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const year = await api.get<any>("/academic-years/active");
        setActiveYear(year);
        if (year) {
          const [et, g, r] = await Promise.all([
            api.get<ExamType[]>(`/exam-types?academicYearId=${year.id}`),
            api.get<Grade[]>(`/grades?academicYearId=${year.id}`),
            api.get<Room[]>("/seating/rooms"),
          ]);
          setExamTypes(et);
          setGrades(g);
          setRooms(r);
        }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const fetchAllocations = async (examTypeId: string) => {
    if (!activeYear) return;
    try {
      const data = await api.get<RoomAllocation[]>(
        `/seating/allocations?examTypeId=${examTypeId}&academicYearId=${activeYear.id}`
      );
      setAllocations(data);
    } catch {
      setAllocations([]);
    }
  };

  const handleExamChange = (examTypeId: string) => {
    setSelectedExam(examTypeId);
    if (examTypeId) {
      fetchAllocations(examTypeId);
    } else {
      setAllocations([]);
    }
  };

  const toggleGrade = (gradeId: string) => {
    setSelectedGrades((prev) =>
      prev.includes(gradeId) ? prev.filter((id) => id !== gradeId) : [...prev, gradeId]
    );
  };

  const selectAllGrades = () => {
    if (selectedGrades.length === grades.length) {
      setSelectedGrades([]);
    } else {
      setSelectedGrades(grades.map((g) => g.id));
    }
  };

  const handleAddRoom = async () => {
    if (!roomName.trim() || !roomCapacity) return;
    try {
      const room = await api.post<Room>("/seating/rooms", {
        name: roomName.trim(),
        capacity: parseInt(roomCapacity),
        displayOrder: rooms.length,
      });
      setRooms((prev) => [...prev, room]);
      setRoomName("");
      setRoomCapacity("");
      setShowRoomForm(false);
      toast.success("Room added");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (!confirm("Remove this room?")) return;
    try {
      await api.delete(`/seating/rooms/${id}`);
      setRooms((prev) => prev.filter((r) => r.id !== id));
      toast.success("Room removed");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleGenerate = async () => {
    if (!selectedExam || !activeYear || selectedGrades.length === 0) {
      toast.error("Select an exam type and at least one grade");
      return;
    }
    if (rooms.length === 0) {
      toast.error("Add at least one exam room first");
      return;
    }
    setGenerating(true);
    try {
      const result = await api.post<any>("/seating/generate", {
        examTypeId: selectedExam,
        academicYearId: activeYear.id,
        gradeIds: selectedGrades,
        method,
      });
      toast.success(result.message);
      await fetchAllocations(selectedExam);
    } catch (err: any) {
      toast.error(err.message);
    } finally { setGenerating(false); }
  };

  const handleClear = async () => {
    if (!selectedExam || !activeYear) return;
    if (!confirm("Clear all seating allocations for this exam?")) return;
    try {
      await api.delete(`/seating/allocations?examTypeId=${selectedExam}&academicYearId=${activeYear.id}`);
      setAllocations([]);
      toast.success("Seating arrangement cleared");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const selectedExamName = examTypes.find((e) => e.id === selectedExam)?.name || "";
  const totalAllocated = allocations.reduce((sum, a) => sum + a.filled, 0);

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Exam Seating Arrangement</h1>
          <p className="text-sm text-gray-500 mt-1">Auto-generate seating plans by shuffling students across rooms</p>
        </div>
        {allocations.length > 0 && (
          <div className="flex gap-2">
            <button onClick={handleClear} className="btn-ghost text-xs text-red-500">
              <Trash2 size={14} /> Clear
            </button>
            <button onClick={handlePrint} className="btn-outline text-xs">
              <Printer size={14} /> Print
            </button>
          </div>
        )}
      </div>

      {/* Rooms management */}
      <div className="card p-5 mb-6 no-print">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-primary">Exam Rooms ({rooms.length})</h2>
          <button onClick={() => setShowRoomForm(!showRoomForm)} className="btn-ghost text-xs">
            <Plus size={14} /> Add Room
          </button>
        </div>

        {showRoomForm && (
          <div className="flex gap-3 mb-3 items-end">
            <div>
              <label className="label">Room Name</label>
              <input className="input" value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="e.g., Room 1" />
            </div>
            <div>
              <label className="label">Capacity</label>
              <input className="input w-24" type="number" value={roomCapacity} onChange={(e) => setRoomCapacity(e.target.value)} placeholder="30" />
            </div>
            <button onClick={handleAddRoom} className="btn-primary text-xs">Add</button>
            <button onClick={() => { setShowRoomForm(false); setRoomName(""); setRoomCapacity(""); }} className="btn-ghost text-xs"><X size={14} /></button>
          </div>
        )}

        {rooms.length === 0 ? (
          <p className="text-sm text-gray-400">No rooms defined. Add rooms before generating seating.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {rooms.map((room) => (
              <div key={room.id} className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded-lg text-sm">
                <span className="font-medium text-primary">{room.name}</span>
                <span className="text-xs text-gray-400">({room.capacity} seats)</span>
                <button onClick={() => handleDeleteRoom(room.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <span className="text-xs text-gray-400 self-center ml-2">
              Total: {rooms.reduce((s, r) => s + r.capacity, 0)} seats
            </span>
          </div>
        )}
      </div>

      {/* Generate controls */}
      <div className="card p-5 mb-6 no-print">
        <h2 className="font-semibold text-primary mb-3">Generate Seating</h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="label">Exam Type</label>
            <select className="input" value={selectedExam} onChange={(e) => handleExamChange(e.target.value)}>
              <option value="">Select Exam</option>
              {examTypes.map((et) => (
                <option key={et.id} value={et.id}>{et.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Shuffle Method</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value as any)}>
              <option value="alternating">Alternating Sections</option>
              <option value="sequential">Sequential (by roll)</option>
              <option value="random">Random</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={handleGenerate} disabled={generating || !selectedExam || selectedGrades.length === 0}
              className="btn-primary text-sm w-full">
              <Shuffle size={16} /> {generating ? "Generating..." : "Generate Seating"}
            </button>
          </div>
        </div>

        {/* Grade selection */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <label className="label mb-0">Select Grades</label>
            <button onClick={selectAllGrades} className="text-xs text-primary hover:underline">
              {selectedGrades.length === grades.length ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {grades.map((g) => (
              <button key={g.id} onClick={() => toggleGrade(g.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  selectedGrades.includes(g.id)
                    ? "bg-primary text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-primary"
                }`}>
                {g.name}
              </button>
            ))}
          </div>
          {selectedGrades.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">{selectedGrades.length} grade(s) selected</p>
          )}
        </div>
      </div>

      {/* Printable header */}
      {allocations.length > 0 && (
        <div className="hidden print:block text-center mb-4">
          <h2 className="text-lg font-bold text-primary">{selectedExamName} — Exam Seating Arrangement</h2>
          <p className="text-sm">Total Students: {totalAllocated}</p>
        </div>
      )}

      {/* Allocation results */}
      {allocations.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between no-print">
            <h2 className="font-semibold text-primary">
              Seating Plan — {totalAllocated} Students in {allocations.length} Rooms
            </h2>
          </div>

          {allocations.map((alloc) => (
            <div key={alloc.room.id} className="card overflow-hidden">
              <div className="bg-primary text-white px-4 py-2 flex items-center justify-between">
                <span className="font-semibold text-sm">{alloc.room.name}</span>
                <span className="text-xs opacity-80">{alloc.filled} / {alloc.room.capacity} seats</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <th className="text-left px-4 py-2">Seat</th>
                    <th className="text-left px-4 py-2">Student Name</th>
                    <th className="text-left px-4 py-2">Class</th>
                    <th className="text-left px-4 py-2">Section</th>
                    <th className="text-left px-4 py-2">Roll No.</th>
                  </tr>
                </thead>
                <tbody>
                  {alloc.students.map((stu, i) => (
                    <tr key={stu.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
                      <td className="px-4 py-1.5 text-gray-400">{stu.seatNumber || i + 1}</td>
                      <td className="px-4 py-1.5 font-medium text-primary">{stu.name}</td>
                      <td className="px-4 py-1.5">{stu.className}</td>
                      <td className="px-4 py-1.5">{stu.section}</td>
                      <td className="px-4 py-1.5">{stu.rollNo || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {selectedExam && allocations.length === 0 && (
        <div className="card p-8 text-center text-gray-400 no-print">
          No seating arrangement generated for this exam yet. Select grades and click Generate.
        </div>
      )}
    </div>
  );
}