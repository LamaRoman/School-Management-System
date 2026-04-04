import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Modal, FlatList, TextInput,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, getErrorMessage } from '../../api/client';
import { Card, StatCard, LoadingScreen, EmptyState } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import { getTodayBS } from '../../utils/bsDate';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear { id: string; yearNp: string; isActive: boolean }

interface ReceiptItem { category: string; amount: number; paidMonth: string | null }
interface Receipt {
  receiptNumber: string;
  studentName: string;
  className: string;
  section: string;
  rollNo: number | null;
  paymentMethod: string | null;
  items: ReceiptItem[];
  total: number;
}

interface CashbookData {
  grandTotal: number;
  totalReceipts: number;
  receipts: Receipt[];
}

interface DefaulterSummary {
  totalDefaulters: number;
  totalDue: number;
}

interface MonthProgress {
  month: string;
  collected: number;
  expected: number;
}

interface Notice { id: string; title: string; publishDate: string }

interface Student {
  id: string;
  name: string;
  rollNo: number | null;
  section: {
    name: string;
    grade: { name: string };
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const nepaliMonths = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
];

function getCurrentBSMonth(): string {
  const parts = getTodayBS().split('/');
  if (parts.length >= 2) {
    const idx = parseInt(parts[1], 10) - 1;
    return nepaliMonths[idx] ?? nepaliMonths[0];
  }
  return nepaliMonths[0];
}

// ─── Monthly Progress Card ────────────────────────────────────────────────────

function MonthlyProgressCard({ data }: { data: MonthProgress }) {
  const pct = data.expected > 0 ? Math.min(100, (data.collected / data.expected) * 100) : 0;
  const remaining = Math.max(0, data.expected - data.collected);
  const color = pct >= 80 ? Colors.success : pct >= 50 ? Colors.warning : Colors.error;

  return (
    <Card style={mp.card}>
      <View style={mp.headerRow}>
        <Text style={mp.title}>{data.month} Collection</Text>
        <Text style={[mp.pct, { color }]}>{Math.round(pct)}%</Text>
      </View>
      <View style={mp.track}>
        <View style={[mp.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <View style={mp.statsRow}>
        <View style={mp.stat}>
          <Text style={mp.statLabel}>Collected</Text>
          <Text style={[mp.statValue, { color: Colors.success }]}>Rs {data.collected.toLocaleString()}</Text>
        </View>
        <View style={mp.divider} />
        <View style={mp.stat}>
          <Text style={mp.statLabel}>Remaining</Text>
          <Text style={[mp.statValue, { color: remaining > 0 ? Colors.error : Colors.success }]}>
            Rs {remaining.toLocaleString()}
          </Text>
        </View>
        <View style={mp.divider} />
        <View style={mp.stat}>
          <Text style={mp.statLabel}>Expected</Text>
          <Text style={mp.statValue}>Rs {data.expected.toLocaleString()}</Text>
        </View>
      </View>
    </Card>
  );
}

const mp = StyleSheet.create({
  card: { gap: Spacing.sm },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text },
  pct: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any },
  track: { height: 8, backgroundColor: Colors.borderLight, borderRadius: Radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.full },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.xs },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any, color: Colors.text },
  divider: { width: 1, height: 28, backgroundColor: Colors.borderLight },
});

// ─── Receipt Detail Modal ─────────────────────────────────────────────────────

function ReceiptModal({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={rm.container}>
        <View style={rm.header}>
          <Text style={rm.title}>Receipt</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={rm.close}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
          <View style={rm.rcpBadge}>
            <Text style={rm.rcpNum}>{receipt.receiptNumber}</Text>
          </View>
          <Card>
            <Text style={rm.studentName}>{receipt.studentName}</Text>
            <Text style={rm.meta}>
              {receipt.className} – {receipt.section}
              {receipt.rollNo != null ? `  ·  Roll #${receipt.rollNo}` : ''}
            </Text>
            {receipt.paymentMethod && <Text style={rm.meta}>Method: {receipt.paymentMethod}</Text>}
          </Card>
          <Card>
            <Text style={rm.itemsTitle}>Items</Text>
            {receipt.items.map((item, idx) => (
              <View key={idx} style={rm.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={rm.itemCat}>{item.category}</Text>
                  {item.paidMonth && <Text style={rm.itemMonth}>{item.paidMonth}</Text>}
                </View>
                <Text style={rm.itemAmt}>Rs {item.amount.toLocaleString()}</Text>
              </View>
            ))}
            <View style={rm.totalRow}>
              <Text style={rm.totalLabel}>Total</Text>
              <Text style={rm.totalAmt}>Rs {receipt.total.toLocaleString()}</Text>
            </View>
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}

const rm = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.text },
  close: { fontSize: FontSize.xl, color: Colors.textMuted, padding: Spacing.sm },
  rcpBadge: { alignSelf: 'center', backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  rcpNum: { fontSize: FontSize.md, fontWeight: FontWeight.bold as any, color: Colors.white, letterSpacing: 1 },
  studentName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any, color: Colors.text },
  meta: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  itemsTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  itemCat: { fontSize: FontSize.sm, color: Colors.text, fontWeight: FontWeight.medium as any },
  itemMonth: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  itemAmt: { fontSize: FontSize.sm, color: Colors.text, fontWeight: FontWeight.medium as any },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.sm, marginTop: Spacing.xs },
  totalLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold as any, color: Colors.text },
  totalAmt: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any, color: Colors.success },
});

// ─── Student Search Modal ─────────────────────────────────────────────────────

function StudentSearchModal({
  onSelectStudent,
  onClose,
}: {
  onSelectStudent: (student: Student) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        // Industry standard: query the students table directly by name.
        // This finds ALL students regardless of payment history.
        const data = await api.get<Student[]>('/students', {
          search: query.trim(),
        });
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.surface }}>
        <View style={ss.header}>
          <Text style={ss.title}>Find Student</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={ss.close}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={ss.searchWrap}>
          <TextInput
            style={ss.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Type student name..."
            placeholderTextColor={Colors.textLight}
            autoFocus
            clearButtonMode="while-editing"
          />
          {searching && (
            <ActivityIndicator size="small" color={Colors.primary} style={ss.spinner} />
          )}
        </View>

        <FlatList
          data={results}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            query.trim().length < 2 ? (
              <View style={ss.hint}>
                <Text style={ss.hintTxt}>Type at least 2 characters to search</Text>
              </View>
            ) : !searching ? (
              <EmptyState icon="🔍" message={`No students matching "${query}"`} />
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={ss.row} onPress={() => onSelectStudent(item)}>
              <View style={{ flex: 1 }}>
                <Text style={ss.name}>{item.name}</Text>
                <Text style={ss.meta}>
                  {item.section.grade.name} – {item.section.name}
                  {item.rollNo != null ? `  ·  Roll #${item.rollNo}` : ''}
                </Text>
              </View>
              <Text style={ss.arrow}>›</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const ss = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.text },
  close: { fontSize: FontSize.xl, color: Colors.textMuted, padding: Spacing.sm },
  searchWrap: { padding: Spacing.lg, backgroundColor: Colors.white, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.surface },
  spinner: { position: 'absolute', right: Spacing.xl + Spacing.md },
  hint: { padding: Spacing.xxxl, alignItems: 'center' },
  hintTxt: { fontSize: FontSize.sm, color: Colors.textLight, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, backgroundColor: Colors.white },
  name: { fontSize: FontSize.md, fontWeight: FontWeight.medium as any, color: Colors.text },
  meta: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  arrow: { fontSize: 20, color: Colors.textMuted },
});

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function AccountantDashboard({ navigation }: any) {
  const [activeYear, setActiveYear] = useState<AcademicYear | null>(null);
  const [cashbook, setCashbook] = useState<CashbookData | null>(null);
  const [defaulters, setDefaulters] = useState<DefaulterSummary | null>(null);
  const [monthProgress, setMonthProgress] = useState<MonthProgress | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [showAllReceipts, setShowAllReceipts] = useState(false);
  const [showStudentSearch, setShowStudentSearch] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const years = await api.get<AcademicYear[]>('/academic-years');
      const active = Array.isArray(years)
        ? years.find(y => y.isActive) ?? years[0] ?? null
        : null;
      setActiveYear(active);
      if (!active) return;

      const today = getTodayBS();
      const currentMonth = getCurrentBSMonth();

      const [cbData, defData, summaryData, noticeData] = await Promise.all([
        api.get<any>(`/accountant-reports/daily-cashbook?date=${today}&academicYearId=${active.id}`).catch(() => null),
        api.get<any>(`/accountant-reports/defaulters?academicYearId=${active.id}`).catch(() => null),
        api.get<any>(`/accountant-reports/monthly-summary?academicYearId=${active.id}&month=${currentMonth}`).catch(() => null),
        api.get<any[]>('/notices').catch(() => []),
      ]);

      if (cbData) {
        setCashbook({
          grandTotal: cbData.grandTotal ?? 0,
          totalReceipts: cbData.totalReceipts ?? 0,
          receipts: Array.isArray(cbData.receipts) ? cbData.receipts : [],
        });
      }

      if (defData?.summary) {
        setDefaulters({
          totalDefaulters: defData.summary.totalDefaulters ?? 0,
          totalDue: defData.summary.totalDue ?? 0,
        });
      }

      if (summaryData?.months) {
        const entry = summaryData.months.find((m: any) => m.month === currentMonth);
        if (entry) {
          setMonthProgress({
            month: currentMonth,
            collected: entry.collected ?? 0,
            expected: entry.expected ?? 0,
          });
        }
      }

      setNotices(Array.isArray(noticeData) ? noticeData.slice(0, 3) : []);
    } catch (err) {
      console.error('Accountant dashboard error:', getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload data every time this tab gets focus (e.g. after collecting a fee)
  useFocusEffect(
    useCallback(() => { load(true); }, [load])
  );

  // Navigate to Fee Collection — student name passed as hint for the accountant
  const handleSelectStudent = useCallback((student: Student) => {
    setShowStudentSearch(false);
    navigation.navigate('Collect', { prefillStudentName: student.name });
  }, [navigation]);

  if (loading) return <LoadingScreen />;

  return (
    <>
      <ScrollView
        style={s.container}
        contentContainerStyle={{ paddingBottom: Spacing.xxxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
          />
        }
      >
        {/* ── Banner ── */}
        <View style={s.banner}>
          <View style={s.bannerTop}>
            <View>
              <Text style={s.bannerTitle}>Accountant Dashboard</Text>
              {activeYear && <Text style={s.bannerYear}>Academic Year {activeYear.yearNp}</Text>}
              <Text style={s.bannerDate}>Today: {getTodayBS()}</Text>
            </View>
            <TouchableOpacity style={s.searchBtn} onPress={() => setShowStudentSearch(true)}>
              <Text style={s.searchBtnIcon}>🔍</Text>
              <Text style={s.searchBtnTxt}>Find Student</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Monthly progress ── */}
        {monthProgress && (
          <View style={s.section}>
            <MonthlyProgressCard data={monthProgress} />
          </View>
        )}

        {/* ── Today's stats ── */}
        <Text style={s.sectionTitle}>Today's Collection</Text>
        <View style={s.statsRow}>
          <StatCard
            label="Collected"
            value={cashbook ? `Rs ${cashbook.grandTotal.toLocaleString()}` : 'Rs 0'}
            color={Colors.success}
          />
          <StatCard
            label="Receipts"
            value={cashbook?.totalReceipts ?? 0}
            color={Colors.info}
          />
        </View>

        {/* ── Today's receipts ── */}
        <View style={s.listSection}>
          <View style={s.listHeaderRow}>
            <Text style={s.listTitle}>Today's Receipts</Text>
            {(cashbook?.receipts.length ?? 0) > 3 && (
              <TouchableOpacity onPress={() => setShowAllReceipts(true)}>
                <Text style={s.viewAll}>View all {cashbook!.receipts.length}</Text>
              </TouchableOpacity>
            )}
          </View>
          {cashbook && cashbook.receipts.length > 0 ? (
            cashbook.receipts.slice(0, 3).map(receipt => (
              <TouchableOpacity
                key={receipt.receiptNumber}
                onPress={() => setSelectedReceipt(receipt)}
                activeOpacity={0.7}
              >
                <Card style={s.receiptCard}>
                  <View style={s.receiptRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.receiptStudent} numberOfLines={1}>{receipt.studentName}</Text>
                      <Text style={s.receiptMeta}>
                        {receipt.className} {receipt.section}  ·  {receipt.receiptNumber}
                      </Text>
                    </View>
                    <View style={s.receiptRight}>
                      <Text style={s.receiptAmt}>Rs {receipt.total.toLocaleString()}</Text>
                      <Text style={s.chevron}>›</Text>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            ))
          ) : (
            <Card>
              <Text style={s.emptyTxt}>No collections recorded today.</Text>
            </Card>
          )}
        </View>

        {/* ── Defaulters ── */}
        <Text style={s.sectionTitle}>Fee Defaulters</Text>
        <View style={s.statsRow}>
          <StatCard label="Students" value={defaulters?.totalDefaulters ?? 0} color={Colors.danger} />
          <StatCard
            label="Outstanding"
            value={defaulters ? `Rs ${defaulters.totalDue.toLocaleString()}` : 'Rs 0'}
            color={Colors.warning}
          />
        </View>

        {/* ── Notices ── */}
        {notices.length > 0 && (
          <View style={s.listSection}>
            <Text style={s.listTitle}>Recent Notices</Text>
            {notices.map(n => (
              <Card key={n.id} style={s.noticeCard}>
                <Text style={s.noticeTxt} numberOfLines={1}>{n.title}</Text>
                <Text style={s.noticeDate}>{n.publishDate}</Text>
              </Card>
            ))}
          </View>
        )}

        {/* ── Quick actions ── */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.actionsGrid}>
          {[
            { icon: '💰', label: 'Collect Fee', screen: 'Collect' },
            { icon: '📢', label: 'Notices', screen: 'Notices' },
          ].map(action => (
            <TouchableOpacity
              key={action.label}
              style={s.actionCard}
              onPress={() => navigation.navigate(action.screen)}
              activeOpacity={0.7}
            >
              <Text style={s.actionIcon}>{action.icon}</Text>
              <Text style={s.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* ── Receipt detail modal ── */}
      {selectedReceipt && (
        <ReceiptModal receipt={selectedReceipt} onClose={() => setSelectedReceipt(null)} />
      )}

      {/* ── All receipts modal ── */}
      <Modal
        visible={showAllReceipts}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAllReceipts(false)}
      >
        <View style={{ flex: 1, backgroundColor: Colors.surface }}>
          <View style={s.modalHdr}>
            <Text style={s.modalTitle}>Today's Receipts</Text>
            <TouchableOpacity
              onPress={() => setShowAllReceipts(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={cashbook?.receipts ?? []}
            keyExtractor={item => item.receiptNumber}
            contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.sm }}
            ListEmptyComponent={<EmptyState icon="🧾" message="No receipts today" />}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => { setShowAllReceipts(false); setSelectedReceipt(item); }}
                activeOpacity={0.7}
              >
                <Card style={s.receiptCard}>
                  <View style={s.receiptRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.receiptStudent} numberOfLines={1}>{item.studentName}</Text>
                      <Text style={s.receiptMeta}>
                        {item.className} {item.section}  ·  {item.receiptNumber}
                      </Text>
                    </View>
                    <View style={s.receiptRight}>
                      <Text style={s.receiptAmt}>Rs {item.total.toLocaleString()}</Text>
                      <Text style={s.chevron}>›</Text>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* ── Student search modal ── */}
      {showStudentSearch && (
        <StudentSearchModal
          onSelectStudent={handleSelectStudent}
          onClose={() => setShowStudentSearch(false)}
        />
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  banner: { backgroundColor: Colors.primary, padding: Spacing.xl },
  bannerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bannerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.white },
  bannerYear: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  bannerDate: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  searchBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, alignItems: 'center', gap: 4 },
  searchBtnIcon: { fontSize: 20 },
  searchBtnTxt: { fontSize: 10, color: Colors.white, fontWeight: FontWeight.medium as any },
  section: { padding: Spacing.lg },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  statsRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.lg },
  listSection: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.sm },
  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text },
  viewAll: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.medium as any },
  emptyTxt: { fontSize: FontSize.sm, color: Colors.textLight, fontStyle: 'italic', textAlign: 'center', paddingVertical: Spacing.sm },
  receiptCard: { padding: 0, overflow: 'hidden' },
  receiptRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  receiptStudent: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text },
  receiptMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  receiptRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  receiptAmt: { fontSize: FontSize.md, fontWeight: FontWeight.bold as any, color: Colors.success },
  chevron: { fontSize: 20, color: Colors.textMuted, lineHeight: 24 },
  noticeCard: { gap: 4 },
  noticeTxt: { fontSize: FontSize.md, fontWeight: FontWeight.medium as any, color: Colors.text },
  noticeDate: { fontSize: FontSize.xs, color: Colors.textMuted },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  actionCard: { width: '45%', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl, backgroundColor: Colors.white, borderRadius: Radius.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  actionIcon: { fontSize: 32 },
  actionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any, color: Colors.text, textAlign: 'center' },
  modalHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.text },
  modalClose: { fontSize: FontSize.xl, color: Colors.textMuted, padding: Spacing.sm },
});