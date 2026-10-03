import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Linking, ActivityIndicator } from 'react-native';
import { api, getErrorMessage } from '../../api/client';
import { Card, ErrorState } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import { useActiveYear } from '../../hooks/useActiveYear';
import { BS_MONTH_NAMES, getTodayBS } from '../../utils/bsDate';
import { RosterStudent, detailRows, dialable, sortRoster } from '../../utils/studentList';
import { InvoiceTotals, searchReady, statusLabel, summariseDues } from '../../utils/studentLookup';
import { formatRs } from '../../utils/accountantReports';

// Accountant: find a student (search the whole school, or browse class -> section), see their
// details and what they currently owe. Collecting the fee stays in the Collect tab.

interface StudentRow extends RosterStudent { status?: string; section?: { name: string; grade: { name: string } } }
interface Grade { id: string; name: string }
interface Section { id: string; name: string }

const currentMonth = () => BS_MONTH_NAMES[Math.max(0, parseInt(getTodayBS().split('/')[1], 10) - 1)] ?? BS_MONTH_NAMES[0];

export default function StudentsLookupScreen() {
  const { year } = useActiveYear();
  const [query, setQuery] = useState('');
  const [grades, setGrades] = useState<Grade[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [gradeId, setGradeId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => { api.get<Grade[]>('/grades').then(g => setGrades(Array.isArray(g) ? g : [])).catch(() => {}); }, []);
  useEffect(() => {
    setSectionId('');
    if (!gradeId) { setSections([]); return; }
    api.get<Section[]>('/sections', { gradeId }).then(s => setSections(Array.isArray(s) ? s : [])).catch(() => setSections([]));
  }, [gradeId]);

  const searching = searchReady(query);

  // One list at a time: a search wins over the class/section browse. The newest request wins.
  const load = useCallback(async () => {
    const mine = ++requestId.current;
    if (!searching && !sectionId) { setStudents([]); setLoading(false); setError(null); return; }
    setLoading(true);
    setError(null);
    setOpenId(null);
    try {
      const data = await api.get<StudentRow[]>('/students', searching ? { search: query.trim() } : { sectionId });
      if (mine === requestId.current) setStudents(Array.isArray(data) ? data : []);
    } catch (err) {
      if (mine === requestId.current) { setStudents([]); setError(getErrorMessage(err)); }
    } finally {
      if (mine === requestId.current) setLoading(false);
    }
  }, [searching, query, sectionId]);
  useEffect(() => { const t = setTimeout(load, searching ? 350 : 0); return () => clearTimeout(t); }, [load, searching]);

  const shown = sortRoster(students);

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
      <TextInput style={st.search} value={query} onChangeText={setQuery} placeholder="Search any student by name" placeholderTextColor={Colors.textMuted} autoCorrect={false} autoCapitalize="none" />

      {!searching && (
        <>
          <Text style={st.label}>Or browse by class</Text>
          <Pills items={grades.map(g => ({ id: g.id, label: g.name }))} value={gradeId} onPick={id => setGradeId(id === gradeId ? '' : id)} />
          {sections.length > 0 && <Pills items={sections.map(s => ({ id: s.id, label: `Section ${s.name}` }))} value={sectionId} onPick={setSectionId} />}
        </>
      )}

      {loading && <ActivityIndicator style={{ marginTop: Spacing.lg }} color={Colors.primary} />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && !searching && !sectionId && <Text style={st.muted}>Type at least two letters, or pick a class and section.</Text>}
      {!loading && !error && (searching || sectionId) && shown.length === 0 && <Text style={st.muted}>No students found.</Text>}
      {!loading && shown.length > 0 && <Text style={st.count}>{shown.length} student{shown.length === 1 ? '' : 's'}</Text>}

      {shown.map(s => (
        <StudentCard key={s.id} s={s} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)} yearId={year?.id ?? null} />
      ))}
    </ScrollView>
  );
}

function StudentCard({ s, open, onToggle, yearId }: { s: StudentRow; open: boolean; onToggle: () => void; yearId: string | null }) {
  const month = currentMonth();
  const [dues, setDues] = useState<InvoiceTotals | null>(null);
  const [duesState, setDuesState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [duesError, setDuesError] = useState<string | null>(null);

  const loadDues = useCallback(async () => {
    if (!yearId) return;
    setDuesState('loading');
    setDuesError(null);
    try {
      setDues(await api.get<InvoiceTotals>(`/fees/invoice/${s.id}`, { month, academicYearId: yearId }));
      setDuesState('idle');
    } catch (err) {
      setDuesError(getErrorMessage(err));
      setDuesState('error');
    }
  }, [s.id, month, yearId]);
  useEffect(() => { if (open && !dues && yearId) loadDues(); }, [open, yearId]);

  const rows = detailRows(s);
  const phone = dialable(s.guardianPhone);
  const summary = dues ? summariseDues(dues, month) : null;

  return (
    <Card style={st.card}>
      <TouchableOpacity activeOpacity={0.7} onPress={onToggle} style={st.head} accessibilityLabel={`${s.name}, details`}>
        <View style={st.roll}><Text style={st.rollText}>{s.rollNo ?? '–'}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={st.name}>{s.name}</Text>
          {s.section && <Text style={st.sub}>Class {s.section.grade.name} {s.section.name}</Text>}
        </View>
        <Text style={st.chev}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={st.detail}>
          <View style={st.kv}><Text style={st.label2}>Status</Text><Text style={st.value}>{statusLabel(s.status)}</Text></View>
          {rows.map(r => <View key={r.label} style={st.kv}><Text style={st.label2}>{r.label}</Text><Text style={st.value}>{r.value}</Text></View>)}
          {phone && (
            <TouchableOpacity style={st.call} onPress={() => Linking.openURL(`tel:${phone}`)} accessibilityLabel={`Call guardian ${s.guardianPhone}`}>
              <Text style={st.callText}>📞 Call guardian · {s.guardianPhone}</Text>
            </TouchableOpacity>
          )}

          <View style={st.duesBox}>
            <Text style={st.duesTitle}>Fees</Text>
            {duesState === 'loading' && <ActivityIndicator size="small" color={Colors.primary} />}
            {duesState === 'error' && (
              <TouchableOpacity onPress={loadDues}><Text style={st.error}>{duesError} — tap to retry</Text></TouchableOpacity>
            )}
            {!yearId && duesState === 'idle' && <Text style={st.sub}>No academic year is set up.</Text>}
            {summary && (
              summary.clear ? (
                <Text style={[st.duesHead, { color: Colors.success }]}>✓ {summary.headline}</Text>
              ) : (
                <>
                  <Text style={[st.duesHead, { color: Colors.danger }]}>{summary.headline}: {formatRs(dues!.grandTotal)}</Text>
                  {summary.lines.map(l => <View key={l.label} style={st.kv}><Text style={st.label2}>{l.label}</Text><Text style={st.value}>{formatRs(l.amount)}</Text></View>)}
                </>
              )
            )}
            <Text style={st.hint}>To collect a payment, use the Collect tab.</Text>
          </View>
        </View>
      )}
    </Card>
  );
}

function Pills({ items, value, onPick }: { items: { id: string; label: string }[]; value: string; onPick: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.pillRow} style={st.pills}>
      {items.map(i => (
        <TouchableOpacity key={i.id} style={[st.pill, value === i.id && st.pillActive]} onPress={() => onPick(i.id)}>
          <Text style={[st.pillText, value === i.id && st.pillTextActive]}>{i.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  search: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSize.md, color: Colors.text, marginBottom: Spacing.md },
  label: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.xs },
  muted: { color: Colors.textMuted, textAlign: 'center', padding: Spacing.lg, fontSize: FontSize.sm },
  count: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  pills: { marginBottom: Spacing.sm },
  pillRow: { gap: Spacing.sm, flexDirection: 'row' },
  pill: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs, borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: FontSize.sm, color: Colors.textMuted },
  pillTextActive: { color: Colors.white, fontWeight: FontWeight.medium },

  card: { marginBottom: Spacing.sm, padding: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, minHeight: 56 },
  roll: { minWidth: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primary + '14', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  rollText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },
  name: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  sub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  chev: { color: Colors.textMuted, fontSize: FontSize.md },
  detail: { borderTopWidth: 1, borderTopColor: Colors.borderLight, padding: Spacing.md, gap: Spacing.sm },
  kv: { flexDirection: 'row', gap: Spacing.md, justifyContent: 'space-between' },
  label2: { fontSize: FontSize.sm, color: Colors.textMuted, flexShrink: 1 },
  value: { fontSize: FontSize.sm, color: Colors.text, fontWeight: FontWeight.medium, flex: 1, textAlign: 'right' },
  call: { minHeight: 44, borderRadius: Radius.md, backgroundColor: Colors.primary + '10', alignItems: 'center', justifyContent: 'center' },
  callText: { color: Colors.primary, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  duesBox: { marginTop: Spacing.xs, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.surface, gap: Spacing.xs },
  duesTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary },
  duesHead: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  error: { color: Colors.danger, fontSize: FontSize.sm },
  hint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.xs },
});
