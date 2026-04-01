import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { api } from '../../api/client';
import { Card, StatCard, EmptyState, LoadingScreen, Badge } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';

interface AcademicYear { id: string; yearNp: string; isActive: boolean }
interface Defaulter {
  studentId: string; studentName: string; section: string;
  totalDue: number; totalPaid: number; balance: number;
}
interface CashbookSummary { totalCollection: number; receiptCount: number }
interface DefaulterSummary { totalStudents: number; totalBalance: number }

export default function AccountantDashboard() {
  const [activeYear, setActiveYear] = useState<AcademicYear | null>(null);
  const [cashbook, setCashbook] = useState<CashbookSummary | null>(null);
  const [defaulters, setDefaulters] = useState<DefaulterSummary | null>(null);
  const [recentDefaulters, setRecentDefaulters] = useState<Defaulter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Get today in YYYY/MM/DD format
  const getTodayBS = () => {
    // Use a static format — the backend will validate
    const now = new Date();
    return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const years = await api.get<AcademicYear[]>('/academic-years');
      const active = Array.isArray(years) ? years.find(y => y.isActive) || years[0] : null;
      setActiveYear(active || null);

      if (!active) { setLoading(false); setRefreshing(false); return; }

      const today = getTodayBS();
      const [cbData, defData] = await Promise.all([
        api.get<any>(`/accountant-reports/daily-cashbook?date=${today}&academicYearId=${active.id}`).catch(() => null),
        api.get<any>(`/accountant-reports/defaulters?academicYearId=${active.id}`).catch(() => null),
      ]);

      if (cbData) {
        const receipts = cbData.receipts || [];
        setCashbook({
          totalCollection: cbData.totalCollection || receipts.reduce((s: number, r: any) => s + (r.totalAmount || 0), 0),
          receiptCount: cbData.receiptCount || receipts.length,
        });
      }

      if (defData) {
        const defs = defData.defaulters || [];
        setDefaulters({
          totalStudents: defData.totalDefaulters || defs.length,
          totalBalance: defData.totalOutstanding || defs.reduce((s: number, d: any) => s + (d.balance || 0), 0),
        });
        setRecentDefaulters(defs.slice(0, 5));
      }
    } catch (err) {
      console.error('Accountant dashboard error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingScreen />;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: Spacing.xxxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
    >
      {/* Year banner */}
      <View style={s.banner}>
        <Text style={s.bannerTitle}>Accountant Dashboard</Text>
        {activeYear && <Text style={s.bannerYear}>Academic Year {activeYear.yearNp}</Text>}
      </View>

      {/* Today's stats */}
      <Text style={s.sectionTitle}>Today's Collection</Text>
      <View style={s.statsRow}>
        <StatCard
          label="Collected"
          value={cashbook ? `Rs ${cashbook.totalCollection.toLocaleString()}` : 'Rs 0'}
          color={Colors.success}
        />
        <StatCard
          label="Receipts"
          value={cashbook?.receiptCount ?? 0}
          color={Colors.info}
        />
      </View>

      {/* Defaulters summary */}
      <Text style={s.sectionTitle}>Fee Defaulters</Text>
      <View style={s.statsRow}>
        <StatCard
          label="Students"
          value={defaulters?.totalStudents ?? 0}
          color={Colors.danger}
        />
        <StatCard
          label="Outstanding"
          value={defaulters ? `Rs ${defaulters.totalBalance.toLocaleString()}` : 'Rs 0'}
          color={Colors.warning}
        />
      </View>

      {/* Top defaulters list */}
      {recentDefaulters.length > 0 && (
        <View style={s.listSection}>
          <Text style={s.listTitle}>Top Defaulters</Text>
          {recentDefaulters.map((d, idx) => (
            <Card key={d.studentId} style={s.defaulterCard}>
              <View style={s.defRow}>
                <View style={s.defLeft}>
                  <Text style={s.defName}>{d.studentName}</Text>
                  <Text style={s.defSection}>{d.section}</Text>
                </View>
                <View style={s.defRight}>
                  <Text style={s.defBalance}>Rs {(d.balance || 0).toLocaleString()}</Text>
                  <Badge label="Due" color="danger" />
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}

      {/* Quick actions */}
      <Text style={s.sectionTitle}>Quick Actions</Text>
      <View style={s.actionsGrid}>
        {[
          { icon: '💰', label: 'Collect Fee' },
          { icon: '📋', label: 'Admissions' },
          { icon: '📊', label: 'Reports' },
          { icon: '💸', label: 'Income/Expense' },
        ].map(action => (
          <Card key={action.label} style={s.actionCard}>
            <Text style={s.actionIcon}>{action.icon}</Text>
            <Text style={s.actionLabel}>{action.label}</Text>
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  banner: { backgroundColor: Colors.primary, padding: Spacing.xl, gap: Spacing.xs },
  bannerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.white },
  bannerYear: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)' },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  statsRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.lg },
  listSection: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  listTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text },
  defaulterCard: {},
  defRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  defLeft: { flex: 1, gap: 2 },
  defName: { fontSize: FontSize.md, fontWeight: FontWeight.medium as any, color: Colors.text },
  defSection: { fontSize: FontSize.sm, color: Colors.textMuted },
  defRight: { alignItems: 'flex-end', gap: Spacing.xs },
  defBalance: { fontSize: FontSize.md, fontWeight: FontWeight.bold as any, color: Colors.danger },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, paddingHorizontal: Spacing.lg },
  actionCard: { width: '45%', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
  actionIcon: { fontSize: 32 },
  actionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any, color: Colors.text, textAlign: 'center' },
});
