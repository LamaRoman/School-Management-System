import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert,
} from 'react-native';
import { api, getErrorMessage } from '../../api/client';
import { Button, EmptyState, ErrorState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import {
  MarkEntry, ExistingMark, buildMarksForm, emptyEntry,
  overFullMarks, unparseableMarks, toBulkPayload,
} from '../../utils/marksForm';

interface Assignment {
  assignmentId: string; sectionId: string; sectionName: string; gradeId: string; gradeName: string;
  academicYearId: string; subjectId: string; subjectName: string; fullTheoryMarks: number; fullPracticalMarks: number;
  isTemporary?: boolean; expiresAt?: string | null;
}
interface ExamType { id: string; name: string; }
interface Student { id: string; name: string; rollNo?: number; }

// 'ready' means the roster AND the existing marks for the selected class + exam both
// loaded. Saving is only allowed then: a form that failed to load looks empty, and
// saving it would overwrite real marks with blanks.
type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export default function MarksScreen() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<string, MarkEntry>>({});
  const [selectedAssignment, setSelectedAssignment] = useState('');
  const [selectedExam, setSelectedExam] = useState('');
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [formState, setFormState] = useState<LoadState>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);

  const loadAssignments = async () => {
    setLoading(true);
    setInitError(null);
    try {
      const data = await api.get<any>('/teacher-assignments/my');
      const subs: Assignment[] = data.subjectAssignments || [];
      setAssignments(subs);
      if (subs.length > 0) {
        const et = await api.get<ExamType[]>(`/exam-types?academicYearId=${subs[0].academicYearId}`);
        setExamTypes(et);
      }
    } catch (err) {
      setInitError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAssignments(); }, []);

  const current = assignments.find(a => a.assignmentId === selectedAssignment);

  // Roster + existing marks for the selected class, subject and exam. Rebuilt from
  // scratch every time the selection changes — never merged into the previous form.
  const requestId = useRef(0);
  useEffect(() => {
    if (!current || !selectedExam) { setFormState('idle'); return; }
    const mine = ++requestId.current; // a newer selection supersedes this response
    setMarks({});
    setStudents([]);
    setFormError(null);
    setFormState('loading');
    (async () => {
      try {
        // subjectId narrows an OPTIONAL subject to the students who take it; without
        // it the server rejects the whole save for every student who doesn't.
        const [stus, existing] = await Promise.all([
          api.get<Student[]>(`/students?sectionId=${current.sectionId}&subjectId=${current.subjectId}`),
          api.get<any[]>(`/marks?sectionId=${current.sectionId}&subjectId=${current.subjectId}&examTypeId=${selectedExam}`),
        ]);
        if (mine !== requestId.current) return;
        const saved: ExistingMark[] = (Array.isArray(existing) ? existing : []).map(m => ({
          studentId: m.studentId, theoryMarks: m.theoryMarks, practicalMarks: m.practicalMarks, isAbsent: !!m.isAbsent,
        }));
        setStudents(stus);
        setMarks(buildMarksForm(stus.map(s => s.id), saved));
        setFormState('ready');
      } catch (err) {
        if (mine !== requestId.current) return;
        setFormError(getErrorMessage(err));
        setFormState('error');
      }
    })();
  }, [selectedAssignment, selectedExam, reload]);

  const updateMark = (studentId: string, field: keyof MarkEntry, value: string | boolean) => {
    setMarks(prev => ({ ...prev, [studentId]: { ...(prev[studentId] ?? emptyEntry()), [field]: value } }));
  };

  const handleSave = async () => {
    if (!current || !selectedExam || formState !== 'ready') return;

    if (unparseableMarks(marks).length > 0) {
      Alert.alert('Invalid marks', 'Some marks are not valid numbers. Please check.');
      return;
    }
    const over = overFullMarks(marks, current.fullTheoryMarks, current.fullPracticalMarks);
    if (over.length > 0) {
      Alert.alert('Invalid marks', `Marks exceed full marks for ${over.length} student(s). Please check.`);
      return;
    }

    setSaving(true);
    try {
      await api.post('/marks/bulk', {
        subjectId: current.subjectId,
        examTypeId: selectedExam,
        academicYearId: current.academicYearId,
        marks: toBulkPayload(students.map(s => s.id), marks),
      });
      Alert.alert('Saved', 'Marks saved successfully.');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally { setSaving(false); }
  };

  if (loading) return <LoadingScreen />;
  if (initError) return <ErrorState message={initError} onRetry={loadAssignments} />;
  if (assignments.length === 0) return <EmptyState message="No subject assignments found. Contact admin." icon="📝" />;

  const hasPractical = current && current.fullPracticalMarks > 0;
  const ready = formState === 'ready';

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Assignment selector */}
        <View style={styles.section}>
          <Text style={styles.label}>Class & Subject</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
            {assignments.map(a => (
              <TouchableOpacity
                key={a.assignmentId}
                style={[styles.pill, selectedAssignment === a.assignmentId && styles.pillActive]}
                onPress={() => setSelectedAssignment(a.assignmentId)}
              >
                <Text style={[styles.pillText, selectedAssignment === a.assignmentId && styles.pillTextActive]}>
                  {a.gradeName}-{a.sectionName} • {a.subjectName}{a.isTemporary ? ' (Temporary)' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {current?.isTemporary && (
            <Text style={styles.tempNote}>
              Temporary access{current.expiresAt ? ` until ${String(current.expiresAt).slice(0, 10)}` : ''}.
            </Text>
          )}
        </View>

        {/* Exam selector */}
        {selectedAssignment && (
          <View style={styles.section}>
            <Text style={styles.label}>Exam</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {examTypes.map(et => (
                <TouchableOpacity
                  key={et.id}
                  style={[styles.pill, selectedExam === et.id && styles.pillActive]}
                  onPress={() => setSelectedExam(et.id)}
                >
                  <Text style={[styles.pillText, selectedExam === et.id && styles.pillTextActive]}>{et.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {selectedAssignment && selectedExam && formState === 'loading' && <LoadingScreen />}
        {selectedAssignment && selectedExam && formState === 'error' && (
          <ErrorState
            message={`${formError ?? "Couldn't load the marks."}\nSaving is switched off so nothing already entered is overwritten.`}
            onRetry={() => setReload(n => n + 1)}
          />
        )}

        {/* Marks table */}
        {selectedAssignment && selectedExam && ready && current && students.length > 0 && (
          <>
            {/* Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2 }]}>Student</Text>
              <Text style={[styles.th, { width: 70, textAlign: 'center' }]}>Theory/{current.fullTheoryMarks}</Text>
              {hasPractical && <Text style={[styles.th, { width: 70, textAlign: 'center' }]}>Prac/{current.fullPracticalMarks}</Text>}
              <Text style={[styles.th, { width: 50, textAlign: 'center' }]}>Absent</Text>
            </View>

            {students.map(s => {
              const m = marks[s.id] || { theoryMarks: '', practicalMarks: '', isAbsent: false };
              const theoryOver = m.theoryMarks && parseFloat(m.theoryMarks) > current.fullTheoryMarks;
              const pracOver = m.practicalMarks && parseFloat(m.practicalMarks) > current.fullPracticalMarks;

              return (
                <View key={s.id} style={[styles.tableRow, m.isAbsent && styles.tableRowAbsent]}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.studentName}>{s.name}</Text>
                    {s.rollNo && <Text style={styles.rollNo}>Roll #{s.rollNo}</Text>}
                  </View>
                  <TextInput
                    style={[styles.markInput, theoryOver && styles.markInputError]}
                    value={m.theoryMarks}
                    onChangeText={v => updateMark(s.id, 'theoryMarks', v)}
                    keyboardType="numeric"
                    editable={!m.isAbsent}
                    placeholder="—"
                  />
                  {hasPractical && (
                    <TextInput
                      style={[styles.markInput, pracOver && styles.markInputError]}
                      value={m.practicalMarks}
                      onChangeText={v => updateMark(s.id, 'practicalMarks', v)}
                      keyboardType="numeric"
                      editable={!m.isAbsent}
                      placeholder="—"
                    />
                  )}
                  <TouchableOpacity
                    style={[styles.absentBtn, m.isAbsent && styles.absentBtnActive]}
                    onPress={() => updateMark(s.id, 'isAbsent', !m.isAbsent)}
                  >
                    <Text style={styles.absentBtnText}>{m.isAbsent ? '✓' : ''}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}

        {selectedAssignment && selectedExam && ready && students.length === 0 && (
          <EmptyState message="No students in this section." icon="👥" />
        )}
      </ScrollView>

      {selectedAssignment && selectedExam && ready && students.length > 0 && (
        <View style={styles.saveBar}>
          <Button title={saving ? 'Saving...' : 'Save Marks'} onPress={handleSave} loading={saving} style={styles.saveBtn} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  scroll: { flex: 1, padding: Spacing.lg },
  section: { marginBottom: Spacing.lg },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm },
  pillRow: { gap: Spacing.sm, flexDirection: 'row' },
  pill: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs, borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: FontSize.sm, color: Colors.textMuted },
  tempNote: { marginTop: Spacing.xs, fontSize: FontSize.xs, color: Colors.warning },
  pillTextActive: { color: Colors.white, fontWeight: FontWeight.medium },

  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.primary, borderRadius: Radius.md, marginBottom: 2 },
  th: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.white },

  tableRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginBottom: 2, borderRadius: Radius.sm },
  tableRowAbsent: { backgroundColor: '#fff5f5' },
  studentName: { fontSize: FontSize.sm, color: Colors.text, fontWeight: FontWeight.medium },
  rollNo: { fontSize: FontSize.xs, color: Colors.textMuted },
  markInput: { width: 70, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, textAlign: 'center', padding: Spacing.xs, fontSize: FontSize.sm, color: Colors.text, marginHorizontal: 2 },
  markInputError: { borderColor: Colors.danger, backgroundColor: Colors.dangerBg },
  absentBtn: { width: 50, height: 30, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  absentBtnActive: { backgroundColor: Colors.dangerBg, borderColor: Colors.danger },
  absentBtnText: { fontSize: FontSize.sm, color: Colors.danger },

  saveBar: { padding: Spacing.lg, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  saveBtn: { width: '100%' },
});
