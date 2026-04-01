import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { api, getErrorMessage } from '../../api/client';
import { Card, Button, EmptyState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import { getTodayBS } from '../../utils/bsDate';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Grade { id: string; name: string }
interface Section { id: string; name: string; grade: Grade }
interface Student { id: string; name: string; rollNo?: number }
interface AcademicYear { id: string; yearNp: string; isActive: boolean }

interface FeeItem {
  feeCategoryId: string;
  category: string;
  amount: number;
  paidMonth?: string;
}

interface MonthlyRate {
  feeCategoryId: string;
  category: string;
  amount: number;
}

interface Invoice {
  student: { name: string; className: string; section: string; rollNo?: number };
  month: string;
  yearBS: string;
  arrearItems: FeeItem[];
  currentItems: FeeItem[];
  otherItems: FeeItem[];
  monthlyRates: MonthlyRate[];
  advanceMonths: string[];
  totalArrears: number;
  totalCurrent: number;
  totalOther: number;
  grandTotal: number;
}

// ─── Small reusable pieces ────────────────────────────────────────────────────

function SectionHeader({
  title, total, color = Colors.text, badge,
}: {
  title: string; total: number; color?: string; badge?: string;
}) {
  return (
    <View style={sh.wrap}>
      <View style={sh.left}>
        <Text style={[sh.title, { color }]}>{title}</Text>
        {badge && (
          <View style={sh.badge}>
            <Text style={sh.badgeTxt}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={[sh.total, { color }]}>Rs {total.toLocaleString()}</Text>
    </View>
  );
}

const sh = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  title: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any, textTransform: 'uppercase', letterSpacing: 0.5 },
  total: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any },
  badge: { backgroundColor: Colors.error, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt: { color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold as any },
});

function FeeRow({ item, muted }: { item: FeeItem; muted?: boolean }) {
  return (
    <View style={frow.wrap}>
      <View style={{ flex: 1 }}>
        <Text style={[frow.cat, muted && frow.muted]}>{item.category}</Text>
        {item.paidMonth && <Text style={frow.month}>{item.paidMonth}</Text>}
      </View>
      <Text style={[frow.amt, muted && frow.muted]}>Rs {item.amount.toLocaleString()}</Text>
    </View>
  );
}

const frow = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  cat: { fontSize: FontSize.sm, color: Colors.text, fontWeight: FontWeight.medium as any },
  month: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  amt: { fontSize: FontSize.sm, color: Colors.text, fontWeight: FontWeight.medium as any },
  muted: { color: Colors.textMuted },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FeeCollectionScreen() {
  // Reference data
  const [grades, setGrades] = useState<Grade[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [activeYear, setActiveYear] = useState<AcademicYear | null>(null);

  // Selections
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Invoice + advance
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [advanceCount, setAdvanceCount] = useState(0);
  const [paidDateBS, setPaidDateBS] = useState<string>(getTodayBS);

  // UI
  const [searchText, setSearchText] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [initError, setInitError] = useState('');

  // ── Boot ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [gradeData, monthData, yearData] = await Promise.all([
          api.get<Grade[]>('/grades'),
          api.get<string[]>('/fees/months'),
          api.get<AcademicYear[]>('/academic-years'),
        ]);
        if (!mounted) return;
        setGrades(Array.isArray(gradeData) ? gradeData : []);
        setMonths(Array.isArray(monthData) ? monthData : []);
        const active = Array.isArray(yearData)
          ? yearData.find(y => y.isActive) ?? yearData[0] ?? null
          : null;
        setActiveYear(active);
        if (!active) setInitError('No active academic year. Contact admin.');
      } catch (err) {
        if (mounted) setInitError(getErrorMessage(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // ── Load sections ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedGrade) { setSections([]); return; }
    let mounted = true;
    setSectionsLoading(true);
    api.get<Section[]>('/sections', { gradeId: selectedGrade.id })
      .then(d => { if (mounted) setSections(Array.isArray(d) ? d : []); })
      .catch(err => { if (mounted) Alert.alert('Error', getErrorMessage(err)); })
      .finally(() => { if (mounted) setSectionsLoading(false); });
    return () => { mounted = false; };
  }, [selectedGrade]);

  // ── Load students ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedSection) { setStudents([]); return; }
    let mounted = true;
    setStudentsLoading(true);
    api.get<Student[]>('/students', { sectionId: selectedSection.id })
      .then(d => { if (mounted) setStudents(Array.isArray(d) ? d : []); })
      .catch(err => { if (mounted) Alert.alert('Error', getErrorMessage(err)); })
      .finally(() => { if (mounted) setStudentsLoading(false); });
    return () => { mounted = false; };
  }, [selectedSection]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectGrade = useCallback((grade: Grade) => {
    setSelectedGrade(grade);
    setSelectedSection(null);
    setSelectedMonth('');
    setSelectedStudent(null);
    setInvoice(null);
    setAdvanceCount(0);
    setSearchText('');
  }, []);

  const handleSelectSection = useCallback((section: Section) => {
    setSelectedSection(section);
    setSelectedMonth('');
    setSelectedStudent(null);
    setInvoice(null);
    setAdvanceCount(0);
    setSearchText('');
  }, []);

  const handleSelectMonth = useCallback((month: string) => {
    setSelectedMonth(month);
    setSelectedStudent(null);
    setInvoice(null);
    setAdvanceCount(0);
  }, []);

  const handleClosePicker = useCallback(() => {
    setShowPicker(false);
    setSearchText('');
  }, []);

  const loadInvoice = useCallback(async (student: Student) => {
    if (!activeYear || !selectedMonth) return;
    setSelectedStudent(student);
    setShowPicker(false);
    setSearchText('');
    setInvoiceLoading(true);
    setInvoice(null);
    setAdvanceCount(0);
    try {
      const data = await api.get<Invoice>(`/fees/invoice/${student.id}`, {
        month: selectedMonth,
        academicYearId: activeYear.id,
      });
      setInvoice(data ?? null);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
      setSelectedStudent(null);
    } finally {
      setInvoiceLoading(false);
    }
  }, [activeYear, selectedMonth]);

  // ── Advance calculation ───────────────────────────────────────────────────

  const advanceItems = useMemo((): FeeItem[] => {
    if (!invoice || advanceCount === 0) return [];
    const items: FeeItem[] = [];
    for (let i = 0; i < advanceCount; i++) {
      const monthName = invoice.advanceMonths[i];
      for (const rate of invoice.monthlyRates) {
        items.push({ feeCategoryId: rate.feeCategoryId, category: rate.category, amount: rate.amount, paidMonth: monthName });
      }
    }
    return items;
  }, [invoice, advanceCount]);

  const advanceTotal = useMemo(() => advanceItems.reduce((sum, i) => sum + i.amount, 0), [advanceItems]);
  const grandTotal = useMemo(() => (invoice ? invoice.grandTotal + advanceTotal : 0), [invoice, advanceTotal]);

  // ── Collect ───────────────────────────────────────────────────────────────

  const handleCollect = useCallback(async () => {
    if (!invoice || !selectedStudent || !activeYear) return;

    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(paidDateBS.trim())) {
      Alert.alert('Error', 'Enter a valid payment date in YYYY/MM/DD format.');
      return;
    }

    const allItems = [
      ...invoice.arrearItems,
      ...invoice.currentItems,
      ...invoice.otherItems,
      ...advanceItems,
    ];

    if (allItems.length === 0) {
      Alert.alert('Info', 'No outstanding fees for this student.');
      return;
    }

    const payload = {
      studentId: selectedStudent.id,
      academicYearId: activeYear.id,
      paymentDate: paidDateBS.trim(),
      items: allItems.map(item => ({
        feeCategoryId: item.feeCategoryId,
        amount: item.amount,
        ...(item.paidMonth ? { paidMonth: item.paidMonth } : {}),
      })),
    };

    setPaying(true);
    try {
      await api.post('/fees/payments/bulk', payload);
      Alert.alert(
        'Success',
        `Rs ${grandTotal.toLocaleString()} collected for ${selectedStudent.name}`,
        [{
          text: 'OK', onPress: () => {
            setInvoice(null);
            setSelectedStudent(null);
            setAdvanceCount(0);
            setPaidDateBS(getTodayBS());
            setSearchText('');
          },
        }],
      );
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setPaying(false);
    }
  }, [invoice, selectedStudent, activeYear, paidDateBS, advanceItems, grandTotal]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchText.toLowerCase())
  );
  const hasAnythingDue = invoice && (
    invoice.arrearItems.length > 0 ||
    invoice.currentItems.length > 0 ||
    invoice.otherItems.length > 0
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <LoadingScreen />;

  if (initError) {
    return (
      <View style={s.errorBox}>
        <Text style={s.errorIcon}>⚠️</Text>
        <Text style={s.errorText}>{initError}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">

        {/* Grade */}
        <View style={s.section}>
          <Text style={s.label}>Grade</Text>
          {grades.length === 0 ? <Text style={s.hint}>No grades available.</Text> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.row}>
                {grades.map(g => (
                  <TouchableOpacity key={g.id} style={[s.chip, selectedGrade?.id === g.id && s.chipOn]} onPress={() => handleSelectGrade(g)}>
                    <Text style={[s.chipTxt, selectedGrade?.id === g.id && s.chipTxtOn]}>{g.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}
        </View>

        {/* Section */}
        {selectedGrade && (
          <View style={s.section}>
            <Text style={s.label}>Section</Text>
            {sectionsLoading ? <ActivityIndicator size="small" color={Colors.primary} /> :
              sections.length === 0 ? <Text style={s.hint}>No sections for this grade.</Text> : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={s.row}>
                    {sections.map(sec => (
                      <TouchableOpacity key={sec.id} style={[s.chip, selectedSection?.id === sec.id && s.chipOn]} onPress={() => handleSelectSection(sec)}>
                        <Text style={[s.chipTxt, selectedSection?.id === sec.id && s.chipTxtOn]}>{sec.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}
          </View>
        )}

        {/* Month */}
        {selectedSection && (
          <View style={s.section}>
            <Text style={s.label}>Month</Text>
            {months.length === 0 ? <Text style={s.hint}>No months available.</Text> : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={s.row}>
                  {months.map(m => (
                    <TouchableOpacity key={m} style={[s.chip, selectedMonth === m && s.chipOn]} onPress={() => handleSelectMonth(m)}>
                      <Text style={[s.chipTxt, selectedMonth === m && s.chipTxtOn]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {/* Student */}
        {selectedSection && selectedMonth && (
          <View style={s.section}>
            <Text style={s.label}>Student</Text>
            {studentsLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : (
              <TouchableOpacity style={s.picker} onPress={() => setShowPicker(true)}>
                <Text style={selectedStudent ? s.pickerVal : s.pickerPh}>
                  {selectedStudent ? selectedStudent.name : 'Tap to select student...'}
                </Text>
                <Text style={s.arrow}>▼</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Invoice loading */}
        {invoiceLoading && (
          <View style={s.center}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={s.loadingTxt}>Loading invoice...</Text>
          </View>
        )}

        {/* Invoice */}
        {invoice && selectedStudent && !invoiceLoading && (
          <View style={{ padding: Spacing.lg, gap: Spacing.md }}>

            {/* Student info bar */}
            <View style={s.invHeader}>
              <Text style={s.invName}>{selectedStudent.name}</Text>
              <Text style={s.invMeta}>
                {invoice.student.className} – {invoice.student.section}
                {invoice.student.rollNo != null ? `  ·  Roll #${invoice.student.rollNo}` : ''}
              </Text>
              <Text style={s.invMeta}>Month: {invoice.month}  ·  {invoice.yearBS}</Text>
            </View>

            {/* All clear state */}
            {!hasAnythingDue && advanceCount === 0 && (
              <Card>
                <Text style={s.allPaid}>✅ All fees paid for {invoice.month}</Text>
                {invoice.advanceMonths.length > 0 && (
                  <Text style={s.hint}>You can still collect advance fees below.</Text>
                )}
              </Card>
            )}

            {/* Arrears */}
            {invoice.arrearItems.length > 0 && (
              <Card>
                <SectionHeader title="Arrears" total={invoice.totalArrears} color={Colors.error} badge="MUST PAY" />
                <View style={s.arrearsBanner}>
                  <Text style={s.arrearsBannerTxt}>
                    ⚠️ Arrears must be cleared before paying {invoice.month}.
                  </Text>
                </View>
                {invoice.arrearItems.map((item, idx) => (
                  <FeeRow key={`arrear-${item.feeCategoryId}-${item.paidMonth ?? idx}`} item={item} />
                ))}
              </Card>
            )}

            {/* Current month */}
            {invoice.currentItems.length > 0 && (
              <Card>
                <SectionHeader title={invoice.month} total={invoice.totalCurrent} color={Colors.primary} />
                {invoice.currentItems.map((item, idx) => (
                  <FeeRow key={`cur-${item.feeCategoryId}-${idx}`} item={item} />
                ))}
              </Card>
            )}

            {/* Annual / exam fees */}
            {invoice.otherItems.length > 0 && (
              <Card>
                <SectionHeader title="Other Fees" total={invoice.totalOther} />
                {invoice.otherItems.map((item, idx) => (
                  <FeeRow key={`other-${item.feeCategoryId}-${idx}`} item={item} />
                ))}
              </Card>
            )}

            {/* Advance stepper */}
            {invoice.advanceMonths.length > 0 && (
              <Card>
                <SectionHeader title="Advance Payment" total={advanceTotal} color={Colors.success} />
                <Text style={s.advanceSub}>Collect fees for upcoming months in advance.</Text>

                <View style={s.stepper}>
                  <TouchableOpacity
                    style={[s.stepBtn, advanceCount === 0 && s.stepBtnOff]}
                    onPress={() => setAdvanceCount(c => Math.max(0, c - 1))}
                    disabled={advanceCount === 0}
                  >
                    <Text style={[s.stepBtnTxt, advanceCount === 0 && s.stepBtnTxtOff]}>−</Text>
                  </TouchableOpacity>

                  <View style={s.stepCenter}>
                    <Text style={s.stepCount}>{advanceCount}</Text>
                    <Text style={s.stepLabel}>
                      {advanceCount === 0
                        ? 'No advance'
                        : advanceCount === 1
                        ? invoice.advanceMonths[0]
                        : `${invoice.advanceMonths[0]} – ${invoice.advanceMonths[advanceCount - 1]}`}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[s.stepBtn, advanceCount === invoice.advanceMonths.length && s.stepBtnOff]}
                    onPress={() => setAdvanceCount(c => Math.min(invoice.advanceMonths.length, c + 1))}
                    disabled={advanceCount === invoice.advanceMonths.length}
                  >
                    <Text style={[s.stepBtnTxt, advanceCount === invoice.advanceMonths.length && s.stepBtnTxtOff]}>+</Text>
                  </TouchableOpacity>
                </View>

                {advanceCount > 0 && (
                  <View style={{ marginTop: Spacing.sm }}>
                    {advanceItems.map((item, idx) => (
                      <FeeRow key={`adv-${item.feeCategoryId}-${item.paidMonth}-${idx}`} item={item} muted />
                    ))}
                  </View>
                )}
              </Card>
            )}

            {/* Grand total + collect */}
            {(hasAnythingDue || advanceCount > 0) && (
              <Card style={s.totalCard}>
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Grand Total</Text>
                  <Text style={s.totalAmt}>Rs {grandTotal.toLocaleString()}</Text>
                </View>

                {/* Breakdown lines */}
                <View style={{ gap: 2 }}>
                  {invoice.totalArrears > 0 && <Text style={s.breakdown}>Arrears: Rs {invoice.totalArrears.toLocaleString()}</Text>}
                  {invoice.totalCurrent > 0 && <Text style={s.breakdown}>{invoice.month}: Rs {invoice.totalCurrent.toLocaleString()}</Text>}
                  {invoice.totalOther > 0 && <Text style={s.breakdown}>Other: Rs {invoice.totalOther.toLocaleString()}</Text>}
                  {advanceTotal > 0 && <Text style={s.breakdown}>Advance ({advanceCount} month{advanceCount > 1 ? 's' : ''}): Rs {advanceTotal.toLocaleString()}</Text>}
                </View>

                <Text style={s.fieldLbl}>Payment Date (BS) *</Text>
                <TextInput
                  style={s.dateInput}
                  value={paidDateBS}
                  onChangeText={setPaidDateBS}
                  placeholder="YYYY/MM/DD"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="numeric"
                  maxLength={10}
                />

                <Button
                  title={`Collect Rs ${grandTotal.toLocaleString()}`}
                  onPress={handleCollect}
                  loading={paying}
                  style={{ marginTop: Spacing.md }}
                />
              </Card>
            )}
          </View>
        )}
      </ScrollView>

      {/* Student picker modal */}
      <Modal visible={showPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHdr}>
            <Text style={s.modalTitle}>Select Student</Text>
            <TouchableOpacity onPress={handleClosePicker} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{ padding: Spacing.lg }}>
            <TextInput
              style={s.search}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search by name..."
              placeholderTextColor={Colors.textLight}
              autoFocus
              clearButtonMode="while-editing"
            />
          </View>
          <FlatList
            data={filteredStudents}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<EmptyState icon="🔍" message={searchText ? `No students matching "${searchText}"` : 'No students found'} />}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.stuRow} onPress={() => loadInvoice(item)}>
                <Text style={s.stuName}>{item.name}</Text>
                {item.rollNo != null && <Text style={s.stuRoll}>Roll #{item.rollNo}</Text>}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  section: { backgroundColor: Colors.white, padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, color: Colors.textMuted, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTxt: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium as any },
  chipTxtOn: { color: Colors.white },
  picker: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, backgroundColor: Colors.white },
  pickerVal: { fontSize: FontSize.md, color: Colors.text, flex: 1 },
  pickerPh: { fontSize: FontSize.md, color: Colors.textLight, flex: 1 },
  arrow: { color: Colors.textMuted, marginLeft: Spacing.sm },
  center: { padding: Spacing.xxxl, alignItems: 'center' },
  loadingTxt: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: Spacing.sm },
  hint: { fontSize: FontSize.sm, color: Colors.textLight, fontStyle: 'italic' },
  errorBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xxxl, gap: Spacing.md },
  errorIcon: { fontSize: 40 },
  errorText: { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center' },
  // Invoice header
  invHeader: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  invName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any, color: Colors.text },
  invMeta: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  allPaid: { fontSize: FontSize.md, color: Colors.success, fontWeight: FontWeight.medium as any, paddingVertical: Spacing.sm },
  // Arrears banner
  arrearsBanner: { backgroundColor: '#FEF2F2', borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.sm },
  arrearsBannerTxt: { fontSize: FontSize.sm, color: Colors.error, fontWeight: FontWeight.medium as any },
  // Advance stepper
  advanceSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  stepBtnOff: { backgroundColor: Colors.border },
  stepBtnTxt: { fontSize: 22, color: Colors.white, fontWeight: FontWeight.bold as any, lineHeight: 26 },
  stepBtnTxtOff: { color: Colors.textLight },
  stepCenter: { flex: 1, alignItems: 'center' },
  stepCount: { fontSize: 28, fontWeight: FontWeight.bold as any, color: Colors.text },
  stepLabel: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 2 },
  // Total card
  totalCard: { gap: Spacing.sm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any, color: Colors.text },
  totalAmt: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.success },
  breakdown: { fontSize: FontSize.sm, color: Colors.textMuted },
  fieldLbl: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, color: Colors.text, marginTop: Spacing.xs },
  dateInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, marginTop: Spacing.xs, backgroundColor: Colors.white },
  // Modal
  modal: { flex: 1, backgroundColor: Colors.white },
  modalHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.text },
  modalClose: { fontSize: FontSize.xl, color: Colors.textMuted, padding: Spacing.sm },
  search: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.surface },
  stuRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  stuName: { fontSize: FontSize.md, color: Colors.text, fontWeight: FontWeight.medium as any, flex: 1 },
  stuRoll: { fontSize: FontSize.sm, color: Colors.textMuted },
});