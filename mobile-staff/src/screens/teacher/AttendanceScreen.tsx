import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { api, getErrorMessage } from '../../api/client';
import { Card, Button, Badge, EmptyState, LoadingScreen, Row } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import { getTodayBS } from '../../utils/bsDate';

interface Section { sectionId: string; sectionName: string; gradeName: string; academicYearId: string; }
interface Record { studentId: string; studentName: string; rollNo: number | null; status: 'PRESENT' | 'ABSENT' | null; isMarked: boolean; }


export default function AttendanceScreen() {
  const [sections, setSections] = useState<Section[]>([]);
  const [selected, setSelected] = useState<Section | null>(null);
  const [date] = useState(getTodayBS());
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<any>('/teacher-assignments/my');
        const secs = data.classTeacherSections || [];
        setSections(secs);
        if (secs.length > 0) { setSelected(secs[0]); }
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (selected) fetchAttendance(selected, date);
  }, [selected]);

  const fetchAttendance = async (sec: Section, d: string) => {
    setFetching(true);
    try {
      const data = await api.get<any[]>(`/daily-attendance?sectionId=${sec.sectionId}&date=${d}&academicYearId=${sec.academicYearId}`);
      setRecords(Array.isArray(data) ? data : []);
      setHasChanges(false);
    } catch (err) { console.error(err); } finally { setFetching(false); }
  };

  const toggleStatus = (studentId: string) => {
    setRecords(prev => prev.map(r => {
      if (r.studentId !== studentId) return r;
      const next = r.status === 'PRESENT' ? 'ABSENT' : 'PRESENT';
      return { ...r, status: next };
    }));
    setHasChanges(true);
  };

  const markAll = (status: 'PRESENT' | 'ABSENT') => {
    setRecords(prev => prev.map(r => ({ ...r, status })));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post('/daily-attendance/bulk', {
        sectionId: selected.sectionId,
        date,
        academicYearId: selected.academicYearId,
        records: records.map(r => ({ studentId: r.studentId, status: r.status || 'PRESENT' })),
      });
      Alert.alert('Saved', 'Attendance saved successfully.');
      setHasChanges(false);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally { setSaving(false); }
  };

  if (loading) return <LoadingScreen />;

  if (sections.length === 0) {
    return <EmptyState message="You are not assigned as class teacher for any section." icon="🏫" />;
  }

  const presentCount = records.filter(r => r.status === 'PRESENT').length;
  const absentCount = records.filter(r => r.status === 'ABSENT').length;

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
        <Text style={styles.dateText}>{date}</Text>
        <Row style={styles.countRow}>
          <View style={styles.countBadge}><Text style={[styles.countNum, { color: Colors.success }]}>{presentCount}</Text><Text style={styles.countLbl}>Present</Text></View>
          <View style={styles.countBadge}><Text style={[styles.countNum, { color: Colors.danger }]}>{absentCount}</Text><Text style={styles.countLbl}>Absent</Text></View>
        </Row>
      </View>

      {/* Quick mark all */}
      <Row style={styles.markAllRow}>
        <TouchableOpacity style={[styles.markAllBtn, { backgroundColor: Colors.successBg }]} onPress={() => markAll('PRESENT')}>
          <Text style={[styles.markAllText, { color: Colors.success }]}>Mark All Present</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.markAllBtn, { backgroundColor: Colors.dangerBg }]} onPress={() => markAll('ABSENT')}>
          <Text style={[styles.markAllText, { color: Colors.danger }]}>Mark All Absent</Text>
        </TouchableOpacity>
      </Row>

      {/* Student list */}
      {fetching ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
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
              <View style={[styles.statusDot, { backgroundColor: r.status === 'PRESENT' ? Colors.success : r.status === 'ABSENT' ? Colors.danger : Colors.border }]} />
            </TouchableOpacity>
          ))}
          {records.length === 0 && <EmptyState message="No students found in this section." icon="👥" />}
        </ScrollView>
      )}

      {/* Save button */}
      {hasChanges && (
        <View style={styles.saveBar}>
          <Button title={saving ? 'Saving...' : 'Save Attendance'} onPress={handleSave} loading={saving} style={styles.saveBtn} />
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
  statusDot: { width: 14, height: 14, borderRadius: 7 },

  saveBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.lg, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  saveBtn: { width: '100%' },
});
