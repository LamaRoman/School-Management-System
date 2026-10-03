import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { api, getErrorMessage } from '../../api/client';
import { Button, Card, EmptyState, ErrorState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import {
  ResultStatus, SubjectRow, statusInfo, availableAction, missingLine, progressFraction,
} from '../../utils/resultsView';

// Class teacher: see how complete a section's marks are for an exam, then mark it complete
// (or re-open it). An admin publishes on the web. Mirrors the web "Results" page.

interface ClassSection { assignmentId: string; sectionId: string; sectionName: string; gradeName: string; academicYearId: string }
interface ExamType { id: string; name: string }
interface StatusData {
  status: ResultStatus;
  markedReadyBy: string | null;
  completeness: { totalStudents: number; totalSubjects: number; subjectsComplete: number; missingCount: number; bySubject: SubjectRow[] };
}

const TONE: Record<string, string> = { muted: Colors.textMuted, info: Colors.primary, success: Colors.success };

export default function ResultsScreen() {
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [examId, setExamId] = useState('');
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const init = async () => {
    setInitLoading(true);
    setInitError(null);
    try {
      const data = await api.get<any>('/teacher-assignments/my');
      const secs: ClassSection[] = data.classTeacherSections || [];
      setSections(secs);
      if (secs.length > 0) {
        setSectionId(prev => prev || secs[0].sectionId);
        const ets = await api.get<ExamType[]>(`/exam-types?academicYearId=${secs[0].academicYearId}`);
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

  // The buttons below write, so a late response for a previous selection must never be shown
  // under the new one (it could lead to marking the wrong class complete).
  const loadStatus = useCallback(async () => {
    if (!sectionId || !examId) { setStatus(null); return; }
    const mine = ++requestId.current;
    setStatusLoading(true);
    setStatusError(null);
    setStatus(null);
    try {
      const data = await api.get<StatusData>(`/result-status/section/${sectionId}/${examId}`);
      if (mine === requestId.current) setStatus(data);
    } catch (err) {
      if (mine === requestId.current) setStatusError(getErrorMessage(err));
    } finally {
      if (mine === requestId.current) { setStatusLoading(false); setRefreshing(false); }
    }
  }, [sectionId, examId]);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const act = async (path: 'ready' | 'reopen') => {
    setSaving(true);
    try {
      await api.post(`/result-status/${path}`, { sectionId, examTypeId: examId });
      await loadStatus();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (initLoading) return <LoadingScreen />;
  if (initError) return <ErrorState message={initError} onRetry={init} />;
  if (sections.length === 0) return <EmptyState icon="📋" message="You are not a class teacher of any section." />;

  const c = status?.completeness;
  const info = status ? statusInfo(status.status, status.markedReadyBy) : null;
  const action = status ? availableAction(status.status) : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStatus(); }} />}
    >
      <Text style={styles.intro}>Mark an exam complete when marks entry is done. An admin publishes it to parents and students.</Text>

      {sections.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow} style={styles.pills}>
          {sections.map(s => (
            <TouchableOpacity key={s.sectionId} style={[styles.pill, sectionId === s.sectionId && styles.pillActive]} onPress={() => setSectionId(s.sectionId)}>
              <Text style={[styles.pillText, sectionId === s.sectionId && styles.pillTextActive]}>{s.gradeName}-{s.sectionName}</Text>
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

      {statusLoading && <Text style={styles.muted}>Loading…</Text>}
      {statusError && <ErrorState message={statusError} onRetry={loadStatus} />}

      {status && c && info && (
        <>
          <Card style={styles.card}>
            <Text style={[styles.statusTitle, { color: TONE[info.tone] }]}>{info.title}</Text>
            <Text style={styles.statusDetail}>{info.detail}</Text>
            {action === 'ready' && <Button title="Mark complete" onPress={() => act('ready')} loading={saving} style={styles.actionBtn} />}
            {action === 'reopen' && <Button title="Re-open for entry" variant="outline" onPress={() => act('reopen')} loading={saving} style={styles.actionBtn} />}
          </Card>

          <Card style={styles.card}>
            <View style={styles.progressHead}>
              <Text style={styles.progressTitle}>{c.subjectsComplete} of {c.totalSubjects} subjects fully entered</Text>
              <Text style={[styles.progressNote, { color: c.missingCount === 0 ? Colors.success : Colors.warning }]}>
                {c.missingCount === 0 ? 'Nothing missing' : `${c.missingCount} marks missing`}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, {
                width: `${progressFraction(c.subjectsComplete, c.totalSubjects) * 100}%`,
                backgroundColor: c.subjectsComplete === c.totalSubjects ? Colors.success : Colors.warning,
              }]} />
            </View>
            {c.missingCount > 0 && status.status === 'DRAFT' && (
              <Text style={styles.hint}>You can still mark this complete — some gaps are legitimate, like a student who joined after the exam.</Text>
            )}
            {c.bySubject.map(s => {
              const missing = missingLine(s);
              return (
                <View key={s.subjectId} style={styles.subjectRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subjectName}>{s.subjectName}{s.isOptional ? '  · optional' : ''}</Text>
                    {missing && <Text style={styles.missing}>{missing}</Text>}
                  </View>
                  <Text style={[styles.count, { color: s.entered === s.expected ? Colors.success : Colors.warning }]}>{s.entered}/{s.expected}</Text>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  intro: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md, lineHeight: 20 },
  pills: { marginBottom: Spacing.md },
  pillRow: { gap: Spacing.sm, flexDirection: 'row' },
  pill: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs, borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: FontSize.sm, color: Colors.textMuted },
  pillTextActive: { color: Colors.white, fontWeight: FontWeight.medium },
  muted: { color: Colors.textMuted, textAlign: 'center', padding: Spacing.lg },
  card: { marginBottom: Spacing.md },
  statusTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  statusDetail: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4, lineHeight: 20 },
  actionBtn: { marginTop: Spacing.md },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm, gap: Spacing.sm },
  progressTitle: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },
  progressNote: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  track: { height: 8, backgroundColor: Colors.borderLight, borderRadius: 4, overflow: 'hidden', marginBottom: Spacing.md },
  fill: { height: 8, borderRadius: 4 },
  hint: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm, lineHeight: 18 },
  subjectRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingVertical: Spacing.sm },
  subjectName: { fontSize: FontSize.md, color: Colors.text, fontWeight: FontWeight.medium },
  missing: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  count: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
