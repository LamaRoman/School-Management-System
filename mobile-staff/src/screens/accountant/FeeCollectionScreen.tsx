import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, Modal, FlatList, ActivityIndicator,
} from 'react-native';
import { api, getErrorMessage } from '../../api/client';
import { Card, Button, EmptyState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import { getTodayBS } from '../../utils/bsDate';

interface Grade { id: string; name: string }
interface Section { id: string; name: string; grade: Grade }
interface Student { id: string; name: string; rollNo?: number }
interface FeeMonth { value: string; label: string }
interface AcademicYear { id: string; yearNp: string; isActive: boolean }
interface InvoiceItem { feeCategoryId: string; category: string; amount: number; paidMonth?: string; status: string }
interface Invoice { items: InvoiceItem[]; totalDue: number; grandTotal: number }

export default function FeeCollectionScreen() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [months, setMonths] = useState<FeeMonth[]>([]);
  const [activeYear, setActiveYear] = useState<AcademicYear | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [paidDateBS, setPaidDateBS] = useState('');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [gradeData, monthData, yearData] = await Promise.all([
          api.get<Grade[]>('/grades'),
          api.get<FeeMonth[]>('/fees/months'),
          api.get<AcademicYear[]>('/academic-years'),
        ]);
        setGrades(Array.isArray(gradeData) ? gradeData : []);
        setMonths(Array.isArray(monthData) ? monthData : []);
        const active = Array.isArray(yearData) ? yearData.find(y => y.isActive) || yearData[0] : null;
        setActiveYear(active || null);
        setPaidDateBS(getTodayBS());
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!selectedGrade) { setSections([]); return; }
    api.get<Section[]>('/sections', { gradeId: selectedGrade.id })
      .then(d => setSections(Array.isArray(d) ? d : []))
      .catch(console.error);
  }, [selectedGrade]);

  useEffect(() => {
    if (!selectedSection) { setStudents([]); return; }
    api.get<Student[]>('/students', { sectionId: selectedSection.id })
      .then(d => setStudents(Array.isArray(d) ? d : []))
      .catch(console.error);
  }, [selectedSection]);

  const loadInvoice = async (student: Student) => {
    if (!activeYear || !selectedMonth) return;
    setSelectedStudent(student);
    setShowPicker(false);
    setInvoiceLoading(true);
    setInvoice(null);
    try {
      // FIX: backend expects 'month' not 'monthNp'
      const data = await api.get<Invoice>(`/fees/invoice/${student.id}`, {
        month: selectedMonth,
        academicYearId: activeYear.id,
      });
      setInvoice(data);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally { setInvoiceLoading(false); }
  };

  const handleCollect = async () => {
    if (!invoice || !selectedStudent || !activeYear) return;
    if (!paidDateBS.trim()) { Alert.alert('Error', 'Enter payment date (YYYY/MM/DD)'); return; }
    const dueItems = invoice.items.filter(i => i.status === 'DUE');
    if (dueItems.length === 0) { Alert.alert('Info', 'No outstanding fees for this student.'); return; }

    // FIX: correct payload structure for /fees/payments/bulk
    const payload = {
      studentId: selectedStudent.id,
      academicYearId: activeYear.id,
      paymentDate: paidDateBS.trim(),
      items: dueItems.map(item => ({
        feeCategoryId: item.feeCategoryId,
        amount: item.amount,
        ...(item.paidMonth ? { paidMonth: item.paidMonth } : {}),
      })),
    };

    setPaying(true);
    try {
      await api.post('/fees/payments/bulk', payload);
      Alert.alert('Success', `Fee collected for ${selectedStudent.name}`, [
        { text: 'OK', onPress: () => { setInvoice(null); setSelectedStudent(null); setPaidDateBS(''); } },
      ]);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally { setPaying(false); }
  };

  if (loading) return <LoadingScreen />;

  const dueItems = invoice ? invoice.items.filter(i => i.status === 'DUE') : [];
  const totalAmount = invoice ? (invoice.grandTotal || invoice.totalDue || 0) : 0;
  const filtered = students.filter(s => s.name.toLowerCase().includes(searchText.toLowerCase()));

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 120 }}>
      {/* Grade */}
      <View style={s.section}>
        <Text style={s.label}>Grade</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={s.row}>
            {grades.map(g => (
              <TouchableOpacity key={g.id} style={[s.chip, selectedGrade?.id === g.id && s.chipOn]}
                onPress={() => { setSelectedGrade(g); setSelectedSection(null); setSelectedStudent(null); setInvoice(null); }}>
                <Text style={[s.chipTxt, selectedGrade?.id === g.id && s.chipTxtOn]}>{g.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Section */}
      {selectedGrade && sections.length > 0 && (
        <View style={s.section}>
          <Text style={s.label}>Section</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.row}>
              {sections.map(sec => (
                <TouchableOpacity key={sec.id} style={[s.chip, selectedSection?.id === sec.id && s.chipOn]}
                  onPress={() => { setSelectedSection(sec); setSelectedStudent(null); setInvoice(null); }}>
                  <Text style={[s.chipTxt, selectedSection?.id === sec.id && s.chipTxtOn]}>{sec.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Month */}
      {selectedSection && (
        <View style={s.section}>
          <Text style={s.label}>Month</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.row}>
              {months.map(m => (
                <TouchableOpacity key={m.value} style={[s.chip, selectedMonth === m.value && s.chipOn]}
                  onPress={() => { setSelectedMonth(m.value); setInvoice(null); }}>
                  <Text style={[s.chipTxt, selectedMonth === m.value && s.chipTxtOn]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Student picker */}
      {selectedSection && selectedMonth && (
        <View style={s.section}>
          <Text style={s.label}>Student</Text>
          <TouchableOpacity style={s.picker} onPress={() => setShowPicker(true)}>
            <Text style={selectedStudent ? s.pickerVal : s.pickerPh}>
              {selectedStudent ? selectedStudent.name : 'Tap to select student...'}
            </Text>
            <Text style={s.arrow}>▼</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Invoice */}
      {invoiceLoading && <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>}

      {invoice && selectedStudent && !invoiceLoading && (
        <View style={{ padding: Spacing.lg }}>
          <Card style={{ gap: Spacing.sm }}>
            <Text style={s.invTitle}>Fee Invoice</Text>
            <Text style={s.invStudent}>{selectedStudent.name}</Text>
            <Text style={s.invMonth}>Month: {selectedMonth}</Text>

            {dueItems.length === 0 ? (
              <Text style={s.paid}>✅ All fees paid for this month</Text>
            ) : (
              <>
                {dueItems.map((item, i) => (
                  <View key={i} style={s.invRow}>
                    <Text style={s.invCat}>{item.category}</Text>
                    <Text style={s.invAmt}>Rs {item.amount.toLocaleString()}</Text>
                  </View>
                ))}
                <View style={s.invTotal}>
                  <Text style={s.invTotalLbl}>Total Due</Text>
                  <Text style={s.invTotalAmt}>Rs {totalAmount.toLocaleString()}</Text>
                </View>
                <Text style={s.fieldLbl}>Payment Date (BS: YYYY/MM/DD) *</Text>
                <TextInput style={s.dateInput} value={paidDateBS} onChangeText={setPaidDateBS}
                  placeholder="e.g. 2082/09/15" placeholderTextColor={Colors.textLight} />
                <Button title={`Collect Rs ${totalAmount.toLocaleString()}`}
                  onPress={handleCollect} loading={paying} style={{ marginTop: Spacing.md }} />
              </>
            )}
          </Card>
        </View>
      )}

      {/* Student picker modal */}
      <Modal visible={showPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHdr}>
            <Text style={s.modalTitle}>Select Student</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{ padding: Spacing.lg }}>
            <TextInput style={s.search} value={searchText} onChangeText={setSearchText}
              placeholder="Search..." placeholderTextColor={Colors.textLight} />
          </View>
          <FlatList data={filtered} keyExtractor={i => i.id}
            ListEmptyComponent={<EmptyState icon="🔍" message="No students found" />}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.stuRow} onPress={() => loadInvoice(item)}>
                <Text style={s.stuName}>{item.name}</Text>
                {item.rollNo && <Text style={s.stuRoll}>Roll #{item.rollNo}</Text>}
              </TouchableOpacity>
            )} />
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  section: { backgroundColor: Colors.white, padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, color: Colors.textMuted, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTxt: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium as any },
  chipTxtOn: { color: Colors.white },
  picker: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md },
  pickerVal: { fontSize: FontSize.md, color: Colors.text },
  pickerPh: { fontSize: FontSize.md, color: Colors.textLight },
  arrow: { color: Colors.textMuted },
  center: { padding: Spacing.xxxl, alignItems: 'center' },
  invTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any, color: Colors.text },
  invStudent: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semibold as any },
  invMonth: { fontSize: FontSize.sm, color: Colors.textMuted },
  paid: { fontSize: FontSize.md, color: Colors.success, fontWeight: FontWeight.medium as any, paddingVertical: Spacing.md },
  invRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  invCat: { fontSize: FontSize.md, color: Colors.text },
  invAmt: { fontSize: FontSize.md, fontWeight: FontWeight.medium as any, color: Colors.text },
  invTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.sm },
  invTotalLbl: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any, color: Colors.text },
  invTotalAmt: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.success },
  fieldLbl: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, color: Colors.text, marginTop: Spacing.md },
  dateInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, marginTop: Spacing.xs },
  modal: { flex: 1, backgroundColor: Colors.white },
  modalHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.text },
  modalClose: { fontSize: FontSize.xl, color: Colors.textMuted, padding: Spacing.sm },
  search: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text },
  stuRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  stuName: { fontSize: FontSize.md, color: Colors.text, fontWeight: FontWeight.medium as any },
  stuRoll: { fontSize: FontSize.sm, color: Colors.textMuted },
});
