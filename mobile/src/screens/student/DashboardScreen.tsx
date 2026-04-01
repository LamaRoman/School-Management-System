import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
} from 'react-native';
import { api } from '../../api/client';
import { Card, Badge, StatCard, EmptyState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import { useAuth } from '../../hooks/useAuth';

interface StudentInfo {
  id: string; name: string; rollNumber?: number;
  section?: { name: string; grade?: { name: string } };
  photo?: string;
}
interface AttendanceSummary { present: number; absent: number; total: number }
interface HomeworkItem { id: string; title: string; dueDateBS: string; subject: { name: string } }
interface Notice { id: string; title: string; content: string; createdAt: string }

export default function StudentDashboard() {
  const { user } = useAuth();
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Find the student record for this user
      const students = await api.get<StudentInfo[]>('/students');
      // The student whose user account matches the logged in user
      const me = Array.isArray(students)
        ? students.find((s: any) => s.user?.id === user?.id || s.userId === user?.id) || students[0]
        : null;
      setStudent(me || null);

      const [attData, hwData, noticeData] = await Promise.all([
        me ? api.get<AttendanceSummary>('/daily-attendance/summary', { studentId: me.id }).catch(() => null) : Promise.resolve(null),
        api.get<HomeworkItem[]>('/homework').catch(() => []),
        api.get<Notice[]>('/notices').catch(() => []),
      ]);
      setAttendance(attData);
      setHomework(Array.isArray(hwData) ? hwData.slice(0, 5) : []);
      setNotices(Array.isArray(noticeData) ? noticeData.slice(0, 3) : []);
    } catch (err) {
      console.error('Student dashboard error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingScreen />;

  const attendanceRate = attendance && attendance.total > 0
    ? Math.round((attendance.present / attendance.total) * 100) : null;

  const rateColor = attendanceRate == null ? Colors.textMuted
    : attendanceRate >= 85 ? Colors.success
    : attendanceRate >= 70 ? Colors.warning : Colors.danger;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: Spacing.xxxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
    >
      {/* Student info banner */}
      <View style={s.banner}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{student?.name?.[0] ?? '?'}</Text>
        </View>
        <View style={s.bannerInfo}>
          <Text style={s.bannerName}>{student?.name ?? user?.email}</Text>
          {student?.section && (
            <Text style={s.bannerGrade}>
              Class {student.section.grade?.name} – Section {student.section.name}
              {student.rollNumber ? `  •  Roll #${student.rollNumber}` : ''}
            </Text>
          )}
        </View>
      </View>

      {/* Attendance stats */}
      <View style={s.statsRow}>
        <StatCard label="Present" value={attendance?.present ?? '–'} color={Colors.success} />
        <StatCard label="Absent" value={attendance?.absent ?? '–'} color={Colors.danger} />
        <StatCard
          label="Rate"
          value={attendanceRate != null ? `${attendanceRate}%` : '–'}
          color={rateColor}
        />
      </View>

      {/* Attendance rate bar */}
      {attendanceRate != null && (
        <Card style={s.barCard}>
          <View style={s.barRow}>
            <Text style={s.barLabel}>Attendance Rate</Text>
            <Text style={[s.barPct, { color: rateColor }]}>{attendanceRate}%</Text>
          </View>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${attendanceRate}%` as any, backgroundColor: rateColor }]} />
          </View>
          <Text style={[s.barStatus, { color: rateColor }]}>
            {attendanceRate >= 85 ? 'Excellent' : attendanceRate >= 70 ? 'Good — try to improve' : 'Needs improvement'}
          </Text>
        </Card>
      )}

      {/* Upcoming homework */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>📚 Recent Homework</Text>
        {homework.length === 0 ? (
          <EmptyState icon="✅" message="No homework assigned" />
        ) : (
          homework.map(hw => (
            <Card key={hw.id} style={s.hwCard}>
              <View style={s.hwRow}>
                <View style={s.hwLeft}>
                  <Text style={s.hwTitle}>{hw.title}</Text>
                  <Badge label={hw.subject.name} color="info" />
                </View>
                <Text style={s.hwDue}>Due {hw.dueDateBS}</Text>
              </View>
            </Card>
          ))
        )}
      </View>

      {/* Recent notices */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>📢 Recent Notices</Text>
        {notices.length === 0 ? (
          <EmptyState icon="📭" message="No notices" />
        ) : (
          notices.map(n => (
            <Card key={n.id} style={s.noticeCard}>
              <Text style={s.noticeTitle}>{n.title}</Text>
              <Text style={s.noticeContent} numberOfLines={2}>{n.content}</Text>
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  banner: { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.xl },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.white },
  bannerInfo: { flex: 1 },
  bannerName: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.white },
  bannerGrade: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg },
  barCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, gap: Spacing.sm },
  barRow: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
  barPct: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any },
  barTrack: { height: 8, backgroundColor: Colors.borderLight, borderRadius: Radius.full },
  barFill: { height: 8, borderRadius: Radius.full },
  barStatus: { fontSize: FontSize.xs, fontWeight: FontWeight.medium as any },
  section: { padding: Spacing.lg, gap: Spacing.md },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text },
  hwCard: {},
  hwRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hwLeft: { flex: 1, gap: Spacing.xs },
  hwTitle: { fontSize: FontSize.md, fontWeight: FontWeight.medium as any, color: Colors.text },
  hwDue: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: FontWeight.medium as any },
  noticeCard: { gap: Spacing.xs },
  noticeTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text },
  noticeContent: { fontSize: FontSize.sm, color: Colors.textMuted },
});
