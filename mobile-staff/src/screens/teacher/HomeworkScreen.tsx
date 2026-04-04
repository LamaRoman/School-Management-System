import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, TextInput, Modal, ScrollView, RefreshControl,
} from 'react-native';
import { api, getErrorMessage } from '../../api/client';
import { Card, Button, Badge, EmptyState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';

interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  subject: { name: string };
  section: { name: string; grade: { name: string } };
  createdAt: string;
}

interface Section { id: string; name: string; academicYearId: string; grade: { name: string } }
interface Subject { id: string; name: string }

export default function HomeworkScreen() {
  const [homework, setHomework] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.get<Assignment[]>('/homework');
      setHomework(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Homework load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadFormData = async () => {
    try {
      const myData = await api.get<any>('/teacher-assignments/my');
      const secs: Section[] = [];
      const subs: Subject[] = [];
      const allAssignments = [
        ...(myData.classTeacherSections || []),
        ...(myData.subjectAssignments || []),
      ];
      allAssignments.forEach((a: any) => {
        if (!secs.find(s => s.id === a.sectionId)) {
          secs.push({
            id: a.sectionId,
            name: a.sectionName,
            academicYearId: a.academicYearId,
            grade: { name: a.gradeName },
          });
        }
      });
      // Only show subjects this teacher is assigned to teach
      (myData.subjectAssignments || []).forEach((a: any) => {
        if (a.subjectId && !subs.find(s => s.id === a.subjectId)) {
          subs.push({ id: a.subjectId, name: a.subjectName });
        }
      });
      setSections(secs);
      setSubjects(subs);
    } catch (err) {
      console.error('Form data load error:', err);
    }
  };

  useEffect(() => { load(); loadFormData(); }, []);

  const handleRefresh = () => { setRefreshing(true); load(true); };

  const openModal = () => {
    setTitle(''); setDescription(''); setDueDate('');
    setSelectedSection(sections[0]?.id || '');
    setSelectedSubject(subjects[0]?.id || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Error', 'Title is required'); return; }
    if (!dueDate.trim()) { Alert.alert('Error', 'Due date is required (YYYY/MM/DD)'); return; }
    if (!selectedSection) { Alert.alert('Error', 'Select a section'); return; }
    if (!selectedSubject) { Alert.alert('Error', 'Select a subject'); return; }

    setSaving(true);
    try {
      const section = sections.find(s => s.id === selectedSection);
      await api.post('/homework', {
        title: title.trim(),
        description: description.trim(),
        dueDate: dueDate.trim(),
        sectionId: selectedSection,
        subjectId: selectedSubject,
        academicYearId: section?.academicYearId || '',
        assignedDate: dueDate.trim(),
      });
      setShowModal(false);
      load(true);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: Assignment) => {
    Alert.alert(
      'Delete Homework',
      `Delete "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/homework/${item.id}`);
              load(true);
            } catch (err) {
              Alert.alert('Error', getErrorMessage(err));
            }
          },
        },
      ]
    );
  };

  if (loading) return <LoadingScreen />;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Homework ({homework.length})</Text>
        <TouchableOpacity style={s.addBtn} onPress={openModal}>
          <Text style={s.addBtnText}>+ Assign</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={homework}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={<EmptyState icon="📚" message="No homework assigned yet" />}
        renderItem={({ item }) => (
          <Card style={s.card}>
            <View style={s.cardRow}>
              <View style={s.cardLeft}>
                <Text style={s.cardTitle}>{item.title}</Text>
                <View style={s.badges}>
                  <Badge label={`${item.section?.grade?.name} - ${item.section?.name}`} color="primary" />
                  <Badge label={item.subject?.name} color="info" />
                </View>
                {item.description ? (
                  <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
                ) : null}
                <Text style={s.cardDue}>📅 Due: {item.dueDate}</Text>
              </View>
              <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(item)}>
                <Text style={s.deleteBtnText}>🗑</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}
      />

      {/* Create Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Assign Homework</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>Title *</Text>
            <TextInput style={s.textInput} value={title} onChangeText={setTitle} placeholder="e.g. Chapter 5 exercises" placeholderTextColor={Colors.textLight} />

            <Text style={s.fieldLabel}>Description</Text>
            <TextInput style={[s.textInput, s.textArea]} value={description} onChangeText={setDescription}
              placeholder="Optional instructions..." placeholderTextColor={Colors.textLight}
              multiline numberOfLines={3} textAlignVertical="top" />

            <Text style={s.fieldLabel}>Due Date * (YYYY/MM/DD)</Text>
            <TextInput style={s.textInput} value={dueDate} onChangeText={setDueDate} placeholder="2082/03/15" placeholderTextColor={Colors.textLight} />

            <Text style={s.fieldLabel}>Section *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
              {sections.map(sec => (
                <TouchableOpacity key={sec.id} style={[s.chip, selectedSection === sec.id && s.chipActive]}
                  onPress={() => setSelectedSection(sec.id)}>
                  <Text style={[s.chipText, selectedSection === sec.id && s.chipTextActive]}>
                    {sec.grade.name}-{sec.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={s.fieldLabel}>Subject *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
              {subjects.map(sub => (
                <TouchableOpacity key={sub.id} style={[s.chip, selectedSubject === sub.id && s.chipActive]}
                  onPress={() => setSelectedSubject(sub.id)}>
                  <Text style={[s.chipText, selectedSubject === sub.id && s.chipTextActive]}>{sub.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ height: Spacing.xxxl }} />
          </ScrollView>
          <View style={s.modalFooter}>
            <Button title="Cancel" variant="outline" onPress={() => setShowModal(false)} style={{ flex: 1 }} />
            <Button title="Assign" onPress={handleSave} loading={saving} style={{ flex: 2 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any, color: Colors.text },
  addBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  addBtnText: { color: Colors.white, fontWeight: FontWeight.semibold as any, fontSize: FontSize.sm },
  card: { gap: Spacing.sm },
  cardRow: { flexDirection: 'row', gap: Spacing.sm },
  cardLeft: { flex: 1, gap: Spacing.xs },
  cardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text },
  badges: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  cardDesc: { fontSize: FontSize.sm, color: Colors.textMuted },
  cardDue: { fontSize: FontSize.sm, color: Colors.warning, fontWeight: FontWeight.medium as any },
  deleteBtn: { padding: Spacing.sm },
  deleteBtnText: { fontSize: 20 },
  modal: { flex: 1, backgroundColor: Colors.white },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.text },
  modalClose: { fontSize: FontSize.xl, color: Colors.textMuted, padding: Spacing.sm },
  modalBody: { flex: 1, padding: Spacing.lg },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, color: Colors.text, marginBottom: Spacing.xs, marginTop: Spacing.md },
  textInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.surface },
  textArea: { minHeight: 80 },
  chipRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.sm, backgroundColor: Colors.white },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium as any },
  chipTextActive: { color: Colors.white },
  modalFooter: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
});
