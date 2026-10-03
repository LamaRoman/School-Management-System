import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, RefreshControl, Linking } from 'react-native';
import { api, getErrorMessage } from '../../api/client';
import { Card, EmptyState, ErrorState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import { RosterStudent, sortRoster, filterRoster, detailRows, dialable } from '../../utils/studentList';

// Read-only roster of the sections the teacher is class teacher of. Editing students and
// assigning roll numbers stay on the web.

interface ClassSection { sectionId: string; sectionName: string; gradeName: string }

export default function StudentsScreen() {
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const requestId = useRef(0);

  const init = async () => {
    setInitLoading(true);
    setInitError(null);
    try {
      const data = await api.get<any>('/teacher-assignments/my');
      const secs: ClassSection[] = data.classTeacherSections || [];
      setSections(secs);
      setSectionId(prev => prev || secs[0]?.sectionId || '');
    } catch (err) {
      setInitError(getErrorMessage(err));
    } finally {
      setInitLoading(false);
    }
  };
  useEffect(() => { init(); }, []);

  // Newest selection wins: a late roster for a previous section is dropped.
  const load = useCallback(async () => {
    if (!sectionId) return;
    const mine = ++requestId.current;
    setLoading(true);
    setError(null);
    setStudents([]);
    setOpenId(null);
    try {
      const data = await api.get<RosterStudent[]>(`/students?sectionId=${sectionId}`);
      if (mine === requestId.current) setStudents(Array.isArray(data) ? data : []);
    } catch (err) {
      if (mine === requestId.current) setError(getErrorMessage(err));
    } finally {
      if (mine === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [sectionId]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => filterRoster(sortRoster(students), query), [students, query]);

  if (initLoading) return <LoadingScreen />;
  if (initError) return <ErrorState message={initError} onRetry={init} />;
  if (sections.length === 0) return <EmptyState icon="🎓" message="You are not a class teacher of any section." />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {sections.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow} style={styles.pills}>
          {sections.map(s => (
            <TouchableOpacity key={s.sectionId} style={[styles.pill, sectionId === s.sectionId && styles.pillActive]} onPress={() => setSectionId(s.sectionId)}>
              <Text style={[styles.pillText, sectionId === s.sectionId && styles.pillTextActive]}>{s.gradeName}-{s.sectionName}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search name or roll number"
        placeholderTextColor={Colors.textMuted}
        autoCorrect={false}
        autoCapitalize="none"
      />

      {loading && <Text style={styles.muted}>Loading…</Text>}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && (
        <Text style={styles.count}>
          {query.trim() ? `${shown.length} of ${students.length} students` : `${students.length} students`}
        </Text>
      )}
      {!loading && !error && students.length > 0 && shown.length === 0 && <Text style={styles.muted}>No student matches “{query.trim()}”.</Text>}

      {shown.map(s => {
        const open = openId === s.id;
        const rows = detailRows(s);
        const phone = dialable(s.guardianPhone);
        return (
          <Card key={s.id} style={styles.card}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setOpenId(open ? null : s.id)} style={styles.head}>
              <View style={styles.roll}><Text style={styles.rollText}>{s.rollNo ?? '–'}</Text></View>
              <Text style={styles.name}>{s.name}</Text>
              <Text style={styles.chev}>{open ? '▴' : '▾'}</Text>
            </TouchableOpacity>
            {open && (
              <View style={styles.detail}>
                {rows.map(r => (
                  <View key={r.label} style={styles.row}>
                    <Text style={styles.label}>{r.label}</Text>
                    <Text style={styles.value}>{r.value}</Text>
                  </View>
                ))}
                {phone && (
                  <TouchableOpacity style={styles.call} onPress={() => Linking.openURL(`tel:${phone}`)} accessibilityLabel={`Call guardian ${s.guardianPhone}`}>
                    <Text style={styles.callText}>📞 Call guardian · {s.guardianPhone}</Text>
                  </TouchableOpacity>
                )}
                {rows.length === 0 && !phone && <Text style={styles.muted}>No more details on file.</Text>}
              </View>
            )}
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
  search: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSize.md, color: Colors.text, marginBottom: Spacing.sm },
  muted: { color: Colors.textMuted, textAlign: 'center', padding: Spacing.md, fontSize: FontSize.sm },
  count: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  card: { marginBottom: Spacing.sm, padding: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, minHeight: 48 },
  roll: { minWidth: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primary + '14', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  rollText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },
  name: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text },
  chev: { color: Colors.textMuted, fontSize: FontSize.md },
  detail: { borderTopWidth: 1, borderTopColor: Colors.borderLight, padding: Spacing.md, gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.md },
  label: { width: 120, fontSize: FontSize.sm, color: Colors.textMuted },
  value: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  call: { marginTop: Spacing.xs, paddingVertical: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.primary + '10', alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  callText: { color: Colors.primary, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
});
