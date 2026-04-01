import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { api } from '../../api/client';
import { Card, Badge, EmptyState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';

interface Child { id: string; name: string; grade?: { name: string }; section?: { name: string } }
interface ExamType { id: string; name: string }
interface MarkRow {
  subject: { name: string };
  theoryMarks: number | null;
  practicalMarks: number | null;
  totalMarks: number | null;
  fullMarks: number;
  grade: string | null;
  gradePoint: number | null;
  remarks: string | null;
}
interface ReportData {
  student: { name: string; rollNumber?: number };
  examType: { name: string };
  academicYear: { yearNp: string };
  marks: MarkRow[];
  summary?: { percentage: number; gpa: number; overallGrade: string; rank?: number };
}

export default function ParentReportScreen({ children }: { children?: Child[] }) {
  const [myChildren, setMyChildren] = useState<Child[]>(children || []);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamType | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const [childData, examData] = await Promise.all([
          api.get<Child[]>('/parents/my-children'),
          api.get<ExamType[]>('/exam-types'),
        ]);
        const kids = Array.isArray(childData) ? childData : [];
        const exams = Array.isArray(examData) ? examData : [];
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
    api.get<ReportData>(`/reports/term/${selectedChild.id}/${selectedExam.id}`)
      .then(data => setReport(data))
      .catch(err => console.error('Report fetch error:', err))
      .finally(() => setReportLoading(false));
  }, [selectedChild, selectedExam]);

  if (loading) return <LoadingScreen />;

  const gpaColor = (gpa: number) =>
    gpa >= 3.6 ? Colors.success : gpa >= 2.4 ? Colors.info : gpa >= 1.6 ? Colors.warning : Colors.danger;

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
        <>
          {/* Summary card */}
          {report.summary && (
            <Card style={s.summaryCard}>
              <Text style={s.studentName}>{report.student.name}</Text>
              <Text style={s.examLabel}>{report.examType.name} • {report.academicYear.yearNp}</Text>
              <View style={s.summaryRow}>
                <View style={s.summaryItem}>
                  <Text style={[s.summaryVal, { color: gpaColor(report.summary.gpa) }]}>
                    {report.summary.gpa.toFixed(2)}
                  </Text>
                  <Text style={s.summaryKey}>GPA</Text>
                </View>
                <View style={s.summaryDivider} />
                <View style={s.summaryItem}>
                  <Text style={[s.summaryVal, { color: Colors.primary }]}>
                    {report.summary.percentage.toFixed(1)}%
                  </Text>
                  <Text style={s.summaryKey}>Percentage</Text>
                </View>
                <View style={s.summaryDivider} />
                <View style={s.summaryItem}>
                  <Text style={[s.summaryVal, { color: gpaColor(report.summary.gpa) }]}>
                    {report.summary.overallGrade}
                  </Text>
                  <Text style={s.summaryKey}>Grade</Text>
                </View>
              </View>
            </Card>
          )}

          {/* Marks table */}
          <Card style={s.tableCard}>
            <Text style={s.tableTitle}>Subject-wise Marks</Text>
            <View style={s.tableHeader}>
              <Text style={[s.th, { flex: 2 }]}>Subject</Text>
              <Text style={s.th}>Total</Text>
              <Text style={s.th}>FM</Text>
              <Text style={s.th}>Grade</Text>
            </View>
            {report.marks.map((row, idx) => (
              <View key={idx} style={[s.tableRow, idx % 2 === 0 && s.tableRowAlt]}>
                <Text style={[s.td, { flex: 2 }]} numberOfLines={1}>{row.subject.name}</Text>
                <Text style={s.td}>{row.totalMarks ?? '–'}</Text>
                <Text style={s.td}>{row.fullMarks}</Text>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  {row.grade ? (
                    <Badge label={row.grade} color={
                      row.gradePoint && row.gradePoint >= 3.6 ? 'success' :
                      row.gradePoint && row.gradePoint >= 2.4 ? 'info' : 'warning'
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
  section: { backgroundColor: Colors.white, padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, color: Colors.textMuted, marginBottom: Spacing.sm },
  chipRow: { flexDirection: 'row', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium as any },
  chipTextActive: { color: Colors.white },
  center: { padding: Spacing.xxxl, alignItems: 'center' },
  summaryCard: { margin: Spacing.lg, gap: Spacing.md },
  studentName: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.text },
  examLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: Spacing.md },
  summaryItem: { alignItems: 'center', gap: Spacing.xs },
  summaryVal: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold as any },
  summaryKey: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDivider: { width: 1, backgroundColor: Colors.border },
  tableCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  tableTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text, marginBottom: Spacing.md },
  tableHeader: { flexDirection: 'row', backgroundColor: Colors.primary, borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: 2 },
  th: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold as any, color: Colors.white, textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs, borderRadius: Radius.sm, alignItems: 'center' },
  tableRowAlt: { backgroundColor: Colors.surfaceAlt },
  td: { flex: 1, fontSize: FontSize.sm, color: Colors.text, textAlign: 'center' },
});
