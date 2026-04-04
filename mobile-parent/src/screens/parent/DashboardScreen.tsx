import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../api/client';
import { Card, StatCard, Badge, EmptyState, LoadingScreen, Row, Divider } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';

interface Child { id: string; name: string; rollNo?: number; className: string; section: string; }
interface AttendanceData { totalDays: number; presentDays: number; absentDays: number; }

export default function ParentDashboard({ navigation }: any) {
  const { user, logout } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchChildren = async () => {
    try {
      const data = await api.get<Child[]>('/parents/my-children');
      setChildren(data);
      if (data.length > 0) {
        setSelectedChild(data[0]);
        loadAttendance(data[0].id);
      }
    } catch (err) { console.error(err); } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadAttendance = async (studentId: string) => {
    try {
      const data = await api.get<AttendanceData>(`/parents/child/${studentId}/attendance`);
      setAttendance(data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchChildren(); }, []);

  const handleChildSelect = (child: Child) => {
    setSelectedChild(child);
    setAttendance(null);
    loadAttendance(child.id);
  };

  if (loading) return <LoadingScreen />;

  if (children.length === 0) {
    return <EmptyState message="No children linked to your account. Contact the school administration." icon="👨‍👧" />;
  }

  const rate = attendance && attendance.totalDays > 0
    ? Math.round((attendance.presentDays / attendance.totalDays) * 100) : 0;

  const quickActions = [
    { label: 'Report Card', icon: '📊', screen: 'Report' },
    { label: 'Fee Status', icon: '💰', screen: 'Fees' },
    { label: 'Notices', icon: '📢', screen: 'Notices' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchChildren(); }} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Parent Portal</Text>
          <Text style={styles.name} numberOfLines={1}>{user?.email}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Child selector */}
      {children.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childBar} contentContainerStyle={styles.childBarContent}>
          {children.map(child => (
            <TouchableOpacity
              key={child.id}
              style={[styles.childPill, selectedChild?.id === child.id && styles.childPillActive]}
              onPress={() => handleChildSelect(child)}
            >
              <Text style={[styles.childPillText, selectedChild?.id === child.id && styles.childPillTextActive]}>
                {child.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Child info card */}
      {selectedChild && (
        <Card style={styles.childCard}>
          <Row style={styles.childRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{selectedChild.name[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.childName}>{selectedChild.name}</Text>
              <Text style={styles.childMeta}>
                Grade {selectedChild.className} — Section {selectedChild.section}
                {selectedChild.rollNo ? `  •  Roll #${selectedChild.rollNo}` : ''}
              </Text>
            </View>
          </Row>

          {attendance && (
            <>
              <Divider />
              <View style={styles.attendanceRow}>
                <View style={styles.attendanceItem}>
                  <Text style={styles.attendanceNum}>{attendance.totalDays}</Text>
                  <Text style={styles.attendanceLbl}>Total Days</Text>
                </View>
                <View style={styles.attendanceItem}>
                  <Text style={[styles.attendanceNum, { color: Colors.success }]}>{attendance.presentDays}</Text>
                  <Text style={styles.attendanceLbl}>Present</Text>
                </View>
                <View style={styles.attendanceItem}>
                  <Text style={[styles.attendanceNum, { color: Colors.danger }]}>{attendance.absentDays}</Text>
                  <Text style={styles.attendanceLbl}>Absent</Text>
                </View>
                <View style={styles.attendanceItem}>
                  <Text style={[styles.attendanceNum, { color: rate >= 90 ? Colors.success : rate >= 75 ? Colors.warning : Colors.danger }]}>
                    {rate}%
                  </Text>
                  <Text style={styles.attendanceLbl}>Rate</Text>
                </View>
              </View>
            </>
          )}
        </Card>
      )}

      {/* Quick actions */}
      <Text style={styles.sectionLabel}>Quick Access</Text>
      <View style={styles.actionsGrid}>
        {quickActions.map(action => (
          <TouchableOpacity
            key={action.label}
            style={styles.actionCard}
            onPress={() => navigation.navigate(action.screen, { child: selectedChild })}
            activeOpacity={0.8}
          >
            <Text style={styles.actionIcon}>{action.icon}</Text>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xl },
  greeting: { fontSize: FontSize.sm, color: Colors.textMuted },
  name: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary, marginTop: 2, maxWidth: 200 },
  logoutBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, backgroundColor: Colors.borderLight, borderRadius: Radius.md },
  logoutText: { fontSize: FontSize.sm, color: Colors.textMuted },

  childBar: { marginBottom: Spacing.lg },
  childBarContent: { gap: Spacing.sm, flexDirection: 'row' },
  childPill: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs, borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  childPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  childPillText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textMuted },
  childPillTextActive: { color: Colors.white },

  childCard: { marginBottom: Spacing.xl },
  childRow: { gap: Spacing.md, marginBottom: Spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primary + '20', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary },
  childName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary },
  childMeta: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },

  attendanceRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: Spacing.md },
  attendanceItem: { alignItems: 'center' },
  attendanceNum: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary },
  attendanceLbl: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

  sectionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm },
  actionsGrid: { flexDirection: 'row', gap: Spacing.sm },
  actionCard: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  actionIcon: { fontSize: 28, marginBottom: Spacing.sm },
  actionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text, textAlign: 'center' },
});
