import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, Modal, FlatList, ActivityIndicator,
} from 'react-native';
import { api, getErrorMessage } from '../../api/client';
import { Card, Button, Badge, EmptyState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';

interface Grade { id: string; name: string }
interface Section { id: string; name: string; grade: Grade }
interface Student { id: string; name: string; rollNo?: number; section: Section }
interface FeeCategory { id: string; name: string }
interface FeeMonth { value: string; label: string }
interface AcademicYear { id: string; yearNp: string; isActive: boolean }
interface InvoiceItem { feeCategoryId: string; feeCategoryName: string; amount: number; months: string[] }
interface Invoice { student: Student; items: InvoiceItem[]; totalAmount: number }

export default function FeeCollectionScreen() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [categories, setCategories] = useState<FeeCategory[]>([]);
  const [months, setMonths] = useState<FeeMonth[]>([]);
  const [activeYear, setActiveYear] = useState<AcademicYear | null>(null);

  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);

  const [loading, setLoading] = useState(true);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [paidDateBS, setPaidDateBS] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        const [gradeData, catData, monthData, yearData] = await Promise.all([
          api.get<Grade[]>('/grades'),
          api.get<FeeCategory[]>('/fees/categories'),
          api.get<FeeMonth[]>('/fees/months'),
          api.get<AcademicYear[]>('/academic-years'),
        ]);
        setGrades(Array.isArray(gradeData) ? gradeData : []);
        setCategories(Array.isArray(catData) ? catData : []);
        setMonths(Array.isArray(monthData) ? monthData : []);
        const active = Array.isArray(yearData) ? yearData.find(y => y.isActive) || yearData[0] : null;
        setActiveYear(active || null);
        const now = new Date();
        const todayBS = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
        setPaidDateBS(todayBS);
      } catch (err) {
        console.error('Init error:', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!selectedGrade) { setSections([]); return; }
    api.get<Section[]>('/sections', { gradeId: selectedGrade.id })
      .then(data => setSections(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));
  }, [selectedGrade]);

  useEffect(() => {
    if (!selectedSection) { setStudents([]); return; }
    api.get<Student[]>('/students', { sectionId: selectedSection.id })
      .then(data => setStudents(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));
  }, [selectedSection]);

  const loadInvoice = async (student: Student) => {
    if (!activeYear || !selectedMonth) {
      Alert.alert('Error', 'Please select a month first');
      return;
    }
    setSelectedStudent(student);
    setShowStudentPicker(false);
    setInvoiceLoading(true);
    try {
      const data = await api.get<Invoice>(`/fees/invoice/${student.id}`, {
        monthNp: selectedMonth,
        academicYearId: activeYear.id,
      });
      setInvoice(data);
    } catch (err) {
      console.error('Invoice error:', err);
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleCollect = async () => {
    if (!invoice || !selectedStudent || !activeYear) return;
    if (!paidDateBS.trim()) { Alert.alert('Error', 'Enter payment date'); return; }

    const payments = invoice.items.map(item => ({
      studentId: selectedStudent.id,
      feeCategoryId: item.feeCategoryId,
      monthNp: selectedMonth,
      academicYearId: activeYear.id,
      amount: item.amount,
      paidDateBS: paidDateBS.trim(),
    }));

    setPaying(true);
    try {
      await api.post('/fees/payments/bulk', { payments });
      Alert.alert('Success', `Fee collected for ${selectedStudent.name}`, [
        { text: 'OK', onPress: () => { setInvoice(null); setSelectedStudent(null); } },
      ]);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <LoadingScreen />;

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={s.section}>
        <Text style={s.sectionLabel}>Grade</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={s.chipRow}>
            {grades.map(g => (
              <TouchableOpacity key={g.id} style={[s.chip, selectedGrade?.id === g.id && s.chipActive]}
                onPress={() => { setSelectedGrade(g); setSelectedSection(null); setSelectedStudent(null); setInvoice(null); }}>
                <Text style={[s.chipText, selectedGrade?.id === g.id && s.chipTextActive]}>{g.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {selectedGrade && sections.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Section</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chipRow}>
              {sections.map(sec => (
                <TouchableOpacity key={sec.id} style={[s.chip, selectedSection?.id === sec.id && s.chipActive]}
                  onPress={() => { setSelectedSection(sec); setSelectedStudent(null); setInvoice(null); }}>
                  <Text style={[s.chipText, selectedSection?.id === sec.id && s.chipTextActive]}>{sec.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {selectedSection && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Month</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chipRow}>
              {months.map(m => (
                <TouchableOpacity key={m.value} style={[s.chip, selectedMonth === m.value && s.chipActive]}
                  onPress={() => setSelectedMonth(m.value)}>
                  <Text style={[s.chipText, selectedMonth === m.value && s.chipTextActive]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {selectedSection && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Student</Text>
          <TouchableOpacity style={s.studentPicker} onPress={() => setShowStudentPicker(true)}>
            <Text style={selectedStudent ? s.pickerValue : s.pickerPlaceholder}>
              {selectedStudent ? selectedStudent.name : 'Select student...'}
            </Text>
            <Text style={s.pickerArrow}>▼</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Invoice */}
      {invoiceLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : invoice && selectedStudent ? (
        <View style={s.invoiceSection}>
          <Card style={s.invoiceCard}>
            <Text style={s.invoiceTitle}>Fee Invoice</Text>
            <Text style={s.invoiceStudent}>{selectedStudent.name}</Text>
            <Text style={s.invoiceMonth}>Month: {selectedMonth}</Text>

            {invoice.items.map((item, idx) => (
              <View key={idx} style={s.invoiceRow}>
                <Text style={s.invoiceItemName}>{item.feeCategoryName}</Text>
                <Text style={s.invoiceItemAmount}>Rs {item.amount.toLocaleString()}</Text>
              </View>
            ))}

            <View style={s.invoiceTotal}>
              <Text style={s.invoiceTotalLabel}>Total</Text>
              <Text style={s.invoiceTotalAmount}>Rs {invoice.totalAmount.toLocaleString()}</Text>
            </View>

            <Text style={s.fieldLabel}>Payment Date (YYYY/MM/DD)</Text>
            <TextInput
              style={s.dateInput}
              value={paidDateBS}
              onChangeText={setPaidDateBS}
              placeholder="2082/03/15"
              placeholderTextColor={Colors.textLight}
            />

            <Button
              title={`Collect Rs ${invoice.totalAmount.toLocaleString()}`}
              onPress={handleCollect}
              loading={paying}
              style={{ marginTop: Spacing.md }}
            />
          </Card>
        </View>
      ) : null}

      {/* Student picker modal */}
      <Modal visible={showStudentPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Select Student</Text>
            <TouchableOpacity onPress={() => setShowStudentPicker(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={s.searchBox}>
            <TextInput
              style={s.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search by name..."
              placeholderTextColor={Colors.textLight}
            />
          </View>
          <FlatList
            data={filteredStudents}
            keyExtractor={item => item.id}
            ListEmptyComponent={<EmptyState icon="🔍" message="No students found" />}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.studentRow} onPress={() => loadInvoice(item)}>
                <Text style={s.studentName}>{item.name}</Text>
                {item.rollNo && <Text style={s.studentRoll}>Roll #{item.rollNo}</Text>}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  section: { backgroundColor: Colors.white, padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, color: Colors.textMuted, marginBottom: Spacing.sm },
  chipRow: { flexDirection: 'row', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium as any },
  chipTextActive: { color: Colors.white },
  studentPicker: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, backgroundColor: Colors.surface },
  pickerValue: { fontSize: FontSize.md, color: Colors.text },
  pickerPlaceholder: { fontSize: FontSize.md, color: Colors.textLight },
  pickerArrow: { color: Colors.textMuted },
  center: { padding: Spacing.xxxl, alignItems: 'center' },
  invoiceSection: { padding: Spacing.lg },
  invoiceCard: { gap: Spacing.sm },
  invoiceTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any, color: Colors.text },
  invoiceStudent: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semibold as any },
  invoiceMonth: { fontSize: FontSize.sm, color: Colors.textMuted },
  invoiceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  invoiceItemName: { fontSize: FontSize.md, color: Colors.text },
  invoiceItemAmount: { fontSize: FontSize.md, color: Colors.text, fontWeight: FontWeight.medium as any },
  invoiceTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.sm, marginTop: Spacing.xs },
  invoiceTotalLabel: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any, color: Colors.text },
  invoiceTotalAmount: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.success },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, color: Colors.text, marginTop: Spacing.md },
  dateInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, marginTop: Spacing.xs },
  modal: { flex: 1, backgroundColor: Colors.white },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.text },
  modalClose: { fontSize: FontSize.xl, color: Colors.textMuted, padding: Spacing.sm },
  searchBox: { padding: Spacing.lg },
  searchInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text },
  studentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  studentName: { fontSize: FontSize.md, color: Colors.text, fontWeight: FontWeight.medium as any },
  studentRoll: { fontSize: FontSize.sm, color: Colors.textMuted },
});
