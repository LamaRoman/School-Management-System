import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, AppState,
} from 'react-native';
import { api, getErrorMessage } from '../../api/client';
import { Button, EmptyState, ErrorState, LoadingScreen, Row } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import { getTodayBS, getNextDayBS, getPreviousDayBS, isFutureBS, isTodayBS, formatBSDateLong } from '../../utils/bsDate';
import {
  ServerRecord, ShownRecord, withDefaults, toggled, countStatuses,
  unsavedCount, needsSave, toPayload, savedSummary, closedMode, reasonText, DayStatus,
} from '../../utils/attendanceForm';

interface Section { sectionId: string; sectionName: string; gradeName: string; academicYearId: string; }


export default function AttendanceScreen() {
  const [sections, setSections] = useState<Section[]>([]);
  const [selected, setSelected] = useState<Section | null>(null);
  const [date, setDate] = useState(getTodayBS());
  const [loadError, setLoadError] = useState<string | null>(null);
  const todayRef = useRef(getTodayBS());
  // Weekly day off / school holiday / public holiday? Informational: attendance is never
  // blocked, but on a closed day nobody has recorded we ask before showing the default
  // "everyone present" list, so a Saturday or holiday isn't saved by accident.
  const [day, setDay] = useState<DayStatus | null>(null);
  const [dayLoading, setDayLoading] = useState(true);
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const fetchSeq = useRef(0); // ignore a slow response for a day/section we've since left
  const [records, setRecords] = useState<ShownRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const loadSections = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.get<any>('/teacher-assignments/my');
      const secs = data.classTeacherSections || [];
      setSections(secs);
      if (secs.length > 0) setSelected(secs[0]);
    } catch (err) {
      setLoadError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSections(); }, []);

  useEffect(() => {
    if (selected) fetchAttendance(selected, date);
  }, [selected, date]);

  useEffect(() => {
    let ignore = false; // a newer date supersedes this response
    setDayLoading(true);
    setDay(null);
    api.get<DayStatus>(`/daily-attendance/day?date=${date}`)
      .then(d => { if (!ignore) setDay(d); })
      .catch(() => { if (!ignore) setDay(null); }) // can't tell: treat the day as open, never block on a failed lookup
      .finally(() => { if (!ignore) setDayLoading(false); });
    return () => { ignore = true; };
  }, [date]);

  // If the app stays open past midnight, a screen showing "today" should follow the
  // calendar rather than keep saving against yesterday.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = getTodayBS();
      if (now === todayRef.current) return;
      const wasOnToday = todayRef.current;
      todayRef.current = now;
      setDate(prev => (prev === wasOnToday ? now : prev));
    });
    return () => sub.remove();
  }, []);

  const fetchAttendance = async (sec: Section, d: string) => {
    const mine = ++fetchSeq.current;
    setFetching(true);
    try {
      const data = await api.get<any[]>(`/daily-attendance?sectionId=${sec.sectionId}&date=${d}&academicYearId=${sec.academicYearId}`);
      if (mine !== fetchSeq.current) return;
      setRecords(Array.isArray(data) ? withDefaults(data as ServerRecord[]) : []);
      setHasChanges(false);
      setLoadError(null);
    } catch (err) {
      if (mine !== fetchSeq.current) return;
      setRecords([]);
      setLoadError(getErrorMessage(err));
    } finally { if (mine === fetchSeq.current) setFetching(false); }
  };

  // Move to another day, asking first if there are unsaved marks on this one.
  const goToDate = (next: string) => {
    if (next === date || isFutureBS(next)) return;
    if (!hasChanges) { setDate(next); return; }
    Alert.alert('Discard changes?', 'You have unsaved attendance for this day.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setDate(next) },
    ]);
  };

  const toggleStatus = (studentId: string) => {
    setRecords(prev => prev.map(r => {
      if (r.studentId !== studentId) return r;
      return { ...r, status: toggled(r.status) };
    }));
    setHasChanges(true);
  };

  const markAll = (status: 'PRESENT' | 'ABSENT') => {
    setRecords(prev => prev.map(r => ({ ...r, status })));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selected || isFutureBS(date)) return;
    setSaving(true);
    try {
      await api.post('/daily-attendance/bulk', {
        sectionId: selected.sectionId,
        date,
        academicYearId: selected.academicYearId,
        records: toPayload(records),
      });
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
      setSaving(false);
      return;
    }

    // Read it back: show what the server now holds, not what we think we sent, so
    // "Saved" and the screen can never disagree with what is actually stored.
    try {
      fetchSeq.current++; // supersede any older in-flight load
      const data = await api.get<ServerRecord[]>(
        `/daily-attendance?sectionId=${selected.sectionId}&date=${date}&academicYearId=${selected.academicYearId}`,
      );
      const stored = withDefaults(Array.isArray(data) ? data : []);
      setRecords(stored);
      setHasChanges(false);
      const { present, absent } = countStatuses(stored);
      Alert.alert('Saved', savedSummary(present, absent));
    } catch {
      setHasChanges(false);
      Alert.alert('Saved', "Attendance was saved, but we couldn't reload it to double-check. Pull back to this screen to refresh.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingScreen />;
  if (loadError && sections.length === 0) return <ErrorState message={loadError} onRetry={loadSections} />;

  if (sections.length === 0) {
    return <EmptyState message="You are not assigned as class teacher for any section." icon="🏫" />;
  }

  const { present: presentCount, absent: absentCount } = countStatuses(records);
  const notSaved = unsavedCount(records);
  const mode = closedMode(day, records.some(r => r.isMarked), confirmedFor, date);
  const blocking = mode === 'blocking' && !isFutureBS(date);
  const showSave = needsSave(hasChanges, records) && !isFutureBS(date) && !blocking && !dayLoading;

  const takeAnyway = () => {
    const why = (day?.reasons ?? []).map(reasonText).join(', ');
    Alert.alert(
      'Take attendance on a closed day?',
      `${formatBSDateLong(date)} is closed: ${why}. Recording it will count as a school day in every student's attendance totals.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take attendance', onPress: () => setConfirmedFor(date) },
      ],
    );
  };

  return (
    <View style={styles.container}>
      {/* Section selector */}
      {sections.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectionBar} contentContainerStyle={styles.sectionBarContent}>
          {sections.map(sec => (
            <TouchableOpacity
              key={sec.sectionId}
              style={[styles.sectionPill, selected?.sectionId === sec.sectionId && styles.sectionPillActive]}
              onPress={() => setSelected(sec)}
            >
              <Text style={[styles.sectionPillText, selected?.sectionId === sec.sectionId && styles.sectionPillTextActive]}>
                {sec.gradeName}-{sec.sectionName}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Date + stats */}
      <View style={styles.statsBar}>
        <Row style={styles.dateNav}>
          <TouchableOpacity onPress={() => goToDate(getPreviousDayBS(date))} style={styles.dateBtn} accessibilityLabel="Previous day">
            <Text style={styles.dateBtnText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.dateCenter}>
            <Text style={styles.dateText}>{date}</Text>
            {isTodayBS(date) && <Text style={styles.todayTag}>Today</Text>}
          </View>
          <TouchableOpacity
            onPress={() => goToDate(getNextDayBS(date))}
            disabled={isTodayBS(date) || isFutureBS(date)}
            style={[styles.dateBtn, (isTodayBS(date) || isFutureBS(date)) && styles.dateBtnDisabled]}
            accessibilityLabel="Next day"
          >
            <Text style={styles.dateBtnText}>›</Text>
          </TouchableOpacity>
        </Row>
        {!blocking && <Row style={styles.countRow}>
          <View style={styles.countBadge}><Text style={[styles.countNum, { color: Colors.success }]}>{presentCount}</Text><Text style={styles.countLbl}>Present</Text></View>
          <View style={styles.countBadge}><Text style={[styles.countNum, { color: Colors.danger }]}>{absentCount}</Text><Text style={styles.countLbl}>Absent</Text></View>
        </Row>}
      </View>

      {/* Closed day */}
      {mode !== 'open' && !isFutureBS(date) && (
        <View style={styles.closedCard}>
          <Text style={styles.closedTitle}>Closed: {(day?.reasons ?? []).map(reasonText).join(', ')}</Text>
          {blocking ? (
            <>
              <Text style={styles.closedText}>No attendance is normally taken on this day.</Text>
              <TouchableOpacity onPress={takeAnyway} style={styles.closedBtn} accessibilityRole="button">
                <Text style={styles.closedBtnText}>Take attendance anyway</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.closedText}>Attendance is being recorded for this day anyway.</Text>
          )}
        </View>
      )}

      {/* Quick mark all */}
      {!blocking && !dayLoading && (
      <Row style={styles.markAllRow}>
        <TouchableOpacity style={[styles.markAllBtn, { backgroundColor: Colors.successBg }]} onPress={() => markAll('PRESENT')}>
          <Text style={[styles.markAllText, { color: Colors.success }]}>Mark All Present</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.markAllBtn, { backgroundColor: Colors.dangerBg }]} onPress={() => markAll('ABSENT')}>
          <Text style={[styles.markAllText, { color: Colors.danger }]}>Mark All Absent</Text>
        </TouchableOpacity>
      </Row>
      )}

      {/* A day nobody has saved yet shows everyone as present: say so, so a default is never mistaken for a record. */}
      {!blocking && !dayLoading && !fetching && !loadError && notSaved > 0 && !isFutureBS(date) && (
        <View style={styles.notSavedBanner}>
          <Text style={styles.notSavedText}>
            Not saved yet. Everyone is shown present — tap a student to mark them absent, then Save.
          </Text>
        </View>
      )}

      {/* Student list */}
      {blocking ? null : (fetching || dayLoading) ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={() => selected && fetchAttendance(selected, date)} />
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 100 }}>
          {records.map(r => (
            <TouchableOpacity
              key={r.studentId}
              style={[styles.studentRow, r.status === 'ABSENT' && styles.studentRowAbsent]}
              onPress={() => toggleStatus(r.studentId)}
              activeOpacity={0.7}
            >
              <View style={styles.rollBadge}>
                <Text style={styles.rollText}>{r.rollNo ?? '—'}</Text>
              </View>
              <Text style={styles.studentName}>{r.studentName}</Text>
              <View style={[styles.statusDot, { backgroundColor: r.status === 'ABSENT' ? Colors.danger : Colors.success }]} />
            </TouchableOpacity>
          ))}
          {records.length === 0 && !loadError && <EmptyState message="No students found in this section." icon="👥" />}
        </ScrollView>
      )}

      {/* Save button */}
      {showSave && (
        <View style={styles.saveBar}>
          <Button title={saving ? 'Saving...' : `Save Attendance (${presentCount} present, ${absentCount} absent)`} onPress={handleSave} loading={saving} style={styles.saveBtn} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  sectionBar: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sectionBarContent: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm, flexDirection: 'row' },
  sectionPill: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs, borderRadius: Radius.full, backgroundColor: Colors.borderLight, borderWidth: 1, borderColor: Colors.border },
  sectionPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sectionPillText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textMuted },
  sectionPillTextActive: { color: Colors.white },

  statsBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dateNav: { alignItems: 'center', gap: Spacing.sm },
  dateBtn: { width: 36, height: 36, borderRadius: Radius.full, backgroundColor: Colors.borderLight, alignItems: 'center', justifyContent: 'center' },
  dateBtnDisabled: { opacity: 0.35 },
  dateBtnText: { fontSize: 22, lineHeight: 24, color: Colors.primary, fontWeight: FontWeight.bold },
  dateCenter: { alignItems: 'center', minWidth: 96 },
  todayTag: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.medium },
  dateText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary },
  countRow: { gap: Spacing.lg },
  countBadge: { alignItems: 'center' },
  countNum: { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  countLbl: { fontSize: FontSize.xs, color: Colors.textMuted },

  markAllRow: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  markAllBtn: { flex: 1, paddingVertical: Spacing.xs, borderRadius: Radius.md, alignItems: 'center' },
  markAllText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  list: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  studentRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  studentRowAbsent: { backgroundColor: '#fff8f8', borderWidth: 1, borderColor: Colors.danger + '30' },
  rollBadge: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  rollText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary },
  studentName: { flex: 1, fontSize: FontSize.md, color: Colors.text },
  closedCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' },
  closedTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: '#334155' },
  closedText: { fontSize: FontSize.sm, color: '#475569', marginTop: 4, lineHeight: 20 },
  closedBtn: { alignSelf: 'flex-start', marginTop: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.white },
  closedBtnText: { color: Colors.primary, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  notSavedBanner: { marginHorizontal: Spacing.lg, marginTop: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55' },
  notSavedText: { fontSize: FontSize.sm, color: Colors.warning, lineHeight: 20 },
  statusDot: { width: 14, height: 14, borderRadius: 7 },

  saveBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.lg, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  saveBtn: { width: '100%' },
});
