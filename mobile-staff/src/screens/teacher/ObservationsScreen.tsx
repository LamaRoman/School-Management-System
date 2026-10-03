import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { api, getErrorMessage } from '../../api/client';
import { Button, Card, EmptyState, ErrorState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import {
  GRADE_OPTIONS, ObsStudent, Edits, gradeOf, setGrade, fillBlank, toEntries, unsavedCount, gradedCount,
} from '../../utils/observationsForm';

// Class teacher grades each student on the school's observation categories (discipline,
// punctuality, ...) for one exam. One category at a time keeps the grade buttons big enough
// to tap. Only the cells the teacher changed are sent.

interface ClassSection { sectionId: string; sectionName: string; gradeName: string; academicYearId: string }
interface ExamType { id: string; name: string }
interface Category { id: string; name: string }
interface ResultData { categories: Category[]; students: ObsStudent[] }

export default function ObservationsScreen() {
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [examId, setExamId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [data, setData] = useState<ResultData | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);
  const requestId = useRef(0);

  const section = sections.find(s => s.sectionId === sectionId);
  const unsaved = unsavedCount(edits);

  const init = async () => {
    setInitLoading(true);
    setInitError(null);
    try {
      const res = await api.get<any>('/teacher-assignments/my');
      const secs: ClassSection[] = res.classTeacherSections || [];
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

  // Grades are written under the selected exam, so a late response for a previous
  // section/exam must never populate this one. Returns whether the load succeeded.
  const load = useCallback(async (): Promise<boolean> => {
    if (!sectionId || !examId) return false;
    const mine = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ResultData>(`/observations/results?sectionId=${sectionId}&examTypeId=${examId}`);
      if (mine !== requestId.current) return false;
      setData(res);
      setEdits({});
      setCategoryId(prev => (res.categories.some(c => c.id === prev) ? prev : res.categories[0]?.id || ''));
      return true;
    } catch (err) {
      if (mine === requestId.current) { setData(null); setError(getErrorMessage(err)); }
      return false;
    } finally {
      if (mine === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [sectionId, examId]);
  useEffect(() => { setData(null); setEdits({}); load(); }, [load]);

  const guarded = (go: () => void) => {
    if (unsaved === 0) { go(); return; }
    Alert.alert('Discard changes?', `You have ${unsaved} unsaved grade${unsaved === 1 ? '' : 's'}.`, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: go },
    ]);
  };

  const save = async () => {
    if (!section || !examId || !data || unsaved === 0) return;
    setSaving(true);
    try {
      const entries = toEntries(edits);
      await api.post('/observations/results/bulk', { examTypeId: examId, academicYearId: section.academicYearId, entries });
      const ok = await load(); // read back, so what is shown is what the server holds
      Alert.alert('Saved', ok
        ? `${entries.length} grade${entries.length === 1 ? '' : 's'} saved.`
        : "Grades were saved, but we couldn't reload them to double-check. Pull down to refresh.");
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (initLoading) return <LoadingScreen />;
  if (initError) return <ErrorState message={initError} onRetry={init} />;
  if (sections.length === 0) return <EmptyState icon="⭐" message="You are not a class teacher of any section." />;

  const category = data?.categories.find(c => c.id === categoryId);
  const students = data?.students ?? [];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => guarded(() => { setRefreshing(true); load(); })} />}
      >
        {sections.length > 1 && (
          <Pills items={sections.map(s => ({ id: s.sectionId, label: `${s.gradeName}-${s.sectionName}` }))} value={sectionId} onPick={id => guarded(() => setSectionId(id))} />
        )}
        <Pills items={examTypes.map(e => ({ id: e.id, label: e.name }))} value={examId} onPick={id => guarded(() => setExamId(id))} />

        {loading && !data && <Text style={styles.muted}>Loading…</Text>}
        {error && <ErrorState message={error} onRetry={load} />}

        {data && data.categories.length === 0 && (
          <EmptyState icon="⭐" message="No observation categories are set up for this grade. Ask the admin to add them under Observations." />
        )}

        {data && category && (
          <>
            <Pills
              items={data.categories.map(c => ({ id: c.id, label: `${c.name} ${gradedCount(students, edits, c.id)}/${students.length}` }))}
              value={categoryId}
              onPick={setCategoryId}
            />

            <TouchableOpacity onPress={() => setFillOpen(o => !o)} style={styles.fillToggle}>
              <Text style={styles.fillToggleText}>{fillOpen ? 'Hide' : 'Fill all empty with…'}</Text>
            </TouchableOpacity>
            {fillOpen && (
              <View style={styles.chips}>
                {GRADE_OPTIONS.map(g => (
                  <TouchableOpacity key={g} style={styles.fillChip} onPress={() => setEdits(e => fillBlank(students, e, category.id, g))}>
                    <Text style={styles.fillChipText}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {students.map(s => {
              const current = gradeOf(s, edits, category.id);
              const changed = edits[s.id]?.[category.id] !== undefined;
              return (
                <Card key={s.id} style={styles.card}>
                  <Text style={styles.name}>{s.rollNo != null ? `${s.rollNo}. ` : ''}{s.name}{changed ? '  •' : ''}</Text>
                  <View style={styles.chips}>
                    {GRADE_OPTIONS.map(g => (
                      <TouchableOpacity
                        key={g}
                        style={[styles.chip, current === g && styles.chipActive]}
                        onPress={() => setEdits(e => setGrade(e, s, category.id, g))}
                        accessibilityLabel={`${s.name} ${category.name} ${g}`}
                      >
                        <Text style={[styles.chipText, current === g && styles.chipTextActive]}>{g}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>

      {unsaved > 0 && (
        <View style={styles.saveBar}>
          <Text style={styles.saveInfo}>{unsaved} unsaved</Text>
          <Button title="Save" onPress={save} loading={saving} style={styles.saveBtn} />
        </View>
      )}
    </View>
  );
}

function Pills({ items, value, onPick }: { items: { id: string; label: string }[]; value: string; onPick: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow} style={styles.pills}>
      {items.map(i => (
        <TouchableOpacity key={i.id} style={[styles.pill, value === i.id && styles.pillActive]} onPress={() => onPick(i.id)}>
          <Text style={[styles.pillText, value === i.id && styles.pillTextActive]}>{i.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  pills: { marginBottom: Spacing.md },
  pillRow: { gap: Spacing.sm, flexDirection: 'row' },
  pill: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs, borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: FontSize.sm, color: Colors.textMuted },
  pillTextActive: { color: Colors.white, fontWeight: FontWeight.medium },
  muted: { color: Colors.textMuted, textAlign: 'center', padding: Spacing.lg, fontSize: FontSize.sm },
  fillToggle: { alignSelf: 'flex-start', paddingVertical: Spacing.xs, marginBottom: Spacing.sm },
  fillToggleText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  card: { marginBottom: Spacing.sm },
  name: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text, marginBottom: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  chip: { minWidth: 48, height: 44, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.sm },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: FontSize.md, color: Colors.text, fontWeight: FontWeight.medium },
  chipTextActive: { color: Colors.white, fontWeight: FontWeight.bold },
  fillChip: { minWidth: 48, height: 40, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.sm },
  fillChipText: { color: Colors.primary, fontWeight: FontWeight.semibold },
  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  saveInfo: { flex: 1, color: Colors.textMuted, fontSize: FontSize.sm },
  saveBtn: { minWidth: 120 },
});
