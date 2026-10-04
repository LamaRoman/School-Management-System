import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { api } from '../../api/client';
import { EmptyState, LoadingScreen } from '../../components/ui';
import ReportCardView, { type ReportData, type PendingReport } from '../../components/ReportCardView';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';

interface ExamType { id: string; name: string }

export default function StudentReportScreen() {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamType | null>(null);
  const [report, setReport] = useState<ReportData | PendingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const [me, activeYear, exams] = await Promise.all([
          api.get<any>('/students/me'),
          api.get<any>('/academic-years/active'),
          api.get<ExamType[]>('/exam-types'),
        ]);
        if (me) setStudentId(me.id);
        const allExams = Array.isArray(exams) ? exams : [];
        const examList = activeYear
          ? allExams.filter((e: any) => e.academicYearId === activeYear.id)
          : allExams;
        setExamTypes(examList);
        if (examList.length) setSelectedExam(examList[0]);
      } catch (err) {
        console.error('Report init error:', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!studentId || !selectedExam) return;
    setReportLoading(true);
    setReport(null);
    api.get<ReportData | PendingReport>(`/reports/term/${studentId}/${selectedExam.id}`)
      .then(data => setReport(data))
      .catch(err => { if (err?.response?.status !== 404) console.error('Report fetch error:', err); })
      .finally(() => setReportLoading(false));
  }, [studentId, selectedExam]);

  if (loading) return <LoadingScreen />;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: Spacing.xxxl }}>
      {/* Exam selector */}
      <View style={s.examSection}>
        <Text style={s.examLabel}>Select Exam</Text>
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
  examSection: { backgroundColor: Colors.white, padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  examLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, color: Colors.textMuted, marginBottom: Spacing.sm },
  chipRow: { flexDirection: 'row', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium as any },
  chipTextActive: { color: Colors.white },
  center: { padding: Spacing.xxxl, alignItems: 'center' },
});
