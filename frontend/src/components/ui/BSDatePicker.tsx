"use client";
import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import {
  BS_MONTH_NAMES,
  parseBSDate,
  formatBSDate,
  getTodayBS,
  getTodayBSParts,
} from "@/lib/bsDate";
import NepaliDate from "nepali-date-converter";

// ─── Days-in-month lookup ──────────────────────────────
// nepali-date-converter supports 2000–2090 BS
// We probe the library to find exact days per month

function getDaysInBSMonth(year: number, month: number): number {
  // month is 1-indexed (1=Baisakh, 12=Chaitra)
  // Try day 32 down to 28 to find the last valid day
  for (let day = 32; day >= 28; day--) {
    try {
      new NepaliDate(year, month - 1, day);
      return day;
    } catch {
      continue;
    }
  }
  return 30; // fallback
}

function getStartWeekday(year: number, month: number): number {
  // Returns 0=Sunday, 1=Monday, ... 6=Saturday
  try {
    const nd = new NepaliDate(year, month - 1, 1);
    return nd.toJsDate().getDay();
  } catch {
    return 0;
  }
}

// ─── Props ─────────────────────────────────────────────

interface BSDatePickerProps {
  value: string; // "YYYY/MM/DD" or ""
  onChange: (date: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  disableFuture?: boolean; // disable dates after today
  className?: string;
}

// ─── Component ─────────────────────────────────────────

export default function BSDatePicker({
  value,
  onChange,
  placeholder = "YYYY/MM/DD",
  label,
  required,
  disabled,
  disableFuture = false,
  className = "",
}: BSDatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Parse current value or default to today for calendar view
  const today = getTodayBSParts();
  const parsed = value ? parseBSDate(value) : null;
  const [viewYear, setViewYear] = useState(parsed?.year || today.year);
  const [viewMonth, setViewMonth] = useState(parsed?.month || today.month);

  // Sync view when value changes externally
  useEffect(() => {
    if (value) {
      const p = parseBSDate(value);
      if (p) {
        setViewYear(p.year);
        setViewMonth(p.month);
      }
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Navigation
  const goToPrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const selectDay = (day: number) => {
    const dateStr = formatBSDate(viewYear, viewMonth, day);
    onChange(dateStr);
    setOpen(false);
  };

  const selectToday = () => {
    const todayStr = getTodayBS();
    onChange(todayStr);
    setViewYear(today.year);
    setViewMonth(today.month);
    setOpen(false);
  };

  // Build calendar grid
  const daysInMonth = getDaysInBSMonth(viewYear, viewMonth);
  const startWeekday = getStartWeekday(viewYear, viewMonth);
  const todayStr = getTodayBS();

  const isSelected = (day: number) => {
    if (!parsed) return false;
    return parsed.year === viewYear && parsed.month === viewMonth && parsed.day === day;
  };

  const isDayToday = (day: number) => {
    return today.year === viewYear && today.month === viewMonth && today.day === day;
  };

  const isDayDisabled = (day: number) => {
    if (!disableFuture) return false;
    const dateStr = formatBSDate(viewYear, viewMonth, day);
    // Compare with today
    if (viewYear > today.year) return true;
    if (viewYear === today.year && viewMonth > today.month) return true;
    if (viewYear === today.year && viewMonth === today.month && day > today.day) return true;
    return false;
  };

  // Year options: current year ± 10
  const yearOptions: number[] = [];
  for (let y = today.year - 10; y <= today.year + 5; y++) {
    yearOptions.push(y);
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      {label && (
        <label className="label">
          {label} {required && "*"}
        </label>
      )}
      <div
        className={`input flex items-center gap-2 cursor-pointer ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        onClick={() => !disabled && setOpen(!open)}
      >
        <Calendar size={16} className="text-gray-400 shrink-0" />
        <span className={value ? "text-gray-800" : "text-gray-400"}>
          {value || placeholder}
        </span>
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-3 w-[300px]">
          {/* Year + Month selectors */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={goToPrevMonth}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <ChevronLeft size={18} className="text-gray-600" />
            </button>

            <div className="flex items-center gap-1">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="text-sm font-semibold text-primary bg-transparent border-none cursor-pointer focus:outline-none"
              >
                {BS_MONTH_NAMES.map((name, i) => (
                  <option key={i} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="text-sm font-semibold text-primary bg-transparent border-none cursor-pointer focus:outline-none"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={goToNextMonth}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div
                key={d}
                className={`text-center text-xs font-medium py-1 ${
                  d === "Sat" ? "text-red-500" : "text-gray-400"
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {/* Empty cells for start offset */}
            {Array.from({ length: startWeekday }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayOfWeek = (startWeekday + i) % 7;
              const isSat = dayOfWeek === 6;
              const selected = isSelected(day);
              const isToday = isDayToday(day);
              const dayDisabled = isDayDisabled(day);

              return (
                <button
                  key={day}
                  type="button"
                  disabled={dayDisabled}
                  onClick={() => selectDay(day)}
                  className={`
                    h-8 w-full text-sm rounded transition-all
                    ${selected
                      ? "bg-primary text-white font-bold"
                      : isToday
                        ? "bg-primary/10 text-primary font-semibold"
                        : dayDisabled
                          ? "text-gray-300 cursor-not-allowed"
                          : isSat
                            ? "text-red-500 hover:bg-red-50"
                            : "text-gray-700 hover:bg-gray-100"
                    }
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Today button */}
          <div className="mt-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={selectToday}
              className="w-full text-xs text-primary font-medium hover:bg-primary/5 py-1 rounded transition-all"
            >
              आज (Today)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}