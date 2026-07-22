"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, Edit2, X, ChevronLeft, ChevronRight } from "lucide-react";
import BSDatePicker from "@/components/ui/BSDatePicker";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  BS_MONTH_NAMES,
  getTodayBSParts,
  getDaysInBSMonth,
  getStartWeekday,
  formatBSDate,
  formatBSDateLong,
} from "@/lib/bsDate";

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // BS "YYYY/MM/DD"
  type: string;
  createdBy: { email: string };
}

const eventTypes = ["EVENT", "HOLIDAY", "MEETING", "EXAM", "OTHER"];

const typeColors: Record<string, string> = {
  EVENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  HOLIDAY: "bg-amber-50 text-amber-700 border-amber-200",
  MEETING: "bg-blue-50 text-blue-700 border-blue-200",
  EXAM: "bg-purple-50 text-purple-700 border-purple-200",
  OTHER: "bg-gray-100 text-gray-600 border-gray-200",
};

const typeDot: Record<string, string> = {
  EVENT: "bg-emerald-500",
  HOLIDAY: "bg-amber-500",
  MEETING: "bg-blue-500",
  EXAM: "bg-purple-500",
  OTHER: "bg-gray-400",
};

export default function CalendarPage() {
  const confirm = useConfirm();
  const today = getTodayBSParts();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewYear, setViewYear] = useState(today.year);
  const [viewMonth, setViewMonth] = useState(today.month);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", date: "", type: "EVENT" });

  const fetchEvents = async (year: number) => {
    try {
      const data = await api.get<CalendarEvent[]>(`/calendar-events?year=${year}`);
      setEvents(data);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchEvents(viewYear);
      setLoading(false);
    })();
  }, [viewYear]);

  const resetForm = () => {
    setForm({ title: "", description: "", date: "", type: "EVENT" });
    setEditingId(null);
    setShowForm(false);
  };

  const openNewEventOnDay = (day: number) => {
    resetForm();
    setForm((f) => ({ ...f, date: formatBSDate(viewYear, viewMonth, day) }));
    setShowForm(true);
  };

  const handleEdit = (ev: CalendarEvent) => {
    setForm({ title: ev.title, description: ev.description || "", date: ev.date, type: ev.type });
    setEditingId(ev.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.date) {
      toast.error("Title and date are required");
      return;
    }
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        date: form.date,
        type: form.type,
      };
      if (editingId) {
        await api.put(`/calendar-events/${editingId}`, payload);
        toast.success("Activity updated");
      } else {
        await api.post("/calendar-events", payload);
        toast.success("Activity added");
      }
      resetForm();
      await fetchEvents(viewYear);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirm({ title: "Delete activity", message: "This calendar activity will be permanently removed.", confirmLabel: "Delete", variant: "danger" })) return;
    try {
      await api.delete(`/calendar-events/${id}`);
      toast.success("Activity deleted");
      await fetchEvents(viewYear);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const goToPrevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const goToNextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const daysInMonth = getDaysInBSMonth(viewYear, viewMonth);
  const startWeekday = getStartWeekday(viewYear, viewMonth);

  const eventsByDate = (date: string) => events.filter((e) => e.date === date);

  const upcoming = [...events]
    .filter((e) => e.date >= formatBSDate(today.year, today.month, today.day))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary">Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">Plan and manage school activities, holidays, and events</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary text-xs">
          <Plus size={14} /> New Activity
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary">{editingId ? "Edit Activity" : "New Activity"}</h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="label">Title *</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. First Terminal Exam Begins" />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input min-h-[70px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional details..." />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Date (BS) *</label>
                <BSDatePicker value={form.date} onChange={(date) => setForm({ ...form, date })} placeholder="2082/01/15" />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {eventTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
              <div className="flex items-end justify-end">
                <button onClick={handleSubmit} className="btn-primary text-sm">
                  {editingId ? "Update Activity" : "Add Activity"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Month grid */}
        <div className="col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={goToPrevMonth} className="p-1.5 hover:bg-surface rounded-lg"><ChevronLeft size={18} className="text-gray-600" /></button>
            <h2 className="font-display font-bold text-primary text-lg">{BS_MONTH_NAMES[viewMonth - 1]} {viewYear}</h2>
            <button onClick={goToNextMonth} className="p-1.5 hover:bg-surface rounded-lg"><ChevronRight size={18} className="text-gray-600" /></button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className={`text-center text-xs font-medium py-1 ${d === "Sat" ? "text-red-500" : "text-gray-400"}`}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startWeekday }).map((_, i) => (<div key={`empty-${i}`} />))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = formatBSDate(viewYear, viewMonth, day);
              const dayEvents = eventsByDate(dateStr);
              const isToday = today.year === viewYear && today.month === viewMonth && today.day === day;
              const dayOfWeek = (startWeekday + i) % 7;
              const isSat = dayOfWeek === 6;

              return (
                <button
                  key={day}
                  onClick={() => openNewEventOnDay(day)}
                  className={`h-20 rounded-lg border p-1.5 text-left align-top transition-all hover:border-primary ${
                    isToday ? "border-primary bg-primary/5" : "border-gray-100"
                  }`}
                >
                  <div className={`text-xs font-semibold mb-1 ${isToday ? "text-primary" : isSat ? "text-red-500" : "text-gray-600"}`}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div key={ev.id} className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${typeDot[ev.type] || typeDot.OTHER}`} />
                        <span className="text-[10px] text-gray-600 truncate">{ev.title}</span>
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[10px] text-gray-400">+{dayEvents.length - 2} more</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar — planned activities */}
        <div className="card p-5">
          <h2 className="font-semibold text-primary mb-4">Planned Activities</h2>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {upcoming.map((ev) => (
              <div key={ev.id} className={`border rounded-lg p-3 ${typeColors[ev.type] || typeColors.OTHER}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium opacity-70">{formatBSDateLong(ev.date)}</div>
                    <div className="font-semibold text-sm truncate">{ev.title}</div>
                    {ev.description && <div className="text-xs mt-0.5 opacity-80 whitespace-pre-wrap">{ev.description}</div>}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => handleEdit(ev)} className="p-1 rounded hover:bg-white/60"><Edit2 size={12} /></button>
                    <button onClick={() => handleDelete(ev.id)} className="p-1 rounded hover:bg-white/60"><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            ))}
            {upcoming.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-8">No upcoming activities planned.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
