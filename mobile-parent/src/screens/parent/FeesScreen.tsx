import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { api } from '../../api/client';
import { Card, Badge, EmptyState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';

interface Child { id: string; name: string }
interface Payment {
  id: string;
  monthNp: string;
  paidDateBS: string;
  totalPaid: number;
  receiptNumber: string;
  feeCategory: { name: string };
}
interface FeeData {
  payments: Payment[];
  summary?: { totalPaid: number; totalDue: number; balance: number };
}

export default function ParentFeesScreen() {
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [feeData, setFeeData] = useState<FeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feeLoading, setFeeLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadChildren = async () => {
    try {
      const data = await api.get<Child[]>('/parents/my-children');
      const kids = Array.isArray(data) ? data : [];
      setChildren(kids);
      if (kids.length) setSelectedChild(kids[0]);
    } catch (err) {
      console.error('Children load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFees = useCallback(async (child: Child, silent = false) => {
    if (!silent) setFeeLoading(true);
    try {
      const data = await api.get<FeeData>(`/parents/child/${child.id}/fees`);
      setFeeData(data);
    } catch (err) {
      console.error('Fee load error:', err);
      setFeeData(null);
    } finally {
      setFeeLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadChildren(); }, []);

  useEffect(() => {
    if (selectedChild) loadFees(selectedChild);
  }, [selectedChild]);

  const handleRefresh = () => {
    setRefreshing(true);
    if (selectedChild) loadFees(selectedChild, true);
  };

  if (loading) return <LoadingScreen />;

  const payments = feeData?.payments || [];
  const totalPaid = payments.reduce((sum, p) => sum + p.totalPaid, 0);

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: Spacing.xxxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {/* Child selector */}
      {children.length > 1 && (
        <View style={s.selectorSection}>
          <Text style={s.selectorLabel}>Child</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chipRow}>
              {children.map(c => (
                <TouchableOpacity key={c.id} style={[s.chip, selectedChild?.id === c.id && s.chipActive]}
                  onPress={() => setSelectedChild(c)}>
                  <Text style={[s.chipText, selectedChild?.id === c.id && s.chipTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {feeLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <>
          {/* Summary card */}
          <Card style={s.summaryCard}>
            <Text style={s.summaryTitle}>Fee Summary</Text>
            <View style={s.summaryRow}>
              <View style={s.summaryItem}>
                <Text style={[s.summaryVal, { color: Colors.success }]}>
                  Rs {totalPaid.toLocaleString()}
                </Text>
                <Text style={s.summaryKey}>Total Paid</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={[s.summaryVal, { color: Colors.primary }]}>
                  {payments.length}
                </Text>
                <Text style={s.summaryKey}>Payments</Text>
              </View>
            </View>
          </Card>

          {/* Payment history */}
          <View style={s.listSection}>
            <Text style={s.listTitle}>Payment History</Text>
            {payments.length === 0 ? (
              <EmptyState icon="💰" message="No fee payments recorded yet" />
            ) : (
              payments.map(payment => (
                <Card key={payment.id} style={s.paymentCard}>
                  <View style={s.paymentRow}>
                    <View style={s.paymentLeft}>
                      <Text style={s.paymentCategory}>{payment.feeCategory?.name || 'Fee'}</Text>
                      <Text style={s.paymentMonth}>{payment.monthNp}</Text>
                      <View style={s.paymentMeta}>
                        <Text style={s.paymentDate}>📅 {payment.paidDateBS}</Text>
                        <Text style={s.paymentReceipt}>🧾 #{payment.receiptNumber}</Text>
                      </View>
                    </View>
                    <View style={s.paymentRight}>
                      <Text style={s.paymentAmount}>Rs {payment.totalPaid.toLocaleString()}</Text>
                      <Badge label="Paid" color="success" />
                    </View>
                  </View>
                </Card>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  selectorSection: { backgroundColor: Colors.white, padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  selectorLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, color: Colors.textMuted, marginBottom: Spacing.sm },
  chipRow: { flexDirection: 'row', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium as any },
  chipTextActive: { color: Colors.white },
  center: { padding: Spacing.xxxl, alignItems: 'center' },
  summaryCard: { margin: Spacing.lg },
  summaryTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text, marginBottom: Spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center', gap: Spacing.xs },
  summaryVal: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold as any },
  summaryKey: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase' },
  summaryDivider: { width: 1, backgroundColor: Colors.border },
  listSection: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  listTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text, marginBottom: Spacing.sm },
  paymentCard: { gap: Spacing.sm },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  paymentLeft: { flex: 1, gap: Spacing.xs },
  paymentCategory: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text },
  paymentMonth: { fontSize: FontSize.sm, color: Colors.textMuted },
  paymentMeta: { flexDirection: 'row', gap: Spacing.md },
  paymentDate: { fontSize: FontSize.xs, color: Colors.textLight },
  paymentReceipt: { fontSize: FontSize.xs, color: Colors.textLight },
  paymentRight: { alignItems: 'flex-end', gap: Spacing.xs },
  paymentAmount: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any, color: Colors.success },
});
