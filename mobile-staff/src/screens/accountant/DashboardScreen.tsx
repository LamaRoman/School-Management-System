import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { api } from '../../api/client';
import { Card, StatCard, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import { getTodayBS } from '../../utils/bsDate';

interface AcademicYear { id: string; yearNp: string; isActive: boolean }
interface CashbookSummary { totalCollection: number; receiptCount: number }
interface DefaulterSummary { totalStudents: number; totalBalance: number }

export default function AccountantDashboard({ navigation }: any) {
  const [activeYear, setActiveYear] = useState<AcademicYear | null>(null);
  const [cashbook, setCashbook] = useState<CashbookSummary | null>(null);
  const [defaulters, setDefaulters] = useState<DefaulterSummary | null>(null);
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const years = await api.get<AcademicYear[]>('/academic-years');
      const active = Array.isArray(years) ? years.find(y => y.isActive) || years[0] : null;
      setActiveYear(active || null);

      if (!active) { setLoading(false); setRefreshing(false); return; }

      const today = getTodayBS();
      const [cbData, defData, noticeData] = await Promise.all([
        api.get<any>(`/accountant-reports/daily-cashbook?date=${today}&academicYearId=${active.id}`).catch(() => null),
        api.get<any>(`/accountant-reports/defaulters?academicYearId=${active.id}`).catch(() => null),
        api.get<any[]>('/notices').catch(() => []),
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
      }

      setNotices(Array.isArray(noticeData) ? noticeData.slice(0, 3) : []);
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

      {/* Recent notices */}
      {notices.length > 0 && (
        <View style={s.listSection}>
          <Text style={s.listTitle}>Recent Notices</Text>
          {notices.map((n: any) => (
            <Card key={n.id} style={s.noticeCard}>
              <Text style={s.noticeTxt} numberOfLines={1}>{n.title}</Text>
              <Text style={s.noticeDate}>{n.publishDate}</Text>
            </Card>
          ))}
        </View>
      )}

      {/* Quick actions */}
      <Text style={s.sectionTitle}>Quick Actions</Text>
      <View style={s.actionsGrid}>
        {[
          { icon: '💰', label: 'Collect Fee', screen: 'Collect' },
          { icon: '📢', label: 'Notices', screen: 'Notices' },
        ].map(action => (
          <TouchableOpacity key={action.label} style={s.actionCard}
            onPress={() => navigation.navigate(action.screen)} activeOpacity={0.7}>
            <Text style={s.actionIcon}>{action.icon}</Text>
            <Text style={s.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
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
  noticeCard: { gap: 4 },
  noticeTxt: { fontSize: FontSize.md, fontWeight: FontWeight.medium as any, color: Colors.text },
  noticeDate: { fontSize: FontSize.xs, color: Colors.textMuted },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, paddingHorizontal: Spacing.lg },
  actionCard: { width: '45%', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl, backgroundColor: Colors.white, borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  actionIcon: { fontSize: 32 },
  actionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any, color: Colors.text, textAlign: 'center' },
});
