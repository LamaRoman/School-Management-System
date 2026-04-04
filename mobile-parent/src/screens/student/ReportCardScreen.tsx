import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { api } from '../../api/client';
import { Card, Badge, EmptyState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import { useAuth } from '../../hooks/useAuth';

interface ExamType { id: string; name: string }
interface SubjectRow {
  subjectName: string;
  totalMarks: number | null;
  fullMarks: number;
  grade: string | null;
  gpa: number | null;
  isAbsent: boolean;
}
interface ReportData {
  student: { name: string; rollNo?: number };
  examType: string;
  academicYear: string;
  subjects: SubjectRow[];
  overallPercentage: number;
  overallGpa: number;
  overallGrade: string;
}

export default function StudentReportScreen() {
  const { user } = useAuth();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamType | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
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
    api.get<ReportData>(`/reports/term/${studentId}/${selectedExam.id}`)
      .then(data => setReport(data))
      .catch(err => { if (err?.response?.status !== 404) console.error('Report fetch error:', err); })
      .finally(() => setReportLoading(false));
  }, [studentId, selectedExam]);

  if (loading) return <LoadingScreen />;

  const gpaColor = (gpa: number) =>
    gpa >= 3.6 ? Colors.success : gpa >= 2.4 ? Colors.info : gpa >= 1.6 ? Colors.warning : Colors.danger;

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
        <>
          {report && (
            <Card style={s.summaryCard}>
              <Text style={s.studentName}>{report.student.name}</Text>
              <Text style={s.examName}>{report.examType} • {report.academicYear}</Text>
              <View style={s.summaryRow}>
                <View style={s.summaryItem}>
                  <Text style={[s.summaryVal, { color: gpaColor(report.overallGpa) }]}>
                    {report.overallGpa.toFixed(2)}
                  </Text>
                  <Text style={s.summaryKey}>GPA</Text>
                </View>
                <View style={s.divider} />
                <View style={s.summaryItem}>
                  <Text style={[s.summaryVal, { color: Colors.primary }]}>
                    {report.overallPercentage.toFixed(1)}%
                  </Text>
                  <Text style={s.summaryKey}>Percentage</Text>
                </View>
                <View style={s.divider} />
                <View style={s.summaryItem}>
                  <Text style={[s.summaryVal, { color: gpaColor(report.overallGpa) }]}>
                    {report.overallGrade}
                  </Text>
                  <Text style={s.summaryKey}>Grade</Text>
                </View>
              </View>
            </Card>
          )}

          <Card style={s.tableCard}>
            <Text style={s.tableTitle}>Subject-wise Marks</Text>
            <View style={s.tableHeader}>
              <Text style={[s.th, { flex: 2.5 }]}>Subject</Text>
              <Text style={s.th}>Marks</Text>
              <Text style={s.th}>FM</Text>
              <Text style={s.th}>Grade</Text>
            </View>
            {report.subjects.map((row, idx) => (
              <View key={idx} style={[s.tableRow, idx % 2 === 0 && s.rowAlt]}>
                <Text style={[s.td, { flex: 2.5 }]} numberOfLines={1}>{row.subjectName}</Text>
                <Text style={s.td}>{row.isAbsent ? 'Abs' : (row.totalMarks ?? '–')}</Text>
                <Text style={s.td}>{row.fullMarks}</Text>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  {row.grade ? (
                    <Badge label={row.grade} color={
                      (row.gpa ?? 0) >= 3.6 ? 'success' :
                      (row.gpa ?? 0) >= 2.4 ? 'info' : 'warning'
                    } />
                  ) : <Text style={s.td}>–</Text>}
                </View>
              </View>
            ))}
          </Card>
        </>
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
  summaryCard: { margin: Spacing.lg, gap: Spacing.md },
  studentName: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.text },
  examName: { fontSize: FontSize.sm, color: Colors.textMuted },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: Spacing.md },
  summaryItem: { alignItems: 'center', gap: Spacing.xs },
  summaryVal: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold as any },
  summaryKey: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase' },
  divider: { width: 1, backgroundColor: Colors.border },
  tableCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  tableTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text, marginBottom: Spacing.md },
  tableHeader: { flexDirection: 'row', backgroundColor: Colors.primary, borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: 2 },
  th: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold as any, color: Colors.white, textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs, borderRadius: Radius.sm, alignItems: 'center' },
  rowAlt: { backgroundColor: Colors.surfaceAlt },
  td: { flex: 1, fontSize: FontSize.sm, color: Colors.text, textAlign: 'center' },
});
