import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { api, getErrorMessage } from '../../api/client';
import { Card, EmptyState, ErrorState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import { formatBSDateLong, getTodayBS } from '../../utils/bsDate';
import { GradeRef, RoutineEntry, teacherGrades, timeRange, sortRoutine, isUpcoming } from '../../utils/examRoutine';

// Read-only exam timetable for the grades a teacher teaches. The admin sets it on the web.

interface ExamType { id: string; name: string }

export default function ExamRoutineScreen() {
  const [grades, setGrades] = useState<GradeRef[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [gradeId, setGradeId] = useState('');
  const [examId, setExamId] = useState('');
  const [entries, setEntries] = useState<RoutineEntry[]>([]);
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  const today = getTodayBS();

  const init = async () => {
    setInitLoading(true);
    setInitError(null);
    try {
      const data = await api.get<any>('/teacher-assignments/my');
      const gs = teacherGrades(data.classTeacherSections || [], data.subjectAssignments || []);
      setGrades(gs);
      if (gs.length > 0) {
        setGradeId(prev => prev || gs[0].gradeId);
        const ets = await api.get<ExamType[]>(`/exam-types?academicYearId=${gs[0].academicYearId}`);
        setExamTypes(ets);
        setExamId(prev => prev || ets[0]?.id || '');
      }
    } catch (err) {
      setInitError(getErrorMessage(err));
    } finally {
      setInitLoading(false);
    }
  };
  useEffect(() => { init(); }, []);

  // Newest selection wins: a late response for a previous grade/exam is dropped.
  const load = useCallback(async () => {
    if (!gradeId || !examId) return;
    const mine = ++requestId.current;
    setLoading(true);
    setError(null);
    setEntries([]);
    try {
      const data = await api.get<RoutineEntry[]>(`/exam-routine?examTypeId=${examId}&gradeId=${gradeId}`);
      if (mine === requestId.current) setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      if (mine === requestId.current) setError(getErrorMessage(err));
    } finally {
      if (mine === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [gradeId, examId]);
  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => sortRoutine(entries), [entries]);

  if (initLoading) return <LoadingScreen />;
  if (initError) return <ErrorState message={initError} onRetry={init} />;
  if (grades.length === 0) return <EmptyState icon="🗓️" message="You have no classes assigned yet." />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {grades.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow} style={styles.pills}>
          {grades.map(g => (
            <TouchableOpacity key={g.gradeId} style={[styles.pill, gradeId === g.gradeId && styles.pillActive]} onPress={() => setGradeId(g.gradeId)}>
              <Text style={[styles.pillText, gradeId === g.gradeId && styles.pillTextActive]}>Class {g.gradeName}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow} style={styles.pills}>
        {examTypes.map(et => (
          <TouchableOpacity key={et.id} style={[styles.pill, examId === et.id && styles.pillActive]} onPress={() => setExamId(et.id)}>
            <Text style={[styles.pillText, examId === et.id && styles.pillTextActive]}>{et.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && <Text style={styles.muted}>Loading…</Text>}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && sorted.length === 0 && <Text style={styles.muted}>No routine has been set for this exam yet.</Text>}

      {sorted.map(e => {
        const when = timeRange(e);
        const upcoming = isUpcoming(e, today);
        return (
          <Card key={e.id} style={upcoming ? styles.card : styles.cardPast}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.subject}>{e.subject.name}</Text>
                <Text style={styles.date}>
                  {formatBSDateLong(e.examDate)}{e.dayName ? ` · ${e.dayName}` : ''}
                </Text>
              </View>
              {!!when && <Text style={styles.time}>{when}</Text>}
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  pills: { marginBottom: Spacing.md },
  pillRow: { gap: Spacing.sm, flexDirection: 'row' },
  pill: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs, borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: FontSize.sm, color: Colors.textMuted },
  pillTextActive: { color: Colors.white, fontWeight: FontWeight.medium },
  muted: { color: Colors.textMuted, textAlign: 'center', padding: Spacing.lg, fontSize: FontSize.sm },
  card: { marginBottom: Spacing.sm },
  cardPast: { marginBottom: Spacing.sm, opacity: 0.75 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  subject: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  date: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  time: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.primary },
});
