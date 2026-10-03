import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { api, getErrorMessage } from '../../api/client';
import { ErrorState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import {
  BS_MONTH_NAMES, getDaysInBSMonth, getStartWeekday, getTodayBS, parseBSDate, formatBSDateLong,
} from '../../utils/bsDate';
import {
  CalEvent, buildMonthCells, toWeeks, monthEvents, shiftMonth, dayLabel, coversDate,
} from '../../utils/calendarMonth';

// Read-only school calendar for staff: the school's own activities plus the national
// holidays, with the weekly days off shaded. The admin edits it on the web.

interface CalendarData { weeklyOffDays: number[]; events: CalEvent[] }

const TYPE_COLOR: Record<string, string> = {
  HOLIDAY: Colors.danger,
  EVENT: Colors.primary,
  MEETING: '#7c3aed',
  EXAM: Colors.warning,
  OTHER: Colors.textMuted,
};
const TYPE_LABEL: Record<string, string> = {
  HOLIDAY: 'Holiday', EVENT: 'Event', MEETING: 'Meeting', EXAM: 'Exam', OTHER: 'Other',
};

export default function CalendarScreen() {
  const today = getTodayBS();
  const todayParts = parseBSDate(today)!;
  const [year, setYear] = useState(todayParts.year);
  const [month, setMonth] = useState(todayParts.month);
  const [byYear, setByYear] = useState<Record<number, CalendarData>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const load = useCallback(async (y: number, force = false) => {
    if (!force && byYear[y]) { setLoading(false); return; }
    setError(null);
    try {
      const data = await api.get<CalendarData>(`/calendar-events/view?year=${y}`);
      setByYear(prev => ({ ...prev, [y]: data }));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [byYear]);

  useEffect(() => { setLoading(!byYear[year]); load(year); }, [year]);

  const data = byYear[year];
  const weeklyOff = data?.weeklyOffDays ?? [6];

  const { weeks, list } = useMemo(() => {
    const daysInMonth = getDaysInBSMonth(year, month);
    const startWeekday = getStartWeekday(year, month);
    const events = data?.events ?? [];
    const cells = buildMonthCells({ year, month, daysInMonth, startWeekday, weeklyOffDays: weeklyOff, events, today });
    return { weeks: toWeeks(cells, startWeekday), list: monthEvents(events, year, month) };
  }, [data, year, month, today]);

  const move = (delta: 1 | -1) => {
    const next = shiftMonth(year, month, delta);
    setSelectedDate(null);
    setYear(next.year);
    setMonth(next.month);
  };

  if (loading) return <LoadingScreen />;
  if (error && !data) return <ErrorState message={error} onRetry={() => { setLoading(true); load(year, true); }} />;

  const shown = selectedDate ? list.filter(e => coversDate(e, selectedDate)) : list;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(year, true); }} />}
    >
      {/* Month header */}
      <View style={styles.monthRow}>
        <TouchableOpacity onPress={() => move(-1)} style={styles.navBtn} accessibilityLabel="Previous month">
          <Text style={styles.navText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{BS_MONTH_NAMES[month - 1]} {year}</Text>
        <TouchableOpacity onPress={() => move(1)} style={styles.navBtn} accessibilityLabel="Next month">
          <Text style={styles.navText}>›</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.inlineError}>Couldn't refresh: {error}</Text>}

      {/* Weekday header */}
      <View style={styles.weekRow}>
        {[0, 1, 2, 3, 4, 5, 6].map(w => (
          <Text key={w} style={[styles.weekday, weeklyOff.includes(w) && styles.weekdayOff]}>{dayLabel(w)}</Text>
        ))}
      </View>

      {/* Grid */}
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((cell, ci) => {
            if (!cell) return <View key={ci} style={styles.cellWrap} />;
            const selected = selectedDate === cell.date;
            return (
              <View key={ci} style={styles.cellWrap}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setSelectedDate(selected ? null : cell.date)}
                  style={[
                    styles.cell,
                    cell.isWeeklyOff && styles.cellOff,
                    cell.hasHoliday && styles.cellHoliday,
                    cell.isToday && styles.cellToday,
                    selected && styles.cellSelected,
                  ]}
                >
                  <Text style={[styles.dayNum, (cell.isWeeklyOff || cell.hasHoliday) && styles.dayNumOff, cell.isToday && styles.dayNumToday]}>
                    {cell.day}
                  </Text>
                  <View style={styles.dots}>
                    {cell.events.slice(0, 3).map(e => (
                      <View key={e.id} style={[styles.dot, { backgroundColor: TYPE_COLOR[e.type] ?? Colors.textMuted }]} />
                    ))}
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ))}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.legendSwatch, styles.cellOff]} /><Text style={styles.legendText}>Weekly day off</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendSwatch, styles.cellHoliday]} /><Text style={styles.legendText}>Holiday</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendSwatch, styles.cellToday]} /><Text style={styles.legendText}>Today</Text></View>
      </View>

      {/* Events */}
      <Text style={styles.listTitle}>
        {selectedDate ? formatBSDateLong(selectedDate) : `${BS_MONTH_NAMES[month - 1]} ${year} — events`}
        {selectedDate ? '' : ` (${list.length})`}
      </Text>
      {shown.length === 0 ? (
        <Text style={styles.empty}>{selectedDate ? 'Nothing scheduled on this day.' : 'No events this month.'}</Text>
      ) : (
        shown.map(e => (
          <View key={e.id} style={[styles.eventCard, { borderLeftColor: TYPE_COLOR[e.type] ?? Colors.textMuted }]}>
            <View style={styles.eventHead}>
              <Text style={styles.eventDate}>{formatBSDateLong(e.date)}{e.endDate ? ` → ${formatBSDateLong(e.endDate)}` : ''}</Text>
              <Text style={[styles.eventType, { color: TYPE_COLOR[e.type] ?? Colors.textMuted }]}>
                {TYPE_LABEL[e.type] ?? e.type}{e.isMaster ? ' · national' : ''}
              </Text>
            </View>
            <Text style={styles.eventTitle}>{e.title}</Text>
            {!!e.description && <Text style={styles.eventDesc}>{e.description}</Text>}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  navBtn: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 24, lineHeight: 26, color: Colors.primary, fontWeight: FontWeight.bold },
  monthTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary },
  inlineError: { color: Colors.danger, fontSize: FontSize.sm, marginBottom: Spacing.sm },

  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: FontSize.xs, color: Colors.textMuted, paddingVertical: Spacing.xs },
  weekdayOff: { color: Colors.danger },

  cellWrap: { flex: 1, aspectRatio: 0.85, padding: 2 },
  cell: { flex: 1, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  cellOff: { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' },
  cellHoliday: { backgroundColor: Colors.dangerBg, borderColor: '#fecaca' },
  cellToday: { borderColor: Colors.primary, borderWidth: 2 },
  cellSelected: { backgroundColor: Colors.primary + '18' },
  dayNum: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  dayNumOff: { color: Colors.danger },
  dayNumToday: { color: Colors.primary },
  dots: { flexDirection: 'row', gap: 2, height: 6, marginTop: 3 },
  dot: { width: 5, height: 5, borderRadius: 3 },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  legendText: { fontSize: FontSize.xs, color: Colors.textMuted },

  listTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text, marginBottom: Spacing.sm },
  empty: { color: Colors.textMuted, fontSize: FontSize.sm, paddingVertical: Spacing.md },
  eventCard: { backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4, padding: Spacing.md, marginBottom: Spacing.sm },
  eventHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  eventDate: { fontSize: FontSize.xs, color: Colors.textMuted },
  eventType: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  eventTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  eventDesc: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4, lineHeight: 20 },
});
