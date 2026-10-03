import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, RefreshControl, Linking, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getErrorMessage } from '../../api/client';
import { Button, Card, EmptyState, ErrorState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import { useActiveYear } from '../../hooks/useActiveYear';
import {
  BS_MONTH_NAMES, formatBSDateLong, getNextDayBS, getPreviousDayBS, getTodayBS, isFutureBS, isTodayBS,
} from '../../utils/bsDate';
import {
  Defaulter, PaymentLine, appendPage, barWidth, dialable, filterDefaulters, formatRs, groupByReceipt, percent, sortDefaulters,
} from '../../utils/accountantReports';

// Read-only money reports for the accountant, on the phone: Daily Cash Book, Fee Defaulters,
// Payment History and Monthly Summary. Printing / the discount and student-count reports stay on the web.

// ─── Shared bits ─────────────────────────────────────────────────────────────

/** Wraps a report: waits for the academic year, shows a retryable error, hands over the year id. */
function WithYear({ children }: { children: (yearId: string) => React.ReactNode }) {
  const { year, loading, error, reload } = useActiveYear();
  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!year) return <EmptyState icon="📅" message="No academic year is set up yet." />;
  return <>{children(year.id)}</>;
}

function Pills({ items, value, onPick }: { items: { id: string; label: string }[]; value: string; onPick: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.pillRow} style={st.pills}>
      {items.map(i => (
        <TouchableOpacity key={i.id} style={[st.pill, value === i.id && st.pillActive]} onPress={() => onPick(i.id)}>
          <Text style={[st.pillText, value === i.id && st.pillTextActive]}>{i.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function Stat({ label, value, color = Colors.primary }: { label: string; value: string; color?: string }) {
  return (
    <View style={st.stat}>
      <Text style={[st.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Menu ────────────────────────────────────────────────────────────────────

export function ReportsMenuScreen({ navigation }: any) {
  const items = [
    { screen: 'ReportCashBook', icon: 'calendar-outline', title: 'Daily Cash Book', desc: "A day's collections by receipt, method and category" },
    { screen: 'ReportDefaulters', icon: 'alert-circle-outline', title: 'Fee Defaulters', desc: 'Who owes what, biggest balance first — tap to call' },
    { screen: 'ReportPayments', icon: 'receipt-outline', title: 'Payment History', desc: 'Search receipts by number or student' },
    { screen: 'ReportMonthly', icon: 'stats-chart-outline', title: 'Monthly Summary', desc: 'Collected vs expected, month by month' },
  ] as const;
  return (
    <ScrollView style={st.container} contentContainerStyle={st.content}>
      {items.map(i => (
        <TouchableOpacity key={i.screen} activeOpacity={0.8} onPress={() => navigation.navigate(i.screen)} accessibilityRole="button" accessibilityLabel={i.title}>
          <Card style={st.menuCard}>
            <Ionicons name={i.icon as any} size={26} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={st.menuTitle}>{i.title}</Text>
              <Text style={st.menuDesc}>{i.desc}</Text>
            </View>
            <Text style={st.chev}>›</Text>
          </Card>
        </TouchableOpacity>
      ))}
      <Text style={st.footNote}>Printing, the discount report and the student-count report are on the web.</Text>
    </ScrollView>
  );
}

// ─── Daily cash book ─────────────────────────────────────────────────────────

interface CashBook {
  date: string; grandTotal: number; totalReceipts: number;
  receipts: { receiptNumber: string; studentName: string; className: string; section: string; paymentMethod: string | null; total: number; items: { category: string; amount: number }[] }[];
  categorySummary: { name: string; amount: number }[];
  methodSummary: { method: string; amount: number }[];
}

export function CashBookScreen() {
  return <WithYear>{yearId => <CashBook yearId={yearId} />}</WithYear>;
}

function CashBook({ yearId }: { yearId: string }) {
  const [date, setDate] = useState(getTodayBS());
  const [data, setData] = useState<CashBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const mine = ++requestId.current;
    setLoading(true);
    setError(null);
    setData(null);
    setOpen(null);
    try {
      const res = await api.get<CashBook>(`/accountant-reports/daily-cashbook?date=${date}&academicYearId=${yearId}`);
      if (mine === requestId.current) setData(res);
    } catch (err) {
      if (mine === requestId.current) setError(getErrorMessage(err));
    } finally {
      if (mine === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [date, yearId]);
  useEffect(() => { load(); }, [load]);

  const nextDisabled = isTodayBS(date) || isFutureBS(date);

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <Card style={st.dateBar}>
        <TouchableOpacity onPress={() => setDate(getPreviousDayBS(date))} style={st.navBtn} accessibilityLabel="Previous day"><Text style={st.navText}>‹</Text></TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={st.dateText}>{formatBSDateLong(date)}</Text>
          {isTodayBS(date) && <Text style={st.todayTag}>Today</Text>}
        </View>
        <TouchableOpacity onPress={() => { const n = getNextDayBS(date); if (!isFutureBS(n)) setDate(n); }} disabled={nextDisabled} style={[st.navBtn, nextDisabled && { opacity: 0.3 }]} accessibilityLabel="Next day"><Text style={st.navText}>›</Text></TouchableOpacity>
      </Card>

      {loading && <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.primary} />}
      {error && <ErrorState message={error} onRetry={load} />}

      {data && (
        <>
          <View style={st.statRow}>
            <Stat label="Total collected" value={formatRs(data.grandTotal)} color={Colors.success} />
            <Stat label="Receipts" value={String(data.totalReceipts)} />
          </View>

          {data.receipts.length === 0 ? (
            <Text style={st.muted}>No payments were recorded on this day.</Text>
          ) : (
            <>
              {data.methodSummary.length > 0 && (
                <Card style={st.block}>
                  <Text style={st.blockTitle}>By payment method</Text>
                  {data.methodSummary.map(m => (
                    <View key={m.method} style={st.kv}><Text style={st.k}>{m.method || 'Cash'}</Text><Text style={st.v}>{formatRs(m.amount)}</Text></View>
                  ))}
                </Card>
              )}
              <Card style={st.block}>
                <Text style={st.blockTitle}>By category</Text>
                {data.categorySummary.map(c => (
                  <View key={c.name} style={st.kv}><Text style={st.k}>{c.name}</Text><Text style={st.v}>{formatRs(c.amount)}</Text></View>
                ))}
              </Card>
              <Text style={st.listTitle}>Receipts</Text>
              {data.receipts.map((r, i) => {
                const key = `${r.receiptNumber}-${i}`;
                const isOpen = open === key;
                return (
                  <TouchableOpacity key={key} activeOpacity={0.8} onPress={() => setOpen(isOpen ? null : key)}>
                    <Card style={st.rowCard}>
                      <View style={st.rowTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={st.rowTitle}>{r.studentName}</Text>
                          <Text style={st.rowSub}>{r.className} {r.section} · {r.receiptNumber} · {r.paymentMethod || 'Cash'}</Text>
                        </View>
                        <Text style={st.rowAmt}>{formatRs(r.total)}</Text>
                      </View>
                      {isOpen && r.items.map((it, j) => (
                        <View key={j} style={st.kv}><Text style={st.k}>{it.category}</Text><Text style={st.v}>{formatRs(it.amount)}</Text></View>
                      ))}
                    </Card>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ─── Defaulters ──────────────────────────────────────────────────────────────

interface DefaulterData { defaulters: Defaulter[]; currentMonth: string; summary: { totalStudents: number; totalDefaulters: number; totalDue: number } }
interface GradeRow { id: string; name: string }

export function DefaultersScreen() {
  return <WithYear>{yearId => <Defaulters yearId={yearId} />}</WithYear>;
}

function Defaulters({ yearId }: { yearId: string }) {
  const todayMonth = BS_MONTH_NAMES[Math.max(0, parseInt(getTodayBS().split('/')[1], 10) - 1)] ?? BS_MONTH_NAMES[0];
  const [month, setMonth] = useState(todayMonth);
  const [gradeId, setGradeId] = useState('');
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<DefaulterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  useEffect(() => { api.get<GradeRow[]>(`/grades?academicYearId=${yearId}`).then(g => setGrades(Array.isArray(g) ? g : [])).catch(() => {}); }, [yearId]);

  const load = useCallback(async () => {
    const mine = ++requestId.current;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await api.get<DefaulterData>(`/accountant-reports/defaulters?academicYearId=${yearId}&currentMonth=${month}${gradeId ? `&gradeId=${gradeId}` : ''}`);
      if (mine === requestId.current) setData(res);
    } catch (err) {
      if (mine === requestId.current) setError(getErrorMessage(err));
    } finally {
      if (mine === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [yearId, month, gradeId]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => filterDefaulters(sortDefaulters(data?.defaulters ?? []), query), [data, query]);

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <Text style={st.label}>Dues up to the end of <Text style={{ fontWeight: FontWeight.bold, color: Colors.primary }}>{month}</Text></Text>
      <Pills items={BS_MONTH_NAMES.map(m => ({ id: m, label: m }))} value={month} onPick={setMonth} />
      {grades.length > 0 && <Pills items={[{ id: '', label: 'All classes' }, ...grades.map(g => ({ id: g.id, label: `Class ${g.name}` }))]} value={gradeId} onPick={setGradeId} />}
      <TextInput style={st.search} value={query} onChangeText={setQuery} placeholder="Search name or roll number" placeholderTextColor={Colors.textMuted} autoCorrect={false} autoCapitalize="none" />

      {loading && <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.primary} />}
      {error && <ErrorState message={error} onRetry={load} />}

      {data && (
        <>
          <View style={st.statRow}>
            <Stat label="Students with dues" value={`${data.summary.totalDefaulters} of ${data.summary.totalStudents}`} color={Colors.warning} />
            <Stat label="Total due" value={formatRs(data.summary.totalDue)} color={Colors.danger} />
          </View>
          {data.defaulters.length === 0 && <Text style={st.muted}>Nobody has dues for {data.currentMonth}. 🎉</Text>}
          {data.defaulters.length > 0 && shown.length === 0 && <Text style={st.muted}>No one matches “{query.trim()}”.</Text>}
          {shown.map(d => {
            const phone = dialable(d.guardianPhone);
            return (
              <Card key={d.studentId} style={st.rowCard}>
                <View style={st.rowTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.rowTitle}>{d.studentName}</Text>
                    <Text style={st.rowSub}>{d.className} {d.section}{d.rollNo != null ? ` · Roll ${d.rollNo}` : ''} · {d.monthsPending > 0 ? `${d.monthsPending} month${d.monthsPending === 1 ? '' : 's'} pending` : 'dues pending'}</Text>
                    <Text style={st.rowSub}>Paid {formatRs(d.totalPaid)} of {formatRs(d.expectedUpTo)}</Text>
                  </View>
                  <Text style={[st.rowAmt, { color: Colors.danger }]}>{formatRs(d.balance)}</Text>
                </View>
                {phone && (
                  <TouchableOpacity style={st.callBtn} onPress={() => Linking.openURL(`tel:${phone}`)} accessibilityLabel={`Call guardian of ${d.studentName}`}>
                    <Ionicons name="call-outline" size={16} color={Colors.primary} />
                    <Text style={st.callText}>Call guardian · {d.guardianPhone}</Text>
                  </TouchableOpacity>
                )}
              </Card>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

// ─── Payment history ─────────────────────────────────────────────────────────

interface HistoryPage { payments: PaymentLine[]; total: number; page: number; pages: number }

export function PaymentHistoryScreen() {
  return <WithYear>{yearId => <PaymentHistory yearId={yearId} />}</WithYear>;
}

function PaymentHistory({ yearId }: { yearId: string }) {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<PaymentLine[]>([]);
  const [info, setInfo] = useState<{ total: number; page: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const requestId = useRef(0);

  // Typing waits a moment before searching so each keystroke is not a request.
  useEffect(() => { const t = setTimeout(() => setSearch(text.trim()), 400); return () => clearTimeout(t); }, [text]);

  const fetchPage = useCallback(async (page: number, replace: boolean) => {
    const mine = ++requestId.current;
    replace ? setLoading(true) : setMore(true);
    setError(null);
    try {
      const res = await api.get<HistoryPage>('/accountant-reports/payment-history', { academicYearId: yearId, search: search || undefined, page, limit: 40 });
      if (mine !== requestId.current) return;
      setLines(prev => (replace ? res.payments : appendPage(prev, res.payments)));
      setInfo({ total: res.total, page: res.page, pages: res.pages });
    } catch (err) {
      if (mine === requestId.current) setError(getErrorMessage(err));
    } finally {
      if (mine === requestId.current) { setLoading(false); setMore(false); }
    }
  }, [yearId, search]);
  useEffect(() => { setOpen(null); fetchPage(1, true); }, [fetchPage]);

  const receipts = useMemo(() => groupByReceipt(lines), [lines]);
  const hasMore = !!info && info.page < info.pages;

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
      <TextInput style={st.search} value={text} onChangeText={setText} placeholder="Receipt number or student name" placeholderTextColor={Colors.textMuted} autoCorrect={false} autoCapitalize="none" />
      {info && !loading && <Text style={st.count}>{info.total} payment line{info.total === 1 ? '' : 's'}{search ? ` matching “${search}”` : ''}</Text>}

      {loading && <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.primary} />}
      {error && <ErrorState message={error} onRetry={() => fetchPage(1, true)} />}
      {!loading && !error && receipts.length === 0 && <Text style={st.muted}>No payments found.</Text>}

      {receipts.map(r => {
        const isOpen = open === r.key;
        return (
          <TouchableOpacity key={r.key} activeOpacity={0.8} onPress={() => setOpen(isOpen ? null : r.key)}>
            <Card style={st.rowCard}>
              <View style={st.rowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={st.rowTitle}>{r.studentName}</Text>
                  <Text style={st.rowSub}>{r.className} {r.section} · {r.receiptNumber}</Text>
                  <Text style={st.rowSub}>{r.paymentDate ? formatBSDateLong(r.paymentDate) : ''} · {r.paymentMethod}</Text>
                </View>
                <Text style={st.rowAmt}>{formatRs(r.total)}</Text>
              </View>
              {isOpen && r.items.map((it, j) => (
                <View key={j} style={st.kv}><Text style={st.k}>{it.category}{it.paidMonth ? ` (${it.paidMonth})` : ''}</Text><Text style={st.v}>{formatRs(it.amount)}</Text></View>
              ))}
            </Card>
          </TouchableOpacity>
        );
      })}
      {hasMore && !loading && <Button title="Load more" variant="outline" loading={more} onPress={() => fetchPage((info?.page ?? 1) + 1, false)} style={{ marginTop: Spacing.sm }} />}
    </ScrollView>
  );
}

// ─── Monthly summary ─────────────────────────────────────────────────────────

interface MonthlyData {
  months: { month: string; collected: number; receiptCount: number; expected: number }[];
  byCategory: { name: string; amount: number }[];
  totalCollected: number; totalExpected: number; studentCount: number;
}

export function MonthlySummaryScreen() {
  return <WithYear>{yearId => <Monthly yearId={yearId} />}</WithYear>;
}

function Monthly({ yearId }: { yearId: string }) {
  const [data, setData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<MonthlyData>(`/accountant-reports/monthly-summary?academicYearId=${yearId}`));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [yearId]);
  useEffect(() => { load(); }, [load]);

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      {loading && <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.primary} />}
      {error && <ErrorState message={error} onRetry={load} />}
      {data && (
        <>
          <View style={st.statRow}>
            <Stat label="Collected this year" value={formatRs(data.totalCollected)} color={Colors.success} />
            <Stat label="Expected" value={formatRs(data.totalExpected)} />
          </View>
          <Text style={st.count}>{percent(data.totalCollected, data.totalExpected)}% of the year's expected fees · {data.studentCount} students</Text>

          <Card style={st.block}>
            <Text style={st.blockTitle}>Month by month</Text>
            {data.months.map(m => (
              <View key={m.month} style={st.monthRow}>
                <View style={st.monthHead}>
                  <Text style={st.k}>{m.month}</Text>
                  <Text style={st.v}>{formatRs(m.collected)} <Text style={st.rowSub}>/ {formatRs(m.expected)}</Text></Text>
                </View>
                <View style={st.track}><View style={[st.fill, { width: `${barWidth(m.collected, m.expected)}%` }]} /></View>
                <Text style={st.rowSub}>{m.receiptCount} receipt{m.receiptCount === 1 ? '' : 's'} · {percent(m.collected, m.expected)}%</Text>
              </View>
            ))}
          </Card>

          {data.byCategory.length > 0 && (
            <Card style={st.block}>
              <Text style={st.blockTitle}>By category</Text>
              {data.byCategory.map(c => (
                <View key={c.name} style={st.kv}><Text style={st.k}>{c.name}</Text><Text style={st.v}>{formatRs(c.amount)}</Text></View>
              ))}
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  muted: { color: Colors.textMuted, textAlign: 'center', padding: Spacing.lg, fontSize: FontSize.sm },
  count: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  label: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.xs },
  footNote: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.lg, lineHeight: 18 },
  chev: { fontSize: 24, color: Colors.textMuted },

  menuCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm, minHeight: 64 },
  menuTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.primary },
  menuDesc: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2, lineHeight: 18 },

  pills: { marginBottom: Spacing.sm },
  pillRow: { gap: Spacing.sm, flexDirection: 'row' },
  pill: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs, borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: FontSize.sm, color: Colors.textMuted },
  pillTextActive: { color: Colors.white, fontWeight: FontWeight.medium },
  search: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSize.md, color: Colors.text, marginBottom: Spacing.sm },

  dateBar: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, padding: Spacing.sm },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 28, color: Colors.primary, fontWeight: FontWeight.bold },
  dateText: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.primary },
  todayTag: { fontSize: FontSize.xs, color: Colors.primary, marginTop: 2 },

  statRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  stat: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center' },
  statValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },

  block: { marginBottom: Spacing.md },
  blockTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary, marginBottom: Spacing.sm },
  listTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text, marginBottom: Spacing.sm, marginTop: Spacing.xs },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: 3 },
  k: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  v: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },

  rowCard: { marginBottom: Spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  rowTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  rowSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },
  rowAmt: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.success },
  callBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.sm, minHeight: 44, borderRadius: Radius.md, backgroundColor: Colors.primary + '10' },
  callText: { color: Colors.primary, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },

  monthRow: { marginBottom: Spacing.md },
  monthHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  track: { height: 8, backgroundColor: Colors.borderLight, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  fill: { height: 8, borderRadius: 4, backgroundColor: Colors.success },
});
