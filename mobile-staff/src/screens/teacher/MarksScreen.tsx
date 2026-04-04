import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { api, getErrorMessage } from '../../api/client';
import { Button, EmptyState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';

interface Assignment { assignmentId: string; sectionId: string; sectionName: string; gradeId: string; gradeName: string; academicYearId: string; subjectId: string; subjectName: string; fullTheoryMarks: number; fullPracticalMarks: number; }
interface ExamType { id: string; name: string; }
interface Student { id: string; name: string; rollNo?: number; }
interface MarkEntry { theoryMarks: string; practicalMarks: string; isAbsent: boolean; }

export default function MarksScreen() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<string, MarkEntry>>({});
  const [selectedAssignment, setSelectedAssignment] = useState('');
  const [selectedExam, setSelectedExam] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<any>('/teacher-assignments/my');
        const subs = data.subjectAssignments || [];
        setAssignments(subs);
        if (subs.length > 0) {
          const yearId = subs[0].academicYearId;
          const et = await api.get<ExamType[]>(`/exam-types?academicYearId=${yearId}`);
          setExamTypes(et);
        }
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  const current = assignments.find(a => a.assignmentId === selectedAssignment);

  useEffect(() => {
    if (!current) return;
    const loadStudentsAndMarks = async () => {
      try {
        const stus = await api.get<Student[]>(`/students?sectionId=${current.sectionId}`);
        setStudents(stus);

        // Build initial empty marks
        const initial: Record<string, MarkEntry> = {};
        stus.forEach(s => { initial[s.id] = { theoryMarks: '', practicalMarks: '', isAbsent: false }; });

        // Pre-fill existing marks if exam is already selected
        if (selectedExam) {
          try {
            const existing = await api.get<any[]>(`/marks?sectionId=${current.sectionId}&subjectId=${current.subjectId}&examTypeId=${selectedExam}`);
            if (Array.isArray(existing)) {
              existing.forEach((m: any) => {
                if (initial[m.studentId]) {
                  initial[m.studentId] = {
                    theoryMarks: m.isAbsent ? '' : (m.theoryMarks != null ? String(m.theoryMarks) : ''),
                    practicalMarks: m.isAbsent ? '' : (m.practicalMarks != null ? String(m.practicalMarks) : ''),
                    isAbsent: m.isAbsent || false,
                  };
                }
              });
            }
          } catch (_) {}
        }
        setMarks(initial);
      } catch (err) { console.error(err); }
    };
    loadStudentsAndMarks();
  }, [selectedAssignment]);

  // Re-fetch marks when exam changes (students already loaded)
  useEffect(() => {
    if (!current || !selectedExam || students.length === 0) return;
    api.get<any[]>(`/marks?sectionId=${current.sectionId}&subjectId=${current.subjectId}&examTypeId=${selectedExam}`)
      .then(existing => {
        if (!Array.isArray(existing)) return;
        setMarks(prev => {
          const updated = { ...prev };
          existing.forEach((m: any) => {
            if (updated[m.studentId]) {
              updated[m.studentId] = {
                theoryMarks: m.isAbsent ? '' : (m.theoryMarks != null ? String(m.theoryMarks) : ''),
                practicalMarks: m.isAbsent ? '' : (m.practicalMarks != null ? String(m.practicalMarks) : ''),
                isAbsent: m.isAbsent || false,
              };
            }
          });
          return updated;
        });
      })
      .catch(() => {});
  }, [selectedExam]);

  const updateMark = (studentId: string, field: keyof MarkEntry, value: string | boolean) => {
    setMarks(prev => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }));
  };

  const handleSave = async () => {
    if (!current || !selectedExam) return;

    // Validate
    const invalid = students.filter(s => {
      const m = marks[s.id];
      if (!m || m.isAbsent) return false;
      const theory = parseFloat(m.theoryMarks);
      const prac = parseFloat(m.practicalMarks);
      if (m.theoryMarks && !isNaN(theory) && theory > current.fullTheoryMarks) return true;
      if (m.practicalMarks && !isNaN(prac) && prac > current.fullPracticalMarks) return true;
      return false;
    });

    if (invalid.length > 0) {
      Alert.alert('Invalid marks', `Marks exceed full marks for ${invalid.length} student(s). Please check.`);
      return;
    }

    setSaving(true);
    try {
      const marksArray = students.map(s => {
        const m = marks[s.id] || { theoryMarks: '', practicalMarks: '', isAbsent: false };
        return {
          studentId: s.id,
          theoryMarks: m.isAbsent ? null : (m.theoryMarks ? parseFloat(m.theoryMarks) : null),
          practicalMarks: m.isAbsent ? null : (m.practicalMarks ? parseFloat(m.practicalMarks) : null),
          isAbsent: m.isAbsent,
        };
      });

      await api.post('/marks/bulk', {
        subjectId: current.subjectId,
        examTypeId: selectedExam,
        academicYearId: current.academicYearId,
        marks: marksArray,
      });
      Alert.alert('Saved', 'Marks saved successfully.');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally { setSaving(false); }
  };

  if (loading) return <LoadingScreen />;
  if (assignments.length === 0) return <EmptyState message="No subject assignments found. Contact admin." icon="📝" />;

  const hasPractical = current && current.fullPracticalMarks > 0;

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
                  {a.gradeName}-{a.sectionName} • {a.subjectName}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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

        {/* Marks table */}
        {selectedAssignment && selectedExam && current && (
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

        {selectedAssignment && selectedExam && students.length === 0 && (
          <EmptyState message="No students in this section." icon="👥" />
        )}
      </ScrollView>

      {selectedAssignment && selectedExam && students.length > 0 && (
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
