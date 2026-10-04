import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { api } from '../../api/client';
import { EmptyState, LoadingScreen } from '../../components/ui';
import ReportCardView, { type ReportData, type PendingReport } from '../../components/ReportCardView';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';

interface Child { id: string; name: string; grade?: { name: string }; section?: { name: string } }
interface ExamType { id: string; name: string }

export default function ParentReportScreen({ children }: { children?: Child[] }) {
  const [myChildren, setMyChildren] = useState<Child[]>(children || []);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamType | null>(null);
  const [report, setReport] = useState<ReportData | PendingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const [childData, examData, activeYear] = await Promise.all([
          api.get<Child[]>('/parents/my-children'),
          api.get<ExamType[]>('/exam-types'),
          api.get<any>('/academic-years/active'),
        ]);
        const kids = Array.isArray(childData) ? childData : [];
        const allExams = Array.isArray(examData) ? examData : [];
        const exams = activeYear
          ? allExams.filter((e: any) => e.academicYearId === activeYear.id)
          : allExams;
        setMyChildren(kids);
        setExamTypes(exams);
        if (kids.length) setSelectedChild(kids[0]);
        if (exams.length) setSelectedExam(exams[0]);
      } catch (err) {
        console.error('Init error:', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!selectedChild || !selectedExam) return;
    setReportLoading(true);
    setReport(null);
    api.get<ReportData | PendingReport>(`/reports/term/${selectedChild.id}/${selectedExam.id}`)
      .then(data => setReport(data))
      .catch(err => { if (err?.response?.status !== 404) console.error('Report fetch error:', err); })
      .finally(() => setReportLoading(false));
  }, [selectedChild, selectedExam]);

  if (loading) return <LoadingScreen />;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: Spacing.xxxl }}>
      {/* Child selector */}
      {myChildren.length > 1 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Child</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chipRow}>
              {myChildren.map(c => (
                <TouchableOpacity key={c.id} style={[s.chip, selectedChild?.id === c.id && s.chipActive]}
                  onPress={() => setSelectedChild(c)}>
                  <Text style={[s.chipText, selectedChild?.id === c.id && s.chipTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Exam selector */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>Exam</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={s.chipRow}>
            {examTypes.map(e => (
              <TouchableOpacity key={e.id} style={[s.chip, selectedExam?.id === e.id && s.chipActive]}
                onPress={() => setSelectedExam(e)}>
                <Text style={[s.chipText, selectedExam?.id === e.id && s.chipTextActive]}>{e.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Report */}
      {reportLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : !report ? (
        <EmptyState icon="📊" message="No report card found for this exam" />
      ) : (
        <ReportCardView report={report} />
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  section: { backgroundColor: Colors.white, padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, color: Colors.textMuted, marginBottom: Spacing.sm },
  chipRow: { flexDirection: 'row', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium as any },
  chipTextActive: { color: Colors.white },
  center: { padding: Spacing.xxxl, alignItems: 'center' },
  examLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
});
