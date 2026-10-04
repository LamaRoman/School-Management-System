import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card, Badge, EmptyState } from './ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../theme';

/**
 * The report card as the app shows it: the same credit hour + grade point card the school
 * prints (GET /reports/term/... returns the card's own data). No marks, no pass / fail, no
 * rank. An absent paper shows "Ab", never a grade, and while any paper is absent or not yet
 * entered the GPA shows "—".
 */
export interface ReportSubject {
  subjectName: string;
  creditHour: number;
  finalGrade: string;
  gradePoint: number | null;
  isAbsent: boolean;
  notEntered?: boolean;
}
export interface ReportData {
  student: { name: string; rollNo?: number };
  examType: string;
  academicYear: string;
  subjects: ReportSubject[];
  overallGpa: number | null;
  incomplete?: boolean;
}
/** Not published yet: the API answers 200 with this instead of a report. */
export interface PendingReport { pending: true; message: string }

const gpaColor = (gpa: number) =>
  gpa >= 3.6 ? Colors.success : gpa >= 2.4 ? Colors.info : gpa >= 1.6 ? Colors.warning : Colors.danger;

export default function ReportCardView({ report }: { report: ReportData | PendingReport }) {
  if ('pending' in report) return <EmptyState icon="⏳" message={report.message} />;

  const showGpa = !report.incomplete && report.overallGpa != null;
  return (
    <>
      <Card style={s.summaryCard}>
        <Text style={s.studentName}>{report.student.name}</Text>
        <Text style={s.examName}>{report.examType} • {report.academicYear}</Text>
        <View style={s.summaryItem}>
          <Text style={[s.summaryVal, { color: showGpa ? gpaColor(report.overallGpa!) : Colors.textMuted }]}>
            {showGpa ? report.overallGpa!.toFixed(2) : '—'}
          </Text>
          <Text style={s.summaryKey}>Grade Points Average</Text>
        </View>
      </Card>

      <Card style={s.tableCard}>
        <View style={s.tableHeader}>
          <Text style={[s.th, { flex: 2.5 }]}>Subject</Text>
          <Text style={s.th}>Cr. Hr</Text>
          <Text style={s.th}>Grade</Text>
          <Text style={s.th}>GP</Text>
        </View>
        {report.subjects.map((row, idx) => {
          const missing = row.isAbsent ? 'Ab' : row.notEntered ? '—' : null;
          return (
            <View key={idx} style={[s.tableRow, idx % 2 === 0 && s.rowAlt]}>
              <Text style={[s.td, { flex: 2.5, textAlign: 'left' }]} numberOfLines={1}>{row.subjectName}</Text>
              <Text style={s.td}>{row.creditHour}</Text>
              <View style={{ flex: 1, alignItems: 'center' }}>
                {missing ? <Text style={s.td}>{missing}</Text> : (
                  <Badge label={row.finalGrade} color={
                    (row.gradePoint ?? 0) >= 3.6 ? 'success' : (row.gradePoint ?? 0) >= 2.4 ? 'info' : 'warning'
                  } />
                )}
              </View>
              <Text style={s.td}>{missing ?? row.gradePoint ?? '—'}</Text>
            </View>
          );
        })}
        <Text style={s.legend}>Ab = absent</Text>
      </Card>
    </>
  );
}

const s = StyleSheet.create({
  summaryCard: { margin: Spacing.lg, gap: Spacing.md },
  studentName: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.text },
  examName: { fontSize: FontSize.sm, color: Colors.textMuted },
  summaryItem: { alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.md },
  summaryVal: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold as any },
  summaryKey: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  tableHeader: { flexDirection: 'row', backgroundColor: Colors.primary, borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: 2 },
  th: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold as any, color: Colors.white, textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs, borderRadius: Radius.sm, alignItems: 'center' },
  rowAlt: { backgroundColor: Colors.surfaceAlt },
  td: { flex: 1, fontSize: FontSize.sm, color: Colors.text, textAlign: 'center' },
  legend: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.sm },
});
