import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { api, getErrorMessage } from '../../api/client';
import { Card, StatCard, Badge, LoadingScreen, Row, Divider } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';

export default function TeacherDashboard({ navigation }: any) {
  const { user, logout } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const assignments = await api.get<any>('/teacher-assignments/my');
      setData(assignments);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <LoadingScreen />;

  const sections = data?.classTeacherSections || [];
  const subjects = data?.subjectAssignments || [];

  const quickActions = [
    { label: 'Take Attendance', icon: '✅', screen: 'Attendance', color: Colors.success },
    { label: 'Enter Marks', icon: '📝', screen: 'Marks', color: Colors.primary },
    { label: 'Homework', icon: '📚', screen: 'Homework', color: Colors.accent },
    { label: 'Notices', icon: '📢', screen: 'Notices', color: Colors.warning },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{user?.teacher?.name || user?.email}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <Row style={styles.statsRow}>
        <StatCard label="My Sections" value={sections.length} />
        <View style={{ width: Spacing.sm }} />
        <StatCard label="Subjects" value={subjects.length} />
      </Row>

      {/* Quick Actions */}
      <Text style={styles.sectionLabel}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        {quickActions.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={[styles.actionCard, { borderLeftColor: action.color }]}
            onPress={() => navigation.navigate(action.screen)}
            activeOpacity={0.8}
          >
            <Text style={styles.actionIcon}>{action.icon}</Text>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* My Sections */}
      {sections.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>My Class Sections</Text>
          <Card>
            {sections.map((sec: any, i: number) => (
              <View key={sec.sectionId}>
                {i > 0 && <Divider />}
                <Row style={styles.sectionRow}>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>
                      {sec.gradeName}-{sec.sectionName}
                    </Text>
                  </View>
                  <Text style={styles.sectionMeta}>Class Teacher</Text>
                </Row>
              </View>
            ))}
          </Card>
        </>
      )}

      {/* Subject Assignments */}
      {subjects.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Subject Assignments</Text>
          <Card>
            {subjects.slice(0, 5).map((sub: any, i: number) => (
              <View key={sub.assignmentId}>
                {i > 0 && <Divider />}
                <Row style={styles.sectionRow}>
                  <Text style={styles.subjectName}>{sub.subjectName}</Text>
                  <Badge label={`${sub.gradeName}-${sub.sectionName}`} color="primary" />
                </Row>
              </View>
            ))}
            {subjects.length > 5 && (
              <Text style={styles.moreText}>+{subjects.length - 5} more subjects</Text>
            )}
          </Card>
        </>
      )}

      {sections.length === 0 && subjects.length === 0 && (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>No assignments yet. Contact admin to get assigned to sections.</Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xl },
  greeting: { fontSize: FontSize.sm, color: Colors.textMuted },
  name: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary, marginTop: 2 },
  logoutBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, backgroundColor: Colors.borderLight, borderRadius: Radius.md },
  logoutText: { fontSize: FontSize.sm, color: Colors.textMuted },

  statsRow: { marginBottom: Spacing.xl },

  sectionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm, marginTop: Spacing.xs },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xl },
  actionCard: {
    width: '48%', backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: Spacing.lg, borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  actionIcon: { fontSize: 24, marginBottom: Spacing.sm },
  actionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },

  sectionRow: { justifyContent: 'space-between', paddingVertical: Spacing.xs },
  sectionBadge: { backgroundColor: Colors.primary + '15', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm },
  sectionBadgeText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary },
  sectionMeta: { fontSize: FontSize.sm, color: Colors.textMuted },

  subjectName: { fontSize: FontSize.md, color: Colors.text, flex: 1 },
  moreText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm },

  emptyCard: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyText: { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
